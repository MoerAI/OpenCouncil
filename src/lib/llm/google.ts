import { GoogleGenerativeAI } from '@google/generative-ai'
import type { StreamChunk, ModelConfig } from '@/types/llm'
import type { LLMProviderAdapter } from './provider'

function extractModelName(modelId: string): string {
  // 'google/gemini-2.0-flash' -> 'gemini-2.0-flash'
  return modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId
}

export class GoogleProvider implements LLMProviderAdapter {
  readonly name = 'google'

  async *streamCompletion(
    config: ModelConfig,
    messages: Array<{ role: string; content: string }>,
  ): AsyncIterable<StreamChunk> {
    const genAI = new GoogleGenerativeAI(config.apiKey)
    const model = genAI.getGenerativeModel({
      model: extractModelName(config.modelId),
      systemInstruction: config.systemPrompt,
      generationConfig: {
        maxOutputTokens: config.maxTokens,
        temperature: config.temperature,
      },
    })

    // Convert messages to Google's format (alternating user/model)
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) {
      throw new Error('At least one message is required')
    }

    const chat = model.startChat({ history })
    const result = await chat.sendMessageStream(lastMessage.content)

    for await (const chunk of result.stream) {
      const text = chunk.text()

      yield {
        model: config.modelId,
        provider: 'google',
        delta: text,
        finishReason: null,
      }
    }

    // Final chunk with usage from aggregated response
    const response = await result.response
    const usageMetadata = response.usageMetadata

    yield {
      model: config.modelId,
      provider: 'google',
      delta: '',
      finishReason: 'stop',
      usage: usageMetadata
        ? {
            promptTokens: usageMetadata.promptTokenCount,
            completionTokens: usageMetadata.candidatesTokenCount,
            totalTokens: usageMetadata.totalTokenCount,
          }
        : undefined,
    }
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      await model.generateContent('test')
      return true
    } catch {
      return false
    }
  }
}
