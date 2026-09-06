'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowRight, Bell, Check, ChevronRight, CircleAlert, Clock3, Eye,
  Fingerprint, Gauge, Globe2, HandCoins, Info, LifeBuoy, LockKeyhole, MessageSquare,
  Phone, Play, RotateCcw, ScanFace, ShieldCheck, SlidersHorizontal, Sparkles, Users, WalletCards, X, Zap,
} from 'lucide-react'
import { ensureAnonymousUser, getSupabase, DEFAULT_USER_SETTINGS, type RiskEvent, type TrustCircleMember, type UserSettings } from '@/lib/supabase'
import { readLocalRiskEvents, recordRiskEvent, writeLocalRiskEvent, type NewRiskEvent } from '@/lib/risk-events'
import CognitiveRiskEngine from '@/components/cognitive-risk-engine'
import LinkGuardian from '@/components/link-guardian'
import TrustCirclePanel, { TrustCircleDialog } from '@/components/trust-circle'
import AfterTapRescue from '@/components/aftertap-rescue'
import QrCodeScanner from '@/components/qr-scanner'
import ThreatLab from '@/components/threat-lab'
import { loadUserPreferencesWithFallback, saveUserPreferencesWithFallback } from '@/lib/firebase-repositories'

export default TrustPauseApp

type View = 'Overview' | 'Live Protection' | 'Threat Lab' | 'Risk Events' | 'Trust Circle' | 'Insights' | 'Settings' | 'AfterTap' | 'Architecture'
type AppRiskEvent = RiskEvent & { icon: typeof Activity }

const nav: { label: View; icon: typeof Activity }[] = [
  { label: 'Overview', icon: Activity },
  { label: 'Live Protection', icon: ShieldCheck },
  { label: 'Threat Lab', icon: Play },
  { label: 'Risk Events', icon: CircleAlert },
  { label: 'Trust Circle', icon: Users },
  { label: 'Insights', icon: Gauge },
  { label: 'Settings', icon: SlidersHorizontal },
  { label: 'AfterTap', icon: LifeBuoy },
]

function daysAgo(days: number, hour = 10) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 15, 0, 0)
  return date.toISOString()
}

const demoEvents: AppRiskEvent[] = [
  { id: 'demo-payment', guardian: 'Payment Guardian', icon: HandCoins, title: 'Payment Guardian', detail: '₹18,000 payment attempt paused', risk: 'Urgency + new recipient + unverified request', status: 'Protected', occurred_at: daysAgo(2, 10), tone: 'green' },
  { id: 'demo-link', guardian: 'Link Guardian', icon: Globe2, title: 'Link Guardian', detail: 'Suspicious banking URL intercepted', risk: 'Domain mismatch + credential request', status: 'Blocked', occurred_at: daysAgo(3, 16), tone: 'green' },
  { id: 'demo-message', guardian: 'Message Guardian', icon: MessageSquare, title: 'Message Guardian', detail: 'Possible impersonation detected', risk: 'Authority + urgency + secrecy', status: 'Reviewed', occurred_at: daysAgo(5, 9), tone: 'green' },
]

const GUARDIAN_ICONS: Record<string, typeof Activity> = {
  'Payment Guardian': HandCoins,
  'Link Guardian': Globe2,
  'Message Guardian': MessageSquare,
  'Call Guardian': Phone,
  'Media Guardian': ScanFace,
}

function withEventIcon(event: RiskEvent): AppRiskEvent {
  return { ...event, icon: GUARDIAN_ICONS[event.guardian] ?? ShieldCheck }
}

