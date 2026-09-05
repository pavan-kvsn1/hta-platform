/**
 * Moving between the name an engineer reads and the name masters are recorded against.
 *
 * The cases are this lab's own: certificates written as "Voltage DC" where the registry
 * says "DC Voltage", a lab that renames "RTD" to "Platinum RTD", and parameters typed
 * onto certificates before any list existed.
 */
import { describe, it, expect } from 'vitest'
import {
  defaultUnitForParameter,
  findParameter,
  groupByCategory,
  toCustomName,
  toStandardName,
  unitsForParameter,
  type CalibrationParameter,
} from '@/lib/parameter-mapping'

const parameter = (over: Partial<CalibrationParameter>): CalibrationParameter => ({
  id: 'p1',
  standardName: 'RTD',
  customName: 'RTD',
  category: 'Temperature',
  units: ['°C'],
  defaultUnit: '°C',
  subtypes: ['Pt-100'],
  aliases: [],
  source: 'registry',
  active: true,
  ...over,
})

const LIST: CalibrationParameter[] = [
  parameter({ id: 'rtd', standardName: 'RTD', customName: 'Platinum RTD' }),
  parameter({
    id: 'dcv',
    standardName: 'DC Voltage',
    customName: 'DC Voltage',
    category: 'Electrical',
    aliases: ['Voltage DC'],
    units: ['V', 'mV'],
    defaultUnit: 'V',
  }),
  parameter({
    id: 'rh',
    standardName: 'Relative Humidity',
    customName: 'Humidity (RH)',
    category: 'Humidity',
    aliases: ['Humidity'],
  }),
]

describe('to the name masters are recorded against', () => {
  it('takes the name this lab uses', () => {
    expect(toStandardName('Platinum RTD', LIST)).toBe('RTD')
  })

  it('takes the standard name itself', () => {
    expect(toStandardName('DC Voltage', LIST)).toBe('DC Voltage')
  })

  it('takes a name from an older certificate', () => {
    // Every electrical parameter is written the other way round on certificates.
    expect(toStandardName('Voltage DC', LIST)).toBe('DC Voltage')
    expect(toStandardName('Humidity', LIST)).toBe('Relative Humidity')
  })

  it('does not care how it was capitalised or spaced', () => {
    expect(toStandardName('  platinum rtd  ', LIST)).toBe('RTD')
  })

  it('leaves a name nobody claims exactly as written', () => {
    // A certificate that says Blancmange is a certificate about blancmange. Turning it
    // into something else would be worse than not knowing.
    expect(toStandardName('Blancmange', LIST)).toBe('Blancmange')
    expect(toStandardName('', LIST)).toBe('')
  })

  it('leaves everything alone when the list never loaded', () => {
    expect(toStandardName('Platinum RTD', [])).toBe('Platinum RTD')
  })
})

describe('back to the name an engineer reads', () => {
  it('finds the lab name for a standard', () => {
    expect(toCustomName('RTD', LIST)).toBe('Platinum RTD')
  })

  it('finds it through an alias too', () => {
    // A certificate holding the old name still displays as the lab names it now.
    expect(toCustomName('Humidity', LIST)).toBe('Humidity (RH)')
  })

  it('returns the standard unchanged where the lab has no name for it', () => {
    expect(toCustomName('Torque', LIST)).toBe('Torque')
  })
})

describe('the parameter behind a name', () => {
  it('is found by any of its names', () => {
    expect(findParameter('Platinum RTD', LIST)?.id).toBe('rtd')
    expect(findParameter('RTD', LIST)?.id).toBe('rtd')
    expect(findParameter('Voltage DC', LIST)?.id).toBe('dcv')
  })

  it('carries the units and subtypes the form needs', () => {
    expect(findParameter('Voltage DC', LIST)?.units).toEqual(['V', 'mV'])
    expect(findParameter('Platinum RTD', LIST)?.subtypes).toEqual(['Pt-100'])
  })

  it('is null rather than a guess when nothing claims the name', () => {
    expect(findParameter('Blancmange', LIST)).toBeNull()
    expect(findParameter('  ', LIST)).toBeNull()
  })
})

describe('grouping for a dropdown', () => {
  it('gathers them by what is being measured', () => {
    const groups = groupByCategory(LIST)
    expect(groups.map((g) => g.category)).toEqual(['Temperature', 'Electrical', 'Humidity'])
    expect(groups[0].parameters.map((p) => p.customName)).toEqual(['Platinum RTD'])
  })

  it('keeps the order it was given, which the API already sorted', () => {
    const groups = groupByCategory([LIST[1], LIST[0]])
    expect(groups.map((g) => g.category)).toEqual(['Electrical', 'Temperature'])
  })

  it('copes with nothing to group', () => {
    expect(groupByCategory([])).toEqual([])
  })
})

describe('the units on offer for a parameter', () => {
  // What the form shipped with, before any of this was fetched.
  const SHIPPED = {
    Temperature: { units: ['°C', '°F', 'K'], defaultUnit: '°C' },
    'Voltage DC': { units: ['V', 'mV'], defaultUnit: 'V' },
  }

  it('takes the lab list where it has one', () => {
    expect(unitsForParameter('Platinum RTD', undefined, LIST, SHIPPED)).toEqual(['°C'])
  })

  it('finds them through an alias, for a certificate written the old way', () => {
    expect(unitsForParameter('Voltage DC', undefined, LIST, SHIPPED)).toEqual(['V', 'mV'])
  })

  it('falls back to what the form shipped with, before the list arrives', () => {
    // A slow fetch must not cost an engineer the ability to fill in a certificate.
    expect(unitsForParameter('Temperature', undefined, [], SHIPPED)).toEqual(['°C', '°F', 'K'])
  })

  it('keeps the unit already saved for a parameter nobody recognises', () => {
    // It is the only record of what was measured.
    expect(unitsForParameter('Blancmange', 'blob', LIST, SHIPPED)).toEqual(['blob'])
  })

  it('offers nothing where there is nothing to offer', () => {
    expect(unitsForParameter('Blancmange', undefined, LIST, SHIPPED)).toEqual([])
  })

  it('does not let an empty lab list hide the shipped one', () => {
    const emptyUnits = [{ ...LIST[0], customName: 'Temperature', units: [] }]
    expect(unitsForParameter('Temperature', undefined, emptyUnits, SHIPPED)).toEqual([
      '°C', '°F', 'K',
    ])
  })
})

describe('the unit chosen with a parameter', () => {
  const SHIPPED = { Temperature: { defaultUnit: '°C' } }

  it('is the lab default where it set one', () => {
    expect(defaultUnitForParameter('Platinum RTD', LIST, SHIPPED)).toBe('°C')
  })

  it('falls back to the shipped default', () => {
    expect(defaultUnitForParameter('Temperature', [], SHIPPED)).toBe('°C')
  })

  it('is empty rather than a guess when nothing says', () => {
    expect(defaultUnitForParameter('Blancmange', LIST, SHIPPED)).toBe('')
  })
})
