import { describe, expect, it } from 'vitest'
import { analyzeLinkApi } from './server-link-analysis'

describe('analyzeLinkApi', () => {
  it('returns the common API envelope with SAFE for a demo-verified URL', async () => {
    const result = await analyzeLinkApi({ url: 'https://www.google.com' })

    expect(result).toMatchObject({
      riskLevel: 'LOW',
      score: 0,
      classification: 'SAFE',
      shouldInterrupt: false,
      input: 'https://www.google.com',
      normalizedUrl: 'https://www.google.com/',
      displayedHostname: 'www.google.com',
      isValid: true,
    })
    expect(result.explanation).toBeTruthy()
    expect(result.recommendedAction).toBeTruthy()
    expect(result.detectedSignals).toEqual([])
    expect(result.reputation).toBeNull()
  })

  it('flags a private network target and prevents opening', async () => {
    const result = await analyzeLinkApi({ url: 'http://192.168.1.10/login' })

    expect(result.classification).toBe('DANGEROUS')
    expect(result.riskLevel).toBe('CRITICAL')
    expect(result.shouldInterrupt).toBe(true)
    expect(result.isValid).toBe(true)
    expect(result.isPrivateTarget).toBe(true)
    expect(result.canOpenAnyway).toBe(false)
    expect(result.detectedSignals.map((s) => s.code)).toEqual(
      expect.arrayContaining(['missing-https', 'raw-ip', 'private-network'])
    )
  })

  it('detects suspicious KYC-style links', async () => {
    const result = await analyzeLinkApi({ url: 'http://secure-bank-kyc-verification.example' })

    expect(result.classification).toBe('SUSPICIOUS')
    expect(result.riskLevel).toBe('CAUTION')
    expect(result.shouldInterrupt).toBe(true)
    expect(result.detectedSignals.map((s) => s.code)).toEqual(
      expect.arrayContaining(['missing-https', 'excessive-hyphens', 'verification-term'])
    )
  })

  it('classifies a deceptive HDFC login domain as DANGEROUS', async () => {
    const result = await analyzeLinkApi({ url: 'https://secure-hdfc-verify.example/login' })

    expect(result.classification).toBe('DANGEROUS')
    expect(result.riskLevel).toBe('HIGH')
    expect(result.shouldInterrupt).toBe(true)
    expect(result.detectedSignals.map((s) => s.code)).toEqual(
      expect.arrayContaining(['brand-impersonation', 'credential-term', 'verification-term'])
    )
  })

  it('rejects an empty url with a validation error', async () => {
    await expect(analyzeLinkApi({ url: '' })).rejects.toThrow('A non-empty url is required.')
    await expect(analyzeLinkApi({ url: '   ' })).rejects.toThrow('A non-empty url is required.')
    await expect(analyzeLinkApi({ url: '' } as Parameters<typeof analyzeLinkApi>[0])).rejects.toThrow()
  })

  it('accepts an optional context field without breaking', async () => {
    const result = await analyzeLinkApi({ url: 'https://www.google.com', context: 'received in an sms' })

    expect(result.classification).toBe('SAFE')
    expect(result.input).toBe('https://www.google.com')
  })
})
