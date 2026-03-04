export type LLMProvider = 'openai' | 'anthropic' | 'google'

export interface ModelInfo {
  id: string          // e.g. 'openai/gpt-4o'
  name: string        // e.g. 'GPT-4o'
  provider: LLMProvider
  contextWindow: number   // in tokens
  inputPricePerMToken: number   // $ per million input tokens
  outputPricePerMToken: number  // $ per million output tokens
  supportsStreaming: boolean
}

export interface ModelConfig {
  modelId: string
  systemPrompt: string
  maxTokens: number
  temperature: number
  apiKey: string
}

export interface StreamChunk {
  model: string          // e.g. 'openai/gpt-4o'
  provider: LLMProvider
  delta: string          // text delta
  finishReason: string | null  // 'stop' | 'length' | null
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface LLMResponse {
  model: string
  content: string
  tokenCount: number
  latencyMs: number
  error?: string
}
