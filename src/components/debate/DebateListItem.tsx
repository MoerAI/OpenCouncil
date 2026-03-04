'use client'

import Link from 'next/link'

interface DebateListItemProps {
  id: string
  topic: string
  type: string
  status: string
  models: string
  createdAt: string
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  completed: {
    label: 'Completed',
    className: 'bg-green-100 text-green-700',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-700',
  },
  partial: {
    label: 'Partial',
    className: 'bg-yellow-100 text-yellow-700',
  },
  streaming: {
    label: 'Streaming',
    className: 'bg-blue-100 text-blue-700 animate-pulse',
  },
  pending: {
    label: 'Pending',
    className: 'bg-gray-100 text-gray-600',
  },
}

const TYPE_LABELS: Record<string, string> = {
  simultaneous: 'Simultaneous',
  round: 'Round-based',
  structured: 'Structured',
  freeform: 'Freeform',
}

function getModelCount(modelsJson: string): number {
  try {
    const parsed: unknown = JSON.parse(modelsJson)
    if (Array.isArray(parsed)) {
      return parsed.length
    }
    return 0
  } catch {
    return 0
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncateTopic(topic: string, maxLength: number = 100): string {
  if (topic.length <= maxLength) return topic
  return topic.slice(0, maxLength) + '…'
}

export default function DebateListItem({
  id,
  topic,
  type,
  status,
  models,
  createdAt,
}: DebateListItemProps) {
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.pending!
  const typeLabel = TYPE_LABELS[type] ?? type
  const modelCount = getModelCount(models)

  return (
    <Link
      href={`/debates/${id}`}
      className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug text-gray-900">
          {truncateTopic(topic)}
        </h3>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle.className}`}
        >
          {statusStyle.label}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
          {typeLabel}
        </span>
        <span>{modelCount} model{modelCount !== 1 ? 's' : ''}</span>
        <span className="ml-auto">{formatDate(createdAt)}</span>
      </div>
    </Link>
  )
}
