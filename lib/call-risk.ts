export type CallRiskLevel = 'LOW' | 'CAUTION' | 'HIGH' | 'CRITICAL'

export type CallRiskSignal = {
  code: string
  label: string
  points: number
  /** What the signal looks like in the call, shown in the UI "why" list. */
  evidence: string
}

export type CallRiskAnalysis = {
  level: CallRiskLevel
  score: number
  signals: string[]
  signalDetails: CallRiskSignal[]
  dangerousAction: string
  summary: string
  recommendedAction: string
  shouldInterrupt: boolean
}

export type CallRiskInput = {
  callerNumber?: string | null
  claimedName?: string | null
  /** Whether the number is in the user's contacts. */
  inContacts?: boolean
  /** Whether the caller's identity was independently verified. */
  callerVerified?: boolean
  /** Whether the number shows signs of caller-ID spoofing. */
  spoofPossible?: boolean
  /** What the caller claims/asks for, used for contextual analysis. */
  transcript?: string | null
}

/** Authority claim: someone asserts they are an official / organization. */
const AUTHORITY_CLAIM =
  /\b(?:this is|speaking|calling from|from the|i am|i'm)\b[^.!?]{0,40}\b(?:police|cbi|cyber ?cell|crime branch|enforcement|ed|income ?tax|rbi|bank|security team|fraud department|insurance|government|customs|narcotics|telecom|support team|it department)\b|\b(?:police officer|cbi officer|cybercrime officer|customs officer|government official|fraud team|security team)\b/i

/** Police / government impersonation specifically. */
const POLICE_AUTHORITY =
  /\b(?:police|cbi|cyber ?cell|crime branch|cybercrime|enforcement directorate|income tax|customs officer|government)\b/i

/** Bank impersonation specifically. */
const BANK_CLAIM =
  /\b(?:bank|hdfc|sbi|icici|axis|kotak|rbi|upi|card)\b/i

/** OTP / PIN / password request — an ask, not a mere mention. */
const CREDENTIAL_REQUEST =
  /\b(?:share|send|give|tell me|enter|confirm|read(?: back)?|provide|verify)\b[^.!?]{0,40}\b(?:otp|one[- ]time|passcode|pin|password|cvv|card number|credentials|mpin)\b|\b(?:otp|pin|password|mpin)\b[^.!?]{0,30}\b(?:immediately|now|urgent|to verify|verify)\b/i

/** Financial / payment request. */
const PAYMENT_REQUEST =
  /\b(?:send|pay|transfer|deposit|invest|pay up)\b[^.!?]{0,50}\b(?:money|₹|rs\.?|amount|fee|fine|bail|payment|upi|account)\b|\b(?:pay|send)\s+(?:₹|rs\.?|\d)/i

/** Secrecy / isolation pressure. */
const SECRECY_ISOLATION =
  /\b(?:don'?t|do not|never|stop)\b[^.!?]{0,30}\b(?:call|tell|inform|contact|discuss|speak|talk|hang up|disconnect)\b|\b(?:keep (?:this|it) (?:quiet|secret|between)|between us|don'?t tell (?:anyone|mom|your (?:family|parents))|stay on (?:the|this) call|do not (?:leave|disconnect|hang up))\b/i

/** Threat of consequence — arrest, case, blocked account, legal action. */
const THREAT_CONSEQUENCE =
  /\b(?:account|card|wallet|number|sim|aadhaar|pan)\b[^.!?]{0,40}\b(?:blocked|suspended|closed|frozen|deactivated|disabled|barred|compromised|hacked)\b|\b(?:police (?:case|complaint)|legal action|arrest(?:ed)?|warrant|criminal case|money laundering|tax evasion|penalty|fine)\b/i

/** Remote access / screen sharing / app install request. */
const REMOTE_ACCESS =
  /\b(?:anydesk|teamviewer|quick ?support|screen ?shar|remote (?:access|support|desktop)|install (?:this|the|an) app|download (?:this|the|an) app|give me access)\b/i

/** Urgency. */
const URGENCY =
  /\b(?:urgent(?:ly)?|immediately|right now|asap|within \d+ ?(?:min|hour)|now or|must (?:act|do it) now|last chance|final (?:warning|notice))\b/i

/** Fear / compromise claim about the user's device or account. */
const FEAR_CLAIM =
  /\b(?:your (?:computer|phone|laptop|device|system|account|aadhaar|pan|upi))\b[^.!?]{0,50}\b(?:compromised|hacked|breach(?:ed)?|infected|virus|malware|ransomware|under attack|at risk|suspicious activity|unusual activity|linked to a (?:criminal case|crime))\b|\b(?:virus|malware|ransomware|hack(?:er|ing))\b[^.!?]{0,25}\b(?:found|detected)\b/i

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
 * Call Guardian risk engine.
 *
 * Being unknown is NOT risky on its own: an unknown caller with no other
 * signals lands LOW/CAUTION. Risk emerges from COMBINATIONS — e.g. authority
 * impersonation plus a credential ask, or spoofing plus a financial request —
 * because that is what call manipulation actually looks like.
 */
export function analyzeCall(input: CallRiskInput): CallRiskAnalysis {
  const callerNumber = String(input?.callerNumber ?? '').trim()
  const claimedName = String(input?.claimedName ?? '').trim()
  const transcript = String(input?.transcript ?? '').trim()
  const inContacts = Boolean(input?.inContacts)
  const callerVerified = Boolean(input?.callerVerified)
  const spoofPossible = Boolean(input?.spoofPossible)

  const signals: CallRiskSignal[] = []
  const add = (condition: boolean, code: string, label: string, points: number, evidence: string) => {
    if (!condition) return
    signals.push({ code, label, points, evidence })
  }

  // ---- Structured caller facts (low value on their own) ----------------
  add(!inContacts, 'unknown-caller', 'Caller is not in your contacts', 8, callerNumber ? `Number ${callerNumber} is not in contacts` : 'Caller is not in your contacts')
  add(!callerVerified, 'not-verified', 'Caller identity not independently verified', 8, 'No verification through an official channel yet')
  add(spoofPossible, 'spoof-possible', 'Possible caller-ID spoofing', 15, 'Number shows signs of caller-ID spoofing')

  // ---- Transcript-derived signals (capped individually) ----------------
  const hasAuthority = detect(AUTHORITY_CLAIM, transcript)
  const hasPolice = detect(POLICE_AUTHORITY, transcript)
  const hasBank = detect(BANK_CLAIM, transcript)
  const hasCredentialAsk = detect(CREDENTIAL_REQUEST, transcript)
  const hasPaymentAsk = detect(PAYMENT_REQUEST, transcript)
  const hasSecrecy = detect(SECRECY_ISOLATION, transcript)
  const hasThreat = detect(THREAT_CONSEQUENCE, transcript)
  const hasRemoteAccess = detect(REMOTE_ACCESS, transcript)
  const hasUrgency = detect(URGENCY, transcript)
  const hasFear = detect(FEAR_CLAIM, transcript)

  add(hasAuthority, 'authority-claim', 'Authority impersonation', 15, hasAuthority ? evidenceSnippet(transcript, AUTHORITY_CLAIM) : '')
  add(hasPolice, 'police-authority', 'Police / government impersonation', 8, hasPolice ? evidenceSnippet(transcript, POLICE_AUTHORITY) : '')
  add(hasBank, 'bank-impersonation', 'Bank impersonation', 8, hasBank ? evidenceSnippet(transcript, BANK_CLAIM) : '')
  add(hasCredentialAsk, 'credential-request', 'Requests OTP / PIN / password', 22, hasCredentialAsk ? evidenceSnippet(transcript, CREDENTIAL_REQUEST) : '')
  add(hasPaymentAsk, 'payment-request', 'Requests payment or financial details', 18, hasPaymentAsk ? evidenceSnippet(transcript, PAYMENT_REQUEST) : '')
  add(hasRemoteAccess, 'remote-access', 'Requests remote access or app install', 22, hasRemoteAccess ? evidenceSnippet(transcript, REMOTE_ACCESS) : '')
  add(hasSecrecy, 'secrecy', 'Secrecy / isolation', 15, hasSecrecy ? evidenceSnippet(transcript, SECRECY_ISOLATION) : '')
  add(hasThreat, 'threat', 'Threat of consequence', 15, hasThreat ? evidenceSnippet(transcript, THREAT_CONSEQUENCE) : '')
  add(hasUrgency, 'urgency', 'Urgency', 8, hasUrgency ? evidenceSnippet(transcript, URGENCY) : '')
  add(hasFear, 'fear', 'Fear / compromise claim', 10, hasFear ? evidenceSnippet(transcript, FEAR_CLAIM) : '')

  // ---- Score: capped individual contributions + combination bonuses -----
  let score = 0
  const contextCodes = new Set(['urgency', 'fear'])
  const askCodes = new Set(['credential-request', 'payment-request', 'remote-access'])
  for (const signal of signals) {
    const cap = contextCodes.has(signal.code) ? 10 : askCodes.has(signal.code) ? 22 : 15
    score += Math.min(cap, signal.points)
  }

  const has = (code: string) => signals.some((signal) => signal.code === code)
  const anyAsk = has('credential-request') || has('payment-request') || has('remote-access')

  // Authority + threat → digital-arrest pressure
  if (hasAuthority && hasThreat) score += 15
  // Authority + secrecy + (threat OR ask) → digital-arrest pattern
  if (hasAuthority && hasSecrecy && (hasThreat || anyAsk)) score += 20
  // Bank + credential/payment ask → bank-impersonation scam
  if (hasBank && (hasCredentialAsk || hasPaymentAsk)) score += 15
  // Spoofing + any ask → spoofed caller demanding something
  if (spoofPossible && anyAsk) score += 10
  // Urgency + any ask → classic phone-pressure
  if (hasUrgency && anyAsk) score += 15
  // Fear/compromise claim + any ask → fake security / tech-support scam
  if (hasFear && anyAsk) score += 10

  score = Math.min(100, Math.max(0, score))

  const level: CallRiskLevel =
    score >= 75 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'CAUTION' : 'LOW'

  const dangerousAction = has('credential-request')
    ? 'Share an OTP, PIN, password, or card details over the call'
    : has('remote-access')
      ? 'Install software or grant remote access / screen sharing'
      : has('payment-request')
        ? 'Transfer money or share payment details'
        : has('authority-claim') && hasSecrecy
          ? 'Stay on the call and comply with an unverified authority figure'
          : has('threat')
            ? 'Act out of fear of a threatened consequence'
            : 'Trust unverified caller information'

  const summary =
    level === 'LOW'
      ? 'No combined risk pattern detected — an unknown caller on its own is not suspicious.'
      : level === 'CAUTION'
        ? 'A few weak signals — worth a quick check, but nothing demanding immediate action.'
        : `${signals.length} manipulation signals combine around one action: ${dangerousAction.toLowerCase()}.`

  const recommendedAction =
    level === 'LOW'
      ? 'No intervention needed. Continue the call normally.'
      : level === 'CAUTION'
        ? 'Treat the call with care — confirm the caller’s identity through an official channel before sharing anything.'
        : level === 'HIGH'
          ? 'Verify the caller through a separate, official channel before continuing. Real organizations never demand OTPs, secrecy, or immediate payment on a cold call.'
          : 'End the call now. Contact the organization using an official number you look up yourself — never a number the caller provides.'

  return {
    level,
    score,
    signals: signals.map((signal) => signal.label),
    signalDetails: signals,
    dangerousAction,
    summary,
    recommendedAction,
    shouldInterrupt: level === 'HIGH' || level === 'CRITICAL',
  }
}