import { describe, expect, it } from 'vitest'
import { analyzeCall, type CallRiskInput } from './call-risk'

const SCENARIOS = {
  normalUnknown: {
    callerNumber: '+91 98•••• ••11',
    inContacts: false,
    callerVerified: false,
    spoofPossible: false,
    transcript: 'Hello, this is about a package delivery for you.',
  },
  bankOtp: {
    callerNumber: '+91 11 4567 8901',
    claimedName: 'Bank fraud department',
    inContacts: false,
    callerVerified: false,
    spoofPossible: false,
    transcript: 'This is your bank security team. Your account is compromised. Tell me your OTP immediately.',
  },
  digitalArrest: {
    callerNumber: '+91 11 4080 1234',
    claimedName: 'Police / CBI Officer',
    inContacts: false,
    callerVerified: false,
    spoofPossible: true,
    transcript: 'This is a police officer. Your Aadhaar has been linked to a criminal case. Stay on the call and do not tell your family.',
  },
  remoteAccess: {
    callerNumber: '+91 80 5500 2244',
    claimedName: 'Tech support',
    inContacts: false,
    callerVerified: false,
    spoofPossible: true,
    transcript: 'Your device has been compromised. Install this application and give me remote access immediately.',
  },
  spoofed: {
    callerNumber: '+91 1800 100 0000',
    claimedName: 'HDFC Bank dial-back line',
    inContacts: false,
    callerVerified: false,
    spoofPossible: true,
    transcript: 'This is HDFC Bank. We detected unusual activity on your account. Confirm your PIN to block the fraud.',
  },
} satisfies Record<string, CallRiskInput>

describe('Call Guardian — scenario levels', () => {
  it('normal unknown caller scores LOW — never CRITICAL on its own', () => {
    const result = analyzeCall(SCENARIOS.normalUnknown)

    expect(result.level).toBe('LOW')
    expect(result.score).toBeLessThan(20)
    expect(result.shouldInterrupt).toBe(false)
    expect(result.dangerousAction).toBe('Trust unverified caller information')
  })

  it('bank impersonation + OTP request scores HIGH or CRITICAL', () => {
    const result = analyzeCall(SCENARIOS.bankOtp)

    expect(['HIGH', 'CRITICAL']).toContain(result.level)
    expect(result.score).toBeGreaterThanOrEqual(45)
    expect(result.dangerousAction).toContain('OTP')
    const codes = result.signalDetails.map((signal) => signal.code)
    expect(codes).toEqual(expect.arrayContaining(['authority-claim', 'bank-impersonation', 'credential-request']))
  })

  it('digital arrest (police + threat + secrecy) scores CRITICAL', () => {
    const result = analyzeCall(SCENARIOS.digitalArrest)

    expect(result.level).toBe('CRITICAL')
    expect(result.score).toBeGreaterThanOrEqual(75)
    expect(result.shouldInterrupt).toBe(true)
    const codes = result.signalDetails.map((signal) => signal.code)
    expect(codes).toEqual(expect.arrayContaining(['police-authority', 'threat', 'secrecy']))
  })

  it('remote-access scam scores HIGH or CRITICAL', () => {
    const result = analyzeCall(SCENARIOS.remoteAccess)

    expect(['HIGH', 'CRITICAL']).toContain(result.level)
    expect(result.score).toBeGreaterThanOrEqual(45)
    expect(result.dangerousAction).toContain('remote access')
    const codes = result.signalDetails.map((signal) => signal.code)
    expect(codes).toEqual(expect.arrayContaining(['remote-access', 'fear']))
  })

  it('spoofed caller with suspicious behavior scores HIGH or CRITICAL', () => {
    const result = analyzeCall(SCENARIOS.spoofed)

    expect(['HIGH', 'CRITICAL']).toContain(result.level)
    expect(result.score).toBeGreaterThanOrEqual(45)
    const codes = result.signalDetails.map((signal) => signal.code)
    expect(codes).toEqual(expect.arrayContaining(['spoof-possible', 'bank-impersonation', 'credential-request']))
  })
})

describe('Call Guardian — combination behavior', () => {
  it('unknown + spoofing with no other signals scores CAUTION at most', () => {
    const result = analyzeCall({ callerNumber: '+91 12 3456 7890', inContacts: false, callerVerified: false, spoofPossible: true })

    expect(['LOW', 'CAUTION']).toContain(result.level)
    expect(result.score).toBeLessThan(45)
  })

  it('a caller in contacts with a normal transcript stays LOW', () => {
    const result = analyzeCall({ callerNumber: '+91 98 7654 3210', inContacts: true, callerVerified: true, spoofPossible: false, transcript: 'Hi, can we reschedule tomorrow’s meeting?' })

    expect(result.level).toBe('LOW')
    expect(result.score).toBe(0)
  })

  it('single words like “urgent” or “bank” do not spike risk without an ask', () => {
    const result = analyzeCall({ callerNumber: '+91 11 2233 4455', inContacts: false, callerVerified: false, spoofPossible: false, transcript: 'This is urgent. Please call back about the bank meeting.' })

    expect(['LOW', 'CAUTION']).toContain(result.level)
    expect(result.score).toBeLessThan(45)
  })

  it('HIGH/CRITICAL results always flag shouldInterrupt', () => {
    for (const scenario of [SCENARIOS.bankOtp, SCENARIOS.digitalArrest, SCENARIOS.remoteAccess, SCENARIOS.spoofed]) {
      const result = analyzeCall(scenario)
      if (result.level === 'HIGH' || result.level === 'CRITICAL') {
        expect(result.shouldInterrupt).toBe(true)
      }
    }
  })
})