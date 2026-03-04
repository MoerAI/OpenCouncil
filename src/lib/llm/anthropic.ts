import Anthropic from '@anthropic-ai/sdk'
import type { StreamChunk, ModelConfig } from '@/types/llm'
import type { LLMProviderAdapter } from './provider'

function extractModelName(modelId: string): string {
  // 'anthropic/claude-sonnet-4-20250514' -> 'claude-sonnet-4-20250514'
  return modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId
}

export class AnthropicProvider implements LLMProviderAdapter {
  readonly name = 'anthropic'

  async *streamCompletion(
    config: ModelConfig,
    messages: Array<{ role: string; content: string }>,
  ): AsyncIterable<StreamChunk> {
    const client = new Anthropic({ apiKey: config.apiKey })
    const model = extractModelName(config.modelId)

    const stream = client.messages.stream({
      model,
      system: config.systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta =
          event.delta.type === 'text_delta' ? event.delta.text : ''

        yield {
          model: config.modelId,
          provider: 'anthropic',
          delta,
          finishReason: null,
        }
      }

      if (event.type === 'message_stop') {
        const finalMessage = await stream.finalMessage()
        yield {
          model: config.modelId,
          provider: 'anthropic',
          delta: '',
          finishReason: finalMessage.stop_reason ?? 'stop',
          usage: {
            promptTokens: finalMessage.usage.input_tokens,
            completionTokens: finalMessage.usage.output_tokens,
            totalTokens:
              finalMessage.usage.input_tokens +
              finalMessage.usage.output_tokens,
          },
        }
      }
    }
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const client = new Anthropic({ apiKey })
      await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      })
      return true
    } catch (err: unknown) {
      if (
        err instanceof Anthropic.AuthenticationError ||
        (err instanceof Error && 'status' in err && (err as { status: number }).status === 401)
      ) {
        return false
      }
      // Other errors (rate limit, etc.) still mean key is valid
      return true
    }
  }
}
