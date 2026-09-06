import { NextRequest, NextResponse } from 'next/server'
import { analyzeLinkApi } from '@/lib/server-link-analysis'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = await analyzeLinkApi(body)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('A non-empty')) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    console.error('link-risk analysis failed:', error)
    return NextResponse.json(
      { error: 'Link risk analysis failed.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
