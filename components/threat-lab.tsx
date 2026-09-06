'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Ban, Banknote, CameraOff, Check, ChevronRight, CircleAlert, Clock3,
  Fingerprint, HandCoins, Landmark, Link2, LockKeyhole, MessageSquare, Phone, PhoneCall,
  PhoneOff, Play, QrCode, RotateCcw, ShieldAlert, ShieldCheck, Smartphone, UserRoundCheck, Video,
} from 'lucide-react'
import { analyzeLink, type LinkAnalysis } from '@/lib/link-guardian'
import { analyzeMessage, type MessageRiskAnalysis } from '@/lib/message-risk'
import { useServerMessageAnalysis } from '@/lib/use-server-message-analysis'
import { useServerCallAnalysis } from '@/lib/use-server-call-analysis'
import { TrustCircleDialog } from '@/components/trust-circle'
import type { NewRiskEvent } from '@/lib/risk-events'
import type { UserSettings } from '@/lib/supabase'

type LabTab = 'message' | 'link' | 'call' | 'payment' | 'media'

type LabProps = {
  settings: UserSettings
  onRecord: (input: NewRiskEvent) => void
  onOpenAnalyzer: () => void
  onOpenTrustCircle: () => void
  onAfterTap: () => void
}

const tabs: { id: LabTab; label: string; icon: typeof MessageSquare; blurb: string }[] = [
  { id: 'message', label: 'Message', icon: MessageSquare, blurb: 'Manipulation patterns in an incoming message.' },
  { id: 'link', label: 'Link tap', icon: Link2, blurb: 'Interception before a suspicious page opens.' },
  { id: 'call', label: 'Call', icon: Phone, blurb: 'Live screening of an unknown caller.' },
  { id: 'payment', label: 'Payment', icon: HandCoins, blurb: 'A Money Pause before a new transfer.' },
  { id: 'media', label: 'Media', icon: Video, blurb: 'Authenticity signals for received media.' },
]

const messageScenarios = [
  {
    id: 'bank-kyc',
    label: 'Bank KYC scam',
    sender: 'Account Security · Unverified sender',
    text: 'Your bank account will be blocked in 10 minutes. Complete KYC immediately using this link: http://secure-bank-kyc-verification.example/kyc',
  },
  {
    id: 'urgent-payment',
    label: 'Urgent UPI request',
    sender: 'Rahul Mehta · New number',
    text: "I'm stuck at the airport. Please send ₹18,000 urgently to my new UPI id: rahul@upi. Don't call — I'll explain later.",
  },
  {
    id: 'safe',
    label: 'Harmless message',
    sender: 'Maya · Saved contact',
    text: 'Hey, are we still on for coffee at 6? I can bring the notes from our last meeting.',
  },
]

function formatCountdown(milliseconds: number) {
  return `${Math.max(0, Math.ceil(milliseconds / 1000))}s`
}

function HoldButton({ onComplete, label, disabled, compact = false }: { onComplete: () => void; label?: string; disabled?: boolean; compact?: boolean }) {
  const [progress, setProgress] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
  }, [])

  function stop() {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
  }

  function start() {
    if (disabled || timer.current) return
    setProgress(0)
    const startedAt = Date.now()
    timer.current = setInterval(() => {
      const next = Math.min(100, ((Date.now() - startedAt) / 3000) * 100)
      setProgress(next)
      if (next >= 100) {
        stop()
        onComplete()
      }
    }, 40)
  }

  const remaining = formatCountdown(3000 - (progress / 100) * 3000)
  return (
    <button
      className={compact ? 'hold-button lab-hold compact' : 'hold-button lab-hold'}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); start() } }}
      onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); stop() } }}
      disabled={disabled || progress >= 100}
      aria-label="Continue anyway. Press and hold for three seconds"
    >
      <span style={{ width: `${progress}%` }} />
      <b>{progress > 0 ? `Hold to continue (${remaining})` : (label ?? 'Continue anyway')}</b>
    </button>
  )
}

