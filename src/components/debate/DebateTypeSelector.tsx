'use client'

import type { DebateType } from '@/types/debate'

interface DebateTypeSelectorProps {
  value: DebateType
  onChange: (type: DebateType) => void
}

const DEBATE_TYPES: { type: DebateType; label: string; description: string }[] = [
  {
    type: 'simultaneous',
    label: 'Simultaneous',
    description: 'All models respond at the same time',
  },
  {
    type: 'round',
    label: 'Round Robin',
    description: 'Models take turns responding in rounds',
  },
  {
    type: 'structured',
    label: 'Structured',
    description: 'Models are assigned roles (for, against, neutral)',
  },
  {
    type: 'freeform',
    label: 'Freeform',
    description: 'Open-ended multi-turn conversation',
  },
]

export default function DebateTypeSelector({ value, onChange }: DebateTypeSelectorProps) {
  return (
    <div data-testid="type-selector">
      <label className="mb-2 block text-sm font-medium text-gray-700">
        Debate Type
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DEBATE_TYPES.map((dt) => (
          <button
            key={dt.type}
            type="button"
            onClick={() => onChange(dt.type)}
            className={`rounded-lg border-2 p-4 text-left transition-colors ${
              value === dt.type
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <div
                className={`h-3 w-3 rounded-full border-2 ${
                  value === dt.type
                    ? 'border-blue-600 bg-blue-600'
                    : 'border-gray-300'
                }`}
              >
                {value === dt.type && (
                  <div className="mx-auto mt-0.5 h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </div>
              <span className="text-sm font-semibold text-gray-900">
                {dt.label}
              </span>
            </div>
            <p className="mt-1 pl-5 text-xs text-gray-500">
              {dt.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