function TrustPauseApp() {
  const [view, setView] = useState<View>('Overview')
  const [demo, setDemo] = useState(false)
  const [showTrustCircleDialog, setShowTrustCircleDialog] = useState(false)
  const [eventData, setEventData] = useState<AppRiskEvent[]>(demoEvents)
  const [members, setMembers] = useState<TrustCircleMember[]>([])
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS)
  const [dataMode, setDataMode] = useState<'demo' | 'connected'>('demo')

  const reset = () => { setView('Overview'); setDemo(false); setShowTrustCircleDialog(false) }

  const record = useCallback((input: NewRiskEvent) => {
    const event = writeLocalRiskEvent(input)
    setEventData((current) => [withEventIcon(event), ...current.filter((item) => item.id !== event.id)].slice(0, 50))
    void recordRiskEvent({ ...input, id: event.id, occurred_at: event.occurred_at }).then((persisted) => {
      setEventData((current) => [withEventIcon(persisted), ...current.filter((item) => item.id !== persisted.id)].slice(0, 50))
    })
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      const localEvents = readLocalRiskEvents()
      if (active && localEvents.length) setEventData(localEvents.map(withEventIcon))

      const firebasePreferences = await loadUserPreferencesWithFallback(DEFAULT_USER_SETTINGS)
      if (active) setSettings(firebasePreferences.preferences)

      const supabase = getSupabase()
      if (!supabase) return
      try {
        const user = await ensureAnonymousUser()
        if (!user) return
        const [{ data: rows }, { data: circle }, { data: prefs }] = await Promise.all([
          supabase.from('risk_events').select('*').eq('user_id', user.id).order('occurred_at', { ascending: false }),
          supabase.from('trust_circle_members').select('id,name,initials,relationship').eq('user_id', user.id).order('created_at'),
          supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
        ])
        if (!active) return
        if (rows?.length) setEventData(rows.map(withEventIcon))
        if (circle?.length) setMembers(circle)
        if (prefs) setSettings({ ...DEFAULT_USER_SETTINGS, ...prefs })
        setDataMode('connected')
      } catch (error) {
        console.error('TrustPause backend unavailable', error)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  const saveSettings = useCallback(async (next: UserSettings) => {
    setSettings(next)
    await saveUserPreferencesWithFallback(next)
    const supabase = getSupabase()
    if (!supabase) return
    try {
      const user = await ensureAnonymousUser()
      if (user) await supabase.from('user_settings').upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() })
    } catch (error) {
      console.warn('Settings sync unavailable; kept locally.', error)
    }
  }, [])

  const openAfterTap = useCallback(() => { setDemo(false); setShowTrustCircleDialog(false); setView('AfterTap') }, [])

  const content = useMemo(() => {
    if (view === 'Overview') return <Overview events={eventData} runDemo={() => setView('Threat Lab')} onViewEvents={() => setView('Risk Events')} />
    if (view === 'Live Protection') return <LiveProtection runDemo={() => setView('Threat Lab')} onRecord={record} />
    if (view === 'Threat Lab') return (
      <ThreatLab
        settings={settings}
        onRecord={record}
        onOpenAnalyzer={() => setDemo(true)}
        onOpenTrustCircle={() => setShowTrustCircleDialog(true)}
        onAfterTap={openAfterTap}
      />
    )
    if (view === 'Risk Events') return <Events items={eventData} onAfterTap={openAfterTap} />
    if (view === 'Trust Circle') return <TrustCircle members={members} />
    if (view === 'Insights') return <Insights events={eventData} />
    if (view === 'Settings') return <Settings value={settings} save={saveSettings} />
    if (view === 'AfterTap') return <AfterTapRescue />
    return <Architecture />
  }, [eventData, members, settings, view, record, saveSettings, openAfterTap])

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} reset={reset} onRunDemo={() => setView('Threat Lab')} />
      <main className="main-content">
        {content}
        <footer>
          <span>TrustPause prototype · {dataMode === 'connected' ? 'cloud sync on' : 'local-first mode'} · <a href="/" className="sim-back-link">Interactive simulator</a></span>
          <span>Privacy-first by design · <button onClick={() => setView('Architecture')}>How it works</button></span>
        </footer>
      </main>
      <MobileNav view={view} setView={setView} />
      {demo && <CognitiveRiskEngine close={() => setDemo(false)} onAfterTap={openAfterTap} onRecord={record} />}
      {showTrustCircleDialog && <TrustCircleDialog close={() => setShowTrustCircleDialog(false)} />}
    </div>
  )
}

