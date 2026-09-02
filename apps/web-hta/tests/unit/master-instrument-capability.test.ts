/**
 * Master Instrument Capability Tests
 *
 * Covers the accuracy evaluator and the per-parameter eligibility filter from
 * scope section 1.3, including the cases where accuracy cannot be reduced to a
 * number and the filter must decline rather than guess.
 */
import { describe, it, expect } from 'vitest'
import {
  resolveAccuracy,
  bucketsOverlapping,
  bucketAt,
  evaluateUnit,
  findEligible,
  coverageByParameter,
  isMatch,
  type ParameterRequirement,
} from '@/lib/master-instrument-capability'
import type {
  Accuracy,
  CapabilityBucket,
  MasterInstrumentRegistry,
  RegistryAsset,
  RegistryUnit,
} from '@/lib/master-instrument-registry'
import registryData from '@/data/master-instrument-registry.json'

const registry = registryData as unknown as MasterInstrumentRegistry

// ---------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------

const symmetric: Accuracy = { type: 'symmetric', value: 0.23, unit: '°C', polarity: '±' }

const percentOfReading: Accuracy = {
  type: 'formula',
  expression: '±0.02% of reading',
  percent_of: 'reading',
  percent_value: 0.0002,
  digits: null,
  digits_unit: null,
  polarity: '±',
}

const percentPlusCounts: Accuracy = {
  type: 'formula',
  expression: '±0.02% of reading ±2 count',
  percent_of: 'reading',
  percent_value: 0.0002,
  digits: 2,
  digits_unit: 'count',
  polarity: '±',
}

const percentOfFullScale: Accuracy = {
  type: 'formula',
  expression: '±0.05% FS',
  percent_of: 'full_scale',
  percent_value: 0.0005,
  digits: null,
  digits_unit: null,
  polarity: '±',
}

const basisUnknown: Accuracy = {
  type: 'formula',
  expression: '+/- 1%',
  percent_of: null,
  percent_value: 0.01,
  digits: null,
  digits_unit: null,
  polarity: '±',
}

const classAccuracy: Accuracy = { type: 'class', class: 'F2 Class', polarity: null }

function bucket(
  id: string,
  min: number,
  max: number,
  accuracy: Accuracy | null,
  leastCount?: number,
): CapabilityBucket {
  return {
    id,
    min,
    max,
    min_inclusive: true,
    max_inclusive: true,
    least_count: leastCount != null ? { value: leastCount, unit: 'bar' } : null,
    accuracy,
  }
}

function makeUnit(overrides: Partial<RegistryUnit> = {}): RegistryUnit {
  return {
    id: '1',
    instrument_desc: 'Test Instrument',
    asset_type: 'simple',
    make: 'Acme',
    make_parts: null,
    model: 'X1',
    model_parts: null,
    serial_no: 'SN1',
    serial_parts: null,
    category: 'Mechanical',
    usage: 'For Lab',
    calibrated_at: 'Lab',
    report_no: 'R1',
    next_due_on: '2027-01-01',
    calibration_state: 'VALID',
    calibration_days: 300,
    sop_references: [],
    certificate_file: null,
    capability_profiles: [],
    ...overrides,
  }
}

function makeAsset(unit: RegistryUnit): RegistryAsset {
  return { id: '999', asset_no: '999 HTAIPL/L', unit_count: 1, units: [unit] }
}

// ---------------------------------------------------------------------------------

describe('resolveAccuracy', () => {
  it('returns the value of a symmetric accuracy regardless of reading', () => {
    expect(resolveAccuracy(symmetric, { reading: 5 })).toEqual({ value: 0.23, unit: '°C' })
    expect(resolveAccuracy(symmetric, { reading: 5000 })).toEqual({ value: 0.23, unit: '°C' })
  })

  it('scales a percent-of-reading accuracy with the reading', () => {
    expect(resolveAccuracy(percentOfReading, { reading: 100 })?.value).toBeCloseTo(0.02)
    expect(resolveAccuracy(percentOfReading, { reading: 10000 })?.value).toBeCloseTo(2)
  })

  it('adds a counts term using the least count', () => {
    const resolved = resolveAccuracy(percentPlusCounts, { reading: 100, leastCount: 0.01 })
    expect(resolved?.value).toBeCloseTo(0.02 + 0.02)
  })

  it('uses full scale rather than reading for a %FS accuracy', () => {
    const resolved = resolveAccuracy(percentOfFullScale, { reading: 1, fullScale: 6 })
    expect(resolved?.value).toBeCloseTo(0.003)
  })

  it('declines a class accuracy, which carries no number', () => {
    expect(resolveAccuracy(classAccuracy, { reading: 10 })).toBeNull()
  })

  it('declines a percentage whose basis was never stated', () => {
    // "+/- 1%" could be of reading, of full scale, or percentage points - a 250x
    // spread at the low end of a CO2 range. Guessing would silently mis-rank masters.
    expect(resolveAccuracy(basisUnknown, { reading: 4000 })).toBeNull()
  })

  it('declines a %FS accuracy when no full scale is supplied', () => {
    expect(resolveAccuracy(percentOfFullScale, { reading: 1 })).toBeNull()
  })

  it('declines a counts term when no least count is supplied', () => {
    expect(resolveAccuracy(percentPlusCounts, { reading: 100 })).toBeNull()
  })

  it('declines a null accuracy', () => {
    expect(resolveAccuracy(null, { reading: 1 })).toBeNull()
  })
})

