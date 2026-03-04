import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'

const apiKeySchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google']),
  apiKey: z.string().min(1, 'API key is required'),
})

const deleteKeySchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google']),
})

export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // TODO: listAPIKeys(userId) from key-service
  return NextResponse.json([])
}

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as unknown
  const parsed = apiKeySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // TODO: storeAPIKey(userId, parsed.data.provider, parsed.data.apiKey) from key-service
  return NextResponse.json({ success: true }, { status: 201 })
}

export async function DELETE(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as unknown
  const parsed = deleteKeySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // TODO: deleteAPIKey(userId, parsed.data.provider) from key-service
  return NextResponse.json({ success: true })
}
