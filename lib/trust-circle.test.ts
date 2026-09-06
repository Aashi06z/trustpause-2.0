import { afterEach, describe, expect, it } from 'vitest'
import { createLocalTrustedContactRepository, normalizePhoneNumber } from './trust-circle'

const storage = new Map<string, string>()
const localStorageMock: Storage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => { storage.set(key, value) },
  removeItem: (key) => { storage.delete(key) },
  clear: () => { storage.clear() },
  key: () => null,
  length: 0,
}

afterEach(() => {
  storage.clear()
  delete (globalThis as { window?: unknown }).window
})

describe('Trust Circle repository', () => {
  it('normalizes only conservative phone formats', () => {
    expect(normalizePhoneNumber('+1 (415) 555-0123')).toBe('+14155550123')
    expect(normalizePhoneNumber('4155550123')).toBe('+4155550123')
    expect(normalizePhoneNumber('555')).toBeNull()
    expect(normalizePhoneNumber('call-me')).toBeNull()
  })

  it('stores contacts locally and hashes verification phrases', async () => {
    ;(globalThis as { window?: unknown }).window = { localStorage: localStorageMock }
    const repository = createLocalTrustedContactRepository()
    const contact = await repository.add({ name: 'Maya', relationship: 'Friend', phoneNumber: '+1 415 555 0123', verificationPhrase: 'blue lantern' })
    const stored = [...storage.values()].join(' ')

    expect(contact.phoneNumber).toBe('+14155550123')
    expect(contact.verificationPhraseHash).toHaveLength(64)
    expect(stored).not.toContain('blue lantern')
    expect((await repository.list())).toHaveLength(1)
  })
})