describe('bucket selection', () => {
  const buckets = [
    bucket('B1', 0, 100, symmetric),
    bucket('B2', 100, 500, symmetric),
    bucket('B3', 500, 1000, symmetric),
  ]

  it('finds every bucket overlapping a span', () => {
    expect(bucketsOverlapping(buckets, 50, 200).map((b) => b.id)).toEqual(['B1', 'B2'])
    expect(bucketsOverlapping(buckets, 0, 1000).map((b) => b.id)).toEqual(['B1', 'B2', 'B3'])
    expect(bucketsOverlapping(buckets, 600, 700).map((b) => b.id)).toEqual(['B3'])
  })

  it('finds the bucket containing a value', () => {
    expect(bucketAt(buckets, 50)?.id).toBe('B1')
    expect(bucketAt(buckets, 750)?.id).toBe('B3')
    expect(bucketAt(buckets, 5000)).toBeUndefined()
  })
})

describe('evaluateUnit', () => {
  const pressureUnit = makeUnit({
    capability_profiles: [
      {
        id: 'P1',
        parameter: 'Pressure',
        role: 'measuring',
        unit: 'bar',
        kind: 'range',
        min: 0,
        max: 1000,
        min_inclusive: true,
        max_inclusive: true,
        buckets: [
          bucket('B1', 0, 100, { ...symmetric, value: 0.1, unit: 'bar' }),
          bucket('B2', 100, 1000, { ...symmetric, value: 0.5, unit: 'bar' }),
        ],
      },
    ],
  })

  const req: ParameterRequirement = {
    parameter: 'Pressure',
    rangeMin: 0,
    rangeMax: 50,
    accuracy: 0.2,
  }

  it('matches when range and accuracy are both satisfied', () => {
    const result = evaluateUnit(makeAsset(pressureUnit), pressureUnit, req)
    expect(isMatch(result)).toBe(true)
    if (isMatch(result)) {
      expect(result.buckets.map((b) => b.id)).toEqual(['B1'])
      expect(result.worstAccuracy?.value).toBe(0.1)
    }
  })

  it('rejects a parameter the instrument does not have', () => {
    const result = evaluateUnit(makeAsset(pressureUnit), pressureUnit, {
      ...req,
      parameter: 'Temperature',
    })
    expect(isMatch(result)).toBe(false)
    if (!isMatch(result)) expect(result.reason).toBe('no-such-parameter')
  })

  it('rejects a range wider than the instrument covers', () => {
    const result = evaluateUnit(makeAsset(pressureUnit), pressureUnit, {
      ...req,
      rangeMax: 5000,
    })
    if (!isMatch(result)) expect(result.reason).toBe('range-not-covered')
    else throw new Error('expected rejection')
  })

  it('takes the worst bucket across the span, not the first', () => {
    // 0-200 spans both buckets; B2's ±0.5 is worse than B1's ±0.1 and must win.
    const result = evaluateUnit(makeAsset(pressureUnit), pressureUnit, {
      ...req,
      rangeMax: 200,
      accuracy: 0.2,
    })
    expect(isMatch(result)).toBe(false)
    if (!isMatch(result)) expect(result.reason).toBe('accuracy-insufficient')
  })

  it('excludes an expired instrument unless asked not to', () => {
    const expired = makeUnit({
      ...pressureUnit,
      calibration_state: 'EXPIRED',
      calibration_days: 12,
    })
    const asset = makeAsset(expired)
    expect(isMatch(evaluateUnit(asset, expired, req))).toBe(false)
    expect(isMatch(evaluateUnit(asset, expired, req, { allowExpired: true }))).toBe(true)
  })

  it('reports uncomparable accuracy separately from insufficient accuracy', () => {
    const vague = makeUnit({
      capability_profiles: [
        {
          id: 'P1',
          parameter: 'CO2',
          role: 'measuring',
          unit: 'ppm',
          kind: 'range',
          min: 0,
          max: 100000,
          min_inclusive: true,
          max_inclusive: true,
          buckets: [bucket('B1', 0, 100000, basisUnknown)],
        },
      ],
    })
    const result = evaluateUnit(makeAsset(vague), vague, {
      parameter: 'CO2',
      rangeMin: 0,
      rangeMax: 5000,
      accuracy: 100,
    })
    expect(isMatch(result)).toBe(false)
    if (!isMatch(result)) expect(result.reason).toBe('accuracy-not-comparable')
  })

  it('ignores accuracy entirely when the requirement does not state one', () => {
    const vague = makeUnit({
      capability_profiles: [
        {
          id: 'P1',
          parameter: 'CO2',
          role: 'measuring',
          unit: 'ppm',
          kind: 'range',
          min: 0,
          max: 100000,
          min_inclusive: true,
          max_inclusive: true,
          buckets: [bucket('B1', 0, 100000, basisUnknown)],
        },
      ],
    })
    const result = evaluateUnit(makeAsset(vague), vague, {
      parameter: 'CO2',
      rangeMin: 0,
      rangeMax: 5000,
    })
    expect(isMatch(result)).toBe(true)
  })

  it('matches a specific subtype and rejects one the instrument lacks', () => {
    const rtd = makeUnit({
      capability_profiles: [
        {
          id: 'P1',
          parameter: 'RTD',
          role: 'source',
          unit: '°C',
          kind: 'range',
          min: -200,
          max: 850,
          min_inclusive: true,
          max_inclusive: true,
          buckets: [],
          subtype_kind: 'rtd_curve',
          subtypes: [
            {
              id: 'Pt-100',
              min: -200,
              max: 850,
              min_inclusive: true,
              max_inclusive: true,
              buckets: [bucket('B1', -200, 850, { ...symmetric, value: 0.1, unit: '°C' })],
            },
            {
              id: 'Cu-53',
              min: -50,
              max: 180,
              min_inclusive: true,
              max_inclusive: true,
              buckets: [bucket('B1', -50, 180, { ...symmetric, value: 0.1, unit: '°C' })],
            },
          ],
        },
      ],
    })
    const asset = makeAsset(rtd)
    const base = { parameter: 'RTD', rangeMin: -50, rangeMax: 200, role: 'source' as const }

    const pt100 = evaluateUnit(asset, rtd, { ...base, subtype: 'Pt-100' })
    expect(isMatch(pt100)).toBe(true)
    if (isMatch(pt100)) expect(pt100.subtype).toBe('Pt-100')

    // Cu-53 tops out at 180, below the required 200.
    const cu53 = evaluateUnit(asset, rtd, { ...base, subtype: 'Cu-53' })
    expect(isMatch(cu53)).toBe(false)

    const missing = evaluateUnit(asset, rtd, { ...base, subtype: 'Ni-120' })
    expect(isMatch(missing)).toBe(false)
    if (!isMatch(missing)) expect(missing.reason).toBe('no-such-subtype')
  })
})

