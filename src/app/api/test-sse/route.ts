export const dynamic = 'force-dynamic'
export const maxDuration = 800

import { createSSEStream } from '@/lib/sse/multiplexer'

async function* mockStream(modelId: string, words: string[]) {
  for (const word of words) {
    await new Promise<void>(resolve => setTimeout(resolve, 80))
    yield { model: modelId, delta: word + ' ', finishReason: null }
  }
  yield { model: modelId, delta: '', finishReason: 'stop' }
}

export async function GET() {
  const stream = createSSEStream([
    { eventName: 'model-openai', generator: mockStream('openai/gpt-4o', ['OpenAI', 'says', 'hello']) },
    { eventName: 'model-anthropic', generator: mockStream('anthropic/claude-3.5-sonnet', ['Claude', 'agrees']) },
    { eventName: 'model-google', generator: mockStream('google/gemini-2.0-flash', ['Gemini', 'responds']) },
  ])

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
