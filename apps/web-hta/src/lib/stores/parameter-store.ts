/**
 * The parameters this lab calibrates.
 *
 * Fetched once and kept, because every certificate form asks for the same list and it
 * changes only when a deploy reseeds it or an admin renames one. Concurrent callers
 * share a single request rather than each starting their own - the UUC section, the
 * master filtering and the results table all want it at the same moment on page load.
 *
 * A failure here is not fatal. The certificate form still works with whatever names
 * are already on the certificate; what is lost is the dropdown and the mapping to
 * master capabilities, so the store says plainly that it has nothing rather than
 * pretending to an empty list.
 */

import { create } from 'zustand'
import { apiFetch } from '@/lib/api-client'
import type { CalibrationParameter } from '@/lib/parameter-mapping'

interface ParameterState {
  parameters: CalibrationParameter[]
  isLoading: boolean
  isLoaded: boolean
  error: string | null

  load: () => Promise<void>
  /** Fetch again even if it has been loaded - after an admin renames one. */
  reload: () => Promise<void>
  /** Replace one in place, so a rename shows without a round trip. */
  replace: (parameter: CalibrationParameter) => void
}

/**
 * The request in flight, if any. Held outside the store so that several components
 * mounting together produce one fetch rather than one each.
 */
let inFlight: Promise<void> | null = null

export const useParameterStore = create<ParameterState>((set, get) => ({
  parameters: [],
  isLoading: false,
  isLoaded: false,
  error: null,

  load: async () => {
    if (get().isLoaded || get().isLoading) {
      // Wait on the request already running rather than starting a second.
      if (inFlight) await inFlight
      return
    }
    await get().reload()
  },

  reload: async () => {
    if (inFlight) {
      await inFlight
      return
    }

    set({ isLoading: true, error: null })
    inFlight = (async () => {
      try {
        const response = await apiFetch('/api/calibration-parameters')
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        const data = (await response.json()) as { parameters?: CalibrationParameter[] }
        set({
          parameters: data.parameters ?? [],
          isLoaded: true,
          isLoading: false,
          error: null,
        })
      } catch (error) {
        // Left unloaded on purpose: a later attempt should try again rather than
        // treat an empty list as the answer.
        set({
          isLoading: false,
          isLoaded: false,
          error: error instanceof Error ? error.message : 'Could not load parameters',
        })
      } finally {
        inFlight = null
      }
    })()

    await inFlight
  },

  replace: (parameter) =>
    set((state) => ({
      parameters: state.parameters.map((p) => (p.id === parameter.id ? parameter : p)),
    })),
}))

/** Reset between tests; the in-flight request is module state, not store state. */
export function resetParameterStore() {
  inFlight = null
  useParameterStore.setState({
    parameters: [],
    isLoading: false,
    isLoaded: false,
    error: null,
  })
}
