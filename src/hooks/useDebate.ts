'use client'

import { useState, useCallback } from 'react'
import { useSSEDebate, type DebateSSEState } from './useSSEDebate'
import type { DebateType } from '@/types/debate'
import type { CreateDebateResponse } from '@/types/api'

export interface UseDebateReturn {
  createAndStream: (topic: string, type: DebateType, models: string[]) => Promise<void>
  state: DebateSSEState
  debateId: string | null
  isCreating: boolean
  error: string | null
}

export function useDebate(): UseDebateReturn {
  const [debateId, setDebateId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { state, disconnect } = useSSEDebate(debateId)

  const createAndStream = useCallback(async (
    topic: string,
    type: DebateType,
    models: string[],
  ) => {
    // Reset state for new debate
    setError(null)
    setIsCreating(true)
    setDebateId(null)

    try {
      // 1. Create debate via POST
      const response = await fetch('/api/debates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, type, models }),
      })

      if (!response.ok) {
        const body = await response.json() as { error?: string }
        throw new Error(body.error ?? `Failed to create debate (${response.status})`)
      }

      const data = await response.json() as CreateDebateResponse

      // 2. Start SSE connection by setting debateId
      // The useSSEDebate hook will auto-connect when debateId changes
      setDebateId(data.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create debate'
      setError(message)
    } finally {
      setIsCreating(false)
    }
  }, [])

  // Combine creation errors with streaming errors
  const combinedError = error ?? state.error

  return {
    createAndStream,
    state,
    debateId,
    isCreating,
    error: combinedError,
  }
}
