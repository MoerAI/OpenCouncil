import { describe, test, expect, beforeEach, mock } from 'bun:test'
import type { ModelConfig } from '@/types/llm'
import type { DebateModelResponse } from '../../engines/base'

// ── Mock state ──────────────────────────────────────────────────────────────
let mockStreamCompletion: ReturnType<typeof mock>

function makeAsyncIterable(deltas: string[]) {
  return async function* () {
    for (const delta of deltas) {
      yield { model: 'openai/gpt-4o', provider: 'openai' as const, delta, finishReason: null }
    }
  }
}

// ── Mock modules before import ──────────────────────────────────────────────
mockStreamCompletion = mock(() => makeAsyncIterable(['default'])())

mock.module('@/lib/llm/openai', () => ({
  OpenAIProvider: class {
    readonly name = 'openai'
    streamCompletion(_config: ModelConfig, _messages: Array<{ role: string; content: string }>) {
      return mockStreamCompletion(_config, _messages)
    }
    async validateKey() {
      return true
    }
  },
}))

mock.module('@/lib/llm/anthropic', () => ({
  AnthropicProvider: class {
    readonly name = 'anthropic'
    streamCompletion(_config: ModelConfig, _messages: Array<{ role: string; content: string }>) {
      return mockStreamCompletion(_config, _messages)
    }
    async validateKey() {
      return true
    }
  },
}))

mock.module('@/lib/llm/google', () => ({
  GoogleProvider: class {
    readonly name = 'google'
    streamCompletion(_config: ModelConfig, _messages: Array<{ role: string; content: string }>) {
      return mockStreamCompletion(_config, _messages)
    }
    async validateKey() {
      return true
    }
  },
}))

// Import AFTER mocks are set up
const { synthesizeResponses } = await import('../merge')
const { getSynthesisSystemPrompt } = await import('../prompts')

// ── Test data ────────────────────────────────────────────────────────────────
const testResponses: DebateModelResponse[] = [
  {
    model: 'openai/gpt-4o',
    content: 'AI regulation is necessary to prevent harm while fostering innovation.',
    role: 'Analyst',
    round: null,
    tokenCount: 50,
    latencyMs: 1200,
  },
  {
    model: 'anthropic/claude-sonnet-4-20250514',
    content: 'Over-regulation could stifle technological progress and competitive advantage.',
    role: 'Critic',
    round: null,
    tokenCount: 45,
    latencyMs: 1100,
  },
  {
    model: 'google/gemini-2.0-flash',
    content: 'A balanced framework with industry self-regulation and government oversight works best.',
    role: 'Pragmatist',
    round: null,
    tokenCount: 55,
    latencyMs: 900,
  },
]

const testConfig = {
  modelId: 'openai/gpt-4o',
  apiKey: 'sk-test-key',
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('synthesizeResponses', () => {
  beforeEach(() => {
    mockStreamCompletion.mockReset()
  })

  test('synthesizes simultaneous debate responses', async () => {
    const synthesisJson = JSON.stringify({
      content: 'All three models discussed AI regulation from different angles.',
      summary: 'The debate covered regulation necessity, innovation risks, and balanced approaches.',
      agreements: ['AI governance is important', 'Innovation should be preserved'],
      disagreements: ['Degree of government involvement', 'Self-regulation effectiveness'],
      conclusion: 'A balanced regulatory framework that protects while enabling innovation is optimal.',
    })

    mockStreamCompletion.mockImplementation(() => makeAsyncIterable([synthesisJson])())

    const result = await synthesizeResponses(
      testResponses,
      'Should AI be regulated?',
      'simultaneous',
      testConfig,
    )

    expect(result.content).toBe('All three models discussed AI regulation from different angles.')
    expect(result.summary).toBe('The debate covered regulation necessity, innovation risks, and balanced approaches.')
    expect(result.agreements).toHaveLength(2)
    expect(result.disagreements).toHaveLength(2)
    expect(result.conclusion).toContain('balanced regulatory framework')
  })

  test('synthesizes structured debate with role analysis', async () => {
    const structuredResponses: DebateModelResponse[] = [
      {
        model: 'openai/gpt-4o',
        content: 'As advocate: regulation protects consumers and sets standards.',
        role: 'Advocate',
        round: null,
        tokenCount: 60,
        latencyMs: 1300,
      },
      {
        model: 'anthropic/claude-sonnet-4-20250514',
        content: 'As opponent: regulation creates barriers and slows progress.',
        role: 'Opponent',
        round: null,
        tokenCount: 55,
        latencyMs: 1200,
      },
      {
        model: 'google/gemini-2.0-flash',
        content: 'As mediator: both sides have merit, a tiered approach works best.',
        role: 'Mediator',
        round: null,
        tokenCount: 50,
        latencyMs: 1000,
      },
    ]

    const synthesisJson = JSON.stringify({
      content: 'The Advocate presented strong consumer protection arguments while the Opponent highlighted innovation risks. The Mediator proposed a tiered approach.',
      summary: 'A structured debate with clear advocate, opponent, and mediator roles.',
      agreements: ['Consumer safety matters', 'Innovation should continue'],
      disagreements: ['Regulation scope', 'Implementation timeline'],
      conclusion: 'The Mediator\'s tiered approach received implicit support from both sides.',
    })

    mockStreamCompletion.mockImplementation(() => makeAsyncIterable([synthesisJson])())

    const result = await synthesizeResponses(
      structuredResponses,
      'Should AI be regulated?',
      'structured',
      testConfig,
    )

    expect(result.content).toContain('Advocate')
    expect(result.content).toContain('Opponent')
    expect(result.summary).toContain('structured debate')
    expect(result.agreements.length).toBeGreaterThan(0)
    expect(result.disagreements.length).toBeGreaterThan(0)
    expect(result.conclusion).not.toBe('')
  })

  test('handles JSON parse failure gracefully', async () => {
    const rawText = 'This is not JSON. It is just plain text analysis of the debate responses covering multiple perspectives.'

    mockStreamCompletion.mockImplementation(() => makeAsyncIterable([rawText])())

    const result = await synthesizeResponses(
      testResponses,
      'Should AI be regulated?',
      'simultaneous',
      testConfig,
    )

    // Falls back to raw content
    expect(result.content).toBe(rawText)
    expect(result.summary).toBe('')
    expect(result.agreements).toEqual([])
    expect(result.disagreements).toEqual([])
    expect(result.conclusion).toBe('')
  })

  test('uses correct prompt for each debate type', () => {
    const simultaneousPrompt = getSynthesisSystemPrompt('simultaneous')
    expect(simultaneousPrompt).toContain('independent analyses')

    const roundPrompt = getSynthesisSystemPrompt('round')
    expect(roundPrompt).toContain('evolved across rounds')

    const structuredPrompt = getSynthesisSystemPrompt('structured')
    expect(structuredPrompt).toContain('Advocate')
    expect(structuredPrompt).toContain('Opponent')
    expect(structuredPrompt).toContain('Mediator')

    const freeformPrompt = getSynthesisSystemPrompt('freeform')
    expect(freeformPrompt).toContain('natural conversation flow')
    expect(freeformPrompt).toContain('emergent consensus')
  })
})
