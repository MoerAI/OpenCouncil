import OpenAI from 'openai'
import type { StreamChunk, ModelConfig } from '@/types/llm'
import type { LLMProviderAdapter } from './provider'

function extractModelName(modelId: string): string {
  // 'openai/gpt-4o' -> 'gpt-4o'
  return modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId
}

export class OpenAIProvider implements LLMProviderAdapter {
  readonly name = 'openai'

  async *streamCompletion(
    config: ModelConfig,
    messages: Array<{ role: string; content: string }>,
  ): AsyncIterable<StreamChunk> {
    const client = new OpenAI({ apiKey: config.apiKey })
    const model = extractModelName(config.modelId)

    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system' as const, content: config.systemPrompt },
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: true,
      stream_options: { include_usage: true },
    })

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      const delta = choice?.delta?.content ?? ''
      const finishReason = choice?.finish_reason ?? null

      const streamChunk: StreamChunk = {
        model: config.modelId,
        provider: 'openai',
        delta,
        finishReason,
      }

      if (chunk.usage) {
        streamChunk.usage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        }
      }

      yield streamChunk
    }
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const client = new OpenAI({ apiKey })
      await client.models.list()
      return true
    } catch {
      return false
    }
  }
}
