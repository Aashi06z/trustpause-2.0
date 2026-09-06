export type MessageRiskLevel = 'LOW' | 'CAUTION' | 'HIGH' | 'CRITICAL'

export type MessageRiskSignal = {
  code: string
  label: string
  points: number
  /** What the signal looks like in the message, shown in the UI "why" list. */
  evidence: string
}

export type MessageRiskAnalysis = {
  level: MessageRiskLevel
  score: number
  signals: string[]
  signalDetails: MessageRiskSignal[]
  dangerousAction: string
  summary: string
  recommendedAction: string
}

/** UPI intents and payment identifiers (UPI deep links, UPI ID pattern, common Indian payment apps) */
const PAYMENT_IDENTIFIER =
  /(?:^|\s)(?:upi|tez|phonepe|paytm(?:mp)?|gpay|bhim):\/\/|[a-z0-9._-]+@[a-z]{2,}\b|(?:₹|rs\.?|inr)\s?\d|\b\d{1,3}(?:,\d{2,3})+(?:\.\d{2})?\b|\b(?:send|pay|transfer|deposit)\s+(?:₹|rs\.?|inr)?\s?\d/i

/** Money-verb context: a payment/action word that only counts when money is the object. */
const MONEY_REQUEST =
  /\b(?:send|pay|transfer|wire|deposit|donate)\b[^.!?]{0,40}\b(?:money|cash|amount|payment|it|them|₹|\d)/i

/** OTP / credential request: an ask, not a mere mention. */
const CREDENTIAL_REQUEST =
  /\b(?:share|send|give|tell me|enter|confirm|read(?:\s+back)?|provide)\b[^.!?]{0,40}\b(?:otp|one[- ]time|passcode|pin|password|cvv|card number|credentials)\b|\b(?:otp|passcode)\b[^.!?]{0,30}\b(?:immediately|now|urgent|to verify|verify)\b/i

const CREDENTIAL_MENTION = /\b(?:otp|one[- ]time (?:password|code)|passcode|cvv|net ?banking password)\b/i

/** Security/account action: verify/change related to accounts, cards, KYC. */
const ACCOUNT_SECURITY_ACTION =
  /\b(?:verify|validate|update|reactivate|unblock|re-?activate|confirm)\b[^.!?]{0,50}\b(?:account|kyc|card|identity|details|number|aadhaar|pan)\b|\b(?:kyc|account)\b[^.!?]{0,30}\b(?:expir|block|suspendsuspend|suspended|closed?)\b/i

const THREAT_CONSEQUENCE =
  /\b(?:account|card|wallet|number|sim)\b[^.!?]{0,40}\b(?:blocked|suspended|closed|frozen|deactivated|disabled|barred)\b|\b(?:police (?:case|complaint)|legal action|arrest|arrested|warrant|penalty|fine of)\b|\b(?:criminal case|money laundering|tax evasion)\b/i

const SECRECY_ISOLATION =
  /\b(?:don'?t|do not|never|stop)\b[^.!?]{0,30}\b(?:call|tell|inform|contact|discuss|speak|talk|msg|message)\b|\b(?:keep (?:this|it) (?:quiet|secret|between)|between us|don'?t tell (?:anyone|mom|your (?:family|parents))|do not inform)\b/i

