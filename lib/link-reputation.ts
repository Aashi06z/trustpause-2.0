import type { LinkReputationMeta } from './link-guardian'

/**
 * Server-only reputation lookup. API keys never reach the browser — this
 * module is imported exclusively by server code (API routes / services).
 *
 * Contract:
 * - Provider not configured  → null (caller keeps the local multi-signal result)
 * - Provider says clean      → CLEAN
 * - Provider lists the host  → MALICIOUS
 * - Any error/timeout        → UNAVAILABLE (treated as "no evidence", never "safe")
 */

export type ReputationResult = LinkReputationMeta | null

const REQUEST_TIMEOUT_MS = 2500

function normalizeProviderVerdict(payload: unknown): 'CLEAN' | 'MALICIOUS' | null {
  if (payload === null || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>

  // Generic contract: { verdict: 'clean' | 'malicious', ... }
  if (typeof record.verdict === 'string') {
    const verdict = record.verdict.toLowerCase()
    if (verdict === 'clean' || verdict === 'safe' || verdict === 'ok') return 'CLEAN'
    if (verdict === 'malicious' || verdict === 'unsafe' || verdict === 'listed') return 'MALICIOUS'
    return null
  }

  // Common shape: { malicious: boolean } or { isMalicious: boolean }
  for (const key of ['malicious', 'isMalicious', 'is_malicious']) {
    const value = record[key]
    if (typeof value === 'boolean') return value ? 'MALICIOUS' : 'CLEAN'
  }

  // URLhaus-style: { query_status: 'ok', data: [...] }
  if (record.query_status === 'ok' && Array.isArray(record.data)) {
    return record.data.length > 0 ? 'MALICIOUS' : 'CLEAN'
  }

  return null
}

export async function getLinkReputation(hostname: string): Promise<ReputationResult> {
  const providerUrl = process.env.TRUSTPAUSE_THREAT_API_URL
  const providerKey = process.env.TRUSTPAUSE_THREAT_API_KEY

  if (!providerUrl) return null

  const provider = process.env.TRUSTPAUSE_THREAT_PROVIDER_NAME ?? 'configured threat provider'

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (providerKey) headers.Authorization = `Bearer ${providerKey}`

    const url = new URL(providerUrl)
    url.searchParams.set('host', hostname)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
      signal: controller.signal,
      cache: 'no-store',
    }).finally(() => clearTimeout(timer))

    if (!response.ok) {
      return { status: 'UNAVAILABLE', provider }
    }

    const verdict = normalizeProviderVerdict(await response.json().catch(() => null))
    if (!verdict) return { status: 'UNAVAILABLE', provider }

    return { status: verdict, provider }
  } catch {
    // Timeout, network failure, abort — never treat as evidence of safety.
    return { status: 'UNAVAILABLE', provider }
  }
}

export function isReputationConfigured(): boolean {
  return Boolean(process.env.TRUSTPAUSE_THREAT_API_URL)
}
