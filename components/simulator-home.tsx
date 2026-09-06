'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Activity, AlertTriangle, AudioLines, Ban, Banknote, Check, ChevronDown, ChevronUp,
  Cpu, Eye, Fingerprint, HandCoins, Landmark, Link2, LockKeyhole, MessageSquare, Monitor, Phone, PhoneCall, PhoneOff,
  Play, Pause, RotateCcw, ShieldAlert, ShieldCheck, ShieldQuestion, Smartphone, Sparkles, Timer, Volume2, X, Zap,
} from 'lucide-react'
import { recordRiskEvent } from '@/lib/risk-events'
import { fetchJson } from '@/lib/api-client'
import { useServerCallAnalysis } from '@/lib/use-server-call-analysis'
import type { LinkRiskResponse } from '@/lib/server-link-analysis'
import type { PaymentRiskResponse } from '@/lib/server-payment-analysis'

/* ------------------------------------------------------------------ */
/* Types & shared helpers                                              */
/* ------------------------------------------------------------------ */

type ScenarioId = 'link' | 'payment' | 'call' | 'media'
type PlatformMode = 'mobile' | 'desktop'
type RiskTone = 'low' | 'amber' | 'critical'

type Signal = { label: string; detail: string; points: number }
type GuardianMeta = { id: ScenarioId; title: string; tagline: string; icon: typeof ShieldCheck }

const LAYER_NAMES = ['Silent Sense', 'Micro-Pause', 'Action Lock'] as const

const SCENARIOS: { id: ScenarioId; tab: string; hint: string; icon: typeof ShieldCheck; guardian: GuardianMeta }[] = [
  { id: 'link', tab: 'Bank KYC link', hint: 'Phishing link via SMS', icon: Link2, guardian: { id: 'link', title: 'Link Guardian', tagline: 'Intercepts dangerous links before they open.', icon: Link2 } },
  { id: 'payment', tab: 'UPI money request', hint: 'New-recipient payment', icon: HandCoins, guardian: { id: 'payment', title: 'Payment Guardian', tagline: 'Pauses risky money transfers with an Action Lock.', icon: HandCoins } },
  { id: 'call', tab: 'Digital-arrest call', hint: 'Impersonation incoming call', icon: PhoneCall, guardian: { id: 'call', title: 'Call Guardian', tagline: 'Screens impersonation calls in real time.', icon: PhoneCall } },
  { id: 'media', tab: 'Deepfake emergency', hint: 'Manipulated audio of a loved one', icon: AudioLines, guardian: { id: 'media', title: 'Media Guardian', tagline: 'Flags media that cannot be verified.', icon: AudioLines } },
]

function riskTone(score: number): RiskTone {
  return score >= 70 ? 'critical' : score >= 40 ? 'amber' : 'low'
}

function useRiskyToneBadge(target: number) {
  return riskTone(target)
}

/* ------------------------------------------------------------------ */
/* Hold-to-confirm button (3 s)                                        */
/* ------------------------------------------------------------------ */

function HoldConfirm({ onComplete, label = 'Hold to confirm override', compact = false }: { onComplete: () => void; label?: string; compact?: boolean }) {
  const [progress, setProgress] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const doneRef = useRef(false)

  function stop() {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
    if (!doneRef.current) setProgress(0)
  }
  function start() {
    if (timer.current || doneRef.current) return
    setProgress(0)
    const startedAt = Date.now()
    timer.current = setInterval(() => {
      const next = Math.min(100, ((Date.now() - startedAt) / 3000) * 100)
      setProgress(next)
      if (next >= 100) {
        if (timer.current) { clearInterval(timer.current); timer.current = null }
        doneRef.current = true
        setProgress(100)
        onComplete()
      }
    }, 30)
  }
  useEffect(() => () => { stop() }, [])
  const seconds = Math.max(0, Math.ceil(3 - (progress / 100) * 3))
  return (
    <button
      type="button"
      className={compact ? 'sim-hold compact' : 'sim-hold'}
      onPointerDown={start} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}
      onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); start() } }}
      onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); stop() } }}
      disabled={doneRef.current}
      aria-label={label}
    >
      <span className="sim-hold-fill" style={{ width: `${progress}%` }} />
      <b>{progress > 0 ? `${label} — ${seconds}s` : label}</b>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Scenario chrome: phone frame vs desktop window + telemetry          */
/* ------------------------------------------------------------------ */

function PhoneShell({ scene }: { scene: React.ReactNode }) {
  return (
    <div className="sim-phone-wrap">
      <div className="sim-phone">
        <div className="sim-statusbar">
          <span>9:41</span>
          <i className="sim-live"><span className="live-dot" /> TrustPause active</i>
          <b>▮▮</b>
        </div>
        <div className="sim-phone-screen">{scene}</div>
      </div>
    </div>
  )
}

function RiskDial({ risk }: { risk: number }) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const dash = (risk / 100) * circumference
  const tone = riskTone(risk)
  return (
    <div className={`sim-dial sim-dial-${tone}`}>
      <svg viewBox="0 0 110 110" aria-hidden="true">
        <circle cx="55" cy="55" r={radius} className="sim-dial-track" />
        <circle cx="55" cy="55" r={radius} className="sim-dial-value" strokeDasharray={`${dash} ${circumference - dash}`} />
      </svg>
      <div className="sim-dial-num"><strong>{Math.round(risk)}</strong><small>/100</small></div>
    </div>
  )
}

function TelemetryPanel({ guardian, risk, signals, layer, stageLabel }: {
  guardian: GuardianMeta
  risk: number
  signals: Signal[]
  layer: 1 | 2 | 3
  stageLabel: string
}) {
  const tone = riskTone(risk)
  const Icon = guardian.icon
  return (
    <aside className="sim-telemetry">
      <div className="sim-glass-head"><span className="live-dot" /><b>Live telemetry</b><small>TrustPause</small></div>
      <div className="sim-tele-guardian"><div className="sim-tele-icon"><Icon size={18} /></div><div><strong>{guardian.title}</strong><span>{guardian.tagline}</span></div></div>

      <div className="sim-tele-block">
        <p className="sim-kicker">COGNITIVE RISK SCORE</p>
        <div className="sim-dial-row"><RiskDial risk={risk} /><div className="sim-dial-copy"><span className={`sim-level sim-level-${tone}`}>{tone === 'critical' ? 'Critical' : tone === 'amber' ? 'Elevated' : 'Low'}</span><small>{stageLabel}</small></div></div>
      </div>

      <div className="sim-tele-block">
        <p className="sim-kicker">DETECTED SIGNALS</p>
        {signals.length === 0
          ? <div className="sim-no-signals"><ShieldCheck size={14} /> No active manipulation signals</div>
          : <ul className="sim-signals">{signals.map((signal) => <li key={signal.label}><span className="sim-sig-dot" /><div><strong>{signal.label}</strong><small>{signal.detail}</small></div><em>+{signal.points}</em></li>)}</ul>}
      </div>

      <div className="sim-tele-block">
        <p className="sim-kicker">INTERVENTION LAYER</p>
        <ol className="sim-layers">
          {LAYER_NAMES.map((name, index) => {
            const active = index + 1 <= layer
            const current = index + 1 === layer
            return <li key={name} className={active ? (current ? 'current' : 'done') : ''}><span>{active ? (current ? <Eye size={11} /> : <Check size={11} />) : index + 1}</span>{name}</li>
          })}
        </ol>
      </div>

      <p className="sim-privacy-note"><LockKeyhole size={12} /> On-device analysis. Nothing uploaded without consent.</p>
    </aside>
  )
}

