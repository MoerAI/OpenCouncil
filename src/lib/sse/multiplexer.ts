import type { SSEEventType } from '@/types/api'

const encoder = new TextEncoder()

function formatSSE(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export function createSSEStream(
  sources: Array<{
    eventName: SSEEventType
    generator: AsyncIterable<unknown>
  }>
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const heartbeatInterval = setInterval(() => {
        controller.enqueue(formatSSE('heartbeat', {}))
      }, 15000)

      try {
        await Promise.allSettled(
          sources.map(async ({ eventName, generator }) => {
            try {
              for await (const chunk of generator) {
                controller.enqueue(formatSSE(eventName, chunk))
              }
            } catch (err) {
              controller.enqueue(formatSSE('error', {
                model: eventName.replace('model-', ''),
                code: 'STREAM_ERROR',
                message: err instanceof Error ? err.message : 'Unknown error',
              }))
            }
          })
        )
        controller.enqueue(formatSSE('done', { completed: true }))
      } finally {
        clearInterval(heartbeatInterval)
        controller.close()
      }
    },
  })
}
