export interface SearchSource {
  url: string
  title: string
  content: string
  score: number
}

export interface SearchResult {
  sources: SearchSource[]
  query: string
}

export interface RetrievedChunk {
  content: string
  source: string
  similarity: number
}

export interface RAGContext {
  query: string
  sources: SearchSource[]
  contextText: string   // assembled context string for injection into prompts
  tokenCount: number    // estimated tokens (≤4000)
}
