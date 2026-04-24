import { create } from 'zustand'
import { apiFetch } from '@/lib/api-client'

// Accuracy calculation types
export type AccuracyType = 'PERCENT_READING' | 'ABSOLUTE' | 'PERCENT_SCALE'

export const ACCURACY_TYPE_CONFIG: Record<AccuracyType, { label: string; shortLabel: string; description: string }> = {
  'PERCENT_READING': {
    label: '% of Reading',
    shortLabel: '%Rdg',
    description: '± Margin of Error (%) against master instrument reading',
  },
  'ABSOLUTE': {
    label: 'Absolute',
    shortLabel: 'Abs',
    description: '± Absolute Margin of Error in measurement units',
  },
  'PERCENT_SCALE': {
    label: '% of Scale',
    shortLabel: '%Scale',
    description: '± Margin of Error (%) × total UUC range',
  },
}

// Bin for parameter calibration ranges
export interface ParameterBin {
  id: string
  binMin: string
  binMax: string
  leastCount: string
  accuracy: string
}

// Types for the certificate form
export interface Parameter {
  id: string
  parameterName: string
  parameterUnit: string
  rangeMin: string
  rangeMax: string
  rangeUnit: string
  // Single operating range (when not using bins)
  operatingMin: string
  operatingMax: string
  operatingUnit: string
  leastCountValue: string
  leastCountUnit: string
  accuracyValue: string
  accuracyUnit: string
  accuracyType: AccuracyType
  // Binning support
  requiresBinning: boolean
  bins: ParameterBin[]
  // Other fields
  errorFormula: string
  results: CalibrationResult[]
  showAfterAdjustment: boolean
  // Master instrument reference for this parameter
  masterInstrumentId: number | null
  // SOP reference for this parameter's calibration procedure
  sopReference: string
}

export interface CalibrationResult {
  id: string
  pointNumber: number
  standardReading: string
  beforeAdjustment: string
  afterAdjustment: string
  errorObserved: number | null
  isOutOfLimit: boolean
}

// Selected master instrument for the certificate (snapshot at time of selection)
export interface SelectedMasterInstrument {
  id: string
  masterInstrumentId: number // Reference to the master list
  category: string // Instrument category (Electro-Technical, Thermal, Mechanical, etc.)
  parameterGroup?: string // NEW: Sub-category filter (e.g., "Electrical (multi-function)")
  description: string
  make: string
  model: string
  assetNo: string
  serialNumber: string
  calibratedAt: string
  reportNo: string
  calibrationDueDate: string
  isExpired: boolean
  isExpiringSoon: boolean
  availableSopReferences?: string[] // NEW: SOP options from instrument's sop_references array
}

export interface CertificateFormData {
  // Meta
  certificateNumber: string
  status: 'DRAFT' | 'PENDING_REVIEW' | 'REVISION_REQUIRED' | 'PENDING_CUSTOMER_APPROVAL' | 'CUSTOMER_REVISION_REQUIRED' | 'PENDING_ADMIN_AUTHORIZATION' | 'AUTHORIZED' | 'APPROVED' | 'REJECTED'
  lastSaved: Date | null
  serverUpdatedAt: string | null  // ISO timestamp from server for optimistic concurrency control

  // Reviewer assignment (peer review model)
  reviewerId: string | null

  // Section 1: Summary
  calibratedAt: 'LAB' | 'SITE'
  srfNumber: string        // Only for In-House Lab
  srfDate: string          // Only for In-House Lab
  dateOfCalibration: string
  calibrationTenure: 3 | 6 | 9 | 12
  dueDateAdjustment: -3 | -2 | -1 | 0  // Adjustment in days (negative only)
  calibrationDueDate: string
  dueDateNotApplicable: boolean  // If true, due date shows as "Not Applicable" on certificate
  customerName: string
  customerAddress: string
  customerContactName: string
  customerContactEmail: string

  // Section 2: UUC Details
  uucDescription: string
  uucMake: string
  uucModel: string
  uucSerialNumber: string
  uucInstrumentId: string
  uucLocationName: string
  uucMachineName: string
  parameters: Parameter[]

  // Section 3: Master Instruments (selected for this certificate)
  masterInstruments: SelectedMasterInstrument[]

  // Section 4: Environmental Conditions
  ambientTemperature: string
  relativeHumidity: string

