import type { DebateType } from '@/types/debate'
import type { DebateModelResponse } from '../engines/base'
import { getProviderFromModelId, buildModelConfig } from '../engines/base'
import { OpenAIProvider } from '@/lib/llm/openai'
import { AnthropicProvider } from '@/lib/llm/anthropic'
import { GoogleProvider } from '@/lib/llm/google'
import type { LLMProviderAdapter } from '@/lib/llm/provider'
import { getSynthesisSystemPrompt, buildSynthesisUserMessage } from './prompts'

export interface SynthesisOutput {
  content: string
  summary: string
  agreements: string[]
  disagreements: string[]
  conclusion: string
}

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

/**
 * Parse the LLM response as a SynthesisOutput JSON structure.
 * Falls back gracefully if the response isn't valid JSON.
 */
function parseSynthesisResponse(raw: string): SynthesisOutput {
  // Try to extract JSON from the response (may be wrapped in markdown code blocks)
  let jsonStr = raw.trim()

  // Strip markdown code fences if present
  const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(jsonStr)
  if (codeBlockMatch?.[1]) {
    jsonStr = codeBlockMatch[1]
  }

  try {
    const parsed: unknown = JSON.parse(jsonStr)

    if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>

      return {
        content: typeof obj.content === 'string' ? obj.content : raw,
        summary: typeof obj.summary === 'string' ? obj.summary : '',
        agreements: Array.isArray(obj.agreements)
          ? obj.agreements.filter((a): a is string => typeof a === 'string')
          : [],
        disagreements: Array.isArray(obj.disagreements)
          ? obj.disagreements.filter((d): d is string => typeof d === 'string')
          : [],
        conclusion: typeof obj.conclusion === 'string' ? obj.conclusion : '',
      }
    }
  } catch {
    // JSON parse failed — fall back to treating entire response as content
  }

  // Graceful fallback: raw text as content, empty structured fields
  return {
    content: raw,
    summary: '',
    agreements: [],
    disagreements: [],
    conclusion: '',
  }
}

/**
 * Synthesize multiple model responses into a structured analysis.
 *
 * Uses a single LLM call with structured JSON output instructions.
 * The caller decides which model to use for synthesis via config.
 */
export async function synthesizeResponses(
  responses: DebateModelResponse[],
  topic: string,
  debateType: DebateType,
  config: { modelId: string; apiKey: string },
): Promise<SynthesisOutput> {
  const provider = getProviderFromModelId(config.modelId)
  const systemPrompt = getSynthesisSystemPrompt(debateType)
  const modelConfig = buildModelConfig(config.modelId, systemPrompt, config.apiKey)
  const userMessage = buildSynthesisUserMessage(responses, topic)

  const adapter = createProviderAdapter(provider)

  // Collect the full streamed response
  let fullResponse = ''
  for await (const chunk of adapter.streamCompletion(modelConfig, [
    { role: 'user', content: userMessage },
  ])) {
    fullResponse += chunk.delta
  }

  return parseSynthesisResponse(fullResponse)
}
