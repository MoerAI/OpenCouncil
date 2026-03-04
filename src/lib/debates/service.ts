import { eq, desc } from 'drizzle-orm'
import { db } from '@/db'
import { debates, debateResponses, debateSyntheses } from '@/db/schema'
import type { DebateType, DebateStatus } from '@/types/debate'

export async function createDebate(userId: string, topic: string, type: DebateType, models: string[]) {
  const [debate] = await db.insert(debates).values({
    userId,
    topic,
    type,
    models: JSON.stringify(models),
  }).returning()
  return debate!
}

export async function getDebate(debateId: string) {
  const [debate] = await db.select().from(debates).where(eq(debates.id, debateId)).limit(1)
  return debate ?? null
}

export async function listDebates(userId: string) {
  return db.select().from(debates).where(eq(debates.userId, userId)).orderBy(desc(debates.createdAt))
}

export async function updateDebateStatus(debateId: string, status: DebateStatus) {
  await db.update(debates).set({
    status,
    ...(status === 'completed' || status === 'failed' || status === 'partial' ? { completedAt: new Date() } : {}),
  }).where(eq(debates.id, debateId))
}

export async function saveDebateResponse(
  debateId: string, model: string, content: string,
  opts?: { role?: string; round?: number; tokenCount?: number; latencyMs?: number }
) {
  await db.insert(debateResponses).values({
    debateId,
    model,
    content,
    role: opts?.role ?? null,
    round: opts?.round ?? null,
    tokenCount: opts?.tokenCount ?? null,
    latencyMs: opts?.latencyMs ?? null,
  })
}

export async function saveSynthesis(debateId: string, content: string, method: string) {
  await db.insert(debateSyntheses).values({ debateId, content, method })
}

export async function getDebateResponses(debateId: string) {
  return db.select().from(debateResponses).where(eq(debateResponses.debateId, debateId))
}

export async function getDebateSynthesis(debateId: string) {
  const [synthesis] = await db.select().from(debateSyntheses).where(eq(debateSyntheses.debateId, debateId)).limit(1)
  return synthesis ?? null
}
