import type { ModelInfo, LLMProvider } from '@/types/llm'

export const MODEL_REGISTRY: ModelInfo[] = [
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    inputPricePerMToken: 2.5,
    outputPricePerMToken: 10.0,
    supportsStreaming: true,
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    inputPricePerMToken: 0.15,
    outputPricePerMToken: 0.6,
    supportsStreaming: true,
  },
  {
    id: 'anthropic/claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200000,
    inputPricePerMToken: 3.0,
    outputPricePerMToken: 15.0,
    supportsStreaming: true,
  },
  {
    id: 'anthropic/claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    contextWindow: 200000,
    inputPricePerMToken: 0.8,
    outputPricePerMToken: 4.0,
    supportsStreaming: true,
  },
  {
    id: 'google/gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    contextWindow: 1048576,
    inputPricePerMToken: 0.075,
    outputPricePerMToken: 0.3,
    supportsStreaming: true,
  },
  {
    id: 'google/gemini-2.5-pro-preview-06-05',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    contextWindow: 1048576,
    inputPricePerMToken: 1.25,
    outputPricePerMToken: 10.0,
    supportsStreaming: true,
  },
]

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find((m) => m.id === modelId)
}

export function getModelsByProvider(provider: LLMProvider): ModelInfo[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider)
}
