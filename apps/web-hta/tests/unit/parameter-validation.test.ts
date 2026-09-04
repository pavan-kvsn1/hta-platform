/**
 * Numbers typed into a parameter.
 *
 * The cases here are the lab's own: a Pressure range starting at the letter "O", a
 * Flow accuracy of "#", a Pressure least count of "NA". All three saved, and every
 * calculation downstream went blank without saying why.
 */
import { describe, it, expect } from 'vitest'
import { numberProblem, rangeProblem } from '@/lib/parameter-validation'

describe('numbers the certificate can compute with', () => {
  it('accepts the ones it can', () => {
    expect(numberProblem('0.1', 'least count')).toBeNull()
    expect(numberProblem('-100', 'range')).toBeNull()
    expect(numberProblem('3000', 'range')).toBeNull()
    expect(numberProblem('.5', 'accuracy')).toBeNull()
    expect(numberProblem('+2.75', 'range')).toBeNull()
  })

  it('accepts an accuracy written with its sign, which is not a mistake', () => {
    expect(numberProblem('± 0.5', 'accuracy')).toBeNull()
  })

  it('says nothing about a blank field', () => {
    // Still being filled in is not the same as filled in wrongly, and flagging every
    // empty field trains people to ignore the message.
    expect(numberProblem('', 'least count')).toBeNull()
    expect(numberProblem(undefined, 'accuracy')).toBeNull()
    expect(numberProblem('   ', 'range')).toBeNull()
  })
})

describe('what actually got typed', () => {
  it('catches the letter O standing in for zero, and says what was meant', () => {
    // A real Pressure parameter reads "O" to 10.
    expect(numberProblem('O', 'range')).toBe('Not a number - did you mean 0?')
    expect(numberProblem('1O0', 'range')).toBe('Not a number - did you mean 100?')
  })

  it('catches a lowercase l standing in for one', () => {
    expect(numberProblem('l.5', 'accuracy')).toBe('Not a number - did you mean 1.5?')
  })

  it('catches text where a number belongs', () => {
    // A real Pressure least count reads "NA".
    expect(numberProblem('NA', 'least count')).toBe('Not a number')
    expect(numberProblem('n/a', 'least count')).toBe('Not a number')
  })

  it('catches a stray character', () => {
    // A real Flow accuracy reads "#".
    expect(numberProblem('#', 'accuracy')).toBe('Not a number')
  })

  it('catches a number with something stuck to it', () => {
    // parseFloat would take "5" from this and carry on, which is how it slips through.
    expect(numberProblem('5 deg', 'range')).toBe('Not a number')
    expect(numberProblem('0.1mm', 'least count')).toBe('Not a number')
  })
})

describe('values that parse but cannot be used', () => {
  it('refuses a least count of zero, which claims infinite resolution', () => {
    expect(numberProblem('0', 'least count')).toBe('Least count must be greater than zero')
  })

  it('refuses a zero or negative accuracy, which divides into the ratio', () => {
    expect(numberProblem('0', 'accuracy')).toBe('Accuracy must be greater than zero')
    expect(numberProblem('-0.5', 'accuracy')).toBe('Accuracy must be greater than zero')
  })

  it('allows a negative range, since temperature goes below zero', () => {
    expect(numberProblem('-40', 'range')).toBeNull()
  })
})

describe('a range that reads the wrong way round', () => {
  it('catches max below min', () => {
    expect(rangeProblem('60', '-20')).toBe('Max must be greater than Min')
  })

  it('catches the two being equal, which spans nothing', () => {
    expect(rangeProblem('10', '10')).toBe('Max must be greater than Min')
  })

  it('accepts a range the right way round', () => {
    expect(rangeProblem('-20', '60')).toBeNull()
  })

  it('leaves it alone while either end is blank or not yet a number', () => {
    // The field's own message covers that; two complaints about one mistake is noise.
    expect(rangeProblem('', '60')).toBeNull()
    expect(rangeProblem('O', '10')).toBeNull()
  })
})
