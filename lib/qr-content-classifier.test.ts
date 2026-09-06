import { describe, expect, it } from 'vitest'
import { classifyQrContentKind, DANGEROUS_QR_SCHEMES } from './qr-content-classifier'

describe('classifyQrContentKind — URL detection via the native URL parser', () => {
  it('classifies https://www.wikipedia.org as a URL', () => {
    const result = classifyQrContentKind('https://www.wikipedia.org')
    expect(result.kind).toBe('url')
    expect(result.scheme).toBeNull()
    expect(result.dangerousScheme).toBe(false)
  })

  it('classifies https://example.com as a URL', () => {
    expect(classifyQrContentKind('https://example.com').kind).toBe('url')
  })

  it('classifies http://example.com as a URL', () => {
    expect(classifyQrContentKind('http://example.com').kind).toBe('url')
  })

  it('classifies a URL with userinfo as a URL (never executed, but a URL)', () => {
    expect(classifyQrContentKind('https://google.com@evil.example/login').kind).toBe('url')
  })

  it('trims surrounding whitespace before classifying', () => {
    expect(classifyQrContentKind('  https://www.wikipedia.org  ').kind).toBe('url')
    expect(classifyQrContentKind('\nhttps://example.com\n').kind).toBe('url')
  })

  it('accepts uppercase scheme letters', () => {
    expect(classifyQrContentKind('HTTPS://WWW.WIKIPEDIA.ORG').kind).toBe('url')
  })

  it('accepts a trailing slash or path on the URL', () => {
    expect(classifyQrContentKind('https://example.com/login').kind).toBe('url')
    expect(classifyQrContentKind('https://example.com/').kind).toBe('url')
  })
})

describe('classifyQrContentKind — plain text', () => {
  it('classifies "Hello from TrustPause" as plain text', () => {
    const result = classifyQrContentKind('Hello from TrustPause')
    expect(result.kind).toBe('plain-text')
    expect(result.scheme).toBeNull()
    expect(result.dangerousScheme).toBe(false)
  })

  it('classifies a protocol-less hostname without a path as plain text (no http:// scheme)', () => {
    // Per the bug-fix spec: only http/https parse results are URLs.
    expect(classifyQrContentKind('www.wikipedia.org').kind).toBe('plain-text')
  })

  it('classifies an empty/whitespace-only value as plain text', () => {
    expect(classifyQrContentKind('').kind).toBe('plain-text')
    expect(classifyQrContentKind('   ').kind).toBe('plain-text')
  })

  it('does not treat a bare word with a colon as a URL', () => {
    expect(classifyQrContentKind('meeting at 6pm').kind).toBe('plain-text')
  })
})

describe('classifyQrContentKind — dangerous schemes are unsupported, never executed', () => {
  it('flags javascript: as unsupported and dangerous', () => {
    const result = classifyQrContentKind('javascript:alert(1)')
    expect(result.kind).toBe('unsupported')
    expect(result.scheme).toBe('javascript')
    expect(result.dangerousScheme).toBe(true)
  })

  it('flags data:, file:, intent: and vbscript: as unsupported and dangerous', () => {
    for (const value of ['data:text/html,<script>x</script>', 'file:///etc/passwd', 'intent://scan#Intent;end', 'vbscript:msgbox(1)']) {
      const result = classifyQrContentKind(value)
      expect(result.kind).toBe('unsupported')
      expect(result.dangerousScheme).toBe(true)
    }
  })

  it('keeps non-executable schemes (upi:, tel:) unsupported but not dangerous', () => {
    const upi = classifyQrContentKind('upi://pay?pa=fraud@upi&am=18000')
    expect(upi.kind).toBe('unsupported')
    expect(upi.scheme).toBe('upi')
    expect(upi.dangerousScheme).toBe(false)

    const tel = classifyQrContentKind('tel:+911987654321')
    expect(tel.kind).toBe('unsupported')
    expect(tel.scheme).toBe('tel')
    expect(tel.dangerousScheme).toBe(false)
  })

  it('lower-cases the scheme when classifying', () => {
    expect(classifyQrContentKind('JAVASCRIPT:alert(1)').scheme).toBe('javascript')
  })

  it('the dangerous set contains exactly the executable schemes', () => {
    expect([...DANGEROUS_QR_SCHEMES].sort()).toEqual(['data', 'file', 'intent', 'javascript', 'vbscript'])
  })
})