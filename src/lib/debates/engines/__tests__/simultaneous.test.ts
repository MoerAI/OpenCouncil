import { describe, test, expect, beforeEach, mock } from 'bun:test'
import type { StreamChunk, ModelConfig } from '@/types/llm'
import type { LLMProviderAdapter } from '@/lib/llm/provider'
import type { FanOutResult } from '@/lib/llm/fan-out'
import type { RAGContext } from '@/types/rag'
import { buildModelConfig, getProviderFromModelId } from '../base'

// ── Mock state ──────────────────────────────────────────────────────────────
let mockRetrieveContext: ReturnType<typeof mock>
let mockFanOutModels: ReturnType<typeof mock>
let mockStreamCompletion: ReturnType<typeof mock>

const defaultRAGContext: RAGContext = {
  query: 'test topic',
  sources: [],
  contextText: 'Some retrieved context about the topic.',
  tokenCount: 100,
}

function makeChunk(
  model: string,
  provider: 'openai' | 'anthropic' | 'google',
  delta: string,
  finishReason: string | null = null,
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number },
): StreamChunk {
  return { model, provider, delta, finishReason, usage }
}

function makeFanOutResult(
  model: string,
  content: string,
  chunks: StreamChunk[],
  error?: string,
): FanOutResult {
  return { model, chunks, content, error }
}

// ── Mock modules before import ──────────────────────────────────────────────
mockRetrieveContext = mock(() => Promise.resolve(defaultRAGContext))
mockFanOutModels = mock(() => Promise.resolve([]))
mockStreamCompletion = mock(async function* () {
  yield makeChunk('openai/gpt-4o', 'openai', 'Synthesis result.', 'stop')
})

mock.module('@/lib/rag/pipeline', () => ({
  retrieveContext: (...args: unknown[]) => mockRetrieveContext(...args),
}))

mock.module('@/lib/llm/fan-out', () => ({
  fanOutModels: (...args: unknown[]) => mockFanOutModels(...args),
}))

mock.module('@/lib/llm/openai', () => ({
  OpenAIProvider: class {
    readonly name = 'openai'
    streamCompletion(config: ModelConfig, messages: Array<{ role: string; content: string }>) {
      return mockStreamCompletion(config, messages)
    }
    async validateKey() {
      return true
    }
  },
}))

mock.module('@/lib/llm/anthropic', () => ({
  AnthropicProvider: class {
    readonly name = 'anthropic'
    streamCompletion(config: ModelConfig, messages: Array<{ role: string; content: string }>) {
      return mockStreamCompletion(config, messages)
    }
    async validateKey() {
      return true
    }
  },
}))

mock.module('@/lib/llm/google', () => ({
  GoogleProvider: class {
    readonly name = 'google'
    streamCompletion(config: ModelConfig, messages: Array<{ role: string; content: string }>) {
      return mockStreamCompletion(config, messages)
    }
    async validateKey() {
      return true
    }
  },
}))

// Import AFTER mocks are set up
const { SimultaneousDebateEngine } = await import('../simultaneous')

// ── Test config ──────────────────────────────────────────────────────────────
const testConfig = {
  debateId: 'test-debate-123',
  topic: 'Should AI be regulated?',
  models: [
    'openai/gpt-4o',
    'anthropic/claude-sonnet-4-20250514',
    'google/gemini-2.0-flash',
  ],
  apiKeys: {
    openai: 'sk-test-openai',
    anthropic: 'sk-test-anthropic',
    google: 'sk-test-google',
  },
}

