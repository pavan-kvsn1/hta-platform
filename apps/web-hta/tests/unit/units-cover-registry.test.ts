/**
 * Every unit the shipped registry actually records.
 *
 * Matching a capability to a parameter turns on the unit, so a unit this table does not
 * recognise quietly falls back to matching on the name - which is the behaviour the
 * table exists to replace. This runs against the real registry rather than a fixture,
 * so a unit arriving with new master data is reported here rather than discovered by an
 * engineer wondering where their instrument went.
 */
import { describe, it, expect } from 'vitest'
import { unitFamily } from '@/lib/units'
import registry from '@/data/master-instrument-registry.json'
import type { MasterInstrumentRegistry } from '@/lib/master-instrument-registry'

const shipped = registry as unknown as MasterInstrumentRegistry

/** Every distinct unit recorded against a capability, with how many record it. */
const recorded = (() => {
  const counts = new Map<string, number>()
  for (const asset of shipped.assets) {
    for (const unit of asset.units) {
      for (const profile of unit.capability_profiles ?? []) {
        if (!profile.unit) continue
        counts.set(profile.unit, (counts.get(profile.unit) ?? 0) + 1)
      }
    }
  }
  return counts
})()

/**
 * Units this lab records that no standard table places.
 *
 * Listed rather than ignored: each falls back to matching on the name, which is right
 * while nobody knows what quantity it is, and each is a question for whoever maintains
 * the registry. "%mc" is moisture content and "HD" is not a unit anyone here could name.
 */
const UNPLACEABLE = ['%mc', 'HD']

describe('the units this registry records', () => {
  it('places all but the ones we cannot', () => {
    const unplaced = [...recorded.keys()].filter((u) => unitFamily(u) === null)
    expect(unplaced.sort()).toEqual([...UNPLACEABLE].sort())
  })

  it('places the ones that carry most of the lab', () => {
    // The five commonest, which between them cover most calibrations here.
    expect(unitFamily('°C')).toBe('temperature')
    expect(unitFamily('V')).toBe('voltage')
    expect(unitFamily('bar')).toBe('pressure')
    expect(unitFamily('mA')).toBe('current')
    expect(unitFamily('Ω')).toBe('resistance')
  })

  it('places the awkward ones the registry writes by hand', () => {
    expect(unitFamily('bar g')).toBe('pressure')
    expect(unitFamily('m/s²')).toBe('acceleration')
    expect(unitFamily('µS/cm')).toBe('conductivity')
    expect(unitFamily('Nm3/hr')).toBe('standard flow')
    expect(unitFamily('m3/hr')).toBe('volumetric flow')
    expect(unitFamily('°')).toBe('angle')
  })

  it('covers more than a handful of quantities', () => {
    // Guards against the table quietly collapsing to the two parameters it was first
    // written for.
    const families = new Set(
      [...recorded.keys()].map((u) => unitFamily(u)).filter((f): f is string => f !== null),
    )
    expect(families.size).toBeGreaterThanOrEqual(15)
  })
})

describe('the units the certificates use', () => {
  // Taken from the certificate database: every unit a parameter has been saved with.
  const onCertificates = [
    '°C', 'bar', 'L/min', 'pH', '%RH', 'kg', 'Pa', 'RPM', 'mbar',
    'CFM', 'µS/cm', 'mV', 'V', 'mH', 'm³/h', 's', 'min',
  ]

  it('places every one of them', () => {
    const unplaced = onCertificates.filter((u) => unitFamily(u) === null)
    expect(unplaced).toEqual([])
  })

  it('agrees with the registry on the ones both use', () => {
    expect(unitFamily('m³/h')).toBe(unitFamily('m3/hr'))
    expect(unitFamily('mV')).toBe(unitFamily('V'))
    expect(unitFamily('Pa')).toBe(unitFamily('mbar'))
  })
})
