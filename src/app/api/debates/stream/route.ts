import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { getDebate, updateDebateStatus, saveDebateResponse, saveSynthesis } from '@/lib/debates/service'
import { getAPIKey } from '@/lib/crypto/key-service'
import { SimultaneousDebateEngine } from '@/lib/debates/engines/simultaneous'
import { RoundBasedDebateEngine } from '@/lib/debates/engines/round-based'
import { StructuredDebateEngine } from '@/lib/debates/engines/structured'
import { FreeformDebateEngine } from '@/lib/debates/engines/freeform'
import { type DebateEngine, getProviderFromModelId } from '@/lib/debates/engines/base'
import type { DebateType } from '@/types/debate'
import type { SSEEventType } from '@/types/api'

function createEngine(type: DebateType): DebateEngine {
  switch (type) {
    case 'simultaneous': return new SimultaneousDebateEngine()
    case 'round':        return new RoundBasedDebateEngine()
    case 'structured':   return new StructuredDebateEngine()
    case 'freeform':     return new FreeformDebateEngine()
    default: {
      const _exhaustive: never = type
      throw new Error(`Unknown debate type: ${_exhaustive}`)
    }
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 800

const encoder = new TextEncoder()

function formatSSE(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export async function GET(request: NextRequest) {
  // 1. Auth check
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2. Validate debateId query param
  const debateId = request.nextUrl.searchParams.get('debateId')
  if (!debateId) {
    return new Response(JSON.stringify({ error: 'Missing debateId parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 3. Look up debate from DB
  const debate = await getDebate(debateId)
  if (!debate) {
    return new Response(JSON.stringify({ error: 'Debate not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 4. Ownership check
  if (debate.userId !== userId) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 5. Parse models from debate
  const models = JSON.parse(debate.models) as string[]

  // 6. Get API keys for each unique provider
  const providers = [...new Set(models.map(getProviderFromModelId))]
  const apiKeys: Record<string, string> = {}

  for (const provider of providers) {
    const key = await getAPIKey(userId, provider)
    if (!key) {
      return new Response(
        JSON.stringify({ error: `No API key found for provider "${provider}"` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }
    apiKeys[provider] = key
  }

  // 7. Extract debate data for closure capture (avoids TS null-narrowing loss in async generators)
  const id: string = debateId
  const topic = debate.topic
  const debateType = debate.type as DebateType

  // 8. Update debate status to streaming
  await updateDebateStatus(id, 'streaming')

  // 9. Create async generator that runs engine and yields SSE events
  async function* debateEventGenerator(): AsyncGenerator<{
    event: SSEEventType
    data: unknown
  }> {
    const engine = createEngine(debateType)

    const result = await engine.execute({
      debateId: id,
      topic,
      models,
      apiKeys,
    })

    // Yield model response events (one per model)
    for (const response of result.responses) {
      const provider = getProviderFromModelId(response.model)
      const eventName = `model-${provider}` as SSEEventType

      yield {
        event: eventName,
        data: {
          model: response.model,
          provider,
          delta: response.content,
          finishReason: response.error ? 'error' : 'stop',
          role: response.role,
          tokenCount: response.tokenCount,
          latencyMs: response.latencyMs,
          error: response.error ?? null,
        },
      }

      // Save to DB (skip errored responses)
      if (!response.error) {
        await saveDebateResponse(id, response.model, response.content, {
          role: response.role ?? undefined,
          round: response.round ?? undefined,
          tokenCount: response.tokenCount,
          latencyMs: response.latencyMs,
        })
      }
    }

    // Yield synthesis event
    if (result.synthesis) {
      yield {
        event: 'synthesis' as SSEEventType,
        data: {
          content: result.synthesis,
          method: result.method,
        },
      }

      await saveSynthesis(id, result.synthesis, result.method)
    }

    // Update status to completed
    await updateDebateStatus(id, 'completed')
  }

  // 10. Build SSE stream
  // We create a single source that yields all events through a unified generator,
  // then wrap each event's data with its proper event name via createSSEStream.
  // Since createSSEStream assigns a single eventName per source but we have multiple
  // event types, we build a custom ReadableStream that uses the multiplexer's heartbeat pattern.

  try {
    const stream = buildDebateStream(debateEventGenerator())

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    await updateDebateStatus(id, 'failed')
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

/**
 * Builds a ReadableStream that consumes the debate event generator,
 * emitting properly-typed SSE events with a 15-second heartbeat.
 */
function buildDebateStream(
  events: AsyncGenerator<{ event: SSEEventType; data: unknown }>
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const heartbeatInterval = setInterval(() => {
        controller.enqueue(formatSSE('heartbeat', {}))
      }, 15000)

      try {
        for await (const { event, data } of events) {
          controller.enqueue(formatSSE(event, data))
        }
        controller.enqueue(formatSSE('done', { completed: true }))
      } catch (err) {
        controller.enqueue(formatSSE('error', {
          code: 'ENGINE_ERROR',
          message: err instanceof Error ? err.message : 'Unknown engine error',
        }))
      } finally {
        clearInterval(heartbeatInterval)
        controller.close()
      }
    },
  })
}
