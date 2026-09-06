import { analyzeCall, type CallRiskAnalysis, type CallRiskInput } from './call-risk'
import type { RiskAnalysis } from './api-types'

export type CallRiskRequest = CallRiskInput

export type CallRiskResponse = RiskAnalysis & {
  dangerousAction: string
  callerNumber: string
  claimedName: string
  inContacts: boolean
  callerVerified: boolean
  spoofPossible: boolean
}

export function analyzeCallApi(input: CallRiskRequest): CallRiskResponse {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('A valid call-risk request is required.')
  }

  for (const field of ['callerNumber', 'claimedName', 'transcript'] as const) {
    const value = input[field]
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new Error(`field ${field} must be a string when provided.`)
    }
  }

  const analysis = analyzeCall({
    callerNumber: typeof input.callerNumber === 'string' ? input.callerNumber : '',
    claimedName: typeof input.claimedName === 'string' ? input.claimedName : '',
    transcript: typeof input.transcript === 'string' ? input.transcript : '',
    inContacts: Boolean(input.inContacts),
    callerVerified: Boolean(input.callerVerified),
    spoofPossible: Boolean(input.spoofPossible),
  })

  return toResponse(analysis, input)
}

function toResponse(analysis: CallRiskAnalysis, input: CallRiskRequest): CallRiskResponse {
  return {
    riskLevel: analysis.level,
    score: analysis.score,
    detectedSignals: analysis.signalDetails.map((signal) => ({
      code: signal.code,
      label: signal.label,
      points: signal.points,
      evidence: signal.evidence,
    })),
    explanation: analysis.summary,
    recommendedAction: analysis.recommendedAction,
    shouldInterrupt: analysis.shouldInterrupt,
    dangerousAction: analysis.dangerousAction,
    callerNumber: typeof input.callerNumber === 'string' ? input.callerNumber : '',
    claimedName: typeof input.claimedName === 'string' ? input.claimedName : '',
    inContacts: Boolean(input.inContacts),
    callerVerified: Boolean(input.callerVerified),
    spoofPossible: Boolean(input.spoofPossible),
  }
}