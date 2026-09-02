/**
 * Section 05 Dynamic Field Tests
 *
 * Covers the field schema, the expression evaluator and the round trip on and off the
 * legacy fixed-column shape.
 */
import { describe, it, expect } from 'vitest'
import {
  createDefaultFieldDefinitions,
  createDefaultErrorConfig,
  createField,
  errorFieldCandidates,
  removeField,
  expressionDependencies,
  detectExpressionCycles,
  evaluateExpression,
  resolveRowValues,
  computeRowError,
  createRow,
  migrateLegacyResults,
  toLegacyResults,
  type FieldDefinition,
  type CalibrationResultRow,
} from '@/lib/certificate-fields'
import type { CalibrationResult } from '@/lib/stores/certificate-store'

function field(overrides: Partial<FieldDefinition> & { id: string }): FieldDefinition {
  return {
    name: overrides.id,
    group: 'master',
    type: 'numeric',
    unit: 'bar',
    order: 0,
    ...overrides,
  }
}

function row(values: Record<string, string>): CalibrationResultRow {
  return { id: 'r1', pointNumber: 1, values, errorObserved: null, isOutOfLimit: false }
}

describe('default schema', () => {
  it('starts with one master and one UUC numeric field in the parameter unit', () => {
    const fields = createDefaultFieldDefinitions('kg/cm²')
    expect(fields).toHaveLength(2)
    expect(fields[0].group).toBe('master')
    expect(fields[1].group).toBe('uuc')
    expect(fields.every((f) => f.type === 'numeric' && f.unit === 'kg/cm²')).toBe(true)
  })

  it('auto-selects those two fields for error computation', () => {
    const fields = createDefaultFieldDefinitions('bar')
    const config = createDefaultErrorConfig(fields, 'bar')
    expect(config.masterFieldId).toBe(fields[0].id)
    expect(config.uucFieldId).toBe(fields[1].id)
    expect(config.formula).toBe('A-B')
  })

  it('offers only numeric fields from the right side as error candidates', () => {
    const fields = [
      field({ id: 'm1', group: 'master', type: 'numeric' }),
      field({ id: 'm2', group: 'master', type: 'text' }),
      field({ id: 'u1', group: 'uuc', type: 'numeric' }),
      field({ id: 'u2', group: 'uuc', type: 'expression' }),
    ]
    expect(errorFieldCandidates(fields, 'master').map((f) => f.id)).toEqual(['m1'])
    expect(errorFieldCandidates(fields, 'uuc').map((f) => f.id)).toEqual(['u1'])
  })

  it('gives a new field the next order within its own group', () => {
    const fields = [field({ id: 'm1', group: 'master' }), field({ id: 'u1', group: 'uuc' })]
    expect(createField('uuc', fields).order).toBe(1)
    expect(createField('master', fields).order).toBe(1)
  })
})

describe('removeField', () => {
  const fields = [
    field({ id: 'm1', group: 'master' }),
    field({ id: 'u1', group: 'uuc' }),
    field({ id: 'u2', group: 'uuc' }),
  ]
  const config = { masterFieldId: 'm1', uucFieldId: 'u1', formula: 'A-B' as const, unit: 'bar' }

  it('clears the error reference and warns when the removed field was in use', () => {
    const result = removeField(fields, config, 'u1')
    expect(result.fields.map((f) => f.id)).toEqual(['m1', 'u2'])
    expect(result.errorConfig.uucFieldId).toBe('')
    expect(result.warning).toMatch(/replacement UUC field/i)
  })

  it('leaves the error config alone when an unrelated field goes', () => {
    const result = removeField(fields, config, 'u2')
    expect(result.errorConfig).toEqual(config)
    expect(result.warning).toBeNull()
  })

  it('warns when an expression still references the removed field', () => {
    const withExpression = [
      ...fields,
      field({ id: 'u3', group: 'uuc', type: 'expression', expression: '{u2} * 2', name: 'Derived' }),
    ]
    const result = removeField(withExpression, config, 'u2')
    expect(result.warning).toMatch(/still referenced by: Derived/)
  })
})

