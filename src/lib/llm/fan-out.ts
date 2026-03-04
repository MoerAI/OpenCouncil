import type { StreamChunk, ModelConfig } from '@/types/llm'
import type { LLMProviderAdapter } from './provider'

export interface FanOutResult {
  model: string
  chunks: StreamChunk[]
  content: string
  error?: string
}

export async function fanOutModels(
  configs: ModelConfig[],
  messages: Array<{ role: string; content: string }>,
  getProvider: (modelId: string) => LLMProviderAdapter,
): Promise<FanOutResult[]> {
  const results = await Promise.allSettled(
    configs.map(async (config) => {
      const provider = getProvider(config.modelId)
      const chunks: StreamChunk[] = []
      let content = ''

      for await (const chunk of provider.streamCompletion(config, messages)) {
        chunks.push(chunk)
        content += chunk.delta
      }

      return { model: config.modelId, chunks, content } satisfies FanOutResult
    }),
  )

  return results.map((result, i) => {
    const modelId = configs[i]!.modelId
    if (result.status === 'fulfilled') return result.value
    return {
      model: modelId,
      chunks: [],
      content: '',
      error:
        result.reason instanceof Error
          ? result.reason.message
          : 'Unknown error',
    }
  })
}
