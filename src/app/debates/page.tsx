'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import DebateListItem from '@/components/debate/DebateListItem'

interface DebateListEntry {
  id: string
  topic: string
  type: string
  status: string
  models: string
  createdAt: string
  completedAt: string | null
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="h-4 w-3/4 rounded bg-gray-200" />
        <div className="h-5 w-16 shrink-0 rounded-full bg-gray-200" />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-4 w-20 rounded bg-gray-200" />
        <div className="h-4 w-16 rounded bg-gray-200" />
        <div className="ml-auto h-4 w-28 rounded bg-gray-200" />
      </div>
    </div>
  )
}

export default function DebatesPage() {
  const [debates, setDebates] = useState<DebateListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchDebates() {
      try {
        const res = await fetch('/api/debates')
        if (!res.ok) {
          throw new Error('Failed to load debates')
        }
        const data = (await res.json()) as DebateListEntry[]
        // Sort newest first
        data.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        setDebates(data)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load debates'
        )
      } finally {
        setLoading(false)
      }
    }
    void fetchDebates()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Debate History</h1>
          <Link
            href="/debates/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
          >
            New Debate
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!loading && !error && debates.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="mb-4 text-sm text-gray-500">No debates yet</p>
            <Link
              href="/debates/new"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
            >
              Start your first debate
            </Link>
          </div>
        )}

        {!loading && debates.length > 0 && (
          <div data-testid="debate-list" className="space-y-3">
            {debates.map((debate) => (
              <DebateListItem
                key={debate.id}
                id={debate.id}
                topic={debate.topic}
                type={debate.type}
                status={debate.status}
                models={debate.models}
                createdAt={debate.createdAt}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
