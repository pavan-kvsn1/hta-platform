/**
 * Whether a reading is one the instrument could have shown.
 *
 * The cases that matter are the ones a decimal count cannot express: 0.025, 0.05, 0.2,
 * 5, 10. Read as "how many digits follow the dot", 0.025 and 0.001 are the same thing,
 * and a reading of 0.031 passes as valid on an instrument that steps in 0.025.
 */
import { describe, expect, it } from 'vitest'

import { checkStep, stepWarning } from '@/lib/utils/least-count'

describe('a reading that lands on a step', () => {
  it('accepts whole multiples', () => {
    expect(checkStep('0.075', '0.025').kind).toBe('ok')
    expect(checkStep('49.70', '0.05').kind).toBe('ok')
    expect(checkStep('2.4', '0.2').kind).toBe('ok')
    expect(checkStep('150', '5').kind).toBe('ok')
    expect(checkStep('200', '10').kind).toBe('ok')
    expect(checkStep('0', '0.05').kind).toBe('ok')
  })

  it('survives the arithmetic that would otherwise break it', () => {
    // 0.075 / 0.025 is 3.0000000000000004 and 2.4 / 0.2 is 11.999999999999998, so a
    // reading that lands exactly on a step would be reported as falling between two.
    expect(checkStep(0.075, 0.025).kind).toBe('ok')
    expect(checkStep(2.4, 0.2).kind).toBe('ok')
    expect(checkStep(0.3, 0.1).kind).toBe('ok')
    expect(checkStep(1.005, 0.005).kind).toBe('ok')
  })

  it('accepts a negative reading on a step', () => {
    expect(checkStep('-5.10', '0.05').kind).toBe('ok')
    expect(checkStep('-0.075', '0.025').kind).toBe('ok')
  })
})

describe('a reading that falls between steps', () => {
  it('names both neighbours, written the way a reading is', () => {
    expect(checkStep('49.72', '0.05')).toEqual({ kind: 'off', below: '49.70', above: '49.75' })
  })

  it('does not decide which way it should have gone', () => {
    // 0.031 sits nearer 0.025 than 0.050, and this still offers both: which the
    // instrument actually showed is the one thing the person typing knows.
    expect(checkStep('0.031', '0.025')).toEqual({ kind: 'off', below: '0.025', above: '0.050' })
  })

  it('catches what a decimal count would have let through', () => {
    // Three decimals either way, so counting digits calls 0.031 valid on a 0.025 step.
    expect(checkStep('0.031', '0.001').kind).toBe('ok')
    expect(checkStep('0.031', '0.025').kind).toBe('off')
  })

  it('works on coarse steps, where whole numbers are not enough', () => {
    expect(checkStep('52', '5')).toEqual({ kind: 'off', below: '50', above: '55' })
    expect(checkStep('23', '10')).toEqual({ kind: 'off', below: '20', above: '30' })
  })

  it('goes the right way for a negative reading', () => {
    expect(checkStep('-0.031', '0.025')).toEqual({ kind: 'off', below: '-0.050', above: '-0.025' })
  })
})

describe('what cannot be judged', () => {
  it('says so rather than passing or failing it', () => {
    for (const [reading, step] of [
      ['49.72', null], ['49.72', ''], ['49.72', 'NA'], ['49.72', '0'], ['49.72', '-0.05'],
      [null, '0.05'], ['', '0.05'], ['abc', '0.05'],
    ] as const) {
      expect(checkStep(reading, step).kind, `${reading} / ${step}`).toBe('unknown')
    }
  })
})

describe('what the reader is told', () => {
  it('names the value, the step, and both valid readings', () => {
    expect(stepWarning('49.72', '0.05'))
      .toBe('49.72 is not a multiple of 0.05. Nearest valid readings: 49.70 or 49.75.')
  })

  it('says nothing when there is nothing to say', () => {
    expect(stepWarning('49.70', '0.05')).toBeNull()
    expect(stepWarning('49.72', null)).toBeNull()
  })
})
