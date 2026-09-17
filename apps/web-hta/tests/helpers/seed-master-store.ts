/**
 * Fill the master instrument store the way the app fills it, without a network.
 *
 * The app used to carry a 1.3 MB copy of the lab's master list compiled into it, read
 * at start-up and left standing behind the API as a fallback. That has been removed:
 * it was generated at build time, so an instrument edited on the admin pages was not
 * in it, and behind the API it turned an outage into a screen of confident, wrong
 * figures with nothing on screen to say which an engineer was looking at.
 *
 * The file itself is still here, as what it always really was - a fixture. These tests
 * want a realistic register and cannot make a request for one, so they seed the store
 * from it directly. What changed is that the application no longer ships it.
 */
import registryData from '@/data/master-instrument-registry.json'
import { useMasterInstrumentStore } from '@/lib/stores/master-instrument-store'
import { projectLegacyInstrument } from '@/lib/master/projection'
import {
  calculateInstrumentStatus,
  type MasterInstrument,
} from '@/lib/master/instruments'
import type { CapabilityProfile, MasterInstrumentRegistry } from '@/lib/master/registry'

const registry = registryData as unknown as MasterInstrumentRegistry

/**
 * Seed the store as a successful pair of requests would leave it.
 *
 * The instruments are projected from the register exactly as the endpoint's rows would
 * be, and the capabilities are handed over separately - which is how the app receives
 * them, and so the shape these tests should be written against.
 */
export function seedMasterStore(): void {
  const instruments = registry.assets.flatMap((asset) =>
    asset.units.map((unit) => {
      const projected = projectLegacyInstrument(asset, unit) as MasterInstrument
      // Status is recomputed rather than taken from the file: the file records the
      // calibration state as it stood when it was generated, and a due date does not
      // stop moving after a build.
      const { status, daysUntilExpiry } = calculateInstrumentStatus(projected)
      return { ...projected, status, daysUntilExpiry }
    }),
  )

  const capabilities: Record<string, CapabilityProfile[]> = {}
  for (const asset of registry.assets) {
    for (const unit of asset.units) {
      if (unit.capability_profiles?.length) {
        capabilities[String(unit.legacy_id)] = unit.capability_profiles
      }
    }
  }

  useMasterInstrumentStore.setState({
    instruments,
    isLoaded: true,
    isLoading: false,
    error: null,
    lastUpdated: new Date(),
    dataSource: 'api',
    capabilitySource: 'api',
  })
  useMasterInstrumentStore.getState().rebuildRegistry(
    instruments as unknown as MasterInstrument[],
    capabilities,
  )
}

/** The register itself, for tests that measure it rather than the store. */
export { registry as masterRegistryFixture }