function PhoneFrame({ children, header }: { children: React.ReactNode; header: React.ReactNode }) {
  return (
    <div className="lab-phone" aria-label="Phone simulation">
      <div className="lab-phone-notch" />
      <div className="lab-phone-screen">
        {header}
        <div className="lab-phone-body">{children}</div>
      </div>
    </div>
  )
}

function LabHeader({ icon: Icon, title, sub }: { icon: typeof ShieldCheck; title: string; sub: string }) {
  return (
    <div className="lab-phone-header">
      <div className="lab-app-icon"><Icon size={16} /></div>
      <div><strong>{title}</strong><small>{sub}</small></div>
      <span><Clock3 size={11} /> now</span>
    </div>
  )
}

function SettingOffBanner({ setting, label }: { setting: boolean; label: string }) {
  if (setting) return null
  return <div className="lab-off-banner"><CircleAlert size={15} /><span><b>{label} is turned off in Settings.</b> This simulation completes without an intervention so you can see the difference.</span></div>
}

/* ------------------------------------------------------------------ */
/* 1 · MESSAGE GUARDIAN                                                */
/* ------------------------------------------------------------------ */

function MessageEnvironment({ settings, onRecord, onOpenAnalyzer, onOpenTrustCircle, onAfterTap }: LabProps) {
  const [scenarioId, setScenarioId] = useState('bank-kyc')
  const [resolution, setResolution] = useState<'canceled' | 'continued' | null>(null)
  const scenario = messageScenarios.find((item) => item.id === scenarioId) ?? messageScenarios[0]
  // Automatic server analysis — the same pipeline the modal uses.
  const { result: serverAnalysis, checking } = useServerMessageAnalysis(scenario.text, { debounceMs: 250 })
  const localAnalysis = useMemo(() => analyzeMessage(scenario.text), [scenario.text])
  const analysis = serverAnalysis ?? localAnalysis
  const analyzing = checking && !serverAnalysis
  const risky = analysis.level === 'HIGH' || analysis.level === 'CRITICAL'
  const consentOn = settings.message_analysis_consent

  function choose(id: string) {
    setScenarioId(id)
    setResolution(null)
  }

  function finish(outcome: 'canceled' | 'continued') {
    setResolution(outcome)
    if (risky) {
      onRecord({
        guardian: 'Message Guardian',
        title: 'Message Guardian',
        detail: `${analysis.level}-risk message: ${analysis.dangerousAction.toLowerCase()}`,
        risk: analysis.signals.slice(0, 3).join(' + ') || 'No signals',
        status: outcome === 'canceled' ? 'Protected' : 'Reviewed',
        tone: outcome === 'canceled' ? 'green' : 'amber',
      })
    }
  }

  return (
    <EnvironmentShell
      tab="message"
      title="Message Guardian"
      description="With consent, TrustPause detects manipulation patterns in supported messages — urgency, secrecy, payment requests — and surfaces a small indicator instead of reading your whole conversation."
      controls={
        <div className="lab-controls">
          <p className="eyebrow">PREPARED SCENARIOS</p>
          <div className="scenario-list">
            {messageScenarios.map((item) => (
              <button key={item.id} className={scenarioId === item.id ? 'scenario-button selected' : 'scenario-button'} onClick={() => choose(item.id)}>
                <span>{item.label}</span>
                <small>{analyzeMessage(item.text).level}</small>
              </button>
            ))}
          </div>
          <button className="secondary full" onClick={onOpenAnalyzer}><Fingerprint size={15} /> Open full message analyzer</button>
          <p className="lab-note"><ShieldCheck size={13} /> {analyzing ? 'Analyzing on the server…' : `Risk engine verdict: ${analysis.level} · ${analysis.score}/100${serverAnalysis ? ' (server API)' : ''}`} Nothing is stored except the risk result.</p>
        </div>
      }
      phone={
        <PhoneFrame header={<LabHeader icon={MessageSquare} title={scenario.sender} sub="Incoming message" />}>
          <div className="chat-area">
            <div className="chat-day">TODAY</div>
            <div className="chat-bubble">{scenario.text}</div>
            {consentOn && analyzing && <div className="lab-scanning"><ShieldCheck size={14} /> TrustPause is analyzing this message…</div>}
            {consentOn && risky && resolution === null && (
              <button className="floating-indicator" onClick={() => { if (risky) finish('canceled') }} aria-label="Open risk explanation">
                <span className="risk-dot" /> URGENCY + PAYMENT REQUEST <ChevronRight size={13} />
              </button>
            )}
            {consentOn && risky && resolution === 'canceled' && (
              <div className="chat-resolution success"><Check size={14} /> Risk acknowledged. The message stays unopened.</div>
            )}
            {consentOn && risky && resolution === 'continued' && (
              <div className="chat-resolution warning"><CircleAlert size={14} /> You chose to continue after holding.</div>
            )}
            {!consentOn && <div className="chat-resolution muted"><ShieldCheck size={14} /> Message analysis is off — no indicator shown.</div>}
          </div>
          {consentOn && risky && resolution === null && !analyzing && (
            <div className="lab-action-lock">
              <div className="lab-lock-row"><div className="lab-lock-icon"><LockKeyhole size={17} /></div><div><strong>Action Lock</strong><p className="muted">{analysis.dangerousAction}</p></div></div>
              <ul className="signal-why-list">
                {analysis.signalDetails.slice(0, 5).map((signal) => (
                  <li key={signal.code}><strong>{signal.label}</strong><em>+{signal.points}</em>{signal.evidence && <span className="signal-evidence">{signal.evidence}</span>}</li>
                ))}
              </ul>
              <div className="signal-row">{analysis.signals.slice(0, 4).map((signal) => <span key={signal}>{signal}</span>)}</div>
              <p className="safe-action-note"><Check size={14} /> <b>Safe alternative:</b> {analysis.recommendedAction}</p>
              <div className="lab-lock-buttons">
                <button className="primary" onClick={() => finish('canceled')}><Ban size={14} /> Cancel risky action</button>
                <button className="secondary" onClick={onOpenTrustCircle}><UserRoundCheck size={14} /> Verify identity</button>
                <button className="text-button" onClick={onAfterTap}><ShieldAlert size={13} /> AfterTap Rescue</button>
                <HoldButton onComplete={() => finish('continued')} />
              </div>
            </div>
          )}
        </PhoneFrame>
      }
      footnote="The floating indicator matches the demo shown to judges: a quiet hint until the user taps to see the explanation."
    />
  )
}