describe('evaluateExpression', () => {
  const values = { a: '10', b: '4', zero: '0', blank: '', text: 'ON' }

  it('evaluates arithmetic with correct precedence', () => {
    expect(evaluateExpression('2 + 3 * 4', values)).toBe(14)
    expect(evaluateExpression('(2 + 3) * 4', values)).toBe(20)
    expect(evaluateExpression('10 / 4', values)).toBe(2.5)
  })

  it('substitutes field references', () => {
    expect(evaluateExpression('{a} - {b}', values)).toBe(6)
    expect(evaluateExpression('{a} * 0.001', values)).toBeCloseTo(0.01)
  })

  it('handles unary minus and decimals', () => {
    expect(evaluateExpression('-{b}', values)).toBe(-4)
    expect(evaluateExpression('-2.5 + 1', values)).toBe(-1.5)
  })

  it('returns null for a missing, blank or non-numeric reference', () => {
    expect(evaluateExpression('{missing} + 1', values)).toBeNull()
    expect(evaluateExpression('{blank} + 1', values)).toBeNull()
    expect(evaluateExpression('{text} + 1', values)).toBeNull()
  })

  it('returns null rather than Infinity on divide by zero', () => {
    expect(evaluateExpression('{a} / {zero}', values)).toBeNull()
  })

  it('returns null for malformed input', () => {
    expect(evaluateExpression('2 +', values)).toBeNull()
    expect(evaluateExpression('(2 + 3', values)).toBeNull()
    expect(evaluateExpression('{unclosed', values)).toBeNull()
    expect(evaluateExpression('2 $ 3', values)).toBeNull()
  })

  it('returns null for an empty expression', () => {
    expect(evaluateExpression('', values)).toBeNull()
    expect(evaluateExpression(undefined, values)).toBeNull()
  })

  it('does not execute JavaScript', () => {
    // Expressions are authored in the UI and stored on the certificate, so they are
    // untrusted input and must never reach an interpreter.
    expect(evaluateExpression('process.exit(1)', values)).toBeNull()
    expect(evaluateExpression('(() => 1)()', values)).toBeNull()
    expect(evaluateExpression('globalThis', values)).toBeNull()
  })
})

describe('expression dependencies and cycles', () => {
  it('lists referenced field ids once, in order', () => {
    expect(expressionDependencies('{a} + {b} * {a}')).toEqual(['a', 'b'])
    expect(expressionDependencies(undefined)).toEqual([])
  })

  it('detects a self-reference', () => {
    const fields = [field({ id: 'e1', type: 'expression', expression: '{e1} + 1' })]
    expect(detectExpressionCycles(fields).length).toBeGreaterThan(0)
  })

  it('detects a two-field loop', () => {
    const fields = [
      field({ id: 'e1', type: 'expression', expression: '{e2} + 1' }),
      field({ id: 'e2', type: 'expression', expression: '{e1} + 1' }),
    ]
    expect(detectExpressionCycles(fields).length).toBeGreaterThan(0)
  })

  it('accepts a chain that does not loop', () => {
    const fields = [
      field({ id: 'n1', type: 'numeric' }),
      field({ id: 'e1', type: 'expression', expression: '{n1} * 2' }),
      field({ id: 'e2', type: 'expression', expression: '{e1} + 1' }),
    ]
    expect(detectExpressionCycles(fields)).toEqual([])
  })
})

describe('row computation', () => {
  const fields = [
    field({ id: 'm1', group: 'master', type: 'numeric' }),
    field({ id: 'u1', group: 'uuc', type: 'numeric' }),
    field({ id: 'u2', group: 'uuc', type: 'expression', expression: '{u1} * 2' }),
    field({ id: 'u3', group: 'uuc', type: 'expression', expression: '{u2} + 1' }),
  ]

  it('resolves chained expression fields', () => {
    const resolved = resolveRowValues(row({ m1: '6.02', u1: '3' }), fields)
    expect(resolved.u2).toBe('6')
    expect(resolved.u3).toBe('7')
  })

  it('computes error with the configured formula', () => {
    const config = { masterFieldId: 'm1', uucFieldId: 'u1', formula: 'A-B' as const, unit: 'bar' }
    expect(computeRowError(row({ m1: '6.02', u1: '6' }), fields, config)).toBeCloseTo(0.02)
    expect(
      computeRowError(row({ m1: '6.02', u1: '6' }), fields, { ...config, formula: 'B-A' }),
    ).toBeCloseTo(-0.02)
  })

  it('returns null when either side is blank, so the cell stays empty', () => {
    const config = { masterFieldId: 'm1', uucFieldId: 'u1', formula: 'A-B' as const, unit: 'bar' }
    expect(computeRowError(row({ m1: '6.02' }), fields, config)).toBeNull()
    expect(computeRowError(row({ m1: '', u1: '6' }), fields, config)).toBeNull()
  })

  it('returns null when the error config has no field selected', () => {
    const config = { masterFieldId: '', uucFieldId: 'u1', formula: 'A-B' as const, unit: 'bar' }
    expect(computeRowError(row({ u1: '6' }), fields, config)).toBeNull()
  })

  it('can compute error from an expression field', () => {
    const config = { masterFieldId: 'm1', uucFieldId: 'u2', formula: 'A-B' as const, unit: 'bar' }
    // u2 = u1 * 2 = 6, so 10 - 6 = 4
    expect(computeRowError(row({ m1: '10', u1: '3' }), fields, config)).toBe(4)
  })

  it('creates blank rows with the given point number', () => {
    const created = createRow(3)
    expect(created.pointNumber).toBe(3)
    expect(created.values).toEqual({})
    expect(created.errorObserved).toBeNull()
  })
})

