'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchJson } from '@/lib/api-client'
import { analyzeCall, type CallRiskAnalysis, type CallRiskInput } from '@/lib/call-risk'
import type { CallRiskResponse } from '@/lib/server-call-analysis'

export type CallAnalysisState = {
  /** True while a server request is in flight. */
  checking: boolean
  /** True when the shown result came from the server API. */
  fromServer: boolean
  /** True when the server could not be reached and local analysis was used. */
  fallbackUsed: boolean
  error: string | null
}

const EMPTY_STATE: CallAnalysisState = { checking: false, fromServer: false, fallbackUsed: false, error: null }

function toLocalShape(analysis: CallRiskAnalysis, fallbackUsed: boolean, error: string | null) {
  return {
    state: { ...EMPTY_STATE, checking: false, fromServer: !fallbackUsed, fallbackUsed, error } as CallAnalysisState,
    result: analysis,
  }
}

function serverToLocal(response: CallRiskResponse): CallRiskAnalysis {
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
    shouldInterrupt: response.shouldInterrupt,
  }
}

/**
 * Automatically analyzes an incoming call through POST /api/call-risk whenever
 * the call facts change (debounced), with the server response as the source of
 * truth. The call analysis path is shared — the same engine powers the web
 * prototype and the API, keeping the architecture compatible with a native
 * Android CallScreeningService integration.
 *
 * Guarantees:
 * - never shows a stale result from a previous call (response race guarded)
 * - no duplicate concurrent submissions for the same call facts
 * - brief analyzing state while in flight
 * - graceful degradation to the identical local engine when the API is down
 * - changing the caller facts re-analyzes from scratch
 */
export function useServerCallAnalysis(input: CallRiskInput, options: { debounceMs?: number } = {}) {
  const debounceMs = options.debounceMs ?? 350

  const [result, setResult] = useState<CallRiskAnalysis | null>(null)
  const [state, setState] = useState<CallAnalysisState>(EMPTY_STATE)
  const requestRef = useRef(0)
  const lastRequestedRef = useRef<string | null>(null)
  const inFlightRef = useRef<string | null>(null)
  /** Key of the input whose result is currently stored — stale results are cleared on change. */
  const shownKeyRef = useRef<string | null>(null)

  const inputKey = JSON.stringify({
    callerNumber: input?.callerNumber ?? '',
    claimedName: input?.claimedName ?? '',
    transcript: input?.transcript ?? '',
    inContacts: Boolean(input?.inContacts),
    callerVerified: Boolean(input?.callerVerified),
    spoofPossible: Boolean(input?.spoofPossible),
  })

  useEffect(() => {
    // The moment the call facts change, drop any result that belonged to the
    // previous call so the UI never flashes an old score for new call data.
    if (shownKeyRef.current !== inputKey) {
      setResult(null)
      shownKeyRef.current = inputKey
      lastRequestedRef.current = null // a cleared result must always re-analyze
    }

    // Avoid duplicate submissions for the same call facts (e.g. re-render storms).
    if (inputKey === lastRequestedRef.current || inputKey === inFlightRef.current) return

    const requestId = ++requestRef.current
    setState((current) => ({ ...current, checking: true, error: null }))

    const timer = window.setTimeout(async () => {
      if (requestRef.current !== requestId) return
      lastRequestedRef.current = inputKey
      inFlightRef.current = inputKey
      try {
        const response = await fetchJson<CallRiskResponse | null>(
          '/api/call-risk',
          {
            callerNumber: input?.callerNumber ?? '',
            claimedName: input?.claimedName ?? '',
            transcript: input?.transcript ?? '',
            inContacts: Boolean(input?.inContacts),
            callerVerified: Boolean(input?.callerVerified),
            spoofPossible: Boolean(input?.spoofPossible),
          },
          () => null,
        )
        if (requestRef.current !== requestId) return // stale response — discard
        const valid = response && typeof response.score === 'number' && Array.isArray(response.detectedSignals)
          ? serverToLocal(response)
          : null
        if (valid) {
          shownKeyRef.current = inputKey
          setResult(valid)
          setState({ checking: false, fromServer: true, fallbackUsed: false, error: null })
        } else {
          shownKeyRef.current = inputKey
          const local = analyzeCall(input)
          const shaped = toLocalShape(local, true, 'Server response was invalid; used on-device analysis.')
          setResult(shaped.result)
          setState(shaped.state)
        }
      } catch (error) {
        if (requestRef.current !== requestId) return
        shownKeyRef.current = inputKey
        const local = analyzeCall(input)
        const shaped = toLocalShape(
          local,
          true,
          error instanceof Error ? error.message : 'TrustPause API unavailable; used on-device analysis.',
        )
        setResult(shaped.result)
        setState(shaped.state)
      } finally {
        if (inFlightRef.current === inputKey) inFlightRef.current = null
      }
    }, debounceMs)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey, debounceMs])

  return { result, ...state }
}