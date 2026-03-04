'use client'

import { getModelInfo } from '@/lib/llm/registry'
import type { LLMProvider } from '@/types/llm'

interface ModelResponseProps {
  modelId: string
  content: string
  status: 'idle' | 'streaming' | 'completed' | 'error'
  role?: string
  error?: string
}

const PROVIDER_COLORS: Record<LLMProvider, string> = {
  openai: '#10a37f',
  anthropic: '#d4a574',
  google: '#4285f4',
}

export default function ModelResponse({
  modelId,
  content,
  status,
  role,
  error,
}: ModelResponseProps) {
  const modelInfo = getModelInfo(modelId)
  const modelName = modelInfo?.name ?? modelId
  const provider = modelInfo?.provider ?? 'openai'
  const providerColor = PROVIDER_COLORS[provider as LLMProvider] ?? '#6b7280'

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: providerColor }}
          />
          <span className="text-sm font-semibold text-gray-900">{modelName}</span>
          {role && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {role}
            </span>
          )}
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="p-4">
        {status === 'idle' && (
          <p className="text-sm text-gray-400">Waiting to start...</p>
        )}
        {status === 'error' && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error ?? 'An error occurred'}
          </div>
        )}
        {(status === 'streaming' || status === 'completed') && (
          <div className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
            {content}
            {status === 'streaming' && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-gray-800" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: ModelResponseProps['status'] }) {
  switch (status) {
    case 'idle':
      return (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
          Idle
        </span>
      )
    case 'streaming':
      return (
        <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
          Streaming
        </span>
      )
    case 'completed':
      return (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
          Done
        </span>
      )
    case 'error':
      return (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
          Error
        </span>
      )
  }
}
