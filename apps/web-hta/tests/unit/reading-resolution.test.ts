import { describe, it, expect } from 'vitest'
import {
  masterResolution,
  uucResolution,
  bucketForReading,
  precisionOf,
  errorResolution,
} from '@/lib/utils/reading-resolution'
import type { CapabilityBucket } from '@/lib/master/registry'

const bucket = (over: Partial<CapabilityBucket> = {}): CapabilityBucket => ({
  id: 'b1',
  min: -80,
  max: 300,
  min_inclusive: true,
  max_inclusive: true,
  least_count: { value: 0.001, unit: '°C' },
  accuracy: { type: 'symmetric', value: 0.05, unit: '°C', polarity: '±' },
  ...over,
}) as CapabilityBucket

describe('the two instruments on a row resolve separately', () => {
  it('reads the master off its capability profile', () => {
    // 781 HTAIPL/L: -80 to 300 °C, least count 0.001. Judged at the UUC's two
    // decimals it was told off for writing the third one it can actually show.
    expect(masterResolution([bucket()], 25)).toEqual({
      kind: 'declared',
      side: 'master',
      leastCount: 0.001,
      precision: 3,
    })
  })

  it('reads the UUC off the certificate', () => {
    expect(uucResolution({ leastCountValue: '0.01' }, 25)).toEqual({
      kind: 'declared',
      side: 'uuc',
      leastCount: 0.01,
      precision: 2,
    })
  })

  it('lets a binned UUC change across its range while the master holds', () => {
    const parameter = {
      requiresBinning: true,
      bins: [
        { binMin: '0', binMax: '10', leastCount: '0.01' },
        { binMin: '10.01', binMax: '100', leastCount: '0.1' },
      ],
    }
    expect(uucResolution(parameter, 5)).toMatchObject({ precision: 2 })
    expect(uucResolution(parameter, 50)).toMatchObject({ precision: 1 })
    expect(masterResolution([bucket()], 5)).toMatchObject({ precision: 3 })
    expect(masterResolution([bucket()], 50)).toMatchObject({ precision: 3 })
  })
})

describe('a resolution nobody wrote down', () => {
  it('says so rather than borrowing the other instrument’s', () => {
    expect(masterResolution([bucket({ least_count: null })], 25)).toEqual({
      kind: 'unrecorded',
      side: 'master',
    })
  })

  it('separates a master with no declared capability from one with no least count', () => {
    expect(masterResolution([], 25)).toEqual({ kind: 'undeclared', side: 'master' })
  })

  it('does not answer for a reading outside every bucket', () => {
    expect(masterResolution([bucket({ min: 0, max: 10 })], 400)).toEqual({
      kind: 'unrecorded',
      side: 'master',
    })
  })

  it('treats a UUC with no least count the same way', () => {
    expect(uucResolution({ leastCountValue: '' }, 25)).toEqual({
      kind: 'unrecorded',
      side: 'uuc',
    })
  })
})

describe('picking the bucket', () => {
  const two = [
    bucket({ id: 'low', min: 0, max: 100, max_inclusive: false }),
    bucket({ id: 'high', min: 100, max: 300, min_inclusive: true }),
  ]

  it('honours the bucket’s own inclusivity at a shared boundary', () => {
    expect(bucketForReading(two, 100)?.id).toBe('high')
    expect(bucketForReading(two, 99.9)?.id).toBe('low')
  })

  it('finds nothing for a reading that is not a number', () => {
    expect(bucketForReading(two, Number.NaN)).toBeNull()
  })
})

describe('what a computed column prints', () => {
  it('uses the declared resolution', () => {
    expect(precisionOf(masterResolution([bucket()], 25))).toBe(3)
  })

  it('falls back to the other instrument where none is recorded', () => {
    const master = masterResolution([bucket({ least_count: null })], 25)
    expect(precisionOf(master, uucResolution({ leastCountValue: '0.01' }, 25))).toBe(2)
  })

  it('falls back to the default where neither states one', () => {
    expect(precisionOf(masterResolution([], 25), uucResolution({}, 25))).toBe(2)
  })
})

describe('the resolution an error is reported at', () => {
  /**
   * HTA/S22734/165/26 is the case this exists for: the unit's least count says whole
   * degrees, the standard reads to a thousandth, and errors of 0.28 and -0.11 printed
   * as "0" and "-0" on an issued certificate.
   */
  const fine = () => masterResolution([bucket({ least_count: { value: 0.001, unit: '°C' } })], 25)
  const coarse = () => uucResolution({ leastCountValue: '1' }, 25)

  it('takes the finer of the two, whichever side it is on', () => {
    expect(precisionOf(errorResolution(fine(), coarse()))).toBe(3)
  })

  it('does not care which argument the finer one arrives as', () => {
    const uucFiner = uucResolution({ leastCountValue: '0.01' }, 25)
    const masterCoarser = masterResolution([bucket({ least_count: { value: 0.5, unit: '°C' } })], 25)
    expect(precisionOf(errorResolution(masterCoarser, uucFiner))).toBe(2)
  })

  it('keeps the step itself, not just its decimals', () => {
    // 0.025 and 0.05 both print three and two decimals, but the step is what a reading
    // has to land on, and reducing it to a digit count loses that.
    const master = masterResolution([bucket({ least_count: { value: 0.025, unit: '°C' } })], 25)
    const uuc = uucResolution({ leastCountValue: '0.05' }, 25)
    const chosen = errorResolution(master, uuc)
    expect(chosen.kind === 'declared' && chosen.leastCount).toBe(0.025)
  })

  it('uses the one side that states a resolution', () => {
    expect(precisionOf(errorResolution(masterResolution([], 25), uucResolution({ leastCountValue: '0.01' }, 25)))).toBe(2)
    expect(precisionOf(errorResolution(fine(), uucResolution({}, 25)))).toBe(3)
  })

  it('says so when neither side states one, rather than inventing a step', () => {
    const neither = errorResolution(masterResolution([], 25), uucResolution({}, 25))
    expect(neither.kind).not.toBe('declared')
  })

  it('follows the band the reading falls in', () => {
    // A banded parameter states the unit's resolution once per band; the error follows
    // it, because that is the unit's resolution at that reading.
    const banded = {
      requiresBinning: true,
      bins: [
        { binMin: '0', binMax: '50', leastCount: '0.01' },
        { binMin: '50', binMax: '80', leastCount: '0.1' },
      ],
    }
    const master = masterResolution([bucket({ least_count: { value: 1, unit: '°C' } })], 25)
    expect(precisionOf(errorResolution(master, uucResolution(banded, 25)))).toBe(2)
    expect(precisionOf(errorResolution(master, uucResolution(banded, 70)))).toBe(1)
  })
})
