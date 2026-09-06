'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Clock3, Fingerprint, LifeBuoy, LockKeyhole, MessageSquare, ShieldAlert, ShieldCheck, Smartphone, UserRoundCheck, X, Zap } from 'lucide-react'
import { TrustCircleDialog } from '@/components/trust-circle'
import { saveScanResultWithFallback } from '@/lib/firebase-repositories'
import { analyzeMessage, type MessageRiskAnalysis } from '@/lib/message-risk'
import { useServerMessageAnalysis } from '@/lib/use-server-message-analysis'
import type { NewRiskEvent } from '@/lib/risk-events'

type RiskLevel = MessageRiskAnalysis['level']
type Resolution = 'canceled' | 'verified' | 'continued' | null

type Scenario = {
  id: string
  label: string
  sender: string
  text: string
}

const scenarios: Scenario[] = [
  {
    id: 'safe',
    label: 'Known contact',
    sender: 'Maya · Saved contact',
    text: 'Hey, are we still on for coffee at 6? I can bring the notes from our last meeting.',
  },
  {
    id: 'caution',
    label: 'Delivery update',
    sender: 'Parcel Desk · Unknown sender',
    text: 'Your delivery is waiting. Check the updated arrival window at parcel-status.example.',
  },
  {
    id: 'high',
    label: 'Urgent payment',
    sender: 'Rahul Mehta · New number',
    text: "I'm stuck at the airport. Please send $1,800 urgently to my new account. Don't call - I'll explain later.",
  },
  {
    id: 'account-change',
    label: 'Account change',
    sender: 'Payroll · New sender',
    text: 'Please update the payment account today using this new account number before the next transfer.',
  },
  {
    id: 'critical',
    label: 'Bank verification',
    sender: 'Account Security · Unverified sender',
    text: 'Your account will be closed today. Open the secure link and share the OTP to verify your identity immediately.',
  },
  {
    id: 'digital-arrest',
    label: 'Digital arrest',
    sender: 'Unknown · Claims police',
    text: 'This is a police officer. Your Aadhaar has been linked to a criminal case. Stay on the call and do not tell your family.',
  },
]

function levelTone(level: RiskLevel) {
  if (level === 'LOW') return 'green'
  if (level === 'CAUTION') return 'amber'
  return 'red'
}

