import { NextRequest, NextResponse } from 'next/server'
import { analyzeQrContent } from '@/lib/server-qr-analysis'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = await analyzeQrContent(body)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('A non-empty')) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    console.error('qr-risk analysis failed:', error)
    return NextResponse.json(
      { error: 'QR risk analysis failed.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
