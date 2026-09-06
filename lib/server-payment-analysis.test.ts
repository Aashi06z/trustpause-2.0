import { describe, expect, it } from 'vitest'
import { analyzePaymentRequest } from './server-payment-analysis'

describe('analyzePaymentRequest', () => {
  it('flags a new recipient payment as high risk', () => {
    const result = analyzePaymentRequest({
      amount: 18000,
      recipient: 'rahul@upi',
      isNewRecipient: true,
      pressureSignals: ['urgent', "don't call"],
    })

    expect(result.riskLevel).toBe('CRITICAL')
    expect(result.shouldInterrupt).toBe(true)
    expect(result.isNewRecipient).toBe(true)
    expect(result.amountFlagged).toBe(true)
    expect(result.detectedSignals.some((s) => s.label.includes('Recipient has not been paid before'))).toBe(true)
    expect(result.detectedSignals.some((s) => s.code === 'pressure')).toBe(true)
  })

  it('flags a large amount as an additional signal', () => {
    const result = analyzePaymentRequest({ amount: 100000, isNewRecipient: false })

    expect(result.amountFlagged).toBe(true)
    expect(result.detectedSignals.some((s) => s.label.includes('Unusually large'))).toBe(true)
  })

  it('returns low risk for a small trusted payment with no pressure signals', () => {
    const result = analyzePaymentRequest({
      amount: 200,
      recipient: 'Maya (saved contact)',
      isNewRecipient: false,
    })

    expect(result.riskLevel).toBe('LOW')
    expect(result.shouldInterrupt).toBe(false)
    expect(result.dangerousAction).toBe('Proceed with an unverified payment')
    expect(result.detectedSignals).toEqual([])
  })

  it('prioritizes secret or remote-access requests', () => {
    const result = analyzePaymentRequest({
      recipient: 'Support will share a screen and need your OTP',
      pressureSignals: ['share the OTP', 'screen share'],
    })

    expect(result.dangerousAction).toBe('Share an OTP, PIN, password, or screen access')
    expect(result.detectedSignals.some((s) => s.label.includes('secrets or remote access'))).toBe(true)
  })

  it('detects payment-intent language even without @', () => {
    const result = analyzePaymentRequest({
      recipient: 'Send the money to my new account today',
      pressureSignals: ['now'],
    })

    expect(result.detectedSignals.some((s) => s.label.includes('payment or account-action'))).toBe(true)
  })

  it('handles missing fields gracefully', () => {
    const result = analyzePaymentRequest({})

    expect(result.riskLevel).toBe('LOW')
    expect(result.score).toBe(0)
    expect(result.isNewRecipient).toBe(false)
    expect(result.amountFlagged).toBe(false)
  })
})
