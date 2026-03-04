export interface UserAPIKey {
  id: string
  provider: string
  hint: string
  isActive: boolean
  createdAt: Date
  lastUsedAt: Date | null
}

export interface EncryptedKey {
  encryptedKey: string
  iv: string
  salt: string
}

export interface APIKeyHint {
  provider: string
  hint: string      // last 4 chars visible, rest masked: 'sk-...4x9z'
  isActive: boolean
}
