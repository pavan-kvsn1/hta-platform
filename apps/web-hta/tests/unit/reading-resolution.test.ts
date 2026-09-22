import { describe, it, expect } from 'vitest'
import {
  masterResolution,
  uucResolution,
  bucketForReading,
  precisionOf,
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
