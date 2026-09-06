import { describe, expect, it } from 'vitest'
import { analyzeLink, applyReputation } from './link-guardian'

describe('analyzeLink — classification basics', () => {
  it('treats a verified HTTPS domain as SAFE via the demo verified list', () => {
    const result = analyzeLink('https://www.google.com')

    expect(result.normalizedUrl).toBe('https://www.google.com/')
    expect(result.displayedHostname).toBe('www.google.com')
    expect(result.score).toBe(0)
    expect(result.classification).toBe('SAFE')
    expect(result.riskLevel).toBe('LOW')
    expect(result.shouldInterrupt).toBe(false)
  })

  it('does not mark accounts.google.com dangerous merely for containing a brand', () => {
    const result = analyzeLink('https://accounts.google.com')

    expect(result.displayedHostname).toBe('accounts.google.com')
    expect(result.classification).toBe('SAFE')
    expect(result.shouldInterrupt).toBe(false)
    expect(result.detectedSignals.map((item) => item.code)).not.toContain('brand-impersonation')
  })

  it('returns UNKNOWN — never SAFE — for a clean host with no reputation evidence', () => {
    const result = analyzeLink('https://some-unknown-site.example')

    expect(result.score).toBe(0)
    expect(result.classification).toBe('UNKNOWN')
    expect(result.riskLevel).toBe('LOW')
    expect(result.shouldInterrupt).toBe(false)
    expect(result.explanation).toContain('unverified')
  })
})

describe('analyzeLink — required regression cases', () => {
  it('flags a deceptive HDFC verification domain as dangerous', () => {
    const result = analyzeLink('https://secure-hdfc-verify.example/login')

    expect(result.classification).toBe('DANGEROUS')
    expect(result.riskLevel).toBe('HIGH')
    expect(result.shouldInterrupt).toBe(true)
    expect(result.detectedSignals.map((item) => item.code)).toEqual(
      expect.arrayContaining(['verification-term', 'credential-term', 'brand-impersonation']),
    )
  })

  it('detects misleading hostname structure in hdfc.com.example', () => {
    const result = analyzeLink('https://hdfc.com.example/login')

    // "hdfc" is only a subdomain — the registered domain is com.example.
    expect(result.detectedSignals.map((item) => item.code)).toContain('brand-impersonation')
    expect(result.classification).toBe('DANGEROUS')
    expect(result.shouldInterrupt).toBe(true)
  })

  it('treats userinfo@ tricks as dangerous and exposes the real host', () => {
    const result = analyzeLink('https://google.com@evil.example/login')

    expect(result.displayedHostname).toBe('evil.example')
    expect(result.detectedSignals.map((item) => item.code)).toContain('embedded-credentials')
    expect(result.classification).toBe('DANGEROUS')
    expect(result.shouldInterrupt).toBe(true)
  })

  it('does not treat a raw private IP as safe', () => {
    const result = analyzeLink('http://192.168.1.10/login')

    expect(result.isPrivateTarget).toBe(true)
    expect(result.canOpenAnyway).toBe(false)
    expect(result.shouldInterrupt).toBe(true)
    expect(result.detectedSignals.map((item) => item.code)).toEqual(
      expect.arrayContaining(['missing-https', 'raw-ip', 'private-network']),
    )
  })

  it('returns INVALID for plain text that is not a URL', () => {
    const result = analyzeLink('hello')

    expect(result.classification).toBe('INVALID')
    expect(result.isValid).toBe(false)
    expect(result.normalizedUrl).toBeNull()
    expect(result.canOpenAnyway).toBe(false)
    expect(result.riskLevel).toBe('CRITICAL')
  })

  it('never opens a normalized URL that still contains embedded credentials', () => {
    const result = analyzeLink('https://user:pass@evil.example/x')

    expect(result.normalizedUrl).not.toContain('user:pass')
    expect(result.classification).toBe('DANGEROUS')
  })
})

describe('analyzeLink — heuristic signals', () => {
  it('scores verification and credential language on a plain host', () => {
    const result = analyzeLink('http://secure-bank-kyc-verification.example')

    expect(result.classification).toBe('SUSPICIOUS')
    expect(result.riskLevel).toBe('CAUTION')
    expect(result.shouldInterrupt).toBe(true)
    expect(result.detectedSignals.map((item) => item.code)).toEqual(
      expect.arrayContaining(['missing-https', 'excessive-hyphens', 'verification-term']),
    )
  })

  it('flags URL shorteners and punycode without opening them', () => {
    expect(analyzeLink('https://bit.ly/example').detectedSignals.map((item) => item.code)).toContain('url-shortener')
    expect(analyzeLink('https://xn--example-test.invalid').detectedSignals.map((item) => item.code)).toContain('punycode')
  })

  it('flags unusual ports and dangerous file extensions', () => {
    expect(analyzeLink('https://example.com:8443/pay').detectedSignals.map((item) => item.code)).toContain('suspicious-port')
    expect(analyzeLink('https://example.com/update.apk').detectedSignals.map((item) => item.code)).toContain('dangerous-extension')
  })

  it('detects brand impersonation outside the demo verified domains', () => {
    const result = analyzeLink('https://google-login.example/verify')

    expect(result.detectedSignals.map((item) => item.code)).toContain('brand-impersonation')
  })

  it('keeps HTTPS and .com from implying safety on their own', () => {
    // HTTPS + .com + zero heuristic signals still has no reputation evidence.
    const result = analyzeLink('https://totally-unknown-brand.com')

    expect(result.classification).toBe('UNKNOWN')
    expect(result.explanation).toContain('unverified')
    expect(result.explanation).not.toContain('verified clean')
  })
})

describe('applyReputation — evidence merging', () => {
  it('escalates to DANGEROUS when the provider lists the host', () => {
    const base = analyzeLink('https://totally-unknown-brand.com')
    const merged = applyReputation(base, { status: 'MALICIOUS', provider: 'TestFeed' })

    expect(merged.classification).toBe('DANGEROUS')
    expect(merged.shouldInterrupt).toBe(true)
    expect(merged.detectedSignals.map((item) => item.code)).toContain('threat-listed')
    expect(merged.reputation?.provider).toBe('TestFeed')
  })

  it('unlocks SAFE only with provider-verified clean evidence', () => {
    const base = analyzeLink('https://totally-unknown-brand.com')
    const merged = applyReputation(base, { status: 'CLEAN', provider: 'TestFeed' })

    expect(merged.classification).toBe('SAFE')
    expect(merged.detectedSignals.map((item) => item.code)).toContain('reputation-verified')
  })

  it('leaves an unverified host UNKNOWN when the provider is unavailable', () => {
    const base = analyzeLink('https://totally-unknown-brand.com')
    const merged = applyReputation(base, { status: 'UNAVAILABLE', provider: 'TestFeed' })

    expect(merged.classification).toBe('UNKNOWN')
    expect(merged.shouldInterrupt).toBe(false)
  })

  it('never lets a clean verdict rescue a dangerous analysis', () => {
    const base = analyzeLink('https://google.com@evil.example/login')
    const merged = applyReputation(base, { status: 'CLEAN', provider: 'TestFeed' })

    expect(merged.classification).toBe('DANGEROUS')
    expect(merged.shouldInterrupt).toBe(true)
  })
})
