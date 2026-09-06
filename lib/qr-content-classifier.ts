/**
 * Decoded-QR content classification shared by the scanner UI and the
 * server pipeline so the heading and the analysis can never disagree.
 *
 * Rules (single source of truth):
 *  1. Remove invisible format characters (zero-width spaces, LRM/RLM,
 *     soft hyphens, BOM, ...) that real camera decodes can attach to a
 *     QR payload, then trim surrounding whitespace.
 *  2. A value that begins with http:// or https:// is ALWAYS a URL —
 *     unconditionally. No matter what trails it (a newline, extra text,
 *     control characters, invisible bytes, or junk glued directly onto
 *     the link with no separator), it can never be classified as
 *     "unsupported" or plain text. The native `URL` parser is used to
 *     find the cleanest analyzable prefix.
 *  3. Any other scheme (javascript:, data:, file:, intent:, vbscript:,
 *     upi:, tel:, mailto:, ...) is UNSUPPORTED — never opened or
 *     executed. Dangerous executable schemes are flagged.
 *  4. Everything else is plain text.
 */

export type QrContentKind = 'url' | 'plain-text' | 'unsupported'

export type QrContentClassification = {
  kind: QrContentKind
  /** Lower-cased scheme for `unsupported` results; null otherwise. */
  scheme: string | null
  /** True when the scheme is a dangerous, executable one. */
  dangerousScheme: boolean
  /** Clean http(s) URL to analyze when `kind` is 'url'; null otherwise. */
  url: string | null
}

export const DANGEROUS_QR_SCHEMES = new Set(['javascript', 'data', 'file', 'intent', 'vbscript'])

const SCHEME_RE = /^([a-z][a-z\d+.-]*):/i
const HTTP_START_RE = /^https?:\/\//i
/** Whitespace + control characters that terminate a URL token. */
const URL_TOKEN_SPLIT = /[\s\u0000-\u001f\u007f]+/
/**
 * Invisible bytes that never belong inside a decoded URL but are sometimes
 * attached by real-world QR payloads / camera decoders: zero-width space,
 * ZWNJ, ZWJ, LRM, RLM, ALM, word-joiner, BOM, soft hyphen, etc.
 */
const INVISIBLE_RE = /[\u200b-\u200f\u2028\u2029\u2060-\u2064\ufeff\u00ad\u180e]/g

function normalize(value: string): string {
  return value.replace(INVISIBLE_RE, '').trim()
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

/**
 * Best-effort extraction of a clean analyzable http(s) URL from a value
 * that starts with http(s)://. Tries, in order:
 *   1. the first whitespace/control-delimited token (handles newline or
 *      space-separated trailing text),
 *   2. the whole normalized value (the native parser keeps many trailing
 *      characters as path),
 *   3. a backward truncation of the tail (handles junk glued directly to
 *      the URL that makes the parser throw, e.g. a stray `%` or bracket).
 * Returns null only if no http(s) prefix can be parsed at all.
 */
function extractHttpUrlPrefix(value: string): string | null {
  // Return the extracted prefix strings as-is (the analyzer re-parses
  // them with the native URL parser), so no canonicalization surprises
  // such as a trailing slash leak into tests or analysis input.
  const token = value.split(URL_TOKEN_SPLIT, 1)[0]
  if (parseHttpUrl(token)) return token

  if (parseHttpUrl(value)) return value

  // Remove trailing characters one at a time until the remainder parses.
  let s = value
  for (let i = 0; i < 96 && s.length > 8; i += 1) {
    s = s.slice(0, -1)
    if (parseHttpUrl(s)) return s
  }
  return null
}

export function classifyQrContentKind(value: string): QrContentClassification {
  const trimmed = normalize(value)
  if (!trimmed) {
    return { kind: 'plain-text', scheme: null, dangerousScheme: false, url: null }
  }

  // 1. A value that begins with http(s):// is a URL — unconditionally.
  //    A physically scanned QR payload can carry trailing junk of any
  //    shape; classification must never report "unsupported" for it.
  if (HTTP_START_RE.test(trimmed)) {
    return {
      kind: 'url',
      scheme: null,
      dangerousScheme: false,
      url: extractHttpUrlPrefix(trimmed) ?? trimmed,
    }
  }

  // 2. Any other scheme is unsupported — never opened or executed.
  const schemeMatch = trimmed.match(SCHEME_RE)
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase()
    return {
      kind: 'unsupported',
      scheme,
      dangerousScheme: DANGEROUS_QR_SCHEMES.has(scheme),
      url: null,
    }
  }

  // 3. No scheme and no URL — plain text.
  return { kind: 'plain-text', scheme: null, dangerousScheme: false, url: null }
}
