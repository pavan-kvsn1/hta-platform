/**
 * Entering a range band's accuracy, and reading it back.
 *
 * Two conversions have to agree: a stored bucket opening as form fields, and those
 * fields going back as a bucket. Where they disagree, an admin opens a band, changes
 * nothing, saves, and the accuracy is quietly different - which is exactly the failure
 * this whole piece of work started from.
 *
 * So each shape is round-tripped rather than checked one way.
 */
import { describe, expect, it } from 'vitest'

import {
  blankRow,
  bucketBody,
  printedFrom,
  rowFrom,
  type RangeRow,
} from '@/components/admin/instruments/capabilities/CapabilityForm'
import type { Bucket } from '@/components/admin/instruments/capabilities/CapabilitiesTab'

const bucket = (over: Partial<Bucket>): Bucket => ({
  id: 'b1',
  bucketKey: 'B1',
  min: 0,
  max: 30,
  minInclusive: true,
  maxInclusive: true,
  leastCountValue: 0.001,
  leastCountUnit: 'V',
  accuracyKind: null,
  accuracyValue: null,
  accuracyUnit: null,
  accuracyPolarity: null,
  accuracyFormula: null,
  accuracyExpression: null,
  accuracyPercentOf: null,
  accuracyPercentValue: null,
  accuracyDigits: null,
  accuracyDigitsUnit: null,
  accuracyClass: null,
  ...over,
})

const row = (over: Partial<RangeRow>): RangeRow => ({ ...blankRow(), from: '0', to: '30', ...over })

describe('opening a stored band in the form', () => {
  it('opens a percentage of the reading as a percentage, not as a sentence to re-read', () => {
    // 1017 HTAIPL/L, the Masibus UC 12.
    const r = rowFrom(
      bucket({
        accuracyKind: 'FORMULA',
        accuracyFormula: '+/-0.02% of reading +/-2 count',
        accuracyPercentOf: 'reading',
        accuracyPercentValue: 0.0002,
        accuracyDigits: 2,
        accuracyDigitsUnit: 'count',
      }),
    )
    expect(r.basis).toBe('pct_rdg')
    // Stored as a fraction, shown as the percentage anyone would write on a form.
    expect(r.percent).toBe('0.02')
    expect(r.digits).toBe('2')
    expect(r.printed).toBe('+/-0.02% of reading +/-2 count')
    expect(r.printedEdited).toBe(true)
  })

  it('opens a percentage of full scale on the full scale basis', () => {
    const r = rowFrom(
      bucket({
        accuracyKind: 'FORMULA',
        accuracyFormula: '+/-0.1% FS',
        accuracyPercentOf: 'full_scale',
        accuracyPercentValue: 0.001,
      }),
    )
    expect(r.basis).toBe('pct_fs')
    expect(r.percent).toBe('0.1')
    expect(r.digits).toBe('')
  })

  it('opens an expression as arithmetic, whatever the fields say', () => {
    // 755 HTAIPL/L. The expression states the whole accuracy, so the fields are empty.
    const r = rowFrom(
      bucket({
        accuracyKind: 'FORMULA',
        accuracyFormula: '±(330 ppm + 1% of reading)',
        accuracyExpression: '330 + 0.01 * {reading}',
      }),
    )
    expect(r.basis).toBe('expr')
    expect(r.expression).toBe('330 + 0.01 * {reading}')
    expect(r.printed).toBe('±(330 ppm + 1% of reading)')
  })

  it('opens a formula with nothing behind it as arithmetic waiting to be written', () => {
    // The state the register was in before this work: a sentence and no numbers. It has
    // to land somewhere an admin can settle it, and the arithmetic box is that place.
    const r = rowFrom(
      bucket({ accuracyKind: 'FORMULA', accuracyFormula: '+/-(0.004 x t)' }),
    )
    expect(r.basis).toBe('expr')
    expect(r.expression).toBe('')
    expect(r.printed).toBe('+/-(0.004 x t)')
  })

  it('still opens a plain figure, a two-sided one, and a class', () => {
    expect(rowFrom(bucket({ accuracyKind: 'SYMMETRIC', accuracyValue: 0.6, accuracyUnit: '°C' })))
      .toMatchObject({ basis: 'absolute', upper: '0.6', lower: '' })
    expect(
      rowFrom(bucket({ accuracyKind: 'ASYMMETRIC', accuracyUpper: 0.5, accuracyLower: -0.2 })),
    ).toMatchObject({ basis: 'absolute', upper: '0.5', lower: '0.2' })
    expect(rowFrom(bucket({ accuracyKind: 'CLASS', accuracyClass: 'F2 Class' }))).toMatchObject({
      basis: 'cls',
      upper: 'F2 Class',
    })
  })
})

