import { apiFetch } from '@/lib/api-client'
import { create } from 'zustand'
import {
  MasterInstrument,
  InstrumentCategory,
  InstrumentStatus,
  calculateInstrumentStatus,
  enrichInstrument,
  canMeasureParameter,
  getSimpleValue,
  getParameterGroupsForCategory,
  filterByParameterGroup,
  getSopReferences,
} from '@/lib/master/instruments'

import {
  allUnits,
  type CapabilityProfile,
  type MasterInstrumentRegistry,
  type RegistryUnit,
} from '@/lib/master/registry'

interface MasterInstrumentStore {
  // Data
  instruments: MasterInstrument[]
  isLoaded: boolean
  isLoading: boolean
  error: string | null
  lastUpdated: Date | null
  dataSource: 'registry' | 'api' | null

  // Filters
  selectedCategory: InstrumentCategory | null
  searchQuery: string

  // Actions
  loadInstruments: () => Promise<void>
  /**
   * The rows the register is built from, kept because either half can arrive first.
   *
   * The list and the capabilities are two requests and neither waits for the other, so
   * whichever lands rebuilds out of both - and a slow capabilities call means
   * instruments with no capabilities rather than no instruments.
   */
  instrumentRows: MasterInstrument[]
  capabilityRows: Record<string, CapabilityProfile[]>
  rebuildRegistry: (
    rows?: MasterInstrument[],
    capabilities?: Record<string, CapabilityProfile[]>,
  ) => void
  setSelectedCategory: (category: InstrumentCategory | null) => void
  setSearchQuery: (query: string) => void

  // Getters
  getInstrumentsByCategory: (category: InstrumentCategory) => MasterInstrument[]
  getInstrumentById: (id: number) => MasterInstrument | undefined
  getInstrumentByAssetNo: (assetNo: string) => MasterInstrument | undefined
  getFilteredInstruments: () => MasterInstrument[]
  getInstrumentsForParameter: (parameterType: string) => MasterInstrument[]
  getValidInstrumentsForParameter: (parameterType: string) => MasterInstrument[]
  getCategories: () => InstrumentCategory[]
  getMakes: (category?: InstrumentCategory) => string[]
  getModels: (category?: InstrumentCategory, make?: string) => string[]

  // NEW: Parameter group getters
  getParameterGroups: (category: InstrumentCategory) => string[]
  getInstrumentsByParameterGroup: (category: InstrumentCategory, parameterGroup?: string) => MasterInstrument[]
  getSopReferencesForInstrument: (instrument: MasterInstrument) => string[]
  getDescriptions: (category: InstrumentCategory, parameterGroup?: string) => string[]


  // --- Registry (Phase 2) -------------------------------------------------------
  //
  // The registry is the new source of capability data: per-parameter profiles with
  // range buckets carrying their own least count and accuracy. It is addressed by the
  // same legacy id a saved certificate already holds in masterInstrumentId, so the two
  // views describe the same instruments and nothing has to be re-keyed.
  //
  // The identity half of it - assets, units, asset numbers, legacy ids - is bundled,
  // generated at build time from the lab's master list. The capability half is not:
  // it is loaded from the database, over the top of the bundled copy, so an
  // instrument edited on the admin pages changes what a certificate will accept
  // without a rebuild. When that request fails the bundled capabilities stand, which
  // makes an outage mean stale figures rather than an instrument that can do nothing.
  registry: MasterInstrumentRegistry
  /** Whether the capabilities have arrived. Nothing stands in for them. */
  capabilitySource: 'none' | 'api'
  /**
   * Replace the bundled capabilities with the database's.
   *
   * Written over the registry rather than held beside it because every reader -
   * the add flow, the comparison, the eligibility rules, the snapshot a certificate
   * keeps - reads `unit.capability_profiles`. One seam here beats twenty call sites
   * each having to remember which source to ask.
   *
   * Never rejects: a failure leaves the bundled capabilities in place.
   */
  loadCapabilities: () => Promise<void>
  /** Every unit across every asset, flattened. */
  getRegistryUnits: () => RegistryUnit[]
  /** The unit a certificate's masterInstrumentId refers to. */
  getUnitByLegacyId: (legacyId: number) => RegistryUnit | undefined
  getUnitByAssetNo: (assetNo: string) => RegistryUnit | undefined
  /**
   * The registry unit behind an instrument in the list, by id or, failing that, by
   * asset number. The API's instrument rows do not all carry a legacy id - eight of
   * this lab's 209 do not - and an instrument that resolves to nothing reads on screen
   * as one with no capability recorded, which is a different and much worse claim.
   */
  getUnitForInstrument: (instrument: { id: number; asset_no?: string }) => RegistryUnit | undefined
  /** Capability profiles for one selected master, empty when it has none recorded. */
  getCapabilityProfiles: (legacyId: number) => CapabilityProfile[]
  /** Standard parameter names this master can measure or source. */
  getRegistryParameters: (legacyId: number) => string[]

