import { describe, it, expect } from 'vitest'
import { masterSpecFor, EMPTY_SNAPSHOT } from '@/lib/master-spec-snapshot'
import type { RegistryUnit } from '@/lib/master-instrument-registry'

const bucket = (over: Record<string, unknown> = {}) => ({
  id: 'B1',
  min: -80,
  max: 300,
  min_inclusive: true,
  max_inclusive: true,
  least_count: { value: 0.001, unit: '°C' },
  accuracy: { type: 'symmetric', value: 0.05, unit: '°C', polarity: '±' },
  ...over,
})

const unit = (buckets: unknown[], over: Record<string, unknown> = {}) =>
  ({
    id: '1',
    capability_profiles: [
      { id: 'P1', parameter: 'Temperature', role: 'measuring', unit: '°C', min: -80, max: 300, buckets, subtypes: [], ...over },
    ],
  }) as unknown as RegistryUnit

describe('what the master’s certificate says, taken once', () => {
  it('records the capability and the bucket covering the span used', () => {
    expect(masterSpecFor(unit([bucket()]), 'P1', null, { from: -10, to: 40 })).toEqual({
      capabilityParameter: 'Temperature',
      masterLeastCount: '0.001',
      masterLeastCountUnit: '°C',
      masterAccuracy: '0.05',
      masterAccuracyUnit: '°C',
    })
  })

  it('picks the bucket the span falls in, not the first one', () => {
    const buckets = [
      bucket({ id: 'low', min: 0, max: 10, accuracy: { type: 'symmetric', value: 0.05, unit: '°C', polarity: '±' } }),
      bucket({ id: 'high', min: 10, max: 300, accuracy: { type: 'symmetric', value: 0.15, unit: '°C', polarity: '±' } }),
    ]
    expect(masterSpecFor(unit(buckets), 'P1', null, { from: 20, to: 100 })).toMatchObject({
      masterAccuracy: '0.15',
    })
  })

  it('keeps the capability but no numbers where the registry states no least count', () => {
    expect(masterSpecFor(unit([bucket({ least_count: null })]), 'P1', null, { from: 0, to: 10 })).toEqual({
      capabilityParameter: 'Temperature',
      masterLeastCount: '',
      masterLeastCountUnit: '°C'.replace('°C', ''),
      masterAccuracy: '0.05',
      masterAccuracyUnit: '°C',
    })
  })

  it('prints a formula accuracy as written rather than resolving it', () => {
    // "±0.02% of reading ±2 count" has no scalar; it only means something against a
    // reading, and the master's certificate is not about this certificate's readings.
    const formula = bucket({
      accuracy: { type: 'formula', expression: '±0.02% of reading ±2 count', percent_of: 'reading', percent_value: 0.02, digits: 2, digits_unit: '°C', polarity: '±' },
    })
    expect(masterSpecFor(unit([formula]), 'P1', null, { from: 0, to: 10 })).toMatchObject({
      masterAccuracy: '±0.02% of reading ±2 count',
      masterAccuracyUnit: '',
    })
  })

  it('prints a class accuracy as its class', () => {
    const klass = bucket({ accuracy: { type: 'class', class: 'F2 Class', polarity: null } })
    expect(masterSpecFor(unit([klass]), 'P1', null, { from: 0, to: 10 })).toMatchObject({
      masterAccuracy: 'F2 Class',
    })
  })

  it('takes the subtype’s buckets where a curve was declared', () => {
    const withSubtype = unit([], {
      subtypes: [{ id: 'Type K', min: -200, max: 1372, buckets: [bucket({ least_count: { value: 1, unit: '°C' } })] }],
    })
    expect(masterSpecFor(withSubtype, 'P1', 'Type K', { from: 0, to: 100 })).toMatchObject({
      masterLeastCount: '1',
    })
  })

  it('records nothing at all when no capability was declared', () => {
    expect(masterSpecFor(unit([bucket()]), null, null, { from: 0, to: 10 })).toEqual(EMPTY_SNAPSHOT)
    expect(masterSpecFor(undefined, 'P1', null, { from: 0, to: 10 })).toEqual(EMPTY_SNAPSHOT)
  })

  it('keeps the capability when no bucket covers the span', () => {
    expect(masterSpecFor(unit([bucket({ min: 0, max: 10 })]), 'P1', null, { from: 400, to: 500 })).toEqual({
      ...EMPTY_SNAPSHOT,
      capabilityParameter: 'Temperature',
    })
  })
})