describe('legacy migration', () => {
  const legacy: CalibrationResult[] = [
    {
      id: 'r1',
      pointNumber: 1,
      standardReading: '6.02',
      beforeAdjustment: '6.00',
      afterAdjustment: '6.01',
      errorObserved: 0.02,
      isOutOfLimit: false,
    },
    {
      id: 'r2',
      pointNumber: 2,
      standardReading: '5.99',
      beforeAdjustment: '6.00',
      afterAdjustment: '',
      errorObserved: -0.01,
      isOutOfLimit: false,
    },
  ]

  it('maps the three legacy columns onto fields', () => {
    const migrated = migrateLegacyResults(legacy, { unit: 'bar', showAfterAdjustment: true })
    expect(migrated.fieldDefinitions).toHaveLength(3)
    expect(migrated.fieldDefinitions.map((f) => f.group)).toEqual(['master', 'uuc', 'uuc'])
    expect(migrated.rows).toHaveLength(2)

    const [master, before, after] = migrated.fieldDefinitions
    expect(migrated.rows[0].values[master.id]).toBe('6.02')
    expect(migrated.rows[0].values[before.id]).toBe('6.00')
    expect(migrated.rows[0].values[after.id]).toBe('6.01')
  })

  it('omits the after-adjustment column when the parameter never used it', () => {
    const withoutAfter = legacy.map((r) => ({ ...r, afterAdjustment: '' }))
    const migrated = migrateLegacyResults(withoutAfter, { unit: 'bar' })
    expect(migrated.fieldDefinitions).toHaveLength(2)
    expect(migrated.fieldDefinitions[1].name).toBe('UUC Reading')
  })

  it('infers after-adjustment from the data when the flag is absent', () => {
    const migrated = migrateLegacyResults(legacy, { unit: 'bar' })
    expect(migrated.fieldDefinitions).toHaveLength(3)
  })

  it('points the error config at the master and before-adjustment fields', () => {
    const migrated = migrateLegacyResults(legacy, { unit: 'bar', showAfterAdjustment: true })
    expect(migrated.errorConfig.masterFieldId).toBe(migrated.fieldDefinitions[0].id)
    expect(migrated.errorConfig.uucFieldId).toBe(migrated.fieldDefinitions[1].id)
  })

  it('preserves ids, errors and limit flags', () => {
    const migrated = migrateLegacyResults(legacy, { unit: 'bar', showAfterAdjustment: true })
    expect(migrated.rows.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(migrated.rows[0].errorObserved).toBe(0.02)
  })

  it('round-trips back to the legacy shape', () => {
    const migrated = migrateLegacyResults(legacy, { unit: 'bar', showAfterAdjustment: true })
    const back = toLegacyResults(
      migrated.rows,
      migrated.fieldDefinitions,
      migrated.errorConfig,
    )
    expect(back).toEqual(legacy)
  })
})

describe('ensureParameterFields (store integration)', () => {
  it('derives a schema for a legacy parameter and leaves a migrated one alone', async () => {
    const { ensureParameterFields, syncLegacyResults } = await import(
      '@/lib/stores/certificate-store'
    )

    const legacyParameter = {
      parameterUnit: 'bar',
      errorFormula: 'B-A',
      showAfterAdjustment: false,
      tableName: '',
      fieldDefinitions: [],
      errorConfig: { masterFieldId: '', uucFieldId: '', formula: 'A-B' as const, unit: '' },
      resultRows: [],
      results: [
        {
          id: 'r1',
          pointNumber: 1,
          standardReading: '6.02',
          beforeAdjustment: '6.00',
          afterAdjustment: '',
          errorObserved: 0.02,
          isOutOfLimit: false,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const migrated = ensureParameterFields(legacyParameter)
    expect(migrated.fieldDefinitions).toHaveLength(2)
    expect(migrated.resultRows).toHaveLength(1)
    // errorFormula on the parameter wins over the migration default
    expect(migrated.errorConfig.formula).toBe('B-A')

    // Idempotent - re-running must not clobber a user's column setup
    const again = ensureParameterFields(migrated)
    expect(again).toBe(migrated)

    // And the legacy shape can be projected back for the PDF and API paths
    const synced = syncLegacyResults(migrated)
    expect(synced.results[0].standardReading).toBe('6.02')
    expect(synced.results[0].beforeAdjustment).toBe('6.00')
  })

  it('gives a parameter with no results at least one blank row', async () => {
    const { ensureParameterFields } = await import('@/lib/stores/certificate-store')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const empty = ensureParameterFields({ parameterUnit: '°C', results: [] } as any)
    expect(empty.resultRows).toHaveLength(1)
    expect(empty.fieldDefinitions).toHaveLength(2)
  })
})
