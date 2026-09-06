import { type LinkAnalysis, analyzeLink, applyReputation } from './link-guardian'
import { getLinkReputation } from './link-reputation'

export type DnsVerification = 'RESOLVED' | 'NOT_FOUND' | 'UNAVAILABLE'

export type LinkEvidenceDependencies = {
  dnsVerifier?: { verify(hostname: string): Promise<DnsVerification> } | null
  /** Test hook: bypass the real reputation provider. */
  reputationProvider?: (hostname: string) => Promise<import('./link-guardian').LinkReputationMeta | null>
}

export type LinkAnalysisWithStatus = LinkAnalysis & { verificationStatus?: DnsVerification }

/**
 * Full server-side pipeline: multi-signal heuristic analysis, optional DNS
 * evidence, and (when configured) threat-provider reputation. Reputation is
 * merged through applyReputation so a listed host escalates to DANGEROUS and
 * a clean verdict from the provider can unlock the SAFE classification.
 */
export async function analyzeLinkWithEvidence(
  input: string,
  dependencies: LinkEvidenceDependencies = {}
): Promise<LinkAnalysisWithStatus> {
  const base = analyzeLink(input)
  if (!base.isValid || !base.normalizedUrl) return base

  let analysis: LinkAnalysis = base

  const dnsVerifier = dependencies.dnsVerifier ?? null
  let verificationStatus: DnsVerification | undefined

  if (dnsVerifier) {
    const verification = await dnsVerifier.verify(base.displayedHostname)
    verificationStatus = verification
    if (verification === 'NOT_FOUND') {
      analysis = {
        ...analysis,
        detectedSignals: [
          ...analysis.detectedSignals,
          { code: 'dns-not-found', label: 'Hostname did not resolve in DNS', points: 0 },
        ],
      }
    }
  }

  const provider = dependencies.reputationProvider ?? getLinkReputation
  const reputation = await provider(base.displayedHostname)
  if (reputation) analysis = applyReputation(analysis, reputation)

  return { ...analysis, verificationStatus }
}
