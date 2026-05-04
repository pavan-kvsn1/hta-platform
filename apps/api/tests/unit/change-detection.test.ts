/**
 * Change Detection Unit Tests
 *
 * Tests for detectCertificateChanges and generateChangeSummary.
 * These are pure functions; no mocking required.
 */

import { describe, it, expect } from 'vitest'
import { detectCertificateChanges, generateChangeSummary } from '../../src/lib/change-detection.js'

// ── detectCertificateChanges ─────────────────────────────────────────────────

describe('detectCertificateChanges', () => {
  // ── No changes ──────────────────────────────────────────────────────────────

  it('returns hasChanges=false when records are identical', () => {
    const rec = {
      customerName: 'Acme Corp',
      srfNumber: 'SRF-001',
      parameters: [],
    }
    const result = detectCertificateChanges(rec, { ...rec })
    expect(result.hasChanges).toBe(false)
    expect(result.certificateFields).toHaveLength(0)
    expect(result.parameters).toHaveLength(0)
  })

  it('ignores fields not in the tracked FIELD_LABELS set', () => {
    const existing = { untracked: 'foo', customerName: 'Acme' }
    const incoming = { untracked: 'bar', customerName: 'Acme' }
    const result = detectCertificateChanges(existing, incoming)
    expect(result.hasChanges).toBe(false)
  })

  // ── Certificate field changes ────────────────────────────────────────────────

  it('detects a changed customerName field', () => {
    const existing = { customerName: 'Acme Corp' }
    const incoming = { customerName: 'Beta Inc' }
    const result = detectCertificateChanges(existing, incoming)

    expect(result.hasChanges).toBe(true)
    expect(result.certificateFields).toHaveLength(1)
    expect(result.certificateFields[0]).toMatchObject({
      field: 'customerName',
      fieldLabel: 'Customer Name',
      previousValue: 'Acme Corp',
      newValue: 'Beta Inc',
      section: 'summary',
    })
  })

  it('detects multiple changed fields', () => {
    const existing = { customerName: 'Acme', srfNumber: 'SRF-001', uucModel: 'Model-A' }
    const incoming = { customerName: 'Beta', srfNumber: 'SRF-002', uucModel: 'Model-A' }
    const result = detectCertificateChanges(existing, incoming)

    expect(result.certificateFields).toHaveLength(2)
    const fields = result.certificateFields.map(f => f.field)
    expect(fields).toContain('customerName')
    expect(fields).toContain('srfNumber')
  })

  it('reports section correctly for UUC fields', () => {
    const existing = { uucDescription: 'Old Instrument' }
    const incoming = { uucDescription: 'New Instrument' }
    const result = detectCertificateChanges(existing, incoming)

    expect(result.certificateFields[0].section).toBe('uuc-details')
  })

  it('reports section correctly for environment fields', () => {
    const existing = { ambientTemperature: '25°C' }
    const incoming = { ambientTemperature: '26°C' }
    const result = detectCertificateChanges(existing, incoming)

    expect(result.certificateFields[0].section).toBe('environment')
  })

  it('treats empty string and null as equivalent (no change)', () => {
    const existing = { customerName: '' }
    const incoming = { customerName: null }
    const result = detectCertificateChanges(existing, incoming)
    expect(result.hasChanges).toBe(false)
  })

  it('treats undefined and null as equivalent (no change)', () => {
    const existing = { customerName: undefined }
    const incoming = { customerName: null }
    const result = detectCertificateChanges(existing, incoming)
    expect(result.hasChanges).toBe(false)
  })

  it('normalises Date values to ISO date string for comparison', () => {
    const date = new Date('2025-03-15T08:30:00Z')
    const existing = { calibratedAt: date.toISOString() }
    const incoming = { calibratedAt: date }
    const result = detectCertificateChanges(existing, incoming)
    expect(result.hasChanges).toBe(false)
  })

  it('detects boolean field changes', () => {
    const existing = { dueDateNotApplicable: false }
    const incoming = { dueDateNotApplicable: true }
    const result = detectCertificateChanges(existing, incoming)
    expect(result.hasChanges).toBe(true)
    expect(result.certificateFields[0].previousValue).toBe('No')
    expect(result.certificateFields[0].newValue).toBe('Yes')
  })

  it('detects array field changes (selectedConclusionStatements)', () => {
    const existing = { selectedConclusionStatements: ['stmt-a', 'stmt-b'] }
    const incoming = { selectedConclusionStatements: ['stmt-a', 'stmt-c'] }
    const result = detectCertificateChanges(existing, incoming)
    expect(result.hasChanges).toBe(true)
  })

  it('treats reordered arrays as unchanged', () => {
    const existing = { selectedConclusionStatements: ['stmt-a', 'stmt-b'] }
    const incoming = { selectedConclusionStatements: ['stmt-b', 'stmt-a'] }
    const result = detectCertificateChanges(existing, incoming)
    expect(result.hasChanges).toBe(false)
  })

  // ── Parameter changes ────────────────────────────────────────────────────────

  it('detects an added parameter (no dbId match)', () => {
    const existing = { parameters: [] }
    const incoming = {
      parameters: [{ parameterName: 'Voltage', id: 'new-param' }],
    }
    const result = detectCertificateChanges(existing, incoming)

    expect(result.parameters).toHaveLength(1)
    expect(result.parameters[0]).toMatchObject({
      type: 'ADDED',
      parameterName: 'Voltage',
    })
  })

  it('detects a removed parameter (in existing but not incoming)', () => {
    const existing = {
      parameters: [{ id: 'param-1', parameterName: 'Resistance' }],
    }
    const incoming = { parameters: [] }
    const result = detectCertificateChanges(existing, incoming)

    expect(result.parameters).toHaveLength(1)
    expect(result.parameters[0]).toMatchObject({
      type: 'DELETED',
      parameterName: 'Resistance',
      parameterId: 'param-1',
    })
  })

  it('detects a modified parameter field', () => {
    const existing = {
      parameters: [{ id: 'param-1', parameterName: 'Voltage', rangeMin: '0', rangeMax: '100' }],
    }
    const incoming = {
      parameters: [{ dbId: 'param-1', parameterName: 'Voltage', rangeMin: '0', rangeMax: '200' }],
    }
    const result = detectCertificateChanges(existing, incoming)

    expect(result.parameters).toHaveLength(1)
    expect(result.parameters[0]).toMatchObject({
      type: 'MODIFIED',
      parameterName: 'Voltage',
      parameterId: 'param-1',
    })
    expect(result.parameters[0].changes).toHaveLength(1)
    expect(result.parameters[0].changes![0].field).toBe('rangeMax')
  })

  it('does not report a parameter as modified when values are unchanged', () => {
    const param = { id: 'p1', parameterName: 'Current', rangeMin: '0', rangeMax: '10' }
    const existing = { parameters: [param] }
    const incoming = { parameters: [{ ...param, dbId: 'p1' }] }
    const result = detectCertificateChanges(existing, incoming)

    expect(result.parameters).toHaveLength(0)
    expect(result.hasChanges).toBe(false)
  })

  it('handles multiple parameter changes (add + delete + modify)', () => {
    const existing = {
      parameters: [
        { id: 'p1', parameterName: 'Voltage', rangeMax: '100' },
        { id: 'p2', parameterName: 'Old Param', rangeMax: '50' },
      ],
    }
    const incoming = {
      parameters: [
        { dbId: 'p1', parameterName: 'Voltage', rangeMax: '200' },    // modified
        { parameterName: 'Brand New Param' },                         // added
        // p2 deleted
      ],
    }
    const result = detectCertificateChanges(existing, incoming)

    const types = result.parameters.map(p => p.type)
    expect(types).toContain('MODIFIED')
    expect(types).toContain('ADDED')
    expect(types).toContain('DELETED')
  })

  it('matches parameter by inc.id when dbId is absent', () => {
    const existing = {
      parameters: [{ id: 'p1', parameterName: 'Voltage', rangeMax: '100' }],
    }
    const incoming = {
      parameters: [{ id: 'p1', parameterName: 'Voltage', rangeMax: '150' }],
    }
    const result = detectCertificateChanges(existing, incoming)

    expect(result.parameters[0].type).toBe('MODIFIED')
  })
})

