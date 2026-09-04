/**
 * Naming a certificate's parameters.
 *
 * Certificate 5eed80c6 calibrates Temperature twice, which is how the instrument list
 * came to say it was rated against "Temperature and Temperature".
 */
import { describe, it, expect } from 'vitest'
import { listOf, parameterLabel, parameterLabels } from '@/lib/parameter-labels'

const p = (parameterName: string, rangeMin?: string, rangeMax?: string, parameterUnit = '°C') => ({
  parameterName,
  parameterUnit,
  rangeMin,
  rangeMax,
})

describe('listOf', () => {
  it('reads as a person would write it', () => {
    expect(listOf(['Flow'])).toBe('Flow')
    expect(listOf(['Pressure', 'Flow'])).toBe('Pressure and Flow')
    expect(listOf(['Temperature', 'Pressure', 'Flow'])).toBe('Temperature, Pressure and Flow')
    expect(listOf(['A', 'B', 'C', 'D'])).toBe('A, B, C and D')
  })

  it('is empty for nothing', () => {
    expect(listOf([])).toBe('')
  })
})

describe('telling two of the same parameter apart', () => {
  it('leaves distinct names alone', () => {
    // Adding a range to every name where none is needed is noise.
    expect(parameterLabels([p('Temperature', '-20', '60'), p('Pressure', '0', '3000', 'Pa')]))
      .toEqual(['Temperature', 'Pressure'])
  })

  it('adds the range only to the ones that repeat', () => {
    expect(
      parameterLabels([
        p('Temperature', '-20', '60'),
        p('Pressure', '0', '3000', 'Pa'),
        p('Temperature', '10', '100'),
      ]),
    ).toEqual(['Temperature (-20 to 60 °C)', 'Pressure', 'Temperature (10 to 100 °C)'])
  })

  it('falls back to the bare name when there is no range to tell them apart', () => {
    expect(parameterLabels([p('Temperature'), p('Temperature')])).toEqual([
      'Temperature',
      'Temperature',
    ])
  })

  it('names an unnamed parameter by its position', () => {
    expect(parameterLabels([p(''), p('Flow', '0', '10')])).toEqual(['Parameter 1', 'Flow'])
  })

  it('omits a unit that is not set', () => {
    expect(parameterLabels([p('Temperature', '-20', '60', ''), p('Temperature', '10', '100', '')]))
      .toEqual(['Temperature (-20 to 60)', 'Temperature (10 to 100)'])
  })
})

describe('one parameter, told apart from its siblings', () => {
  it('is labelled in the context of the whole certificate', () => {
    const all = [p('Temperature', '-20', '60'), p('Temperature', '10', '100')]
    expect(parameterLabel(all[1], all)).toBe('Temperature (10 to 100 °C)')
  })

  it('falls back to the bare name for a parameter not on the list', () => {
    expect(parameterLabel(p('Flow', '0', '10'), [p('Temperature', '-20', '60')])).toBe('Flow')
  })
})
