import { describe, test, expect, beforeAll } from 'vitest'
import { encryptAPIKey, decryptAPIKey, generateKeyHint } from '../key-vault'

beforeAll(() => {
  // Set test master key
  process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-for-unit-tests-32chars!'
})

describe('key-vault', () => {
  test('encrypt and decrypt round-trip', () => {
    const original = 'sk-test-api-key-12345'
    const encrypted = encryptAPIKey(original)
    const decrypted = decryptAPIKey(encrypted)
    expect(decrypted).toBe(original)
  })

  test('encrypted values differ from original', () => {
    const original = 'sk-test-api-key-12345'
    const encrypted = encryptAPIKey(original)
    expect(encrypted.encryptedKey).not.toBe(original)
    expect(encrypted.iv).toBeTruthy()
    expect(encrypted.salt).toBeTruthy()
  })

  test('different encryptions of same key produce different ciphertexts', () => {
    const original = 'sk-test-api-key-12345'
    const enc1 = encryptAPIKey(original)
    const enc2 = encryptAPIKey(original)
    expect(enc1.encryptedKey).not.toBe(enc2.encryptedKey)
    expect(enc1.iv).not.toBe(enc2.iv)
    expect(enc1.salt).not.toBe(enc2.salt)
  })

  test('wrong master key fails decryption', () => {
    const original = 'sk-test-api-key-12345'
    const encrypted = encryptAPIKey(original)

    // Change master key
    process.env.ENCRYPTION_MASTER_KEY = 'wrong-master-key-different-32chars!'
    expect(() => decryptAPIKey(encrypted)).toThrow()

    // Restore
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-for-unit-tests-32chars!'
  })

  test('generateKeyHint masks middle of key', () => {
    expect(generateKeyHint('sk-test-api-key-12345')).toBe('sk-...2345')
    expect(generateKeyHint('abc')).toBe('****')
  })
})