/* ------------------------------------------------------------------ */
/* 2 · LINK TAP / BROWSER INTERCEPTION                                 */
/* ------------------------------------------------------------------ */

const LINK_SCENARIO_TEXT = 'Your account will be blocked in 10 minutes. Complete KYC immediately using this link:'
const LINK_SCENARIO_URL = 'http://secure-bank-kyc-verification.example/kyc'

function LinkEnvironment({ settings, onRecord, onOpenTrustCircle }: Pick<LabProps, 'settings' | 'onRecord' | 'onOpenTrustCircle'>) {
  const [tapped, setTapped] = useState(false)
  const [resolution, setResolution] = useState<'safe' | 'continued' | null>(null)
  const [analysis, setAnalysis] = useState<LinkAnalysis | null>(null)
  const interceptionOn = settings.browser_link_interception

  useEffect(() => {
    if (tapped && interceptionOn && !analysis) {
      const timer = window.setTimeout(() => setAnalysis(analyzeLink(LINK_SCENARIO_URL)), 700)
      return () => window.clearTimeout(timer)
    }
  }, [tapped, interceptionOn, analysis])

  function finish(outcome: 'safe' | 'continued') {
    setResolution(outcome)
    onRecord({
      guardian: 'Link Guardian',
      title: 'Link Guardian',
      detail: outcome === 'safe' ? 'Suspicious banking URL intercepted before opening' : 'Suspicious URL opened after a deliberate hold',
      risk: analysis ? analysis.detectedSignals.map((signal) => signal.label).slice(0, 3).join(' + ') : 'Suspicious domain',
      status: outcome === 'safe' ? 'Blocked' : 'Reviewed',
      tone: outcome === 'safe' ? 'green' : 'amber',
    })
  }

  return (
    <EnvironmentShell
      tab="link"
      title="Link Guardian"
      description="When a message pushes urgency and a link at the same time, TrustPause shows the real domain before the page opens — and offers the safe replacement action, not just a warning."
      controls={
        <div className="lab-controls">
          <p className="eyebrow">THE FLOW</p>
          <ol className="lab-steps">
            <li><span>1</span> A message creates urgency and includes a link.</li>
            <li><span>2</span> The user taps the link — the page does not open.</li>
            <li><span>3</span> TrustPause reveals the real domain and a safer alternative.</li>
          </ol>
          <button className="secondary full" onClick={() => { setTapped(false); setAnalysis(null); setResolution(null) }}><RotateCcw size={14} /> Reset simulation</button>
          <p className="lab-note"><QrCode size={13} /> QR codes feed the same Link Guardian check — try the scanner on Live Protection.</p>
        </div>
      }
      phone={
        <PhoneFrame header={<LabHeader icon={MessageSquare} title="Account Security · Unverified sender" sub="Incoming message" />}>
          <div className="chat-area">
            <div className="chat-bubble">{LINK_SCENARIO_TEXT}<br /><button className="fake-link" onClick={() => { if (!tapped) setTapped(true) }}>{LINK_SCENARIO_URL}</button></div>
            {tapped && interceptionOn && !analysis && <div className="lab-scanning"><ShieldCheck size={14} /> Checking destination…</div>}
            {tapped && interceptionOn && analysis && resolution === null && (
              <div className="intercept-card">
                <div className="intercept-top"><div className="intercept-pause">PAUSE</div><span className="pill pill-red">HIGH-RISK DESTINATION</span></div>
                <h3>This link may not be your bank.</h3>
                <p className="muted">The message creates urgency and asks you to open a website. The claimed organization and the real address do not match.</p>
                <div className="hostname-row intercept-host">
                  <div><small>CLAIMED</small><strong>HDFC Bank</strong></div>
                  <div><small>REAL ADDRESS</small><strong className="mono">{analysis.displayedHostname}</strong></div>
                </div>
                <div className="signal-row">{analysis.detectedSignals.slice(0, 4).map((signal) => <span key={signal.code}>{signal.label}</span>)}</div>
                <div className="lab-lock-buttons">
                  <button className="primary" onClick={() => finish('safe')}><Landmark size={14} /> Open bank&apos;s official app</button>
                  <button className="secondary" onClick={onOpenTrustCircle}><UserRoundCheck size={14} /> Verify identity</button>
                  <HoldButton onComplete={() => finish('continued')} label="I understand — open anyway" />
                </div>
              </div>
            )}
            {resolution === 'safe' && <div className="chat-resolution success"><Check size={14} /> Opened the official banking app instead. The suspicious link was never loaded.</div>}
            {resolution === 'continued' && <div className="chat-resolution warning"><CircleAlert size={14} /> You opened the link after a three-second hold. Watch for credential and payment requests.</div>}
            {tapped && !interceptionOn && <div className="chat-resolution muted"><ShieldCheck size={14} /> Link interception is off — the link would open directly. Enable it in Settings.</div>}
          </div>
        </PhoneFrame>
      }
      footnote="The pause gives the user a moment to recognize the mismatch between the claimed organization and the real domain."
    />
  )
}

