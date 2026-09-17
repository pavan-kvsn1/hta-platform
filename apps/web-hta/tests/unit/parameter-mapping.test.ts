/**
 * Moving between the name an engineer reads and the name masters are recorded against.
 *
 * The cases are this lab's own: certificates written as "Voltage DC" where the registry
 * says "DC Voltage", a lab that renames "RTD" to "Platinum RTD", and parameters typed
 * onto certificates before any list existed.
 */
import { describe, it, expect } from 'vitest'
import {
  defaultKindFor,
  defaultUnitForParameter,
  kindsFor,
  measurandsOf,
  standardFor,
  findParameter,
  groupByCategory,
  toCustomName,
  toStandardName,
  unitsForParameter,
  type CalibrationParameter,
} from '@/lib/parameters/mapping'

const parameter = (over: Partial<CalibrationParameter>): CalibrationParameter => ({
  id: 'p1',
  standardName: 'RTD',
  customName: 'RTD',
  category: 'Temperature',
  measures: 'temperature',
  kind: 'any',
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


  it('takes the lab list where it has one', () => {
    expect(unitsForParameter('Platinum RTD', undefined, LIST)).toEqual(['°C'])
  })

  it('finds them through an alias, for a certificate written the old way', () => {
    expect(unitsForParameter('Voltage DC', undefined, LIST)).toEqual(['V', 'mV'])
  })

  it('offers nothing at all before the register answers', () => {
    // Deliberate. A table of units used to sit behind this, compiled into the form and
    // used until the lab's own register replied. It was written before units could be
    // registered on the admin pages, so it lacked the ones added since and kept ones
    // since removed - and it answered silently, so an engineer was choosing from a
    // list the lab no longer keeps with nothing on screen to say so.
    expect(unitsForParameter('Temperature', undefined, [])).toEqual([])
  })

  it('keeps the unit already saved for a parameter nobody recognises', () => {
    // It is the only record of what was measured.
    expect(unitsForParameter('Blancmange', 'blob', LIST)).toEqual(['blob'])
  })

  it('offers nothing where there is nothing to offer', () => {
    expect(unitsForParameter('Blancmange', undefined, LIST)).toEqual([])
  })

  it('keeps the saved unit where the register lists none against the parameter', () => {
    // The register can name a parameter and record no units for it. What is on the
    // certificate is then the only record of what was measured.
    const emptyUnits = [{ ...LIST[0], customName: 'Temperature', units: [] }]
    expect(unitsForParameter('Temperature', '°C', emptyUnits)).toEqual(['°C'])
    expect(unitsForParameter('Temperature', undefined, emptyUnits)).toEqual([])
  })
})

describe('the unit chosen with a parameter', () => {

  it('is the lab default where it set one', () => {
    expect(defaultUnitForParameter('Platinum RTD', LIST)).toBe('°C')
  })

  it('has no default before the register answers', () => {
    // The same removal: a default taken from a table the lab does not keep is a guess
    // wearing the register's authority.
    expect(defaultUnitForParameter('Temperature', [])).toBe('')
  })

  it('is empty rather than a guess when nothing says', () => {
    expect(defaultUnitForParameter('Blancmange', LIST)).toBe('')
  })
})

