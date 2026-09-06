import { describe, expect, it } from 'vitest'
import { analyzeQrContent } from './server-qr-analysis'

describe('analyzeQrContent — URL routing to the shared link engine', () => {
  it('analyzes an HTTPS URL through the shared link analysis', async () => {
    const result = await analyzeQrContent({ content: 'https://hdfc-secure-verify.example/update-kyc' })

    expect(result.kind).toBe('url')
    expect(result.input).toBe('https://hdfc-secure-verify.example/update-kyc')
    expect(result.riskLevel).toBe('HIGH')
    expect(result.score).toBeGreaterThan(0)
    expect(result.shouldInterrupt).toBe(true)
    expect(result.detectedSignals.some((s) => s.code === 'brand-impersonation')).toBe(true)
  })

  it('routes a safe demo URL through the link engine with classification', async () => {
    const result = await analyzeQrContent({ content: 'https://www.google.com' })

    expect(result.kind).toBe('url')
    if (result.kind === 'url') {
      expect(result.classification).toBe('SAFE')
      expect(result.shouldInterrupt).toBe(false)
      expect(result.normalizedUrl).toBe('https://www.google.com/')
    }
  })

  it('classifies https://www.wikipedia.org as a URL, never plain text or unsupported', async () => {
    const result = await analyzeQrContent({ content: 'https://www.wikipedia.org' })

    expect(result.kind).toBe('url')
    if (result.kind === 'url') {
      expect(result.displayedHostname).toBe('www.wikipedia.org')
      expect(result.classification).toBe('UNKNOWN')
      expect(result.shouldInterrupt).toBe(false)
      expect(result.normalizedUrl).toBe('https://www.wikipedia.org/')
    }
  })

  it('classifies https://example.com as a URL', async () => {
    const result = await analyzeQrContent({ content: 'https://example.com' })
    expect(result.kind).toBe('url')
    if (result.kind === 'url') expect(result.displayedHostname).toBe('example.com')
  })

  it('classifies http://example.com as a URL', async () => {
    const result = await analyzeQrContent({ content: 'http://example.com' })
    expect(result.kind).toBe('url')
    if (result.kind === 'url') expect(result.displayedHostname).toBe('example.com')
  })

  it('classifies a URL with surrounding whitespace as a URL after trimming', async () => {
    const result = await analyzeQrContent({ content: '  https://www.wikipedia.org  ' })
    expect(result.kind).toBe('url')
    if (result.kind === 'url') {
      expect(result.input).toBe('https://www.wikipedia.org')
      expect(result.displayedHostname).toBe('www.wikipedia.org')
    }
  })

  it('analyzes a protocol-less hostname as a URL for analysis', async () => {
    const result = await analyzeQrContent({ content: 'secure-bank-kyc-verification.example' })

    expect(result.kind).toBe('url')
    if (result.kind === 'url') {
      expect(result.displayedHostname).toBeTruthy()
      expect(result.classification).toBe('SUSPICIOUS')
    }
  })

  it('never opens the decoded content and labels the safe action', async () => {
    const result = await analyzeQrContent({ content: 'https://bit.ly/example' })

    expect(result.kind).toBe('url')
    expect(result.recommendedAction).not.toContain('open this link')
    expect(result.shouldInterrupt).toBe(true)
  })

  it('routes a deceptive QR URL to the link engine and returns DANGEROUS', async () => {
    const result = await analyzeQrContent({ content: 'https://hdfc.com.example/login' })

    expect(result.kind).toBe('url')
    if (result.kind === 'url') {
      expect(result.classification).toBe('DANGEROUS')
      expect(result.shouldInterrupt).toBe(true)
      expect(result.detectedSignals.some((s) => s.code === 'brand-impersonation')).toBe(true)
    }
  })
})

describe('analyzeQrContent — plain text and unsupported schemes', () => {
  it('analyzes a plain-text QR as safe and non-interruptive', async () => {
    const result = await analyzeQrContent({ content: 'Hello from TrustPause' })

    expect(result.kind).toBe('plain-text')
    expect(result.riskLevel).toBe('LOW')
    expect(result.score).toBe(0)
    expect(result.shouldInterrupt).toBe(false)
    expect(result.explanation).toContain('plain text')
  })

  it('treats a meeting note as plain text, not a URL', async () => {
    const result = await analyzeQrContent({ content: 'Meeting at 6pm near the north gate' })

    expect(result.kind).toBe('plain-text')
    expect(result.shouldInterrupt).toBe(false)
  })

  it('handles a UPI payment QR as unsupported and never executable', async () => {
    const result = await analyzeQrContent({ content: 'upi://pay?pa=fraud@upi&am=18000' })

    expect(result.kind).toBe('unsupported')
    if (result.kind === 'unsupported') {
      expect(result.scheme).toBe('upi')
      expect(result.classification).toBe('UNKNOWN')
      expect(result.shouldInterrupt).toBe(false)
      expect(result.explanation).toContain('never opens or executes')
    }
  })

  it('handles a tel: QR as unsupported', async () => {
    const result = await analyzeQrContent({ content: 'tel:+911987654321' })

    expect(result.kind).toBe('unsupported')
    if (result.kind === 'unsupported') expect(result.scheme).toBe('tel')
  })

  it('handles a javascript: QR as unsupported — never executed', async () => {
    const result = await analyzeQrContent({ content: 'javascript:alert(1)' })

    expect(result.kind).toBe('unsupported')
    if (result.kind === 'unsupported') {
      expect(result.scheme).toBe('javascript')
      expect(result.classification).toBe('DANGEROUS')
      expect(result.riskLevel).toBe('HIGH')
      expect(result.shouldInterrupt).toBe(true)
      expect(result.recommendedAction).toContain('Do not open')
    }
  })

  it('escalates data:, file:, intent: and vbscript: QR schemes as dangerous', async () => {
    for (const content of ['data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'intent://example.com#Intent;end', 'vbscript:msgbox(1)']) {
      const result = await analyzeQrContent({ content })
      expect(result.kind).toBe('unsupported')
      if (result.kind === 'unsupported') {
        expect(result.classification).toBe('DANGEROUS')
        expect(result.shouldInterrupt).toBe(true)
      }
    }
  })
})

describe('analyzeQrContent — request validation', () => {
  it('rejects an empty content with a validation error', async () => {
    await expect(analyzeQrContent({ content: '' })).rejects.toThrow('A non-empty QR content is required.')
    await expect(analyzeQrContent({ content: '   ' })).rejects.toThrow('A non-empty QR content is required.')
  })

  it('rejects malformed requests cleanly', async () => {
    await expect(analyzeQrContent({} as unknown as Parameters<typeof analyzeQrContent>[0])).rejects.toThrow()
    await expect(analyzeQrContent({ content: 123 } as unknown as Parameters<typeof analyzeQrContent>[0])).rejects.toThrow()
    await expect(analyzeQrContent({ content: [] } as unknown as Parameters<typeof analyzeQrContent>[0])).rejects.toThrow()
    await expect(analyzeQrContent({ content: true } as unknown as Parameters<typeof analyzeQrContent>[0])).rejects.toThrow()
    await expect(analyzeQrContent(null as unknown as Parameters<typeof analyzeQrContent>[0])).rejects.toThrow()
    await expect(analyzeQrContent(undefined as unknown as Parameters<typeof analyzeQrContent>[0])).rejects.toThrow()
  })
})
