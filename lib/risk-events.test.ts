import { afterEach, describe, expect, it } from 'vitest'
import { readLocalRiskEvents, writeLocalRiskEvent, type NewRiskEvent } from './risk-events'

const storage = new Map<string, string>()
const localStorageMock: Storage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => { storage.set(key, value) },
  removeItem: (key) => { storage.delete(key) },
  clear: () => { storage.clear() },
  key: () => null,
  length: 0,
}

const sample: NewRiskEvent = {
  guardian: 'Payment Guardian',
  title: 'Payment Guardian',
  detail: '₹18,000 payment attempt paused',
  risk: 'Urgency + new recipient + unverified request',
  status: 'Protected',
  tone: 'green',
}

afterEach(() => {
  storage.clear()
  delete (globalThis as { window?: unknown }).window
})

describe('risk event store', () => {
  it('writes and reads events from local storage, newest first', () => {
    ;(globalThis as { window?: unknown }).window = { localStorage: localStorageMock }

    writeLocalRiskEvent({ ...sample, occurred_at: '2026-09-05T09:00:00.000Z' })
    writeLocalRiskEvent({ ...sample, title: 'Link Guardian', guardian: 'Link Guardian', occurred_at: '2026-09-05T10:00:00.000Z' })

    const events = readLocalRiskEvents()
    expect(events).toHaveLength(2)
    expect(events[0].guardian).toBe('Link Guardian')
    expect(events[1].guardian).toBe('Payment Guardian')
  })

  it('generates ids and timestamps when not provided and caps history at 50', () => {
    ;(globalThis as { window?: unknown }).window = { localStorage: localStorageMock }

    const event = writeLocalRiskEvent(sample)
    expect(event.id).toMatch(/^local-/)
    expect(new Date(event.occurred_at).getTime()).not.toBeNaN()

    for (let i = 0; i < 55; i += 1) writeLocalRiskEvent(sample)
    expect(readLocalRiskEvents()).toHaveLength(50)
  })

  it('deduplicates events with the same id', () => {
    ;(globalThis as { window?: unknown }).window = { localStorage: localStorageMock }

    writeLocalRiskEvent({ ...sample, id: 'event-1' })
    writeLocalRiskEvent({ ...sample, id: 'event-1' })
    expect(readLocalRiskEvents()).toHaveLength(1)
  })

  it('ignores corrupted history', () => {
    ;(globalThis as { window?: unknown }).window = { localStorage: localStorageMock }

    storage.set('trustpause.risk-events.v1', 'not-json')
    expect(readLocalRiskEvents()).toEqual([])

    storage.set('trustpause.risk-events.v1', JSON.stringify([{ broken: true }]))
    expect(readLocalRiskEvents()).toEqual([])
  })
})