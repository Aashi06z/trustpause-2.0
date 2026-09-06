'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Clipboard, Download, ExternalLink, LifeBuoy, ShieldCheck } from 'lucide-react'
import { buildIncidentSummary, INCIDENT_CONFIG, type IncidentMetadata, type IncidentType } from '@/lib/aftertap'
import { saveIncidentMetadataWithFallback } from '@/lib/firebase-repositories'

const incidentTypes = Object.values(INCIDENT_CONFIG) as (typeof INCIDENT_CONFIG[IncidentType])[]

export default function AfterTapRescue() {
  const [selected, setSelected] = useState<IncidentType>('sent-money')
  const [timeline, setTimeline] = useState('')
  const [transactionReference, setTransactionReference] = useState('')
  const [saved, setSaved] = useState(false)
  const [storageMode, setStorageMode] = useState<'firebase' | 'local'>('local')
  const [copied, setCopied] = useState(false)
  const config = INCIDENT_CONFIG[selected]
  const metadata = useMemo<IncidentMetadata>(() => ({ incidentType: selected, timeline: timeline.trim(), transactionReference: transactionReference.trim(), createdAt: new Date().toISOString() }), [selected, timeline, transactionReference])
  const summary = useMemo(() => buildIncidentSummary(metadata), [metadata])

  async function saveMetadata() {
    const mode = await saveIncidentMetadataWithFallback(metadata)
    setStorageMode(mode)
    setSaved(true)
  }

  async function copySummary() {
    await navigator.clipboard?.writeText(summary)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  function downloadSummary() {
    const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'trustpause-aftertap-summary.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <div className="aftertap-page">
    <div className="topbar"><div><span className="breadcrumb">Workspace / </span>AfterTap Rescue</div><span className="pill pill-amber"><LifeBuoy size={12} /> Local guidance</span></div>
    <section className="aftertap-header"><div><p className="eyebrow">AFTERTAP RESCUE</p><h1>Make the next safe move.</h1><p className="muted lead">A calm, local checklist for what to do after a suspicious digital interaction. TrustPause cannot reverse a transaction or contact banks, providers, or authorities automatically.</p></div><div className="aftertap-icon"><LifeBuoy size={28} /></div></section>
    <section className="aftertap-card card">
      <div className="card-heading"><div><p className="eyebrow">STEP 01</p><h2>What happened?</h2><p className="muted">Choose the closest description. We do not need passwords, codes, card numbers, or identity-document numbers.</p></div></div>
      <div className="incident-grid" role="radiogroup" aria-label="Incident type">
        {incidentTypes.map((incident) => <button key={incident.id} className={selected === incident.id ? 'incident-choice selected' : 'incident-choice'} role="radio" aria-checked={selected === incident.id} onClick={() => { setSelected(incident.id); setSaved(false) }}><AlertTriangle size={16} /><span>{incident.title}</span><Check size={15} /></button>)}
      </div>
      <div className="aftertap-fields"><label>When did this happen?<span>Use an approximate time if needed.</span><input value={timeline} onChange={(event) => { setTimeline(event.target.value); setSaved(false) }} placeholder="For example: Today around 2:30 PM" maxLength={100} /></label><label>Transaction reference <span>Optional. Do not enter account or card credentials.</span><input value={transactionReference} onChange={(event) => { setTransactionReference(event.target.value); setSaved(false) }} placeholder="Provider reference only, if available" maxLength={100} /></label></div>
      <div className="aftertap-actions"><button className="primary" onClick={() => { void saveMetadata() }}><ShieldCheck size={15} /> {saved ? `Metadata saved ${storageMode === 'firebase' ? 'to Firebase' : 'locally'}` : 'Save non-sensitive details'}</button><span className="aftertap-storage-note">Only incident type, timeline, reference, and created time are saved.</span></div>
    </section>
    <section className="aftertap-grid"><section className="aftertap-card card"><p className="eyebrow">STEP 02 · STATIC CHECKLIST</p><h2>{config.title}</h2><p className="muted">{config.description}</p><ol className="rescue-checklist">{config.checklist.map((item) => <li key={item}>{item}</li>)}</ol><div className="rescue-boundary"><AlertTriangle size={15} /><span>TrustPause cannot reverse a transaction. Use the official channel you open independently.</span></div></section><section className="aftertap-card card"><p className="eyebrow">PRESERVE EVIDENCE</p><h2>Keep a clean record</h2><ul className="evidence-list">{config.evidence.map((item) => <li key={item}>{item}</li>)}</ul><div className="reporting-links"><p className="eyebrow">REPORTING CHANNELS</p>{config.reportingLinks.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />{link.label}</a>)}</div></section></section>
    <section className="aftertap-card card summary-card"><div className="card-heading"><div><p className="eyebrow">STEP 03 · INCIDENT SUMMARY</p><h2>Copy or download what you recorded</h2><p className="muted">This summary contains only the metadata above and general evidence reminders.</p></div><div className="summary-actions"><button className="secondary" onClick={copySummary}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'Copied' : 'Copy summary'}</button><button className="secondary" onClick={downloadSummary}><Download size={14} /> Download</button></div></div><pre className="summary-preview">{summary}</pre></section>
    <p className="aftertap-privacy"><ShieldCheck size={14} /> Private values such as passwords, OTPs, PINs, card numbers, identity-document numbers, and challenge answers are never requested or stored.</p>
  </div>
}
