export type TrustedContact = {
  id: string
  name: string
  relationship: string
  phoneNumber: string
  verificationPhraseHash?: string
  createdAt: string
}

export type NewTrustedContact = Omit<TrustedContact, 'id' | 'createdAt' | 'verificationPhraseHash'> & {
  verificationPhrase?: string
}

export type TrustedContactRepository = {
  list: () => Promise<TrustedContact[]>
  add: (input: NewTrustedContact) => Promise<TrustedContact>
  update: (id: string, input: NewTrustedContact) => Promise<TrustedContact | null>
  remove: (id: string) => Promise<void>
}

const STORAGE_KEY = 'trustpause.trusted-contacts.v1'

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function readContacts() {
  if (!canUseStorage()) return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isTrustedContact)
  } catch {
    return []
  }
}

function writeContacts(contacts: TrustedContact[]) {
  if (canUseStorage()) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts))
}

function isTrustedContact(value: unknown): value is TrustedContact {
  if (!value || typeof value !== 'object') return false
  const contact = value as Partial<TrustedContact>
  return typeof contact.id === 'string' && typeof contact.name === 'string' && typeof contact.relationship === 'string' && typeof contact.phoneNumber === 'string' && typeof contact.createdAt === 'string' && (contact.verificationPhraseHash === undefined || typeof contact.verificationPhraseHash === 'string')
}

async function hashPhrase(phrase: string | undefined) {
  const normalized = phrase?.trim()
  if (!normalized) return undefined
  if (typeof crypto === 'undefined' || !crypto.subtle) throw new Error('Verification phrases require a secure browser context.')
  const bytes = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function normalizePhoneNumber(value: string) {
  const trimmed = value.trim()
  const normalized = trimmed.replace(/[\s().-]/g, '')
  if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) return null
  return normalized.startsWith('+') ? normalized : `+${normalized}`
}

export function createLocalTrustedContactRepository(): TrustedContactRepository {
  return {
    async list() {
      return readContacts()
    },
    async add(input) {
      const phoneNumber = normalizePhoneNumber(input.phoneNumber)
      if (!phoneNumber) throw new Error('Enter a valid phone number with country code, such as +14155550123.')
      const contact: TrustedContact = { id: createId(), name: input.name.trim(), relationship: input.relationship.trim(), phoneNumber, verificationPhraseHash: await hashPhrase(input.verificationPhrase), createdAt: new Date().toISOString() }
      const contacts = [...readContacts(), contact]
      writeContacts(contacts)
      return contact
    },
    async update(id, input) {
      const contacts = readContacts()
      const current = contacts.find((contact) => contact.id === id)
      if (!current) return null
      const phoneNumber = normalizePhoneNumber(input.phoneNumber)
      if (!phoneNumber) throw new Error('Enter a valid phone number with country code, such as +14155550123.')
      const contact: TrustedContact = { ...current, name: input.name.trim(), relationship: input.relationship.trim(), phoneNumber, verificationPhraseHash: await hashPhrase(input.verificationPhrase) }
      writeContacts(contacts.map((item) => item.id === id ? contact : item))
      return contact
    },
    async remove(id) {
      writeContacts(readContacts().filter((contact) => contact.id !== id))
    },
  }
}
