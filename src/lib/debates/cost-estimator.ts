import type { DebateType } from '@/types/debate'
import { getModelInfo } from '@/lib/llm/registry'

export interface CostEstimate {
  minCost: number  // USD
  maxCost: number  // USD
  breakdown: Array<{
    model: string
    inputTokens: number
    outputTokens: number
    cost: number
  }>
}

/**
 * Estimated token budgets per model for each debate type.
 */
const TOKEN_BUDGETS: Record<DebateType, { inputTokens: number; outputTokens: number }> = {
  simultaneous: { inputTokens: 10_000, outputTokens: 2_000 },
  round:        { inputTokens: 30_000, outputTokens: 6_000 },
  structured:   { inputTokens: 40_000, outputTokens: 8_000 },
  freeform:     { inputTokens: 25_000, outputTokens: 5_000 },
}

/** Variance factor for min/max range (±30%) */
const VARIANCE = 0.3

/**
 * Estimate the cost of a debate before it runs.
 *
 * Uses MODEL_REGISTRY pricing (inputPricePerMToken / outputPricePerMToken)
 * and estimated token budgets per debate type.
 *
 * Returns a min/max range applying ±30% variance.
 */
export function estimateDebateCost(
  models: string[],
  debateType: DebateType,
): CostEstimate {
  const budget = TOKEN_BUDGETS[debateType]

  const breakdown = models.map((modelId) => {
    const info = getModelInfo(modelId)

    // Default to zero pricing if model isn't in registry
    const inputPricePerToken = info ? info.inputPricePerMToken / 1_000_000 : 0
    const outputPricePerToken = info ? info.outputPricePerMToken / 1_000_000 : 0

    const inputCost = budget.inputTokens * inputPricePerToken
    const outputCost = budget.outputTokens * outputPricePerToken
    const cost = inputCost + outputCost

    return {
      model: modelId,
      inputTokens: budget.inputTokens,
      outputTokens: budget.outputTokens,
      cost,
    }
  })

  const totalCost = breakdown.reduce((sum, entry) => sum + entry.cost, 0)
  const minCost = totalCost * (1 - VARIANCE)
  const maxCost = totalCost * (1 + VARIANCE)

  return {
    minCost: Math.round(minCost * 1_000_000) / 1_000_000, // round to 6 decimal places
    maxCost: Math.round(maxCost * 1_000_000) / 1_000_000,
    breakdown,
  }
}
