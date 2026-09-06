import { analyzeLink } from './link-guardian'
import { analyzeLinkWithEvidence } from './link-risk-service'
import type { RiskAnalysis } from './api-types'

export type LinkRiskRequest = {
  url: string
  context?: string
}

export type LinkRiskResponse = RiskAnalysis & {
  input: string
  normalizedUrl: string | null
  displayedHostname: string
  isPrivateTarget: boolean
  isValid: boolean
  canOpenAnyway: boolean
  /** SAFE | UNKNOWN | SUSPICIOUS | DANGEROUS | INVALID */
  classification: import('./link-guardian').LinkClassification
  /** Reputation evidence metadata, or null when no provider ran. */
  reputation: import('./link-guardian').LinkReputationMeta | null
}

export async function analyzeLinkApi(input: LinkRiskRequest): Promise<LinkRiskResponse> {
  if (typeof input?.url !== 'string' || input.url.trim().length === 0) {
    throw new Error('A non-empty url is required.')
  }

  const analysis = await analyzeLinkWithEvidence(input.url)
  return {
    riskLevel: analysis.riskLevel,
    score: analysis.score,
    detectedSignals: analysis.detectedSignals,
    explanation: analysis.explanation,
    recommendedAction: analysis.recommendedAction,
    shouldInterrupt: analysis.shouldInterrupt,
    input: analysis.input,
    normalizedUrl: analysis.normalizedUrl,
    displayedHostname: analysis.displayedHostname,
    isPrivateTarget: analysis.isPrivateTarget,
    isValid: analysis.isValid,
    canOpenAnyway: analysis.canOpenAnyway,
    classification: analysis.classification,
    reputation: analysis.reputation ?? null,
  }
}
