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
  readStoredFieldSchema,
  resultValues,
  buildSimpleExpression,
  parseSimpleExpression,
  type ErrorConfig,
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

  it('names the master column the way a certificate does', () => {
    // "Standard Meter Reading" is the wording on the printed certificate, so the
    // default column matches it rather than introducing a second term for one thing.
    expect(createDefaultFieldDefinitions('bar')[0].name).toBe('Standard Meter Reading')
  })

  it('auto-selects those two fields for error computation', () => {
    const fields = createDefaultFieldDefinitions('bar')
    const config = createDefaultErrorConfig(fields, 'bar')
    expect(config.masterFieldId).toBe(fields[0].id)
    expect(config.uucFieldId).toBe(fields[1].id)
    expect(config.formula).toBe('A-B')
  })

  it('offers every column that yields a number, formulas included', () => {
    const fields = [
      field({ id: 'm1', group: 'master', type: 'numeric' }),
      field({ id: 'm2', group: 'master', type: 'text' }),
      field({ id: 'u1', group: 'uuc', type: 'numeric' }),
      field({ id: 'u2', group: 'uuc', type: 'expression' }),
    ]
    // A formula column produces a number, so an error can be computed against it.
    // Text cannot be subtracted, so it stays out.
    expect(errorFieldCandidates(fields, 'master').map((f) => f.id)).toEqual(['m1'])
    expect(errorFieldCandidates(fields, 'uuc').map((f) => f.id)).toEqual(['u1', 'u2'])
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
    // The legacy three still project exactly as before...
    expect(back.map(({ values: _values, ...rest }) => rest)).toEqual(legacy)
    // ...and the raw values ride along, so a fourth column survives storage.
    expect(back[0].values).toEqual(migrated.rows[0].values)
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

describe('simple expression builder', () => {
  it('composes a formula from source, operator and a value', async () => {
    const { buildSimpleExpression } = await import('@/lib/certificate-fields')
    expect(
      buildSimpleExpression({
        sourceId: 'u1',
        operator: '*',
        operand: { kind: 'value', value: '0.001' },
      }),
    ).toBe('{u1} * 0.001')
  })

  it('composes a formula from two columns', async () => {
    const { buildSimpleExpression } = await import('@/lib/certificate-fields')
    expect(
      buildSimpleExpression({
        sourceId: 'm1',
        operator: '-',
        operand: { kind: 'field', fieldId: 'u1' },
      }),
    ).toBe('{m1} - {u1}')
  })

  it('produces nothing until both sides are chosen', async () => {
    const { buildSimpleExpression } = await import('@/lib/certificate-fields')
    expect(
      buildSimpleExpression({ sourceId: '', operator: '*', operand: { kind: 'value', value: '2' } }),
    ).toBe('')
    expect(
      buildSimpleExpression({ sourceId: 'u1', operator: '*', operand: { kind: 'value', value: '' } }),
    ).toBe('')
  })

  it('reads a formula back into builder form', async () => {
    const { parseSimpleExpression } = await import('@/lib/certificate-fields')
    expect(parseSimpleExpression('{u1} * 0.001')).toEqual({
      sourceId: 'u1',
      operator: '*',
      operand: { kind: 'value', value: '0.001' },
    })
    expect(parseSimpleExpression('{m1} - {u1}')).toEqual({
      sourceId: 'm1',
      operator: '-',
      operand: { kind: 'field', fieldId: 'u1' },
    })
  })

  it('round-trips', async () => {
    const { buildSimpleExpression, parseSimpleExpression } = await import(
      '@/lib/certificate-fields'
    )
    for (const formula of ['{a} + 1', '{a} - 2.5', '{a} * {b}', '{a} / 100']) {
      const parsed = parseSimpleExpression(formula)
      expect(parsed).not.toBeNull()
      expect(buildSimpleExpression(parsed!)).toBe(formula)
    }
  })

  it('declines anything the builder cannot represent, so it is not silently rewritten', async () => {
    const { parseSimpleExpression } = await import('@/lib/certificate-fields')
    expect(parseSimpleExpression('({a} + {b}) * 2')).toBeNull()
    expect(parseSimpleExpression('{a} + {b} + {c}')).toBeNull()
    expect(parseSimpleExpression('')).toBeNull()
    expect(parseSimpleExpression(undefined)).toBeNull()
  })

  it('builds formulas the evaluator accepts', async () => {
    const { buildSimpleExpression, evaluateExpression } = await import(
      '@/lib/certificate-fields'
    )
    const formula = buildSimpleExpression({
      sourceId: 'u1',
      operator: '*',
      operand: { kind: 'value', value: '0.001' },
    })
    expect(evaluateExpression(formula, { u1: '2000' })).toBeCloseTo(2)
  })
})

describe('evaluateExpression - power, log and exp', () => {
  const v = { a: '2', b: '3', c: '100', neg: '-8', zero: '0' }

  it('raises to a power', () => {
    expect(evaluateExpression('{a} ^ {b}', v)).toBe(8)
  })

  it('treats ^ as right-associative', () => {
    // 2^(3^2) = 512, not (2^3)^2 = 64.
    expect(evaluateExpression('2 ^ 3 ^ 2', v)).toBe(512)
  })

  it('binds ^ tighter than unary minus, as written arithmetic does', () => {
    expect(evaluateExpression('-2 ^ 2', v)).toBe(-4)
  })

  it('binds ^ tighter than multiplication', () => {
    expect(evaluateExpression('3 * 2 ^ 2', v)).toBe(12)
  })

  it('allows a negative exponent', () => {
    expect(evaluateExpression('2 ^ -1', v)).toBe(0.5)
  })

  it('takes log base 10 and ln separately', () => {
    expect(evaluateExpression('log({c})', v)).toBe(2)
    expect(evaluateExpression('ln(1)', v)).toBe(0)
  })

  it('computes e to the power x', () => {
    expect(evaluateExpression('exp(0)', v)).toBe(1)
    expect(evaluateExpression('exp(1)', v)).toBeCloseTo(Math.E, 10)
  })

  it('nests functions and arithmetic', () => {
    expect(evaluateExpression('log({c}) * {b} + 1', v)).toBe(7)
    expect(evaluateExpression('ln(exp({b}))', v)).toBeCloseTo(3, 10)
  })

  it('returns null outside a function domain rather than NaN', () => {
    expect(evaluateExpression('log({zero})', v)).toBeNull()
    expect(evaluateExpression('log(-1)', v)).toBeNull()
    expect(evaluateExpression('ln({zero})', v)).toBeNull()
    expect(evaluateExpression('ln({neg})', v)).toBeNull()
  })

  it('returns null for a complex-valued power', () => {
    expect(evaluateExpression('{neg} ^ 0.5', v)).toBeNull()
  })

  it('returns null when a function is missing its parentheses', () => {
    expect(evaluateExpression('log {c}', v)).toBeNull()
  })

  it('does not treat a field whose id starts with a function name as a function', () => {
    expect(evaluateExpression('{logger} + 1', { logger: '4' })).toBe(5)
  })
})

describe('simple expression round-trip with functions', () => {
  it('builds a unary operation, ignoring the unused operand', () => {
    expect(
      buildSimpleExpression({
        sourceId: 'a',
        operator: 'log',
        operand: { kind: 'value', value: '' },
      }),
    ).toBe('log({a})')
  })

  it('builds a power', () => {
    expect(
      buildSimpleExpression({
        sourceId: 'a',
        operator: '^',
        operand: { kind: 'value', value: '2' },
      }),
    ).toBe('{a} ^ 2')
  })

  it('reads both back into builder form', () => {
    expect(parseSimpleExpression('log({a})')).toEqual({
      sourceId: 'a',
      operator: 'log',
      operand: { kind: 'value', value: '' },
    })
    expect(parseSimpleExpression('{a} ^ {b}')).toEqual({
      sourceId: 'a',
      operator: '^',
      operand: { kind: 'field', fieldId: 'b' },
    })
  })

  it('leaves a formula the builder cannot express as raw', () => {
    expect(parseSimpleExpression('log({a} + {b})')).toBeNull()
    expect(parseSimpleExpression('log({a}) * 2')).toBeNull()
  })
})

describe('readStoredFieldSchema', () => {
  // Shaped exactly as the API returns it: the raw Prisma row, so the schema is one
  // JSON column named fieldSchema rather than two top-level keys. Reading the wrong
  // key returns no columns, which is indistinguishable from a parameter that never
  // had any - so the defaults get rebuilt and the engineer's columns look discarded.
  const stored = {
    fieldDefinitions: [
      { id: 'm1', name: 'Master Reading', group: 'master', type: 'numeric', unit: '°C', order: 0 },
      { id: 'u1', name: 'UUC Reading', group: 'uuc', type: 'numeric', unit: '°C', order: 0 },
      {
        id: 'x1',
        name: 'Adjusted Reading',
        group: 'uuc',
        type: 'expression',
        unit: '°C',
        order: 1,
        expression: '{u1} + 0.1',
      },
    ],
    errorConfig: { masterFieldId: 'm1', uucFieldId: 'u1', formula: 'B-A', unit: '°C' },
  }

  it('reads back every stored column, custom ones included', () => {
    const result = readStoredFieldSchema(stored)
    expect(result.fieldDefinitions.map((f) => f.name)).toEqual([
      'Master Reading',
      'UUC Reading',
      'Adjusted Reading',
    ])
    expect(result.errorConfig).toEqual(stored.errorConfig)
  })

  it('returns no columns for a parameter that never had a schema', () => {
    // The signal for "derive the default pair from the legacy results".
    expect(readStoredFieldSchema(null).fieldDefinitions).toEqual([])
    expect(readStoredFieldSchema(undefined).fieldDefinitions).toEqual([])
  })

  it('does not throw on content it does not recognise', () => {
    expect(readStoredFieldSchema('nonsense').fieldDefinitions).toEqual([])
    expect(readStoredFieldSchema({ fieldDefinitions: 'not an array' }).fieldDefinitions).toEqual([])
  })

  it('falls back to a derived error config when only the columns were stored', () => {
    const result = readStoredFieldSchema({ fieldDefinitions: stored.fieldDefinitions })
    expect(result.errorConfig.masterFieldId).toBe('m1')
    expect(result.errorConfig.uucFieldId).toBe('u1')
  })

  it('survives the round trip a save and reload performs', async () => {
    const { ensureParameterFields } = await import('@/lib/stores/certificate-store')
    const loaded = ensureParameterFields({
      parameterUnit: '°C',
      errorFormula: 'B-A',
      showAfterAdjustment: false,
      tableName: 'Observations',
      ...readStoredFieldSchema(stored),
      resultRows: [],
      results: [
        {
          id: 'r1',
          pointNumber: 1,
          standardReading: '-5.0',
          beforeAdjustment: '-4.9',
          afterAdjustment: '',
          errorObserved: 0.1,
          isOutOfLimit: false,
          values: { m1: '-5.0', u1: '-4.9', x1: '' },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    // The stored columns are kept rather than replaced by the default pair...
    expect(loaded.fieldDefinitions.map((f) => f.name)).toContain('Adjusted Reading')
    // ...and the rows come back with them, since rows live on the results.
    expect(loaded.resultRows).toHaveLength(1)
    expect(loaded.resultRows[0].values.u1).toBe('-4.9')
  })
})

describe('a row rebuilt on reload', () => {
  // The shape of certificate 5eed80c6: three columns, and the error configured against
  // the formula column rather than the entered one.
  const fields: FieldDefinition[] = [
    { id: 'm1', name: 'Standard Meter Reading', group: 'master', type: 'numeric', unit: '°C', order: 0 },
    { id: 'u1', name: 'UUC Reading', group: 'uuc', type: 'numeric', unit: '°C', order: 0 },
    {
      id: 'x1',
      name: 'Adjusted Reading',
      group: 'master',
      type: 'expression',
      unit: '°C',
      order: 1,
      expression: '{m1} + 0.1',
    },
  ]
  const errorConfig: ErrorConfig = {
    masterFieldId: 'x1',
    uucFieldId: 'u1',
    formula: 'A-B',
    unit: '°C',
  }
  const legacyRow = {
    standardReading: '25',
    beforeAdjustment: '25.3',
    afterAdjustment: '',
  }

  it('keeps the stored values when it has them', () => {
    const stored = { ...legacyRow, values: { m1: '25', u1: '25.3', x1: '25.1' } }
    expect(resultValues(stored, fields, errorConfig)).toEqual(stored.values)
  })

  it('never writes an entered reading into a formula column', () => {
    // x1 is computed. Putting the reading there loses it - the formula overwrites it -
    // and leaves Standard Meter Reading, where it belongs, empty.
    const mapped = resultValues(legacyRow, fields, errorConfig)
    expect(mapped.x1).toBeUndefined()
    expect(mapped.m1).toBe('25')
    expect(mapped.u1).toBe('25.3')
  })

  it('still uses the configured column when it is an entered one', () => {
    const plain: ErrorConfig = { ...errorConfig, masterFieldId: 'm1' }
    expect(resultValues(legacyRow, fields, plain).m1).toBe('25')
  })
})
