/**
 * Deriving the parameters a lab can calibrate.
 *
 * Run against the real registry as well as fixtures: the point of the seed is that the
 * shipped master data produces a usable list, which a fixture cannot tell us.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  deriveParameterStandards,
  resolveStandardName,
  type RegistryLike,
} from '../src/calibration-parameters'

const registry = JSON.parse(
  readFileSync(
    join(__dirname, '../../../apps/web-hta/src/data/master-instrument-registry.json'),
    'utf8',
  ),
) as RegistryLike

const standards = deriveParameterStandards(registry)
const byName = (name: string) => standards.find((s) => s.standardName === name)

describe('what the registry records', () => {
  it('produces every parameter it names', () => {
    // 47 in the registry; the scope document said 41, which was close and not right.
    const fromRegistry = standards.filter((s) => s.source === 'registry')
    expect(fromRegistry).toHaveLength(47)
  })

  it('collects the units each one is recorded in', () => {
    expect(byName('Pressure')?.units).toEqual(['Pa', 'bar', 'hPa', 'mbar'])
    expect(byName('Temperature')?.units).toEqual(['°C'])
  })

  it('defaults to the unit most instruments actually use', () => {
    // Pressure is recorded 26 times in bar and 3 in Pa; bar is the better default.
    expect(byName('Pressure')?.defaultUnit).toBe('bar')
  })

  it('keeps the curves and types a capability records', () => {
    expect(byName('RTD')?.subtypes).toContain('Pt-100')
    expect(byName('RTD')?.subtypes).toContain('Cu-53')
    expect(byName('Thermocouple')?.subtypes).toContain('Type K')
  })

  it('files each one under a group an engineer would look in', () => {
    expect(byName('Thermocouple')?.category).toBe('Temperature')
    expect(byName('Vacuum')?.category).toBe('Pressure')
    expect(byName('DC Voltage')?.category).toBe('Electrical')
    // Named for pressure, measured in dB, and not a pressure instrument.
    expect(byName('Sound Pressure Level')?.category).toBe('Other')
  })
})

describe('what only the certificates know about', () => {
  it('keeps the parameters no master records', () => {
    // Certificates exist for pH and Inductance; the registry records neither. Dropping
    // them would leave those certificates naming a parameter the system denies.
    expect(byName('pH')?.source).toBe('certificates')
    expect(byName('Inductance')?.source).toBe('certificates')
  })

  it('marks them apart, so it is clear which have a master behind them', () => {
    expect(byName('Temperature')?.source).toBe('registry')
    expect(byName('Torque')?.source).toBe('certificates')
  })

  it('does not invent one the registry already covers', () => {
    // Force (Tension) and Force (Compression) are recorded; a bare "Force" is what
    // certificates say, and it is kept as its own entry rather than folded into either.
    expect(byName('Force (Tension)')?.source).toBe('registry')
    expect(byName('Force')?.source).toBe('certificates')
  })
})

describe('the names certificates already use', () => {
  it('points them at the registry name for the same quantity', () => {
    // Every electrical parameter is written the other way round on certificates, and
    // matching by name would fail on all of them.
    expect(byName('DC Voltage')?.aliases).toEqual(['Voltage DC'])
    expect(byName('AC Current')?.aliases).toEqual(['Current AC'])
    expect(byName('Relative Humidity')?.aliases).toEqual(['Humidity'])
    expect(byName('Light Intensity')?.aliases).toEqual(['Lux'])
    expect(byName('Sound Pressure Level')?.aliases).toEqual(['Sound Level'])
  })

  it('resolves a written name to its standard', () => {
    expect(resolveStandardName('Voltage DC', standards)).toBe('DC Voltage')
    expect(resolveStandardName('Humidity', standards)).toBe('Relative Humidity')
    expect(resolveStandardName('Temperature', standards)).toBe('Temperature')
  })

  it('does not care how it was capitalised or spaced', () => {
    expect(resolveStandardName('  voltage dc ', standards)).toBe('DC Voltage')
  })

  it('says nothing for a name it does not know', () => {
    // The caller leaves it as the engineer wrote it rather than guessing.
    expect(resolveStandardName('Blancmange', standards)).toBeNull()
    expect(resolveStandardName('   ', standards)).toBeNull()
  })

  it('leaves a name alone where folding it in would be a guess', () => {
    // "Speed" does not say whether it was contact or non-contact.
    expect(resolveStandardName('Speed', standards)).toBe('Speed')
    expect(byName('Speed (Contact)')?.aliases).toEqual([])
  })
})

describe('the list as a whole', () => {
  it('covers everything the old hardcoded dropdown offered', () => {
    // Nobody should lose a parameter they could pick yesterday.
    const hardcoded = [
      'Temperature', 'Humidity', 'Pressure', 'Voltage DC', 'Voltage AC', 'Current DC',
      'Current AC', 'Resistance', 'Frequency', 'Time', 'Mass', 'Force', 'Torque',
      'Length', 'Flow', 'Speed', 'Sound Level', 'Vibration', 'Conductivity', 'Lux',
      'pH', 'Capacitance', 'Inductance',
    ]
    const unresolved = hardcoded.filter((name) => resolveStandardName(name, standards) === null)
    expect(unresolved).toEqual([])
  })

  it('covers every parameter already saved on a certificate', () => {
    // Taken from the certificate database.
    const inUse = [
      'Temperature', 'Pressure', 'Flow', 'pH', 'Humidity', 'Mass', 'Speed',
      'Conductivity', 'Voltage DC', 'Inductance', 'Time',
    ]
    const unresolved = inUse.filter((name) => resolveStandardName(name, standards) === null)
    expect(unresolved).toEqual([])
  })

  it('names each parameter once', () => {
    const names = standards.map((s) => s.standardName)
    expect(new Set(names).size).toBe(names.length)
  })

  it('claims no alias twice, so a name resolves to one standard', () => {
    const aliases = standards.flatMap((s) => s.aliases.map((a) => a.toLowerCase()))
    expect(new Set(aliases).size).toBe(aliases.length)
  })

  it('does not let an alias collide with a standard name', () => {
    const names = new Set(standards.map((s) => s.standardName.toLowerCase()))
    const clashing = standards.flatMap((s) =>
      s.aliases.filter((a) => names.has(a.toLowerCase())),
    )
    expect(clashing).toEqual([])
  })
})

describe('an empty or broken registry', () => {
  it('still yields the parameters the certificates need', () => {
    const empty = deriveParameterStandards({ assets: [] })
    expect(empty.map((s) => s.standardName)).toContain('pH')
    expect(empty.every((s) => s.source === 'certificates')).toBe(true)
  })

  it('ignores a profile with no parameter name', () => {
    const odd = deriveParameterStandards({
      assets: [{ units: [{ capability_profiles: [{ parameter: '   ' }] }] }],
    })
    expect(odd.every((s) => s.standardName.trim() !== '')).toBe(true)
  })
})