/* ------------------------------------------------------------------ */
/* 3 · CALL GUARDIAN                                                   */
/* ------------------------------------------------------------------ */

function CallEnvironment({ settings, onRecord, onOpenTrustCircle }: Pick<LabProps, 'settings' | 'onRecord' | 'onOpenTrustCircle'>) {
  const [phase, setPhase] = useState<'ringing' | 'screening' | 'ended' | 'official' | 'continued'>('ringing')
  const screeningOn = settings.call_screening

  // The same Call Guardian analysis path as the simulator — automatic, server-driven.
  const callFacts = {
    callerNumber: '+91 98•••• ••11',
    claimedName: 'Bank fraud department',
    inContacts: false,
    callerVerified: false,
    spoofPossible: true,
    transcript: 'This is your bank security team. Your account is compromised. Tell me your OTP immediately.',
  }
  const analysis = useServerCallAnalysis(callFacts)

  function startScreening() {
    setPhase('screening')
    const level = analysis.result?.level ?? 'HIGH'
    onRecord({
      guardian: 'Call Guardian',
      title: 'Call Guardian',
      detail: 'Unknown caller screened for impersonation language',
      risk: analysis.result ? analysis.result.signals.join(' + ') || 'Unverified caller' : 'Authority claim + financial request + unverified number',
      status: 'Protected',
      tone: level === 'CRITICAL' ? 'red' : level === 'HIGH' ? 'amber' : 'green',
    })
  }

  return (
    <EnvironmentShell
      tab="call"
      title="Call Guardian"
      description="For unknown calls, TrustPause can show caller reputation, possible spoofing warnings, and a live risk card — and remind you what a legitimate agent will never ask for."
      controls={
        <div className="lab-controls">
          <p className="eyebrow">SIMULATED CALL</p>
          <div className="lab-call-badges"><span className="pill pill-red">UNKNOWN CALLER</span><span className="pill pill-amber">SPOOFING POSSIBLE</span></div>
          <p className="muted">This is a model of an Android CallScreeningService-style flow. A real prototype would do lightweight checks first and deeper analysis after answering.</p>
          <button className="secondary full" onClick={() => setPhase('ringing')}><RotateCcw size={14} /> Reset simulation</button>
        </div>
      }
      phone={
        <PhoneFrame header={<div className="lab-call-top"><span><ShieldCheck size={13} /> Call Guardian active</span><span><Clock3 size={11} /> now</span></div>}>
          {phase === 'ringing' && (
            <div className="lab-call-ring">
              <div className="lab-call-avatar"><PhoneOff size={22} /></div>
              <strong>Unknown caller</strong>
              <small>+91 98•••• ••11</small>
              <div className="signal-row"><span>Not in your contacts</span><span>No verified reputation</span></div>
              <div className="lab-call-buttons">
                <button className="lab-call-decline" onClick={() => setPhase('ended')} aria-label="Decline call"><PhoneOff size={17} /></button>
                <button className="lab-call-answer" onClick={startScreening} aria-label="Answer with screening"><PhoneCall size={17} /></button>
              </div>
              <small className="lab-call-hint">Answer to see TrustPause screen the call live.</small>
            </div>
          )}
          {phase === 'screening' && (
            <div className="lab-call-live">
              <div className="lab-live-row"><span className="live-dot" /><span>Screening call…</span></div>
              {analysis.checking || !analysis.result ? (
                <div className="lab-live-row muted"><span className="spinner" /> Analyzing call signals on the TrustPause risk API…</div>
              ) : (
                <>
                  <div className="lab-call-avatar"><ShieldCheck size={20} /></div>
                  <strong>Caller risk card</strong>
                  <div className="caller-card">
                    <p className="eyebrow">CLAIMED IDENTITY</p>
                    <p className="caller-claim">{callFacts.claimedName}</p>
                    <p className="eyebrow">RISK SCORE · {analysis.result.score}/100 · {analysis.result.level}</p>
                    <ul className="caller-risks">
                      {analysis.result.signalDetails.map((signal) => <li key={signal.code}>{signal.label}</li>)}
                    </ul>
                    <p className="caller-advice">{analysis.result.recommendedAction}</p>
                  </div>
                </>
              )}
              <div className="lab-lock-buttons column">
                <button className="primary full" onClick={() => setPhase('official')}><Landmark size={14} /> Open official bank number</button>
                <button className="secondary full" onClick={onOpenTrustCircle}><UserRoundCheck size={14} /> Verify identity</button>
                <button className="lab-end-call full" onClick={() => setPhase('ended')}><PhoneOff size={14} /> End call</button>
                <HoldButton onComplete={() => setPhase('continued')} label="Continue the call" compact />
              </div>
            </div>
          )}
          {phase === 'ended' && <div className="chat-resolution success centered"><Check size={15} /> Call ended and marked as suspicious. No information was shared.</div>}
          {phase === 'official' && <div className="chat-resolution success centered"><Check size={15} /> Opened the official bank number from your saved list. Hang up and call it directly.</div>}
          {phase === 'continued' && <div className="chat-resolution warning centered"><CircleAlert size={15} /> Call continued after a deliberate hold. Do not share OTPs, PINs, or screen access.</div>}
        </PhoneFrame>
      }
      footnote="A real deployment would use the platform's CallScreeningService — this simulation models the user experience without claiming device-level access."
    />
  )
}

