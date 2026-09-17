/**
 * Where a master instrument's capabilities come from.
 *
 * The app used to carry a copy of the lab's register compiled into it, and the
 * database's answer was written over the top of that copy. Nothing is bundled now: the
 * register is built from the two endpoints that answer for it, so a capability is what
 * the database says it is, and a master the database says nothing about has none.
 *
 * Everything downstream - the add flow, the comparison, the eligibility rules, the
 * snapshot a certificate keeps - reads `unit.capability_profiles`, so that is what
 * these check reaches.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { useMasterInstrumentStore } from '@/lib/stores/master-instrument-store'
import type { MasterInstrument } from '@/lib/master/instruments'
import type { CapabilityProfile } from '@/lib/master/registry'

/** Two instruments, as the list endpoint hands them over. */
const ROWS = [
  {
    id: 717,
    type: 'Thermal',
    instrument_desc: 'Digital RTD Thermometer',
    make: 'Delta Ohm',
    model: 'HD 2107.1',
    asset_no: '717 HTAIPL/L',
    instrument_sl_no: '17013097',
    sop_references: [],
  },
  {
    id: 1017,
    type: 'Electro-Technical',
    instrument_desc: 'Universal Calibrator',
    make: 'Masibus',
    model: 'UC 12',
    asset_no: '1017 HTAIPL/L',
    instrument_sl_no: '166280021',
    sop_references: [],
  },
] as unknown as MasterInstrument[]

const TORQUE: CapabilityProfile[] = [
  {
    id: 'P1',
    parameter: 'Torque',
    role: 'measure',
    kind: 'continuous',
    unit: 'N.m',
    min: 0,
    max: 10,
    buckets: [
      { id: 'B1', min: 0, max: 10, accuracy: { type: 'symmetric', value: 0.05, unit: 'N.m' } },
    ],
  },
] as unknown as CapabilityProfile[]

const respond = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body })

/** The store as a successful list request leaves it, with no capabilities yet. */
const withInstruments = () => {
  useMasterInstrumentStore.setState({ capabilitySource: 'none' })
  useMasterInstrumentStore.getState().rebuildRegistry(ROWS, {})
}

const unit = (legacyId: number) => useMasterInstrumentStore.getState().getUnitByLegacyId(legacyId)

describe('where a master instrument capability comes from', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    withInstruments()
  })

  it('has none at all until the database answers', () => {
    // Nothing stands in for them. A bundled copy used to, and an instrument edited on
    // the admin pages was not in it.
    expect(unit(717)!.capability_profiles).toEqual([])
    expect(useMasterInstrumentStore.getState().capabilitySource).toBe('none')
  })

  it('reads what the database says', async () => {
    apiFetch.mockResolvedValue(respond({ capabilities: { '717': TORQUE }, unreachable: 0 }))

    await useMasterInstrumentStore.getState().loadCapabilities()

    const profiles = unit(717)!.capability_profiles
    expect(profiles).toHaveLength(1)
    expect(profiles[0].parameter).toBe('Torque')
    expect(useMasterInstrumentStore.getState().capabilitySource).toBe('api')
  })

  it('reaches every reader, not just the store getter', async () => {
    // getCapabilityProfiles has no callers outside the store - the app reads the unit
    // object directly. If the two ever disagreed the app would be on the stale side,
    // so they are the same object, not two copies kept in step.
    apiFetch.mockResolvedValue(respond({ capabilities: { '717': TORQUE }, unreachable: 0 }))
    await useMasterInstrumentStore.getState().loadCapabilities()

    const viaGetter = useMasterInstrumentStore.getState().getCapabilityProfiles(717)
    expect(viaGetter).toBe(unit(717)!.capability_profiles)
  })

  it('takes silence about a master as none recorded', () => {
    // A capability deleted on the admin pages has to actually disappear, or the flow
    // keeps offering a master for work it can no longer do.
    useMasterInstrumentStore.getState().rebuildRegistry(ROWS, { '717': TORQUE })
    expect(unit(1017)!.capability_profiles).toEqual([])
  })

  it('leaves the instruments listed when the capabilities request fails', async () => {
    /**
     * The two are separate requests and separate failures.
     *
     * An engineer can still see which instruments the lab has and that none of them
     * can be rated, which is true and actionable. Filling the gap from a bundled copy
     * would have shown figures instead, with nothing to say they were a build old.
     */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    apiFetch.mockResolvedValue(respond(null, false, 503))

    await useMasterInstrumentStore.getState().loadCapabilities()

    expect(unit(717)).toBeDefined()
    expect(unit(717)!.capability_profiles).toEqual([])
    expect(useMasterInstrumentStore.getState().capabilitySource).toBe('none')
    warn.mockRestore()
  })

  it('asks once, however many screens ask it to', async () => {
    apiFetch.mockResolvedValue(respond({ capabilities: {}, unreachable: 0 }))

    await Promise.all([
      useMasterInstrumentStore.getState().loadCapabilities(),
      useMasterInstrumentStore.getState().loadCapabilities(),
    ])
    await useMasterInstrumentStore.getState().loadCapabilities()

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledWith('/api/instruments/capabilities')
  })
})
