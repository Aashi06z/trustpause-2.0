import { analyzeMessage, type MessageRiskAnalysis } from './message-risk'
import type { RiskAnalysis } from './api-types'

export type MessageRiskRequest = {
  text: string
}

export type MessageRiskResponse = RiskAnalysis & {
  dangerousAction: string
}

export function analyzeMessageApi(input: MessageRiskRequest): MessageRiskResponse {
  if (typeof input?.text !== 'string' || input.text.trim().length === 0) {
    throw new Error('A non-empty text is required.')
  }

  const analysis = analyzeMessage(input.text)
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
    shouldInterrupt: analysis.level === 'HIGH' || analysis.level === 'CRITICAL',
    dangerousAction: analysis.dangerousAction,
  }
}
