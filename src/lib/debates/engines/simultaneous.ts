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

function buildRoleSystemPrompt(role: (typeof ROLES)[number]): string {
  return `You are a ${role.name} in a multi-AI council debate. Your perspective:
${role.description}

Respond to the topic based on the evidence provided. Be thorough but concise.
Respond in the same language as the topic.`
}

const SYNTHESIS_SYSTEM_PROMPT =
  'You are synthesizing multiple AI perspectives into a coherent summary. Identify key agreements, disagreements, and form a balanced conclusion. Respond in the same language as the input.'

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
  // Find the last chunk with usage info
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i]
    if (chunk?.usage) {
      return chunk.usage.completionTokens
    }
  }
  // Fallback: estimate from content length
  return Math.ceil(content.length / 4)
}

export class SimultaneousDebateEngine implements DebateEngine {
  async execute(config: DebateEngineConfig): Promise<DebateEngineResult> {
    // 1. Retrieve RAG context once
    const ragContext = await retrieveContext(config.topic)

    // 2. Build configs for each model with distinct role perspectives
    const modelConfigs = config.models.map((modelId, index) => {
      const role = ROLES[index % ROLES.length]!
      const systemPrompt = buildRoleSystemPrompt(role)
      const provider = getProviderFromModelId(modelId)
      const apiKey = config.apiKeys[provider]
      if (!apiKey) {
        throw new Error(`No API key provided for provider "${provider}"`)
      }
      return buildModelConfig(modelId, systemPrompt, apiKey)
    })

    // 3. Build user message
    const userMessage = `Topic: ${config.topic}\n\n${ragContext.contextText}`
    const messages = [{ role: 'user', content: userMessage }]

    // 4. Fan out to all models simultaneously, tracking latency per model
    const startTimes = new Map<string, number>()
    const endTimes = new Map<string, number>()

    for (const mc of modelConfigs) {
      startTimes.set(mc.modelId, Date.now())
    }

    const fanOutResults = await fanOutModels(
      modelConfigs,
      messages,
      (modelId: string) => {
        startTimes.set(modelId, Date.now())
        const provider = getProviderFromModelId(modelId)
        return createProviderAdapter(provider)
      },
    )

    const now = Date.now()
    for (const mc of modelConfigs) {
      if (!endTimes.has(mc.modelId)) {
        endTimes.set(mc.modelId, now)
      }
    }

    // 5. Build responses with role assignments
    const responses: DebateModelResponse[] = fanOutResults.map((result, index) => {
      const role = ROLES[index % ROLES.length]!
      const startTime = startTimes.get(result.model) ?? now
      const latencyMs = now - startTime

      if (result.error) {
        return {
          model: result.model,
          content: '',
          role: role.name,
          round: null,
          tokenCount: 0,
          latencyMs,
          error: result.error,
        }
      }

      return {
        model: result.model,
        content: result.content,
        role: role.name,
        round: null,
        tokenCount: estimateTokenCount(result.chunks, result.content),
        latencyMs,
      }
    })

    // 6. Generate synthesis using the first non-errored model
    const successfulResponses = responses.filter((r) => !r.error)
    let synthesis = ''

    if (successfulResponses.length > 0) {
      // Find the first successful model to use for synthesis
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

      // Build user message with all responses labeled by role
      const responseSummary = successfulResponses
        .map((r) => `[${r.role}] (${r.model}):\n${r.content}`)
        .join('\n\n---\n\n')

      const synthesisMessage = `Topic: ${config.topic}\n\nThe following are independent analyses from multiple AI perspectives:\n\n${responseSummary}`

      // Use provider adapter directly to collect the full response
      const adapter = createProviderAdapter(mergeProvider)
      for await (const chunk of adapter.streamCompletion(mergeConfig, [
        { role: 'user', content: synthesisMessage },
      ])) {
        synthesis += chunk.delta
      }
    }

    // 7. Return result
    return {
      responses,
      synthesis,
      method: 'llm-merge-simultaneous',
    }
  }
}
