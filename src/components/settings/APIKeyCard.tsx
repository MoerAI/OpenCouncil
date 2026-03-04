'use client'

import { useState } from 'react'

interface APIKeyCardProps {
  provider: string
  label: string
  placeholder: string
  existingHint?: string
  onSave: (key: string) => Promise<void>
  onDelete: () => Promise<void>
}

export default function APIKeyCard({
  provider,
  label,
  placeholder,
  existingHint,
  onSave,
  onDelete,
}: APIKeyCardProps) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!apiKey.trim()) return
    setSaving(true)
    setError('')
    try {
      await onSave(apiKey.trim())
      setApiKey('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError('')
    try {
      await onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      data-testid={`key-card-${provider}`}
      className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        {existingHint && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
            Active
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}

      {existingHint ? (
        <div className="mt-3 flex items-center justify-between">
          <code className="text-sm text-gray-500">{existingHint}</code>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={placeholder}
            className="block flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !apiKey.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