const AUTHORITY_CLAIM =
  /\b(?:this is|speaking|calling from|from the)\b[^.!?]{0,40}\b(?:police|cbi|cyber ?cell|crime branch|enforcement|ed|income ?tax|rbi|bank(?:'s)? (?:fraud|security)|customs|narcotics)\b|\b(?:police officer|cbi officer|cybercrime officer|customs officer|govt|government official|traai)\b/i

const REMOTE_ACCESS =
  /\b(?:anydesk|teamviewer|quick ?support|screen ?shar|remote (?:access|support|desktop)|install (?:this|the) app|download (?:this|the) app)\b/i

const SUSPICIOUS_LINK =
  /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+(?:-[a-z0-9-]+)+\.(?:com|net|org|info|xyz|top|online|site|click|link|example)\b/i

const URGENCY =
  /\b(?:urgent(?:ly)?|immediately|right now|asap|within (?:\d+ ?(?:min|hour|s)|\d+ ?m)|next \d+ ?(?:min|hour)|expires? (?:today|in \d+)|ends? today|last chance|final (?:warning|notice)|acting? now)\b/i

const FINANCIAL_ASK =
  /\b(?:send|pay|transfer|pay up|deposit)\b[^.!?]{0,60}\b(?:money|₹|\d|upi|account)\b|\b(?:send|pay)\s+(?:₹|rs\.?|\d)/i

const PERSON_IN_DISTRESS =
  /\b(?:i(?:'m| am) (?:stuck|in trouble|in danger|arrested|detained|hospital)|help me|bail|lawyer|police station)\b/i

/** Fear / compromise claim: someone asserts your device or account is broken or at risk. */
const DEVICE_FEAR =
  /\b(?:computer|phone|laptop|device|system|account|email)\b[^.!?]{0,40}\b(?:infected|compromised|hacked|breach(?:ed)?|virus|malware|ransomware|under attack|at risk)\b|\b(?:virus|malware|ransomware|hack(?:er|ing)?)\b[^.!?]{0,25}\b(?:found|detected|on your (?:computer|phone|device|account)|in your (?:computer|phone|device|account))\b/i

function detect(regex: RegExp, text: string): boolean {
  return regex.test(text)
}

function evidenceSnippet(text: string, regex: RegExp): string {
  const match = regex.exec(text)
  if (!match) return ''
  const start = Math.max(0, match.index - 24)
  const end = Math.min(text.length, match.index + match[0].length + 24)
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `“…${snippet}…”`
}

/**
 * Contextual message-risk engine.
 *
 * Individual "scary" words (urgent, today, account, verify, payment) score
 * almost nothing on their own. Risk emerges from COMBINATIONS — e.g. urgency
 * plus a credential ask, or authority plus secrecy plus a threat — because
 * that is what manipulation actually looks like.
 */
export function analyzeMessage(text: string): MessageRiskAnalysis {
  const trimmed = (text ?? '').trim()
  if (!trimmed) {
    return {
      level: 'LOW',
      score: 0,
      signals: [],
      signalDetails: [],
      dangerousAction: 'No high-risk action detected',
      summary: 'No combined risk pattern detected.',
      recommendedAction: 'No action needed. Continue normally.',
    }
  }

  const signals: MessageRiskSignal[] = []
  const add = (condition: boolean, code: string, label: string, basePoints: number, evidence: string) => {
    if (!condition) return
    signals.push({ code, label, points: basePoints, evidence })
  }

  const hasUrgency = detect(URGENCY, trimmed)
  const hasCredentialAsk = detect(CREDENTIAL_REQUEST, trimmed)
  const hasCredentialMention = detect(CREDENTIAL_MENTION, trimmed)
  const hasAccountAction = detect(ACCOUNT_SECURITY_ACTION, trimmed)
  const hasThreat = detect(THREAT_CONSEQUENCE, trimmed)
  const hasSecrecy = detect(SECRECY_ISOLATION, trimmed)
  const hasAuthority = detect(AUTHORITY_CLAIM, trimmed)
  const hasRemoteAccess = detect(REMOTE_ACCESS, trimmed)
  const hasLink = detect(SUSPICIOUS_LINK, trimmed)
  const hasPaymentIdentifier = detect(PAYMENT_IDENTIFIER, trimmed)
  const hasMoneyRequest = detect(MONEY_REQUEST, trimmed) || detect(FINANCIAL_ASK, trimmed)
  const hasDistress = detect(PERSON_IN_DISTRESS, trimmed)
  const hasFear = detect(DEVICE_FEAR, trimmed)

  // ---- Individual signal detection (each worth little on its own) --------
  add(hasUrgency, 'urgency', 'Urgency', 8, evidenceSnippet(trimmed, URGENCY))
  add(hasLink, 'suspicious-link', 'Suspicious link', 8, hasLink ? evidenceSnippet(trimmed, SUSPICIOUS_LINK) : '')
  add(hasCredentialMention && !hasCredentialAsk, 'credential-mention', 'OTP / credential mentioned', 6, hasCredentialMention ? evidenceSnippet(trimmed, CREDENTIAL_MENTION) : '')
  add(hasPaymentIdentifier && !hasMoneyRequest, 'payment-mention', 'Payment reference', 6, hasPaymentIdentifier ? evidenceSnippet(trimmed, PAYMENT_IDENTIFIER) : '')
  add(hasAccountAction && !hasThreat, 'account-action', 'Account/security action requested', 8, hasAccountAction ? evidenceSnippet(trimmed, ACCOUNT_SECURITY_ACTION) : '')
  add(hasDistress, 'distress-claim', 'Distress claim', 10, hasDistress ? evidenceSnippet(trimmed, PERSON_IN_DISTRESS) : '')
  add(hasFear, 'fear', 'Fear / device-compromise claim', 10, hasFear ? evidenceSnippet(trimmed, DEVICE_FEAR) : '')

  // ---- High-value manipulative asks (worth real points) ------------------
  add(hasCredentialAsk, 'credential-request', 'OTP / credential request', 30, hasCredentialAsk ? evidenceSnippet(trimmed, CREDENTIAL_REQUEST) : '')
  add(hasMoneyRequest, 'financial-request', 'Financial request', 25, hasMoneyRequest ? evidenceSnippet(trimmed, MONEY_REQUEST) : '')
  add(hasRemoteAccess, 'remote-access', 'Remote-access request', 28, hasRemoteAccess ? evidenceSnippet(trimmed, REMOTE_ACCESS) : '')
  add(hasAuthority, 'authority-claim', 'Authority impersonation', 22, hasAuthority ? evidenceSnippet(trimmed, AUTHORITY_CLAIM) : '')
  add(hasThreat, 'threat', 'Threat of consequence', 20, hasThreat ? evidenceSnippet(trimmed, THREAT_CONSEQUENCE) : '')
  add(hasSecrecy, 'secrecy', 'Secrecy / isolation', 20, hasSecrecy ? evidenceSnippet(trimmed, SECRECY_ISOLATION) : '')

  // ---- Combination multipliers: the heart of the cognitive engine --------
  let score = signals.reduce((total, signal) => Math.min(15, signal.points), 0)
  // Recompute honestly: individual signals are capped in value; the total
  // comes from combinations. Start from zero and add capped contributions.
  score = 0
  const individualCodes = new Set(['urgency', 'suspicious-link', 'credential-mention', 'payment-mention', 'account-action', 'distress-claim', 'fear'])
  // A concrete dangerous ask (credential/financial/remote access) is never
  // "harmless on its own" — floor it at CAUTION weight. Context signals stay
  // capped lower so single words like "urgent" or "account" can't spike risk.
  const askCodes = new Set(['credential-request', 'financial-request', 'remote-access'])
  for (const signal of signals) {
    const cap = individualCodes.has(signal.code) ? 10 : askCodes.has(signal.code) ? 20 : 15
    score += Math.min(cap, signal.points)
  }

  const has = (code: string) => signals.some((signal) => signal.code === code)

  // Urgency + a concrete ask (credential, money, remote access)
  if (hasUrgency && (has('credential-request') || has('financial-request') || has('remote-access'))) score += 15
  // Threat + any ask → classic phishing pressure
  if (hasThreat && (has('credential-request') || has('financial-request') || has('account-action'))) score += 15
  // Secrecy + any ask → isolation scam hallmark
  if (hasSecrecy && (has('credential-request') || has('financial-request') || has('remote-access'))) score += 15
  // Fear/compromise claim + concrete ask → tech-support / fake-security scam
  if (hasFear && (has('credential-request') || has('financial-request') || has('remote-access'))) score += 10
  // Authority impersonation + threat of consequence → digital-arrest pressure
  if (hasAuthority && hasThreat) score += 15
  // Authority + secrecy + (threat OR ask) → digital-arrest pattern
  if (hasAuthority && hasSecrecy && (hasThreat || has('financial-request') || has('remote-access'))) score += 20
  // Distress + money → emergency-impersonation ("dad in jail") pattern
  if (hasDistress && has('financial-request')) score += 15
  // Link + urgency/account-action → phishing lure
  if (hasLink && (hasUrgency || has('account-action'))) score += 10
  // Threat of consequence + a link to "fix" it → classic act-now phishing lure
  if (hasThreat && hasLink) score += 10

  score = Math.min(100, Math.max(0, score))

  const level: MessageRiskLevel =
    score >= 75 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'CAUTION' : 'LOW'

  const dangerousAction = has('credential-request')
    ? 'Share an OTP, PIN, or account credentials'
    : has('remote-access')
      ? 'Install software or grant remote access to your device'
      : has('financial-request')
        ? 'Send money or share payment details'
        : has('authority-claim') && hasSecrecy
          ? 'Stay on the call and comply with an unverified authority figure'
          : has('account-action')
            ? 'Update account details through an unverified channel'
            : hasLink
              ? 'Open an unverified link'
              : 'No high-risk action detected'

  const summary =
    level === 'LOW'
      ? 'No combined risk pattern detected.'
      : level === 'CAUTION'
        ? 'A few weak signals — worth a quick look, but nothing demanding immediate action.'
        : `${signals.length} manipulation signals combine around one action: ${dangerousAction.toLowerCase()}.`

  const recommendedAction =
    level === 'LOW'
      ? 'No intervention needed. Continue normally.'
      : level === 'CAUTION'
        ? 'Pause briefly and verify before acting.'
        : level === 'HIGH'
          ? 'Pause. Verify the sender through a channel you control before doing anything asked here.'
          : 'Do not act on this message. TrustPause has paused the action — verify through an official channel first.'

  return {
    level,
    score,
    signals: signals.map((signal) => signal.label),
    signalDetails: signals,
    dangerousAction,
    summary,
    recommendedAction,
  }
}
