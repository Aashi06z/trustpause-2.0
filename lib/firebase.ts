import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously, type Auth, type User } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

export type FirebaseServices = {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let services: FirebaseServices | null | undefined
let anonymousUserPromise: Promise<User | null> | undefined

function hasRequiredConfig() {
  return process.env.NEXT_PUBLIC_FIREBASE_ENABLED === 'true' && Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId)
}

export function getFirebaseServices(): FirebaseServices | null {
  if (services !== undefined) return services
  if (typeof window === 'undefined' || !hasRequiredConfig()) {
    services = null
    return services
  }
  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
    services = { app, auth: getAuth(app), db: getFirestore(app) }
  } catch (error) {
    console.warn('Firebase is unavailable; using local-only mode.', error)
    services = null
  }
  return services
}

export function getFirebaseMode() {
  return getFirebaseServices() ? 'firebase' as const : 'local' as const
}

export async function ensureFirebaseAnonymousUser() {
  if (anonymousUserPromise) return anonymousUserPromise
  const current = getFirebaseServices()
  if (!current) return null
  anonymousUserPromise = (async () => {
    if (current.auth.currentUser) return current.auth.currentUser
    try {
      return (await signInAnonymously(current.auth)).user
    } catch (error) {
      console.warn('Firebase anonymous auth is unavailable; using local-only mode.', error)
      return null
    }
  })()
  return anonymousUserPromise
}
