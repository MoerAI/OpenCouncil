import type { SearchResult, SearchSource } from '@/types/rag'

const TAVILY_API_URL = 'https://api.tavily.com/search'
const EXCLUDED_DOMAINS = ['reddit.com', 'quora.com']

export async function searchWeb(query: string): Promise<SearchResult> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    console.warn('[RAG] TAVILY_API_KEY not set — skipping web search')
    return { sources: [], query }
  }

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: 10,
        exclude_domains: EXCLUDED_DOMAINS,
        include_raw_content: false,
      }),
    })

    if (!response.ok) {
      console.warn(`[RAG] Tavily search failed: ${response.status}`)
      return { sources: [], query }
    }

    const data = (await response.json()) as {
      results: Array<{
        url: string
        title: string
        content: string
        score: number
      }>
    }

    const sources: SearchSource[] = (data.results ?? []).map((r) => ({
      url: r.url,
      title: r.title,
      content: r.content,
      score: r.score,
    }))

    return { sources, query }
  } catch (err) {
    console.warn(
      '[RAG] Tavily search error:',
      err instanceof Error ? err.message : err,
    )
    return { sources: [], query } // Graceful degradation
  }
}
