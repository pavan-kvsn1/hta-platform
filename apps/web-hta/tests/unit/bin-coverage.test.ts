/**
 * Whether the bins actually divide the range.
 *
 * Every reading has to land in exactly one bin, because the bin is what says how finely
 * it could be read and how far it may be out. Bins that leave a stretch uncovered look
 * tidy and say nothing about anything read there.
 */
import { describe, expect, it } from 'vitest'

import { binIssueSentence, binIssues } from '@/lib/certificate/bin-coverage'

const parameter = (bins: [string, string][], rangeMin = '0', rangeMax = '100') => ({
  rangeMin,
  rangeMax,
  requiresBinning: true,
  bins: bins.map(([binMin, binMax]) => ({ binMin, binMax })),
})

describe('bins that divide the range properly', () => {
  it('accepts bins that meet end to end across the whole range', () => {
    // Written sharing their boundary, which is how people write them.
    expect(binIssues(parameter([['0', '10'], ['10', '100']]))).toEqual([])
  })

  it('accepts a single bin covering the lot', () => {
    expect(binIssues(parameter([['0', '100']]))).toEqual([])
  })

  it('does not mind which order they were typed in', () => {
    expect(binIssues(parameter([['10', '100'], ['0', '10']]))).toEqual([])
  })

  it('reads a bin written high to low', () => {
    expect(binIssues(parameter([['10', '0'], ['100', '10']]))).toEqual([])
  })
})

describe('a stretch of the range with no bin over it', () => {
  it('is the case that started this: 0-10 and 20-100', () => {
    expect(binIssues(parameter([['0', '10'], ['20', '100']]))).toEqual([
      { kind: 'gap', from: 10, to: 20 },
    ])
  })

  it('is caught where the bins start after the range does', () => {
    expect(binIssues(parameter([['20', '100']]))).toEqual([{ kind: 'gap', from: 0, to: 20 }])
  })

  it('is caught where the range runs on past the last bin', () => {
    expect(binIssues(parameter([['0', '50']]))).toEqual([{ kind: 'gap', from: 50, to: 100 }])
  })

  it('reports every gap, not just the first', () => {
    expect(binIssues(parameter([['10', '20'], ['30', '40']]))).toEqual([
      { kind: 'gap', from: 0, to: 10 },
      { kind: 'gap', from: 20, to: 30 },
      { kind: 'gap', from: 40, to: 100 },
    ])
  })
})

describe('a stretch two bins both claim', () => {
  it('is caught, because which one applies is a toss-up', () => {
    expect(binIssues(parameter([['0', '60'], ['40', '100']]))).toEqual([
      { kind: 'overlap', from: 40, to: 60 },
    ])
  })

  it('is not raised for bins that merely share a boundary', () => {
    expect(binIssues(parameter([['0', '10'], ['10', '100']]))).toEqual([])
  })
})

describe('bins not filled in yet', () => {
  it('says which bin is blank rather than inventing gaps around it', () => {
    expect(binIssues(parameter([['0', '10'], ['', '']]))).toEqual([
      { kind: 'incomplete', position: 2 },
    ])
  })

  it('says so for a half-filled bin too', () => {
    expect(binIssues(parameter([['0', '10'], ['10', '']]))).toEqual([
      { kind: 'incomplete', position: 2 },
    ])
  })
})

describe('what is not judged', () => {
  it('asks nothing when binning is switched off', () => {
    expect(binIssues({ ...parameter([['0', '10'], ['20', '100']]), requiresBinning: false })).toEqual([])
  })

  it('asks nothing when there are no bins yet', () => {
    expect(binIssues({ rangeMin: '0', rangeMax: '100', requiresBinning: true, bins: [] })).toEqual([])
  })

  it('still catches a gap between bins when the range is not stated', () => {
    // The ends cannot be checked without a range, but the hole in the middle is a hole
    // whatever the range turns out to be.
    expect(binIssues(parameter([['0', '10'], ['20', '100']], '', ''))).toEqual([
      { kind: 'gap', from: 10, to: 20 },
    ])
  })
})

describe('what the engineer is told', () => {
  it('names the stretch nothing covers, and why it matters', () => {
    expect(binIssueSentence({ kind: 'gap', from: 10, to: 20 }, 'bar')).toBe(
      'Nothing covers 10 to 20 bar. A reading taken there has no least count and no accuracy to be judged by.',
    )
  })

  it('names the stretch two bins claim', () => {
    expect(binIssueSentence({ kind: 'overlap', from: 40, to: 60 }, 'bar')).toBe(
      'Two bins both claim 40 to 60 bar, so which least count and accuracy apply there is undecided.',
    )
  })

  it('names the bin that is blank', () => {
    expect(binIssueSentence({ kind: 'incomplete', position: 2 }, 'bar')).toBe(
      'Bin 2 does not say what stretch it covers.',
    )
  })

  it('reads sensibly with no unit yet', () => {
    expect(binIssueSentence({ kind: 'gap', from: 10, to: 20 }, '')).toContain('10 to 20.')
  })
})
