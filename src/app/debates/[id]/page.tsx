'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import DebateHeader from '@/components/debate/DebateHeader'
import ModelResponse from '@/components/debate/ModelResponse'
import SynthesisResult from '@/components/debate/SynthesisResult'
import RAGSources from '@/components/debate/RAGSources'
import { useSSEDebate } from '@/hooks/useSSEDebate'
import type { DebateStatus, DebateType } from '@/types/debate'

interface DebateAPIResponse {
  id: string
  topic: string
  type: DebateType
  status: DebateStatus
  models: string[]
  createdAt: string
  completedAt: string | null
  responses: Array<{
    model: string
    content: string
    role: string | null
  }>
  synthesis: {
    content: string
  } | null
}

export default function DebateResultsPage() {
  const params = useParams<{ id: string }>()
  const debateId = params.id

  const [debate, setDebate] = useState<DebateAPIResponse | null>(null)
  const [fetchError, setFetchError] = useState('')
  const [fetchLoading, setFetchLoading] = useState(true)

  // Only connect SSE if debate is pending or streaming
  const shouldStream = debate?.status === 'pending' || debate?.status === 'streaming'
  const { state: sseState } = useSSEDebate(shouldStream ? debateId : null)

  useEffect(() => {
    async function fetchDebate() {
      try {
        const res = await fetch(`/api/debates/${debateId}`)
        if (!res.ok) {
          const data = (await res.json()) as { error: string }
          throw new Error(data.error ?? 'Failed to load debate')
        }
        const data = (await res.json()) as DebateAPIResponse
        setDebate(data)
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Failed to load debate')
      } finally {
        setFetchLoading(false)
      }
    }
    void fetchDebate()
  }, [debateId])

  if (fetchLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        </main>
      </div>
    )
  }

  if (fetchError || !debate) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="rounded-md bg-red-50 p-6 text-center text-sm text-red-700">
            {fetchError || 'Debate not found'}
          </div>
        </main>
      </div>
    )
  }

  // Determine display status: use SSE status if streaming, else API status
  const displayStatus = shouldStream && sseState.status !== 'idle'
    ? sseState.status === 'completed' ? 'completed' : debate.status
    : debate.status

  // Build model responses from SSE (live) or API (static)
  const modelCards = debate.models.map((modelId) => {
    if (shouldStream) {
      const sseModel = sseState.models[modelId]
      return {
        modelId,
        content: sseModel?.content ?? '',
        status: sseModel?.status ?? ('idle' as const),
        role: sseModel?.role,
        error: sseModel?.error,
      }
    }

    // Static: use API response
    const apiResponse = debate.responses.find((r) => r.model === modelId)
    return {
      modelId,
      content: apiResponse?.content ?? '',
      status: 'completed' as const,
      role: apiResponse?.role ?? undefined,
      error: undefined,
    }
  })

  // Synthesis: prefer SSE live data, fallback to API static
  const synthesisContent = shouldStream
    ? sseState.synthesis?.content ?? null
    : debate.synthesis?.content ?? null

  const synthesisVisible = synthesisContent != null

  // Placeholder sources (RAG sources would come from API in future)
  const sources: Array<{ url: string; title: string }> = []

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <DebateHeader
          topic={debate.topic}
          type={debate.type}
          status={displayStatus}
          createdAt={debate.createdAt}
        />

        {/* SSE Error */}
        {sseState.error && (
          <div className="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-700">
            {sseState.error}
          </div>
        )}

        {/* Model Responses Grid */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {modelCards.map((card) => (
            <ModelResponse
              key={card.modelId}
              modelId={card.modelId}
              content={card.content}
              status={card.status}
              role={card.role}
              error={card.error}
            />
          ))}
        </div>

        {/* Synthesis */}
        <div className="mb-8">
          <SynthesisResult
            content={synthesisContent}
            isVisible={synthesisVisible}
          />
        </div>

        {/* RAG Sources */}
        <RAGSources sources={sources} />
      </main>
    </div>
  )
}
