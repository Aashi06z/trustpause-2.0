import { describe, expect, it } from 'vitest'
import { validateCreateRiskEventRequest } from './server-risk-events'

describe('validateCreateRiskEventRequest', () => {
  it('accepts a valid risk event request', () => {
    const result = validateCreateRiskEventRequest({
      type: 'link-paused',
      riskScore: 78,
      riskLevel: 'HIGH',
      signals: ['suspicious-domain', 'urgency'],
      guardian: 'Link Guardian',
      userAction: 'paused',
      interventionOutcome: 'blocked',
    })

    expect(result.type).toBe('link-paused')
    expect(result.riskScore).toBe(78)
    expect(result.riskLevel).toBe('HIGH')
    expect(result.signals).toEqual(['suspicious-domain', 'urgency'])
    expect(result.guardian).toBe('Link Guardian')
    expect(result.userAction).toBe('paused')
    expect(result.interventionOutcome).toBe('blocked')
    expect(result.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('defaults occurred_at when omitted', () => {
    const result = validateCreateRiskEventRequest({
      type: 'payment-paused',
      riskScore: 60,
      riskLevel: 'ELEVATED',
      signals: ['new-recipient'],
    })

    expect(result.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('rejects requests missing required fields', () => {
    expect(() => validateCreateRiskEventRequest({})).toThrow('type is required.')
    expect(() =>
      validateCreateRiskEventRequest({ type: 't', riskScore: 10, riskLevel: 'MEDIUM', signals: ['x'] })
    ).toThrow('riskLevel must be one of')
    expect(() =>
      validateCreateRiskEventRequest({ type: 't', riskScore: '10' as unknown as number, riskLevel: 'LOW', signals: ['x'] })
    ).toThrow('riskScore must be a number.')
    expect(() =>
      validateCreateRiskEventRequest({ type: 't', riskScore: 10, riskLevel: 'LOW', signals: null as unknown as string[] })
    ).toThrow()
  })

  it('trims and normalizes string fields', () => {
    const result = validateCreateRiskEventRequest({
      type: '  t  ',
      riskScore: 55,
      riskLevel: 'LOW',
      signals: ['  urgency  '],
      guardian: '  g  ',
      userAction: '  u  ',
      interventionOutcome: '  i  ',
    })

    expect(result.type).toBe('t')
    expect(result.riskScore).toBe(55)
    expect(result.riskLevel).toBe('LOW')
    expect(result.signals).toEqual(['urgency'])
    expect(result.guardian).toBe('g')
    expect(result.userAction).toBe('u')
    expect(result.interventionOutcome).toBe('i')
  })

  it('clamps risk scores to the 0-100 range', () => {
    expect(
      validateCreateRiskEventRequest({ type: 't', riskScore: -50, riskLevel: 'LOW', signals: ['x'] }).riskScore
    ).toBe(0)
    expect(
      validateCreateRiskEventRequest({ type: 't', riskScore: 150, riskLevel: 'LOW', signals: ['x'] }).riskScore
    ).toBe(100)
  })

  it('accepts a request with an explicit timestamp', () => {
    const result = validateCreateRiskEventRequest({
      type: 't',
      riskScore: 0,
      riskLevel: 'LOW',
      signals: ['x'],
      occurred_at: '2024-01-01T00:00:00.000Z',
    })
    expect(result.occurred_at).toBe('2024-01-01T00:00:00.000Z')
  })
})