describe('saving it back', () => {
  it('stores a percentage as a fraction, with its basis named', () => {
    const body = bucketBody(
      row({ basis: 'pct_rdg', percent: '0.02', digits: '2', digitsUnit: 'count' }),
      'V',
      0,
    ) as Record<string, unknown>

    expect(body.accuracyKind).toBe('FORMULA')
    expect(body.accuracyPercentOf).toBe('reading')
    expect(body.accuracyPercentValue).toBeCloseTo(0.0002, 12)
    expect(body.accuracyDigits).toBe(2)
  })

  it('never stores a percentage as a figure whose unit is "%"', () => {
    // It used to. The comparison then divided by 0.05 as though it were volts.
    const body = bucketBody(row({ basis: 'pct_fs', percent: '0.05' }), 'V', 0) as Record<
      string,
      unknown
    >
    expect(body.accuracyKind).not.toBe('SYMMETRIC')
    expect(body.accuracyUnit).toBeUndefined()
  })

  it('leaves the fields clear when an expression states the whole accuracy', () => {
    // Half an accuracy in the fields would understate the instrument by whatever the
    // expression's other terms add, for anything reading the fields alone.
    const body = bucketBody(
      row({ basis: 'expr', expression: '330 + 0.01 * {reading}', printed: '±(330 ppm + 1% rdg)' }),
      'ppm',
      0,
    ) as Record<string, unknown>

    expect(body.accuracyExpression).toBe('330 + 0.01 * {reading}')
    expect(body.accuracyFormula).toBe('±(330 ppm + 1% rdg)')
    expect(body.accuracyPercentOf).toBeUndefined()
  })

  it('falls back to the arithmetic when nobody wrote a wording', () => {
    const body = bucketBody(row({ basis: 'expr', expression: '0.004 * {reading}' }), '°C', 0) as
      Record<string, unknown>
    expect(body.accuracyFormula).toBe('0.004 * {reading}')
  })

  it('records no accuracy at all rather than an empty one', () => {
    for (const r of [
      row({ basis: 'pct_rdg' }),
      row({ basis: 'expr' }),
      row({ basis: 'cls' }),
      row({ basis: 'absolute' }),
    ]) {
      expect((bucketBody(r, 'V', 0) as Record<string, unknown>).accuracyKind).toBeNull()
    }
  })
})

describe('round trip', () => {
  const cases: [string, Partial<Bucket>][] = [
    [
      'a percentage of the reading with a counts term',
      {
        accuracyKind: 'FORMULA',
        accuracyFormula: '+/-0.02% of reading +/-2 count',
        accuracyPercentOf: 'reading',
        accuracyPercentValue: 0.0002,
        accuracyDigits: 2,
        accuracyDigitsUnit: 'count',
      },
    ],
    [
      'a percentage of full scale',
      {
        accuracyKind: 'FORMULA',
        accuracyFormula: '+/-0.1% FS',
        accuracyPercentOf: 'full_scale',
        accuracyPercentValue: 0.001,
      },
    ],
    [
      'an expression',
      {
        accuracyKind: 'FORMULA',
        accuracyFormula: '±(3% of reading + 0.3% FS)',
        accuracyExpression: '0.03 * {reading} + 0.003 * {full scale}',
      },
    ],
    ['a class', { accuracyKind: 'CLASS', accuracyClass: 'F2 Class' }],
  ]

  for (const [what, stored] of cases) {
    it(`opens and saves ${what} unchanged`, () => {
      const saved = bucketBody(rowFrom(bucket(stored)), 'V', 0) as Record<string, unknown>
      for (const [field, value] of Object.entries(stored)) {
        expect({ [field]: saved[field] ?? null }).toEqual({ [field]: value })
      }
    })
  }
})

describe('the wording written from the figures', () => {
  it('reads as an engineer would write it', () => {
    expect(printedFrom(row({ basis: 'pct_rdg', percent: '0.05', digits: '1' }), 'rpm')).toBe(
      '±(0.05% of reading + 1 count)',
    )
    expect(printedFrom(row({ basis: 'pct_rdg', percent: '0.05', digits: '2' }), 'rpm')).toBe(
      '±(0.05% of reading + 2 counts)',
    )
    expect(printedFrom(row({ basis: 'pct_fs', percent: '0.1' }), 'bar')).toBe('±0.1% of full scale')
    expect(printedFrom(row({ basis: 'absolute', upper: '0.6' }), '°C')).toBe('±0.6 °C')
    expect(printedFrom(row({ basis: 'absolute', upper: '0.5', lower: '0.2' }), 'mm')).toBe(
      '+0.5 mm / -0.2 mm',
    )
  })

  it('says nothing when there is nothing to say', () => {
    expect(printedFrom(row({ basis: 'pct_rdg' }), 'V')).toBe('')
    expect(printedFrom(row({ basis: 'absolute' }), 'V')).toBe('')
  })
})
