/**
 * The lab's acceptance rule, now that both the form and the reading screens apply it.
 *
 * It lived privately inside the certificate store, which meant the engineer's form
 * decided whether a point passed and every screen that only reads a certificate printed
 * that verdict without being able to name the figure behind it. These pin the rule as
 * the store has always applied it, so extracting it cannot quietly change a verdict.
 */
import { describe, expect, it } from 'vitest'

import { bandsOf, calculateErrorLimit } from '@/lib/certificate/error-limit'

/** The bands on HTA/S22734/165/26's third parameter, as the lab wrote them. */
const BANDS = [
  { binMin: '0', binMax: '20', leastCount: '0.01', accuracy: '0.26' },
  { binMin: '20', binMax: '40', leastCount: '0.01', accuracy: '0.5' },
  { binMin: '40', binMax: '50', leastCount: '0.01', accuracy: '0.75' },
  { binMin: '50', binMax: '60', leastCount: '0.01', accuracy: '1' },
  { binMin: '60', binMax: '80', leastCount: '0.1', accuracy: '1' },
  { binMin: '80', binMax: '100', leastCount: '1', accuracy: '1.25' },
]

const banded = {
  accuracyType: 'ABSOLUTE',
  accuracyValue: '3',
  rangeMin: '0',
  rangeMax: '100',
  requiresBinning: true,
  bins: BANDS,
}

describe('what a point is allowed', () => {
  it('takes the band the master reading fell in, not the parameter figure', () => {
    // The parameter also states a flat +/-3, which no band agrees with and no point
    // was ever judged by. That mismatch is exactly why the flat pair is not printed
    // beside the bands any more.
    expect(calculateErrorLimit(banded, 45).limit).toBe(0.75)
    expect(calculateErrorLimit(banded, 90.11).limit).toBe(1.25)
  })

  it('gives each of that certificate\'s five points its own limit', () => {
    const limits = [20, 40, 50, 60, 90.11].map((r) => calculateErrorLimit(banded, r).limit)
    expect(limits).toEqual([0.26, 0.5, 0.75, 1, 1.25])
  })

  it('gives the first band a reading that two bands both claim', () => {
    /**
     * Bands are written inclusive at both ends, so 20 sits in 0-20 and in 20-40. The
     * form has always taken the first; a reviewer reading the figure back has to be
     * told the same one or the two screens disagree about a point that passed.
     */
    expect(calculateErrorLimit(banded, 20)).toMatchObject({ limit: 0.26, bandIndex: 0 })
  })

  it('names which band decided, so a screen can point at it', () => {
    expect(calculateErrorLimit(banded, 55)).toMatchObject({ bandIndex: 3, bandAccuracy: '1' })
  })

  it('judges nothing where the reading falls outside every band', () => {
    // Not a pass and not a fail: a point the parameter says nothing about.
    expect(calculateErrorLimit(banded, 150)).toMatchObject({ limit: null, bandIndex: null })
  })

  it('falls back to the parameter figure when it is not banded', () => {
    expect(
      calculateErrorLimit(
        { accuracyType: 'ABSOLUTE', accuracyValue: '1', requiresBinning: false },
        22,
      ).limit,
    ).toBe(1)
  })

  it('reads a figure whether or not it was written with its sign', () => {
    const withSign = { accuracyType: 'ABSOLUTE', accuracyValue: '±2', requiresBinning: false }
    expect(calculateErrorLimit(withSign, 5).limit).toBe(2)
  })

  it('takes a percentage of reading against the reading', () => {
    const p = { accuracyType: 'PERCENT_READING', accuracyValue: '1', requiresBinning: false }
    expect(calculateErrorLimit(p, 250).limit).toBe(2.5)
    // And against its size, not its sign - a vacuum gauge reads negative.
    expect(calculateErrorLimit(p, -250).limit).toBe(2.5)
  })

  it('takes a percentage of scale against the span', () => {
    const p = {
      accuracyType: 'PERCENT_SCALE',
      accuracyValue: '0.5',
      rangeMin: '0',
      rangeMax: '600',
      requiresBinning: false,
    }
    expect(calculateErrorLimit(p, 100).limit).toBe(3)
  })

  it('falls back to the bare figure where no span is recorded', () => {
    // What the form has always done, and what the certificates were written under.
    const p = { accuracyType: 'PERCENT_SCALE', accuracyValue: '0.5', requiresBinning: false }
    expect(calculateErrorLimit(p, 100).limit).toBe(0.5)
  })

  it('judges nothing where the parameter records no accuracy at all', () => {
    expect(calculateErrorLimit({ accuracyType: 'ABSOLUTE' }, 10).limit).toBeNull()
  })

  it('judges nothing on a band whose accuracy was left blank', () => {
    const blank = {
      accuracyType: 'ABSOLUTE',
      requiresBinning: true,
      bins: [{ binMin: '0', binMax: '10', leastCount: '0.1', accuracy: '' }],
    }
    expect(calculateErrorLimit(blank, 5)).toMatchObject({ limit: null, bandIndex: 0 })
  })

  it('judges nothing when the master reading is not a number', () => {
    expect(calculateErrorLimit(banded, Number.NaN).limit).toBeNull()
  })
})

describe('reading the bands a certificate stored', () => {
  it('parses them from the JSON text a certificate holds', () => {
    expect(bandsOf(JSON.stringify(BANDS))).toHaveLength(6)
  })

  it('takes them as they are when already parsed', () => {
    expect(bandsOf(BANDS)).toHaveLength(6)
  })

  it('finds none in null, in nonsense, or in the wrong shape', () => {
    expect(bandsOf(null)).toEqual([])
    expect(bandsOf('not json')).toEqual([])
    expect(bandsOf([{ nothing: 'useful' }])).toEqual([])
  })
})
