import { NextResponse } from 'next/server'
import { createDebateSchema } from '@/lib/debates/validation'
import { createDebate, listDebates } from '@/lib/debates/service'
import { auth } from '@/auth'

export async function POST(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as unknown
  const parsed = createDebateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { topic, type, models } = parsed.data
  const debate = await createDebate(userId, topic, type, models)

  return NextResponse.json({ id: debate.id, sessionId: debate.id, status: debate.status }, { status: 201 })
}

export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allDebates = await listDebates(userId)
  return NextResponse.json(allDebates)
}
