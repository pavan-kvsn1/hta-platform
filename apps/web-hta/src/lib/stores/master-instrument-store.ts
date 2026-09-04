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
} from '@/lib/master-instruments'

import registryData from '@/data/master-instrument-registry.json'
import { projectLegacyInstrument } from '@/lib/master-instrument-projection'
import {
  allUnits,
  type CapabilityProfile,
  type MasterInstrumentRegistry,
  type RegistryUnit,
} from '@/lib/master-instrument-registry'

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
  loadFromRegistry: () => void
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
  // It is bundled rather than fetched: it is generated at build time from the lab's
  // master list and certificates, so there is nothing to load and no failure mode.
  registry: MasterInstrumentRegistry
  /** Every unit across every asset, flattened. */
  getRegistryUnits: () => RegistryUnit[]
  /** The unit a certificate's masterInstrumentId refers to. */
  getUnitByLegacyId: (legacyId: number) => RegistryUnit | undefined
  getUnitByAssetNo: (assetNo: string) => RegistryUnit | undefined
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

export const useMasterInstrumentStore = create<MasterInstrumentStore>((set, get) => ({
  instruments: [],
  isLoaded: false,
  isLoading: false,
  error: null,
  lastUpdated: null,
  dataSource: null,
  selectedCategory: null,
  searchQuery: '',
  registry: registryData as unknown as MasterInstrumentRegistry,

  loadInstruments: async () => {
    const { isLoaded, isLoading } = get()

    // Prevent duplicate loading
    if (isLoaded || isLoading) return

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
        const enrichedInstruments = (data as MasterInstrument[]).map(enrichInstrument)
        set({
          instruments: enrichedInstruments,
          isLoaded: true,
          isLoading: false,
          lastUpdated: new Date(),
          dataSource: 'api',
        })
        return
      }

      // If API returned empty, fall back to JSON
      throw new Error('API returned empty data')
    } catch (error) {
      console.warn('Failed to load instruments from API, using JSON fallback:', error)
      // Fall back to JSON data
      get().loadFromRegistry()
    }
  },

  /**
   * Build the instrument list from the registry.
   *
   * The API remains the first source because the admin pages edit those records; this
   * is what runs when it is unreachable or empty. It used to read
   * data/master-instruments.json, which the registry has replaced - identity and status
   * project from it exactly, verified across all 209 instruments, and it carries the
   * capability profiles the old file could not express.
   */
  loadFromRegistry: () => {
    const registry = get().registry
    const projected = registry.assets.flatMap((asset) =>
      asset.units.map((unit) => projectLegacyInstrument(asset, unit) as MasterInstrument),
    )

    // Status is recomputed here rather than taken from the projection. The registry
    // records calibration_state as it stood when the file was generated, and a due
    // date does not stop moving after a build - one instrument had already changed
    // category a day later. Only the status is recomputed; enrichInstrument is still
    // avoided because it also reads the flat range list the projection does not carry.
    const withStatus = projected.map((instrument) => {
      const { status, daysUntilExpiry } = calculateInstrumentStatus(instrument)
      return { ...instrument, status, daysUntilExpiry }
    })

    set({
      instruments: withStatus,
      isLoaded: true,
      isLoading: false,
      lastUpdated: new Date(),
      dataSource: 'registry',
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

// Initialize store on module load
if (typeof window !== 'undefined') {
  // Client-side: the registry is bundled, so it renders immediately; the API then
  // refreshes it in the background with whatever the admin pages have edited.
  useMasterInstrumentStore.getState().loadFromRegistry()

  // Then attempt to refresh from API (non-blocking)
  setTimeout(() => {
    apiFetch('/api/instruments')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const enrichedInstruments: MasterInstrument[] = data.map(enrichInstrument)
          useMasterInstrumentStore.setState({
            instruments: enrichedInstruments,
            lastUpdated: new Date(),
            dataSource: 'api',
          })
        }
      })
      .catch(() => {
        // Silently fail - JSON data is already loaded
      })
  }, 100)
}
