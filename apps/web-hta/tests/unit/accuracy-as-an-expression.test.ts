/**
 * An accuracy can be stated as arithmetic, and evaluated by the parser the
 * certificate's result columns already use.
 *
 * The three parsed fields hold one percentage and one digits term. That covers most of
 * the register and not all of it: 755 HTAIPL/L states "+/-(330ppm + 1% rdg)", which
 * needs a constant, and 674 HTAIPL/L states "+/-(3% of reading + 0.3% FS)", which needs
 * two percentages on two different bases. Neither fits, and inventing a fourth and
 * fifth column for them would only defer the next shape.
 *
 * Nothing writes an expression yet, so these are the contract for when it does.
 */
import { describe, expect, it } from 'vitest'

import { resolveAccuracy } from '@/lib/master/capability'
import { isComparable, type Accuracy } from '@/lib/master/registry'

const formula = (over: Partial<Accuracy & { type: 'formula' }> = {}): Accuracy => ({
  type: 'formula',
  expression: '',
  evaluable: null,
  percent_of: null,
  percent_value: null,
  digits: null,
  digits_unit: null,
  polarity: '±',
  ...over,
})

describe('an accuracy stated as arithmetic', () => {
  it('works out a constant plus a percentage of the reading', () => {
    // 755 HTAIPL/L, the Sense Air CO2 transmitter: +/-(330ppm + 1% rdg).
    const accuracy = formula({
      expression: '+/-(330ppm + 1% rdg)',
      evaluable: '330 + 0.01 * {reading}',
    })
    expect(resolveAccuracy(accuracy, { reading: 4000 })?.value).toBeCloseTo(370, 9)
    expect(resolveAccuracy(accuracy, { reading: 25000 })?.value).toBeCloseTo(580, 9)
  })

  it('works out two percentages on two different bases', () => {
    // 674 HTAIPL/L, the Testo 6441: +/-(3% of reading + 0.3% FS), 0.25 to 75.
    const accuracy = formula({
      expression: '+/-(3% of reading + 0.3% FS)',
      evaluable: '0.03 * {reading} + 0.003 * {full scale}',
    })
    expect(resolveAccuracy(accuracy, { reading: 75, fullScale: 75 })?.value).toBeCloseTo(2.475, 9)
    expect(resolveAccuracy(accuracy, { reading: 10, fullScale: 75 })?.value).toBeCloseTo(0.525, 9)
  })

  it('reads the least count by name, so a digits term needs no special case', () => {
    const accuracy = formula({
      expression: '+/-(0.05% rdg + 1d)',
      evaluable: '0.0005 * {reading} + 1 * {least count}',
    })
    expect(resolveAccuracy(accuracy, { reading: 1000, leastCount: 0.1 })?.value).toBeCloseTo(0.6, 9)
  })

  it('states the Delta Ohm thermocouple exactly as its datasheet does', () => {
    // 430A HTAIPL/L: "+/-(0.004 x t)". Nothing could parse that into a percentage and
    // a digits term - and as arithmetic it is simply itself.
    const accuracy = formula({
      expression: '+/-(0.004 x t)',
      evaluable: '0.004 * {reading}',
    })
    expect(resolveAccuracy(accuracy, { reading: 1000 })?.value).toBeCloseTo(4, 9)
    expect(resolveAccuracy(accuracy, { reading: 600 })?.value).toBeCloseTo(2.4, 9)
  })

  it('wins over the parsed fields, because it is the more exact statement', () => {
    const accuracy = formula({
      evaluable: '0.5',
      percent_of: 'reading',
      percent_value: 0.9, // deliberately different; must not be what comes out
    })
    expect(resolveAccuracy(accuracy, { reading: 100 })?.value).toBe(0.5)
  })

  it('falls back to the parsed fields when there is no expression', () => {
    const accuracy = formula({ evaluable: null, percent_of: 'reading', percent_value: 0.01 })
    expect(resolveAccuracy(accuracy, { reading: 100 })?.value).toBeCloseTo(1, 9)
  })

  it('gives no answer rather than a wrong one when a name has no value behind it', () => {
    const accuracy = formula({ evaluable: '0.003 * {full scale}' })
    expect(resolveAccuracy(accuracy, { reading: 10 })).toBeNull()
  })

  it('gives no answer for arithmetic it cannot work out', () => {
    for (const bad of ['0.01 * {reading', '0.01 * * {reading}', '1 / 0', '{nonsense}']) {
      expect(resolveAccuracy(formula({ evaluable: bad }), { reading: 10 })).toBeNull()
    }
  })

  it('counts as comparable on the strength of the expression alone', () => {
    expect(isComparable(formula({ evaluable: '0.004 * {reading}' }))).toBe(true)
    expect(isComparable(formula({ evaluable: null }))).toBe(false)
  })
})

describe('an accuracy that is not the same either side', () => {
  const asym = (upper: number | null, lower: number | null): Accuracy => ({
    type: 'asymmetric',
    upper,
    lower,
    unit: 'mm',
  })

  it('answers with the worse of the two bounds', () => {
    // The API has emitted this shape since the asymmetric fields were added; nothing on
    // this side had a case for it, so it resolved to null and the master read as
    // unrated. Taking the smaller bound would flatter the instrument.
    expect(resolveAccuracy(asym(0.5, -0.2), { reading: 10 })).toEqual({ value: 0.5, unit: 'mm' })
    expect(resolveAccuracy(asym(0.2, -0.5), { reading: 10 })).toEqual({ value: 0.5, unit: 'mm' })
  })

  it('uses whichever side is recorded when only one is', () => {
    expect(resolveAccuracy(asym(0.3, null), { reading: 10 })?.value).toBe(0.3)
    expect(resolveAccuracy(asym(null, -0.4), { reading: 10 })?.value).toBe(0.4)
  })

  it('gives no answer when neither side is recorded', () => {
    expect(resolveAccuracy(asym(null, null), { reading: 10 })).toBeNull()
    expect(isComparable(asym(null, null))).toBe(false)
  })
})
