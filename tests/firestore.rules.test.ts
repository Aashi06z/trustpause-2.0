import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'

let testEnv: RulesTestEnvironment

const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'trustpause-rules-test',
    firestore: { rules },
  })
})

afterAll(async () => {
  if (testEnv) await testEnv.cleanup()
})

function db(uid?: string) {
  return testEnv.authenticatedContext(uid ?? 'user-a').firestore()
}

describe('TrustPause Firestore rules', () => {
  it('allows an authenticated owner to create a valid trusted contact', async () => {
    const reference = doc(db(), 'users/user-a/trustedContacts/contact-1')
    await assertSucceeds(setDoc(reference, {
      id: 'contact-1', name: 'Maya', relationship: 'Friend', phoneNumber: '+14155550123', createdAt: serverTimestamp(),
    }))
  })

  it('denies unauthenticated reads and another user access', async () => {
    const ownerReference = doc(db(), 'users/user-a/trustedContacts/contact-2')
    await assertSucceeds(setDoc(ownerReference, {
      id: 'contact-2', name: 'Maya', relationship: 'Friend', phoneNumber: '+14155550123', createdAt: serverTimestamp(),
    }))
    await assertFails(getDoc(doc(db('user-b'), 'users/user-a/trustedContacts/contact-2')))
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'users/user-a/trustedContacts/contact-2')))
  })

  it('rejects unexpected fields and oversized contact strings', async () => {
    await assertFails(setDoc(doc(db(), 'users/user-a/trustedContacts/contact-3'), {
      id: 'contact-3', name: 'Maya', relationship: 'Friend', phoneNumber: '+14155550123', createdAt: serverTimestamp(), unexpected: true,
    }))
    await assertFails(setDoc(doc(db(), 'users/user-a/trustedContacts/contact-4'), {
      id: 'contact-4', name: 'x'.repeat(81), relationship: 'Friend', phoneNumber: '+14155550123', createdAt: serverTimestamp(),
    }))
  })

  it('validates scan score types and allowed risk levels', async () => {
    const valid = { riskLevel: 'HIGH', score: 80, signals: ['Urgency'], dangerousAction: 'Review', createdAt: serverTimestamp() }
    await assertSucceeds(setDoc(doc(db(), 'users/user-a/scanResults/scan-1'), valid))
    await assertFails(setDoc(doc(db(), 'users/user-a/scanResults/scan-2'), { ...valid, score: 101 }))
    await assertFails(setDoc(doc(db(), 'users/user-a/scanResults/scan-3'), { ...valid, riskLevel: 'UNKNOWN' }))
    await assertFails(setDoc(doc(db(), 'users/user-a/scanResults/scan-4'), { ...valid, score: 12.5 }))
  })

  it('rejects another user UID-shaped fields and invalid incidents', async () => {
    await assertFails(setDoc(doc(db(), 'users/user-a/incidents/incident-1'), {
      incidentType: 'sent-money', timeline: 'Today', transactionReference: 'REF-1', uid: 'user-b', createdAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(db(), 'users/user-a/incidents/incident-2'), {
      incidentType: 'unknown', timeline: 'Today', transactionReference: '', createdAt: serverTimestamp(),
    }))
  })

  it('validates guardian preferences with all toggles present', async () => {
    const valid = {
      message_analysis_consent: true,
      trust_circle_requests: true,
      browser_link_interception: true,
      payment_pause: true,
      call_screening: true,
      media_checks: true,
      hold_to_continue: true,
      updatedAt: serverTimestamp(),
    }
    await assertSucceeds(setDoc(doc(db(), 'users/user-a/preferences/current'), valid))
    await assertFails(setDoc(doc(db(), 'users/user-a/preferences/current'), { ...valid, payment_pause: 'yes' }))
    await assertFails(setDoc(doc(db(), 'users/user-a/preferences/current'), { ...valid, payment_pause: undefined }))
    await assertFails(setDoc(doc(db(), 'users/user-a/preferences/current'), { ...valid, extra: true }))
  })
})
