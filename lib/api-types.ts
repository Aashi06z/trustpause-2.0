export type RiskLevel = 'LOW' | 'CAUTION' | 'HIGH' | 'CRITICAL'

export type RiskSignal = {
  code: string
  label: string
  points: number
  /** Where the signal appears in the analyzed content, for UI "why" lists. */
  evidence?: string
}

export type RiskAnalysis = {
  riskLevel: RiskLevel
  score: number
  detectedSignals: RiskSignal[]
  explanation: string
  recommendedAction: string
  shouldInterrupt: boolean
}

export type ApiError = {
  error: string
  code: string
}
