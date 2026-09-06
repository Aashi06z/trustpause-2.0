'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Edit3, MessageSquare, Phone, Plus, ShieldCheck, Trash2, UserRound, X } from 'lucide-react'
import { createLocalTrustedContactRepository, type NewTrustedContact, type TrustedContact } from '@/lib/trust-circle'
import { createFirebaseTrustedContactRepository, loadTrustedContactsWithFallback } from '@/lib/firebase-repositories'

export const VERIFICATION_MESSAGE = 'I received an urgent request that may be impersonating someone I know. Please help me verify it through a separate channel.'

type TrustCircleProps = {
  compact?: boolean
  onClose?: () => void
}

const emptyForm: NewTrustedContact = { name: '', relationship: '', phoneNumber: '', verificationPhrase: '' }

function ContactForm({ initial, onCancel, onSave }: { initial?: TrustedContact; onCancel: () => void; onSave: (input: NewTrustedContact) => Promise<void> }) {
  const [form, setForm] = useState<NewTrustedContact>(initial ? { name: initial.name, relationship: initial.relationship, phoneNumber: initial.phoneNumber, verificationPhrase: '' } : emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!form.name.trim() || !form.relationship.trim()) {
      setError('Name and relationship are required.')
      return
    }
    setSaving(true)
    try {
      await onSave(form)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this contact.')
    } finally {
      setSaving(false)
    }
  }

  return <form className="contact-form" onSubmit={submit}>
    <div className="contact-form-grid">
      <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" maxLength={80} required /></label>
      <label>Relationship<input value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} maxLength={50} required /></label>
      <label>Phone number<input value={form.phoneNumber} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} autoComplete="tel" inputMode="tel" placeholder="+1 415 555 0123" maxLength={24} required /></label>
      <label>Verification phrase <span className="field-note">optional, stored as a hash</span><input value={form.verificationPhrase} onChange={(event) => setForm({ ...form, verificationPhrase: event.target.value })} autoComplete="off" maxLength={120} /></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="contact-form-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving ? 'Saving...' : initial ? 'Save changes' : 'Add contact'}</button></div>
  </form>
}

function ContactCard({ contact, onEdit, onDelete }: { contact: TrustedContact; onEdit: () => void; onDelete: () => void }) {
  return <article className="trusted-contact-card">
    <div className="trusted-contact-avatar"><UserRound size={17} /></div>
    <div className="trusted-contact-details"><strong>{contact.name}</strong><span>{contact.relationship}</span><a href={`tel:${contact.phoneNumber}`}>{contact.phoneNumber}</a></div>
    <div className="trusted-contact-actions"><a className="icon-button" href={`tel:${contact.phoneNumber}`} aria-label={`Call ${contact.name}`} title={`Call ${contact.name}`}><Phone size={15} /></a><button className="icon-button" onClick={onEdit} aria-label={`Edit ${contact.name}`} title={`Edit ${contact.name}`}><Edit3 size={15} /></button><button className="icon-button danger-icon" onClick={onDelete} aria-label={`Delete ${contact.name}`} title={`Delete ${contact.name}`}><Trash2 size={15} /></button></div>
  </article>
}

export default function TrustCircle({ compact = false, onClose }: TrustCircleProps) {
  const [contacts, setContacts] = useState<TrustedContact[]>([])
  const [editing, setEditing] = useState<TrustedContact | undefined>()
  const [adding, setAdding] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [storageMode, setStorageMode] = useState<'firebase' | 'local'>('local')
  const localRepository = createLocalTrustedContactRepository()
  const firebaseRepository = createFirebaseTrustedContactRepository()

  useEffect(() => {
    void loadTrustedContactsWithFallback().then(({ contacts: nextContacts, mode }) => { setContacts(nextContacts); setStorageMode(mode); setLoading(false) })
  }, [])

  async function saveContact(input: NewTrustedContact) {
    const repository = firebaseRepository ?? localRepository
    let contact: TrustedContact | null
    try {
      contact = editing ? await repository.update(editing.id, input) : await repository.add(input)
    } catch {
      contact = editing ? await localRepository.update(editing.id, input) : await localRepository.add(input)
      setStorageMode('local')
    }
    if (!contact) throw new Error('This contact is no longer available.')
    const refreshed = await loadTrustedContactsWithFallback()
    setContacts(refreshed.contacts)
    setStorageMode(refreshed.mode)
    setEditing(undefined)
    setAdding(false)
  }

  async function deleteContact(id: string) {
    try { await (firebaseRepository ?? localRepository).remove(id) } catch { setStorageMode('local') }
    await localRepository.remove(id)
    const refreshed = await loadTrustedContactsWithFallback()
    setContacts(refreshed.contacts)
    setStorageMode(refreshed.mode)
  }

  async function copyMessage() {
    await navigator.clipboard?.writeText(VERIFICATION_MESSAGE)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const visibleContacts = compact ? contacts.slice(0, 3) : contacts

  return <section className={compact ? 'trust-circle-panel compact-trust-circle' : 'trust-circle-panel'} aria-labelledby="trust-circle-title">
    <div className="trust-circle-heading"><div><p className="eyebrow">HUMAN VERIFICATION</p><h2 id="trust-circle-title">Trust Circle</h2><p className="muted">Choose someone you trust to help verify a risky request through a separate channel.</p></div>{onClose && <button className="modal-close" onClick={onClose} aria-label="Close Trust Circle"><X size={18} /></button>}</div>
    <div className="privacy-notice"><ShieldCheck size={17} /><p><strong>Privacy notice.</strong> TrustPause stores contacts only in this browser for the hackathon MVP. Verification phrases are never stored in plain text, and contacts cannot see your messages or account.</p></div>
    <p className="repository-status" role="status"><span className={storageMode === 'firebase' ? 'live-dot' : 'status-dot'} />{loading ? 'Loading trusted contacts...' : storageMode === 'firebase' ? 'Synced with Firebase' : 'Offline mode · saved in this browser'}</p>
    {loading && <div className="empty-circle" aria-live="polite"><p>Loading trusted contacts...</p></div>}
    {!loading && contacts.length === 0 && !adding && <div className="empty-circle"><UserRound size={22} /><p>No trusted contacts yet.</p><span>Add someone you can reach independently.</span></div>}
    {!loading && <div className="trusted-contact-list">{visibleContacts.map((contact) => <ContactCard key={contact.id} contact={contact} onEdit={() => { setEditing(contact); setAdding(false) }} onDelete={() => { void deleteContact(contact.id) }} />)}</div>}
    {compact && contacts.length > 3 && <p className="muted compact-note">Showing the first three contacts.</p>}
    {(adding || editing) && <ContactForm initial={editing} onCancel={() => { setAdding(false); setEditing(undefined) }} onSave={saveContact} />}
    {!adding && !editing && <div className="trust-circle-actions"><button className="primary" onClick={() => setAdding(true)}><Plus size={15} /> Add contact</button><button className="secondary" onClick={copyMessage}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy verification message'}</button></div>}
    <p className="prepared-message"><MessageSquare size={14} /><span>{VERIFICATION_MESSAGE}</span></p>
  </section>
}

export function TrustCircleDialog({ close }: { close: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><section className="demo-modal trust-circle-dialog" role="dialog" aria-modal="true" aria-labelledby="trust-circle-title"><TrustCircle compact onClose={close} /></section></div>
}
