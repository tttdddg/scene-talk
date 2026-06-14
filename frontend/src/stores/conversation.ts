/**
 * Pinia store for conversation state and context management.
 *
 * Rules:
 *  - Max 4 rounds (8 messages) of text-only history sent to the backend.
 *  - Current question never appears in history.
 *  - History images are NOT re-sent.
 *  - Long messages (> 500 chars) are truncated in history only.
 *  - Clearing the session removes all messages.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  sendVisionChat,
  VisionChatApiError,
  type ClientMetrics,
} from '../api/visionChat'

// ---- Constants ----

const MAX_HISTORY_ROUNDS = 4
const MAX_HISTORY_MESSAGE_CHARS = 500

// ---- Types ----

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'sending' | 'done' | 'error'
  errorMessage?: string
  latencyMs?: number
  requestId?: string
}

export interface PerformanceMetrics {
  originalBytes: number
  compressedBytes: number
  compressionRatio: number
  captureDurationMs: number
  compressionDurationMs: number
  modelLatencyMs: number
  e2eLatencyMs: number
  contextRounds: number
}

// ---- Helpers ----

let _idCounter = 0
function nextId(): string {
  _idCounter++
  return `msg_${Date.now()}_${_idCounter}`
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '…'
}

// ---- Store ----

export const useConversationStore = defineStore('conversation', () => {
  // --- State ---
  const messages = ref<ConversationMessage[]>([])
  const isSending = ref(false)
  const lastMetrics = ref<PerformanceMetrics | null>(null)
  const lastSubmittedText = ref('')    // dedup guard
  let abortController: AbortController | null = null

  // --- Getters ---

  /** Number of complete text rounds available for history. */
  const contextRounds = computed(() => {
    const done = messages.value.filter((m) => m.status === 'done' && m.content.trim().length > 0)
    return Math.floor(done.length / 2)
  })

  const lastAssistantMessage = computed<ConversationMessage | null>(() => {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].role === 'assistant') return messages.value[i]
    }
    return null
  })

  // --- Actions ---

  /**
   * Build text-only history for the backend.
   * - Only 'done' messages
   * - Max 4 rounds (8 messages)
   * - Each message truncated to MAX_HISTORY_MESSAGE_CHARS
   * - Images are NOT included
   */
  function buildHistory(): { role: 'user' | 'assistant'; content: string }[] {
    const done = messages.value.filter(
      (m) => m.status === 'done' && m.content.trim().length > 0,
    )

    // Take at most the last N messages (N = MAX_HISTORY_ROUNDS * 2)
    const maxMessages = MAX_HISTORY_ROUNDS * 2
    const recent = done.slice(-maxMessages)

    return recent.map((m) => ({
      role: m.role,
      content: truncateText(m.content, MAX_HISTORY_MESSAGE_CHARS),
    }))
  }

  /**
   * Send a vision chat request.
   *
   * Flow:
   *  1. Dedup check (same text as last submit)
   *  2. Add user message (status: sending)
   *  3. POST to backend
   *  4. On success → mark user done, add assistant message
   *  5. On error → mark user error, preserve for retry
   */
  async function sendMessage(
    question: string,
    imageDataUrl: string,
    metrics?: ClientMetrics,
  ): Promise<ConversationMessage> {
    // Dedup guard
    if (isSending.value) {
      throw new Error('已有请求正在处理中')
    }

    const trimmedQuestion = question.trim()
    if (trimmedQuestion === lastSubmittedText.value && trimmedQuestion.length > 0) {
      throw new Error('相同问题已提交，请提出新问题')
    }

    isSending.value = true
    lastSubmittedText.value = trimmedQuestion

    // AbortController for cancellation
    abortController = new AbortController()

    const userMsg: ConversationMessage = {
      id: nextId(),
      role: 'user',
      content: question,
      status: 'sending',
    }
    messages.value.push(userMsg)

    // Build history BEFORE adding the current user message
    // (it's status='sending', so buildHistory already filters it out)
    const history = buildHistory()

    const e2eStart = performance.now()

    try {
      const response = await sendVisionChat(
        {
          question: trimmedQuestion,
          image: imageDataUrl,
          history,
          client_metrics: metrics,
        },
        abortController.signal,
      )

      const e2eLatencyMs = Math.round(performance.now() - e2eStart)

      // Mark user done
      userMsg.status = 'done'
      userMsg.requestId = response.request_id

      // Add assistant
      const assistantMsg: ConversationMessage = {
        id: nextId(),
        role: 'assistant',
        content: response.answer,
        status: 'done',
        latencyMs: response.latency_ms,
        requestId: response.request_id,
      }
      messages.value.push(assistantMsg)

      // Record metrics
      lastMetrics.value = {
        originalBytes: metrics?.original_bytes ?? 0,
        compressedBytes: metrics?.compressed_bytes ?? 0,
        compressionRatio:
          metrics && metrics.original_bytes > 0
            ? metrics.compressed_bytes / metrics.original_bytes
            : 0,
        captureDurationMs: metrics?.capture_duration_ms ?? 0,
        compressionDurationMs: 0, // filled by caller
        modelLatencyMs: response.latency_ms,
        e2eLatencyMs,
        contextRounds: contextRounds.value,
      }

      return assistantMsg
    } catch (err) {
      userMsg.status = 'error'
      if (err instanceof VisionChatApiError) {
        userMsg.errorMessage = err.message
      } else if (err instanceof DOMException && err.name === 'AbortError') {
        userMsg.errorMessage = '请求已取消'
      } else {
        userMsg.errorMessage = err instanceof Error ? err.message : '未知错误'
      }
      throw err
    } finally {
      isSending.value = false
      abortController = null
    }
  }

  /**
   * Retry a failed user message (re-captures a fresh frame externally).
   */
  async function retryMessage(
    messageId: string,
    imageDataUrl: string,
    metrics?: ClientMetrics,
  ): Promise<ConversationMessage> {
    const idx = messages.value.findIndex((m) => m.id === messageId)
    if (idx === -1) throw new Error('消息不存在')

    const msg = messages.value[idx]
    if (msg.role !== 'user' || msg.status !== 'error') {
      throw new Error('只能重试失败的消息')
    }

    messages.value.splice(idx, 1)
    // Reset dedup for retry
    lastSubmittedText.value = ''

    return sendMessage(msg.content, imageDataUrl, metrics)
  }

  /** Cancel the in-flight request. */
  function cancelRequest(): void {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  /** Clear all messages and reset state. */
  function clearSession(): void {
    cancelRequest()
    messages.value = []
    lastMetrics.value = null
    lastSubmittedText.value = ''
    isSending.value = false
  }

  /**
   * Patch the last metrics with compression timing (set by the caller
   * after capture completes since the store doesn't own capture).
   */
  function patchMetrics(patch: Partial<PerformanceMetrics>): void {
    if (lastMetrics.value) {
      Object.assign(lastMetrics.value, patch)
    }
  }

  return {
    // state
    messages,
    isSending,
    lastMetrics,
    // getters
    contextRounds,
    lastAssistantMessage,
    // actions
    buildHistory,
    sendMessage,
    retryMessage,
    cancelRequest,
    clearSession,
    patchMetrics,
  }
})
