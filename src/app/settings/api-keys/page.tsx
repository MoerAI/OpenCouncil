'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import APIKeyCard from '@/components/settings/APIKeyCard'
import type { APIKeyResponse } from '@/types/api'

const PROVIDERS = [
  {
    provider: 'openai',
    label: 'OpenAI',
    placeholder: 'sk-...',
  },
  {
    provider: 'anthropic',
    label: 'Anthropic',
    placeholder: 'sk-ant-...',
  },
  {
    provider: 'google',
    label: 'Google',
    placeholder: 'AIza...',
  },
] as const

export default function APIKeysPage() {
  const [keys, setKeys] = useState<APIKeyResponse[]>([])
  const [loading, setLoading] = useState(true)

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/keys')
      if (res.ok) {
        const data = (await res.json()) as APIKeyResponse[]
        setKeys(data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchKeys()
  }, [fetchKeys])

  async function handleSave(provider: string, apiKey: string) {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey }),
    })
    if (!res.ok) {
      throw new Error('Failed to save API key')
    }
    await fetchKeys()
  }

  async function handleDelete(provider: string) {
    const res = await fetch('/api/keys', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    })
    if (!res.ok) {
      throw new Error('Failed to delete API key')
    }
    await fetchKeys()
  }

  function getHint(provider: string): string | undefined {
    const key = keys.find((k) => k.provider === provider)
    return key?.isActive ? key.hint : undefined
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="mt-1 text-sm text-gray-600">
            Add your API keys to enable AI models
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4">
            {PROVIDERS.map((p) => (
              <APIKeyCard
                key={p.provider}
                provider={p.provider}
                label={p.label}
                placeholder={p.placeholder}
                existingHint={getHint(p.provider)}
                onSave={(apiKey) => handleSave(p.provider, apiKey)}
                onDelete={() => handleDelete(p.provider)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
