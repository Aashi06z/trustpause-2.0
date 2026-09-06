import { NextRequest, NextResponse } from 'next/server'
import { analyzeCallApi } from '@/lib/server-call-analysis'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown> | null
    const result = analyzeCallApi(body ?? {})
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('A valid call-risk')) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message.startsWith('field ')) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    console.error('call-risk analysis failed:', error)
    return NextResponse.json(
      { error: 'Call risk analysis failed.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}