describe('against the real registry', () => {
  it('loads with the expected shape', () => {
    expect(registry.schema_version).toBe('2.0')
    expect(registry.assets.length).toBeGreaterThan(150)
    expect(registry.assets.every((a) => a.units.length >= 1)).toBe(true)
  })

  it('finds masters for a pressure job', () => {
    const result = findEligible(registry, {
      parameter: 'Pressure',
      rangeMin: 0,
      rangeMax: 5,
    })
    expect(result.eligible.length).toBeGreaterThan(0)
    expect(result.considered).toBe(
      registry.assets.reduce((n, a) => n + a.units.length, 0),
    )
  })

  it('narrows as the required range widens', () => {
    const narrow = findEligible(registry, {
      parameter: 'Pressure',
      rangeMin: 0,
      rangeMax: 5,
    })
    const wide = findEligible(registry, {
      parameter: 'Pressure',
      rangeMin: 0,
      rangeMax: 600,
    })
    expect(wide.eligible.length).toBeLessThan(narrow.eligible.length)
  })

  it('reports per-parameter coverage rather than requiring one master to do everything', () => {
    // The wireframe's own example. No single instrument in the lab covers all three,
    // so an all-parameters filter would offer the user nothing.
    const requirements: ParameterRequirement[] = [
      { parameter: 'Pressure', rangeMin: 0, rangeMax: 5 },
      { parameter: 'Temperature', rangeMin: 20, rangeMax: 50 },
      { parameter: 'RTD', rangeMin: -50, rangeMax: 200 },
    ]
    const coverage = coverageByParameter(registry, requirements)
    const rows = [...coverage.values()]

    const coversAll = rows.filter((r) => r.covers.size === requirements.length)
    const coversSome = rows.filter((r) => r.covers.size > 0)

    expect(coversAll.length).toBe(0)
    expect(coversSome.length).toBeGreaterThan(20)
  })

  it('never resolves an accuracy whose basis the certificate did not state', () => {
    // Assets 742 and 755 carry "±10% of the Master gauge" and "+/- 1%" with no basis.
    const withUnstatedBasis = registry.assets
      .flatMap((a) => a.units)
      .flatMap((u) => u.capability_profiles)
      .flatMap((p) => (p.subtypes?.flatMap((s) => s.buckets) ?? p.buckets))
      .filter((b) => b.accuracy?.type === 'formula' && b.accuracy.percent_of === null)

    expect(withUnstatedBasis.length).toBeGreaterThan(0)
    for (const b of withUnstatedBasis) {
      expect(resolveAccuracy(b.accuracy, { reading: 100, fullScale: 1000, leastCount: 1 }))
        .toBeNull()
    }
  })
})
