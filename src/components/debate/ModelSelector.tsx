'use client'

import { MODEL_REGISTRY } from '@/lib/llm/registry'
import type { LLMProvider } from '@/types/llm'

interface ModelSelectorProps {
  selected: string[]
  onChange: (ids: string[]) => void
}

const PROVIDER_COLORS: Record<LLMProvider, string> = {
  openai: '#10a37f',
  anthropic: '#d4a574',
  google: '#4285f4',
}

function getPriceTier(inputPrice: number, outputPrice: number): string {
  const avg = (inputPrice + outputPrice) / 2
  if (avg < 1) return '$'
  if (avg < 5) return '$$'
  return '$$$'
}

export default function ModelSelector({ selected, onChange }: ModelSelectorProps) {
  function toggleModel(modelId: string) {
    if (selected.includes(modelId)) {
      onChange(selected.filter((id) => id !== modelId))
    } else {
      if (selected.length >= 5) return
      onChange([...selected, modelId])
    }
  }

  return (
    <div data-testid="model-selector">
      <label className="mb-2 block text-sm font-medium text-gray-700">
        Select Models (2-5)
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODEL_REGISTRY.map((model) => {
          const isSelected = selected.includes(model.id)
          const providerColor = PROVIDER_COLORS[model.provider]
          const priceTier = getPriceTier(model.inputPricePerMToken, model.outputPricePerMToken)

          return (
            <button
              key={model.id}
              type="button"
              onClick={() => toggleModel(model.id)}
              className={`relative rounded-lg border-2 p-4 text-left transition-colors ${
                isSelected
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: providerColor }}
                    />
                    <span className="text-sm font-semibold text-gray-900">
                      {model.name}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 capitalize">
                    {model.provider}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-400">
                    {priceTier}
                  </span>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 pointer-events-none"
                  />
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {selected.length > 0 && selected.length < 2 && (
        <p className="mt-2 text-xs text-amber-600">
          Select at least 2 models to start a debate
        </p>
      )}
    </div>
  )
}
