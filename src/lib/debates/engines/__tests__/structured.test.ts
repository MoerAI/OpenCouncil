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
const { StructuredDebateEngine } = await import('../structured')

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

describe('StructuredDebateEngine', () => {
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

  test('assigns Advocate/Opponent/Mediator roles', async () => {
    mockFanOutModels.mockImplementation(() => {
      fanOutCallCount++
      return Promise.resolve([
        makeFanOutResult('openai/gpt-4o', `Phase ${fanOutCallCount} argument from GPT.`, [
          makeChunk('openai/gpt-4o', 'openai', `Phase ${fanOutCallCount} argument from GPT.`, 'stop', {
            promptTokens: 50,
            completionTokens: 20,
            totalTokens: 70,
          }),
        ]),
        makeFanOutResult('anthropic/claude-sonnet-4-20250514', `Phase ${fanOutCallCount} argument from Claude.`, [
          makeChunk('anthropic/claude-sonnet-4-20250514', 'anthropic', `Phase ${fanOutCallCount} argument from Claude.`, 'stop', {
            promptTokens: 55,
            completionTokens: 18,
            totalTokens: 73,
          }),
        ]),
        makeFanOutResult('google/gemini-2.0-flash', `Phase ${fanOutCallCount} argument from Gemini.`, [
          makeChunk('google/gemini-2.0-flash', 'google', `Phase ${fanOutCallCount} argument from Gemini.`, 'stop', {
            promptTokens: 48,
            completionTokens: 22,
            totalTokens: 70,
          }),
        ]),
      ])
    })

    const engine = new StructuredDebateEngine()
    const result = await engine.execute(testConfig)

    // Check role assignments
    const advocateResponses = result.responses.filter((r) => r.role === 'Advocate')
    const opponentResponses = result.responses.filter((r) => r.role === 'Opponent')
    const mediatorResponses = result.responses.filter((r) => r.role === 'Mediator')

    expect(advocateResponses.length).toBeGreaterThan(0)
    expect(opponentResponses.length).toBeGreaterThan(0)
    expect(mediatorResponses.length).toBeGreaterThan(0)

    // Model 0 should be Advocate
    const model0Responses = result.responses.filter((r) => r.model === 'openai/gpt-4o')
    for (const resp of model0Responses) {
      expect(resp.role).toBe('Advocate')
    }

    // Model 1 should be Opponent
    const model1Responses = result.responses.filter((r) => r.model === 'anthropic/claude-sonnet-4-20250514')
    for (const resp of model1Responses) {
      expect(resp.role).toBe('Opponent')
    }

    // Model 2 should be Mediator
    const model2Responses = result.responses.filter((r) => r.model === 'google/gemini-2.0-flash')
    for (const resp of model2Responses) {
      expect(resp.role).toBe('Mediator')
    }
  })

  test('completes 4 phases', async () => {
    mockFanOutModels.mockImplementation(() => {
      fanOutCallCount++
      return Promise.resolve([
        makeFanOutResult('openai/gpt-4o', `Phase ${fanOutCallCount} GPT.`, [
          makeChunk('openai/gpt-4o', 'openai', `Phase ${fanOutCallCount} GPT.`, 'stop'),
        ]),
        makeFanOutResult('anthropic/claude-sonnet-4-20250514', `Phase ${fanOutCallCount} Claude.`, [
          makeChunk('anthropic/claude-sonnet-4-20250514', 'anthropic', `Phase ${fanOutCallCount} Claude.`, 'stop'),
        ]),
        makeFanOutResult('google/gemini-2.0-flash', `Phase ${fanOutCallCount} Gemini.`, [
          makeChunk('google/gemini-2.0-flash', 'google', `Phase ${fanOutCallCount} Gemini.`, 'stop'),
        ]),
      ])
    })

    const engine = new StructuredDebateEngine()
    const result = await engine.execute(testConfig)

    // Phase 2 (arguments) + Phase 3 (cross-examination) = 6 responses
    expect(result.responses).toHaveLength(6)

    // Phase 2 responses (round=2)
    const phase2 = result.responses.filter((r) => r.round === 2)
    expect(phase2).toHaveLength(3)

    // Phase 3 responses (round=3)
    const phase3 = result.responses.filter((r) => r.round === 3)
    expect(phase3).toHaveLength(3)

    // Phase 4: synthesis
    expect(result.synthesis).toContain('Synthesis result.')
  })

  test('cross-examination references other models arguments', async () => {
    const capturedArgs: Array<unknown[]> = []

    mockFanOutModels.mockImplementation((...args: unknown[]) => {
      fanOutCallCount++
      capturedArgs.push(args)
      return Promise.resolve([
        makeFanOutResult('openai/gpt-4o', `Phase ${fanOutCallCount}: AI should be regulated for safety.`, [
          makeChunk('openai/gpt-4o', 'openai', `Phase ${fanOutCallCount}: AI should be regulated for safety.`, 'stop'),
        ]),
        makeFanOutResult('anthropic/claude-sonnet-4-20250514', `Phase ${fanOutCallCount}: Regulation stifles innovation.`, [
          makeChunk('anthropic/claude-sonnet-4-20250514', 'anthropic', `Phase ${fanOutCallCount}: Regulation stifles innovation.`, 'stop'),
        ]),
        makeFanOutResult('google/gemini-2.0-flash', `Phase ${fanOutCallCount}: Balance is needed.`, [
          makeChunk('google/gemini-2.0-flash', 'google', `Phase ${fanOutCallCount}: Balance is needed.`, 'stop'),
        ]),
      ])
    })

    const engine = new StructuredDebateEngine()
    await engine.execute(testConfig)

    // fanOutModels called twice: phase 2 (arguments) + phase 3 (cross-exam)
    expect(mockFanOutModels).toHaveBeenCalledTimes(2)

    // Phase 3 (cross-exam) getProvider creates adapter that injects other arguments
    const phase3GetProvider = capturedArgs[1]![2] as (modelId: string) => LLMProviderAdapter
    const adapter = phase3GetProvider('openai/gpt-4o')

    const streamCallArgs: Array<{ role: string; content: string }[]> = []
    mockStreamCompletion.mockImplementation(async function* (_config: ModelConfig, messages: Array<{ role: string; content: string }>) {
      streamCallArgs.push(messages)
      yield makeChunk('openai/gpt-4o', 'openai', 'cross-exam response', 'stop')
    })

    const fakeConfig = { modelId: 'openai/gpt-4o', systemPrompt: '', maxTokens: 4096, temperature: 0.7, apiKey: 'test' }
    for await (const _chunk of adapter.streamCompletion(fakeConfig, [{ role: 'user', content: 'ignored' }])) {
      // consume
    }

    // The injected message should reference other models' arguments
    expect(streamCallArgs.length).toBeGreaterThan(0)
    const injectedMessage = streamCallArgs[0]![0]!.content
    expect(injectedMessage).toContain('Arguments from other participants')
    // Should include the other models' content (Claude & Gemini for GPT's cross-exam)
    expect(injectedMessage).toContain('Regulation stifles innovation')
    expect(injectedMessage).toContain('Balance is needed')
  })

  test('returns method llm-merge-structured', async () => {
    mockFanOutModels.mockImplementation(() => {
      fanOutCallCount++
      return Promise.resolve([
        makeFanOutResult('openai/gpt-4o', 'Response.', [
          makeChunk('openai/gpt-4o', 'openai', 'Response.', 'stop'),
        ]),
      ])
    })

    const engine = new StructuredDebateEngine()
    const result = await engine.execute({
      ...testConfig,
      models: ['openai/gpt-4o'],
    })

    expect(result.method).toBe('llm-merge-structured')
  })
})
