import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { apiKeys } from '@/db/schema'
import { encryptAPIKey, decryptAPIKey, generateKeyHint } from './key-vault'
import type { LLMProvider } from '@/types/llm'
import type { APIKeyHint } from '@/types/auth'

export async function storeAPIKey(userId: string, provider: LLMProvider, plainKey: string): Promise<void> {
  const encrypted = encryptAPIKey(plainKey)
  const hint = generateKeyHint(plainKey)

  // Upsert: delete existing key for this provider, then insert
  await db.delete(apiKeys).where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider)))
  await db.insert(apiKeys).values({
    userId,
    provider,
    encryptedKey: encrypted.encryptedKey,
    keyHint: hint,
    iv: encrypted.iv,
    salt: encrypted.salt,
  })
}

export async function getAPIKey(userId: string, provider: LLMProvider): Promise<string | null> {
  const [key] = await db.select().from(apiKeys).where(
    and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider))
  ).limit(1)

  if (!key) return null

  // Update last used timestamp
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id))

  return decryptAPIKey({
    encryptedKey: key.encryptedKey,
    iv: key.iv,
    salt: key.salt,
  })
}

export async function listAPIKeys(userId: string): Promise<APIKeyHint[]> {
  const keys = await db.select({
    provider: apiKeys.provider,
    keyHint: apiKeys.keyHint,
    isActive: apiKeys.isActive,
  }).from(apiKeys).where(eq(apiKeys.userId, userId))

  return keys.map(k => ({
    provider: k.provider,
    hint: k.keyHint,
    isActive: k.isActive ?? true,
  }))
}

export async function deleteAPIKey(userId: string, provider: LLMProvider): Promise<void> {
  await db.delete(apiKeys).where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider)))
}

export async function hasAPIKey(userId: string, provider: LLMProvider): Promise<boolean> {
  const [key] = await db.select({ id: apiKeys.id }).from(apiKeys).where(
    and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider))
  ).limit(1)
  return key !== undefined
}
