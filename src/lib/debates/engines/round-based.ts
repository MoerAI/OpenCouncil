import type { StreamChunk } from '@/types/llm'
import type { LLMProviderAdapter } from '@/lib/llm/provider'
import { fanOutModels } from '@/lib/llm/fan-out'
import { retrieveContext } from '@/lib/rag/pipeline'
import { OpenAIProvider } from '@/lib/llm/openai'
import { AnthropicProvider } from '@/lib/llm/anthropic'
import { GoogleProvider } from '@/lib/llm/google'
import {
  type DebateEngine,
  type DebateEngineConfig,
  type DebateEngineResult,
  type DebateModelResponse,
  getProviderFromModelId,
  buildModelConfig,
  shuffleArray,
} from './base'

const ROLES = [
  {
    name: 'Analyst',
    description: 'Data-driven, evidence-focused analysis',
  },
  {
    name: 'Critic',
    description: 'Critical thinking, identifying weaknesses and risks',
  },
  {
    name: 'Pragmatist',
    description: 'Practical solutions and real-world applicability',
  },
] as const

function buildRound1SystemPrompt(role: (typeof ROLES)[number]): string {
  return `You are a ${role.name} in a multi-AI council debate. Your perspective:
${role.description}

Respond to the topic based on the evidence provided. Be thorough but concise.
Respond in the same language as the topic.`
}

function buildFollowUpSystemPrompt(round: number): string {
  return `You are continuing a multi-AI council debate (Round ${round}). Review the other perspectives and refine, challenge, or build upon them.
Respond in the same language as the topic.`
}

const SYNTHESIS_SYSTEM_PROMPT =
  'You are synthesizing multiple rounds of a multi-AI council debate into a coherent summary. Identify how positions evolved, key agreements, disagreements, and form a balanced conclusion. Respond in the same language as the input.'

function createProviderAdapter(provider: string): LLMProviderAdapter {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider()
    case 'anthropic':
      return new AnthropicProvider()
    case 'google':
      return new GoogleProvider()
    default:
      throw new Error(`Unsupported provider: "${provider}"`)
  }
}

function estimateTokenCount(chunks: StreamChunk[], content: string): number {
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i]
    if (chunk?.usage) {
      return chunk.usage.completionTokens
    }
  }
  return Math.ceil(content.length / 4)
}

const MAX_ROUNDS = 5

