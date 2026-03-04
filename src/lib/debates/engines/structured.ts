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

const STRUCTURED_ROLES = [
  {
    name: 'Advocate',
    description: 'You argue IN FAVOR of the topic. Present the strongest possible case for it.',
  },
  {
    name: 'Opponent',
    description: 'You argue AGAINST the topic. Present the strongest possible case against it.',
  },
  {
    name: 'Mediator',
    description: 'You take a NEUTRAL position. Analyze both sides objectively and identify nuances.',
  },
] as const

function buildRoleSystemPrompt(role: (typeof STRUCTURED_ROLES)[number]): string {
  return `You are the ${role.name} in a structured multi-AI council debate.
${role.description}

Respond to the topic based on the evidence provided. Be thorough but concise.
Respond in the same language as the topic.`
}

function buildCrossExaminationSystemPrompt(role: (typeof STRUCTURED_ROLES)[number]): string {
  return `Review the following arguments and provide your cross-examination from your role as ${role.name}.
${role.description}

Challenge weak points, reinforce strong ones, and advance the debate.
Respond in the same language as the topic.`
}

const SYNTHESIS_SYSTEM_PROMPT =
  'Synthesize the debate between Advocate, Opponent, and Mediator. Analyze the strength of each position and form a balanced conclusion. Respond in the same language as the input.'

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

export class StructuredDebateEngine implements DebateEngine {
  async execute(config: DebateEngineConfig): Promise<DebateEngineResult> {
    // 1. Retrieve RAG context once
    const ragContext = await retrieveContext(config.topic)

    const allResponses: DebateModelResponse[] = []

    // Phase 1: Role Assignment (implicit — roles assigned by index)
    // Phase 2: Arguments — fan-out with role-specific prompts
    const phase2StartTime = Date.now()
    const argumentConfigs = config.models.map((modelId, index) => {
      const role = STRUCTURED_ROLES[index % STRUCTURED_ROLES.length]!
      const systemPrompt = buildRoleSystemPrompt(role)
      const provider = getProviderFromModelId(modelId)
      const apiKey = config.apiKeys[provider]
      if (!apiKey) {
        throw new Error(`No API key provided for provider "${provider}"`)
      }
      return buildModelConfig(modelId, systemPrompt, apiKey)
    })

    const userMessage = `Topic: ${config.topic}\n\n${ragContext.contextText}`
    const messages = [{ role: 'user', content: userMessage }]

    const argumentResults = await fanOutModels(
      argumentConfigs,
      messages,
      (modelId: string) => {
        const provider = getProviderFromModelId(modelId)
        return createProviderAdapter(provider)
      },
    )

    const phase2EndTime = Date.now()
    const argumentResponses: DebateModelResponse[] = argumentResults.map((result, index) => {
      const roleName = STRUCTURED_ROLES[index % STRUCTURED_ROLES.length]!.name
      const latencyMs = phase2EndTime - phase2StartTime

      if (result.error) {
        return {
          model: result.model,
          content: '',
          role: roleName,
          round: 2,
          tokenCount: 0,
          latencyMs,
          error: result.error,
        }
      }

      return {
        model: result.model,
        content: result.content,
        role: roleName,
        round: 2,
        tokenCount: estimateTokenCount(result.chunks, result.content),
        latencyMs,
      }
    })

    allResponses.push(...argumentResponses)

    // Phase 3: Cross-examination — each model responds to the OTHER two models' arguments
    const phase3StartTime = Date.now()
    const crossExamConfigs = config.models.map((modelId, index) => {
      const role = STRUCTURED_ROLES[index % STRUCTURED_ROLES.length]!
      const systemPrompt = buildCrossExaminationSystemPrompt(role)
      const provider = getProviderFromModelId(modelId)
      const apiKey = config.apiKeys[provider]
      if (!apiKey) {
        throw new Error(`No API key provided for provider "${provider}"`)
      }
      return buildModelConfig(modelId, systemPrompt, apiKey)
    })

    const crossExamResults = await fanOutModels(
      crossExamConfigs,
      // Placeholder — overridden per-model via adapter
      [{ role: 'user', content: '' }],
      (modelId: string) => {
        const provider = getProviderFromModelId(modelId)
        const baseAdapter = createProviderAdapter(provider)

        // Build per-model context: other models' arguments (shuffled for bias prevention)
        const otherArguments = argumentResponses.filter(
          (r) => r.model !== modelId && !r.error,
        )
        const shuffled = shuffleArray(otherArguments)
        const argumentsSummary = shuffled
          .map((r) => `[${r.role}] (${r.model}):\n${r.content}`)
          .join('\n\n---\n\n')

        const crossExamMessage = `Topic: ${config.topic}\n\n${ragContext.contextText}\n\nArguments from other participants:\n\n${argumentsSummary}`

        return {
          name: baseAdapter.name,
          validateKey: (key: string) => baseAdapter.validateKey(key),
          streamCompletion: (cfg: Parameters<typeof baseAdapter.streamCompletion>[0]) =>
            baseAdapter.streamCompletion(cfg, [
              { role: 'user', content: crossExamMessage },
            ]),
        } satisfies LLMProviderAdapter
      },
    )

    const phase3EndTime = Date.now()
    const crossExamResponses: DebateModelResponse[] = crossExamResults.map((result, index) => {
      const roleName = STRUCTURED_ROLES[index % STRUCTURED_ROLES.length]!.name
      const latencyMs = phase3EndTime - phase3StartTime

      if (result.error) {
        return {
          model: result.model,
          content: '',
          role: roleName,
          round: 3,
          tokenCount: 0,
          latencyMs,
          error: result.error,
        }
      }

      return {
        model: result.model,
        content: result.content,
        role: roleName,
        round: 3,
        tokenCount: estimateTokenCount(result.chunks, result.content),
        latencyMs,
      }
    })

    allResponses.push(...crossExamResponses)

    // Phase 4: Consensus synthesis
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
        .map((r) => `[Phase ${r.round} - ${r.role}] (${r.model}):\n${r.content}`)
        .join('\n\n---\n\n')

      const synthesisMessage = `Topic: ${config.topic}\n\nThe following is a structured debate between Advocate, Opponent, and Mediator:\n\n${responseSummary}`

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
      method: 'llm-merge-structured',
    }
  }
}
