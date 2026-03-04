import type { DebateType } from '@/types/debate'
import type { DebateModelResponse } from '../engines/base'

const TYPE_EMPHASIS: Record<DebateType, string> = {
  simultaneous:
    'Compare the independent analyses provided by each model. Identify where they converge and diverge despite analyzing the topic independently.',
  round:
    'Trace how the positions of each participant evolved across rounds. Note where arguments strengthened, weakened, or shifted in response to other perspectives.',
  structured:
    'Analyze the strength of the Advocate\'s arguments versus the Opponent\'s counterarguments. Incorporate the Mediator\'s insights to form a balanced view.',
  freeform:
    'Summarize the natural conversation flow between the participants. Identify any emergent consensus, unresolved tensions, and key turning points.',
}

/**
 * Returns the system prompt for the synthesis model, customized by debate type.
 */
export function getSynthesisSystemPrompt(debateType: DebateType): string {
  const emphasis = TYPE_EMPHASIS[debateType]

  return `You are an expert debate synthesizer. Your task is to analyze multiple AI model responses to a debate topic and produce a structured synthesis.

${emphasis}

You MUST respond with a valid JSON object containing these fields:
{
  "summary": "A 2-3 sentence executive summary of the discussion",
  "agreements": ["Key point of agreement 1", "Key point of agreement 2", ...],
  "disagreements": ["Key point of disagreement 1", "Key point of disagreement 2", ...],
  "conclusion": "A balanced final conclusion that weighs all perspectives",
  "content": "The full detailed synthesis text covering all major points discussed"
}

Rules:
- Respond in the same language as the topic
- Be objective and balanced — do not favor any single model's perspective
- The "agreements" and "disagreements" arrays should each contain 2-5 concise points
- The "content" field should be a comprehensive analysis (3-5 paragraphs)
- Output ONLY the JSON object, no additional text`
}

/**
 * Builds the user message containing all model responses for synthesis.
 */
export function buildSynthesisUserMessage(
  responses: DebateModelResponse[],
  topic: string,
): string {
  const parts = responses
    .filter((r) => !r.error && r.content.length > 0)
    .map((r) => {
      const label = r.role ? `[${r.role}]` : ''
      const roundInfo = r.round !== null ? ` (Round ${r.round})` : ''
      return `### ${r.model} ${label}${roundInfo}\n${r.content}`
    })

  return `## Topic\n${topic}\n\n## Model Responses\n\n${parts.join('\n\n---\n\n')}`
}
