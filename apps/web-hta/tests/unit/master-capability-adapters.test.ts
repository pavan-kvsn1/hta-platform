/**
 * The two capability questions the master selection asks, answered from the registry.
 *
 * These replace checks that read the old flat range list. They stay permissive in the
 * same places it was - an instrument with nothing recorded is offered rather than
 * hidden - because hiding an instrument the lab owns is worse than offering one whose
 * capability is unknown.
 */
import { describe, it, expect } from 'vitest'
import { unitCanMeasure, unitCoversRange } from '@/lib/master-instrument-capability'
import type { RegistryUnit } from '@/lib/master-instrument-registry'
import registryData from '@/data/master-instrument-registry.json'
import type { MasterInstrumentRegistry } from '@/lib/master-instrument-registry'

const registry = registryData as unknown as MasterInstrumentRegistry
const units = registry.assets.flatMap((a) => a.units)

function unit(profiles: RegistryUnit['capability_profiles']): RegistryUnit {
  return { capability_profiles: profiles } as RegistryUnit
}

describe('unitCanMeasure', () => {
  const pressure = unit([
    { id: 'P1', parameter: 'Pressure', role: 'measuring', unit: 'bar', min: 0, max: 700 },
  ] as never)

  it('matches the parameter it records', () => {
    expect(unitCanMeasure(pressure, 'Pressure')).toBe(true)
  })

  it('matches regardless of case, as the old check did', () => {
    expect(unitCanMeasure(pressure, 'pressure')).toBe(true)
  })

  it('rejects a parameter it does not record', () => {
    expect(unitCanMeasure(pressure, 'Temperature')).toBe(false)
  })

  it('allows an instrument with nothing recorded', () => {
    // Three assets still have no profiles; hiding them would remove instruments the
    // lab actually uses.
    expect(unitCanMeasure(unit([]), 'Temperature')).toBe(true)
  })

  it('allows anything when no parameter has been chosen yet', () => {
    expect(unitCanMeasure(pressure, '')).toBe(true)
  })
})

describe('unitCoversRange', () => {
  const gauge = unit([
    { id: 'P1', parameter: 'Pressure', role: 'measuring', unit: 'bar', min: 0, max: 700 },
  ] as never)

  it('covers a span inside its own', () => {
    expect(unitCoversRange(gauge, 'Pressure', 0, 100)).toBe(true)
    expect(unitCoversRange(gauge, 'Pressure', 0, 700)).toBe(true)
  })

  it('does not cover a span reaching beyond it', () => {
    expect(unitCoversRange(gauge, 'Pressure', 0, 900)).toBe(false)
    expect(unitCoversRange(gauge, 'Pressure', -10, 100)).toBe(false)
  })

  it('takes the widest span a subtype offers', () => {
    // A thermocouple calibrator's overall range is the union of its types, and the
    // type is chosen separately.
    const couple = unit([
      {
        id: 'P1',
        parameter: 'Thermocouple',
        role: 'source',
        unit: '°C',
        min: 0,
        max: 100,
        subtypes: [{ id: 'Type K', min: -200, max: 1370 }],
      },
    ] as never)
    expect(unitCoversRange(couple, 'Thermocouple', -200, 1370)).toBe(true)
  })

  it('allows a parameter it does not record, leaving that to canMeasure', () => {
    expect(unitCoversRange(gauge, 'Temperature', 0, 10)).toBe(true)
  })

  it('allows a profile with no span recorded rather than failing it', () => {
    const open = unit([
      { id: 'P1', parameter: 'Pressure', role: 'measuring', unit: 'bar', min: null, max: null },
    ] as never)
    expect(unitCoversRange(open, 'Pressure', 0, 900)).toBe(true)
  })
})

describe('against the real registry', () => {
  it('finds instruments for a parameter the lab records', () => {
    const able = units.filter((u) => u.capability_profiles.length > 0 && unitCanMeasure(u, 'Pressure'))
    expect(able.length).toBeGreaterThan(0)
  })

  it('never throws on any instrument in the registry', () => {
    for (const u of units) {
      expect(() => unitCanMeasure(u, 'Temperature')).not.toThrow()
      expect(() => unitCoversRange(u, 'Temperature', 0, 100)).not.toThrow()
    }
  })
})
