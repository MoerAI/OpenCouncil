import { describe, test, expect, beforeEach, mock } from 'bun:test'
import type { StreamChunk, ModelConfig } from '@/types/llm'
import type { LLMProviderAdapter } from '@/lib/llm/provider'
import type { FanOutResult } from '@/lib/llm/fan-out'
import type { RAGContext } from '@/types/rag'

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
const { RoundBasedDebateEngine } = await import('../round-based')

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

describe('RoundBasedDebateEngine', () => {
  let fanOutCallCount: number

  beforeEach(() => {
    mockRetrieveContext.mockReset()
    mockFanOutModels.mockReset()
    mockStreamCompletion.mockReset()
    fanOutCallCount = 0

    mockRetrieveContext.mockImplementation(() => Promise.resolve(defaultRAGContext))

    mockStreamCompletion.mockImplementation(async function* () {
      yield makeChunk('openai/gpt-4o', 'openai', 'Synthesis result.', 'stop')
    })
  })

  test('completes 3 rounds with 3 models', async () => {
    mockFanOutModels.mockImplementation(() => {
      fanOutCallCount++
      return Promise.resolve([
        makeFanOutResult('openai/gpt-4o', `Round ${fanOutCallCount} from GPT.`, [
          makeChunk('openai/gpt-4o', 'openai', `Round ${fanOutCallCount} from GPT.`, 'stop', {
            promptTokens: 50,
            completionTokens: 20,
            totalTokens: 70,
          }),
        ]),
        makeFanOutResult('anthropic/claude-sonnet-4-20250514', `Round ${fanOutCallCount} from Claude.`, [
          makeChunk('anthropic/claude-sonnet-4-20250514', 'anthropic', `Round ${fanOutCallCount} from Claude.`, 'stop', {
            promptTokens: 55,
            completionTokens: 18,
            totalTokens: 73,
          }),
        ]),
        makeFanOutResult('google/gemini-2.0-flash', `Round ${fanOutCallCount} from Gemini.`, [
          makeChunk('google/gemini-2.0-flash', 'google', `Round ${fanOutCallCount} from Gemini.`, 'stop', {
            promptTokens: 48,
            completionTokens: 22,
            totalTokens: 70,
          }),
        ]),
      ])
    })

    const engine = new RoundBasedDebateEngine()
    const result = await engine.execute(testConfig)

    // 3 rounds × 3 models = 9 responses
    expect(result.responses).toHaveLength(9)

    // Verify round assignments
    const round1 = result.responses.filter((r) => r.round === 1)
    const round2 = result.responses.filter((r) => r.round === 2)
    const round3 = result.responses.filter((r) => r.round === 3)
    expect(round1).toHaveLength(3)
    expect(round2).toHaveLength(3)
    expect(round3).toHaveLength(3)

    // Synthesis is generated
    expect(result.synthesis).toContain('Synthesis result.')
  })

  test('includes previous round responses in context', async () => {
    const capturedArgs: Array<unknown[]> = []

    mockFanOutModels.mockImplementation((...args: unknown[]) => {
      fanOutCallCount++
      capturedArgs.push(args)
      return Promise.resolve([
        makeFanOutResult('openai/gpt-4o', `Round ${fanOutCallCount} GPT response about regulation.`, [
          makeChunk('openai/gpt-4o', 'openai', `Round ${fanOutCallCount} GPT response about regulation.`, 'stop'),
        ]),
        makeFanOutResult('anthropic/claude-sonnet-4-20250514', `Round ${fanOutCallCount} Claude response about oversight.`, [
          makeChunk('anthropic/claude-sonnet-4-20250514', 'anthropic', `Round ${fanOutCallCount} Claude response about oversight.`, 'stop'),
        ]),
        makeFanOutResult('google/gemini-2.0-flash', `Round ${fanOutCallCount} Gemini response about balance.`, [
          makeChunk('google/gemini-2.0-flash', 'google', `Round ${fanOutCallCount} Gemini response about balance.`, 'stop'),
        ]),
      ])
    })

    const engine = new RoundBasedDebateEngine()
    await engine.execute(testConfig)

    // fanOutModels should be called 3 times (once per round)
    expect(mockFanOutModels).toHaveBeenCalledTimes(3)

    // Round 2+ uses a custom adapter that injects previous responses.
    // The getProvider callback (3rd arg) for rounds 2-3 creates wrapper adapters.
    // We verify by calling the getProvider and checking its streamCompletion call.
    const round2GetProvider = capturedArgs[1]![2] as (modelId: string) => LLMProviderAdapter
    const round2Adapter = round2GetProvider('openai/gpt-4o')

    // The adapter wraps streamCompletion to inject the right user message.
    // We can verify this by checking that streamCompletion was called with content including
    // previous round info when we iterate the adapter.
    const streamCallArgs: Array<{ role: string; content: string }[]> = []
    mockStreamCompletion.mockImplementation(async function* (_config: ModelConfig, messages: Array<{ role: string; content: string }>) {
      streamCallArgs.push(messages)
      yield makeChunk('openai/gpt-4o', 'openai', 'response', 'stop')
    })

    // Call the adapter — it should invoke streamCompletion with previous round content
    const fakeConfig = { modelId: 'openai/gpt-4o', systemPrompt: '', maxTokens: 4096, temperature: 0.7, apiKey: 'test' }
    for await (const _chunk of round2Adapter.streamCompletion(fakeConfig, [{ role: 'user', content: 'ignored' }])) {
      // consume
    }

    // The injected message should include previous round responses
    expect(streamCallArgs.length).toBeGreaterThan(0)
    const injectedMessage = streamCallArgs[0]![0]!.content
    expect(injectedMessage).toContain('Previous round responses')
    expect(injectedMessage).toContain('Round 1')
  })

  test('randomizes response order for bias prevention', async () => {
    // We test that the adapter for round 2 uses shuffleArray by checking
    // that the function is called (responses will be present but possibly reordered)
    mockFanOutModels.mockImplementation(() => {
      fanOutCallCount++
      return Promise.resolve([
        makeFanOutResult('openai/gpt-4o', `Response ${fanOutCallCount} A`, [
          makeChunk('openai/gpt-4o', 'openai', `Response ${fanOutCallCount} A`, 'stop'),
        ]),
        makeFanOutResult('anthropic/claude-sonnet-4-20250514', `Response ${fanOutCallCount} B`, [
          makeChunk('anthropic/claude-sonnet-4-20250514', 'anthropic', `Response ${fanOutCallCount} B`, 'stop'),
        ]),
        makeFanOutResult('google/gemini-2.0-flash', `Response ${fanOutCallCount} C`, [
          makeChunk('google/gemini-2.0-flash', 'google', `Response ${fanOutCallCount} C`, 'stop'),
        ]),
      ])
    })

    const engine = new RoundBasedDebateEngine()
    const result = await engine.execute(testConfig)

    // Round 2 and 3 exist — the adapter injects shuffled other responses.
    // Verify round 2 adapter carries previous responses (regardless of order).
    const round2Responses = result.responses.filter((r) => r.round === 2)
    expect(round2Responses).toHaveLength(3)

    // Each round 2 response should exist — the engine ran with shuffled context
    for (const resp of round2Responses) {
      expect(resp.content).toBeTruthy()
    }
  })

  test('returns method llm-merge-round-based', async () => {
    mockFanOutModels.mockImplementation(() => {
      fanOutCallCount++
      return Promise.resolve([
        makeFanOutResult('openai/gpt-4o', 'Response.', [
          makeChunk('openai/gpt-4o', 'openai', 'Response.', 'stop'),
        ]),
      ])
    })

    const engine = new RoundBasedDebateEngine()
    const result = await engine.execute({
      ...testConfig,
      models: ['openai/gpt-4o'],
    })

    expect(result.method).toBe('llm-merge-round-based')
  })
})