  // Stats
  getStats: () => {
    total: number
    byCategory: Record<InstrumentCategory, number>
    byStatus: Record<InstrumentStatus, number>
    expired: number
    expiringSoon: number
  }
}

/**
 * The register, built from the two endpoints that answer for it.
 *
 * It used to be read from a 1.3 MB file compiled into the app. That file was generated
 * from the lab's master list at build time, so it went stale the moment an instrument
 * was edited on the admin pages - and while it stood behind the API as a fallback, an
 * outage did not mean stale figures but wrong ones, with nothing on screen to say
 * which an engineer was looking at.
 *
 * One asset per instrument and one unit on each. The file grouped several units under
 * a shared asset number - 580 HTAIPL/L holds three - and nothing reads that grouping;
 * every lookup is by legacy id or by asset number, and both still answer.
 */
function unitsFromApi(
  rows: MasterInstrument[],
  capabilities: Record<string, CapabilityProfile[]>,
): MasterInstrumentRegistry {
  const assets = rows.map((row) => {
    const parts = row as unknown as {
      make_parts?: { ind?: string; sen?: string }
      model_parts?: { ind?: string; sen?: string }
      serial_parts?: { ind?: string; sen?: string }
    }
    const unit = {
      id: '1',
      legacy_id: row.id,
      instrument_desc: row.instrument_desc ?? null,
      // Two models or two serials mean a readout and a probe, which is what composite
      // means here - not several instruments sharing one asset number.
      asset_type: parts.model_parts || parts.serial_parts ? 'composite' : 'simple',
      make: row.make ?? null,
      make_parts: parts.make_parts ?? null,
      model: row.model ?? null,
      model_parts: parts.model_parts ?? null,
      serial_no: row.instrument_sl_no ?? null,
      serial_parts: parts.serial_parts ?? null,
      category: row.type ?? null,
      usage: row.usage ?? null,
      calibrated_at: row.calibrated_at ?? null,
      report_no: row.report_no ?? null,
      next_due_on: row.next_due_on ?? null,
      // Recomputed from the due date wherever it is wanted, because a state recorded
      // at build time went on saying "valid" after the date it was valid until.
      calibration_state: null,
      calibration_days: null,
      sop_references: row.sop_references ?? [],
      capability_profiles: capabilities[String(row.id)] ?? [],
    }
    return {
      id: String(row.id),
      asset_no: row.asset_no ?? '',
      unit_count: 1,
      units: [unit],
    }
  })

  return { assets } as unknown as MasterInstrumentRegistry
}

/** Guards the capabilities request only, so it is not store state to subscribe to. */
let capabilitiesInFlight = false

