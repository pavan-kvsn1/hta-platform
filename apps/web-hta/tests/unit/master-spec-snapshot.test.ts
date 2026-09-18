import { describe, it, expect } from 'vitest'
import { masterSpecFor, EMPTY_SNAPSHOT } from '@/lib/master-entry/snapshot'
import type { RegistryUnit } from '@/lib/master/registry'

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
      masterBands: [
        { from: -80, to: 300, leastCount: '0.001', leastCountUnit: '°C', accuracy: '0.05', accuracyUnit: '°C' },
      ],
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
      masterLeastCountUnit: '',
      masterAccuracy: '0.05',
      masterAccuracyUnit: '°C',
      masterBands: [
        { from: -80, to: 300, leastCount: '', leastCountUnit: '', accuracy: '0.05', accuracyUnit: '°C' },
      ],
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

/**
 * A master's figures are not always one pair.
 *
 * The snapshot has always taken the band the used range resolves to, which is the whole
 * truth for the 218 of this lab's 369 profiles that declare one. The other half declare
 * several, each with its own resolution and accuracy - a Fluke 5522A sourcing DC current
 * declares five between 0 and 329.9 - and a calibration crossing two of them is not
 * described by either alone.
 */
describe('a master with more than one band', () => {
  /** The Fluke's real bands, as its register states them, units and all. */
  const dcCurrent = [
    bucket({ id: 'b1', min: 0, max: 2.999, least_count: { value: 0.00001, unit: 'A' }, accuracy: { type: 'symmetric', value: 0.00094, unit: 'A', polarity: '±' } }),
    bucket({ id: 'b2', min: 2.999, max: 3.299, least_count: { value: 0.00001, unit: 'mA' }, accuracy: { type: 'symmetric', value: 0.00031, unit: 'mA', polarity: '±' } }),
    bucket({ id: 'b3', min: 3.299, max: 20.5, least_count: { value: 0.0001, unit: 'A' }, accuracy: { type: 'symmetric', value: 0.0168, unit: 'A', polarity: '±' } }),
    bucket({ id: 'b4', min: 20.5, max: 32.99, least_count: { value: 0.0001, unit: 'mA' }, accuracy: { type: 'symmetric', value: 0.0029, unit: 'mA', polarity: '±' } }),
    bucket({ id: 'b5', min: 32.99, max: 329.9, least_count: { value: 0.001, unit: 'mA' }, accuracy: { type: 'symmetric', value: 0.029, unit: 'mA', polarity: '±' } }),
  ]
  const fluke = unit(dcCurrent, { parameter: 'DC Current', unit: 'A', min: 0, max: 329.9 })

  it('keeps every band the calibration crossed', () => {
    const spec = masterSpecFor(fluke, 'P1', null, { from: 1, to: 25 })
    expect(spec.masterBands.map((b) => [b.from, b.to])).toEqual([
      [0, 2.999],
      [2.999, 3.299],
      [3.299, 20.5],
      [20.5, 32.99],
    ])
  })

  it('leaves out the bands it never reached', () => {
    // The instrument's full capability is a fact about the instrument and belongs in
    // the register. A certificate says what this calibration was done with.
    const spec = masterSpecFor(fluke, 'P1', null, { from: 1, to: 25 })
    expect(spec.masterBands.some((b) => b.to === 329.9)).toBe(false)
  })

  it('carries each band\'s own resolution and accuracy, not the first one\'s', () => {
    const spec = masterSpecFor(fluke, 'P1', null, { from: 1, to: 25 })
    expect(spec.masterBands.map((b) => b.accuracy)).toEqual(['0.00094', '0.00031', '0.0168', '0.0029'])
  })

  it('keeps the units as the register wrote them, inconsistencies included', () => {
    /**
     * A and mA alternate down this instrument's bands and the figures do not follow:
     * 0.00031 mA between 2.999 and 3.299 A would be a thousand times finer than the
     * band beneath it. Almost certainly the register was typed with the unit sometimes
     * meant and sometimes not. Correcting it here would put a number on a certificate
     * that the master's own certificate does not state; showing it as written is what
     * lets somebody notice.
     */
    const spec = masterSpecFor(fluke, 'P1', null, { from: 1, to: 25 })
    expect(spec.masterBands.map((b) => b.accuracyUnit)).toEqual(['A', 'mA', 'A', 'mA'])
  })

  it('leads with the band the lookup settled on, so the single figures still agree', () => {
    // Certificates already written read masterLeastCount and masterAccuracy. Those must
    // go on saying what they said, and the first band is where they come from.
    const spec = masterSpecFor(fluke, 'P1', null, { from: 1, to: 25 })
    expect(spec.masterBands[0]).toMatchObject({ accuracy: spec.masterAccuracy })
  })

  it('gives one band for a calibration inside one band', () => {
    const spec = masterSpecFor(fluke, 'P1', null, { from: 0.5, to: 2 })
    expect(spec.masterBands).toHaveLength(1)
    expect(spec.masterBands[0]).toMatchObject({ from: 0, to: 2.999 })
  })

  it('records nothing for a band with no upper bound', () => {
    /**
     * Not a decision made here - bucketForRange has always required both bounds, and
     * a capability with an open end matches nothing, so there is no band to snapshot
     * either. Pinned rather than fixed because the register holds none: all 1,564
     * bands in this lab state both ends, so changing the matcher would be altering
     * master selection across the app to serve a case that does not arise.
     */
    const open = [bucket({ id: 'o', min: 0, max: null })]
    expect(masterSpecFor(unit(open), 'P1', null, { from: 10, to: 900 }).masterBands).toEqual([])
  })

  it('reads a range given backwards the same as one given forwards', () => {
    const forwards = masterSpecFor(fluke, 'P1', null, { from: 1, to: 25 })
    const backwards = masterSpecFor(fluke, 'P1', null, { from: 25, to: 1 })
    expect(backwards.masterBands.map((b) => b.from).sort()).toEqual(
      forwards.masterBands.map((b) => b.from).sort(),
    )
  })

  it('records no bands where there is no capability to record', () => {
    expect(masterSpecFor(undefined, 'P1', null, { from: 0, to: 1 })).toEqual(EMPTY_SNAPSHOT)
    expect(EMPTY_SNAPSHOT.masterBands).toEqual([])
  })
})