// ── generateChangeSummary ────────────────────────────────────────────────────

describe('generateChangeSummary', () => {
  it('returns "No changes" for empty changeset', () => {
    const changeset = {
      certificateFields: [],
      parameters: [],
      hasChanges: false,
    }
    expect(generateChangeSummary(changeset)).toBe('No changes')
  })

  it('describes single field change', () => {
    const changeset = {
      certificateFields: [
        { field: 'customerName', fieldLabel: 'Customer Name', previousValue: 'A', newValue: 'B', section: 'summary' },
      ],
      parameters: [],
      hasChanges: true,
    }
    expect(generateChangeSummary(changeset)).toContain('1 field')
  })

  it('uses plural form for multiple field changes', () => {
    const changeset = {
      certificateFields: [
        { field: 'customerName', fieldLabel: 'Customer Name', previousValue: 'A', newValue: 'B', section: 'summary' },
        { field: 'srfNumber', fieldLabel: 'SRF Number', previousValue: '1', newValue: '2', section: 'summary' },
      ],
      parameters: [],
      hasChanges: true,
    }
    const summary = generateChangeSummary(changeset)
    expect(summary).toContain('2 fields')
  })

  it('describes added parameters', () => {
    const changeset = {
      certificateFields: [],
      parameters: [{ type: 'ADDED' as const, parameterName: 'Voltage' }],
      hasChanges: true,
    }
    expect(generateChangeSummary(changeset)).toContain('1 parameter added')
  })

  it('uses plural form for multiple added parameters', () => {
    const changeset = {
      certificateFields: [],
      parameters: [
        { type: 'ADDED' as const, parameterName: 'Voltage' },
        { type: 'ADDED' as const, parameterName: 'Current' },
      ],
      hasChanges: true,
    }
    expect(generateChangeSummary(changeset)).toContain('2 parameters added')
  })

  it('describes modified parameters', () => {
    const changeset = {
      certificateFields: [],
      parameters: [{ type: 'MODIFIED' as const, parameterName: 'Voltage', parameterId: 'p1', changes: [] }],
      hasChanges: true,
    }
    expect(generateChangeSummary(changeset)).toContain('1 parameter modified')
  })

  it('describes deleted parameters', () => {
    const changeset = {
      certificateFields: [],
      parameters: [{ type: 'DELETED' as const, parameterName: 'Old Param', parameterId: 'p1' }],
      hasChanges: true,
    }
    expect(generateChangeSummary(changeset)).toContain('1 parameter deleted')
  })

  it('combines field and parameter changes in one summary', () => {
    const changeset = {
      certificateFields: [
        { field: 'customerName', fieldLabel: 'Customer Name', previousValue: 'A', newValue: 'B', section: 'summary' },
      ],
      parameters: [
        { type: 'ADDED' as const, parameterName: 'Voltage' },
        { type: 'DELETED' as const, parameterName: 'Old Param', parameterId: 'p1' },
      ],
      hasChanges: true,
    }
    const summary = generateChangeSummary(changeset)
    expect(summary).toContain('1 field')
    expect(summary).toContain('1 parameter added')
    expect(summary).toContain('1 parameter deleted')
    expect(summary).toMatch(/^Updated /)
  })
})
