import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import type { EncryptedKey } from '@/types/auth'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const SALT_LENGTH = 32
const IV_LENGTH = 16
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1

function getMasterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY environment variable is not set')
  return key
}

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
}

export function encryptAPIKey(plaintext: string): EncryptedKey {
  const masterKey = getMasterKey()
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)
  const derivedKey = deriveKey(masterKey, salt)

  const cipher = createCipheriv(ALGORITHM, derivedKey, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    encryptedKey: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('base64'),
    salt: salt.toString('base64'),
  }
}

export function decryptAPIKey(encryptedData: EncryptedKey): string {
  const masterKey = getMasterKey()
  const salt = Buffer.from(encryptedData.salt, 'base64')
  const iv = Buffer.from(encryptedData.iv, 'base64')
  const combined = Buffer.from(encryptedData.encryptedKey, 'base64')

  const authTag = combined.subarray(combined.length - 16)
  const encrypted = combined.subarray(0, combined.length - 16)

  const derivedKey = deriveKey(masterKey, salt)
  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv)
  decipher.setAuthTag(authTag)

  return decipher.update(encrypted) + decipher.final('utf8')
}

export function generateKeyHint(apiKey: string): string {
  if (apiKey.length <= 4) return '****'
  return apiKey.slice(0, 3) + '...' + apiKey.slice(-4)
}
