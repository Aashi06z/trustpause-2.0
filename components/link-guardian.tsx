'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Globe2, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { analyzeLink, type LinkAnalysis } from '@/lib/link-guardian'
import { fetchJson } from '@/lib/api-client'
import type { LinkRiskResponse } from '@/lib/server-link-analysis'
import QrCodeScanner from '@/components/qr-scanner'

const examples = [
  'https://www.google.com',
  'https://accounts.google.com',
  'https://secure-hdfc-verify.example/login',
  'https://hdfc.com.example/login',
  'https://google.com@evil.example/login',
  'http://192.168.1.10/login',
  'hello',
]

function levelTone(level: LinkAnalysis['riskLevel'], classification?: LinkAnalysis['classification']) {
  // UNKNOWN is unverified — amber, never green.
  if (classification === 'UNKNOWN') return level === 'LOW' ? 'amber' : level === 'CAUTION' ? 'amber' : 'red'
  return level === 'LOW' ? 'green' : level === 'CAUTION' ? 'amber' : 'red'
}

export default function LinkGuardian({ initialValue = '', onRisky }: { initialValue?: string; onRisky?: (result: LinkAnalysis) => void }) {
  const [value, setValue] = useState(initialValue)
  const [analysis, setAnalysis] = useState<LinkAnalysis | null>(null)
  const [copied, setCopied] = useState(false)
  const [serverMode, setServerMode] = useState<boolean | null>(null)
  const lastNotice = useRef<{ key: string; at: number } | null>(null)

  function notifyIfRisky(result: LinkAnalysis) {
    if (!onRisky || !result.shouldInterrupt || result.riskLevel === 'LOW') return
    const key = `${result.normalizedUrl ?? result.input}:${result.riskLevel}`
    const now = Date.now()
    if (lastNotice.current?.key === key && now - lastNotice.current.at < 3000) return
    lastNotice.current = { key, at: now }
    onRisky(result)
  }

  function fromServer(result: LinkRiskResponse): LinkAnalysis {
    return {
      input: result.input,
      normalizedUrl: result.normalizedUrl,
      displayedHostname: result.displayedHostname,
      score: result.score,
      riskLevel: result.riskLevel,
      classification: result.classification ?? 'UNKNOWN',
      detectedSignals: result.detectedSignals,
      explanation: result.explanation,
      recommendedAction: result.recommendedAction,
      shouldInterrupt: result.shouldInterrupt,
      canOpenAnyway: result.canOpenAnyway,
      isValid: result.isValid,
      isPrivateTarget: result.isPrivateTarget,
      reputation: result.reputation ?? null,
    }
  }

  useEffect(() => {
    if (!initialValue) return
    setValue(initialValue)
    const result = analyzeLink(initialValue)
    setAnalysis(result)
    notifyIfRisky(result)
  }, [initialValue])

  async function analyze(nextValue: string): Promise<LinkAnalysis> {
    const local = analyzeLink(nextValue)
    if (serverMode !== true) return local
    return fetchJson<LinkRiskResponse>('/api/link-risk', { url: nextValue, context: value }, () => ({ ...local, reputation: local.reputation ?? null })).then(fromServer)
  }

  async function checkLink(nextValue = value) {
    const result = await analyze(nextValue)
    setAnalysis(result)
    setCopied(false)
    notifyIfRisky(result)
  }

  async function copyHostname() {
    if (!analysis) return
    await navigator.clipboard?.writeText(analysis.displayedHostname)
    setCopied(true)
  }

  function openAnyway() {
    if (!analysis?.normalizedUrl || !analysis.canOpenAnyway) return
    window.open(analysis.normalizedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="link-guardian card" aria-labelledby="link-guardian-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">{serverMode === true ? 'SERVER URL CHECK' : 'LOCAL URL CHECK'}</p>
          <h2 id="link-guardian-title">Link Guardian</h2>
          <p className="muted">Paste a link to inspect it before you open it. Nothing is fetched or opened automatically.</p>
        </div>
        <div>
          <button
            className="link-server-toggle"
            onClick={() => setServerMode((current) => current !== true)}
            aria-pressed={serverMode === true}
            type="button"
          >
            <ShieldCheck size={12} /> Analyze on server
          </button>
          <div className="guardian-icon" aria-hidden="true"><Globe2 size={19} /></div>
        </div>
      </div>
      <div className="link-check-form">
        <label className="simulator-label" htmlFor="link-guardian-input">URL to check</label>
        <div className="link-input-row">
          <input id="link-guardian-input" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') checkLink() }} placeholder="https://example.com/login" inputMode="url" autoComplete="off" />
          <button className="primary" onClick={() => checkLink()} disabled={!value.trim()}>Check link</button>
        </div>
      </div>
      <div className="link-examples" aria-label="Demo URLs">
        <span>Demo data:</span>
        {examples.map((example) => <button key={example} className="link-example" onClick={() => { setValue(example); checkLink(example) }}>{example}</button>)}
      </div>

      {analysis && <div className={`link-result result-${levelTone(analysis.riskLevel, analysis.classification)}`} aria-live="polite">
        <div className="link-result-header">
          <div className="link-result-status"><span className="risk-dot" /><strong>{analysis.riskLevel}</strong><span>{analysis.score}/100</span><span className="link-result-action">{analysis.classification}</span></div>
          <span className="link-result-action">{analysis.shouldInterrupt ? 'Opening interrupted' : 'No interruption needed'}</span>
        </div>
        {analysis.classification === 'UNKNOWN' && (
          <p className="link-explanation"><ShieldAlert size={14} /> Unverified: no reputation evidence was available for this host, so it is not confirmed safe.</p>
        )}
        <div className="hostname-row">
          <div><small>REAL HOSTNAME</small><strong>{analysis.displayedHostname}</strong></div>
          <button className="secondary copy-button" onClick={copyHostname} aria-label="Copy real hostname">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p className="link-explanation">{analysis.explanation}</p>
        <div className="link-signals">{analysis.detectedSignals.map((signal) => <span key={signal.code}>{signal.label}</span>)}</div>
        <div className="recommended-action"><ShieldCheck size={15} /><span><b>Recommended:</b> {analysis.recommendedAction}</span></div>
        <div className="link-actions">
          <button className="secondary" onClick={() => { setAnalysis(null); setValue('') }}><X size={14} /> Cancel</button>
          {analysis.shouldInterrupt && analysis.canOpenAnyway && <button className="primary open-anyway" onClick={openAnyway}><ExternalLink size={14} /> Open anyway</button>}
          {!analysis.shouldInterrupt && <span className="safe-note"><ShieldCheck size={14} /> No common warning signals found</span>}
          {!analysis.isValid && <span className="safe-note"><ShieldAlert size={14} /> Address not opened</span>}
        </div>
      </div>}
      <QrCodeScanner onUrlDecoded={async (nextValue) => {
        setValue(nextValue)
        const result = await analyze(nextValue)
        setAnalysis(result)
        setCopied(false)
        notifyIfRisky(result)
      }} />
      <p className="link-privacy-note">Demo verified domains are illustrative configuration, not a comprehensive security database.</p>
    </section>
  )
}
