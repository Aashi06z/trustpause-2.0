export type RiskLevel = 'LOW' | 'CAUTION' | 'HIGH' | 'CRITICAL'

/**
 * Classification for a checked link. SAFE is only returned when reputation
 * evidence exists (demo verified list or a configured threat provider).
 * Everything without sufficient evidence stays UNKNOWN — never silently safe.
 */
export type LinkClassification = 'SAFE' | 'UNKNOWN' | 'SUSPICIOUS' | 'DANGEROUS' | 'INVALID'

export type LinkSignal = {
  code: string
  label: string
  points: number
}

export type LinkReputationMeta = {
  status: 'CLEAN' | 'MALICIOUS' | 'UNAVAILABLE'
  provider: string | null
}

export type LinkAnalysis = {
  input: string
  normalizedUrl: string | null
  displayedHostname: string
  score: number
  riskLevel: RiskLevel
  classification: LinkClassification
  detectedSignals: LinkSignal[]
  explanation: string
  recommendedAction: string
  shouldInterrupt: boolean
  canOpenAnyway: boolean
  isValid: boolean
  isPrivateTarget: boolean
  reputation?: LinkReputationMeta | null
}

/** Illustrative demo configuration — clearly labeled, not a real brand database. */
export const DEMO_VERIFIED_DOMAINS: Record<string, readonly string[]> = {
  google: ['google.com'],
  microsoft: ['microsoft.com'],
  apple: ['apple.com'],
  paypal: ['paypal.com'],
  amazon: ['amazon.com'],
  hdfc: ['hdfcbank.com'],
}

