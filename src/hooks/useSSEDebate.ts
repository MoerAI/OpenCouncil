'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export interface ModelState {
  content: string
  status: 'idle' | 'streaming' | 'completed' | 'error'
  error?: string
}

export interface DebateSSEState {
  models: Record<string, ModelState>
  synthesis: string | null
  status: 'idle' | 'connecting' | 'streaming' | 'completed' | 'error'
  error: string | null
}

function handleSSEMessage(event: Event): MessageEvent<string> {
  return event as MessageEvent<string>
}

export function useSSEDebate(sessionId: string | null) {
  const [state, setState] = useState<DebateSSEState>({
    models: {},
    synthesis: null,
    status: 'idle',
    error: null,
  })
  const eventSourceRef = useRef<EventSource | null>(null)

  const connect = useCallback((id: string) => {
    eventSourceRef.current?.close()
    setState(prev => ({ ...prev, status: 'connecting' }))

    const es = new EventSource(`/api/debates/stream?sessionId=${id}`)
    eventSourceRef.current = es

    const modelEvents = ['model-openai', 'model-anthropic', 'model-google'] as const
    for (const eventType of modelEvents) {
      es.addEventListener(eventType, ((event: Event) => {
        const msg = handleSSEMessage(event)
        const data = JSON.parse(msg.data) as { model: string; delta: string; finishReason: string | null }
        setState(prev => ({
          ...prev,
          status: 'streaming',
          models: {
            ...prev.models,
            [data.model]: {
              content: (prev.models[data.model]?.content ?? '') + data.delta,
              status: data.finishReason != null ? 'completed' : 'streaming',
            },
          },
        }))
      }) as EventListener)
    }

    es.addEventListener('synthesis', ((event: Event) => {
      const msg = handleSSEMessage(event)
      const data = JSON.parse(msg.data) as { content: string }
      setState(prev => ({ ...prev, synthesis: data.content }))
    }) as EventListener)

    es.addEventListener('done', () => {
      setState(prev => ({ ...prev, status: 'completed' }))
      es.close()
    })

    es.addEventListener('error', ((event: Event) => {
      const msg = event as MessageEvent<string>
      try {
        const data = JSON.parse(msg.data) as { message: string }
        setState(prev => ({ ...prev, error: data.message }))
      } catch {
        // native EventSource error (connection issue)
      }
    }) as EventListener)

    es.onerror = () => {
      setState(prev => ({ ...prev, status: 'error', error: 'Connection lost' }))
      es.close()
    }
  }, [])

  useEffect(() => {
    if (sessionId) connect(sessionId)
    return () => { eventSourceRef.current?.close() }
  }, [sessionId, connect])

  return { state }
}
