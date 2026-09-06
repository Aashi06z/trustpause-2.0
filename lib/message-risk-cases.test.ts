import { describe, expect, it } from 'vitest'
import { analyzeMessage } from './message-risk'
import { analyzeMessageApi } from './server-message-analysis'

const CASES = {
  safe: 'Please submit the assignment today before 5 PM.',
  otpScam: 'URGENT! Your bank account will be blocked today. Send your OTP immediately to verify your account. Do not tell anyone.',
  paymentScam: "Send ₹18,000 immediately to this new UPI ID. Don't call anyone. This is urgent.",
  digitalArrest: 'This is a police officer. Your Aadhaar has been linked to a criminal case. Stay on the call and do not tell your family.',
  remoteAccess: 'Your computer is infected. Download this app immediately and give me remote access so I can fix your account.',
  normalUrgent: 'Please send me the project file urgently because the meeting starts in 10 minutes.',
} as const

describe('Message Guardian — six acceptance cases (engine)', () => {
  it('CASE 1 — safe assignment message scores LOW with no alarm', () => {
    const result = analyzeMessage(CASES.safe)

    expect(result.level).toBe('LOW')
    expect(result.score).toBeLessThan(20)
    expect(result.dangerousAction).toBe('No high-risk action detected')
    expect(result.summary).toContain('No combined risk pattern')
  })

  it('CASE 2 — OTP scam scores HIGH or CRITICAL with a signal combination', () => {
    const result = analyzeMessage(CASES.otpScam)

    expect(['HIGH', 'CRITICAL']).toContain(result.level)
    expect(result.score).toBeGreaterThanOrEqual(45)
    expect(result.dangerousAction).toContain('OTP')
    for (const signal of ['Urgency', 'OTP / credential request', 'Threat of consequence', 'Secrecy / isolation']) {
      expect(result.signals).toContain(signal)
    }
  })

  it('CASE 3 — payment scam scores HIGH or CRITICAL with payment + secrecy signals', () => {
    const result = analyzeMessage(CASES.paymentScam)

    expect(['HIGH', 'CRITICAL']).toContain(result.level)
    expect(result.dangerousAction).toBe('Send money or share payment details')
    for (const signal of ['Urgency', 'Financial request', 'Secrecy / isolation']) {
      expect(result.signals).toContain(signal)
    }
  })

  it('CASE 4 — digital arrest scores CRITICAL with authority + secrecy + threat', () => {
    const result = analyzeMessage(CASES.digitalArrest)

    expect(result.level).toBe('CRITICAL')
    expect(result.signals).toEqual(expect.arrayContaining(['Authority impersonation', 'Secrecy / isolation', 'Threat of consequence']))
    expect(result.dangerousAction).toContain('authority')
  })

  it('CASE 5 — remote-access scam scores HIGH or CRITICAL', () => {
    const result = analyzeMessage(CASES.remoteAccess)

    expect(['HIGH', 'CRITICAL']).toContain(result.level)
    expect(result.signals).toEqual(expect.arrayContaining(['Remote-access request', 'Urgency']))
    expect(result.dangerousAction).toContain('remote access')
  })

  it('CASE 6 — normal urgent message must NOT become HIGH because of the word urgently', () => {
    const result = analyzeMessage(CASES.normalUrgent)

    expect(result.level).toBe('LOW')
    expect(result.dangerousAction).toBe('No high-risk action detected')
  })
})

describe('Message Guardian — API envelope (server analysis)', () => {
  it('returns LOW and no interruption for the safe message', () => {
    const result = analyzeMessageApi({ text: CASES.safe })

    expect(result.riskLevel).toBe('LOW')
    expect(result.shouldInterrupt).toBe(false)
    expect(result.recommendedAction).toContain('No intervention needed')
  })

  it('returns CRITICAL with signals for the OTP scam', () => {
    const result = analyzeMessageApi({ text: CASES.otpScam })

    expect(['HIGH', 'CRITICAL']).toContain(result.riskLevel)
    expect(result.shouldInterrupt).toBe(true)
    expect(result.detectedSignals.some((signal) => signal.code === 'credential-request')).toBe(true)
    expect(result.detectedSignals.every((signal) => typeof signal.points === 'number')).toBe(true)
  })

  it('returns CRITICAL for the digital-arrest message with authority signal', () => {
    const result = analyzeMessageApi({ text: CASES.digitalArrest })

    expect(result.riskLevel).toBe('CRITICAL')
    expect(result.detectedSignals.some((signal) => signal.code === 'authority-claim')).toBe(true)
    expect(result.shouldInterrupt).toBe(true)
  })

  it('returns LOW for the normal urgent message (no false positive)', () => {
    const result = analyzeMessageApi({ text: CASES.normalUrgent })

    expect(result.riskLevel).toBe('LOW')
    expect(result.shouldInterrupt).toBe(false)
  })

  it('rejects empty and whitespace-only messages', () => {
    expect(() => analyzeMessageApi({ text: '' })).toThrow('A non-empty text is required.')
    expect(() => analyzeMessageApi({ text: '   ' })).toThrow('A non-empty text is required.')
  })

  it('keeps scores within 0-100', () => {
    for (const text of Object.values(CASES)) {
      const result = analyzeMessageApi({ text })
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(100)
    }
  })
})

describe('Message Guardian — no single-word false positives', () => {
  it('does not flag ordinary messages that merely mention sensitive words', () => {
    const benign = [
      'Please verify the meeting time with the team.',
      'The bank statement for March is in your email.',
      'Can you check if the package was delivered today?',
      'Remember to submit your KYC form to HR by Friday.',
    ]
    for (const text of benign) {
      const result = analyzeMessage(text)
      expect(result.level).toBe('LOW')
    }
  })
})