  // Section 6: Remarks
  calibrationStatus: string[]
  stickerOldRemoved: 'yes' | 'no' | 'na' | null
  stickerNewAffixed: 'yes' | 'no' | 'na' | null
  statusNotes: string  // Used for customer rejection feedback (read-only in engineer forms)

  // Section 7: Conclusion Statements
  selectedConclusionStatements: string[]
  additionalConclusionStatement: string // Custom user-entered conclusion statement

  // Engineer notes (for responding to reviewer feedback)
  engineerNotes: string

  // Section-specific responses to reviewer feedback (stored locally until submission)
  sectionResponses: Record<string, string>
}

interface CertificateStore {
  formData: CertificateFormData
  isDirty: boolean
  isSaving: boolean
  validationErrors: Record<string, string>
  isHydrated: boolean
  certificateId: string | null // Database ID for the certificate

  // Actions
  hydrate: () => void
  setFormField: <K extends keyof CertificateFormData>(field: K, value: CertificateFormData[K]) => void
  setParameter: (index: number, parameter: Parameter) => void
  addParameter: () => void
  removeParameter: (index: number) => void
  setResult: (parameterIndex: number, resultIndex: number, result: CalibrationResult) => void
  addResult: (parameterIndex: number) => void
  removeResult: (parameterIndex: number, resultIndex: number) => void
  setPointCount: (parameterIndex: number, count: number) => void
  addMasterInstrument: () => void
  removeMasterInstrument: (index: number) => void
  setMasterInstrument: (index: number, instrument: SelectedMasterInstrument) => void
  setParameterMasterInstrument: (parameterIndex: number, masterInstrumentId: number | null) => void
  calculateDueDate: () => void
  calculateError: (parameterIndex: number, resultIndex: number) => void
  recalculateAllErrors: (parameterIndex: number) => void
  toggleCalibrationStatus: (status: string) => void
  setIsSaving: (saving: boolean) => void
  setLastSaved: (date: Date) => void
  resetForm: () => void
  loadForm: (data: Partial<CertificateFormData>) => void
  setCertificateId: (id: string | null) => void
  saveDraft: () => Promise<{ success: boolean; error?: string; serverTimestamp?: string }>
  setEngineerNotes: (notes: string) => void
  setSectionResponse: (sectionId: string, response: string) => void
  clearSectionResponses: () => void
}

const generateId = () => Math.random().toString(36).substring(2, 9)

const _createDefaultBin = (): ParameterBin => ({
  id: generateId(),
  binMin: '',
  binMax: '',
  leastCount: '',
  accuracy: '',
})

const createDefaultParameter = (): Parameter => ({
  id: generateId(),
  parameterName: '',
  parameterUnit: '', // Selected via dropdown based on parameter type
  rangeMin: '',
  rangeMax: '',
  rangeUnit: '', // Deprecated - using parameterUnit instead
  operatingMin: '',
  operatingMax: '',
  operatingUnit: '', // Deprecated - using parameterUnit instead
  leastCountValue: '',
  leastCountUnit: '', // Deprecated - using parameterUnit instead
  accuracyValue: '',
  accuracyUnit: '', // Deprecated - using parameterUnit instead
  accuracyType: 'ABSOLUTE', // Default to absolute accuracy
  requiresBinning: false,
  bins: [],
  errorFormula: 'A-B',
  results: [createDefaultResult(1)],
  showAfterAdjustment: false,
  masterInstrumentId: null,
  sopReference: '',
})

const createDefaultResult = (pointNumber: number): CalibrationResult => ({
  id: generateId(),
  pointNumber,
  standardReading: '',
  beforeAdjustment: '',
  afterAdjustment: '',
  errorObserved: null,
  isOutOfLimit: false,
})

const createDefaultSelectedMasterInstrument = (): SelectedMasterInstrument => ({
  id: generateId(),
  masterInstrumentId: 0,
  category: '',
  description: '',
  make: '',
  model: '',
  assetNo: '',
  serialNumber: '',
  calibratedAt: '',
  reportNo: '',
  calibrationDueDate: '',
  isExpired: false,
  isExpiringSoon: false,
})

// Generate certificate number
const generateCertificateNumber = (): string => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = String(now.getFullYear()).slice(-2)
  const sequence = Math.floor(50000 + Math.random() * 1000).toString().padStart(5, '0')
  return `HTA/C${sequence}/${month}/${year}`
}

