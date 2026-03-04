'use client'

interface SynthesisResultProps {
  content: string | null
  isVisible: boolean
}

export default function SynthesisResult({ content, isVisible }: SynthesisResultProps) {
  if (!isVisible || !content) return null

  return (
    <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-6 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-blue-800">
        Synthesis
      </h3>
      <div className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
        {content}
      </div>
    </div>
  )
}
