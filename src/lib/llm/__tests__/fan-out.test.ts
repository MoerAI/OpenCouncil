import { describe, it, expect } from 'vitest'
import type { StreamChunk, ModelConfig } from '@/types/llm'
import type { LLMProviderAdapter } from '../provider'
import { fanOutModels } from '../fan-out'

function createMockProvider(
  name: string,
  chunks: StreamChunk[],
): LLMProviderAdapter {
  return {
    name,
    async *streamCompletion() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
    async validateKey() {
      return true
    },
  }
}

function createFailingProvider(
  name: string,
  errorMessage: string,
): LLMProviderAdapter {
  return {
    name,
    async *streamCompletion() {
      throw new Error(errorMessage)
    },
    async validateKey() {
      return false
    },
  }
}

function makeConfig(modelId: string): ModelConfig {
  return {
    modelId,
    systemPrompt: 'You are a helpful assistant.',
    maxTokens: 1024,
    temperature: 0.7,
    apiKey: 'test-key',
  }
}

function makeChunk(
  model: string,
  provider: 'openai' | 'anthropic' | 'google',
  delta: string,
  finishReason: string | null = null,
): StreamChunk {
  return { model, provider, delta, finishReason }
}

describe('fanOutModels', () => {
  it('collects results from 3 mock providers', async () => {
    const configs: ModelConfig[] = [
      makeConfig('openai/gpt-4o'),
      makeConfig('anthropic/claude-sonnet-4-20250514'),
      makeConfig('google/gemini-2.0-flash'),
    ]

    const providers: Record<string, LLMProviderAdapter> = {
      'openai/gpt-4o': createMockProvider('openai', [
        makeChunk('openai/gpt-4o', 'openai', 'Hello '),
        makeChunk('openai/gpt-4o', 'openai', 'world!', 'stop'),
      ]),
      'anthropic/claude-sonnet-4-20250514': createMockProvider('anthropic', [
        makeChunk('anthropic/claude-sonnet-4-20250514', 'anthropic', 'Hi '),
        makeChunk(
          'anthropic/claude-sonnet-4-20250514',
          'anthropic',
          'there!',
          'stop',
        ),
      ]),
      'google/gemini-2.0-flash': createMockProvider('google', [
        makeChunk('google/gemini-2.0-flash', 'google', 'Hey '),
        makeChunk('google/gemini-2.0-flash', 'google', 'you!', 'stop'),
      ]),
    }

    const results = await fanOutModels(
      configs,
      [{ role: 'user', content: 'Hello' }],
      (modelId) => providers[modelId]!,
    )

    expect(results).toHaveLength(3)
    expect(results[0]!.model).toBe('openai/gpt-4o')
    expect(results[0]!.content).toBe('Hello world!')
    expect(results[0]!.chunks).toHaveLength(2)
    expect(results[0]!.error).toBeUndefined()

    expect(results[1]!.model).toBe('anthropic/claude-sonnet-4-20250514')
    expect(results[1]!.content).toBe('Hi there!')

    expect(results[2]!.model).toBe('google/gemini-2.0-flash')
    expect(results[2]!.content).toBe('Hey you!')
  })

  it('returns partial results when 1 provider fails', async () => {
    const configs: ModelConfig[] = [
      makeConfig('openai/gpt-4o'),
      makeConfig('anthropic/claude-sonnet-4-20250514'),
      makeConfig('google/gemini-2.0-flash'),
    ]

    const providers: Record<string, LLMProviderAdapter> = {
      'openai/gpt-4o': createMockProvider('openai', [
        makeChunk('openai/gpt-4o', 'openai', 'Success!', 'stop'),
      ]),
      'anthropic/claude-sonnet-4-20250514': createFailingProvider(
        'anthropic',
        'API rate limited',
      ),
      'google/gemini-2.0-flash': createMockProvider('google', [
        makeChunk('google/gemini-2.0-flash', 'google', 'Also success!', 'stop'),
      ]),
    }

    const results = await fanOutModels(
      configs,
      [{ role: 'user', content: 'Hello' }],
      (modelId) => providers[modelId]!,
    )

    expect(results).toHaveLength(3)

    // First: success
    expect(results[0]!.content).toBe('Success!')
    expect(results[0]!.error).toBeUndefined()

    // Second: error
    expect(results[1]!.model).toBe('anthropic/claude-sonnet-4-20250514')
    expect(results[1]!.content).toBe('')
    expect(results[1]!.chunks).toHaveLength(0)
    expect(results[1]!.error).toBe('API rate limited')

    // Third: success
    expect(results[2]!.content).toBe('Also success!')
    expect(results[2]!.error).toBeUndefined()
  })

  it('returns all errors when all providers fail (no throw)', async () => {
    const configs: ModelConfig[] = [
      makeConfig('openai/gpt-4o'),
      makeConfig('anthropic/claude-sonnet-4-20250514'),
      makeConfig('google/gemini-2.0-flash'),
    ]

    const providers: Record<string, LLMProviderAdapter> = {
      'openai/gpt-4o': createFailingProvider('openai', 'OpenAI down'),
      'anthropic/claude-sonnet-4-20250514': createFailingProvider(
        'anthropic',
        'Anthropic down',
      ),
      'google/gemini-2.0-flash': createFailingProvider(
        'google',
        'Google down',
      ),
    }

    // Should NOT throw
    const results = await fanOutModels(
      configs,
      [{ role: 'user', content: 'Hello' }],
      (modelId) => providers[modelId]!,
    )

    expect(results).toHaveLength(3)
    expect(results[0]!.error).toBe('OpenAI down')
    expect(results[0]!.content).toBe('')
    expect(results[1]!.error).toBe('Anthropic down')
    expect(results[2]!.error).toBe('Google down')
  })
})
