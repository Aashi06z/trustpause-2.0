import { describe, expect, it } from 'vitest'
import { buildIncidentSummary, INCIDENT_CONFIG, type IncidentType } from './aftertap'

describe('AfterTap incident configuration', () => {
  it.each(Object.keys(INCIDENT_CONFIG) as IncidentType[])('provides a static rescue checklist for %s', (incidentType) => {
    const config = INCIDENT_CONFIG[incidentType]
    const summary = buildIncidentSummary({ incidentType, timeline: 'Today at 2 PM', transactionReference: 'REF-123', createdAt: '2026-09-05T00:00:00.000Z' })

    expect(config.checklist.length).toBeGreaterThan(2)
    expect(config.evidence.length).toBeGreaterThan(2)
    expect(config.reportingLinks.length).toBeGreaterThan(0)
    expect(summary).toContain(config.title)
    expect(summary).toContain('TrustPause cannot reverse a transaction')
  })
})
