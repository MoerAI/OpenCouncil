import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { listAPIKeys, storeAPIKey, deleteAPIKey } from '@/lib/crypto/key-service'
import type { LLMProvider } from '@/types/llm'

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

  try {
    const keys = await listAPIKeys(userId)
    return NextResponse.json(keys)
  } catch {
    return NextResponse.json({ error: 'Failed to list API keys' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as unknown
  const parsed = apiKeySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    await storeAPIKey(userId, parsed.data.provider as LLMProvider, parsed.data.apiKey)
    return NextResponse.json({ success: true }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to store API key' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as unknown
  const parsed = deleteKeySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    await deleteAPIKey(userId, parsed.data.provider as LLMProvider)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 })
  }
}
