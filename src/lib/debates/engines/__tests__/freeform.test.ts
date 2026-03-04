import { describe, test, expect, beforeEach, mock } from 'bun:test'
import type { StreamChunk, ModelConfig } from '@/types/llm'
import type { RAGContext } from '@/types/rag'

// ── Mock state ──────────────────────────────────────────────────────────────
let mockRetrieveContext: ReturnType<typeof mock>
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

// ── Mock modules before import ──────────────────────────────────────────────
mockRetrieveContext = mock(() => Promise.resolve(defaultRAGContext))
mockStreamCompletion = mock(async function* () {
  yield makeChunk('openai/gpt-4o', 'openai', 'A response.', 'stop')
})

mock.module('@/lib/rag/pipeline', () => ({
  retrieveContext: (...args: unknown[]) => mockRetrieveContext(...args),
}))

// Freeform doesn't use fanOutModels, but mock it to prevent imports from failing
mock.module('@/lib/llm/fan-out', () => ({
  fanOutModels: () => Promise.resolve([]),
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
const { FreeformDebateEngine } = await import('../freeform')

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

describe('FreeformDebateEngine', () => {
  let turnCount: number

  beforeEach(() => {
    mockRetrieveContext.mockReset()
    mockStreamCompletion.mockReset()
    turnCount = 0

    mockRetrieveContext.mockImplementation(() => Promise.resolve(defaultRAGContext))

    mockStreamCompletion.mockImplementation(async function* (config: ModelConfig) {
      turnCount++
      yield makeChunk(
        config.modelId,
        'openai',
        `Turn ${turnCount} response from ${config.modelId}.`,
        'stop',
        { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
      )
    })
  })

  test('completes 5 turns of conversation', async () => {
    const engine = new FreeformDebateEngine()
    const result = await engine.execute(testConfig)

    // 5 turns of conversation
    expect(result.responses).toHaveLength(5)

    // Verify round numbers (turn numbers)
    for (let i = 0; i < 5; i++) {
      expect(result.responses[i]!.round).toBe(i + 1)
    }

    // Synthesis generated
    expect(result.synthesis).toBeTruthy()
  })

  test('each model speaks at least once', async () => {
    const engine = new FreeformDebateEngine()
    const result = await engine.execute(testConfig)

    // With 3 models and 5 turns, each model should speak at least once
    const modelsThatSpoke = new Set(result.responses.map((r) => r.model))
    expect(modelsThatSpoke.size).toBe(3)

    for (const model of testConfig.models) {
      expect(modelsThatSpoke.has(model)).toBe(true)
    }
  })

  test('includes conversation history in later turns', async () => {
    const capturedMessages: Array<{ config: ModelConfig; messages: Array<{ role: string; content: string }> }> = []

    mockStreamCompletion.mockImplementation(async function* (config: ModelConfig, messages: Array<{ role: string; content: string }>) {
      turnCount++
      capturedMessages.push({ config, messages })
      yield makeChunk(
        config.modelId,
        'openai',
        `Turn ${turnCount} unique content from ${config.modelId}.`,
        'stop',
      )
    })

    const engine = new FreeformDebateEngine()
    await engine.execute(testConfig)

    // streamCompletion called 5 times (turns) + 1 time (synthesis) = 6 total
    expect(capturedMessages.length).toBe(6)

    // First turn: no conversation history
    const turn1Message = capturedMessages[0]!.messages[0]!.content
    expect(turn1Message).not.toContain('Conversation so far')

    // Later turns should include conversation history
    const turn3Message = capturedMessages[2]!.messages[0]!.content
    expect(turn3Message).toContain('Conversation so far')
    // Should contain content from previous turns
    expect(turn3Message).toContain('Turn 1 unique content')
    expect(turn3Message).toContain('Turn 2 unique content')
  })

  test('returns method llm-merge-freeform', async () => {
    const engine = new FreeformDebateEngine()
    const result = await engine.execute(testConfig)

    expect(result.method).toBe('llm-merge-freeform')
  })
})
