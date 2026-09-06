import type { RiskAnalysis } from './api-types'

export type PaymentRiskRequest = {
  amount?: number | null
  recipient?: string | null
  isNewRecipient?: boolean
  pressureSignals?: string[]
}

const PRESSURE_TERMS = new Set([
  'urgent',
  'immediately',
  'now',
  'today',
  'asap',
  'hurry',
  "don't call",
  'do not call',
  "don't tell anyone",
  'do not tell anyone',
  'keep this quiet',
  'secret',
  'new number',
  'new account',
  'new upi',
  'unverified',
])

export type PaymentRiskResponse = RiskAnalysis & {
  dangerousAction: string
  isNewRecipient: boolean
  amountFlagged: boolean
}

export function analyzePaymentRequest(input: PaymentRiskRequest): PaymentRiskResponse {
  const recipient = String(input?.recipient ?? '')
  const isNewRecipient = Boolean(input?.isNewRecipient)
  const amount = Number(input?.amount)
  const amountFlagged = !Number.isNaN(amount) && amount > 0
  const pressureSignals = Array.isArray(input?.pressureSignals) ? input.pressureSignals : []

  const normalizedRecipient = recipient.toLowerCase()
  const normalizedPressure = pressureSignals.map((s) => String(s).toLowerCase())

  const detectedSignals: { code: string; label: string; points: number }[] = []
  let score = 0

  const add = (code: string, label: string, points: number) => {
    detectedSignals.push({ code, label, points })
    score += points
  }

  if (isNewRecipient) {
    add('new-recipient', 'Recipient has not been paid before', 26)
  }

  if (amountFlagged && amount >= 10000) {
    add('large-amount', 'Unusually large payment amount', 20)
  } else if (amountFlagged && amount >= 1000) {
    add('moderate-amount', 'Payment amount warrants a pause', 10)
  }

  if (
    PRESSURE_TERMS.has(normalizedRecipient) ||
    pressureSignals.some((s) => PRESSURE_TERMS.has(s as string))
  ) {
    add('pressure', 'Request includes urgency or secrecy language', 25)
  } else if (pressureSignals.length > 0) {
    add('pressure-context', 'Pressure context provided', 15)
  }

  if (
    /@/.test(normalizedRecipient) ||
    /upi|phonepe|paytm|tez|intent|send|pay|transfer|wallet/i.test(normalizedRecipient)
  ) {
    add('payment-intent', 'Message contains payment or account-action language', 22)
  }

  if (
    /otp|one[- ]time|passcode|pin|password|verify|credential|screen share|remote access|anydesk|teamviewer/i.test(
      normalizedRecipient
    )
  ) {
    add('secret-or-access', 'Message asks for secrets or remote access', 30)
  }

  score = Math.min(100, Math.max(0, score))

  const riskLevel =
    score >= 75
      ? 'CRITICAL'
      : score >= 45
        ? 'HIGH'
        : score >= 20
          ? 'CAUTION'
          : 'LOW'

  const explanation =
    detectedSignals.length === 0
      ? 'No common payment-risk signals were detected in this request.'
      : `${detectedSignals.map((s) => s.label).join(', ')}. These signals do not prove intent, but they make pausing and verifying worthwhile.`

  const dangerousAction =
    detectedSignals.some((s) => s.code === 'secret-or-access')
      ? 'Share an OTP, PIN, password, or screen access'
      : detectedSignals.some((s) => s.code === 'payment-intent')
        ? 'Send money or change payment details'
        : 'Proceed with an unverified payment'

  const recommendedAction =
    riskLevel === 'LOW'
      ? 'Review the recipient and continue only if you recognize it.'
      : 'Verify the recipient through a separate channel before paying. Do not send money based only on this request.'

  return {
    riskLevel,
    score,
    detectedSignals,
    explanation,
    recommendedAction,
    shouldInterrupt: riskLevel === 'HIGH' || riskLevel === 'CRITICAL',
    dangerousAction,
    isNewRecipient,
    amountFlagged,
  }
}
