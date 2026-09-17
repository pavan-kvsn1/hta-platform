/**
 * A parameter can be served by more than one master.
 *
 * Two cases, and they are the same field with different numbers in it. Two masters can
 * both cover the whole of a parameter - an RTD thermometer reading while a calibrator
 * sources the signal - or they can divide it, one pressure gauge to 20 bar and another
 * beyond. Each is judged against the stretch it was used over rather than against the
 * parameter's whole range, so a gauge that reaches 20 of 100 bar is not marked short
 * for a job it was never asked to do.
 *
 * Gaps between them are allowed. The lab decides what it covered.
 */
import { describe, expect, it } from 'vitest'

import { clipRequired, type RequiredRange } from '@/lib/master/capability'
import { bucketForReading, masterResolution } from '@/lib/utils/reading-resolution'
import type { CapabilityBucket } from '@/lib/master/registry'

const range = (from: number, to: number): RequiredRange => ({
  from,
  to,
  leastCount: 0.1,
  accuracy: 0.5,
})

const band = (min: number, max: number, leastCount: number | null): CapabilityBucket =>
  ({
    id: `${min}-${max}`,
    min,
    max,
    min_inclusive: true,
    max_inclusive: true,
    least_count: leastCount === null ? null : { value: leastCount, unit: 'bar' },
    accuracy: { type: 'symmetric', value: 0.01, unit: 'bar', polarity: '±' },
  }) as CapabilityBucket

describe('what each master is asked to do', () => {
  it('asks a master only about the stretch it was used over', () => {
    // Pressure 0 to 100 bar, served by a gauge good to 20 and another beyond it.
    expect(clipRequired([range(0, 100)], 0, 20)).toEqual([range(0, 20)])
    expect(clipRequired([range(0, 100)], 20, 100)).toEqual([range(20, 100)])
  })

  it('asks about the whole of it when the stretch was never narrowed', () => {
    const whole = [range(0, 100)]
    expect(clipRequired(whole, null, null)).toBe(whole)
    expect(clipRequired(whole, 0, 100)).toEqual(whole)
  })

  it('drops a range the stretch does not touch, rather than narrowing it to nothing', () => {
    // A certificate calibrating two spans, with this master on only one of them.
    expect(clipRequired([range(0, 10), range(50, 100)], 0, 20)).toEqual([range(0, 10)])
  })

  it('keeps the least count and accuracy of the range it narrows', () => {
    const [clipped] = clipRequired([{ from: 0, to: 100, leastCount: 0.01, accuracy: 0.2 }], 0, 20)
    expect(clipped).toEqual({ from: 0, to: 20, leastCount: 0.01, accuracy: 0.2 })
  })

  it('leaves the ranges alone if the stretch is back to front', () => {
    // Nothing sensible to do with 20 to 0, and quietly returning nothing would read on
    // screen as a master that covers none of the job.
    const whole = [range(0, 100)]
    expect(clipRequired(whole, 20, 0)).toBe(whole)
  })
})

describe('how finely a reading is recorded when two masters cover it', () => {
  it('takes the finer of them', () => {
    // Both instruments read this point, so the finer is what it could be recorded to.
    const pooled = [band(0, 100, 0.1), band(0, 100, 0.01)]
    expect(bucketForReading(pooled, 50)?.least_count?.value).toBe(0.01)
  })

  it('is unchanged where only one covers it', () => {
    const pooled = [band(0, 20, 0.001), band(20, 100, 0.1)]
    expect(bucketForReading(pooled, 10)?.least_count?.value).toBe(0.001)
    expect(bucketForReading(pooled, 60)?.least_count?.value).toBe(0.1)
  })

  it('passes over a band that records no least count, rather than letting it answer', () => {
    // It cannot answer the question, and being listed first is not a reason to let it.
    const pooled = [band(0, 100, null), band(0, 100, 0.05)]
    expect(bucketForReading(pooled, 50)?.least_count?.value).toBe(0.05)
    expect(masterResolution(pooled, 50)).toMatchObject({ kind: 'declared' })
  })

  it('still says nothing when no band covering the reading records one', () => {
    expect(masterResolution([band(0, 100, null)], 50)).toMatchObject({ kind: 'unrecorded' })
  })

  it('says nothing for a reading outside every band', () => {
    expect(masterResolution([band(0, 20, 0.1)], 60)).toMatchObject({ kind: 'unrecorded' })
  })
})
