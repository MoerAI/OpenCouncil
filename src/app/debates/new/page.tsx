'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import ModelSelector from '@/components/debate/ModelSelector'
import DebateTypeSelector from '@/components/debate/DebateTypeSelector'
import { MODEL_REGISTRY } from '@/lib/llm/registry'
import type { DebateType } from '@/types/debate'
import type { APIKeyResponse, CreateDebateResponse } from '@/types/api'

export default function NewDebatePage() {
  const router = useRouter()

  const [topic, setTopic] = useState('')
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [debateType, setDebateType] = useState<DebateType>('simultaneous')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeProviders, setActiveProviders] = useState<Set<string>>(new Set())
  const [keysLoaded, setKeysLoaded] = useState(false)

  useEffect(() => {
    async function fetchKeys() {
      try {
        const res = await fetch('/api/keys')
        if (res.ok) {
          const keys = (await res.json()) as APIKeyResponse[]
          const providers = new Set(
            keys.filter((k) => k.isActive).map((k) => k.provider)
          )
          setActiveProviders(providers)
        }
      } finally {
        setKeysLoaded(true)
      }
    }
    void fetchKeys()
  }, [])

  // Check if selected models have missing API keys
  const missingProviders = keysLoaded
    ? Array.from(
        new Set(
          selectedModels
            .map((id) => MODEL_REGISTRY.find((m) => m.id === id)?.provider)
            .filter((p) => p != null && !activeProviders.has(p))
        )
      )
    : []

  const canSubmit =
    topic.trim().length >= 10 &&
    selectedModels.length >= 2 &&
    selectedModels.length <= 5 &&
    !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/debates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          type: debateType,
          models: selectedModels,
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error: string }
        throw new Error(data.error ?? 'Failed to create debate')
      }

      const data = (await res.json()) as CreateDebateResponse
      router.push(`/debates/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create debate')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">New Debate</h1>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
          {/* Topic */}
          <div>
            <label
              htmlFor="topic"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Topic
            </label>
            <textarea
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What should the AI council debate?"
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {topic.length > 0 && topic.trim().length < 10 && (
              <p className="mt-1 text-xs text-amber-600">
                Topic must be at least 10 characters
              </p>
            )}
          </div>

          {/* Model Selector */}
          <ModelSelector selected={selectedModels} onChange={setSelectedModels} />

          {/* Missing keys warning */}
          {missingProviders.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              Missing API keys for: {missingProviders.join(', ')}. Add them in{' '}
              <a href="/settings/api-keys" className="font-semibold underline">
                Settings
              </a>
              .
            </div>
          )}

          {/* Debate Type */}
          <DebateTypeSelector value={debateType} onChange={setDebateType} />

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Starting Debate...' : 'Start Debate'}
          </button>
        </form>
      </main>
    </div>
  )
}