describe('SimultaneousDebateEngine', () => {
  beforeEach(() => {
    mockRetrieveContext.mockReset()
    mockFanOutModels.mockReset()
    mockStreamCompletion.mockReset()

    mockRetrieveContext.mockImplementation(() => Promise.resolve(defaultRAGContext))

    mockStreamCompletion.mockImplementation(async function* () {
      yield makeChunk('openai/gpt-4o', 'openai', 'Synthesis result.', 'stop')
    })
  })

  test('executes simultaneous debate with 3 models', async () => {
    const fanOutResults: FanOutResult[] = [
      makeFanOutResult('openai/gpt-4o', 'Analysis from GPT-4o.', [
        makeChunk('openai/gpt-4o', 'openai', 'Analysis from GPT-4o.', 'stop', {
          promptTokens: 50,
          completionTokens: 20,
          totalTokens: 70,
        }),
      ]),
      makeFanOutResult('anthropic/claude-sonnet-4-20250514', 'Critique from Claude.', [
        makeChunk('anthropic/claude-sonnet-4-20250514', 'anthropic', 'Critique from Claude.', 'stop', {
          promptTokens: 55,
          completionTokens: 18,
          totalTokens: 73,
        }),
      ]),
      makeFanOutResult('google/gemini-2.0-flash', 'Practical take from Gemini.', [
        makeChunk('google/gemini-2.0-flash', 'google', 'Practical take from Gemini.', 'stop', {
          promptTokens: 48,
          completionTokens: 22,
          totalTokens: 70,
        }),
      ]),
    ]

    mockFanOutModels.mockImplementation(() => Promise.resolve(fanOutResults))

    const engine = new SimultaneousDebateEngine()
    const result = await engine.execute(testConfig)

    expect(result.responses).toHaveLength(3)
    expect(result.responses[0]!.content).toBe('Analysis from GPT-4o.')
    expect(result.responses[1]!.content).toBe('Critique from Claude.')
    expect(result.responses[2]!.content).toBe('Practical take from Gemini.')
    expect(result.synthesis).not.toBe('')
    expect(result.synthesis).toContain('Synthesis result.')
  })

  test('assigns distinct roles to models', async () => {
    const fanOutResults: FanOutResult[] = [
      makeFanOutResult('openai/gpt-4o', 'Analysis output.', [
        makeChunk('openai/gpt-4o', 'openai', 'Analysis output.', 'stop'),
      ]),
      makeFanOutResult('anthropic/claude-sonnet-4-20250514', 'Critique output.', [
        makeChunk('anthropic/claude-sonnet-4-20250514', 'anthropic', 'Critique output.', 'stop'),
      ]),
      makeFanOutResult('google/gemini-2.0-flash', 'Pragmatic output.', [
        makeChunk('google/gemini-2.0-flash', 'google', 'Pragmatic output.', 'stop'),
      ]),
    ]

    mockFanOutModels.mockImplementation(() => Promise.resolve(fanOutResults))

    const engine = new SimultaneousDebateEngine()
    const result = await engine.execute(testConfig)

    expect(result.responses[0]!.role).toBe('Analyst')
    expect(result.responses[1]!.role).toBe('Critic')
    expect(result.responses[2]!.role).toBe('Pragmatist')
  })

  test('handles partial failure gracefully', async () => {
    const fanOutResults: FanOutResult[] = [
      makeFanOutResult('openai/gpt-4o', 'Analysis still works.', [
        makeChunk('openai/gpt-4o', 'openai', 'Analysis still works.', 'stop'),
      ]),
      makeFanOutResult('anthropic/claude-sonnet-4-20250514', '', [], 'API rate limited'),
      makeFanOutResult('google/gemini-2.0-flash', 'Pragmatist responds.', [
        makeChunk('google/gemini-2.0-flash', 'google', 'Pragmatist responds.', 'stop'),
      ]),
    ]

    mockFanOutModels.mockImplementation(() => Promise.resolve(fanOutResults))

    const engine = new SimultaneousDebateEngine()
    const result = await engine.execute(testConfig)

    expect(result.responses).toHaveLength(3)

    // First model: success
    expect(result.responses[0]!.content).toBe('Analysis still works.')
    expect(result.responses[0]!.error).toBeUndefined()

    // Second model: error
    expect(result.responses[1]!.error).toBe('API rate limited')
    expect(result.responses[1]!.content).toBe('')
    expect(result.responses[1]!.tokenCount).toBe(0)

    // Third model: success
    expect(result.responses[2]!.content).toBe('Pragmatist responds.')
    expect(result.responses[2]!.error).toBeUndefined()

    // Synthesis still generated from successful responses
    expect(result.synthesis).not.toBe('')
  })

  test('returns correct method name', async () => {
    const fanOutResults: FanOutResult[] = [
      makeFanOutResult('openai/gpt-4o', 'Response.', [
        makeChunk('openai/gpt-4o', 'openai', 'Response.', 'stop'),
      ]),
    ]

    mockFanOutModels.mockImplementation(() => Promise.resolve(fanOutResults))

    const engine = new SimultaneousDebateEngine()
    const result = await engine.execute({
      ...testConfig,
      models: ['openai/gpt-4o'],
    })

    expect(result.method).toBe('llm-merge-simultaneous')
  })
})

describe('buildModelConfig', () => {
  test('caps maxTokens at 4096', () => {
    // openai/gpt-4o has contextWindow = 128000
    // 80% of 128000 = 102400, capped at 4096
    const config = buildModelConfig(
      'openai/gpt-4o',
      'Test system prompt',
      'test-api-key',
    )

    expect(config.maxTokens).toBe(4096)
    expect(config.temperature).toBe(0.7)
    expect(config.modelId).toBe('openai/gpt-4o')
    expect(config.systemPrompt).toBe('Test system prompt')
    expect(config.apiKey).toBe('test-api-key')
  })
})

describe('getProviderFromModelId', () => {
  test('extracts provider from model ID', () => {
    expect(getProviderFromModelId('openai/gpt-4o')).toBe('openai')
    expect(getProviderFromModelId('anthropic/claude-sonnet-4-20250514')).toBe('anthropic')
    expect(getProviderFromModelId('google/gemini-2.0-flash')).toBe('google')
  })

  test('throws on invalid model ID', () => {
    expect(() => getProviderFromModelId('invalid-model')).toThrow()
    expect(() => getProviderFromModelId('unknown/model')).toThrow()
  })
})
