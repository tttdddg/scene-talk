/**
 * Conversation state management.
 *
 * Tracks user/assistant messages, handles sending vision chat requests,
 * maintains text-only history for the backend, and exposes retry logic.
 */

import { ref, computed, readonly } from 'vue'
import {
  sendVisionChat,
  VisionChatApiError,
  type HistoryMessage,
  type ClientMetrics,
} from '../api/visionChat'

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

// ---- Helpers ----

let _idCounter = 0
function nextId(): string {
  _idCounter++
  return `msg_${Date.now()}_${_idCounter}`
}

// ---- Composable ----

export function useConversation() {
  const messages = ref<ConversationMessage[]>([])
  const isSending = ref(false)

  const lastAssistantMessage = computed<ConversationMessage | null>(() => {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].role === 'assistant') {
        return messages.value[i]
      }
    }
    return null
  })

  /**
   * Build text-only history for the backend.
   * Filters out error messages and 'sending' messages.
   */
  function buildHistory(): HistoryMessage[] {
    return messages.value
      .filter((m) => m.status === 'done' && m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }))
  }

  /**
   * Send a vision chat request.
   *
   * - Adds a user message (status: sending)
   * - Sends to the backend
   * - On success: marks user as done, adds assistant message
   * - On failure: marks user as error, adds no assistant message
   *
   * Returns the assistant message on success, or throws on error.
   */
  async function sendMessage(
    question: string,
    imageDataUrl: string,
    metrics?: ClientMetrics,
  ): Promise<ConversationMessage> {
    if (isSending.value) {
      throw new Error('已有请求正在处理中')
    }

    isSending.value = true

    const userMsg: ConversationMessage = {
      id: nextId(),
      role: 'user',
      content: question,
      status: 'sending',
    }
    messages.value.push(userMsg)

    const history = buildHistory()
    // Remove the just-added 'sending' user message from history
    // (it's status: 'sending', so already filtered out)

    try {
      const response = await sendVisionChat({
        question,
        image: imageDataUrl,
        history,
        client_metrics: metrics,
      })

      // Mark user message as done
      userMsg.status = 'done'
      userMsg.requestId = response.request_id

      // Add assistant message
      const assistantMsg: ConversationMessage = {
        id: nextId(),
        role: 'assistant',
        content: response.answer,
        status: 'done',
        latencyMs: response.latency_ms,
        requestId: response.request_id,
      }
      messages.value.push(assistantMsg)

      return assistantMsg
    } catch (err) {
      // Mark user message as error
      userMsg.status = 'error'
      if (err instanceof VisionChatApiError) {
        userMsg.errorMessage = err.message
      } else {
        userMsg.errorMessage =
          err instanceof Error ? err.message : '未知错误'
      }
      throw err
    } finally {
      isSending.value = false
    }
  }

  /**
   * Retry a failed user message.
   * Removes the failed message and re-sends with the same question and image.
   */
  async function retryMessage(
    messageId: string,
    imageDataUrl: string,
    metrics?: ClientMetrics,
  ): Promise<ConversationMessage> {
    const idx = messages.value.findIndex((m) => m.id === messageId)
    if (idx === -1) {
      throw new Error('消息不存在')
    }

    const msg = messages.value[idx]
    if (msg.role !== 'user' || msg.status !== 'error') {
      throw new Error('只能重试失败的消息')
    }

    // Remove the failed message
    messages.value.splice(idx, 1)

    return sendMessage(msg.content, imageDataUrl, metrics)
  }

  function clearMessages(): void {
    messages.value = []
  }

  return {
    messages: readonly(messages),
    isSending: readonly(isSending),
    lastAssistantMessage,
    sendMessage,
    retryMessage,
    clearMessages,
  }
}