export default function CognitiveRiskEngine({ close, onAfterTap, onRecord }: { close: () => void; onAfterTap?: () => void; onRecord?: (input: NewRiskEvent) => void }) {
  const [scenarioId, setScenarioId] = useState('safe')
  const [message, setMessage] = useState(scenarios[0].text)
  const [sender, setSender] = useState(scenarios[0].sender)
  const [resolution, setResolution] = useState<Resolution>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [showTrustCircle, setShowTrustCircle] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Automatic server analysis: message arrives -> API request -> result.
  const { result: serverAnalysis, checking, fromServer, fallbackUsed, error, reanalyze } = useServerMessageAnalysis(message)

  // Local engine mirrors the server for the brief analyzing window and as fallback.
  const local = useMemo(() => analyzeMessage(message), [message])
  const analysis = serverAnalysis ?? local
  const critical = analysis.level === 'CRITICAL'
  const highRisk = analysis.level === 'HIGH' || critical
  const analyzing = checking && !serverAnalysis

  const record = (outcome: 'canceled' | 'verified' | 'continued') => {
    if (!highRisk || !onRecord) return
    onRecord({
      guardian: 'Message Guardian',
      title: 'Message Guardian',
      detail: `${analysis.level}-risk message: ${analysis.dangerousAction.toLowerCase()}`,
      risk: analysis.signals.slice(0, 3).join(' + ') || 'No signals',
      status: outcome === 'canceled' ? 'Protected' : outcome === 'verified' ? 'Protected' : 'Reviewed',
      tone: outcome === 'canceled' ? 'green' : 'amber',
    })
  }

  useEffect(() => {
    if (!message.trim() || analyzing) return
    const timer = window.setTimeout(() => { void saveScanResultWithFallback({ riskLevel: analysis.level, score: analysis.score, signals: analysis.signals, dangerousAction: analysis.dangerousAction }) }, 500)
    return () => window.clearTimeout(timer)
  }, [analysis, message, analyzing])

  useEffect(() => {
    setResolution(null)
    setShowReceipt(false)
  }, [message, sender])

  useEffect(() => () => stopHold(), [])

  function chooseScenario(scenario: Scenario) {
    setScenarioId(scenario.id)
    setSender(scenario.sender)
    setMessage(scenario.text)
  }

  function stopHold() {
    if (holdTimer.current) {
      clearInterval(holdTimer.current)
      holdTimer.current = null
    }
  }

  function startHold() {
    if (resolution || holdTimer.current) return
    setHoldProgress(0)
    const startedAt = Date.now()
    holdTimer.current = setInterval(() => {
      const progress = Math.min(100, ((Date.now() - startedAt) / 3000) * 100)
      setHoldProgress(progress)
      if (progress >= 100) {
        stopHold()
        setResolution('continued')
        record('continued')
      }
    }, 40)
  }

  function cancelHold() {
    stopHold()
    setHoldProgress(0)
  }

  const holdLabel = holdProgress > 0 ? `Hold to continue (${Math.ceil((3000 - (holdProgress / 100) * 3000) / 1000)}s)` : 'Continue anyway'

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section className="demo-modal threat-simulator" role="dialog" aria-modal="true" aria-labelledby="simulator-title" aria-describedby="simulator-description">
        <button className="modal-close" onClick={close} aria-label="Close live threat simulator"><X size={18} /></button>
        <div className="demo-header">
          <div className="demo-logo"><ShieldCheck size={18} /></div>
          <div>
            <strong id="simulator-title">Message Guardian · Live Threat Simulator</strong>
            <small id="simulator-description">A simulated incoming message analyzed automatically by the TrustPause risk API.</small>
          </div>
        </div>

        <div className="simulator-layout">
          <div className="scenario-panel">
            <p className="eyebrow">SIMULATED INCOMING MESSAGES</p>
            <div className="scenario-list" role="list" aria-label="Prepared message scenarios">
              {scenarios.map((scenario) => (
                <button key={scenario.id} className={scenarioId === scenario.id ? 'scenario-button selected' : 'scenario-button'} onClick={() => chooseScenario(scenario)}>
                  <span>{scenario.label}</span>
                  <small>{scenario.id === 'safe' ? 'LOW' : scenario.id === 'caution' ? 'CAUTION' : scenario.id}</small>
                </button>
              ))}
            </div>
            <label className="simulator-label" htmlFor="custom-message">Or enter custom text</label>
            <textarea id="custom-message" className="custom-message" value={message} onChange={(event) => { setScenarioId('custom'); setMessage(event.target.value) }} rows={5} aria-label="Incoming message text" />
            <div className="simulator-provenance">
              <button className="secondary full" onClick={() => reanalyze()} disabled={checking || !message.trim()}>
                <Fingerprint size={13} /> {checking ? 'Checking on server…' : 'Reanalyze on server'}
              </button>
              <p className="fine provenance-note">
                {fromServer ? <><ShieldCheck size={13} /> Analyzed by the TrustPause risk API.</>
                  : fallbackUsed ? <><AlertTriangle size={13} /> API unavailable — on-device analysis used.</>
                    : <><Smartphone size={13} /> On-device analysis.</>}
                {error ? ` ${error}` : ''}
              </p>
            </div>
          </div>

          <div className="message-preview">
            <div className="phone-top"><MessageSquare size={16} /> Incoming message <span><Clock3 size={12} /> now</span></div>
            <div className="message-bubble simulator-message">
              <small>{sender}</small>
              <p>{message || 'Start typing to analyze this message.'}</p>
            </div>

            {analyzing ? (
              <div className="analysis-indicator indicator-amber" role="status" aria-live="polite">
                <div className="indicator-heading"><span className="risk-dot pulse" /> <strong>Analyzing…</strong></div>
                <p>Sending this message to the TrustPause risk engine.</p>
              </div>
            ) : (
              <>
                <div className={`analysis-indicator indicator-${levelTone(analysis.level)}`} aria-live="polite">
                  <div className="indicator-heading"><span className="risk-dot" /> <strong>{analysis.level}</strong><span>{analysis.score}/100</span></div>
                  <p>{analysis.summary}</p>
                  {analysis.signalDetails.length > 0 && (
                    <ul className="signal-why-list">
                      {analysis.signalDetails.map((signal) => (
                        <li key={signal.code}>
                          <strong>{signal.label}</strong>
                          <em>+{signal.points}</em>
                          {signal.evidence && <span className="signal-evidence">{signal.evidence}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {analysis.signals.length > 0 && <div className="signal-row">{analysis.signals.slice(0, 4).map((signal) => <span key={signal}>{signal}</span>)}</div>}
                </div>
                {highRisk && (
                  <p className="safe-action-note"><Check size={14} /> <b>Recommended safe action:</b> {analysis.recommendedAction}</p>
                )}
              </>
            )}
            {!message.trim() && <p className="engine-disclaimer">Type or choose a message — analysis runs automatically.</p>}
            <p className="engine-disclaimer"><Smartphone size={13} /> Web prototype: a simulated incoming message is analyzed automatically. It does not read real SMS/WhatsApp. A native app would analyze system-level message events.</p>
          </div>
        </div>

        {resolution && <div className="resolution-banner" role="status"><Check size={16} /> {resolution === 'canceled' ? 'Risky action canceled. You remain in control.' : resolution === 'verified' ? 'Verification requested. Review the details before acting.' : 'You chose to continue after holding for three seconds.'}</div>}

        {highRisk && !resolution && !analyzing && <div className={`intervention-overlay ${critical ? 'critical' : ''}`} role="alertdialog" aria-modal="false" aria-labelledby="intervention-title" aria-describedby="intervention-description">
          <div className="intervention-icon"><LockKeyhole size={22} /></div>
          <div className="intervention-copy">
            <p className="eyebrow">{critical ? 'TRUSTPAUSE INTERVENTION' : 'ACTION LOCK'}</p>
            <h2 id="intervention-title">{critical ? 'This message is trying to manipulate you.' : 'Pause before this action'}</h2>
            <p id="intervention-description">
              {analysis.summary} The dangerous action is <strong>{analysis.dangerousAction.toLowerCase()}</strong>.
            </p>
            {analysis.signalDetails.length > 0 && (
              <ul className="intervention-why">
                {analysis.signalDetails.slice(0, 5).map((signal) => (
                  <li key={signal.code}><em>+{signal.points}</em><div><strong>{signal.label}</strong>{signal.evidence && <span>{signal.evidence}</span>}</div></li>
                ))}
              </ul>
            )}
            <div className="intervention-safe-action">
              <ShieldCheck size={15} />
              <span><b>Safe alternative:</b> {analysis.recommendedAction}</span>
            </div>
            <div className="intervention-signals"><span><Zap size={13} /> {analysis.signals.length} combined signals</span><span>{analysis.score}/100 {analysis.level}</span></div>
            <div className="intervention-actions">
              <button className="primary" onClick={() => { setResolution('canceled'); record('canceled') }}><X size={15} /> Cancel risky action</button>
              {onAfterTap && <button className="text-button" onClick={onAfterTap}><LifeBuoy size={15} /> Open AfterTap Rescue</button>}
              <button className="secondary" onClick={() => { setShowTrustCircle(true); record('verified') }}><UserRoundCheck size={15} /> Verify identity</button>
              <button className="text-button" onClick={() => setShowReceipt((visible) => !visible)} aria-expanded={showReceipt}><Fingerprint size={15} /> {showReceipt ? 'Hide Trust Receipt' : 'View Trust Receipt'}</button>
              <button className="hold-button" onPointerDown={startHold} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold} onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); startHold() } }} onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); cancelHold() } }} aria-label="Continue anyway. Press and hold for three seconds" disabled={holdProgress >= 100}>
                <span style={{ width: `${holdProgress}%` }} />
                <b>{holdLabel}</b>
              </button>
            </div>
          </div>
        </div>}

        {showReceipt && <div className="trust-receipt" role="region" aria-labelledby="receipt-title">
          <div className="receipt-heading"><div><p className="eyebrow">TRANSPARENT RECORD</p><h2 id="receipt-title">Trust Receipt</h2></div><button className="icon-button" onClick={() => setShowReceipt(false)} aria-label="Close Trust Receipt"><X size={16} /></button></div>
          <dl><div><dt>Risk level</dt><dd>{analysis.level} · {analysis.score}/100</dd></div><div><dt>Detected signals</dt><dd>{analysis.signals.length ? analysis.signals.join(', ') : 'None'}</dd></div><div><dt>Action at risk</dt><dd>{analysis.dangerousAction}</dd></div><div><dt>Analysis source</dt><dd>{fromServer ? 'TrustPause risk API (server)' : 'On-device engine'}</dd></div></dl>
          <p className="fine"><ShieldCheck size={14} /> Only the risk result is recorded — the message content itself is not stored.</p>
        </div>}
      </section>
      {showTrustCircle && <TrustCircleDialog close={() => setShowTrustCircle(false)} />}
    </div>
  )
}