/* ---------------- shared bits ---------------- */

function RiskPill({ children, tone = 'green' }: { children: React.ReactNode; tone?: 'green' | 'red' | 'amber' | 'muted' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}


function SectionTitle({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return <div className="section-title">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="muted lead">{description}</p>}</div>
}

function Sidebar({ view, setView, reset, onRunDemo }: { view: View; setView: (v: View) => void; reset: () => void; onRunDemo: () => void }) {
  return (
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={19} /></div><div><strong>TrustPause</strong><small>Ambient Human Firewall</small></div></div>
      <div className="active-status"><span className="live-dot" /><div><b>TrustPause Active</b><small>Protection is running quietly</small></div></div>
      <button className="primary demo-button" onClick={onRunDemo}><Play size={15} fill="currentColor" /> Run Safety Check</button>
      <nav>{nav.map(({ label, icon: Icon }) => (
        <button key={label} className={view === label ? 'nav-item selected' : 'nav-item'} onClick={() => setView(label)}>
          <Icon size={17} /><span>{label}</span>{label === 'Threat Lab' && <em>5</em>}
        </button>
      ))}</nav>
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={() => setView('Architecture')}><Fingerprint size={17} /><span>How it works</span></button>
        <button className="reset" onClick={reset}><RotateCcw size={14} /> Reset demo</button>
        <small className="prototype-note">Prototype environment · no device monitoring</small>
      </div>
    </aside>
  )
}

function MobileNav({ view, setView }: { view: View; setView: (v: View) => void }) {
  const short = (label: string) => label === 'Live Protection' ? 'Live' : label.split(' ')[0]
  return <div className="mobile-nav">{nav.map(({ label, icon: Icon }) => (
    <button key={label} className={view === label ? 'selected' : ''} onClick={() => setView(label)}>
      <Icon size={18} /><span>{short(label)}</span>
    </button>
  ))}</div>
}

function Metric({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return <div className="metric"><strong className={accent ? 'accent' : ''}>{value}</strong><span>{label}</span></div>
}

function guardians() {
  return [
    { icon: Globe2, title: 'Link Guardian', desc: 'Checks suspicious URLs before they open.', count: '12 events', status: 'ACTIVE' },
    { icon: WalletCards, title: 'Payment Guardian', desc: 'Pauses risky payments to new recipients.', count: '4 events', status: 'ACTIVE' },
    { icon: MessageSquare, title: 'Message Guardian', desc: 'Detects manipulation patterns with consent.', count: '8 events', status: 'ACTIVE' },
    { icon: Phone, title: 'Call Guardian', desc: 'Screens unknown callers for impersonation.', count: '0 events', status: 'ACTIVE' },
    { icon: ScanFace, title: 'Media Guardian', desc: 'Surfaces provenance and authenticity signals.', count: '2 events', status: 'ACTIVE' },
  ]
}

/* ---------------- Overview ---------------- */

function Overview({ events, runDemo, onViewEvents }: { events: AppRiskEvent[]; runDemo: () => void; onViewEvents: () => void }) {
  const today = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  const interventions = events.filter((event) => event.status === 'Protected' || event.status === 'Blocked').length
  const paymentPaused = events.some((event) => event.guardian === 'Payment Guardian' && event.status === 'Protected')

  return (
    <>
      <div className="topbar">
        <div><span className="breadcrumb">Workspace / </span>Overview</div>
        <div className="top-actions"><span className="date"><Clock3 size={14} /> {today}</span><button className="icon-button" aria-label="Notifications"><Bell size={17} /><i /></button><div className="avatar">AK</div></div>
      </div>
      <section className="hero">
        <div>
          <p className="eyebrow">TRUSTPAUSE PROTECTION</p>
          <h1>Your digital safety layer<br /><span>is active.</span></h1>
          <p className="muted lead">TrustPause watches for moments where manipulation could turn into harmful action — and pauses you before it matters.</p>
          <button className="primary" onClick={runDemo}>Try the Threat Lab <ArrowRight size={16} /></button>
        </div>
        <div className="status-card">
          <div className="status-ring"><ShieldCheck size={31} /></div>
          <p className="eyebrow">CURRENT STATUS</p>
          <h2>Protected</h2>
          <p>TrustPause is monitoring supported interactions.</p>
          <div className="status-line"><span className="live-dot" /> Quiet protection is on</div>
        </div>
      </section>
      <div className="metrics card">
        <Metric value={String(24 + events.length)} label="interactions checked" />
        <Metric value={String(events.length)} label="risks detected" />
        <Metric value={String(interventions)} label="interventions" />
        <Metric value={paymentPaused ? '₹18,000' : '—'} label="protected so far" accent />
      </div>
      <div className="grid-2">
        <section className="card risk-card">
          <div className="card-heading"><div><p className="eyebrow">SIGNAL ANALYSIS</p><h2>Cognitive Risk Engine</h2></div><RiskPill tone={events.length ? 'amber' : 'green'}>{(events.length ? Math.min(99, 18 + events.length * 7) : 18)}/100</RiskPill></div>
          <div className="risk-meter"><div className="meter-value">{events.length ? Math.min(99, 18 + events.length * 7) : 18}<span>/100</span></div><div className="meter-track"><i style={{ width: `${events.length ? Math.min(99, 18 + events.length * 7) : 18}%` }} /></div><small>{events.length ? 'More risk signals seen recently — stay alert.' : 'No immediate action required.'}</small></div>
          <div className="chips">
            <span><Check size={13} /> No urgency</span><span><Check size={13} /> Verified sender</span><span><Check size={13} /> Known recipient</span><span><Check size={13} /> No credential request</span>
          </div>
          <p className="fine"><Info size={14} /> Score is based on combinations of signals, not one isolated indicator.</p>
        </section>
        <section className="card privacy-card">
          <div className="privacy-icon"><LockKeyhole size={20} /></div>
          <p className="eyebrow">PRIVACY BY DESIGN</p>
          <h2>Your context stays yours.</h2>
          <p className="muted">Private content stays on-device whenever possible. Deeper analysis requires explicit consent.</p>
          <div className="privacy-row"><Check size={15} /> No continuous recording <Check size={15} /> User-controlled signals</div>
        </section>
      </div>
      <section className="card recent">
        <div className="card-heading"><div><p className="eyebrow">ACTIVITY</p><h2>Recent protection events</h2></div><button className="text-button" onClick={onViewEvents}>View all <ArrowRight size={14} /></button></div>
        <EventList items={events.slice(0, 4)} />
      </section>
    </>
  )
}

/* ---------------- Live Protection ---------------- */

function LiveProtection({ runDemo, onRecord }: { runDemo: () => void; onRecord: (input: NewRiskEvent) => void }) {
  return (
    <>
      <div className="topbar"><div><span className="breadcrumb">Workspace / </span>Live Protection</div><div className="top-actions"><RiskPill><span className="live-dot" /> All systems active</RiskPill></div></div>
      <SectionTitle eyebrow="THE GUARDIANS" title="Live Protection" description="TrustPause stays quiet until a digital interaction crosses the risk threshold." />
      <LinkGuardian onRisky={(result) => onRecord({
        guardian: 'Link Guardian',
        title: 'Link Guardian',
        detail: 'Suspicious link flagged in live check',
        risk: result.detectedSignals.map((signal) => signal.label).slice(0, 3).join(' + ') || 'Suspicious domain',
        status: 'Reviewed',
        tone: 'amber',
      })} />
      <div className="guardian-grid">
        {guardians().map(({ icon: Icon, title, desc, count, status }) => (
          <div className="card guardian" key={title}>
            <div className="guardian-top"><div className="guardian-icon"><Icon size={19} /></div><RiskPill tone={status === 'DEMO MODE' ? 'amber' : 'green'}>{status}</RiskPill></div>
            <h2>{title}</h2><p className="muted">{desc}</p>
            <div className="guardian-foot"><span>{count}</span><button className="text-button" onClick={runDemo}>Run simulation <ChevronRight size={14} /></button></div>
          </div>
        ))}
      </div>
      <section className="card layers">
        <div className="card-heading"><div><p className="eyebrow">INTERVENTION MODEL</p><h2>Three layers of protection</h2></div><button className="secondary" onClick={runDemo}>Try the flow <ArrowRight size={15} /></button></div>
        <div className="layer-flow">
          <div><span>01</span><Zap size={18} /><h3>Silent Sense</h3><p>Detect risk signals without interrupting the user.</p></div>
          <ArrowRight className="flow-arrow" />
          <div><span>02</span><Eye size={18} /><h3>Micro-Pause</h3><p>Show a lightweight warning when signals combine.</p></div>
          <ArrowRight className="flow-arrow" />
          <div className="layer-highlight"><span>03</span><LockKeyhole size={18} /><h3>Action Lock</h3><p>Add friction before an irreversible action.</p></div>
        </div>
        <div className="action-tags"><span>Send money</span><span>Share OTP</span><span>Enter password</span><span>Install app</span><span>Open suspicious link</span></div>
      </section>
    </>
  )
}

/* ---------------- Risk Events ---------------- */

function EventList({ items, onAfterTap }: { items: AppRiskEvent[]; onAfterTap?: () => void }) {
  const [selected, setSelected] = useState<AppRiskEvent | null>(null)
  if (items.length === 0) {
    return <div className="empty-events"><ShieldCheck size={22} /><p>No risk events yet.</p><span>Run a Threat Lab simulation to see interventions appear here.</span></div>
  }
  return (
    <>
      <div className="event-list">
        {items.map((event) => {
          const Icon = event.icon
          return (
            <button className="event-row" key={event.id} onClick={() => setSelected(event)}>
              <div className="event-icon green"><Icon size={18} /></div>
              <div className="event-copy"><strong>{event.title}</strong><span>{event.detail}</span><small>{event.risk}</small></div>
              <div className="event-meta"><RiskPill tone="green">{event.status}</RiskPill><small>{new Date(event.occurred_at).toLocaleString()}</small></div>
              <ChevronRight className="chevron" size={16} />
            </button>
          )
        })}
      </div>
      {selected && <EventDetailModal event={selected} onClose={() => setSelected(null)} onAfterTap={() => { if (onAfterTap) onAfterTap() }} />}
    </>
  )
}

function EventDetailModal({ event, onClose, onAfterTap }: { event: AppRiskEvent; onClose: () => void; onAfterTap: () => void }) {
  const Icon = event.icon
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="demo-modal event-modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
        <button className="modal-close" onClick={onClose} aria-label="Close event details"><X size={18} /></button>
        <div className="demo-header"><div className="demo-logo"><Icon size={18} /></div><div><strong id="event-modal-title">{event.title}</strong><small>{new Date(event.occurred_at).toLocaleString()}</small></div></div>
        <div className="event-modal-body">
          <RiskPill tone={event.tone}>{event.status}</RiskPill>
          <p className="event-modal-detail">{event.detail}</p>
          <dl className="event-modal-grid"><div><dt>Guardian</dt><dd>{event.guardian}</dd></div><div><dt>Risk signals</dt><dd>{event.risk}</dd></div><div><dt>Outcome</dt><dd>{event.status}</dd></div></dl>
          <div className="event-modal-actions"><button className="primary" onClick={onAfterTap}><LifeBuoy size={15} /> Open AfterTap Rescue</button><button className="secondary" onClick={onClose}><X size={15} /> Close</button></div>
        </div>
      </section>
    </div>
  )
}

function Events({ items, onAfterTap }: { items: AppRiskEvent[]; onAfterTap: () => void }) {
  const [filter, setFilter] = useState('All events')
  const visible = filter === 'All events' ? items : items.filter((event) => event.status === filter)
  const [exported, setExported] = useState(false)

  function exportLog() {
    const header = ['Guardian', 'Title', 'Detail', 'Risk', 'Status', 'Occurred at']
    const rows = items.map((event) => [event.guardian, event.title, event.detail, event.risk, event.status, event.occurred_at])
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'trustpause-risk-events.csv'
    anchor.click()
    URL.revokeObjectURL(url)
    setExported(true)
    window.setTimeout(() => setExported(false), 1800)
  }

  return (
    <>
      <div className="topbar"><div><span className="breadcrumb">Workspace / </span>Risk Events</div><button className="secondary" onClick={exportLog}>{exported ? <Check size={15} /> : <SlidersHorizontal size={15} />} {exported ? 'Exported' : 'Export log'}</button></div>
      <SectionTitle eyebrow="AUDIT TRAIL" title="Risk Events" description="A transparent history of moments where TrustPause added useful friction." />
      <div className="filter-row">
        {['All events', 'Protected', 'Blocked', 'Reviewed'].map((option) => <button key={option} className={filter === option ? 'filter selected' : 'filter'} onClick={() => setFilter(option)}>{option}</button>)}
        <span className="filter-count">{items.length} events in history</span>
      </div>
      <section className="card recent"><EventList items={visible} onAfterTap={onAfterTap} /></section>
      <p className="fine events-note"><Info size={14} /> Events are recorded locally in this browser and synced to your account when a backend is connected.</p>
    </>
  )
}

/* ---------------- Trust Circle ---------------- */

function TrustCircle({ members: _members }: { members: TrustCircleMember[] }) {
  return <TrustCirclePanel />
}

/* ---------------- Insights ---------------- */

function Insights({ events }: { events: AppRiskEvent[] }) {
  const protectedCount = events.filter((event) => event.status === 'Protected' || event.status === 'Blocked').length
  const interventionRate = events.length ? Math.round((protectedCount / events.length) * 100) : 83
  const signalCounts: Record<string, number> = {}
  for (const event of events) {
    for (const signal of event.risk.split(' + ')) {
      signalCounts[signal] = (signalCounts[signal] ?? 0) + 1
    }
  }
  const topSignals = Object.entries(signalCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const barHeights = [54, 68, 42, 82, 74, 93, Math.max(20, interventionRate)]
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <>
      <div className="topbar"><div><span className="breadcrumb">Workspace / </span>Insights</div></div>
      <SectionTitle eyebrow="YOUR PATTERNS" title="Small pauses, safer choices." description="A private view of how TrustPause is helping you slow down at the right moments." />
      <div className="insight-grid">
        <div className="card big-insight">
          <p className="eyebrow">INTERVENTION RATE</p>
          <strong>{interventionRate}%</strong>
          <p className="muted">of flagged moments were resolved without completing the risky action.</p>
          <div className="bars">{barHeights.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
          <div className="bar-labels"><span>{weekdays[0]}</span><span>{weekdays[6]}</span></div>
        </div>
        <div className="card">
          <p className="eyebrow">TOP SIGNALS</p>
          <div className="signal-score">
            <div className="score-circle">{topSignals.length ? Math.max(15, Math.round((topSignals[0][1] / events.length) * 100)) : 42}%</div>
            <div><h2>{topSignals[0]?.[0] ?? 'Urgency'}</h2><p className="muted">Most common signal in your flagged interactions.</p></div>
          </div>
          <div className="signal-list">
            {topSignals.length ? topSignals.map(([signal, count]) => (
              <span key={signal}>{signal} <b>{Math.round((count / events.length) * 100)}%</b></span>
            )) : <span>Urgency <b>42%</b></span>}
            {topSignals.length === 0 && <><span>Authority <b>31%</b></span><span>Secrecy <b>18%</b></span></>}
          </div>
        </div>
      </div>
    </>
  )
}

/* ---------------- Settings ---------------- */

function Settings({ value, save }: { value: UserSettings; save: (next: UserSettings) => void }) {
  const rows: [keyof UserSettings, string, string, typeof Activity][] = [
    ['message_analysis_consent', 'Message analysis with consent', 'Detect manipulation patterns in supported messages. Nothing is uploaded without your consent.', MessageSquare],
    ['browser_link_interception', 'Browser link interception', 'Pause suspicious links before they open and show the real domain.', Globe2],
    ['payment_pause', 'Payment Pause', 'Intervene before money goes to a new or unverified recipient.', HandCoins],
    ['call_screening', 'Call screening', 'Screen unknown callers for impersonation language and spoofing signs.', Phone],
    ['media_checks', 'Media authenticity checks', 'Surface provenance and synthetic-media signals for received media.', ScanFace],
    ['trust_circle_requests', 'Trust Circle requests', 'Allow trusted contacts to help verify an Action Lock.', Users],
    ['hold_to_continue', 'Hold-to-continue Action Lock', 'Require a three-second intentional hold before a risky action.', LockKeyhole],
  ]
  return (
    <>
      <SectionTitle eyebrow="CONTROL CENTER" title="Settings" description="Know exactly what is on, and why. Every toggle changes how the Threat Lab and guardians behave." />
      <div className="settings-list card">
        {rows.map(([key, title, desc, Icon]) => (
          <div className="setting-row" key={key}>
            <div className="setting-icon"><Icon size={18} /></div>
            <div><strong>{title}</strong><p className="muted">{desc}</p></div>
            <button className={value[key] ? 'toggle on' : 'toggle'} onClick={() => save({ ...value, [key]: !value[key] })} aria-label={`Toggle ${title}`} aria-pressed={value[key]}><i /></button>
          </div>
        ))}
      </div>
      <section className="card privacy-card">
        <p className="eyebrow">PROTOTYPE NOTE</p>
        <h2>Built around explicit boundaries.</h2>
        <p className="muted">This demo models approved integration points — link interception, consent-based message analysis, caller identification, payment platform hooks, and media checks. It does not monitor your device or record conversations.</p>
      </section>
    </>
  )
}

/* ---------------- Architecture ---------------- */

function Architecture() {
  return (
    <>
      <div className="topbar"><div><span className="breadcrumb">Workspace / </span>How it works</div></div>
      <SectionTitle eyebrow="THE SYSTEM" title="Protection without possession." description="TrustPause is a decision layer, not a surveillance layer. It adds context and friction only when the moment calls for it." />
      <div className="architecture">
        <div className="arch-step"><span>01</span><div className="arch-icon"><ScanFace size={22} /></div><div><h2>Sense signals</h2><p className="muted">Patterns like urgency, authority, secrecy, credential requests, and identity uncertainty are assessed together.</p></div></div>
        <div className="arch-step"><span>02</span><div className="arch-icon"><Sparkles size={22} /></div><div><h2>Explain the risk</h2><p className="muted">The user sees exactly why an interaction feels unsafe — never an opaque verdict.</p></div></div>
        <div className="arch-step"><span>03</span><div className="arch-icon"><LockKeyhole size={22} /></div><div><h2>Protect the choice</h2><p className="muted">A short pause, verification, or Action Lock creates room for human judgment before the irreversible action.</p></div></div>
      </div>
    </>
  )
}