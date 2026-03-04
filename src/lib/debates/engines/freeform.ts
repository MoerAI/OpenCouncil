import type { StreamChunk } from '@/types/llm'
import type { LLMProviderAdapter } from '@/lib/llm/provider'
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

const MAX_TURNS = 5
const ROLLING_WINDOW_CHARS = 12000

const FREEFORM_SYSTEM_PROMPT =
  'You are participating in a free-form multi-AI council discussion. Engage naturally with the conversation — agree, disagree, add new points, or ask questions. Be conversational. Respond in the same language as the topic.'

const SYNTHESIS_SYSTEM_PROMPT =
  'You are synthesizing a free-form multi-AI council discussion into a coherent summary. Identify key themes, agreements, disagreements, and form a balanced conclusion. Respond in the same language as the input.'

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

/**
 * Build a turn order for N turns across M models.
 * Shuffles models, then cycles to fill all turns.
 */
function buildTurnOrder(models: string[], turns: number): string[] {
  const shuffled = shuffleArray(models)
  const order: string[] = []
  for (let i = 0; i < turns; i++) {
    order.push(shuffled[i % shuffled.length]!)
  }
  return order
}

/**
 * Truncate conversation history to fit within rolling window.
 * Removes oldest entries first, keeping most recent.
 */
function truncateHistory(
  history: Array<{ model: string; content: string }>,
): Array<{ model: string; content: string }> {
  let totalChars = 0
  for (const entry of history) {
    totalChars += entry.content.length
  }

  if (totalChars <= ROLLING_WINDOW_CHARS) {
    return history
  }

  // Remove oldest entries until we fit
  const result = [...history]
  let currentChars = totalChars
  while (currentChars > ROLLING_WINDOW_CHARS && result.length > 1) {
    const removed = result.shift()!
    currentChars -= removed.content.length
  }

  return result
}

export class FreeformDebateEngine implements DebateEngine {
  async execute(config: DebateEngineConfig): Promise<DebateEngineResult> {
    // 1. Retrieve RAG context once
    const ragContext = await retrieveContext(config.topic)

    const allResponses: DebateModelResponse[] = []
    const conversationHistory: Array<{ model: string; content: string }> = []

    // 2. Build turn order: randomize which model speaks each turn
    const turnOrder = buildTurnOrder(config.models, MAX_TURNS)

    // 3. Turn-based conversation
    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      const speakerModelId = turnOrder[turn - 1]!
      const startTime = Date.now()

      const provider = getProviderFromModelId(speakerModelId)
      const apiKey = config.apiKeys[provider]
      if (!apiKey) {
        throw new Error(`No API key provided for provider "${provider}"`)
      }

      const modelConfig = buildModelConfig(
        speakerModelId,
        FREEFORM_SYSTEM_PROMPT,
        apiKey,
      )

      // Build user message with conversation history
      const truncatedHistory = truncateHistory(conversationHistory)
      let historyText = ''
      if (truncatedHistory.length > 0) {
        historyText =
          '\n\nConversation so far:\n\n' +
          truncatedHistory
            .map((entry) => `[${entry.model}]:\n${entry.content}`)
            .join('\n\n---\n\n')
      }

      const userMessage = `Topic: ${config.topic}\n\n${ragContext.contextText}${historyText}`

      // Sequential: only ONE model responds per turn
      const adapter = createProviderAdapter(provider)
      const chunks: StreamChunk[] = []
      let content = ''

      for await (const chunk of adapter.streamCompletion(modelConfig, [
        { role: 'user', content: userMessage },
      ])) {
        chunks.push(chunk)
        content += chunk.delta
      }

      const latencyMs = Date.now() - startTime

      const response: DebateModelResponse = {
        model: speakerModelId,
        content,
        role: null,
        round: turn,
        tokenCount: estimateTokenCount(chunks, content),
        latencyMs,
      }

      allResponses.push(response)
      conversationHistory.push({ model: speakerModelId, content })
    }

    // 4. Synthesis
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

      const responseSummary = allResponses
        .map((r) => `[Turn ${r.round} - ${r.model}]:\n${r.content}`)
        .join('\n\n---\n\n')

      const synthesisMessage = `Topic: ${config.topic}\n\nThe following is a free-form discussion between multiple AI models:\n\n${responseSummary}`

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
      method: 'llm-merge-freeform',
    }
  }
}
