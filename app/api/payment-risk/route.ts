import { NextRequest, NextResponse } from 'next/server'
import { analyzePaymentRequest } from '@/lib/server-payment-analysis'

const MAX_RECIPIENT_LENGTH = 4096

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 })
    }

    const recipient =
      typeof body.recipient === 'string' ? body.recipient.trim() : ''
    if (recipient.length > MAX_RECIPIENT_LENGTH) {
      return NextResponse.json({ error: `recipient must be ${MAX_RECIPIENT_LENGTH} characters or fewer.` }, { status: 413 })
    }

    const result = analyzePaymentRequest({
      amount: typeof body.amount === 'number' ? body.amount : undefined,
      recipient,
      isNewRecipient: typeof body.isNewRecipient === 'boolean' ? body.isNewRecipient : undefined,
      pressureSignals:
        Array.isArray(body.pressureSignals)
          ? body.pressureSignals.filter((s: unknown): s is string => typeof s === 'string')
          : undefined,
    })

    return NextResponse.json({ data: result, localOnly: true }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
}
