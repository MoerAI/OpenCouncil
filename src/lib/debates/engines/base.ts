import type { LLMProvider, ModelConfig } from '@/types/llm'
import { getModelInfo } from '@/lib/llm/registry'

export interface DebateEngineConfig {
  debateId: string
  topic: string
  models: string[] // e.g. ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514', 'google/gemini-2.0-flash']
  apiKeys: Record<string, string> // provider -> decrypted API key
}

export interface DebateEngineResult {
  responses: DebateModelResponse[]
  synthesis: string
  method: string
}

export interface DebateModelResponse {
  model: string
  content: string
  role: string | null
  round: number | null
  tokenCount: number
  latencyMs: number
  error?: string
}

export interface DebateEngine {
  execute(config: DebateEngineConfig): Promise<DebateEngineResult>
}

const MAX_TOKENS_CAP = 4096

/**
 * Extracts the provider name from a model ID.
 * e.g. 'openai/gpt-4o' → 'openai'
 */
export function getProviderFromModelId(modelId: string): LLMProvider {
  const slashIndex = modelId.indexOf('/')
  if (slashIndex === -1) {
    throw new Error(`Invalid model ID format: "${modelId}". Expected "provider/model-name".`)
  }
  const provider = modelId.slice(0, slashIndex)
  const validProviders: LLMProvider[] = ['openai', 'anthropic', 'google']
  if (!validProviders.includes(provider as LLMProvider)) {
    throw new Error(`Unknown provider "${provider}" in model ID "${modelId}".`)
  }
  return provider as LLMProvider
}

/**
 * Builds a ModelConfig for a given model ID.
 * maxTokens is 80% of the model's context window, capped at 4096.
 */
/**
 * Fisher-Yates shuffle — returns a new shuffled copy of the array.
 */
export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = result[i]!
    result[i] = result[j]!
    result[j] = tmp
  }
  return result
}

export function buildModelConfig(
  modelId: string,
  systemPrompt: string,
  apiKey: string,
): ModelConfig {
  const modelInfo = getModelInfo(modelId)
  if (!modelInfo) {
    throw new Error(`Model "${modelId}" not found in registry.`)
  }

  const calculatedMaxTokens = Math.floor(modelInfo.contextWindow * 0.8)
  const maxTokens = Math.min(calculatedMaxTokens, MAX_TOKENS_CAP)

  return {
    modelId,
    systemPrompt,
    maxTokens,
    temperature: 0.7,
    apiKey,
  }
}
