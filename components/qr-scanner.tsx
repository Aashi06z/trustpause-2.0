'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Check, FileImage, QrCode, RotateCcw, ShieldCheck, Square, X } from 'lucide-react'
import QrScanner from 'qr-scanner'
import { fetchJson } from '@/lib/api-client'
import { classifyQrContentKind } from '@/lib/qr-content-classifier'
import type { QrRiskResponse } from '@/lib/server-qr-analysis' // eslint-disable-line

type ScannerState = 'idle' | 'starting' | 'scanning' | 'detected' | 'denied' | 'unsupported' | 'error'

type ClassificationState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; value: QrClassification }

export type QrClassification = {
  kind: 'url' | 'plain-text' | 'unsupported'
  input: string
  riskLevel: string
  score: number
  /** SAFE | UNKNOWN | SUSPICIOUS | DANGEROUS | INVALID — from the server engine. */
  classification: string
  shouldInterrupt: boolean
  explanation: string
  recommendedAction: string
  normalizedUrl: string | null
}

function isHttpUrl(value: string) {
  return classifyQrContentKind(value).kind === 'url'
}

export default function QrCodeScanner({ onUrlDecoded }: { onUrlDecoded?: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scanningBusyRef = useRef(false)
  const [state, setState] = useState<ScannerState>('idle')
  const [error, setError] = useState('')
  const [decodedValue, setDecodedValue] = useState('')
  const [classification, setClassification] = useState<ClassificationState>({ status: 'none' })
  const [previewLimited, setPreviewLimited] = useState(false)

  useEffect(() => () => {
    stopScanLoop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  function stopScanLoop() {
    if (scanLoopRef.current) {
      clearInterval(scanLoopRef.current)
      scanLoopRef.current = null
    }
    scanningBusyRef.current = false
  }

  function startScanLoop() {
    if (scanLoopRef.current) return
    scanLoopRef.current = setInterval(() => {
      const video = videoRef.current
      if (!video || video.readyState < 2 || scanningBusyRef.current) return
      scanningBusyRef.current = true
      // Decode the current frame; throws when no QR code is visible.
      QrScanner.scanImage(video, { returnDetailedScanResult: true })
        .then((result) => {
          console.log('[QR CAMERA RAW]', JSON.stringify(result.data))
          handleDecoded(result.data)
        })
        .catch(() => {})
        .finally(() => { scanningBusyRef.current = false })
    }, 500)
  }

  async function startCamera() {
    if (!videoRef.current || streamRef.current) return
    setError('')
    setState('starting')
    try {
      if (!window.isSecureContext) {
        setState('unsupported')
        setError('Camera access requires a secure (https or localhost) page. You can still upload a QR image below.')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported')
        setError('This browser does not support camera access. You can still upload a QR image below.')
        return
      }
      // Attach the live feed directly — the standard, reliable path. The
      // qr-scanner library's own start() can hang in embedded browsers,
      // so it is only used here for frame decoding. A watchdog keeps a slow
      // or silent permission prompt from leaving the panel stuck forever.
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new DOMException('Camera request timed out.', 'TimeoutError')), 8000)),
      ])
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      // Fire-and-forget: awaiting play() can stall on hidden video elements.
      void video.play().catch(() => {})
      setState('scanning')
      setPreviewLimited(false)
      startScanLoop()
      // Embedded preview sandboxes can grant the camera but never composite
      // frames into the video element. Surface that honestly instead of
      // pretending to scan — the upload path still goes through full analysis.
      setTimeout(() => {
        const current = videoRef.current
        if (current && streamRef.current && current.videoWidth === 0) setPreviewLimited(true)
      }, 4000)
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      const message = cause instanceof Error ? cause.message.toLowerCase() : String(cause).toLowerCase()
      if (message.includes('permission') || message.includes('denied') || message.includes('notallowed')) {
        setState('denied')
        setError('Camera permission was denied. You can still upload a QR image below.')
      } else {
        setState('error')
        setError('Camera scanning is unavailable here. You can still upload a QR image below.')
      }
    }
  }

  function stopCamera() {
    stopScanLoop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setPreviewLimited(false)
    setState('idle')
  }

  async function classifyQrContent(value: string) {
    // Analyze the clean leading URL, not the raw decoded string (which can
    // carry trailing text/control characters from a real camera decode).
    const classification = classifyQrContentKind(value)
    const analyzeValue = classification.kind === 'url' && classification.url ? classification.url : value
    const localIsHttp = isHttpUrl(value)
    // Fallback used only when the risk API is unreachable. It never claims a
    // URL is safe — an unverified destination stays UNKNOWN (CAUTION).
    const localFallback: QrRiskResponse = localIsHttp
      ? {
          kind: 'url',
          input: value,
          riskLevel: 'CAUTION',
          score: 0,
          classification: 'UNKNOWN',
          shouldInterrupt: false,
          explanation: 'Server analysis was unavailable, so this destination could not be verified. It is unverified, not safe.',
          recommendedAction: 'Check the address manually in Link Guardian before opening it.',
          detectedSignals: [],
          displayedHostname: value,
          normalizedUrl: value,
          isPrivateTarget: false,
          isValid: true,
          canOpenAnyway: true,
        }
      : {
          kind: 'plain-text',
          input: value,
          riskLevel: 'LOW',
          score: 0,
          classification: 'SAFE',
          shouldInterrupt: false,
          explanation: 'This QR code contains plain text. TrustPause never opens plain-text content automatically.',
          recommendedAction: 'Review the text manually and decide whether to act on it.',
          detectedSignals: [],
        }

    const server = await fetchJson<QrRiskResponse>('/api/qr-risk', { content: analyzeValue }, () => localFallback)
    const normalizedUrl = server.kind === 'url' ? server.normalizedUrl ?? null : null
    return {
      kind: server.kind,
      input: server.input,
      riskLevel: server.riskLevel,
      score: server.score,
      classification: 'classification' in server ? server.classification : 'UNKNOWN',
      shouldInterrupt: server.shouldInterrupt,
      explanation: server.explanation,
      recommendedAction: server.recommendedAction,
      normalizedUrl,
    }
  }

  async function handleDecoded(value: string) {
    const decodedKind = classifyQrContentKind(value)
    console.log('[QR CAMERA RAW]', JSON.stringify(value))
    console.log('[QR CAMERA CLASSIFICATION]', JSON.stringify({ kind: decodedKind.kind, scheme: decodedKind.scheme, url: decodedKind.url }))
    stopScanLoop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setPreviewLimited(false)
    setState('detected')
    setDecodedValue(value)
    setClassification({ status: 'loading' })
    try {
      const result = await classifyQrContent(value)
      console.log('[QR UI TYPE]', JSON.stringify(result.kind))
      setClassification({ status: 'done', value: result })
    } catch (error) {
      console.log('[QR UI TYPE] error', error instanceof Error ? error.message : String(error))
      setClassification({
        status: 'error',
        message: error instanceof Error ? error.message : 'QR analysis failed. Review the content manually before acting.',
      })
    }
    if (decodedKind.kind === 'url') onUrlDecoded?.(decodedKind.url ?? value)
  }

  async function scanUpload(file: File) {
    setError('')
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
      console.log('[QR CAMERA RAW]', JSON.stringify(result.data))
      await handleDecoded(result.data)
    } catch {
      setState('error')
      setError('No readable QR code was found in that image.')
    }
  }

  const decodedKind = classifyQrContentKind(decodedValue)
  const urlResult = decodedKind.kind === 'url'
  const unsupportedContent = decodedKind.kind === 'unsupported'

  return <section className="qr-scanner card" aria-labelledby="qr-scanner-title">
    <div className="card-heading"><div><p className="eyebrow">LOCAL SCAN</p><h2 id="qr-scanner-title">QR Guardian</h2><p className="muted">Scan with your camera or upload an image. TrustPause never opens decoded content automatically.</p></div><div className="guardian-icon" aria-hidden="true"><QrCode size={19} /></div></div>
    <div className="qr-scanner-layout">
      <div className="qr-camera-panel">
        <div className="qr-video-frame">{state !== 'scanning' && <div className="qr-camera-placeholder"><Camera size={25} /><span>{state === 'starting' ? 'Requesting camera permission...' : state === 'detected' ? 'QR code detected — camera stopped.' : state === 'unsupported' ? 'Camera not supported in this browser.' : state === 'denied' ? 'Camera permission denied.' : 'Camera is off.'}</span></div>}<video ref={videoRef} className={state === 'scanning' ? 'qr-video visible' : 'qr-video'} autoPlay muted playsInline aria-label="QR code camera preview" /></div>
        {previewLimited && state === 'scanning' && (
          <p className="qr-safety-note" role="status"><Camera size={14} /> The embedded preview cannot render camera frames. Open the full preview in a regular browser tab to scan live, or use Upload QR image — both go through the same risk analysis.</p>
        )}
        <div className="qr-controls">{state === 'scanning' ? <button className="secondary" onClick={stopCamera}><Square size={14} /> Stop camera</button> : <button className="primary" onClick={() => { void startCamera() }} disabled={state === 'starting'}><Camera size={14} /> {state === 'starting' ? 'Starting...' : 'Use camera'}</button>}<label className="secondary qr-upload"><FileImage size={14} /> Upload QR image<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void scanUpload(file); event.currentTarget.value = '' }} /></label></div>
        {error && <p className="qr-error" role="alert">{error}</p>}
        <p className="muted" style={{ marginTop: 8 }}><b>Upload QR image</b> runs the same decode → risk-analysis pipeline as the camera and works everywhere.</p>
      </div>
      <div className="qr-result-panel" aria-live="polite">
        {!decodedValue ? (
          <div className="qr-empty"><QrCode size={23} /><p>Decoded content will appear here.</p><span>Review it before taking any action.</span></div>
        ) : (
          <>
            <div className="qr-result-heading">
              <div>
                <p className="eyebrow">DECODED CONTENT</p>
                <h3>{urlResult ? 'DECODED URL' : unsupportedContent ? 'Unsupported content' : 'Plain text'}</h3>
              </div>
              <button className="icon-button" onClick={() => { setDecodedValue(''); setClassification({ status: 'none' }) }} aria-label="Clear decoded QR content"><X size={16} /></button>
            </div>
            <div className="qr-decoded-value">{decodedValue}</div>
            {classification.status === 'loading' && (
              <div className="qr-safety-note" role="status"><QrCode size={14} /> Analyzing with TrustPause…</div>
            )}
            {classification.status === 'error' && (
              <p className="qr-error" role="alert">{classification.message}</p>
            )}
            {classification.status === 'done' ? (
              classification.value.kind === 'url' ? (
                <>
                  <p className="qr-safety-note"><ShieldCheck size={14} /> This HTTP(S) destination was checked by TrustPause. It has not been opened automatically.</p>
                  <div className="qr-result-status">
                    <strong style={{ color: classification.value.shouldInterrupt ? 'var(--red)' : 'var(--green)' }}>{classification.value.riskLevel}</strong>
                    <span>{classification.value.score}/100</span>
                    <span className="link-result-action">{classification.value.classification}</span>
                  </div>
                  <p className="qr-safety-note">{classification.value.shouldInterrupt ? <strong style={{ color: 'var(--red)' }}>Pause recommended.</strong> : classification.value.classification === 'UNKNOWN' ? <strong>Unverified — not confirmed safe.</strong> : <strong style={{ color: 'var(--green)' }}>No strong warning signals.</strong>} {classification.value.explanation}</p>
                  {classification.value.normalizedUrl ? <p className="qr-safety-note"><b style={{ font: '11px var(--font-mono)' }}>Real address:</b> {classification.value.normalizedUrl}</p> : null}
                  <p className="qr-safety-note"><Check size={14} /> {classification.value.recommendedAction}</p>
                </>
              ) : classification.value.kind === 'unsupported' ? (
                <>
                  <p className="qr-safety-note" role="alert"><ShieldCheck size={14} /> {classification.value.explanation}</p>
                  <p className="qr-safety-note"><Check size={14} /> {classification.value.recommendedAction}</p>
                </>
              ) : (
                <p className="qr-safety-note"><Check size={14} /> {classification.value.explanation} Review it before taking any action.</p>
              )
            ) : null}
            {classification.status === 'none' ? (
              urlResult ? (
                <>
                  <p className="qr-safety-note"><ShieldCheck size={14} /> This HTTP(S) destination has been placed in Link Guardian. It has not been opened.</p>
                  <p className="qr-safety-note"><Check size={14} /> Review the Link Guardian result above before taking any action.</p>
                </>
              ) : (
                <p className="qr-safety-note"><Check size={14} /> This is displayed as plain text only. TrustPause will not interpret or open it.</p>
              )
            ) : null}
          </>
        )}
      </div>
    </div>
    <details className="qr-demo-details"><summary>Prepared demo QR code</summary><div className="qr-demo-content"><img src="/trustpause-demo-qr.svg" alt="Demo QR code containing an HTTPS TrustPause example URL" /><p className="muted">This demo code contains <strong>https://example.com/trustpause-demo</strong>. Scan it with a phone or upload the image to test the Link Guardian handoff.</p></div></details>
    <p className="qr-privacy-note"><RotateCcw size={13} /> Camera access is requested only when you press Use camera and is stopped when scanning ends or this panel closes.</p>
  </section>
}
