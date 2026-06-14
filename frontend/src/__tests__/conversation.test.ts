/**
 * Tests for the conversation Pinia store.
 *
 * Focus: context limits, history building, dedup, clear session.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConversationStore } from '../stores/conversation'

// Mock the API module so we don't make real HTTP calls.
vi.mock('../api/visionChat', () => ({
  sendVisionChat: vi.fn(),
  VisionChatApiError: class extends Error {
    code: string
    requestId: string
    constructor(code: string, message: string, requestId: string) {
      super(message)
      this.code = code
      this.requestId = requestId
    }
  },
}))

import { sendVisionChat } from '../api/visionChat'

const mockSend = sendVisionChat as ReturnType<typeof vi.fn>

function makeMockResponse(answer = '测试回答') {
  return {
    request_id: 'test-req-1',
    answer,
    model: 'test-model',
    latency_ms: 500,
    history_rounds: 0,
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

function createStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return useConversationStore()
}

// ---- Tests ----

describe('useConversationStore', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('sendMessage', () => {
    it('adds user message as sending then marks done on success', async () => {
      const store = createStore()
      mockSend.mockResolvedValueOnce(makeMockResponse('看到一只猫'))

      const promise = store.sendMessage('有什么？', 'data:image/jpeg;base64,xxx')
      expect(store.isSending).toBe(true)
      expect(store.messages).toHaveLength(1)
      expect(store.messages[0].status).toBe('sending')

      await promise

      expect(store.isSending).toBe(false)
      expect(store.messages).toHaveLength(2)
      expect(store.messages[0].role).toBe('user')
      expect(store.messages[0].status).toBe('done')
      expect(store.messages[1].role).toBe('assistant')
      expect(store.messages[1].status).toBe('done')
      expect(store.messages[1].content).toBe('看到一只猫')
    })

    it('marks user message as error on API failure', async () => {
      const store = createStore()
      mockSend.mockRejectedValueOnce(new Error('API down'))

      await expect(store.sendMessage('测试', 'data:image/jpeg;base64,xxx')).rejects.toThrow()

      expect(store.messages).toHaveLength(1)
      expect(store.messages[0].status).toBe('error')
      expect(store.messages[0].errorMessage).toBe('API down')
      expect(store.isSending).toBe(false)
    })

    it('prevents duplicate submission while sending', async () => {
      const store = createStore()
      // Never resolves — simulates in-flight
      mockSend.mockReturnValueOnce(new Promise(() => {}))

      store.sendMessage('问题一', 'data:image/jpeg;base64,xxx')
      await new Promise((r) => setTimeout(r, 10))

      await expect(store.sendMessage('问题二', 'data:image/jpeg;base64,xxx')).rejects.toThrow(
        '已有请求正在处理中',
      )
    })

    it('prevents duplicate final transcript submission', async () => {
      const store = createStore()
      mockSend.mockResolvedValueOnce(makeMockResponse('回答一'))
      mockSend.mockResolvedValueOnce(makeMockResponse('回答二'))

      await store.sendMessage('同一个问题', 'data:image/jpeg;base64,xxx')

      // Second submission with same text should be rejected
      await expect(
        store.sendMessage('同一个问题', 'data:image/jpeg;base64,xxx'),
      ).rejects.toThrow('相同问题已提交')
    })
  })

  describe('buildHistory', () => {
    it('returns only done messages', () => {
      const store = createStore()
      // Manually seed messages
      ;(store as any).messages = [
        { id: '1', role: 'user', content: 'Q1', status: 'done' },
        { id: '2', role: 'assistant', content: 'A1', status: 'done' },
        { id: '3', role: 'user', content: 'Q2', status: 'error' }, // should be filtered
        { id: '4', role: 'assistant', content: 'A2', status: 'done' },
      ]

      const history = store.buildHistory()
      expect(history).toHaveLength(3) // error filtered out
      expect(history.map((h) => h.content)).toEqual(['Q1', 'A1', 'A2'])
    })

    it('caps at 4 rounds (8 messages)', () => {
      const store = createStore()
      const msgs: any[] = []
      for (let i = 0; i < 6; i++) {
        msgs.push({ id: `u${i}`, role: 'user', content: `问题${i + 1}`, status: 'done' })
        msgs.push({
          id: `a${i}`,
          role: 'assistant',
          content: `回答${i + 1}`,
          status: 'done',
        })
      }
      ;(store as any).messages = msgs // 12 messages = 6 rounds

      const history = store.buildHistory()
      // Should be last 8 messages (4 rounds)
      expect(history).toHaveLength(8)
      expect(history[0].content).toBe('问题3')
      expect(history[7].content).toBe('回答6')
    })

    it('truncates long messages in history', () => {
      const store = createStore()
      const longText = 'A'.repeat(600)
      ;(store as any).messages = [
        { id: '1', role: 'user', content: '短问题', status: 'done' },
        { id: '2', role: 'assistant', content: longText, status: 'done' },
      ]

      const history = store.buildHistory()
      expect(history[0].content).toBe('短问题') // short, unchanged
      expect(history[1].content.length).toBeLessThan(600)
      expect(history[1].content.endsWith('…')).toBe(true)
    })
  })

  describe('clearSession', () => {
    it('removes all messages and resets state', () => {
      const store = createStore()
      ;(store as any).messages = [
        { id: '1', role: 'user', content: 'Q', status: 'done' },
        { id: '2', role: 'assistant', content: 'A', status: 'done' },
      ]
      ;(store as any).isSending = true
      ;(store as any).lastMetrics = { e2eLatencyMs: 1000 }

      store.clearSession()

      expect(store.messages).toHaveLength(0)
      expect(store.isSending).toBe(false)
      expect(store.lastMetrics).toBeNull()
    })
  })

  describe('contextRounds', () => {
    it('counts complete text rounds correctly', () => {
      const store = createStore()
      ;(store as any).messages = [
        { id: '1', role: 'user', content: 'Q1', status: 'done' },
        { id: '2', role: 'assistant', content: 'A1', status: 'done' },
        { id: '3', role: 'user', content: 'Q2', status: 'done' },
        { id: '4', role: 'assistant', content: 'A2', status: 'done' },
        { id: '5', role: 'user', content: '', status: 'done' }, // empty — filtered
        { id: '6', role: 'assistant', content: 'A3', status: 'sending' }, // not done
      ]

      expect(store.contextRounds).toBe(2) // 4 complete messages with content
    })
  })

  describe('retryMessage', () => {
    it('retries a failed message', async () => {
      const store = createStore()
      ;(store as any).messages = [
        {
          id: 'err-1',
          role: 'user',
          content: '失败的问题',
          status: 'error',
          errorMessage: 'timeout',
        },
      ]

      mockSend.mockResolvedValueOnce(makeMockResponse('重试成功'))

      const result = await store.retryMessage('err-1', 'data:image/jpeg;base64,xxx')
      expect(result.role).toBe('assistant')
      expect(result.content).toBe('重试成功')
      expect(store.messages).toHaveLength(2)
      expect(store.messages[0].status).toBe('done')
    })

    it('throws for non-error messages', async () => {
      const store = createStore()
      ;(store as any).messages = [
        { id: 'ok-1', role: 'user', content: '正常问题', status: 'done' },
      ]

      await expect(
        store.retryMessage('ok-1', 'data:image/jpeg;base64,xxx'),
      ).rejects.toThrow('只能重试失败的消息')
    })
  })
})