/* ------------------------------------------------------------------ */
/* 4 · PAYMENT GUARDIAN                                                */
/* ------------------------------------------------------------------ */

function PaymentEnvironment({ settings, onRecord, onOpenTrustCircle }: Pick<LabProps, 'settings' | 'onRecord' | 'onOpenTrustCircle'>) {
  const [phase, setPhase] = useState<'review' | 'paused' | 'sent' | 'canceled'>('review')
  const [calling, setCalling] = useState(false)
  const pauseOn = settings.payment_pause

  function finish(outcome: 'sent' | 'canceled') {
    setPhase(outcome)
    onRecord({
      guardian: 'Payment Guardian',
      title: 'Payment Guardian',
      detail: outcome === 'canceled' ? '₹18,000 payment to a new recipient paused' : '₹18,000 sent to a new recipient after a deliberate hold',
      risk: 'New recipient + urgent request + unverified identity',
      status: outcome === 'canceled' ? 'Protected' : 'Reviewed',
      tone: outcome === 'canceled' ? 'green' : 'amber',
    })
  }

  function callContact() {
    setCalling(true)
    window.setTimeout(() => setCalling(false), 2200)
  }

  return (
    <EnvironmentShell
      tab="payment"
      title="Payment Guardian"
      description="A scam becomes financially harmful at the payment screen. When a first-time recipient follows an urgent request, TrustPause triggers a Money Pause before the transfer leaves."
      controls={
        <div className="lab-controls">
          <p className="eyebrow">MONEY PAUSE</p>
          <ul className="lab-bullets">
            <li><span className="live-dot" /> Recipient is new — never paid before</li>
            <li><span className="live-dot" /> Payment follows an urgent request</li>
            <li><span className="live-dot" /> Sender discouraged independent verification</li>
          </ul>
          <button className="secondary full" onClick={() => setPhase('review')}><RotateCcw size={14} /> Reset simulation</button>
          <p className="lab-note"><Banknote size={13} /> For a hackathon, the payment screen is simulated — no real UPI integration.</p>
        </div>
      }
      phone={
        <PhoneFrame header={<LabHeader icon={Banknote} title="UPI Payment" sub="Simulated bank app" />}>
          <div className="payment-screen">
            <div className="payment-recipient"><div className="lab-call-avatar small"><UserRoundCheck size={16} /></div><div><strong>Rahul Mehta</strong><small>rahul@upi · new recipient</small></div></div>
            <div className="payment-amount"><small>YOU ARE PAYING</small><strong>₹18,000</strong></div>
            <div className="payment-source"><small>FROM</small><span>HDFC Bank ·••• 4521</span></div>
            <div className="payment-note"><small>NOTE FROM SENDER</small><span>“Send urgently, don&apos;t call me”</span></div>
            {phase === 'review' && <button className="primary full" onClick={() => setPhase(pauseOn ? 'paused' : 'sent')}>Pay ₹18,000</button>}
            {phase === 'paused' && pauseOn && (
              <div className="money-pause">
                <div className="money-pause-head"><div className="lab-lock-icon red"><LockKeyhole size={16} /></div><div><strong>NEW RECIPIENT DETECTED</strong><small>Before sending ₹18,000</small></div></div>
                <ul>
                  <li>This payment follows an urgent request</li>
                  <li>The recipient is new</li>
                  <li>The sender discouraged independent verification</li>
                </ul>
                <div className="lab-lock-buttons column">
                  <button className="secondary full" onClick={callContact}><PhoneCall size={14} /> {calling ? 'Calling saved number…' : 'Call saved contact'}</button>
                  <button className="secondary full" onClick={onOpenTrustCircle}><UserRoundCheck size={14} /> Ask Trust Circle</button>
                  <button className="primary full" onClick={() => finish('canceled')}><Ban size={14} /> Cancel payment</button>
                  <HoldButton onComplete={() => finish('sent')} label="Continue anyway" />
                </div>
              </div>
            )}
            {phase === 'sent' && <div className="chat-resolution warning centered"><CircleAlert size={15} /> {pauseOn ? 'Payment sent after a deliberate hold.' : 'Payment sent — Payment Pause is off in Settings.'} This was a simulation; no real money moved.</div>}
            {phase === 'canceled' && <div className="chat-resolution success centered"><Check size={15} /> Payment canceled. You stay in control.</div>}
          </div>
        </PhoneFrame>
      }
      footnote="The hold breaks emotional momentum. The user remains in control — continuing requires an intentional three-second action."
    />
  )
}