export const useMasterInstrumentStore = create<MasterInstrumentStore>((set, get) => ({
  instruments: [],
  isLoaded: false,
  isLoading: false,
  error: null,
  lastUpdated: null,
  dataSource: null,
  selectedCategory: null,
  searchQuery: '',
  instrumentRows: [],
  capabilityRows: {},
  /**
   * Starts empty and is filled from the database.
   *
   * It used to start as a 1.3 MB file compiled into the app, kept as what the section
   * would run on if the API could not be reached. That was worth having while the
   * database held a copy of the file; it stopped being worth having once the database
   * became the record - an instrument edited on the admin pages was then absent from
   * the copy, so an outage did not mean stale figures, it meant wrong ones, and
   * nothing on screen said which the engineer was looking at.
   */
  registry: { assets: [] } as unknown as MasterInstrumentRegistry,
  capabilitySource: 'none',

  loadInstruments: async () => {
    // The list and the capabilities are two requests and two separate failures: the
    // list can come from the database while the capabilities fall back to the bundled
    // file, or the other way round. Started ahead of the guard below, because the store
    // loads from the bundled registry at module load - isLoaded is already true by the
    // time a screen asks, so anything behind the guard would never run.
    const capabilities = get().loadCapabilities()

    const { isLoaded, isLoading } = get()

    // Prevent duplicate loading
    if (isLoaded || isLoading) {
      await capabilities
      return
    }

    set({ isLoading: true, error: null })

    try {
      // Try to fetch from API first
      const response = await apiFetch('/api/instruments')

      if (!response.ok) {
        throw new Error('API request failed')
      }

      const data = await response.json()

      // Check if we got an array (API returns array) vs error object
      if (Array.isArray(data) && data.length > 0) {
        await capabilities
        const rows = data as MasterInstrument[]
        set({
          instruments: rows.map(enrichInstrument),
          isLoaded: true,
          isLoading: false,
          lastUpdated: new Date(),
          dataSource: 'api',
        })
        get().rebuildRegistry(rows)
        return
      }

      throw new Error('API returned empty data')
    } catch (error) {
      /**
       * No fallback.
       *
       * There was one - a 1.3 MB copy of the master list compiled into the app - and
       * it was removed on purpose. It was generated at build time, so an instrument
       * edited on the admin pages was not in it; standing behind the API it turned an
       * outage into a screen of confident, wrong figures with nothing to say so. An
       * empty section and an error is the honest answer to not being able to reach
       * the record.
       */
      console.error('Could not load master instruments:', error)
      set({
        instruments: [],
        isLoaded: true,
        isLoading: false,
        error: 'Could not load the master instrument list. Check your connection and reload.',
        dataSource: null,
      })
    }
  },

  /**
   * Hold the rows the register is built from, so either half can arrive first.
   *
   * The list and the capabilities are two requests and neither waits for the other.
   * Whichever lands rebuilds the register out of both, using whatever the other has
   * supplied so far - so a slow capabilities call gives instruments with no
   * capabilities rather than no instruments at all.
   */
  rebuildRegistry: (rows, capabilities) => {
    const next = rows ?? get().instrumentRows
    const caps = capabilities ?? get().capabilityRows
    set({
      instrumentRows: next,
      capabilityRows: caps,
      registry: unitsFromApi(next, caps),
    })
  },

  setSelectedCategory: (category) => {
    set({ selectedCategory: category })
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
  },

  getInstrumentsByCategory: (category) => {
    const { instruments } = get()
    return instruments.filter(inst => inst.type === category)
  },

  getInstrumentById: (id) => {
    const { instruments } = get()
    return instruments.find(inst => inst.id === id)
  },

  getInstrumentByAssetNo: (assetNo) => {
    const { instruments } = get()
    return instruments.find(inst => inst.asset_no === assetNo)
  },

  getFilteredInstruments: () => {
    const { instruments, selectedCategory, searchQuery } = get()
    let filtered = instruments

    if (selectedCategory) {
      filtered = filtered.filter(inst => inst.type === selectedCategory)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(inst =>
        inst.instrument_desc.toLowerCase().includes(query) ||
        inst.asset_no.toLowerCase().includes(query) ||
        getSimpleValue(inst.make).toLowerCase().includes(query) ||
        getSimpleValue(inst.model).toLowerCase().includes(query) ||
        (typeof inst.instrument_sl_no === 'string' &&
          inst.instrument_sl_no.toLowerCase().includes(query))
      )
    }

    return filtered
  },

  getInstrumentsForParameter: (parameterType) => {
    const { instruments } = get()
    return instruments.filter(inst => canMeasureParameter(inst, parameterType))
  },

  getValidInstrumentsForParameter: (parameterType) => {
    const { instruments } = get()
    return instruments.filter(inst =>
      canMeasureParameter(inst, parameterType) &&
      inst.status !== 'EXPIRED'
    )
  },

  getCategories: () => {
    const { instruments } = get()
    const categories = new Set<InstrumentCategory>()
    instruments.forEach(inst => categories.add(inst.type))
    return Array.from(categories)
  },

  getMakes: (category) => {
    const { instruments } = get()
    const makes = new Set<string>()
    let filtered = instruments

    if (category) {
      filtered = filtered.filter(inst => inst.type === category)
    }

    filtered.forEach(inst => {
      const make = getSimpleValue(inst.make)
      if (make) makes.add(make)
    })

    return Array.from(makes).sort()
  },

  getModels: (category, make) => {
    const { instruments } = get()
    const models = new Set<string>()
    let filtered = instruments

    if (category) {
      filtered = filtered.filter(inst => inst.type === category)
    }

    if (make) {
      filtered = filtered.filter(inst => getSimpleValue(inst.make) === make)
    }

    filtered.forEach(inst => {
      const model = getSimpleValue(inst.model)
      if (model) models.add(model)
    })

    return Array.from(models).sort()
  },

  // NEW: Parameter group getters
  getParameterGroups: (category) => {
    const { instruments } = get()
    return getParameterGroupsForCategory(instruments, category)
  },

  getInstrumentsByParameterGroup: (category, parameterGroup) => {
    const { instruments } = get()
    return filterByParameterGroup(instruments, category, parameterGroup)
  },

  getSopReferencesForInstrument: (instrument) => {
    return getSopReferences(instrument)
  },

  getDescriptions: (category, parameterGroup) => {
    const { instruments } = get()
    const descriptions = new Set<string>()

    const filtered = filterByParameterGroup(instruments, category, parameterGroup)

    filtered.forEach(inst => {
      if (inst.instrument_desc) {
        descriptions.add(inst.instrument_desc)
      }
    })

    return Array.from(descriptions).sort()
  },

  // --- Registry (Phase 2) -------------------------------------------------------

  loadCapabilities: async () => {
    if (get().capabilitySource === 'api' || capabilitiesInFlight) return
    capabilitiesInFlight = true

    try {
      const response = await apiFetch('/api/instruments/capabilities')
      if (!response.ok) throw new Error(`capabilities: HTTP ${response.status}`)

      const payload = (await response.json()) as {
        capabilities?: Record<string, CapabilityProfile[]>
        unreachable?: number
      }
      /**
       * A master the response does not mention has no capabilities recorded.
       *
       * There is nothing else it could mean now. While a copy of the register was
       * bundled into the app, silence was ambiguous - it might have meant the database
       * had none, or that the database's copy could not be addressed - and the bundled
       * ones were kept rather than guessed over. With nothing bundled, the database is
       * the only thing that answers, and its silence is an answer.
       */
      get().rebuildRegistry(undefined, payload.capabilities ?? {})
      set({ capabilitySource: 'api' })
    } catch (error) {
      // Deliberately not an error state. Every screen still works on the bundled
      // capabilities; what it loses is edits made since the last build.
      console.warn('Capabilities stay as bundled; the database did not answer:', error)
    } finally {
      capabilitiesInFlight = false
    }
  },

  getRegistryUnits: () => allUnits(get().registry),

  getUnitByLegacyId: (legacyId) =>
    allUnits(get().registry).find((unit) => unit.legacy_id === legacyId),

  getUnitByAssetNo: (assetNo) => {
    // Asset numbers are printed with varying spacing ("935HTAIPL/L" against
    // "935 HTAIPL/L"), so match on the number rather than the printed string.
    const wanted = assetNo.replace(/\s+/g, '').toUpperCase()
    for (const asset of get().registry.assets) {
      if (asset.asset_no.replace(/\s+/g, '').toUpperCase() === wanted) {
        return asset.units[0]
      }
    }
    return undefined
  },

  getUnitForInstrument: (instrument) => {
    const byId = get().getUnitByLegacyId(instrument.id)
    if (byId || !instrument.asset_no) return byId

    // An asset number names an asset, not a unit, and an asset can hold several -
    // 580 HTAIPL/L holds three, only one of which records Temperature. Falling back to
    // the first would hand the other two a capability they do not have, which is the
    // same false claim as reporting none at all, pointing the other way. So the
    // fallback only answers where the asset is unambiguous.
    const wanted = instrument.asset_no.replace(/\s+/g, '').toUpperCase()
    const asset = get().registry.assets.find(
      (a) => a.asset_no.replace(/\s+/g, '').toUpperCase() === wanted,
    )
    return asset && asset.units.length === 1 ? asset.units[0] : undefined
  },

  getCapabilityProfiles: (legacyId) =>
    get().getUnitByLegacyId(legacyId)?.capability_profiles ?? [],

  getRegistryParameters: (legacyId) => {
    const seen = new Set<string>()
    for (const profile of get().getCapabilityProfiles(legacyId)) {
      seen.add(profile.parameter)
    }
    return Array.from(seen).sort()
  },

  getStats: () => {
    const { instruments } = get()

    const byCategory: Record<InstrumentCategory, number> = {
      'Electro-Technical': 0,
      'Thermal': 0,
      'Mechanical': 0,
      'Dimensions': 0,
      'Others': 0,
      'Source': 0,
    }

    const byStatus: Record<InstrumentStatus, number> = {
      'VALID': 0,
      'EXPIRING_SOON': 0,
      'EXPIRED': 0,
      'UNDER_RECAL': 0,
      'SERVICE_PENDING': 0,
    }

    let expired = 0
    let expiringSoon = 0

    instruments.forEach(inst => {
      byCategory[inst.type] = (byCategory[inst.type] || 0) + 1

      if (inst.status) {
        byStatus[inst.status] = (byStatus[inst.status] || 0) + 1

        if (inst.status === 'EXPIRED') expired++
        if (inst.status === 'EXPIRING_SOON') expiringSoon++
      }
    })

    return {
      total: instruments.length,
      byCategory,
      byStatus,
      expired,
      expiringSoon,
    }
  },
}))

/**
 * Fetch on module load, so the section is populated by the time anyone scrolls to it.
 *
 * It used to render the bundled file first and refresh from the API behind it. With
 * nothing bundled there is nothing to render first, and the two requests here are the
 * only ones: loadInstruments starts the capabilities itself and both are guarded
 * against a second caller, so a screen mounting afterwards joins this rather than
 * repeating it.
 */
if (typeof window !== 'undefined') {
  setTimeout(() => {
    void useMasterInstrumentStore.getState().loadInstruments()
  }, 100)
}
