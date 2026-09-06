import { type LinkAnalysis } from './link-guardian'
import { analyzeLinkWithEvidence, type LinkAnalysisWithStatus } from './link-risk-service'
import { classifyQrContentKind } from './qr-content-classifier'

export type QrRiskRequest = {
  content: string
}

export type QrUrlResult = LinkAnalysisWithStatus & {
  kind: 'url'
  input: string
}

export type QrPlainTextResult = {
  kind: 'plain-text'
  input: string
  score: number
  riskLevel: 'LOW'
  classification: 'SAFE'
  detectedSignals: LinkAnalysis['detectedSignals']
  explanation: string
  recommendedAction: string
  shouldInterrupt: boolean
}

export type QrUnsupportedResult = {
  kind: 'unsupported'
  input: string
  scheme: string
  score: number
  riskLevel: 'CAUTION' | 'HIGH'
  classification: 'UNKNOWN' | 'DANGEROUS'
  detectedSignals: LinkAnalysis['detectedSignals']
  explanation: string
  recommendedAction: string
  shouldInterrupt: boolean
}

export type QrRiskResponse = QrUrlResult | QrPlainTextResult | QrUnsupportedResult

function looksLikeHostOnly(value: string): boolean {
  try {
    const url = new URL(`https://${value}`)
    return url.hostname.includes('.')
  } catch {
    return false
  }
}

/**
 * A QR code can encode any URI scheme (upi:, tel:, mailto:, javascript:, ...).
 * Only HTTP(S) goes to the link engine; anything else with a scheme is
 * unsupported and is never opened or executed. Dangerous executable schemes
 * (javascript:, data:, file:, intent:, vbscript:) are escalated to DANGEROUS.
 */
export async function analyzeQrContent(input: QrRiskRequest): Promise<QrRiskResponse> {
  if (typeof input?.content !== 'string' || input.content.trim().length === 0) {
    throw new Error('A non-empty QR content is required.')
  }

  const trimmed = input.content.trim()
  const classification = classifyQrContentKind(trimmed)

  if (classification.kind === 'unsupported') {
    const scheme = classification.scheme ?? 'unknown'
    const dangerous = classification.dangerousScheme
    return {
      kind: 'unsupported',
      input: trimmed,
      scheme,
      score: dangerous ? 60 : 0,
      riskLevel: dangerous ? 'HIGH' : 'CAUTION',
      classification: dangerous ? 'DANGEROUS' : 'UNKNOWN',
      detectedSignals: dangerous
        ? [{ code: 'dangerous-scheme', label: `Dangerous "${scheme}:" scheme — never executed`, points: 60 }]
        : [],
      explanation: dangerous
        ? `This QR code uses the dangerous "${scheme}:" scheme. TrustPause never opens or executes this content, and acting on it could be harmful.`
        : `This QR code uses the unsupported "${scheme}:" scheme. TrustPause never opens or executes this content, and its safety cannot be established.`,
      recommendedAction: 'Do not open links, apps, or payments launched from this QR code. Verify the source first.',
      shouldInterrupt: dangerous,
    }
  }

  // Analyze the clean leading URL (classification.url) rather than the raw
  // decoded string, which may carry trailing text/control characters from a
  // real camera decode. `input` keeps the full decoded value for display.
  const base =
    classification.kind === 'url'
      ? await analyzeLinkWithEvidence(classification.url ?? trimmed)
      : looksLikeHostOnly(trimmed)
        ? await analyzeLinkWithEvidence(`https://${trimmed}`)
        : null

  if (base) {
    return { ...base, kind: 'url', input: trimmed } as QrRiskResponse
  }

  return {
    kind: 'plain-text',
    input: trimmed,
    score: 0,
    riskLevel: 'LOW',
    classification: 'SAFE',
    detectedSignals: [],
    explanation: 'This QR code contains plain text. TrustPause never opens plain-text content automatically.',
    recommendedAction: 'Review the text manually and decide whether to act on it.',
    shouldInterrupt: false,
  }
}