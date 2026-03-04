'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { SynthesisSSEData, ErrorSSEData } from '@/types/api'

export interface ModelState {
  content: string
  status: 'idle' | 'streaming' | 'completed' | 'error'
  error?: string
  role?: string
  tokenCount?: number
  latencyMs?: number
}

export interface DebateSSEState {
  models: Record<string, ModelState>
  synthesis: SynthesisSSEData | null
  status: 'idle' | 'connecting' | 'streaming' | 'completed' | 'error'
  error: string | null
}

const MODEL_EVENT_PREFIXES = ['model-openai', 'model-anthropic', 'model-google'] as const

const INITIAL_STATE: DebateSSEState = {
  models: {},
  synthesis: null,
  status: 'idle',
  error: null,
}

function handleSSEMessage(event: Event): MessageEvent<string> {
  return event as MessageEvent<string>
}

export function useSSEDebate(debateId: string | null) {
  const [state, setState] = useState<DebateSSEState>(INITIAL_STATE)
  const eventSourceRef = useRef<EventSource | null>(null)

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  const connect = useCallback((id: string) => {
    disconnect()
    setState(prev => ({ ...prev, status: 'connecting', error: null }))

    const es = new EventSource(`/api/debates/stream?debateId=${id}`)
    eventSourceRef.current = es

    // Handle model events dynamically for all providers
    for (const eventType of MODEL_EVENT_PREFIXES) {
      es.addEventListener(eventType, ((event: Event) => {
        const msg = handleSSEMessage(event)
        const data = JSON.parse(msg.data) as {
          model: string
          provider: string
          delta: string
          finishReason: string | null
          role?: string
          tokenCount?: number
          latencyMs?: number
          error?: string | null
        }

        setState(prev => {
          const existing = prev.models[data.model]
          const isCompleted = data.finishReason != null
          const hasError = data.finishReason === 'error' || data.error != null

          return {
            ...prev,
            status: 'streaming',
            models: {
              ...prev.models,
              [data.model]: {
                content: (existing?.content ?? '') + data.delta,
                status: hasError ? 'error' : isCompleted ? 'completed' : 'streaming',
                error: data.error ?? existing?.error,
                role: data.role ?? existing?.role,
                tokenCount: data.tokenCount ?? existing?.tokenCount,
                latencyMs: data.latencyMs ?? existing?.latencyMs,
              },
            },
          }
        })
      }) as EventListener)
    }

    // Handle synthesis event
    es.addEventListener('synthesis', ((event: Event) => {
      const msg = handleSSEMessage(event)
      const data = JSON.parse(msg.data) as SynthesisSSEData & { method?: string }
      setState(prev => ({
        ...prev,
        synthesis: {
          content: data.content,
          summary: data.summary ?? '',
          agreements: data.agreements ?? [],
          disagreements: data.disagreements ?? [],
          conclusion: data.conclusion ?? '',
        },
      }))
    }) as EventListener)

    // Handle round-start event (for future debate types)
    es.addEventListener('round-start', ((event: Event) => {
      const msg = handleSSEMessage(event)
      JSON.parse(msg.data) as { round: number }
      // Reserved for round-based debate types
    }) as EventListener)

    // Handle phase-start event (for future debate types)
    es.addEventListener('phase-start', ((event: Event) => {
      const msg = handleSSEMessage(event)
      JSON.parse(msg.data) as { phase: string }
      // Reserved for structured debate types
    }) as EventListener)

    // Handle done event
    es.addEventListener('done', () => {
      setState(prev => ({ ...prev, status: 'completed' }))
      es.close()
    })

    // Handle SSE error events (sent by server)
    es.addEventListener('error', ((event: Event) => {
      const msg = event as MessageEvent<string>
      try {
        const data = JSON.parse(msg.data) as ErrorSSEData
        setState(prev => ({
          ...prev,
          status: 'error',
          error: data.message,
        }))
        es.close()
      } catch {
        // Native EventSource error (connection issue), handled by onerror
      }
    }) as EventListener)

    // Handle native connection errors
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setState(prev => {
          // Only set error if we weren't already completed
          if (prev.status === 'completed') return prev
          return { ...prev, status: 'error', error: 'Connection lost' }
        })
      }
    }
  }, [disconnect])

  useEffect(() => {
    if (debateId) {
      connect(debateId)
    } else {
      setState(INITIAL_STATE)
    }
    return () => { disconnect() }
  }, [debateId, connect, disconnect])

  return { state, disconnect }
}
