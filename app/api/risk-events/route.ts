import { NextRequest, NextResponse } from 'next/server'
import { recordRiskEvent, validateCreateRiskEventRequest } from '@/lib/server-risk-events'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = validateCreateRiskEventRequest(body)
    const record = await recordRiskEvent(validated)

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message.includes('required') || error instanceof Error && error.message.includes('must be one of')) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    console.error('risk-event recording failed:', error)
    return NextResponse.json(
      { error: 'Risk event recording failed.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