// Calculate due date based on calibration date, tenure, and adjustment
const calculateDueDateString = (dateOfCalibration: string, tenure: number, adjustment: number = 0): string => {
  if (!dateOfCalibration) return ''
  const date = new Date(dateOfCalibration)
  date.setMonth(date.getMonth() + tenure)
  date.setDate(date.getDate() + adjustment)
  return date.toISOString().split('T')[0]
}

// Calculate error limit based on accuracy type
// Returns: { limit: number, binIndex: number | null }
const calculateErrorLimit = (
  parameter: Parameter,
  standardReading: number
): { limit: number | null; binIndex: number | null; binAccuracy: string | null } => {
  const accuracyType = parameter.accuracyType

  // For binned parameters, find the appropriate bin
  if (parameter.requiresBinning && parameter.bins.length > 0) {
    for (let i = 0; i < parameter.bins.length; i++) {
      const bin = parameter.bins[i]
      const binMin = parseFloat(bin.binMin)
      const binMax = parseFloat(bin.binMax)
      const binAccuracy = parseFloat(bin.accuracy.replace('±', ''))

      // Check if standard reading falls within this bin
      if (!isNaN(binMin) && !isNaN(binMax) && standardReading >= binMin && standardReading <= binMax) {
        if (isNaN(binAccuracy)) {
          return { limit: null, binIndex: i, binAccuracy: bin.accuracy }
        }

        // Calculate limit based on accuracy type
        let limit: number
        switch (accuracyType) {
          case 'PERCENT_READING':
            // Use absolute value of reading for percentage calculation
            limit = (binAccuracy * Math.abs(standardReading)) / 100
            break
          case 'PERCENT_SCALE': {
            const rangeMin = parseFloat(parameter.rangeMin)
            const rangeMax = parseFloat(parameter.rangeMax)
            if (isNaN(rangeMin) || isNaN(rangeMax)) {
              limit = binAccuracy // Fallback to absolute if range not set
            } else {
              limit = (binAccuracy * Math.abs(rangeMax - rangeMin)) / 100
            }
            break
          }
          case 'ABSOLUTE':
          default:
            limit = binAccuracy
        }
        return { limit, binIndex: i, binAccuracy: bin.accuracy }
      }
    }
    // If no bin matches, return null
    return { limit: null, binIndex: null, binAccuracy: null }
  }

  // Non-binned parameter
  const accuracy = parseFloat(parameter.accuracyValue.replace('±', ''))
  if (isNaN(accuracy)) {
    return { limit: null, binIndex: null, binAccuracy: null }
  }

  let limit: number
  switch (accuracyType) {
    case 'PERCENT_READING':
      // Use absolute value of reading for percentage calculation
      limit = (accuracy * Math.abs(standardReading)) / 100
      break
    case 'PERCENT_SCALE': {
      const rangeMin = parseFloat(parameter.rangeMin)
      const rangeMax = parseFloat(parameter.rangeMax)
      if (isNaN(rangeMin) || isNaN(rangeMax)) {
        limit = accuracy // Fallback to absolute if range not set
      } else {
        limit = (accuracy * Math.abs(rangeMax - rangeMin)) / 100
      }
      break
    }
    case 'ABSOLUTE':
    default:
      limit = accuracy
  }

  return { limit, binIndex: null, binAccuracy: null }
}

const initialFormData: CertificateFormData = {
  // Meta
  certificateNumber: '', // Generated on client side to avoid hydration mismatch
  status: 'DRAFT',
  lastSaved: null,
  serverUpdatedAt: null,  // Tracks server timestamp for optimistic concurrency control

  // Reviewer assignment
  reviewerId: null,

  // Section 1: Summary
  calibratedAt: 'LAB',
  srfNumber: '',
  srfDate: '',
  dateOfCalibration: '', // Generated on client side to avoid hydration mismatch
  calibrationTenure: 12,
  dueDateAdjustment: 0,
  calibrationDueDate: '', // Generated on client side to avoid hydration mismatch
  dueDateNotApplicable: false,
  customerName: '',
  customerAddress: '',
  customerContactName: '',
  customerContactEmail: '',

  // Section 2: UUC Details
  uucDescription: '',
  uucMake: '',
  uucModel: '',
  uucSerialNumber: '',
  uucInstrumentId: '',
  uucLocationName: '',
  uucMachineName: '',
  parameters: [createDefaultParameter()],

  // Section 3: Master Instruments
  masterInstruments: [createDefaultSelectedMasterInstrument()],

  // Section 4: Environmental Conditions
  ambientTemperature: '',
  relativeHumidity: '',

  // Section 6: Remarks
  calibrationStatus: [],
  stickerOldRemoved: null,
  stickerNewAffixed: null,
  statusNotes: '',

  // Section 7: Conclusion Statements
  selectedConclusionStatements: [],
  additionalConclusionStatement: '',

  // Engineer notes (for responding to reviewer feedback)
  engineerNotes: '',

  // Section-specific responses to reviewer feedback
  sectionResponses: {},
}