export class RoundBasedDebateEngine implements DebateEngine {
  async execute(config: DebateEngineConfig): Promise<DebateEngineResult> {
    const maxRounds = Math.min(3, MAX_ROUNDS)

    // 1. Retrieve RAG context once
    const ragContext = await retrieveContext(config.topic)

    const allResponses: DebateModelResponse[] = []

    // Per-round accumulated responses for building context
    const roundResponses: Array<DebateModelResponse[]> = []

    for (let round = 1; round <= maxRounds; round++) {
      const startTime = Date.now()

      if (round === 1) {
        // Round 1: each model gets a unique role, no prior context
        const modelConfigs = config.models.map((modelId, index) => {
          const role = ROLES[index % ROLES.length]!
          const systemPrompt = buildRound1SystemPrompt(role)
          const provider = getProviderFromModelId(modelId)
          const apiKey = config.apiKeys[provider]
          if (!apiKey) {
            throw new Error(`No API key provided for provider "${provider}"`)
          }
          return buildModelConfig(modelId, systemPrompt, apiKey)
        })

        const userMessage = `Topic: ${config.topic}\n\n${ragContext.contextText}`
        const messages = [{ role: 'user', content: userMessage }]

        const fanOutResults = await fanOutModels(
          modelConfigs,
          messages,
          (modelId: string) => {
            const provider = getProviderFromModelId(modelId)
            return createProviderAdapter(provider)
          },
        )

        const now = Date.now()
        const responses: DebateModelResponse[] = fanOutResults.map((result, index) => {
          const roleName = ROLES[index % ROLES.length]!.name
          const latencyMs = now - startTime

          if (result.error) {
            return {
              model: result.model,
              content: '',
              role: roleName,
              round: 1,
              tokenCount: 0,
              latencyMs,
              error: result.error,
            }
          }

          return {
            model: result.model,
            content: result.content,
            role: roleName,
            round: 1,
            tokenCount: estimateTokenCount(result.chunks, result.content),
            latencyMs,
          }
        })

        roundResponses.push(responses)
        allResponses.push(...responses)
      } else {
        // Rounds 2+: each model sees OTHER models' previous round responses (shuffled)
        const previousRound = roundResponses[round - 2]!
        const systemPrompt = buildFollowUpSystemPrompt(round)

        const modelConfigs = config.models.map((modelId) => {
          const provider = getProviderFromModelId(modelId)
          const apiKey = config.apiKeys[provider]
          if (!apiKey) {
            throw new Error(`No API key provided for provider "${provider}"`)
          }
          return buildModelConfig(modelId, systemPrompt, apiKey)
        })

        // Build per-model messages with shuffled other responses
        // We use fanOutModels but need per-model messages, so we call individually
        const fanOutResults = await fanOutModels(
          modelConfigs,
          // Placeholder — overridden by per-model adapter message injection
          [{ role: 'user', content: '' }],
          (modelId: string) => {
            const provider = getProviderFromModelId(modelId)
            const baseAdapter = createProviderAdapter(provider)

            // Build custom user message for this model
            const otherResponses = previousRound.filter(
              (r) => r.model !== modelId && !r.error,
            )
            const shuffled = shuffleArray(otherResponses)
            const responseSummary = shuffled
              .map((r) => `[${r.role}] (${r.model}):\n${r.content}`)
              .join('\n\n---\n\n')

            const userMessage = `Topic: ${config.topic}\n\n${ragContext.contextText}\n\nPrevious round responses:\n\n${responseSummary}`

            // Wrap adapter to inject correct messages
            return {
              name: baseAdapter.name,
              validateKey: (key: string) => baseAdapter.validateKey(key),
              streamCompletion: (cfg: Parameters<typeof baseAdapter.streamCompletion>[0]) =>
                baseAdapter.streamCompletion(cfg, [
                  { role: 'user', content: userMessage },
                ]),
            } satisfies LLMProviderAdapter
          },
        )

        const now = Date.now()
        const responses: DebateModelResponse[] = fanOutResults.map((result, index) => {
          const roleName = ROLES[index % ROLES.length]!.name
          const latencyMs = now - startTime

          if (result.error) {
            return {
              model: result.model,
              content: '',
              role: roleName,
              round,
              tokenCount: 0,
              latencyMs,
              error: result.error,
            }
          }

          return {
            model: result.model,
            content: result.content,
            role: roleName,
            round,
            tokenCount: estimateTokenCount(result.chunks, result.content),
            latencyMs,
          }
        })

        roundResponses.push(responses)
        allResponses.push(...responses)
      }
    }

    // Generate synthesis
    const successfulResponses = allResponses.filter((r) => !r.error)
    let synthesis = ''

    if (successfulResponses.length > 0) {
      const mergeModelId = successfulResponses[0]!.model
      const mergeProvider = getProviderFromModelId(mergeModelId)
      const mergeApiKey = config.apiKeys[mergeProvider]
      if (!mergeApiKey) {
        throw new Error(`No API key for synthesis provider "${mergeProvider}"`)
      }

      const mergeConfig = buildModelConfig(
        mergeModelId,
        SYNTHESIS_SYSTEM_PROMPT,
        mergeApiKey,
      )

      const responseSummary = successfulResponses
        .map((r) => `[Round ${r.round} - ${r.role}] (${r.model}):\n${r.content}`)
        .join('\n\n---\n\n')

      const synthesisMessage = `Topic: ${config.topic}\n\nThe following are multiple rounds of debate from a multi-AI council:\n\n${responseSummary}`

      const adapter = createProviderAdapter(mergeProvider)
      for await (const chunk of adapter.streamCompletion(mergeConfig, [
        { role: 'user', content: synthesisMessage },
      ])) {
        synthesis += chunk.delta
      }
    }

    return {
      responses: allResponses,
      synthesis,
      method: 'llm-merge-round-based',
    }
  }
}
