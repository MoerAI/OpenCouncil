import type { DebateStatus } from '@/types/debate'

export type DebateErrorCode =
  | 'AUTH_ERROR'
  | 'RATE_LIMIT'
  | 'OVERLOAD'
  | 'CONTENT_POLICY'
  | 'TIMEOUT'
  | 'UNKNOWN'

export interface ClassifiedError {
  code: DebateErrorCode
  message: string
  model: string
  retryable: boolean
}

/**
 * Classify an error from an LLM provider into a known error category.
 */
export function classifyError(error: unknown, model: string): ClassifiedError {
  // Extract status and message from various error shapes
  let status: number | undefined
  let message = 'Unknown error'

  if (error instanceof Error) {
    message = error.message

    // Try to extract status from common error patterns
    const statusMatch = /\b(401|403|429|503|529)\b/.exec(message)
    if (statusMatch) {
      status = Number(statusMatch[1])
    }

    // Check for status property on error objects
    if ('status' in error && typeof (error as Record<string, unknown>).status === 'number') {
      status = (error as Record<string, unknown>).status as number
    }
  } else if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>
    if (typeof errObj.status === 'number') {
      status = errObj.status
    }
    if (typeof errObj.message === 'string') {
      message = errObj.message
    }
  } else if (typeof error === 'string') {
    message = error
  }

  // Classify by status code
  if (status === 401 || status === 403) {
    return { code: 'AUTH_ERROR', message, model, retryable: false }
  }

  if (status === 429) {
    return { code: 'RATE_LIMIT', message, model, retryable: true }
  }

  if (status === 529 || status === 503) {
    return { code: 'OVERLOAD', message, model, retryable: true }
  }

  // Classify by message content
  const lowerMessage = message.toLowerCase()

  if (
    lowerMessage.includes('content policy') ||
    lowerMessage.includes('content_policy') ||
    lowerMessage.includes('content filter') ||
    lowerMessage.includes('safety') ||
    lowerMessage.includes('moderation')
  ) {
    return { code: 'CONTENT_POLICY', message, model, retryable: false }
  }

  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out') ||
    lowerMessage.includes('deadline exceeded') ||
    lowerMessage.includes('econnreset') ||
    lowerMessage.includes('etimedout')
  ) {
    return { code: 'TIMEOUT', message, model, retryable: true }
  }

  if (
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('invalid api key') ||
    lowerMessage.includes('authentication')
  ) {
    return { code: 'AUTH_ERROR', message, model, retryable: false }
  }

  if (
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('rate_limit') ||
    lowerMessage.includes('too many requests')
  ) {
    return { code: 'RATE_LIMIT', message, model, retryable: true }
  }

  if (
    lowerMessage.includes('overloaded') ||
    lowerMessage.includes('service unavailable') ||
    lowerMessage.includes('capacity')
  ) {
    return { code: 'OVERLOAD', message, model, retryable: true }
  }

  return { code: 'UNKNOWN', message, model, retryable: false }
}

/**
 * Determine the overall debate status based on individual model errors.
 */
export function determineDebateStatus(
  errors: ClassifiedError[],
  totalModels: number,
): DebateStatus {
  if (errors.length === 0) {
    return 'completed'
  }
  if (errors.length < totalModels) {
    return 'partial'
  }
  return 'failed'
}

/**
 * Retry a function with exponential backoff.
 * Only retries if the caught error is classified as retryable.
 * Backoff schedule: 1s, 2s, 4s (max 3 retries by default).
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // On the last attempt, don't retry
      if (attempt === maxRetries) {
        break
      }

      // Only retry retryable errors
      const classified = classifyError(error, 'unknown')
      if (!classified.retryable) {
        break
      }

      // Exponential backoff: 1000ms, 2000ms, 4000ms
      const delayMs = 1000 * Math.pow(2, attempt)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}
