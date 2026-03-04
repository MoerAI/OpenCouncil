import type { SearchSource, RAGContext } from '@/types/rag'

const MAX_CONTEXT_CHARS = 16000 // ~4000 tokens

export function buildContextFromSources(
  sources: SearchSource[],
  query: string,
): RAGContext {
  let contextText = '<evidence>\n'
  let totalChars = 0
  const usedSources: SearchSource[] = []

  // Sort by score descending
  const sorted = [...sources].sort((a, b) => b.score - a.score)

  for (const source of sorted) {
    const block = `[Source: ${source.title}](${source.url})\n${source.content}\n\n`
    if (totalChars + block.length > MAX_CONTEXT_CHARS) break
    contextText += block
    totalChars += block.length
    usedSources.push(source)
  }

  contextText += '</evidence>'

  return {
    query,
    sources: usedSources,
    contextText,
    tokenCount: Math.ceil(totalChars / 4), // rough estimate
  }
}
