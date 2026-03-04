import type { DebateType, DebateStatus } from './debate'
import type { LLMProvider } from './llm'

// SSE event types — matches event names in SSE stream
export type SSEEventType =
  | 'model-openai'
  | 'model-anthropic'
  | 'model-google'
  | 'round-start'
  | 'phase-start'
  | 'synthesis'
  | 'heartbeat'
  | 'done'
  | 'error'

export interface SSEEvent<T = unknown> {
  event: SSEEventType
  data: T
}

export interface ModelSSEData {
  model: string
  provider: string
  delta: string
  finishReason: string | null
}

export interface SynthesisSSEData {
  content: string
  summary: string
  agreements: string[]
  disagreements: string[]
  conclusion: string
}

export interface ErrorSSEData {
  model?: string
  code: string
  message: string
}

// API Request/Response types
export interface CreateDebateRequest {
  topic: string
  type: DebateType
  models: string[]   // 2-5 model IDs
}

export interface CreateDebateResponse {
  id: string
  sessionId: string  // same as debate id, used for SSE stream query param
  status: DebateStatus
}

export interface APIKeyRequest {
  provider: LLMProvider
  apiKey: string
}

export interface APIKeyResponse {
  provider: LLMProvider
  hint: string       // e.g. 'sk-...4x9z'
  isActive: boolean
  createdAt: string
}
