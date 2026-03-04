import type { RAGContext } from '@/types/rag'
import { searchWeb } from './search'
import { buildContextFromSources } from './context-builder'

export async function retrieveContext(topic: string): Promise<RAGContext> {
  const searchResult = await searchWeb(topic)
  return buildContextFromSources(searchResult.sources, topic)
}
