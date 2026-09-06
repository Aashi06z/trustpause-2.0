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

  it('classifies a URL that begins cleanly but carries trailing text after a newline as a URL, never unsupported', () => {
    const value = 'https://www.wikipedia.org\nScan this for a demo'
    const result = classifyQrContentKind(value)
    expect(result.kind).toBe('url')
    expect(result.scheme).toBeNull()
    // The clean leading URL is exposed for analysis.
    expect(result.url).toBe('https://www.wikipedia.org')
  })

  it('classifies a URL followed by trailing junk on the same line as a URL', () => {
    const value = 'https://www.wikipedia.org Scan this for a demo'
    const result = classifyQrContentKind(value)
    expect(result.kind).toBe('url')
    expect(result.url).toBe('https://www.wikipedia.org')
  })

  it('does not regress the clean wikipedia URL', () => {
    const result = classifyQrContentKind('https://www.wikipedia.org')
    expect(result.kind).toBe('url')
    expect(result.url).toBe('https://www.wikipedia.org')
  })

  it('strips invisible zero-width / format characters attached to the URL before classifying', () => {
    const cases = [
      'https://www.wikipedia.org\u200b',
      '\u200bhttps://www.wikipedia.org',
      'https://www.wikipedia.org\ufeff',
      'https://www.wikipedia.org\u200e',
      'https://www.wikipedia.org\u00ad',
    ]
    for (const value of cases) {
      const result = classifyQrContentKind(value)
      expect(result.kind, JSON.stringify(value)).toBe('url')
      expect(result.url).toBe('https://www.wikipedia.org')
    }
  })

  it('never classifies a value beginning with http(s):// as unsupported, even with attached junk', () => {
    // The native URL parser may keep some trailing characters inside the
    // URL or not; what matters is the classification is always 'url' and a
    // clean analyzable URL is exposed — never 'unsupported'.
    const cases = [
      'https://www.wikipedia.org\"',
      'https://www.wikipedia.org,visit-now',
      'https://www.wikipedia.org/wiki/Main_Page\u0000extra',
      'https://www.wikipedia.org\nScan this for a demo',
      'https://www.wikipedia.org Scan this for a demo',
    ]
    for (const value of cases) {
      const result = classifyQrContentKind(value)
      expect(result.kind, JSON.stringify(value)).toBe('url')
      expect(result.dangerousScheme).toBe(false)
      expect(result.url).toBeTruthy()
      expect(result.url?.startsWith('https://')).toBe(true)
    }
  })

  it('returns url with scheme null for junk glued to a URL with no separator (parser-throwing tails)', () => {
    // These tails would previously fall through to the scheme check and
    // report "unsupported" with scheme 'https' — the exact runtime bug
    // reported for physically scanned QRs. A value beginning with
    // http(s):// must now be url unconditionally.
    const cases = [
      'https://www.wikipedia.org%',
      'https://www.wikipedia.org[',
      'https://www.wikipedia.org>',
      'https://www.wikipedia.org\\',
      'https://example.com/login{click}',
    ]
    for (const value of cases) {
      const result = classifyQrContentKind(value)
      expect(result.kind, JSON.stringify(value)).toBe('url')
      expect(result.scheme, JSON.stringify(value)).toBeNull()
      expect(result.dangerousScheme).toBe(false)
      expect(result.url).toBeTruthy()
      expect(result.url?.match(/^https?:\/\//)).toBeTruthy()
    }
  })

  it('exposes the clean leading URL when glued junk makes the whole parse throw', () => {
    const result = classifyQrContentKind('https://www.wikipedia.org%')
    expect(result.kind).toBe('url')
    // Backward truncation drops the offending tail and keeps the real link.
    expect(result.url).toBe('https://www.wikipedia.org')
  })

  it('still flags javascript: when hidden characters are present after the scheme', () => {
    const result = classifyQrContentKind('javascript:alert(1)\u200b')
    expect(result.kind).toBe('unsupported')
    expect(result.scheme).toBe('javascript')
    expect(result.dangerousScheme).toBe(true)
  })

  it('exposes the clean URL for a URL with a path', () => {
    const result = classifyQrContentKind('https://example.com/login')
    expect(result.kind).toBe('url')
    expect(result.url).toBe('https://example.com/login')
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