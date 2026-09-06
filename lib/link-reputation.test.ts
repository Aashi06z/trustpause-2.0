import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLinkReputation, isReputationConfigured } from './link-reputation'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.restoreAllMocks()
})

function withEnv(env: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...env }
}

describe('getLinkReputation', () => {
  it('returns null when no provider is configured — never invents evidence', async () => {
    withEnv({ TRUSTPAUSE_THREAT_API_URL: undefined })

    const result = await getLinkReputation('example.com')
    expect(result).toBeNull()
    expect(isReputationConfigured()).toBe(false)
  })

  it('maps a generic clean verdict to CLEAN', async () => {
    withEnv({ TRUSTPAUSE_THREAT_API_URL: 'https://threat.internal/check', TRUSTPAUSE_THREAT_PROVIDER_NAME: 'InternalFeed' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ verdict: 'clean' }), { status: 200 }))

    const result = await getLinkReputation('good.example')
    expect(result).toEqual({ status: 'CLEAN', provider: 'InternalFeed' })
  })

  it('maps a malicious verdict to MALICIOUS', async () => {
    withEnv({ TRUSTPAUSE_THREAT_API_URL: 'https://threat.internal/check' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ verdict: 'malicious' }), { status: 200 }))

    const result = await getLinkReputation('bad.example')
    expect(result?.status).toBe('MALICIOUS')
  })

  it('maps a { malicious: true } payload to MALICIOUS', async () => {
    withEnv({ TRUSTPAUSE_THREAT_API_URL: 'https://threat.internal/check' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ malicious: true }), { status: 200 }))

    const result = await getLinkReputation('bad.example')
    expect(result?.status).toBe('MALICIOUS')
  })

  it('maps URLhaus-style payloads (empty data array = clean)', async () => {
    withEnv({ TRUSTPAUSE_THREAT_API_URL: 'https://threat.internal/check' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ query_status: 'ok', data: [] }), { status: 200 }))

    const result = await getLinkReputation('good.example')
    expect(result?.status).toBe('CLEAN')
  })

  it('returns UNAVAILABLE on HTTP error responses', async () => {
    withEnv({ TRUSTPAUSE_THREAT_API_URL: 'https://threat.internal/check' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('denied', { status: 403 }))

    const result = await getLinkReputation('example.com')
    expect(result?.status).toBe('UNAVAILABLE')
  })

  it('returns UNAVAILABLE when the provider returns an unrecognized payload', async () => {
    withEnv({ TRUSTPAUSE_THREAT_API_URL: 'https://threat.internal/check' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ nonsense: true }), { status: 200 }))

    const result = await getLinkReputation('example.com')
    expect(result?.status).toBe('UNAVAILABLE')
  })

  it('returns UNAVAILABLE when fetch throws (network failure / timeout)', async () => {
    withEnv({ TRUSTPAUSE_THREAT_API_URL: 'https://threat.internal/check' })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await getLinkReputation('example.com')
    expect(result?.status).toBe('UNAVAILABLE')
  })

  it('sends the Authorization header only when a key is configured', async () => {
    withEnv({ TRUSTPAUSE_THREAT_API_URL: 'https://threat.internal/check', TRUSTPAUSE_THREAT_API_KEY: 'secret' })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ verdict: 'clean' }), { status: 200 }))

    await getLinkReputation('example.com')
    const headers = (fetchSpy.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret')
  })
})
