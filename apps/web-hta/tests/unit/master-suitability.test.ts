/**
 * Whether a chosen master is good enough for what is being calibrated.
 *
 * Judged per required range, because a parameter can be binned and a master's own
 * resolution and accuracy change across its bands - one verdict for the pair would
 * hide the case where the master is fine at one end of the range and not the other.
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ACCURACY_RATIO,
  bucketForRange,
  declaredCapability,
  evaluateSuitability,
  requiredRanges,
  type RequiredRange,
} from '@/lib/master-instrument-capability'
import type { CapabilityProfile } from '@/lib/master-instrument-registry'
import registryData from '@/data/master-instrument-registry.json'
import type { MasterInstrumentRegistry } from '@/lib/master-instrument-registry'

const registry = registryData as unknown as MasterInstrumentRegistry

const bucket = (min: number, max: number, lc: number, acc: number) => ({
  id: `B${min}`,
  min,
  max,
  min_inclusive: true,
  max_inclusive: true,
  least_count: { value: lc, unit: '°C' },
  accuracy: { type: 'symmetric', value: acc, unit: '°C', polarity: '±' },
})

const profile = (over: Partial<CapabilityProfile> = {}) =>
  ({
    id: 'P1',
    parameter: 'Temperature',
    role: 'measuring',
    unit: '°C',
    kind: 'range',
    min: -100,
    max: 100,
    min_inclusive: true,
    max_inclusive: true,
    buckets: [bucket(-100, 100, 0.1, 0.0625)],
    subtype_kind: null,
    subtypes: [],
    ...over,
  }) as unknown as CapabilityProfile

const need = (over: Partial<RequiredRange> = {}): RequiredRange => ({
  from: -20,
  to: 60,
  leastCount: 0.1,
  accuracy: 0.5,
  ...over,
})

describe('evaluateSuitability', () => {
  it('accepts a master that covers the range and beats the limit', () => {
    const s = evaluateSuitability(profile(), [need()])
    expect(s.covered).toBe(true)
    expect(s.resolvable).toBe(true)
    expect(s.worstRatio).toBe(8)
    expect(s.meetsThreshold).toBe(true)
    expect(s.ranges[0].leastCount).toBe('matches')
  })

  it('reports a range the capability does not reach', () => {
    const s = evaluateSuitability(profile({ min: 0, max: 40 }), [need()])
    expect(s.covered).toBe(false)
    expect(s.ranges[0].covered).toBe(false)
  })

  it('calls a coarser least count unresolvable', () => {
    // Recording to 0.1 from an instrument that reads to 0.5 writes precision that
    // was never measured.
    const s = evaluateSuitability(profile({ buckets: [bucket(-100, 100, 0.5, 0.0625)] }), [need()])
    expect(s.ranges[0].leastCount).toBe('coarser')
    expect(s.resolvable).toBe(false)
  })

  it('accepts a finer least count', () => {
    const s = evaluateSuitability(profile({ buckets: [bucket(-100, 100, 0.01, 0.0625)] }), [need()])
    expect(s.ranges[0].leastCount).toBe('finer')
    expect(s.resolvable).toBe(true)
  })

  it('fails the threshold when the master is barely better than the unit', () => {
    const s = evaluateSuitability(profile({ buckets: [bucket(-100, 100, 0.1, 0.3)] }), [need()])
    expect(s.worstRatio).toBeCloseTo(1.667, 3)
    expect(s.meetsThreshold).toBe(false)
  })

  it('takes the worst ratio across a binned parameter, not the best', () => {
    // Fine at the bottom of the range, marginal at the top. A single verdict would
    // report the good half and hide the other.
    const binned = profile({
      min: 0,
      max: 100,
      buckets: [bucket(0, 50, 0.1, 0.05), bucket(50, 100, 0.1, 0.4)],
    })
    const s = evaluateSuitability(binned, [
      need({ from: 0, to: 50, accuracy: 0.5 }),
      need({ from: 50, to: 100, accuracy: 0.5 }),
    ])
    expect(s.ranges.map((r) => r.accuracyRatio)).toEqual([10, 1.25])
    expect(s.worstRatio).toBe(1.25)
    expect(s.meetsThreshold).toBe(false)
  })

  it('judges each required range against its own band', () => {
    const binned = profile({
      min: 0,
      max: 100,
      buckets: [bucket(0, 50, 0.1, 0.05), bucket(50, 100, 1, 0.4)],
    })
    const s = evaluateSuitability(binned, [
      need({ from: 0, to: 50, leastCount: 0.1 }),
      need({ from: 50, to: 100, leastCount: 0.1 }),
    ])
    expect(s.ranges.map((r) => r.leastCount)).toEqual(['matches', 'coarser'])
  })

  it('says when the accuracy cannot be reduced to a number', () => {
    const classAcc = profile({
      buckets: [
        {
          ...bucket(-100, 100, 0.1, 0),
          accuracy: { type: 'class', class: '0.5', standard: 'IEC 60751' },
        },
      ] as never,
    })
    const s = evaluateSuitability(classAcc, [need()])
    expect(s.ranges[0].accuracyRatio).toBeNull()
    expect(s.ranges[0].notComparable).toMatch(/cannot be reduced/i)
    expect(s.meetsThreshold).toBe(false)
  })

  it('honours a lab threshold other than the default', () => {
    const p = profile({ buckets: [bucket(-100, 100, 0.1, 0.25)] })
    expect(evaluateSuitability(p, [need()]).meetsThreshold).toBe(false)
    expect(evaluateSuitability(p, [need()], { threshold: 2 }).meetsThreshold).toBe(true)
    expect(DEFAULT_ACCURACY_RATIO).toBe(4)
  })
})

describe('a declared subtype narrows the instrument', () => {
  const withCurves = profile({
    min: -200,
    max: 660,
    subtype_kind: 'rtd_curve',
    subtypes: [
      { id: 'Pt-100', min: -200, max: 660, buckets: [bucket(-200, 660, 0.1, 0.0625)] },
      { id: 'Cu-53', min: -70, max: 150, buckets: [bucket(-70, 150, 0.5, 0.5)] },
    ] as never,
  })

  it('uses the curve range and buckets, not the profile envelope', () => {
    expect(declaredCapability(withCurves, 'Cu-53').max).toBe(150)
    expect(declaredCapability(withCurves).max).toBe(660)
  })

  it('reaches a different verdict per curve', () => {
    const good = evaluateSuitability(withCurves, [need()], { subtypeId: 'Pt-100' })
    const poor = evaluateSuitability(withCurves, [need()], { subtypeId: 'Cu-53' })
    expect(good.meetsThreshold).toBe(true)
    expect(good.ranges[0].leastCount).toBe('matches')
    // Same instrument, same capability - the curve is what decides.
    expect(poor.meetsThreshold).toBe(false)
    expect(poor.ranges[0].leastCount).toBe('coarser')
  })
})

describe('requiredRanges', () => {
  it('reads a single range from the parameter', () => {
    expect(
      requiredRanges({ rangeMin: '-20', rangeMax: '60', leastCountValue: '0.1', accuracyValue: '±0.5' }),
    ).toEqual([{ from: -20, to: 60, leastCount: 0.1, accuracy: 0.5 }])
  })

  it('reads every bin when the parameter is binned', () => {
    const ranges = requiredRanges({
      requiresBinning: true,
      bins: [
        { binMin: '0', binMax: '50', leastCount: '0.1', accuracy: '±0.5' },
        { binMin: '50', binMax: '100', leastCount: '1', accuracy: '±1.0' },
      ],
    })
    expect(ranges).toHaveLength(2)
    expect(ranges[1]).toEqual({ from: 50, to: 100, leastCount: 1, accuracy: 1 })
  })

  it('drops a bin that is not fully filled in rather than inventing zeros', () => {
    const ranges = requiredRanges({
      requiresBinning: true,
      bins: [
        { binMin: '0', binMax: '50', leastCount: '0.1', accuracy: '±0.5' },
        { binMin: '50', binMax: '', leastCount: '', accuracy: '' },
      ],
    })
    expect(ranges).toHaveLength(1)
  })

  it('returns nothing when the parameter has not been set up', () => {
    expect(requiredRanges({})).toEqual([])
  })
})

describe('against the real registry', () => {
  const units = registry.assets.flatMap((a) => a.units)

  it('evaluates every recorded profile without throwing', () => {
    const range = [need({ from: 0, to: 10, leastCount: 0.1, accuracy: 1 })]
    for (const unit of units) {
      for (const p of unit.capability_profiles) {
        expect(() => evaluateSuitability(p, range)).not.toThrow()
        for (const s of p.subtypes ?? []) {
          expect(() => evaluateSuitability(p, range, { subtypeId: s.id })).not.toThrow()
        }
      }
    }
  })

  it('finds a bucket for a range inside a real profile', () => {
    const withBuckets = units
      .flatMap((u) => u.capability_profiles)
      .find((p) => (p.buckets ?? []).some((b) => b.min != null && b.max != null))!
    const b = (withBuckets.buckets ?? []).find((x) => x.min != null && x.max != null)!
    const found = bucketForRange(withBuckets.buckets ?? [], {
      from: b.min!,
      to: b.max!,
      leastCount: 1,
      accuracy: 1,
    })
    expect(found).toBe(b)
  })
})
