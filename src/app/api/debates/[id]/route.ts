import { NextResponse } from 'next/server'
import { getDebate, getDebateResponses, getDebateSynthesis } from '@/lib/debates/service'
import { auth } from '@/auth'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const debate = await getDebate(id)
  if (!debate) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (debate.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const responses = await getDebateResponses(id)
  const synthesis = await getDebateSynthesis(id)

  return NextResponse.json({ ...debate, responses, synthesis })
}
