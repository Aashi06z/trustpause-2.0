import { ensureAnonymousUser, getSupabase } from './supabase'

export type CreateRiskEventRequest = {
  type: string
  riskScore: number
  riskLevel: string
  signals: string[]
  guardian?: string
  userAction?: string
  interventionOutcome?: string
  occurred_at?: string
}

export type RiskEventRecord = {
  id: string
  type: string
  riskScore: number
  riskLevel: string
  signals: string[]
  guardian?: string
  userAction?: string
  interventionOutcome?: string
  occurred_at: string
}

const ALLOWED_RISK_LEVELS = ['LOW', 'CAUTION', 'ELEVATED', 'HIGH', 'CRITICAL'] as const

function isValidRiskLevel(value: unknown): value is typeof ALLOWED_RISK_LEVELS[number] {
  return typeof value === 'string' && ALLOWED_RISK_LEVELS.includes(value as typeof ALLOWED_RISK_LEVELS[number])
}

export function validateCreateRiskEventRequest(input: unknown): CreateRiskEventRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('Request body must be a JSON object.')
  }

  const body = input as Record<string, unknown>

  if (typeof body.type !== 'string' || body.type.trim().length === 0) {
    throw new Error('type is required.')
  }
  if (typeof body.riskScore !== 'number' || Number.isNaN(body.riskScore)) {
    throw new Error('riskScore must be a number.')
  }
  if (!isValidRiskLevel(body.riskLevel)) {
    throw new Error('riskLevel must be one of: LOW, CAUTION, ELEVATED, HIGH, CRITICAL.')
  }
  if (!Array.isArray(body.signals) || body.signals.some((s: unknown) => typeof s !== 'string')) {
    throw new Error('signals must be a non-empty array of strings.')
  }

  return {
    type: body.type.trim(),
    riskScore: Math.max(0, Math.min(100, body.riskScore as number)),
    riskLevel: body.riskLevel as typeof ALLOWED_RISK_LEVELS[number],
    signals: body.signals.filter((s: unknown) => typeof s === 'string').map((s: string) => s.trim()),
    guardian: typeof body.guardian === 'string' && body.guardian.trim().length > 0 ? body.guardian.trim() : undefined,
    userAction: typeof body.userAction === 'string' && body.userAction.trim().length > 0 ? body.userAction.trim() : undefined,
    interventionOutcome: typeof body.interventionOutcome === 'string' && body.interventionOutcome.trim().length > 0 ? body.interventionOutcome.trim() : undefined,
    occurred_at: typeof body.occurred_at === 'string' ? body.occurred_at : new Date().toISOString(),
  }
}

export async function recordRiskEvent(input: CreateRiskEventRequest): Promise<RiskEventRecord> {
  const supabase = getSupabase()
  const occurredAt = input.occurred_at ?? new Date().toISOString()
  const id =
    `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const record = {
    id,
    type: input.type,
    riskScore: input.riskScore,
    riskLevel: input.riskLevel,
    signals: input.signals,
    guardian: input.guardian,
    userAction: input.userAction,
    interventionOutcome: input.interventionOutcome,
    occurred_at: occurredAt,
  }

  if (!supabase) {
    return record
  }

  try {
    const user = await ensureAnonymousUser()
    if (user) {
      const { error } = await supabase.from('risk_events').insert({
        type: record.type,
        risk_score: record.riskScore,
        risk_level: record.riskLevel,
        signals: record.signals,
        guardian: record.guardian,
        user_action: record.userAction,
        intervention_outcome: record.interventionOutcome,
        occurred_at: record.occurred_at,
        user_id: user.id,
      })

      if (error) {
        console.warn('Supabase risk-event sync failed; record kept locally in API route.', error.message)
      }
    }
  } catch (error) {
    console.warn('Supabase risk-event sync unavailable; record kept locally in API route.', error)
  }

  return record
}
