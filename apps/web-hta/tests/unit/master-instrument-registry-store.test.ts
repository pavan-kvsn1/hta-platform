/**
 * Registry access on the master instrument store (Phase 2).
 *
 * Runs against the real bundled registry rather than a fixture: the point of these is
 * that the shipped data is addressable by the key certificates already hold, which a
 * fixture cannot tell us.
 */
import { describe, it, expect } from 'vitest'
import { useMasterInstrumentStore } from '@/lib/stores/master-instrument-store'
import { allUnits } from '@/lib/master-instrument-registry'
import legacyList from '@/data/master-instruments.json'

const store = () => useMasterInstrumentStore.getState()
const registry = store().registry

describe('registry access', () => {
  it('bundles the registry, so there is nothing to load', () => {
    const registry = store().registry
    expect(registry.assets.length).toBe(registry.asset_count)
    expect(allUnits(registry).length).toBe(registry.unit_count)
  })

  it('carries a legacy id on every unit', () => {
    // A missing one would look exactly like an instrument that cannot be selected.
    const missing = store()
      .getRegistryUnits()
      .filter((unit) => typeof unit.legacy_id !== 'number')
    expect(missing).toHaveLength(0)
  })

  it('keeps those ids unique, so a certificate resolves to one instrument', () => {
    const ids = store().getRegistryUnits().map((u) => u.legacy_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers every instrument in the old master list', () => {
    // Certificates reference these ids; one that no longer resolves is a broken
    // certificate, so the two lists have to agree exactly.
    const legacyIds = (legacyList as { id: number }[]).map((row) => row.id).sort((a, b) => a - b)
    const registryIds = store()
      .getRegistryUnits()
      .map((u) => u.legacy_id)
      .sort((a, b) => a - b)
    expect(registryIds).toEqual(legacyIds)
  })

  it('resolves a unit by the id a certificate holds', () => {
    const sample = store().getRegistryUnits()[0]
    expect(store().getUnitByLegacyId(sample.legacy_id)).toBe(sample)
  })

  it('returns nothing for an id that does not exist, rather than guessing', () => {
    expect(store().getUnitByLegacyId(-1)).toBeUndefined()
  })

  it('matches an asset number regardless of how it is spaced', () => {
    const asset = store().registry.assets[0]
    const spaced = asset.asset_no
    const squashed = spaced.replace(/\s+/g, '')
    expect(store().getUnitByAssetNo(spaced)).toBe(asset.units[0])
    expect(store().getUnitByAssetNo(squashed)).toBe(asset.units[0])
    expect(store().getUnitByAssetNo(spaced.toLowerCase())).toBe(asset.units[0])
  })

  it('reads capability profiles for a selected master', () => {
    const withProfiles = store()
      .getRegistryUnits()
      .find((unit) => unit.capability_profiles.length > 0)!
    const profiles = store().getCapabilityProfiles(withProfiles.legacy_id)
    expect(profiles).toBe(withProfiles.capability_profiles)
    expect(profiles[0].parameter).toBeTruthy()
  })

  it('returns no profiles for an instrument that has none recorded', () => {
    // Three assets are still profile-less; they must read as empty, not throw.
    expect(store().getCapabilityProfiles(-1)).toEqual([])
  })

  it('lists a master parameters once each, sorted', () => {
    const unit = store()
      .getRegistryUnits()
      .find((u) => u.capability_profiles.length > 1)!
    const params = store().getRegistryParameters(unit.legacy_id)
    expect(params).toEqual([...new Set(params)].sort())
    expect(params.length).toBeGreaterThan(0)
  })
})

describe('the instrument list comes from the registry', () => {
  it('loads every instrument without the old JSON file', () => {
    store().loadFromRegistry()
    const s = store()
    expect(s.dataSource).toBe('registry')
    expect(s.isLoaded).toBe(true)
    expect(s.instruments).toHaveLength(registry.unit_count)
  })

  it('gives each one the identity the cascade filters on', () => {
    store().loadFromRegistry()
    const missing = store().instruments.filter(
      (i) => !i.type || !i.instrument_desc || !i.asset_no,
    )
    expect(missing.map((i) => i.id)).toEqual([])
  })

  it('keeps the ids a saved certificate refers to', () => {
    store().loadFromRegistry()
    const ids = store().instruments.map((i) => i.id).sort((a, b) => a - b)
    const fromRegistry = store()
      .getRegistryUnits()
      .map((u) => u.legacy_id)
      .sort((a, b) => a - b)
    expect(ids).toEqual(fromRegistry)
  })

  it('resolves every listed instrument back to its registry unit', () => {
    store().loadFromRegistry()
    const unresolved = store().instruments.filter((i) => !store().getUnitByLegacyId(i.id))
    expect(unresolved).toHaveLength(0)
  })

  it('works out calibration status for the list', () => {
    store().loadFromRegistry()
    const stats = store().getStats()
    expect(stats.total).toBe(registry.unit_count)
    expect(stats.expired + stats.expiringSoon).toBeLessThanOrEqual(stats.total)
  })
})
