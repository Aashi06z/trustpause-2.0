import { describe, expect, it } from 'vitest'
import { analyzeMessage } from './message-risk'

describe('analyzeMessage', () => {
  it('treats a normal personal message as low risk', () => {
    const result = analyzeMessage('Hey, are we still on for coffee at 6? I can bring the notes from our last meeting.')

    expect(result.level).toBe('LOW')
    expect(result.score).toBeLessThan(20)
    expect(result.dangerousAction).toBe('No high-risk action detected')
  })

  it('flags a KYC bank-impersonation link message as high risk', () => {
    const result = analyzeMessage('Your bank account will be blocked in 10 minutes. Complete KYC immediately using this link: http://secure-bank-kyc-verification.example/kyc')

    expect(['HIGH', 'CRITICAL']).toContain(result.level)
    expect(result.score).toBeGreaterThanOrEqual(45)
    expect(result.signals).toEqual(expect.arrayContaining(['Urgency', 'Threat of consequence', 'Suspicious link']))
    expect(result.dangerousAction).not.toBe('No high-risk action detected')
  })

  it('detects a UPI payment request with urgency and secrecy', () => {
    const result = analyzeMessage("I'm stuck at the airport. Please send 18000 urgently to my new UPI id: rahul@upi. Don't call — I'll explain later.")

    expect(result.signals).toEqual(expect.arrayContaining(['Urgency', 'Distress claim', 'Financial request', 'Secrecy / isolation']))
    expect(result.score).toBeGreaterThanOrEqual(45)
    expect(result.dangerousAction).toBe('Send money or share payment details')
  })

  it('flags remote-access and screen-sharing requests', () => {
    const result = analyzeMessage('Install AnyDesk and share the access code so our engineer can fix your account today.')

    expect(result.signals).toEqual(expect.arrayContaining(['Remote-access request']))
    expect(result.dangerousAction).toBe('Install software or grant remote access to your device')
  })

  it('caps the score at 100', () => {
    const result = analyzeMessage('URGENT: your account is blocked. Share the OTP and send money to my new account rahul@upi now. Do not tell anyone or call the police.')
    expect(result.score).toBe(100)
    expect(result.level).toBe('CRITICAL')
  })
})
