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

describe('capabilities the engineer could not tell apart', () => {
  /**
   * Two profiles of one unit answering every question the declaration asks the same way.
   *
   * The panel asks for the capability, the role, and - where the registry knows it -
   * which part or which mode. Two profiles agreeing on all of those put the same choice
   * on screen twice, which is what 717 HTAIPL/L did: an indicator and a probe both
   * reading "Temperature / measuring". A profile recording nothing is left out; it can
   * share those answers with a real one without being a second choice, since the panel
   * always prefers the one with figures.
   */
  const indistinguishable = shipped.assets.flatMap((asset) =>
    asset.units.flatMap((unit) => {
      const seen = new Map<string, number>()
      for (const p of unit.capability_profiles ?? []) {
        if (!(p.subtypes ?? []).length && !p.buckets.length) continue
        const key = [p.parameter, p.role, p.component ?? '', p.mode ?? ''].join(' / ')
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
      return [...seen]
        .filter(([, n]) => n > 1)
        .map(([key, n]) => `${asset.asset_no} unit ${unit.id}: ${key} x${n}`)
    }),
  )

  it('are not in the shipped registry', () => {
    expect(indistinguishable).toEqual([])
  })

  it('keeps a two-part thermometer as its certificate states it', () => {
    /**
     * A readout and a probe are certified separately, and 717 HTAIPL/L's certificate
     * gives each its own figure: "Indicator Accuracy: ±0.01 °C, Sensor Accuracy:
     * ±0.25 °C (upto 300 °C), above ±0.5 °C". Both stay. Combining them into a single
     * number is the calibrating lab's call - some certificates print one - and not a
     * figure to derive here and ship as though it had been certified.
     */
    const parts = shipped.assets
      .flatMap((a) => a.units.flatMap((u) => u.capability_profiles ?? []))
      .filter((p) => p.component)
    expect(parts.length).toBeGreaterThan(0)
    expect(new Set(parts.map((p) => p.component))).toEqual(new Set(['indicator', 'sensor']))
  })

  it('carries the figures the certificate gives, unaltered', () => {
    const profiles = shipped.assets
      .find((a) => a.asset_no.startsWith('717'))!
      .units[0].capability_profiles.filter((p) => p.parameter === 'Temperature')
    const sensor = profiles.find((p) => p.component === 'sensor')!
    const indicator = profiles.find((p) => p.component === 'indicator')!
    expect(indicator.buckets[0].accuracy).toMatchObject({ value: 0.01 })
    expect(sensor.buckets.map((b) => (b.accuracy as { value: number }).value)).toEqual([0.25, 0.5])
  })

  it('folded the thermocouple simulations onto one capability with its curves', () => {
    // 849 and 850 each listed six identical "Thermocouple / source" capabilities,
    // because the map's forceSubtype was written and never read.
    const unit = shipped.assets
      .find((a) => a.asset_no.startsWith('849'))!
      .units[0].capability_profiles.filter((p) => p.parameter === 'Thermocouple')
    expect(unit).toHaveLength(1)
    expect(unit[0].subtypes?.map((s) => s.id)).toEqual(
      expect.arrayContaining(['Type J', 'Type K', 'Type T']),
    )
  })
})
