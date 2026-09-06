/**
 * Decoded-QR content classification shared by the scanner UI and the
 * server pipeline so the heading and the analysis can never disagree.
 *
 * Rules (single source of truth):
 *  1. Trim surrounding whitespace.
 *  2. A value that parses with the native `URL` parser and has an
 *     http:/https: protocol is a URL.
 *  3. Dangerous executable schemes (javascript:, data:, file:, intent:,
 *     vbscript:) are UNSUPPORTED — never opened or executed.
 *  4. Any other scheme (upi:, tel:, mailto:, ...) is also UNSUPPORTED.
 *  5. Anything else is plain text.
 */

export type QrContentKind = 'url' | 'plain-text' | 'unsupported'

export type QrContentClassification = {
  kind: QrContentKind
  /** Lower-cased scheme for `unsupported` results; null otherwise. */
  scheme: string | null
  /** True when the scheme is a dangerous, executable one. */
  dangerousScheme: boolean
}

export const DANGEROUS_QR_SCHEMES = new Set(['javascript', 'data', 'file', 'intent', 'vbscript'])

const SCHEME_RE = /^([a-z][a-z\d+.-]*):/i

export function classifyQrContentKind(value: string): QrContentClassification {
  const trimmed = value.trim()
  if (!trimmed) {
    return { kind: 'plain-text', scheme: null, dangerousScheme: false }
  }

  // 1. Native URL parser — the authoritative check, not a fragile regex.
  let parsedUrl: URL | null = null
  try {
    parsedUrl = new URL(trimmed)
  } catch {
    parsedUrl = null
  }

  if (parsedUrl && (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:')) {
    return { kind: 'url', scheme: null, dangerousScheme: false }
  }

  // 2. Any other scheme (including dangerous executable ones) is unsupported.
  const schemeMatch = trimmed.match(SCHEME_RE)
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase()
    return {
      kind: 'unsupported',
      scheme,
      dangerousScheme: DANGEROUS_QR_SCHEMES.has(scheme),
    }
  }

  // 3. URL parsing failed and no scheme is present — plain text.
  return { kind: 'plain-text', scheme: null, dangerousScheme: false }
}