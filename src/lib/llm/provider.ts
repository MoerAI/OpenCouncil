import type { StreamChunk, ModelConfig } from '@/types/llm'

export interface LLMProviderAdapter {
  readonly name: string
  streamCompletion(
    config: ModelConfig,
    messages: Array<{ role: string; content: string }>,
  ): AsyncIterable<StreamChunk>
  validateKey(apiKey: string): Promise<boolean>
}
