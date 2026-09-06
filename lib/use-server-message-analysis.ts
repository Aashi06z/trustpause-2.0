'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchJson } from '@/lib/api-client'
import { analyzeMessage, type MessageRiskAnalysis } from '@/lib/message-risk'
import type { MessageRiskResponse } from '@/lib/server-message-analysis'

export type ServerAnalysisState = {
  /** True while a server request is in flight. */
  checking: boolean
  /** True when the shown result came from the server API. */
  fromServer: boolean
  /** Set when the server could not be reached and local analysis was used. */
  fallbackUsed: boolean
  error: string | null
}

const EMPTY_STATE: ServerAnalysisState = { checking: false, fromServer: false, fallbackUsed: false, error: null }

function toLocalShape(analysis: MessageRiskAnalysis, fallbackUsed: boolean, error: string | null) {
  return {
    state: { ...EMPTY_STATE, checking: false, fromServer: !fallbackUsed, fallbackUsed, error } as ServerAnalysisState,
    result: analysis,
  }
}

function serverToLocal(response: MessageRiskResponse): MessageRiskAnalysis {
  return {
    level: response.riskLevel,
    score: response.score,
    signals: response.detectedSignals.map((signal) => signal.label),
    signalDetails: response.detectedSignals.map((signal) => ({
      code: signal.code,
      label: signal.label,
      points: signal.points,
      evidence: signal.evidence ?? '',
    })),
    dangerousAction: response.dangerousAction,
    summary: response.explanation,
    recommendedAction: response.recommendedAction,
  }
}

/**
 * Automatically analyzes a message through POST /api/message-risk whenever the
 * text changes (debounced), with the server response as the source of truth.
 *
 * Guarantees:
 * - never shows a stale result from a previous message (response race guarded)
 * - no duplicate concurrent submissions for the same text
 * - brief analyzing state while in flight
 * - graceful degradation to the identical local engine when the API is down
 * - empty messages clear the result instead of hitting the API
 */
export function useServerMessageAnalysis(text: string, options: { debounceMs?: number } = {}) {
  const debounceMs = options.debounceMs ?? 450

  const [result, setResult] = useState<MessageRiskAnalysis | null>(null)
  const [state, setState] = useState<ServerAnalysisState>(EMPTY_STATE)
  const [refreshToken, setRefreshToken] = useState(0)
  const requestRef = useRef(0)
  const lastRequestedRef = useRef<string | null>(null)
  const inFlightRef = useRef<string | null>(null)
  /** Text whose result is currently stored in `result` — stale results are cleared on change. */
  const shownTextRef = useRef<string | null>(null)

  /** Forces a fresh server request even if the text is unchanged. */
  function reanalyze() {
    lastRequestedRef.current = null
    setRefreshToken((token) => token + 1)
  }

  useEffect(() => {
    const trimmed = (text ?? '').trim()

    // The moment the analyzed text changes, drop any result that belonged to
    // the previous message so the UI never flashes an old score for new text.
    if (!trimmed) {
      requestRef.current += 1
      lastRequestedRef.current = null
      inFlightRef.current = null
      setResult(null)
      setState(EMPTY_STATE)
      return
    }
    if (shownTextRef.current !== trimmed) {
      setResult(null)
      shownTextRef.current = trimmed
      lastRequestedRef.current = null // a cleared result must always re-analyze
    }

    // Avoid duplicate submissions for the same text (e.g. re-render storms).
    const requestKey = `${refreshToken}:${trimmed}`
    if (requestKey === lastRequestedRef.current || trimmed === inFlightRef.current) return

    const requestId = ++requestRef.current
    setState((current) => ({ ...current, checking: true, error: null }))

    const timer = window.setTimeout(async () => {
      if (requestRef.current !== requestId) return
      lastRequestedRef.current = requestKey
      inFlightRef.current = trimmed
      try {
        const response = await fetchJson<MessageRiskResponse | null>(
          '/api/message-risk',
          { text: trimmed },
          () => null,
        )
        if (requestRef.current !== requestId) return // stale response — discard
        const valid = response && typeof response.score === 'number' && Array.isArray(response.detectedSignals)
          ? serverToLocal(response)
          : null
        if (valid) {
          shownTextRef.current = trimmed
          setResult(valid)
          setState({ checking: false, fromServer: true, fallbackUsed: false, error: null })
        } else {
          shownTextRef.current = trimmed
          const local = analyzeMessage(trimmed)
          const shaped = toLocalShape(local, true, 'Server response was invalid; used on-device analysis.')
          setResult(shaped.result)
          setState(shaped.state)
        }
      } catch (error) {
        if (requestRef.current !== requestId) return
        shownTextRef.current = trimmed
        const local = analyzeMessage(trimmed)
        const shaped = toLocalShape(
          local,
          true,
          error instanceof Error ? error.message : 'TrustPause API unavailable; used on-device analysis.',
        )
        setResult(shaped.result)
        setState(shaped.state)
      } finally {
        if (inFlightRef.current === trimmed) inFlightRef.current = null
      }
    }, debounceMs)

    return () => window.clearTimeout(timer)
  }, [text, debounceMs, refreshToken])

  return { result, reanalyze, ...state }
}
