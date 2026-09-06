import { describe, expect, it } from 'vitest'
import { analyzeCallApi } from './server-call-analysis'

const DIGITAL_ARREST = {
  callerNumber: '+91 11 4080 1234',
  claimedName: 'Police / CBI Officer',
  inContacts: false,
  callerVerified: false,
  spoofPossible: true,
  transcript: 'This is a police officer. Your Aadhaar has been linked to a criminal case. Stay on the call and do not tell your family.',
}

describe('Call Guardian — server analysis API', () => {
  it('returns the consistent RiskAnalysis envelope', () => {
    const result = analyzeCallApi(DIGITAL_ARREST)

    expect(result.riskLevel).toBe('CRITICAL')
    expect(result.score).toBeGreaterThanOrEqual(75)
    expect(Array.isArray(result.detectedSignals)).toBe(true)
    expect(typeof result.explanation).toBe('string')
    expect(typeof result.recommendedAction).toBe('string')
    expect(result.shouldInterrupt).toBe(true)
    expect(typeof result.dangerousAction).toBe('string')
  })

  it('maps signals with code/label/points/evidence like the other guardians', () => {
    const result = analyzeCallApi(DIGITAL_ARREST)

    for (const signal of result.detectedSignals) {
      expect(typeof signal.code).toBe('string')
      expect(typeof signal.label).toBe('string')
      expect(typeof signal.points).toBe('number')
    }
    expect(result.detectedSignals.some((signal) => signal.code === 'police-authority')).toBe(true)
    expect(result.detectedSignals.some((signal) => signal.code === 'secrecy')).toBe(true)
  })

  it('an unknown caller alone is not CRITICAL through the API', () => {
    const result = analyzeCallApi({ callerNumber: '+91 98•••• ••11', inContacts: false, callerVerified: false })

    expect(result.riskLevel).toBe('LOW')
    expect(result.score).toBeLessThan(20)
  })

  it('rejects a non-object body', () => {
    expect(() => analyzeCallApi('not an object' as never)).toThrow(/valid call-risk request/)
    expect(() => analyzeCallApi(null as never)).toThrow(/valid call-risk request/)
  })

  it('rejects non-string transcript fields', () => {
    expect(() => analyzeCallApi({ transcript: 123 } as never)).toThrow(/transcript must be a string/)
  })

  it('tolerates missing optional fields and returns an empty-transcript analysis', () => {
    const result = analyzeCallApi({})

    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(['LOW', 'CAUTION']).toContain(result.riskLevel)
    expect(result.callerNumber).toBe('')
  })

  it('bank + OTP reaches HIGH/CRITICAL through the API', () => {
    const result = analyzeCallApi({
      callerNumber: '+91 11 4567 8901',
      inContacts: false,
      callerVerified: false,
      transcript: 'This is your bank security team. Your account is compromised. Tell me your OTP immediately.',
    })

    expect(['HIGH', 'CRITICAL']).toContain(result.riskLevel)
    expect(result.dangerousAction).toContain('OTP')
  })
})