describe('asking what is measured before asking which kind', () => {
  // As seeded: temperature is one thing measured three ways, voltage has no plain
  // entry at all, pressure has four.
  const SEEDED: CalibrationParameter[] = [
    parameter({ id: 't', standardName: 'Temperature', customName: 'Temperature', measures: 'temperature', kind: 'any', subtypes: [] }),
    parameter({ id: 'tc', standardName: 'Thermocouple', customName: 'Thermocouple', measures: 'temperature', kind: 'thermocouple', subtypes: ['Type K', 'Type J'] }),
    parameter({ id: 'rtd', standardName: 'RTD', customName: 'Platinum RTD', measures: 'temperature', kind: 'rtd', subtypes: ['Pt-100'] }),
    parameter({ id: 'dcv', standardName: 'DC Voltage', customName: 'DC Voltage', measures: 'voltage', kind: 'dc', category: 'Electrical' }),
    parameter({ id: 'acv', standardName: 'AC Voltage', customName: 'AC Voltage', measures: 'voltage', kind: 'ac', category: 'Electrical' }),
    parameter({ id: 'ph', standardName: 'pH', customName: 'pH', measures: 'ph', kind: 'any', category: 'Other' }),
  ]

  it('collapses the near-twins into one thing measured', () => {
    // Six parameters, three things measured.
    expect(measurandsOf(SEEDED).map((m) => m.measures)).toEqual(['temperature', 'voltage', 'ph'])
  })

  it('names it after the parameter that names it outright', () => {
    expect(measurandsOf(SEEDED)[0].label).toBe('Temperature')
  })

  it('falls back to the key where no parameter names it', () => {
    // There is no plain "Voltage" - only DC and AC.
    expect(measurandsOf(SEEDED)[1].label).toBe('Voltage')
  })

  it('offers every kind of the chosen measurand', () => {
    expect(kindsFor('temperature', SEEDED).map((p) => p.kind)).toEqual([
      'any', 'thermocouple', 'rtd',
    ])
  })

  it('leaves nothing to ask where a measurand has one kind', () => {
    // The caller shows no second question, as the master declaration does not.
    expect(kindsFor('ph', SEEDED)).toHaveLength(1)
  })

  it('resolves a measurand and kind to what the certificate stores', () => {
    expect(standardFor('temperature', 'rtd', SEEDED)?.standardName).toBe('RTD')
    expect(standardFor('voltage', 'ac', SEEDED)?.standardName).toBe('AC Voltage')
  })

  it('is null for a pair nothing offers', () => {
    expect(standardFor('temperature', 'gauge', SEEDED)).toBeNull()
  })

  it('starts on the kind that claims nothing', () => {
    // Choosing temperature must not silently record a thermocouple because it sorts
    // first.
    expect(defaultKindFor('temperature', SEEDED)?.standardName).toBe('Temperature')
  })

  it('starts on the first where none claims nothing', () => {
    // Voltage is only ever DC or AC; one of them has to be the starting point.
    expect(defaultKindFor('voltage', SEEDED)?.standardName).toBe('DC Voltage')
  })

  it('carries the curves of the chosen kind', () => {
    expect(standardFor('temperature', 'rtd', SEEDED)?.subtypes).toEqual(['Pt-100'])
    expect(standardFor('temperature', 'any', SEEDED)?.subtypes).toEqual([])
  })
})

describe('grouping a list that is not the lab’s parameters', () => {
  /**
   * The master mapping groups the capabilities its instruments actually record, not
   * everything the lab can name - offering a parameter no master has would lead to an
   * empty list. Those entries carry only what the store knew about them, so the
   * grouping has to work on the smaller shape.
   */
  const capabilities = [
    { standardName: 'Voltage DC', customName: 'DC Voltage', category: 'Electrical', measures: 'voltage', kind: 'dc' },
    { standardName: 'Voltage AC', customName: 'AC Voltage', category: 'Electrical', measures: 'voltage', kind: 'ac' },
    { standardName: 'Temperature', customName: 'Temperature', category: 'Temperature', measures: 'temperature', kind: 'any' },
  ]

  it('groups capabilities the same way it groups parameters', () => {
    expect(measurandsOf(capabilities).map((m) => m.measures)).toEqual(['voltage', 'temperature'])
  })

  it('names a group after the capability that names no kind', () => {
    expect(measurandsOf(capabilities)[1].label).toBe('Temperature')
  })

  it('falls back to the key where every capability names a kind', () => {
    expect(measurandsOf(capabilities)[0].label).toBe('Voltage')
  })

  it('leaves a capability the store does not know as a group of its own', () => {
    // measures falls back to the standard name, so nothing is silently folded in.
    const unknown = [
      ...capabilities,
      { standardName: 'Blancmange', customName: 'Blancmange', category: '', measures: 'blancmange', kind: 'any' },
    ]
    expect(measurandsOf(unknown).map((m) => m.measures)).toContain('blancmange')
  })
})
