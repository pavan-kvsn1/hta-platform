import { apiFetch } from '@/lib/api-client'
import { create } from 'zustand'
import {
  MasterInstrument,
  InstrumentCategory,
  InstrumentStatus,
  enrichInstrument,
  canMeasureParameter,
  getSimpleValue,
  getParameterGroupsForCategory,
  filterByParameterGroup,
  getSopReferences,
} from '@/lib/master-instruments'

// Import the JSON data as fallback
import masterListData from '@/data/master-instruments.json'

interface MasterInstrumentStore {
  // Data
  instruments: MasterInstrument[]
  isLoaded: boolean
  isLoading: boolean
  error: string | null
  lastUpdated: Date | null
  dataSource: 'json' | 'api' | null

  // Filters
  selectedCategory: InstrumentCategory | null
  searchQuery: string

  // Actions
  loadInstruments: () => Promise<void>
  loadFromJson: () => void
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
      get().loadFromJson()
    }
  },

  loadFromJson: () => {
    // Enrich all instruments with computed fields
    const enrichedInstruments = (masterListData as MasterInstrument[]).map(enrichInstrument)

    set({
      instruments: enrichedInstruments,
      isLoaded: true,
      isLoading: false,
      lastUpdated: new Date(),
      dataSource: 'json',
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
  // Client-side: load instruments asynchronously
  // Use JSON first for immediate availability, then try API
  useMasterInstrumentStore.getState().loadFromJson()

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