function DesktopShell({ title, meta, scene, telemetry }: { title: string; meta: string; scene: React.ReactNode; telemetry: React.ReactNode }) {
  return (
    <div className="sim-desktop">
      <section className="sim-window">
        <div className="sim-window-bar"><i /><i /><i /><strong>{title}</strong><span>{meta}</span></div>
        {scene}
      </section>
      {telemetry}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scenario telemetry hook                                             */
/* ------------------------------------------------------------------ */

function useScenarioMeta(stage: string, map: Record<string, { risk: number; signals: Signal[]; layer: 1 | 2 | 3; stageLabel: string }>) {
  return map[stage] ?? { risk: 8, signals: [], layer: 1 as const, stageLabel: 'Idle' }
}

/* ================================================================== */
/* SCENARIO 1 · URGENT BANK KYC LINK                                  */
/* ================================================================== */

const LINK_URL = 'https://hdfc-secure-verify.example/update-kyc'
type LinkStage = 'sms' | 'intercept' | 'safe' | 'opened'

const LINK_META: Record<LinkStage, { risk: number; signals: Signal[]; layer: 1 | 2 | 3; stageLabel: string }> = {
  sms: {
    risk: 38,
    signals: [
      { label: 'Emotional urgency', detail: '“Blocked in 10 minutes” threat', points: 25 },
      { label: 'Credential request', detail: 'KYC update lure', points: 13 },
    ],
    layer: 1,
    stageLabel: 'Silent Sense — risk building, no interruption',
  },
  intercept: {
    risk: 86,
    signals: [
      { label: 'Emotional urgency', detail: '“Blocked in 10 minutes” threat', points: 25 },
      { label: 'Domain mismatch', detail: 'hdfc-secure-verify.example ≠ hdfcbank.com', points: 30 },
      { label: 'Credential request', detail: 'KYC + OTP harvest page', points: 20 },
      { label: 'Lookalike hostname', detail: 'Hyphenated, unofficial TLD', points: 11 },
    ],
    layer: 3,
    stageLabel: 'Action Lock — link opening paused',
  },
  safe: { risk: 6, signals: [], layer: 1, stageLabel: 'Safe path taken — official app opened' },
  opened: {
    risk: 92,
    signals: [
      { label: 'Domain mismatch', detail: 'Navigated to lookalike host', points: 30 },
      { label: 'Credential request', detail: 'Page may harvest KYC data', points: 25 },
    ],
    layer: 3,
    stageLabel: 'High-risk destination opened after countdown',
  },
}

function LinkScenario({ mode, onRisk }: { mode: PlatformMode; onRisk?: (risk: number) => void }) {
  const [stage, setStage] = useState<LinkStage>('sms')
  const [seconds, setSeconds] = useState(10)
  const [showWhy, setShowWhy] = useState(false)
  const [serverAnalysis, setServerAnalysis] = useState<LinkRiskResponse | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null)
  const meta = useScenarioMeta(stage, LINK_META)

  const riskScoreForStage = (): number =>
    serverAnalysis && stage === 'intercept' ? serverAnalysis.score : LINK_META[stage].risk
  const signalsForStage = (): Signal[] => {
    if (!serverAnalysis || stage !== 'intercept') return meta.signals
    return (serverAnalysis.detectedSignals ?? []).map((signal) => ({ label: signal.label, detail: serverAnalysis.explanation, points: signal.points }))
  }

  useEffect(() => { onRisk?.(riskScoreForStage()) }, [riskScoreForStage(), onRisk])

  async function analyzeServer(nextValue: string) {
    setAnalyzing(true)
    try {
      // The link API answers with the analysis directly (no envelope). Treat a
      // malformed or failed response as "no server result" so the local
      // scenario copy still renders instead of crashing on missing fields.
      const server = await fetchJson<LinkRiskResponse | null>('/api/link-risk', { url: nextValue }, () => null)
      const valid = server && Array.isArray(server.detectedSignals) && typeof server.score === 'number' ? server : null
      setServerAnalysis(valid)
      return valid
    } finally {
      setAnalyzing(false)
    }
  }

  async function startIntercept() {
    setStage('intercept')
    setShowWhy(false)
    const server = await analyzeServer(LINK_URL)
    onRisk?.(server ? server.score : LINK_META.intercept.risk)
    setSeconds(10)
    countdown.current = setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          if (countdown.current) clearInterval(countdown.current)
          return 0
        }
        return current - 1
      })
    }, 1000)
  }

  useEffect(() => () => { if (countdown.current) clearInterval(countdown.current) }, [])

  function goSafe() {
    if (countdown.current) clearInterval(countdown.current)
    setStage('safe')
    void recordRiskEvent({
      guardian: 'Link Guardian', title: 'Link Guardian', detail: 'Suspicious banking link paused — official app opened instead',
      risk: 'Emotional urgency + domain mismatch + credential request', status: 'Blocked', tone: 'green',
    })
  }
  function goOpened() {
    setStage('opened')
    void recordRiskEvent({
      guardian: 'Link Guardian', title: 'Link Guardian', detail: 'Suspicious banking link opened after 10-second pause',
      risk: 'Domain mismatch + credential request', status: 'Reviewed', tone: 'amber',
    })
  }
  function reset() {
    if (countdown.current) clearInterval(countdown.current)
    setStage('sms'); setSeconds(10); setShowWhy(false)
  }

  const scene = (
    <div className="sim-app-scene scene-link">
      <div className="sim-app-head"><span><Link2 size={15} /></span><div><strong>Messages</strong><small>+91 98•••• 1234 · “HDFC Bank”</small></div><i>now</i></div>

      <div className="sim-chat">
        <div className="sim-chat-day">SMS · 1 message</div>
        <div className="sim-bubble sim-incoming">
          <b>⚠ HDFC Bank</b>
          <p>Your account will be <em>blocked in 10 minutes</em>. Update KYC immediately to avoid suspension: <span className="sim-url">{LINK_URL}</span></p>
        </div>

        {stage === 'sms' && (
          <>
            <div className="sim-silent-chip"><Zap size={12} /> Silent Sense: urgency + credential signals detected — will pause when you open the link</div>
            <button type="button" className="sim-open-link" onClick={startIntercept} disabled={analyzing}>
              {analyzing ? 'Checking link…' : 'Open Link'} <Link2 size={14} />
            </button>
          </>
        )}

        {stage === 'intercept' && (
          <div className="sim-overlay sim-intercept">
            <div className="sim-pause-badge"><Timer size={15} /> PAUSE · 10 SECOND HOLD</div>
            <div className="sim-intercept-grid">
              <div className="sim-count-block">
                <div className="sim-count-num">{seconds}</div>
                <small>seconds left before the link can open</small>
                <div className="sim-count-track"><i style={{ width: `${(seconds / 10) * 100}%` }} /></div>
              </div>
              <div className="sim-count-copy">
                <h3>This link is not HDFC Bank&apos;s website.</h3>
                <p className="muted">The message uses urgency and fear to push you to a lookalike domain. TrustPause interrupted the open.</p>
                <div className="sim-match">
                  <div><small>CLAIMED</small><strong>HDFC Bank</strong><Check size={12} /></div>
                  <div className="bad"><small>REAL ADDRESS</small><strong>{LINK_URL.replace('https://', '')}</strong><X size={12} /></div>
                </div>
                {showWhy && (
                  <ul className="sim-why">
                    {serverAnalysis ? (
                      serverAnalysis.detectedSignals.map((signal) => (
                        <li key={signal.code}><span>+{signal.points}</span> {signal.label}</li>
                      ))
                    ) : (
                      <>
                        <li><span>+35</span> Emotional urgency — “blocked in 10 minutes”</li>
                        <li><span>+30</span> Domain does not match the claimed bank</li>
                        <li><span>+20</span> Requests KYC credentials on an unverified page</li>
                      </>
                    )}
                  </ul>
                )}
                <button type="button" className="sim-text-link" onClick={() => setShowWhy((value) => !value)}>
                  {showWhy ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {showWhy ? 'Hide risk breakdown' : 'Why am I paused?'}
                </button>
                <div className="sim-intercept-actions">
                  <button type="button" className="sim-primary" onClick={goSafe}><Landmark size={16} /> Open Official Bank App Instead</button>
                  <button type="button" className="sim-secondary" onClick={goOpened} disabled={seconds > 0} title={seconds > 0 ? `Enabled when the countdown ends (${seconds}s)` : 'Open the original link anyway'}>
                    Open link anyway {seconds > 0 && `(${seconds}s)`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 'safe' && (
          <div className="sim-resolution sim-ok"><Check size={16} /><div><strong>Official banking app opened</strong><p>TrustPause opened HDFC Bank&apos;s verified app instead. No credentials were exposed to the lookalike page.</p></div></div>
        )}
        {stage === 'opened' && (
          <div className="sim-resolution sim-warn"><AlertTriangle size={16} /><div><strong>Link opened after the pause</strong><p>You chose to continue. Do not enter your user ID, password, OTP, or card details on this page.</p></div></div>
        )}
      </div>

      {stage !== 'sms' && <button type="button" className="sim-reset" onClick={reset}><RotateCcw size={13} /> Reset scenario</button>}
    </div>
  )

  const telemetry = <TelemetryPanel guardian={SCENARIOS[0].guardian} risk={riskScoreForStage()} signals={signalsForStage()} layer={meta.layer} stageLabel={meta.stageLabel} />
  return mode === 'mobile'
    ? <PhoneShell scene={scene} />
    : <DesktopShell title="Messages · +91 98•••• 1234" meta={stage === 'sms' ? '1 new message' : stage === 'intercept' ? 'TrustPause intercepted' : 'Resolved'} scene={scene} telemetry={telemetry} />
}

/* ================================================================== */
/* SCENARIO 2 · NEW UPI / URGENT MONEY REQUEST                        */
/* ================================================================== */

type PaymentStage = 'review' | 'lock' | 'canceled' | 'override' | 'calling' | 'verified'

const PAYMENT_META: Record<PaymentStage, { risk: number; signals: Signal[]; layer: 1 | 2 | 3; stageLabel: string }> = {
  review: {
    risk: 62,
    signals: [
      { label: 'Urgency', detail: '“Need it NOW — airport”', points: 25 },
      { label: 'Isolation request', detail: '“Don’t call or tell anyone”', points: 15 },
      { label: 'Payment intent', detail: 'New UPI ID provided', points: 22 },
    ],
    layer: 1,
    stageLabel: 'Silent Sense — new recipient flagged',
  },
  lock: {
    risk: 88,
    signals: [
      { label: 'New recipient', detail: 'rahul@upi never paid before', points: 26 },
      { label: 'Urgency', detail: '“Need it NOW — airport”', points: 25 },
      { label: 'Isolation request', detail: '“Don’t call or tell anyone”', points: 15 },
      { label: 'Verification discouraged', detail: 'Sender blocked independent checks', points: 22 },
    ],
    layer: 3,
    stageLabel: 'Action Lock — Money Pause active',
  },
  canceled: { risk: 5, signals: [], layer: 1, stageLabel: 'Payment canceled — ₹18,000 protected' },
  override: {
    risk: 95,
    signals: [
      { label: 'New recipient', detail: 'rahul@upi never paid before', points: 26 },
      { label: 'Unverified identity', detail: 'No saved contact match', points: 30 },
    ],
    layer: 3,
    stageLabel: 'Transfer sent after deliberate override',
  },
  calling: {
    risk: 40,
    signals: [
      { label: 'Independent check', detail: 'Calling saved contact…', points: 0 },
    ],
    layer: 2,
    stageLabel: 'Micro-Pause — verifying before payment',
  },
  verified: { risk: 8, signals: [], layer: 1, stageLabel: 'Saved contact confirmed this is not Rahul' },
}

function PaymentScenario({ mode, onRisk }: { mode: PlatformMode; onRisk?: (risk: number) => void }) {
  const [stage, setStage] = useState<PaymentStage>('review')
  const [callingSeconds, setCallingSeconds] = useState(0)
  const [serverAnalysis, setServerAnalysis] = useState<PaymentRiskResponse | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const meta = useScenarioMeta(stage, PAYMENT_META)

  useEffect(() => {
    const risk = serverAnalysis && stage === 'lock' ? serverAnalysis.score : PAYMENT_META[stage].risk
    onRisk?.(risk)
  }, [serverAnalysis, stage, onRisk])

  useEffect(() => {
    if (stage !== 'lock') return
    void analyzePaymentOnServer()
  }, [stage])

  async function analyzePaymentOnServer() {
    if (serverAnalysis) return serverAnalysis
    setAnalyzing(true)
    try {
      // The payment API answers with a { data, localOnly } envelope; unwrap it and
      // treat a malformed/failed response as "no server result" so the local
      // scenario copy still renders.
      const payload = await fetchJson<PaymentRiskResponse | { data?: PaymentRiskResponse }>('/api/payment-risk', {
        amount: 18000,
        recipient: 'rahul@upi',
        isNewRecipient: true,
        pressureSignals: ['needs it now', "don't call or tell anyone"],
      }, () => ({}))
      const data = (payload as { data?: PaymentRiskResponse }).data ?? (payload as PaymentRiskResponse)
      const valid = data && Array.isArray(data.detectedSignals) && typeof data.score === 'number' ? data : null
      setServerAnalysis(valid)
      return valid
    } finally {
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    if (stage !== 'calling') return
    setCallingSeconds(0)
    const timer = setInterval(() => {
      setCallingSeconds((current) => {
        if (current >= 2) { clearInterval(timer); setStage('verified'); return current }
        return current + 1
      })
    }, 800)
    return () => clearInterval(timer)
  }, [stage])

  function confirmPayment() {
    setStage('lock')
    void recordRiskEvent({
      guardian: 'Payment Guardian', title: 'Payment Guardian', detail: '₹18,000 payment to a new UPI recipient paused',
      risk: 'New recipient + urgency + verification discouraged', status: 'Protected', tone: 'green',
    })
  }
  function cancelPayment() {
    setStage('canceled')
    void recordRiskEvent({
      guardian: 'Payment Guardian', title: 'Payment Guardian', detail: '₹18,000 transfer canceled at Money Pause',
      risk: 'New recipient + urgency', status: 'Protected', tone: 'green',
    })
  }
  function overridePayment() {
    setStage('override')
    void recordRiskEvent({
      guardian: 'Payment Guardian', title: 'Payment Guardian', detail: '₹18,000 sent to new recipient after 3-second hold',
      risk: 'New recipient + unverified identity', status: 'Reviewed', tone: 'amber',
    })
  }
  function reset() { setStage('review') }

  const scene = (
    <div className="sim-app-scene scene-payment">
      <div className="sim-app-head"><span><Banknote size={15} /></span><div><strong>UPI Payments</strong><small>Simulated bank app</small></div><i>secure</i></div>

      <div className="sim-chat sim-payment-chat">
        <div className="sim-bubble sim-incoming compact">
          <b>Rahul · new number</b>
          <p>Rahul here — new number. I&apos;m stuck at the airport, need <b>₹18,000 NOW</b> for tickets. <em>Don&apos;t call or tell anyone</em> — send to <b>rahul@upi</b>.</p>
        </div>
      </div>

      <div className="sim-pay-sheet">
        <div className="sim-pay-row"><span className="sim-pay-avatar">RM</span><div><strong>Rahul Mehta</strong><small>rahul@upi</small></div><em className="sim-new-chip">NEW UPI</em></div>
        <div className="sim-pay-amount"><small>YOU&apos;RE PAYING</small><b>₹18,000</b></div>
        <div className="sim-pay-from"><small>FROM</small><span>HDFC Bank ·•• 4521</span></div>

        {stage === 'review' && <button type="button" className="sim-pay-btn" onClick={confirmPayment}>Pay ₹18,000</button>}

        {stage === 'lock' && (
          <div className={`sim-lock-card ${analyzing ? 'sim-loading' : ''}`}>
            <div className="sim-lock-head"><span className="sim-lock-icon"><LockKeyhole size={17} /></span><div><strong>NEW RECIPIENT DETECTED</strong><small>{analyzing ? 'TrustPause analyzing…' : 'Money Pause · before sending ₹18,000'}</small></div></div>
            <ul className="sim-risk-breakdown">
              {serverAnalysis ? (
                (serverAnalysis.detectedSignals ?? []).map((signal) => (
                  <li key={signal.code}><span>{signal.label}</span><i>+{signal.points}</i></li>
                ))
              ) : (
                <>
                  <li><span>Urgency</span><i>+25</i> “Need it NOW — airport”</li>
                  <li><span>New recipient</span><i>+26</i> rahul@upi has never been paid</li>
                  <li><span>Verification suppressed</span><i>+22</i> “Don’t call or tell anyone”</li>
                </>
              )}
            </ul>
            {analyzing ? (
              <p className="muted">Evaluating this transfer with the real risk engine…</p>
            ) : (
              <>
                <div className="sim-hold-row"><HoldConfirm onComplete={overridePayment} label="Hold to confirm override" /></div>
                <div className="sim-pay-actions">
                  <button type="button" className="sim-secondary" onClick={() => setStage('calling')}><PhoneCall size={14} /> Call saved contact</button>
                  <button type="button" className="sim-danger" onClick={cancelPayment}><Ban size={14} /> Cancel payment</button>
                </div>
              </>
            )}
          </div>
        )}

        {stage === 'calling' && (
          <div className="sim-resolution sim-check"><PhoneCall size={16} /><div><strong>Calling Maya Rao · saved contact</strong><p>Verifying the request through a separate channel {callingSeconds === 0 ? '…' : callingSeconds === 1 ? '· ringing…' : '· picked up!'}</p></div></div>
        )}
        {stage === 'verified' && (
          <div className="sim-resolution sim-ok"><Check size={16} /><div><strong>Maya confirmed this isn&apos;t Rahul&apos;s usual account</strong><p>He&apos;s reachable at his saved number and safe. Payment to rahul@upi was never sent.</p></div></div>
        )}
        {stage === 'canceled' && (
          <div className="sim-resolution sim-ok"><Check size={16} /><div><strong>Payment canceled</strong><p>₹18,000 stayed in your account. You remain in control.</p></div></div>
        )}
        {stage === 'override' && (
          <div className="sim-resolution sim-warn"><AlertTriangle size={16} /><div><strong>Payment sent after a 3-second override hold</strong><p>If this turns out to be a scam, use AfterTap Rescue and report it to your bank and 1930 immediately.</p></div></div>
        )}
      </div>

      {stage !== 'review' && <button type="button" className="sim-reset" onClick={reset}><RotateCcw size={13} /> Reset scenario</button>}
    </div>
  )

  const telemetry = <TelemetryPanel guardian={SCENARIOS[1].guardian} risk={serverAnalysis && stage === 'lock' ? serverAnalysis.score : PAYMENT_META[stage].risk} signals={serverAnalysis && stage === 'lock' ? (serverAnalysis.detectedSignals ?? []).map((signal) => ({ label: signal.label, detail: serverAnalysis.explanation, points: signal.points })) : meta.signals} layer={meta.layer} stageLabel={meta.stageLabel} />
  return mode === 'mobile'
    ? <PhoneShell scene={scene} />
    : <DesktopShell title="UPI Payments" meta={stage === 'review' ? 'New recipient · review' : stage === 'lock' ? 'Money Pause active' : 'Resolved'} scene={scene} telemetry={telemetry} />
}

/* ================================================================== */
/* SCENARIO 3 · IMPERSONATION CALL / DIGITAL ARREST                    */
/* ================================================================== */

type CallStage = 'ringing' | 'screening' | 'live' | 'verify' | 'ended' | 'helpline' | 'continued'

type CallScenarioDef = {
  id: string
  name: string
  hint: string
  callerNumber: string
  claimedName: string
  inContacts: boolean
  callerVerified: boolean
  spoofPossible: boolean
  transcript: string
  claimedIdentity: string
  helpline: string
}

const CALL_SCENARIOS: CallScenarioDef[] = [
  {
    id: 'unknown',
    name: 'Normal unknown caller',
    hint: 'Low risk',
    callerNumber: '+91 98•••• ••11',
    claimedName: 'Unknown caller',
    inContacts: false,
    callerVerified: false,
    spoofPossible: false,
    transcript: 'Hello, this is about a package delivery for you.',
    claimedIdentity: 'Not identified',
    helpline: 'The delivery service confirmed they never call from this number — no risk found.',
  },
  {
    id: 'bank',
    name: 'Bank impersonation',
    hint: 'OTP request',
    callerNumber: '+91 11 4567 8901',
    claimedName: 'Bank fraud department',
    inContacts: false,
    callerVerified: false,
    spoofPossible: false,
    transcript: 'This is your bank security team. Your account is compromised. Tell me your OTP immediately.',
    claimedIdentity: 'Bank fraud department',
    helpline: 'The bank confirmed no such call exists — your account is safe and was never compromised.',
  },
  {
    id: 'arrest',
    name: 'Digital arrest',
    hint: 'Police impersonation',
    callerNumber: '+91 11 4080 1234',
    claimedName: '“CBI Officer Sharma”',
    inContacts: false,
    callerVerified: false,
    spoofPossible: true,
    transcript: 'This is a police officer. Your Aadhaar has been linked to a criminal case. Stay on the call and do not tell your family.',
    claimedIdentity: 'Police / CBI',
    helpline: 'The 1930 cybercrime helpline confirmed no case or warrant exists against you. This was a “digital arrest” scam.',
  },
  {
    id: 'remote',
    name: 'Remote-access scam',
    hint: 'Fake tech support',
    callerNumber: '+91 80 5500 2244',
    claimedName: 'Tech support',
    inContacts: false,
    callerVerified: false,
    spoofPossible: true,
    transcript: 'Your device has been compromised. Install this application and give me remote access immediately.',
    claimedIdentity: 'Tech support',
    helpline: 'The software vendor confirmed they never make unsolicited support calls — no access session exists.',
  },
  {
    id: 'spoofed',
    name: 'Spoofed caller ID',
    hint: 'Fake official number',
    callerNumber: '+91 1800 100 0000',
    claimedName: '“HDFC Bank” dial-back line',
    inContacts: false,
    callerVerified: false,
    spoofPossible: true,
    transcript: 'This is HDFC Bank. We detected unusual activity on your account. Confirm your PIN to block the fraud.',
    claimedIdentity: 'HDFC Bank',
    helpline: 'The bank’s official line confirmed this number is not theirs — the call was spoofed.',
  },
]

function CallScenario({ mode, onRisk }: { mode: PlatformMode; onRisk: (score: number) => void }) {
  const [scenarioId, setScenarioId] = useState('arrest')
  const [stage, setStage] = useState<CallStage>('ringing')
  const [liveSeconds, setLiveSeconds] = useState(0)
  const scenario = CALL_SCENARIOS.find((item) => item.id === scenarioId) ?? CALL_SCENARIOS[0]
  const analysis = useServerCallAnalysis(scenario)
  const interventionRecordedRef = useRef<string | null>(null)

  const liveScore = analysis.result?.score ?? 0

  // Keep the global cognitive-risk badge in sync with the live call analysis.
  useEffect(() => {
    onRisk(analysis.result ? analysis.result.score : 0)
  }, [analysis.result, onRisk])

  // Auto-advance: incoming call → screening → live risk card once analysis lands.
  useEffect(() => {
    if (stage !== 'screening') return
    if (analysis.checking || !analysis.result) return
    const timer = window.setTimeout(() => setStage('live'), 500)
    return () => window.clearTimeout(timer)
  }, [stage, analysis.checking, analysis.result])

  // Record a risk event the moment a HIGH/CRITICAL intervention is shown.
  useEffect(() => {
    if (stage !== 'live' || !analysis.result || !analysis.result.shouldInterrupt) return
    const key = `${scenarioId}:${stage}`
    if (interventionRecordedRef.current === key) return
    interventionRecordedRef.current = key
    void recordRiskEvent({
      guardian: 'Call Guardian', title: 'Call Guardian', detail: `${scenario.name} — TrustPause intervention shown`,
      risk: analysis.result.signals.join(' + ') || 'Multiple manipulation signals',
      status: 'Protected', tone: analysis.result.level === 'CRITICAL' ? 'red' : 'amber',
    })
  }, [stage, scenarioId, analysis.result, scenario])

  useEffect(() => {
    if (stage !== 'live') return
    setLiveSeconds(0)
    const timer = setInterval(() => setLiveSeconds((current) => current + 1), 1000)
    return () => clearInterval(timer)
  }, [stage])

  function selectScenario(id: string) {
    setScenarioId(id)
    setStage('ringing')
  }
  function answer() {
    setStage('screening')
  }
  function endAndReport() {
    setStage('ended')
    const level = analysis.result?.level ?? 'LOW'
    void recordRiskEvent({
      guardian: 'Call Guardian', title: 'Call Guardian', detail: `${scenario.name} — call ended and marked for reporting`,
      risk: analysis.result ? analysis.result.signals.join(' + ') || 'Unknown caller' : 'Unknown caller',
      status: 'Blocked', tone: level === 'CRITICAL' ? 'red' : level === 'HIGH' ? 'amber' : 'green',
    })
  }
  function openVerify() {
    setStage('verify')
  }
  function verifySimulated() {
    setStage('helpline')
    void recordRiskEvent({
      guardian: 'Call Guardian', title: 'Call Guardian', detail: `${scenario.name} — user verified through an official channel`,
      risk: 'Identity claim checked via official channel', status: 'Protected', tone: 'green',
    })
  }
  function continueCall() {
    setStage('continued')
    if (analysis.result?.shouldInterrupt) {
      void recordRiskEvent({
        guardian: 'Call Guardian', title: 'Call Guardian', detail: `${scenario.name} — call continued after a deliberate hold`,
        risk: analysis.result.signals.join(' + ') || 'Multiple manipulation signals', status: 'Reviewed', tone: 'amber',
      })
    }
  }
  function reset() { setStage('ringing') }

  const cardTone = !analysis.result ? 'low' : analysis.result.level === 'CRITICAL' ? 'critical' : analysis.result.level === 'HIGH' ? 'amber' : 'low'

  const callUi = (
    <div className="sim-call-screen">
      {stage === 'ringing' && (
        <div className="sim-call-ring">
          <div className="sim-call-avatar"><PhoneOff size={24} /></div>
          <strong>Incoming call</strong>
          <span className="sim-caller">{scenario.claimedName}</span>
          <small>{scenario.callerNumber} · not in contacts · caller unverified</small>
          {scenario.spoofPossible && <em className="sim-spoof-chip"><ShieldQuestion size={12} /> Spoofed ID likely — TrustPause screening</em>}
          <div className="sim-call-buttons">
            <button type="button" className="sim-decline" onClick={endAndReport} aria-label="Decline and report"><PhoneOff size={18} /></button>
            <button type="button" className="sim-answer" onClick={answer} aria-label="Answer with live screening"><PhoneCall size={18} /></button>
          </div>
          <small className="sim-call-hint">Answer to watch TrustPause screen the call live.</small>
        </div>
      )}

      {stage === 'screening' && (
        <div className="sim-analyzing">
          <span className="spinner" />
          <strong>Call Guardian screening…</strong>
          <small>{analysis.checking ? 'Analyzing caller signals on the TrustPause risk API' : 'Preparing the live risk card'}</small>
        </div>
      )}

      {stage === 'live' && (
        <div className="sim-call-live">
          <div className="sim-call-toprow"><span className="live-dot" /> Live screening · {Math.floor(liveSeconds / 60)}:{(liveSeconds % 60).toString().padStart(2, '0')}<span className="sim-call-muted">Claimed: {scenario.claimedIdentity}</span></div>
          {!analysis.result ? (
            <div className="sim-analyzing">
              <span className="spinner" />
              <strong>Waiting for risk analysis…</strong>
            </div>
          ) : (
            <div className={`sim-risk-card ${cardTone}`}>
              <div className="sim-risk-card-head"><ShieldAlert size={18} /><b>RISK CARD — LIVE</b><em>{analysis.result.score}/100 · {analysis.result.level}</em></div>
              <ul>
                {analysis.result.signalDetails.map((signal) => <li key={signal.code}>{signal.label}</li>)}
              </ul>
              <p>{analysis.result.summary}</p>
              <p className="sim-safe-alt"><strong>Safe alternative: </strong>{analysis.result.recommendedAction}</p>
            </div>
          )}
          {analysis.result && !analysis.result.shouldInterrupt && (
            <div className="sim-call-actions">
              <button type="button" className="sim-primary" onClick={continueCall}><PhoneCall size={15} /> Continue the call</button>
              <button type="button" className="sim-danger" onClick={endAndReport}><PhoneOff size={15} /> End call</button>
            </div>
          )}
          {analysis.result && analysis.result.shouldInterrupt && (
            <div className="sim-call-actions">
              <button type="button" className="sim-danger" onClick={endAndReport}><PhoneOff size={15} /> End Call &amp; Report</button>
              <button type="button" className="sim-primary" onClick={openVerify}><ShieldCheck size={15} /> Verify identity</button>
              <HoldConfirm onComplete={continueCall} label="Continue anyway — hold 3s" />
            </div>
          )}
        </div>
      )}

      {stage === 'verify' && (
        <div className="sim-call-live">
          <div className="sim-verify-panel">
            <h4><ShieldCheck size={15} /> Verify through an official channel</h4>
            <ul>
              <li>Hang up first — never verify while the caller is on the line.</li>
              <li>Look up the official number yourself (bank app, website, or 1930 for cybercrime) — never use a number the caller gives you.</li>
              <li>Call it back and ask about the specific claim.</li>
              <li>Real agencies never ask for OTPs, PINs, or money on a cold call.</li>
            </ul>
            <div className="sim-call-actions">
              <button type="button" className="sim-primary" onClick={verifySimulated}><Phone size={15} /> Simulate official verification</button>
              <button type="button" className="sim-danger" onClick={() => setStage('live')}><PhoneOff size={15} /> Back to risk card</button>
            </div>
          </div>
        </div>
      )}

      {stage === 'ended' && (
        <div className="sim-resolution sim-ok centered"><Check size={17} /><div><strong>Call ended &amp; flagged</strong><p>TrustPause logged the number and prepopulated a report note for the national cybercrime portal (cybercrime.gov.in / 1930).</p></div></div>
      )}
      {stage === 'helpline' && (
        <div className="sim-resolution sim-ok centered"><ShieldCheck size={17} /><div><strong>Verified via an official channel</strong><p>{scenario.helpline}</p></div></div>
      )}
      {stage === 'continued' && (
        <div className="sim-resolution sim-warn centered"><AlertTriangle size={17} /><div><strong>Call continued{analysis.result?.shouldInterrupt ? ' after a deliberate hold' : ''}</strong><p>{analysis.result?.shouldInterrupt ? 'Do not share OTPs, PINs, passwords, or screen access. If anything feels off, hang up and verify through an official channel.' : 'No intervention was needed — the call can proceed normally.'}</p></div></div>
      )}
    </div>
  )

  const telemetrySignals: Signal[] = analysis.result
    ? analysis.result.signalDetails.map((signal) => ({ label: signal.label, detail: signal.evidence || signal.label, points: signal.points }))
    : stage === 'ringing'
      ? [{ label: 'Unknown caller', detail: scenario.callerNumber, points: 8 }]
      : []
  const telemetryLayer: 1 | 2 | 3 = liveScore >= 70 ? 3 : liveScore >= 40 ? 2 : 1
  const stageLabel = stage === 'ringing' ? 'Silent Sense — screening incoming call'
    : stage === 'screening' ? 'Analyzing call signals…'
      : stage === 'live' ? (analysis.result?.shouldInterrupt ? 'Action Lock — live risk card on screen' : 'Micro-Pause — low-risk call continues')
        : stage === 'verify' ? 'Identity verification guidance'
          : stage === 'ended' ? 'Call ended and reported'
            : stage === 'helpline' ? 'Verified via official channel'
              : 'Call continued deliberately'

  const scene = (
    <div className="sim-app-scene scene-call">
      <div className="sim-app-head"><span><Phone size={15} /></span><div><strong>Phone</strong><small>Call Guardian active</small></div><i>now</i></div>
      <div className="sim-call-scenarios" role="group" aria-label="Call scenarios">
        {CALL_SCENARIOS.map((item) => (
          <button type="button" key={item.id} className={item.id === scenarioId ? 'selected' : ''} onClick={() => selectScenario(item.id)} aria-pressed={item.id === scenarioId}>
            <span>{item.name}</span><small>{item.hint}</small>
          </button>
        ))}
      </div>
      {callUi}
      {stage !== 'ringing' && <button type="button" className="sim-reset" onClick={reset}><RotateCcw size={13} /> Reset scenario</button>}
      <p className="sim-call-proto-note"><Smartphone size={12} /> Prototype: simulates Android call-screening behavior. A native Android build can integrate the platform's CallScreeningService for real incoming-call screening.</p>
    </div>
  )

  return mode === 'mobile'
    ? <PhoneShell scene={scene} />
    : <DesktopShell title="Incoming call" meta={stage === 'ringing' ? 'Screening…' : stage === 'screening' ? 'Analyzing…' : stage === 'live' ? 'Risk card live' : stage === 'verify' ? 'Verify identity' : 'Resolved'} scene={scene} telemetry={<TelemetryPanel guardian={SCENARIOS[2].guardian} risk={liveScore} signals={telemetrySignals} layer={telemetryLayer} stageLabel={stageLabel} />} />
}

/* ================================================================== */
/* SCENARIO 4 · MANIPULATED AUDIO / DEEPFAKE EMERGENCY                 */
/* ================================================================== */

type MediaStage = 'incoming' | 'playing' | 'analysis' | 'safe' | 'acted'

const MEDIA_META: Record<MediaStage, { risk: number; signals: Signal[]; layer: 1 | 2 | 3; stageLabel: string }> = {
  incoming: {
    risk: 44,
    signals: [
      { label: 'Family-voice claim', detail: 'Audio claims to be a parent', points: 18 },
      { label: 'Financial ask', detail: '“Pay the lawyer now”', points: 26 },
    ],
    layer: 1,
    stageLabel: 'Silent Sense — voice clip flagged for analysis',
  },
  playing: {
    risk: 66,
    signals: [
      { label: 'Fear-based content', detail: '“I hit someone”', points: 20 },
      { label: 'Urgency', detail: '“Pay the lawyer now”', points: 15 },
      { label: 'Secrecy implied', detail: '“Don’t tell mom”', points: 15 },
      { label: 'Unverified sender', detail: 'Forwarded, not a saved number', points: 16 },
    ],
    layer: 2,
    stageLabel: 'Micro-Pause — analyzing audio in real time',
  },
  analysis: {
    risk: 85,
    signals: [
      { label: 'Fear', detail: '“I hit someone, help me”', points: 20 },
      { label: 'Urgency', detail: '“Pay the lawyer now”', points: 15 },
      { label: 'Secrecy', detail: '“Don’t tell mom”', points: 20 },
      { label: 'Synthetic audio markers', detail: 'Voice-cloning artifacts detected', points: 30 },
    ],
    layer: 3,
    stageLabel: 'Critical intervention triggered — verify identity first',
  },
  safe: { risk: 7, signals: [], layer: 1, stageLabel: 'Verified via saved number — real parent is safe' },
  acted: {
    risk: 85,
    signals: [
      { label: 'Unverified media', detail: 'Acted without identity check', points: 40 },
    ],
    layer: 3,
    stageLabel: 'Acted on unverified media after override',
  },
}

const MEDIA_TEXT = "Dad, I'm in trouble — I hit someone with the car. They're taking me to the police station. Pay the lawyer ₹2,00,000 NOW. Don't tell mom. Please hurry."

function MediaScenario({ mode }: { mode: PlatformMode }) {
  const [stage, setStage] = useState<MediaStage>('incoming')
  const [progress, setProgress] = useState(0)
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const meta = useScenarioMeta(stage, MEDIA_META)

  useEffect(() => () => { if (playTimer.current) clearInterval(playTimer.current) }, [])

  function playAudio() {
    setStage('playing')
    setProgress(0)
    playTimer.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 100) {
          if (playTimer.current) clearInterval(playTimer.current)
          setStage('analysis')
          return 100
        }
        return current + 3.2
      })
    }, 100)
  }
  function stopPlayback() {
    if (playTimer.current) clearInterval(playTimer.current)
    setStage('incoming')
    setProgress(0)
  }
  function analyzeNow() {
    if (playTimer.current) clearInterval(playTimer.current)
    setStage('analysis')
  }
  function callSaved() {
    setStage('safe')
    void recordRiskEvent({
      guardian: 'Media Guardian', title: 'Media Guardian', detail: 'Deepfake-style audio verified via saved contact — not acted on',
      risk: 'Fear + urgency + secrecy + synthetic audio markers', status: 'Protected', tone: 'green',
    })
  }
  function actAnyway() {
    setStage('acted')
    void recordRiskEvent({
      guardian: 'Media Guardian', title: 'Media Guardian', detail: 'User acted on unverified emergency audio after override',
      risk: 'Synthetic audio + fear + urgency', status: 'Reviewed', tone: 'amber',
    })
  }
  function reset() {
    if (playTimer.current) clearInterval(playTimer.current)
    setStage('incoming'); setProgress(0)
  }

  const seconds = Math.round((progress / 100) * 14)
  const scene = (
    <div className="sim-app-scene scene-media">
      <div className="sim-app-head"><span><AudioLines size={15} /></span><div><strong>WhatsApp</strong><small>Dad · forwarded audio</small></div><i>now</i></div>

      <div className="sim-chat">
        <div className="sim-chat-day">TODAY</div>
        <div className="sim-bubble sim-incoming media">
          <b>Voice message · 0:14</b>
          <div className="sim-audio">
            <button type="button" className="sim-play" onClick={stage === 'playing' ? stopPlayback : playAudio} aria-label={stage === 'playing' ? 'Pause audio' : 'Play audio'}>
              {stage === 'playing' ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
            </button>
            <div className="sim-wave"><i style={{ width: `${progress}%` }} /></div>
            <span>{seconds}:{Math.floor((progress % 10) * 0.4).toString().padStart(2, '0')} / 0:14</span>
          </div>
          <p>{MEDIA_TEXT}</p>
          {stage !== 'playing' && stage !== 'analysis' && <small className="sim-voice-note"><Volume2 size={11} /> Synthetic-voice markers are being checked locally…</small>}
        </div>

        {(stage === 'playing' || stage === 'incoming') && (
          <>
            {stage === 'playing' && <div className="sim-silent-chip amber"><Zap size={12} /> Fear + urgency + secrecy detected — analyzing voice identity…</div>}
            {stage === 'playing' && <button type="button" className="sim-open-link" onClick={analyzeNow}>Skip — analyze now <Fingerprint size={13} /></button>}
          </>
        )}

        {stage === 'analysis' && (
          <div className="sim-overlay sim-analysis">
            <div className="sim-analysis-head"><ShieldAlert size={16} /> CRITICAL INTERVENTION TRIGGERED</div>
            <h3>This voice cannot be verified as your father&apos;s.</h3>
            <ul className="sim-score-list">
              <li><span>Fear</span><i>+20</i> “I hit someone — help me”</li>
              <li><span>Urgency</span><i>+15</i> “Pay the lawyer NOW”</li>
              <li><span>Secrecy</span><i>+20</i> “Don’t tell mom”</li>
              <li><span>Synthetic markers</span><i>+30</i> Voice-cloning artifacts detected</li>
              <li className="total"><span>Cognitive Risk Score</span><b>85<small>/100</small></b></li>
            </ul>
            <p className="sim-analysis-note">Deepfake emergency scams clone a loved one&apos;s voice and demand instant payment. Verify through a channel only you control.</p>
            <div className="sim-analysis-actions">
              <button type="button" className="sim-primary" onClick={callSaved}><PhoneCall size={15} /> Call Dad&apos;s saved number</button>
              <HoldConfirm onComplete={actAnyway} label="Hold to act on this audio" compact />
            </div>
          </div>
        )}

        {stage === 'safe' && (
          <div className="sim-resolution sim-ok"><Check size={16} /><div><strong>Dad answered — he&apos;s safe</strong><p>His saved number connected. He is not in trouble, and the clip is a voice clone. No money was sent.</p></div></div>
        )}
        {stage === 'acted' && (
          <div className="sim-resolution sim-warn"><AlertTriangle size={16} /><div><strong>You acted on unverified media</strong><p>Call the real person immediately. If money moved, use AfterTap Rescue and report it to 1930.</p></div></div>
        )}
      </div>

      {stage !== 'incoming' && stage !== 'playing' && <button type="button" className="sim-reset" onClick={reset}><RotateCcw size={13} /> Reset scenario</button>}
    </div>
  )

  return mode === 'mobile'
    ? <PhoneShell scene={scene} />
    : <DesktopShell title="WhatsApp · Dad (forwarded)" meta={stage === 'analysis' ? 'Critical intervention' : stage === 'playing' ? 'Analyzing…' : '1 voice message'} scene={scene} telemetry={<TelemetryPanel guardian={SCENARIOS[3].guardian} risk={meta.risk} signals={meta.signals} layer={meta.layer} stageLabel={meta.stageLabel} />} />
}

