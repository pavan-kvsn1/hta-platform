/**
 * Whether a master can serve a parameter, decided by what each measures.
 *
 * These five all matched before, because the rule could only see the name and the unit
 * - and for the cases that matter the units are identical: DC and AC are both volts,
 * temperature and thermocouple both °C.
 */
import { describe, it, expect } from 'vitest'
import { matchesParameter } from '@/lib/master-instrument-capability'
import { classificationOf, type CalibrationParameter } from '@/lib/parameter-mapping'

const standard = (
  standardName: string,
  measures: string,
  kind: string,
  units: string[],
): CalibrationParameter => ({
  id: standardName,
  standardName,
  customName: standardName,
  category: 'x',
  measures,
  kind,
  units,
  defaultUnit: units[0] ?? null,
  subtypes: [],
  aliases: [],
  source: 'registry',
  active: true,
})

// As seeded, for the parameters in question.
const LAB: CalibrationParameter[] = [
  standard('Temperature', 'temperature', 'any', ['°C']),
  standard('Thermocouple', 'temperature', 'thermocouple', ['°C']),
  standard('RTD', 'temperature', 'rtd', ['°C']),
  standard('DC Voltage', 'voltage', 'dc', ['V']),
  standard('AC Voltage', 'voltage', 'ac', ['V']),
  standard('Pressure', 'pressure', 'any', ['bar']),
  standard('Gauge Pressure', 'pressure', 'gauge', ['bar g']),
  standard('Vacuum', 'pressure', 'absolute', ['bar']),
  standard('Length', 'length', 'any', ['mm']),
  standard('Flatness', 'flatness', 'any', ['µm']),
  standard('Force (Tension)', 'force', 'tension', ['kgf']),
  standard('Force (Compression)', 'force', 'compression', ['kgf']),
]

const classify = (name: string) => classificationOf(name, LAB)
const offers = (capability: string, capUnit: string, param: string, paramUnit: string) =>
  matchesParameter({ parameter: capability, unit: capUnit }, param, paramUnit, classify)

describe('the five that used to match and should not', () => {
  it('does not offer an AC source for a DC parameter', () => {
    expect(offers('AC Voltage', 'V', 'DC Voltage', 'V')).toBe(false)
  })

  it('does not offer a thermocouple for an RTD parameter', () => {
    expect(offers('Thermocouple', '°C', 'RTD', '°C')).toBe(false)
  })

  it('does not offer a gauge instrument for a vacuum parameter', () => {
    expect(offers('Gauge Pressure', 'bar g', 'Vacuum', 'bar')).toBe(false)
  })

  it('does not offer a flatness master for a length parameter', () => {
    expect(offers('Flatness', 'µm', 'Length', 'mm')).toBe(false)
  })

  it('does not offer a tension-only cell for a compression parameter', () => {
    expect(offers('Force (Tension)', 'kgf', 'Force (Compression)', 'kgf')).toBe(false)
  })
})

describe('what must keep matching', () => {
  it('offers a thermocouple for a plain temperature parameter', () => {
    // The certificate does not record the input type, so the engineer declares it.
    expect(offers('Thermocouple', '°C', 'Temperature', '°C')).toBe(true)
    expect(offers('RTD', '°C', 'Temperature', '°C')).toBe(true)
  })

  it('offers a vacuum gauge for a plain pressure parameter', () => {
    expect(offers('Vacuum', 'bar', 'Pressure', 'bar')).toBe(true)
  })

  it('offers the same capability to itself', () => {
    expect(offers('DC Voltage', 'V', 'DC Voltage', 'V')).toBe(true)
  })
})

describe('a lab that renames a parameter', () => {
  const renamed: CalibrationParameter[] = LAB.map((p) =>
    p.standardName === 'DC Voltage' ? { ...p, customName: 'Volts DC' } : p,
  )
  const renamedClassify = (name: string) => classificationOf(name, renamed)

  it('changes nothing about what matches', () => {
    // The certificate now says "Volts DC"; the registry still says "DC Voltage".
    expect(
      matchesParameter({ parameter: 'DC Voltage', unit: 'V' }, 'Volts DC', 'V', renamedClassify),
    ).toBe(true)
    expect(
      matchesParameter({ parameter: 'AC Voltage', unit: 'V' }, 'Volts DC', 'V', renamedClassify),
    ).toBe(false)
  })
})

describe('a name the store does not know', () => {
  it('falls back to the older rule rather than refusing', () => {
    // New master data arriving before anyone has classified it must still be findable.
    expect(offers('Something New', '°C', 'Temperature', '°C')).toBe(true)
  })

  it('still keeps out a capability measuring something else entirely', () => {
    expect(offers('Sound Pressure Level', 'dB', 'Pressure', 'bar')).toBe(false)
  })
})

describe('with no store at all', () => {
  it('behaves exactly as before, so a failed fetch costs nothing', () => {
    expect(matchesParameter({ parameter: 'Temperature', unit: '°C' }, 'Temperature', '°C')).toBe(true)
  })
})