/* ------------------------------------------------------------------ */
/* 5 · MEDIA GUARDIAN                                                  */
/* ------------------------------------------------------------------ */

function MediaEnvironment({ settings, onRecord, onOpenTrustCircle }: Pick<LabProps, 'settings' | 'onRecord' | 'onOpenTrustCircle'>) {
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'result' | 'acknowledged'>('idle')
  const mediaOn = settings.media_checks

  function startCheck() {
    setPhase('analyzing')
    window.setTimeout(() => {
      setPhase('result')
      onRecord({
        guardian: 'Media Guardian',
        title: 'Media Guardian',
        detail: 'Received media has no verifiable provenance',
        risk: 'No source identified + audio manipulation indicators',
        status: 'Reviewed',
        tone: 'amber',
      })
    }, 1200)
  }

  return (
    <EnvironmentShell
      tab="media"
      title="Media Guardian"
      description="When media appears on-screen, TrustPause looks for available signals — provenance, editing history, synthetic-media indicators — and never claims certainty it does not have."
      controls={
        <div className="lab-controls">
          <p className="eyebrow">AUTHENTICITY, NOT VERDICTS</p>
          <ul className="lab-bullets">
            <li><span className="live-dot" /> Original source not identified</li>
            <li><span className="live-dot" /> No verifiable provenance found</li>
            <li><span className="live-dot" /> Audio manipulation indicators detected</li>
          </ul>
          <button className="secondary full" onClick={() => setPhase('idle')}><RotateCcw size={14} /> Reset simulation</button>
          <p className="lab-note"><CameraOff size={13} /> TrustPause never says “this is definitely a deepfake”. It says the clip cannot be verified and should not drive an irreversible action.</p>
        </div>
      }
      phone={
        <PhoneFrame header={<LabHeader icon={Video} title="News Alert · Shared media" sub="Forwarded video" />}>
          <div className="media-area">
            <button className="media-poster" onClick={() => { if (phase === 'idle') startCheck() }} aria-label="Play received video">
              <div className="media-gradient" />
              <div className="media-play"><Play size={22} fill="currentColor" /></div>
              <span>VIDEO_20260905_1842.mov</span>
              <small>00:42 · received 9 min ago</small>
            </button>
            {phase === 'analyzing' && <div className="lab-scanning"><ShieldCheck size={14} /> Checking provenance and editing signals…</div>}
            {phase === 'result' && mediaOn && (
              <div className="media-result">
                <p className="eyebrow">MEDIA AUTHENTICITY UNCERTAIN</p>
                <ul className="caller-risks">
                  <li>Original source not identified</li>
                  <li>No verifiable provenance information found</li>
                  <li>Audio manipulation indicators detected</li>
                  <li>The clip requests urgent financial action</li>
                </ul>
                <div className="media-advice">Do not act based only on this recording. Verify the person&apos;s identity through another channel.</div>
                <div className="lab-lock-buttons column">
                  <button className="primary full" onClick={() => setPhase('acknowledged')}><UserRoundCheck size={14} /> Verify through another channel</button>
                  <button className="secondary full" onClick={onOpenTrustCircle}><ShieldCheck size={14} /> Ask Trust Circle</button>
                  <HoldButton onComplete={() => setPhase('acknowledged')} label="Act on it anyway" compact />
                </div>
              </div>
            )}
            {phase === 'result' && !mediaOn && <div className="chat-resolution muted"><ShieldCheck size={14} /> Media checks are off — no authenticity signals shown.</div>}
            {phase === 'acknowledged' && <div className="chat-resolution success centered"><Check size={15} /> You chose to verify through another channel before acting.</div>}
          </div>
        </PhoneFrame>
      }
      footnote="The consequences of the media matter more than a perfect deepfake-detection score."
    />
  )
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function EnvironmentShell({ tab, title, description, controls, phone, footnote }: {
  tab: LabTab
  title: string
  description: string
  controls: React.ReactNode
  phone: React.ReactNode
  footnote: string
}) {
  return (
    <section className="lab-environment" aria-label={title}>
      <div className="lab-info">
        <p className="eyebrow">ENVIRONMENT · {tab.toUpperCase()}</p>
        <h2>{title}</h2>
        <p className="muted">{description}</p>
        {controls}
        <p className="lab-footnote">{footnote}</p>
      </div>
      {phone}
    </section>
  )
}

export default function ThreatLab({ settings, onRecord, onOpenAnalyzer, onOpenTrustCircle, onAfterTap }: LabProps) {
  const [active, setActive] = useState<LabTab>('message')

  return (
    <div className="threat-lab">
      <div className="topbar">
        <div><span className="breadcrumb">Workspace / </span>Threat Lab</div>
        <div className="top-actions"><span className="pill"><span className="live-dot" /> Interactive simulations</span></div>
      </div>
      <div className="section-title">
        <p className="eyebrow">THE GUARDIANS IN ACTION</p>
        <h1>See the pause before the harm.</h1>
        <p className="muted lead">Walk through the moments where TrustPause intervenes — a risky message, a link tap, an unknown call, a new payment, an unverifiable video. Every simulation writes to your live Risk Events log.</p>
      </div>
      <div className="lab-tabs" role="tablist" aria-label="Guardian simulations">
        {tabs.map(({ id, label, icon: Icon, blurb }) => (
          <button key={id} role="tab" aria-selected={active === id} className={active === id ? 'lab-tab selected' : 'lab-tab'} onClick={() => setActive(id)}>
            <Icon size={16} /><span>{label}</span><small>{blurb}</small>
          </button>
        ))}
      </div>
      {active === 'message' && <MessageEnvironment settings={settings} onRecord={onRecord} onOpenAnalyzer={onOpenAnalyzer} onOpenTrustCircle={onOpenTrustCircle} onAfterTap={onAfterTap} />}
      {active === 'link' && <LinkEnvironment settings={settings} onRecord={onRecord} onOpenTrustCircle={onOpenTrustCircle} />}
      {active === 'call' && <CallEnvironment settings={settings} onRecord={onRecord} onOpenTrustCircle={onOpenTrustCircle} />}
      {active === 'payment' && <PaymentEnvironment settings={settings} onRecord={onRecord} onOpenTrustCircle={onOpenTrustCircle} />}
      {active === 'media' && <MediaEnvironment settings={settings} onRecord={onRecord} onOpenTrustCircle={onOpenTrustCircle} />}
      <div className="lab-handoff"><Smartphone size={16} /><span>Each guardian hands off to the same Trust Circle, Action Lock, and AfterTap Rescue — one unified safety layer, not five separate tools.</span><ArrowRight size={15} /></div>
    </div>
  )
}