/* ================================================================== */
/* Architecture / privacy drawer                                       */
/* ================================================================== */

const ARCH_ROWS = [
  { icon: Phone, title: 'CallScreeningService', desc: 'Platform-approved call screening identifies or blocks risky calls before they ring, using lightweight checks first and deeper analysis only when needed.' },
  { icon: Link2, title: 'Link intent handling', desc: 'Suspicious URLs are paused at the point of open through browser and OS link intents — before the page renders.' },
  { icon: Eye, title: 'Accessibility event hooks', desc: 'Optional, consent-gated hooks react to on-screen events that look like a risky action. No continuous screen recording.' },
  { icon: MessageSquare, title: 'Notification & message signals', desc: 'Patterns such as urgency, secrecy, and payment requests are matched on-device. Cloud analysis only with explicit consent.' },
  { icon: Fingerprint, title: 'Content Credentials & provenance', desc: 'Media checks look for editing history, metadata, and synthetic-media indicators — and never claim certainty it cannot prove.' },
]

function ArchitectureDrawer({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <section className="sim-drawer">
      <button type="button" className="sim-drawer-toggle" onClick={onToggle} aria-expanded={open}>
        <span className="sim-drawer-title"><Cpu size={15} /> Architecture &amp; Privacy Specs</span>
        <span className="sim-drawer-chip"><LockKeyhole size={12} /> No 24/7 background recording</span>
        {open ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
      </button>
      {open && (
        <div className="sim-drawer-body">
          <p className="sim-kicker">PRIVACY-PRESERVING ON-DEVICE TRIGGERS</p>
          <div className="sim-arch-grid">
            {ARCH_ROWS.map(({ icon: Icon, title, desc }) => (
              <div className="sim-arch-card" key={title}>
                <div className="sim-arch-icon"><Icon size={16} /></div>
                <div><strong>{title}</strong><p>{desc}</p></div>
              </div>
            ))}
          </div>
          <div className="sim-layer-note">
            <div className="sim-layer-note-head"><Sparkles size={14} /> The three intervention layers</div>
            <p><b>Silent Sense</b> detects without interrupting → <b>Micro-Pause</b> adds a lightweight warning as signals combine → <b>Action Lock</b> adds deliberate friction only before irreversible actions such as sending money, sharing an OTP, or opening a high-risk page.</p>
          </div>
          <p className="sim-arch-footnote"><ShieldCheck size={13} /> TrustPause is an ambient decision layer, not a surveillance layer. Detection is event-triggered, most analysis stays on your device, and you stay in control — continuing always requires an intentional action.</p>
        </div>
      )}
    </section>
  )
}

/* ================================================================== */
/* Home / shell                                                        */
/* ================================================================== */

function useAnimatedRisk(target: number) {
  const [shown, setShown] = useState(8)
  useEffect(() => {
    let raf = 0
    const step = () => {
      setShown((previous) => {
        const diff = target - previous
        if (Math.abs(diff) < 0.5) return target
        return previous + diff * 0.14
      })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return shown
}

export default function SimulatorHome() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('link')
  const [mode, setMode] = useState<PlatformMode>('desktop')
  const [riskTarget, setRiskTarget] = useState(8)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const risk = useAnimatedRisk(riskTarget)
  const tone = useRiskyToneBadge(risk)
  const reportRisk = useMemo(() => (value: number) => setRiskTarget(value), [])
  const scenario = SCENARIOS.find((item) => item.id === scenarioId)!

  function switchScenario(id: ScenarioId) {
    setScenarioId(id)
    setRiskTarget(8)
  }

  return (
    <div className="sim-app">
      <header className="sim-topnav">
        <div className="sim-brand">
          <div className="sim-brand-mark"><ShieldCheck size={20} /></div>
          <div><strong>TrustPause <span>2.0</span></strong><small>Ambient Human Firewall</small></div>
        </div>

        <div className={`sim-risk-badge sim-risk-${tone}`} title="Real-time cognitive risk of the active simulation">
          <Activity size={13} />
          <span className="sim-risk-copy"><small>Cognitive risk</small><b>{Math.round(risk)}<i>/100</i></b></span>
          <em>{tone === 'critical' ? 'CRITICAL' : tone === 'amber' ? 'ELEVATED' : 'LOW'}</em>
        </div>

        <div className="sim-topnav-right">
          <div className="sim-mode-toggle" role="group" aria-label="Platform mode">
            <button type="button" className={mode === 'mobile' ? 'active' : ''} onClick={() => setMode('mobile')} aria-pressed={mode === 'mobile'}><Smartphone size={15} /><span>Mobile</span></button>
            <button type="button" className={mode === 'desktop' ? 'active' : ''} onClick={() => setMode('desktop')} aria-pressed={mode === 'desktop'}><Monitor size={15} /><span>Desktop</span></button>
          </div>
          <Link href="/dashboard" className="sim-dash-link">Open dashboard <ChevronDown size={13} className="sim-arrow-right" /></Link>
        </div>
      </header>

      <nav className="sim-scenario-tabs" aria-label="Scenario simulator">
        {SCENARIOS.map(({ id, tab, hint, icon: Icon }) => (
          <button type="button" key={id} className={scenarioId === id ? 'selected' : ''} onClick={() => switchScenario(id)} aria-pressed={scenarioId === id}>
            <Icon size={16} /><span>{tab}</span><small>{hint}</small>
          </button>
        ))}
      </nav>

      <div className="sim-subhead">
        <div>
          <p className="eyebrow">LIVE SCAM SIMULATION</p>
          <h1>{scenario.guardian.title} <span className="sim-layer-tag">· {scenario.guardian.tagline}</span></h1>
        </div>
        <p className="sim-subhead-note"><ShieldCheck size={14} /> {mode === 'mobile' ? 'Mobile view — the experience a user would see on their phone.' : 'Desktop view — the same simulation with TrustPause telemetry alongside.'}</p>
      </div>

      <main className="sim-canvas">
        {scenarioId === 'link' && <LinkScenario mode={mode} onRisk={reportRisk} />}
        {scenarioId === 'payment' && <PaymentScenario mode={mode} onRisk={reportRisk} />}
        {scenarioId === 'call' && <CallScenario mode={mode} onRisk={reportRisk} />}
        {scenarioId === 'media' && <MediaScenario mode={mode} />}
      </main>

      <ArchitectureDrawer open={drawerOpen} onToggle={() => setDrawerOpen((value) => !value)} />

      <footer className="sim-foot">
        <span>Interactive hackathon prototype · simulations only, no real money, calls, or links are used.</span>
        <span className="sim-foot-right"><Activity size={12} /> Events recorded to your audit log in this browser.</span>
      </footer>
    </div>
  )
}
