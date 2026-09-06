import { describe, expect, it } from 'vitest'
import { analyzeMessageApi } from './server-message-analysis'

describe('analyzeMessageApi', () => {
  it('returns the common API envelope for a safe message', () => {
    const result = analyzeMessageApi({ text: 'Hey, are we still on for coffee at 6? I can bring the notes from our last meeting.' })

    expect(result).toMatchObject({
      riskLevel: 'LOW',
      shouldInterrupt: false,
    })
    expect(result.dangerousAction).toBe('No high-risk action detected')
    expect(result.explanation).toBeTruthy()
    expect(result.recommendedAction).toBeTruthy()
  })

  it('detects a KYC bank-impersonation link message as HIGH or worse', () => {
    const result = analyzeMessageApi({
      text: 'Your bank account will be blocked in 10 minutes. Complete KYC immediately using this link: http://secure-bank-kyc-verification.example/kyc',
    })

    expect(['HIGH', 'CRITICAL']).toContain(result.riskLevel)
    expect(result.shouldInterrupt).toBe(true)
    expect(result.detectedSignals).not.toEqual([])
    expect(result.detectedSignals.some((s) => s.code === 'threat')).toBe(true)
  })

  it('detects a UPI payment request as HIGH or worse', () => {
    const result = analyzeMessageApi({
      text: "I'm stuck at the airport. Please send 18000 urgently to my new UPI id: rahul@upi. Don't call — I'll explain later.",
    })

    expect(result.riskLevel).toBe('CRITICAL')
    expect(result.shouldInterrupt).toBe(true)
    expect(result.dangerousAction).toBe('Send money or share payment details')
    expect(result.detectedSignals.some((s) => s.label === 'Urgency')).toBe(true)
    expect(result.detectedSignals.some((s) => s.code === 'financial-request')).toBe(true)
  })

  it('flags remote-access and screen-sharing requests', () => {
    const result = analyzeMessageApi({
      text: 'Install AnyDesk and share the access code so our engineer can fix your account today.',
    })

    expect(result.detectedSignals.some((s) => s.code === 'remote-access')).toBe(true)
    expect(result.dangerousAction).toBe('Install software or grant remote access to your device')
  })

  it('caps the score at 100 for an extreme message', () => {
    const result = analyzeMessageApi({
      text: 'URGENT: your account is blocked. Share the OTP and send money to my new account rahul@upi now. Do not tell anyone or call the police.',
    })

    expect(result.score).toBe(100)
    expect(result.riskLevel).toBe('CRITICAL')
  })

  it('rejects an empty text with a validation error', () => {
    expect(() => analyzeMessageApi({ text: '' })).toThrow('A non-empty text is required.')
    expect(() => analyzeMessageApi({ text: '   ' })).toThrow('A non-empty text is required.')
    expect(() => analyzeMessageApi({ text: '' } as Parameters<typeof analyzeMessageApi>[0])).toThrow()
  })
})
