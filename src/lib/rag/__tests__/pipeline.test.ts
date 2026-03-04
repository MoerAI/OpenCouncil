import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchWeb } from '../search'
import { buildContextFromSources } from '../context-builder'
import { retrieveContext } from '../pipeline'
import type { SearchSource } from '@/types/rag'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeSources(count: number, contentLength = 100): SearchSource[] {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://example.com/article-${i}`,
    title: `Article ${i}`,
    content: 'x'.repeat(contentLength),
    score: 0.9 - i * 0.1,
  }))
}

function tavilyResponse(
  results: Array<{
    url: string
    title: string
    content: string
    score: number
  }>,
) {
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('searchWeb', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, TAVILY_API_KEY: 'test-key' }
    mockFetch.mockReset()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns empty sources when TAVILY_API_KEY is not set', async () => {
    delete process.env.TAVILY_API_KEY
    const result = await searchWeb('test query')
    expect(result.sources).toEqual([])
    expect(result.query).toBe('test query')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns parsed sources on successful search', async () => {
    const sources = makeSources(3)
    mockFetch.mockResolvedValueOnce(tavilyResponse(sources))

    const result = await searchWeb('climate change debate')
    expect(result.sources).toHaveLength(3)
    expect(result.sources[0]!.url).toBe('https://example.com/article-0')
    expect(result.query).toBe('climate change debate')
  })

  it('returns empty sources when Tavily returns error status', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 }))

    const result = await searchWeb('test query')
    expect(result.sources).toEqual([])
    expect(result.query).toBe('test query')
  })

  it('returns empty sources when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await searchWeb('test query')
    expect(result.sources).toEqual([])
    expect(result.query).toBe('test query')
  })

  it('handles empty results array gracefully', async () => {
    mockFetch.mockResolvedValueOnce(tavilyResponse([]))

    const result = await searchWeb('obscure query')
    expect(result.sources).toEqual([])
  })
})

describe('buildContextFromSources', () => {
  it('assembles context with evidence tags', () => {
    const sources = makeSources(2, 50)
    const ctx = buildContextFromSources(sources, 'test topic')

    expect(ctx.contextText).toContain('<evidence>')
    expect(ctx.contextText).toContain('</evidence>')
    expect(ctx.contextText).toContain('Article 0')
    expect(ctx.contextText).toContain('Article 1')
    expect(ctx.query).toBe('test topic')
    expect(ctx.sources).toHaveLength(2)
  })

  it('sorts sources by score descending', () => {
    const sources: SearchSource[] = [
      { url: 'https://a.com', title: 'Low', content: 'low content', score: 0.3 },
      { url: 'https://b.com', title: 'High', content: 'high content', score: 0.9 },
      { url: 'https://c.com', title: 'Mid', content: 'mid content', score: 0.6 },
    ]

    const ctx = buildContextFromSources(sources, 'test')
    const highIdx = ctx.contextText.indexOf('High')
    const midIdx = ctx.contextText.indexOf('Mid')
    const lowIdx = ctx.contextText.indexOf('Low')

    expect(highIdx).toBeLessThan(midIdx)
    expect(midIdx).toBeLessThan(lowIdx)
  })

  it('respects MAX_CONTEXT_CHARS limit', () => {
    // Each source block: "[Source: Article N](https://example.com/article-N)\n" + content + "\n\n"
    // With 5000 char content, each block ~5060 chars. 4 sources = ~20240 chars > 16000 limit
    const sources = makeSources(4, 5000)
    const ctx = buildContextFromSources(sources, 'test')

    // Should include fewer than 4 sources due to char limit
    expect(ctx.sources.length).toBeLessThan(4)
    // Context text (excluding tags) should be within limit
    const innerText = ctx.contextText
      .replace('<evidence>\n', '')
      .replace('</evidence>', '')
    expect(innerText.length).toBeLessThanOrEqual(16000 + 100) // small buffer for tag overhead
  })

  it('returns empty context for no sources', () => {
    const ctx = buildContextFromSources([], 'test')
    expect(ctx.sources).toEqual([])
    expect(ctx.contextText).toBe('<evidence>\n</evidence>')
    expect(ctx.tokenCount).toBe(0)
  })

  it('estimates token count', () => {
    const sources = makeSources(1, 400)
    const ctx = buildContextFromSources(sources, 'test')
    // tokenCount should be roughly totalChars / 4
    expect(ctx.tokenCount).toBeGreaterThan(0)
    expect(ctx.tokenCount).toBeLessThan(500) // 400 chars content + overhead ~= 120 tokens
  })
})

describe('retrieveContext (pipeline)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, TAVILY_API_KEY: 'test-key' }
    mockFetch.mockReset()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns assembled context from search results', async () => {
    const sources = makeSources(3)
    mockFetch.mockResolvedValueOnce(tavilyResponse(sources))

    const ctx = await retrieveContext('AI regulation debate')
    expect(ctx.query).toBe('AI regulation debate')
    expect(ctx.sources.length).toBeGreaterThan(0)
    expect(ctx.contextText).toContain('<evidence>')
    expect(ctx.contextText).toContain('</evidence>')
    expect(ctx.tokenCount).toBeGreaterThan(0)
  })

  it('returns empty context when search fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'))

    const ctx = await retrieveContext('some topic')
    expect(ctx.sources).toEqual([])
    expect(ctx.contextText).toBe('<evidence>\n</evidence>')
  })

  it('returns empty context when no API key', async () => {
    delete process.env.TAVILY_API_KEY

    const ctx = await retrieveContext('some topic')
    expect(ctx.sources).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
