import { NextRequest, NextResponse } from 'next/server'
import { analyzeMessageApi } from '@/lib/server-message-analysis'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = analyzeMessageApi(body)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('A non-empty')) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    console.error('message-risk analysis failed:', error)
    return NextResponse.json(
      { error: 'Message risk analysis failed.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