// Certificate store - manages certificate form data and state
export const useCertificateStore = create<CertificateStore>((set, get) => ({
  formData: initialFormData,
  isDirty: false,
  isSaving: false,
  validationErrors: {},
  isHydrated: false,
  certificateId: null,

  // Hydrate store with client-side generated values to avoid hydration mismatch
  hydrate: () => {
    const state = get()
    if (state.isHydrated) return

    // Generate client-side values to avoid hydration mismatch
    const certificateNumber = state.formData.certificateNumber || generateCertificateNumber()
    const today = new Date().toISOString().split('T')[0]
    const dateOfCalibration = state.formData.dateOfCalibration || today
    const calibrationDueDate = state.formData.calibrationDueDate || calculateDueDateString(dateOfCalibration, state.formData.calibrationTenure, state.formData.dueDateAdjustment)

    // Update form data with client-side generated values
    set({
      isHydrated: true,
      formData: {
        ...state.formData,
        certificateNumber,
        dateOfCalibration,
        calibrationDueDate,
      },
    })
  },

  // Set form field - updates form data and marks as dirty
  setFormField: (field, value) => {
    set((state) => ({
      formData: { ...state.formData, [field]: value },
      isDirty: true,
    }))

    // Auto-calculate due date when date, tenure, or adjustment changes
    if (field === 'dateOfCalibration' || field === 'calibrationTenure' || field === 'dueDateAdjustment') {
      get().calculateDueDate()
    }
  },

  // Set parameter - updates parameter at index and marks as dirty
  setParameter: (index, parameter) => {
    const oldParameter = get().formData.parameters[index]

    set((state) => {
      const newParameters = [...state.formData.parameters]
      newParameters[index] = parameter
      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })

    // Check if accuracy-related fields changed that require recalculation
    const accuracyFieldsChanged =
      oldParameter.accuracyType !== parameter.accuracyType ||
      oldParameter.accuracyValue !== parameter.accuracyValue ||
      oldParameter.rangeMin !== parameter.rangeMin ||
      oldParameter.rangeMax !== parameter.rangeMax ||
      oldParameter.errorFormula !== parameter.errorFormula ||
      oldParameter.requiresBinning !== parameter.requiresBinning ||
      JSON.stringify(oldParameter.bins) !== JSON.stringify(parameter.bins)

    if (accuracyFieldsChanged) {
      // Trigger recalculation of all errors for this parameter
      get().recalculateAllErrors(index)
    }
  },

  // Add parameter - adds new parameter and marks as dirty
  addParameter: () => {
    set((state) => ({
      formData: {
        ...state.formData,
        parameters: [...state.formData.parameters, createDefaultParameter()],
      },
      isDirty: true,
    }))
  },

  // Remove parameter - removes parameter at index and marks as dirty
  removeParameter: (index) => {
    set((state) => {
      if (state.formData.parameters.length <= 1) return state
      const newParameters = state.formData.parameters.filter((_, i) => i !== index)
      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })
  },

  // Set result - updates result at parameter and result index and marks as dirty
  setResult: (parameterIndex, resultIndex, result) => {
    set((state) => {
      const newParameters = [...state.formData.parameters]
      const newResults = [...newParameters[parameterIndex].results]
      newResults[resultIndex] = result
      newParameters[parameterIndex] = { ...newParameters[parameterIndex], results: newResults }
      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })
    get().calculateError(parameterIndex, resultIndex)
  },

  // Add result - adds new result to parameter and marks as dirty
  addResult: (parameterIndex) => {
    set((state) => {
      const newParameters = [...state.formData.parameters]
      const currentResults = newParameters[parameterIndex].results
      const newPointNumber = currentResults.length + 1
      newParameters[parameterIndex] = {
        ...newParameters[parameterIndex],
        results: [...currentResults, createDefaultResult(newPointNumber)],
      }
      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })
  },

  // Remove result - removes result at parameter and result index and marks as dirty
  removeResult: (parameterIndex, resultIndex) => {
    set((state) => {
      const newParameters = [...state.formData.parameters]
      if (newParameters[parameterIndex].results.length <= 1) return state
      const newResults = newParameters[parameterIndex].results
        .filter((_, i) => i !== resultIndex)
        .map((r, i) => ({ ...r, pointNumber: i + 1 }))
      newParameters[parameterIndex] = { ...newParameters[parameterIndex], results: newResults }
      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })
  },

  // Set point count - adjusts number of results for parameter and marks as dirty
  setPointCount: (parameterIndex, count) => {
    set((state) => {
      const newParameters = [...state.formData.parameters]
      const currentResults = newParameters[parameterIndex].results
      const currentCount = currentResults.length

      if (count > currentCount) {
        // Add more results
        const newResults = [...currentResults]
        for (let i = currentCount + 1; i <= count; i++) {
          newResults.push(createDefaultResult(i))
        }
        newParameters[parameterIndex] = { ...newParameters[parameterIndex], results: newResults }
      } else if (count < currentCount) {
        // Remove results
        newParameters[parameterIndex] = {
          ...newParameters[parameterIndex],
          results: currentResults.slice(0, count),
        }
      }

      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })
  },

  // Add master instrument - adds new master instrument and marks as dirty
  addMasterInstrument: () => {
    set((state) => ({
      formData: {
        ...state.formData,
        masterInstruments: [...state.formData.masterInstruments, createDefaultSelectedMasterInstrument()],
      },
      isDirty: true,
    }))
  },

  // Remove master instrument - removes master instrument at index and marks as dirty
  removeMasterInstrument: (index) => {
    set((state) => {
      if (state.formData.masterInstruments.length <= 1) return state
      const newInstruments = state.formData.masterInstruments.filter((_, i) => i !== index)
      return {
        formData: { ...state.formData, masterInstruments: newInstruments },
        isDirty: true,
      }
    })
  },

  // Set master instrument - updates master instrument at index and marks as dirty
  setMasterInstrument: (index, instrument) => {
    set((state) => {
      const newInstruments = [...state.formData.masterInstruments]
      newInstruments[index] = instrument
      return {
        formData: { ...state.formData, masterInstruments: newInstruments },
        isDirty: true,
      }
    })
  },

  // Set parameter master instrument - updates parameter's master instrument ID and marks as dirty
  setParameterMasterInstrument: (parameterIndex, masterInstrumentId) => {
    set((state) => {
      const newParameters = [...state.formData.parameters]
      newParameters[parameterIndex] = {
        ...newParameters[parameterIndex],
        masterInstrumentId,
      }
      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })
  },

  // Calculate due date - recalculates due date based on date, tenure, and adjustment and updates form data
  calculateDueDate: () => {
    set((state) => {
      const dueDate = calculateDueDateString(
        state.formData.dateOfCalibration,
        state.formData.calibrationTenure,
        state.formData.dueDateAdjustment
      )
      return {
        formData: { ...state.formData, calibrationDueDate: dueDate },
      }
    })
  },

  // Calculate error - recalculates error for result and updates form data
  calculateError: (parameterIndex, resultIndex) => {
    set((state) => {
      const newParameters = [...state.formData.parameters]
      const parameter = newParameters[parameterIndex]
      const result = parameter.results[resultIndex]

      const standardReading = parseFloat(result.standardReading)
      const beforeAdjustment = parseFloat(result.beforeAdjustment)

      if (isNaN(standardReading) || isNaN(beforeAdjustment)) {
        return state
      }

      // Calculate error based on formula
      let errorObserved: number
      switch (parameter.errorFormula) {
        case 'B-A':
          errorObserved = beforeAdjustment - standardReading
          break
        case 'A-B':
        default:
          errorObserved = standardReading - beforeAdjustment
          break
      }

      // Calculate limit based on accuracy type
      const { limit } = calculateErrorLimit(parameter, standardReading)
      const isOutOfLimit = limit !== null && Math.abs(errorObserved) > limit

      const newResults = [...parameter.results]
      newResults[resultIndex] = {
        ...result,
        errorObserved: Math.round(errorObserved * 1000) / 1000,
        isOutOfLimit,
      }
      newParameters[parameterIndex] = { ...parameter, results: newResults }

      return {
        formData: { ...state.formData, parameters: newParameters },
      }
    })
  },

  // Recalculate all errors - recalculates errors for all results in parameter and updates form data
  recalculateAllErrors: (parameterIndex) => {
    const state = get()
    const parameter = state.formData.parameters[parameterIndex]

    // Recalculate errors for all results in this parameter
    parameter.results.forEach((_, resultIndex) => {
      get().calculateError(parameterIndex, resultIndex)
    })
  },

  // Toggle calibration status - adds or removes status from calibration status array and marks as dirty
  toggleCalibrationStatus: (status) => {
    set((state) => {
      const currentStatuses = state.formData.calibrationStatus
      const newStatuses = currentStatuses.includes(status)
        ? currentStatuses.filter((s) => s !== status)
        : [...currentStatuses, status]
      return {
        formData: { ...state.formData, calibrationStatus: newStatuses },
        isDirty: true,
      }
    })
  },

  // Set is saving - sets saving state
  setIsSaving: (saving) => set({ isSaving: saving }),

  // Set last saved - sets last saved date and marks as not dirty
  setLastSaved: (date) => set((state) => ({
    formData: { ...state.formData, lastSaved: date },
    isDirty: false,
  })),

  // Reset form - resets form data to initial state and marks as not dirty
  resetForm: () => set({ formData: initialFormData, isDirty: false, validationErrors: {}, certificateId: null }),

  // Load form - loads form data and marks as not dirty
  loadForm: (data) => set((state) => ({
    formData: { ...state.formData, ...data },
    isDirty: false,
  })),

  // Set certificate ID - sets certificate ID
  setCertificateId: (id) => set({ certificateId: id }),

  // Save draft - saves form data as draft
  saveDraft: async () => {
    const state = get()
    const { formData, certificateId } = state

    set({ isSaving: true })

    try {
      const url = certificateId
        ? `/api/certificates/${certificateId}`
        : '/api/certificates'

      const method = certificateId ? 'PUT' : 'POST'

      // Include clientUpdatedAt for optimistic concurrency control
      const requestBody = {
        ...formData,
        clientUpdatedAt: formData.serverUpdatedAt,
      }

      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      // Handle 409 Conflict - certificate was modified by another user
      if (response.status === 409) {
        const data = await response.json()
        set({ isSaving: false })
        return {
          success: false,
          error: 'CONFLICT',
          serverTimestamp: data.serverUpdatedAt,
        }
      }

      if (!response.ok) {
        const data = await response.json()
        set({ isSaving: false })
        return { success: false, error: data.error || 'Failed to save' }
      }

      const data = await response.json()

      // If this was a new certificate, save the ID
      if (!certificateId && data.certificate?.id) {
        set({ certificateId: data.certificate.id })
      }

      // Track server timestamp for optimistic concurrency control
      set({
        isSaving: false,
        isDirty: false,
        formData: {
          ...state.formData,
          lastSaved: new Date(),
          serverUpdatedAt: data.certificate?.updatedAt || null,
        },
      })

      return { success: true }
    } catch (error) {
      console.error('Error saving draft:', error)
      set({ isSaving: false })
      return { success: false, error: 'Network error' }
    }
  },

  // Set engineer notes - updates engineer notes and marks as dirty
  setEngineerNotes: (notes) => set((state) => ({
    formData: { ...state.formData, engineerNotes: notes },
    isDirty: true,
  })),

  // Set section response - updates section response and marks as dirty
  setSectionResponse: (sectionId, response) => set((state) => ({
    formData: {
      ...state.formData,
      sectionResponses: {
        ...state.formData.sectionResponses,
        [sectionId]: response,
      },
    },
    isDirty: true,
  })),

  // Clear section responses - clears all section responses and marks as dirty
  clearSectionResponses: () => set((state) => ({
    formData: {
      ...state.formData,
      sectionResponses: {},
    },
    isDirty: true,
  })),
}))
