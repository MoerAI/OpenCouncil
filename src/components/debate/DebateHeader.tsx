'use client'

interface DebateHeaderProps {
  topic: string
  type: string
  status: string
  createdAt?: string
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800'
    case 'streaming':
      return 'bg-blue-100 text-blue-800'
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'failed':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function getStatusDotColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-500'
    case 'streaming':
      return 'bg-blue-500'
    case 'completed':
      return 'bg-green-500'
    case 'failed':
      return 'bg-red-500'
    default:
      return 'bg-gray-500'
  }
}

export default function DebateHeader({ topic, type, status, createdAt }: DebateHeaderProps) {
  const isActive = status === 'pending' || status === 'streaming'

  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-gray-900">{topic}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 capitalize">
          {type}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(status)}`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${getStatusDotColor(status)} ${
              isActive ? 'animate-pulse' : ''
            }`}
          />
          {status}
        </span>
        {createdAt && (
          <span className="text-xs text-gray-500">
            {new Date(createdAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}
