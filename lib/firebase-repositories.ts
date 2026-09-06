import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
  Timestamp,
} from 'firebase/firestore'
import { ensureFirebaseAnonymousUser, getFirebaseServices } from './firebase'
import { createLocalTrustedContactRepository, type NewTrustedContact, type TrustedContact, type TrustedContactRepository } from './trust-circle'
import { saveIncidentMetadata, type IncidentMetadata } from './aftertap'
import { type UserSettings } from './supabase'

type FirebaseTrustedContact = Omit<TrustedContact, 'createdAt'> & { createdAt: Timestamp }
type FirebaseIncidentWrite = Omit<IncidentMetadata, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> }
type FirebaseScanWrite = { riskLevel: string; score: number; signals: string[]; dangerousAction: string; createdAt: ReturnType<typeof serverTimestamp> }

const contactConverter: FirestoreDataConverter<TrustedContact> = {
  toFirestore(contact) {
    return { id: contact.id, name: contact.name, relationship: contact.relationship, phoneNumber: contact.phoneNumber, ...(contact.verificationPhraseHash ? { verificationPhraseHash: contact.verificationPhraseHash } : {}), createdAt: serverTimestamp() }
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions) {
    const data = snapshot.data(options) as FirebaseTrustedContact
    return { id: snapshot.id, name: data.name, relationship: data.relationship, phoneNumber: data.phoneNumber, ...(data.verificationPhraseHash ? { verificationPhraseHash: data.verificationPhraseHash } : {}), createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date().toISOString() }
  },
}

function userCollection(uid: string, name: 'trustedContacts' | 'scanResults' | 'incidents' | 'preferences') {
  const current = getFirebaseServices()
  if (!current) return null
  return collection(current.db, 'users', uid, name)
}

async function firebaseUser() {
  const user = await ensureFirebaseAnonymousUser()
  return user?.uid ?? null
}

export function createFirebaseTrustedContactRepository(): TrustedContactRepository | null {
  if (!getFirebaseServices()) return null
  return {
    async list() {
      const uid = await firebaseUser()
      const contacts = uid ? userCollection(uid, 'trustedContacts') : null
      if (!contacts) throw new Error('Firebase is unavailable.')
      const snapshot = await getDocs(query(contacts.withConverter(contactConverter), orderBy('createdAt', 'asc')))
      return snapshot.docs.map((item) => item.data())
    },
    async add(input: NewTrustedContact) {
      const uid = await firebaseUser()
      if (!uid) throw new Error('Firebase authentication is unavailable.')
      const local = createLocalTrustedContactRepository()
      const contact = await local.add(input)
      const contacts = userCollection(uid, 'trustedContacts')
      if (!contacts) throw new Error('Firebase is unavailable.')
      try {
        await setDoc(doc(contacts.withConverter(contactConverter), contact.id), contact)
      } catch (error) {
        await local.remove(contact.id)
        throw error
      }
      return contact
    },
    async update(id: string, input: NewTrustedContact) {
      const uid = await firebaseUser()
      if (!uid) throw new Error('Firebase authentication is unavailable.')
      const contacts = userCollection(uid, 'trustedContacts')
      if (!contacts) throw new Error('Firebase is unavailable.')
      const local = createLocalTrustedContactRepository()
      const updated = await local.update(id, input)
      if (!updated) return null
      await updateDoc(doc(contacts, id), { id: updated.id, name: updated.name, relationship: updated.relationship, phoneNumber: updated.phoneNumber, ...(updated.verificationPhraseHash ? { verificationPhraseHash: updated.verificationPhraseHash } : {}) })
      return updated
    },
    async remove(id: string) {
      const uid = await firebaseUser()
      const contacts = uid ? userCollection(uid, 'trustedContacts') : null
      if (!contacts) throw new Error('Firebase is unavailable.')
      const { deleteDoc } = await import('firebase/firestore')
      await deleteDoc(doc(contacts, id))
    },
  }
}

export async function loadTrustedContactsWithFallback() {
  const local = createLocalTrustedContactRepository()
  const remote = createFirebaseTrustedContactRepository()
  if (!remote) return { contacts: await local.list(), mode: 'local' as const }
  try {
    const contacts = await remote.list()
    return { contacts, mode: 'firebase' as const }
  } catch {
    return { contacts: await local.list(), mode: 'local' as const }
  }
}

export async function saveIncidentMetadataWithFallback(metadata: IncidentMetadata) {
  saveIncidentMetadata(metadata)
  const uid = await firebaseUser()
  const incidents = uid ? userCollection(uid, 'incidents') : null
  if (!incidents) return 'local' as const
  try {
    await setDoc(doc(incidents), { incidentType: metadata.incidentType, timeline: metadata.timeline, transactionReference: metadata.transactionReference, createdAt: serverTimestamp() } satisfies FirebaseIncidentWrite)
    return 'firebase' as const
  } catch {
    return 'local' as const
  }
}

const PREFERENCES_KEY = 'trustpause.user-preferences.v1'
const SCAN_STORAGE_KEY = 'trustpause.scan-results.v1'

function saveLocalScan(scan: Omit<FirebaseScanWrite, 'createdAt'>) {
  if (typeof window === 'undefined') return
  try {
    const current = JSON.parse(window.localStorage.getItem(SCAN_STORAGE_KEY) ?? '[]')
    const scans = Array.isArray(current) ? current.filter((item) => item && typeof item === 'object') : []
    window.localStorage.setItem(SCAN_STORAGE_KEY, JSON.stringify([...scans, { ...scan, createdAt: new Date().toISOString() }].slice(-50)))
  } catch {
    // Local scan history is optional.
  }
}

export async function loadUserPreferencesWithFallback(fallback: UserSettings) {
  const localValue = typeof window === 'undefined' ? fallback : (() => {
    try { return { ...fallback, ...JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? '{}') } } catch { return fallback }
  })()
  const uid = await firebaseUser()
  const preferences = uid ? userCollection(uid, 'preferences') : null
  if (!preferences) return { preferences: localValue, mode: 'local' as const }
  try {
    const snapshot = await getDocs(query(preferences, limit(1)))
    const data = snapshot.docs[0]?.data() as Partial<UserSettings> | undefined
    return { preferences: { ...localValue, ...data }, mode: 'firebase' as const }
  } catch {
    return { preferences: localValue, mode: 'local' as const }
  }
}

export async function saveUserPreferencesWithFallback(preferences: UserSettings) {
  if (typeof window !== 'undefined') window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
  const uid = await firebaseUser()
  const preferencesCollection = uid ? userCollection(uid, 'preferences') : null
  if (!preferencesCollection) return 'local' as const
  try {
    await setDoc(doc(preferencesCollection, 'current'), { ...preferences, updatedAt: serverTimestamp() })
    return 'firebase' as const
  } catch {
    return 'local' as const
  }
}

export async function saveScanResultWithFallback(scan: Omit<FirebaseScanWrite, 'createdAt'>) {
  const uid = await firebaseUser()
  const scans = uid ? userCollection(uid, 'scanResults') : null
  if (!scans) {
    saveLocalScan(scan)
    return 'local' as const
  }
  try {
    await setDoc(doc(scans), { ...scan, createdAt: serverTimestamp() } satisfies FirebaseScanWrite)
    return 'firebase' as const
  } catch {
    saveLocalScan(scan)
    return 'local' as const
  }
}
