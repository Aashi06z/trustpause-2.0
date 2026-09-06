import { ensureAnonymousUser, getSupabase, type RiskEvent } from './supabase'

const STORAGE_KEY = 'trustpause.risk-events.v1'

export type NewRiskEvent = Omit<RiskEvent, 'id' | 'occurred_at'> & { id?: string; occurred_at?: string }

export type RiskEventTone = RiskEvent['tone']
export type RiskEventStatus = RiskEvent['status']

function isRiskEvent(value: unknown): value is RiskEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<RiskEvent>
  return typeof event.id === 'string'
    && typeof event.title === 'string'
    && typeof event.detail === 'string'
    && typeof event.risk === 'string'
    && (event.status === 'Protected' || event.status === 'Blocked' || event.status === 'Reviewed')
    && typeof event.occurred_at === 'string'
    && typeof event.guardian === 'string'
    && (event.tone === 'green' || event.tone === 'red' || event.tone === 'amber')
}

export function readLocalRiskEvents(): RiskEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter(isRiskEvent) : []
  } catch {
    return []
  }
}

export function writeLocalRiskEvent(input: NewRiskEvent): RiskEvent {
  const event: RiskEvent = {
    id: input.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    guardian: input.guardian,
    title: input.title,
    detail: input.detail,
    risk: input.risk,
    status: input.status,
    tone: input.tone,
  }
  if (typeof window !== 'undefined') {
    try {
      const next = [event, ...readLocalRiskEvents().filter((item) => item.id !== event.id)].slice(0, 50)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Local history is optional; the interaction still works without it.
    }
  }
  return event
}

/**
 * Mirrors a local risk event to POST /api/risk-events. The server schema is
 * { type, riskScore, riskLevel, signals, ... }, so the local display fields are
 * mapped onto it: the guardian name becomes a slug `type`, the human-readable
 * `risk` string is split into individual signals, and riskScore/riskLevel are
 * heuristically derived from the event tone (the local event does not carry a
 * numeric score). The mirror is best-effort and never blocks the UI.
 */
async function recordRiskEventOnServer(input: NewRiskEvent): Promise<void> {
  if (typeof window === 'undefined') return
  const signals = input.risk
    .split(/\s*\+\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const payload = {
    type: input.guardian ? input.guardian.toLowerCase().replace(/\s+/g, '-') : 'intervention',
    riskScore: input.tone === 'red' ? 90 : input.tone === 'amber' ? 70 : 45,
    riskLevel: input.tone === 'red' ? 'CRITICAL' : input.tone === 'amber' ? 'HIGH' : 'CAUTION',
    signals: signals.length > 0 ? signals : ['unspecified'],
    guardian: input.guardian,
    interventionOutcome: input.status,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
  }
  try {
    await fetch('/api/risk-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch (error) {
    console.warn('TrustPause risk-event API mirror failed; event kept locally.', error)
  }
}

/**
 * Records a risk event locally and, when Supabase is configured, mirrors it to
 * the `risk_events` table for the anonymous user. The new server API mirror is
 * best-effort and never blocks the local experience.
 */
export async function recordRiskEvent(input: NewRiskEvent): Promise<RiskEvent> {
  const event = writeLocalRiskEvent(input)
  const supabase = getSupabase()
  if (!supabase) {
    await recordRiskEventOnServer(input)
    return event
  }
  try {
    const user = await ensureAnonymousUser()
    if (user) {
      const { error } = await supabase.from('risk_events').insert({
        guardian: event.guardian,
        title: event.title,
        detail: event.detail,
        risk: event.risk,
        status: event.status,
        tone: event.tone,
        occurred_at: event.occurred_at,
        user_id: user.id,
      })
      if (error) console.warn('Supabase risk-event sync failed; event kept locally.', error.message)
    }
  } catch (error) {
    console.warn('Supabase risk-event sync unavailable; event kept locally.', error)
  }
  await recordRiskEventOnServer(input)
  return event
}