const URL_SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly'])
const CREDENTIAL_TERMS = /otp|password|passwd|credential|sign-?in|log-?in|login/i
const VERIFICATION_TERMS = /verify|secure|update|kyc|confirm|unlock|blocked|suspend|2fa/i
const PAYMENT_TERMS = /payment|wallet|refund|reward|upi|paynow|netbanking|bank-transfer/i
const URGENCY_TERMS = /urgent|immediately|act-?now|last-?chance|expire|limited-?time/i
const DANGEROUS_EXTENSIONS = /\.(?:exe|scr|zip|js|apk|dmg|msi|bat|cmd|ps1)(?:$|[?#])/i

function signal(code: string, label: string, points: number): LinkSignal {
  return { code, label, points }
}

function looksLikeHost(value: string) {
  return /^(?:localhost|[\w.-]+\.[a-z]{2,}|\d{1,3}(?:\.\d{1,3}){3})(?:[/:?#]|$)/i.test(value)
}

function parseInput(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return null

  let candidate = trimmed
  if (candidate.startsWith('//')) candidate = `https:${candidate}`
  else if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate) && looksLikeHost(candidate)) candidate = `https://${candidate}`

  try {
    const url = new URL(candidate)
    return { url, trimmed }
  } catch {
    return null
  }
}

function malformedSignals(input: string) {
  const signals = [signal('malformed', 'Malformed or unsupported URL', 100)]
  const hostMatch = input.trim().match(/^[a-z][a-z\d+.-]*:\/\/([^/?#:]+)/i)
  if (hostMatch?.[1].toLowerCase().includes('xn--')) signals.push(signal('punycode', 'Punycode hostname', 25))
  return signals
}

function isIpv4(hostname: string) {
  const parts = hostname.split('.')
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

export function isPrivateTarget(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0') return true
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true
  if (!isIpv4(host)) return false
  const [first, second] = host.split('.').map(Number)
  return first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
}

function registeredDomain(hostname: string) {
  const labels = hostname.split('.').filter(Boolean)
  return labels.length <= 2 ? labels.join('.') : labels.slice(-2).join('.')
}

/** Normalized URL with any userinfo (user:pass@) stripped — never reopened with credentials. */
function safeNormalizedUrl(url: URL) {
  return `${url.protocol}//${url.host}${url.pathname}${url.search}${url.hash}`
}

export function riskLevelFor(score: number, classification: LinkClassification): RiskLevel {
  if (classification === 'INVALID') return 'CRITICAL'
  if (classification === 'DANGEROUS') return score >= 75 ? 'CRITICAL' : 'HIGH'
  if (classification === 'SUSPICIOUS') return 'CAUTION'
  return score >= 20 ? 'CAUTION' : 'LOW'
}

/**
 * Shared classification rule so reputation evidence can be merged at the
 * service layer without duplicating thresholds.
 */
export function classifyLink(options: {
  parsed: boolean
  score: number
  hasUserinfo: boolean
  isPrivate: boolean
  threatListed: boolean
  reputationVerified: boolean
  demoVerified: boolean
}): LinkClassification {
  const { parsed, score, hasUserinfo, isPrivate, threatListed, reputationVerified, demoVerified } = options
  if (!parsed) return 'INVALID'
  if (threatListed || isPrivate || hasUserinfo || score >= 45) return 'DANGEROUS'
  if (score >= 20) return 'SUSPICIOUS'
  if (score === 0 && (reputationVerified || demoVerified)) return 'SAFE'
  return 'UNKNOWN'
}

export function analyzeLink(input: string): LinkAnalysis {
  const parsed = parseInput(input)
  if (!parsed) {
    const detectedSignals = malformedSignals(input)
    return {
      input,
      normalizedUrl: null,
      displayedHostname: 'Unavailable',
      score: 100,
      riskLevel: 'CRITICAL',
      classification: 'INVALID',
      detectedSignals,
      explanation: 'This value cannot be safely parsed as a URL, so TrustPause will not open it.',
      recommendedAction: 'Do not open this address. Check it for typos or hidden characters first.',
      shouldInterrupt: true,
      canOpenAnyway: false,
      isValid: false,
      isPrivateTarget: false,
      reputation: null,
    }
  }

  const { url, trimmed } = parsed
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const signals: LinkSignal[] = []
  const add = (item: LinkSignal) => signals.push(item)
  const privateTarget = isPrivateTarget(hostname)
  const protocolIsHttp = url.protocol === 'http:' || url.protocol === 'https:'
  const hasUserinfo = Boolean(url.username || url.password) || /@/.test(trimmed.slice(trimmed.indexOf('://') + 3))

  if (url.protocol !== 'https:') add(signal('missing-https', 'Missing HTTPS', 15))
  if (isIpv4(hostname)) add(signal('raw-ip', 'Raw IP-address host', 25))
  if (privateTarget) add(signal('private-network', 'Local or private-network address', 50))
  if (url.port && url.port !== '80' && url.port !== '443') add(signal('suspicious-port', `Unusual port :${url.port}`, 20))
  if (hostname.length > 253) add(signal('long-hostname', 'Excessive hostname length', 10))
  if ((hostname.match(/-/g) ?? []).length > 2) add(signal('excessive-hyphens', 'Excessive hyphens in hostname', 10))
  if (hostname.split('.').length > 4) add(signal('deep-subdomain', 'Excessive subdomain depth', 10))
  if (URL_SHORTENERS.has(hostname)) add(signal('url-shortener', 'URL shortener', 20))
  if (hostname.includes('xn--')) add(signal('punycode', 'Punycode hostname', 25))
  if (/%[0-9a-f]{2}/i.test(trimmed) || /[\\\u0000-\u001f]/.test(trimmed) || Array.from(hostname).some((character) => character.charCodeAt(0) > 127)) add(signal('encoded-character', 'Encoded or misleading character', 20))
  if (hasUserinfo) add(signal('embedded-credentials', `Credentials embedded with @ — the real host is ${hostname}`, 35))

  const scanText = `${hostname}${url.pathname}${url.search}`
  if (CREDENTIAL_TERMS.test(scanText)) add(signal('credential-term', 'Credential or login request language', 15))
  if (VERIFICATION_TERMS.test(scanText)) add(signal('verification-term', 'Verification or security language', 15))
  if (PAYMENT_TERMS.test(scanText)) add(signal('payment-term', 'Payment language', 15))
  if (URGENCY_TERMS.test(scanText)) add(signal('urgency-term', 'Urgency or manipulation language', 15))
  if (DANGEROUS_EXTENSIONS.test(url.pathname)) add(signal('dangerous-extension', 'Dangerous file extension', 30))
  if (!protocolIsHttp) add(signal('non-http-protocol', 'Non-HTTP protocol', 50))

  const registered = registeredDomain(hostname)
  const brandEntry = Object.entries(DEMO_VERIFIED_DOMAINS).find(([brand]) => hostname.includes(brand))
  if (brandEntry && !brandEntry[1].includes(registered)) add(signal('brand-impersonation', `Possible ${brandEntry[0]} impersonation`, 30))

  const demoVerified = Boolean(brandEntry && brandEntry[1].includes(registered))
  const score = Math.min(100, signals.reduce((total, item) => total + item.points, 0))
  const classification = classifyLink({
    parsed: true,
    score,
    hasUserinfo,
    isPrivate: privateTarget,
    threatListed: false,
    reputationVerified: false,
    demoVerified,
  })
  const level = riskLevelFor(score, classification)
  const canOpenAnyway = protocolIsHttp && !privateTarget
  const shouldInterrupt = classification === 'INVALID' || classification === 'DANGEROUS' || classification === 'SUSPICIOUS'

  const explanation =
    classification === 'UNKNOWN'
      ? signals.length === 0
        ? `No warning signals were found locally, but reputation for ${hostname} could not be established. Treat this address as unverified rather than safe.`
        : `${signals.map((item) => item.label).join(', ')}. These signals do not prove intent, but this address is not verified, so pause before opening it.`
      : signals.length === 0
        ? `No warning signals were found. ${hostname} matches TrustPause's demo verified-domain list — a simulated reputation check, not a live threat feed.`
        : `${signals.map((item) => item.label).join(', ')}. These signals do not prove intent, but they make pausing and verifying worthwhile.`

  const recommendedAction =
    classification === 'INVALID'
      ? 'Do not open this address. Check it for typos or hidden characters first.'
      : classification === 'DANGEROUS'
        ? 'Do not open this link. Use the official app or type the official address yourself.'
        : classification === 'SUSPICIOUS'
          ? 'Verify the destination independently before opening.'
          : classification === 'UNKNOWN'
            ? 'No warning signals were found, but this address is not verified. Continue only if you recognize and trust it.'
            : 'Address matches a verified demo domain. Continue normally.'

  return {
    input,
    normalizedUrl: safeNormalizedUrl(url),
    displayedHostname: hostname || 'Unavailable',
    score,
    riskLevel: level,
    classification,
    detectedSignals: signals,
    explanation,
    recommendedAction,
    shouldInterrupt,
    canOpenAnyway,
    isValid: protocolIsHttp,
    isPrivateTarget: privateTarget,
    reputation: null,
  }
}

/**
 * Merge reputation evidence into an existing analysis, re-running the shared
 * classification so a malicious verdict escalates and a clean verdict can
 * unlock SAFE. Never invents evidence — the caller passes provider output.
 */
export function applyReputation(
  analysis: LinkAnalysis,
  reputation: LinkReputationMeta,
): LinkAnalysis {
  const signals = [...analysis.detectedSignals]
  let score = analysis.score
  let threatListed = false
  let reputationVerified = false

  if (reputation.status === 'MALICIOUS') {
    threatListed = true
    signals.push(signal('threat-listed', `Flagged as malicious by ${reputation.provider ?? 'threat provider'}`, 60))
    score = Math.min(100, score + 60)
  } else if (reputation.status === 'CLEAN') {
    reputationVerified = true
    signals.push(signal('reputation-verified', `Verified clean by ${reputation.provider ?? 'threat provider'}`, 0))
  }

  const brandEntry = Object.entries(DEMO_VERIFIED_DOMAINS).find(([brand]) => analysis.displayedHostname.includes(brand))
  const demoVerified = Boolean(brandEntry && brandEntry[1].includes(analysis.displayedHostname.split('.').slice(-2).join('.')))
  const hasUserinfo = signals.some((item) => item.code === 'embedded-credentials')

  const classification = classifyLink({
    parsed: analysis.isValid,
    score,
    hasUserinfo,
    isPrivate: analysis.isPrivateTarget,
    threatListed,
    reputationVerified,
    demoVerified,
  })
  const level = riskLevelFor(score, classification)
  const shouldInterrupt = classification === 'INVALID' || classification === 'DANGEROUS' || classification === 'SUSPICIOUS'

  return {
    ...analysis,
    score,
    riskLevel: level,
    classification,
    detectedSignals: signals,
    shouldInterrupt,
    reputation,
    explanation:
      reputation.status === 'MALICIOUS'
        ? `Flagged as malicious by ${reputation.provider ?? 'threat provider'}. ${analysis.explanation}`
        : reputation.status === 'CLEAN'
          ? `Reputation provider ${reputation.provider ?? ''} reports this host as clean. ${analysis.explanation}`
          : analysis.explanation,
    recommendedAction:
      reputation.status === 'MALICIOUS'
        ? 'Do not open this link. Use the official app or type the official address yourself.'
        : analysis.recommendedAction,
  }
}
