/**
 * Vision Chat API client.
 *
 * Sends camera snapshots + text questions to the FastAPI backend
 * and returns model answers. No API keys live here.
 */

// ---- Types matching backend schemas ----

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClientMetrics {
  original_bytes: number
  compressed_bytes: number
  capture_duration_ms: number
}

export interface VisionChatRequest {
  question: string
  image: string // data:image/jpeg;base64,...
  history: HistoryMessage[]
  client_metrics?: ClientMetrics
}

export interface VisionChatResponse {
  request_id: string
  answer: string
  model: string
  latency_ms: number
  history_rounds: number
  usage: {
    input_tokens: number | null
    output_tokens: number | null
  }
}

export interface ApiError {
  code: string
  message: string
  request_id: string
}

export class VisionChatApiError extends Error {
  code: string
  requestId: string

  constructor(code: string, message: string, requestId: string) {
    super(message)
    this.name = 'VisionChatApiError'
    this.code = code
    this.requestId = requestId
  }
}

// ---- API call ----

export async function sendVisionChat(
  payload: VisionChatRequest,
): Promise<VisionChatResponse> {
  let response: Response

  try {
    response = await fetch('/api/v1/vision/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    throw new VisionChatApiError(
      'NETWORK_ERROR',
      '网络连接失败，请检查后端服务是否已启动。',
      'N/A',
    )
  }

  if (!response.ok) {
    let errorBody: ApiError | null = null
    try {
      errorBody = (await response.json()) as ApiError
    } catch {
      // Response wasn't JSON — use status text
    }

    throw new VisionChatApiError(
      errorBody?.code || `HTTP_${response.status}`,
      errorBody?.message || `服务返回错误 (${response.status})`,
      errorBody?.request_id || 'N/A',
    )
  }

  return (await response.json()) as VisionChatResponse
}
