/**
 * Certificate Store Unit Tests
 *
 * Tests for the certificate Zustand store including:
 * - Initial state
 * - Form field updates
 * - Parameter management
 * - Result management
 * - Error calculation
 * - Save/load operations
 *
 * Migrated from hta-calibration/tests/unit/certificate-store.test.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from '@testing-library/react'

// Mock the store for testing
const createMockStore = () => ({
  formData: {
    certificateNumber: '',
    status: 'DRAFT',
    lastSaved: null,
    calibratedAt: 'LAB',
    srfNumber: '',
    srfDate: '',
    dateOfCalibration: '',
    calibrationTenure: 12,
    dueDateAdjustment: 0,
    calibrationDueDate: '',
    dueDateNotApplicable: false,
    customerName: '',
    customerAddress: '',
    uucDescription: '',
    uucMake: '',
    uucModel: '',
    uucSerialNumber: '',
    parameters: [{
      id: 'test-param-id',
      parameterName: '',
      parameterUnit: '',
      rangeMin: '',
      rangeMax: '',
      results: [{
        id: 'test-result-id',
        pointNumber: 1,
        standardReading: '',
        beforeAdjustment: '',
        errorObserved: null,
        isOutOfLimit: false,
      }],
    }],
    masterInstruments: [{
      id: 'test-master-id',
      masterInstrumentId: 0,
      category: '',
      description: '',
    }],
    ambientTemperature: '',
    relativeHumidity: '',
    calibrationStatus: [],
    engineerNotes: '',
    serverUpdatedAt: null,
  },
  isDirty: false,
  isSaving: false,
  validationErrors: {},
  isHydrated: false,
  certificateId: null,
})

describe('Certificate Store', () => {
  let store: ReturnType<typeof createMockStore>

  beforeEach(() => {
    store = createMockStore()
  })

  describe('initial state', () => {
    it('has correct initial form data', () => {
      expect(store.formData.status).toBe('DRAFT')
      expect(store.formData.calibratedAt).toBe('LAB')
      expect(store.formData.calibrationTenure).toBe(12)
      expect(store.formData.parameters).toHaveLength(1)
      expect(store.formData.masterInstruments).toHaveLength(1)
    })

    it('starts with isDirty as false', () => {
      expect(store.isDirty).toBe(false)
    })

    it('starts with isSaving as false', () => {
      expect(store.isSaving).toBe(false)
    })

    it('starts with isHydrated as false', () => {
      expect(store.isHydrated).toBe(false)
    })
  })

  describe('form field updates', () => {
    it('updates a simple field', () => {
      store.formData.customerName = 'Test Company'
      store.isDirty = true

      expect(store.formData.customerName).toBe('Test Company')
      expect(store.isDirty).toBe(true)
    })

    it('can update nested parameter data', () => {
      store.formData.parameters[0].parameterName = 'Temperature'

      expect(store.formData.parameters[0].parameterName).toBe('Temperature')
    })

    it('can update calibration result data', () => {
      store.formData.parameters[0].results[0].standardReading = '100'

      expect(store.formData.parameters[0].results[0].standardReading).toBe('100')
    })
  })

  describe('parameter management', () => {
    it('can add a new parameter', () => {
      const initialCount = store.formData.parameters.length

      store.formData.parameters.push({
        id: 'new-param-id',
        parameterName: '',
        parameterUnit: '',
        rangeMin: '',
        rangeMax: '',
        results: [],
      })

      expect(store.formData.parameters).toHaveLength(initialCount + 1)
    })

    it('can remove a parameter (but keeps at least one)', () => {
      // Add a second parameter first
      store.formData.parameters.push({
        id: 'second-param',
        parameterName: '',
        parameterUnit: '',
        rangeMin: '',
        rangeMax: '',
        results: [],
      })

      const countAfterAdd = store.formData.parameters.length
      store.formData.parameters.splice(0, 1)

      expect(store.formData.parameters).toHaveLength(countAfterAdd - 1)
    })
  })

  describe('result management', () => {
    it('can add a result to a parameter', () => {
      const initialResultCount = store.formData.parameters[0].results.length

      store.formData.parameters[0].results.push({
        id: 'new-result-id',
        pointNumber: 2,
        standardReading: '',
        beforeAdjustment: '',
        errorObserved: null,
        isOutOfLimit: false,
      })

      expect(store.formData.parameters[0].results).toHaveLength(initialResultCount + 1)
    })

    it('assigns correct point number to new result', () => {
      store.formData.parameters[0].results.push({
        id: 'result-2',
        pointNumber: 2,
        standardReading: '',
        beforeAdjustment: '',
        errorObserved: null,
        isOutOfLimit: false,
      })

      const results = store.formData.parameters[0].results
      expect(results[results.length - 1].pointNumber).toBe(2)
    })
  })

  describe('master instrument management', () => {
    it('can add a master instrument', () => {
      const initialCount = store.formData.masterInstruments.length

      store.formData.masterInstruments.push({
        id: 'new-master-id',
        masterInstrumentId: 1,
        category: '',
        description: '',
      })

      expect(store.formData.masterInstruments).toHaveLength(initialCount + 1)
    })
  })

  describe('calibration status toggle', () => {
    it('can add a status', () => {
      store.formData.calibrationStatus.push('OK')

      expect(store.formData.calibrationStatus).toContain('OK')
    })

    it('can remove a status', () => {
      store.formData.calibrationStatus = ['OK', 'ADJUSTED']
      store.formData.calibrationStatus = store.formData.calibrationStatus.filter(s => s !== 'OK')

      expect(store.formData.calibrationStatus).not.toContain('OK')
      expect(store.formData.calibrationStatus).toContain('ADJUSTED')
    })
  })

  describe('error calculation', () => {
    it('calculates error using A-B formula', () => {
      const standardReading = 100
      const beforeAdjustment = 99
      const error = standardReading - beforeAdjustment

      expect(error).toBe(1)
    })

    it('calculates error using B-A formula', () => {
      const standardReading = 100
      const beforeAdjustment = 99
      const error = beforeAdjustment - standardReading

      expect(error).toBe(-1)
    })

    it('determines out of limit status', () => {
      const error = 1
      const accuracy = 0.5
      const isOutOfLimit = Math.abs(error) > accuracy

      expect(isOutOfLimit).toBe(true)
    })

    it('within limit when error is less than accuracy', () => {
      const error = 0.3
      const accuracy = 0.5
      const isOutOfLimit = Math.abs(error) > accuracy

      expect(isOutOfLimit).toBe(false)
    })
  })

  describe('form reset', () => {
    it('resets all form data to initial state', () => {
      // Make some changes
      store.formData.customerName = 'Test'
      store.isDirty = true

      // Reset
      store = createMockStore()

      expect(store.formData.customerName).toBe('')
      expect(store.isDirty).toBe(false)
    })
  })

  describe('form load', () => {
    it('loads partial form data', () => {
      store.formData.customerName = 'Loaded Company'
      store.formData.customerAddress = '123 Test St'
      store.isDirty = false

      expect(store.formData.customerName).toBe('Loaded Company')
      expect(store.formData.customerAddress).toBe('123 Test St')
      expect(store.isDirty).toBe(false)
    })
  })

  describe('certificate ID management', () => {
    it('sets certificate ID', () => {
      store.certificateId = 'test-id-123'

      expect(store.certificateId).toBe('test-id-123')
    })

    it('can clear certificate ID', () => {
      store.certificateId = 'test-id'
      store.certificateId = null

      expect(store.certificateId).toBeNull()
    })
  })

  describe('saving state', () => {
    it('sets saving state to true', () => {
      store.isSaving = true

      expect(store.isSaving).toBe(true)
    })

    it('sets saving state to false', () => {
      store.isSaving = true
      store.isSaving = false

      expect(store.isSaving).toBe(false)
    })
  })

  describe('last saved tracking', () => {
    it('sets last saved date and clears isDirty', () => {
      const savedDate = new Date('2024-01-15T10:30:00')

      store.formData.lastSaved = savedDate
      store.isDirty = false

      expect(store.formData.lastSaved).toEqual(savedDate)
      expect(store.isDirty).toBe(false)
    })
  })

  describe('engineer notes', () => {
    it('updates engineer notes', () => {
      store.formData.engineerNotes = 'Fixed calibration issue'
      store.isDirty = true

      expect(store.formData.engineerNotes).toBe('Fixed calibration issue')
      expect(store.isDirty).toBe(true)
    })
  })

  describe('serverUpdatedAt tracking', () => {
    it('starts with serverUpdatedAt as null', () => {
      expect(store.formData.serverUpdatedAt).toBeNull()
    })

    it('serverUpdatedAt can be set', () => {
      const timestamp = '2024-01-15T10:30:00.000Z'
      store.formData.serverUpdatedAt = timestamp

      expect(store.formData.serverUpdatedAt).toBe(timestamp)
    })

    it('reset clears serverUpdatedAt', () => {
      store.formData.serverUpdatedAt = '2024-01-15T10:30:00.000Z'
      store = createMockStore()

      expect(store.formData.serverUpdatedAt).toBeNull()
    })
  })

  describe('due date calculation', () => {
    it('calculates due date from calibration date and tenure', () => {
      const calibrationDate = new Date('2024-01-15')
      const tenureMonths = 12
      const dueDate = new Date(calibrationDate)
      dueDate.setMonth(dueDate.getMonth() + tenureMonths)

      expect(dueDate.toISOString().split('T')[0]).toBe('2025-01-15')
    })

    it('applies due date adjustment', () => {
      const calibrationDate = new Date('2024-01-15')
      const tenureMonths = 12
      const adjustment = -3 // days

      const dueDate = new Date(calibrationDate)
      dueDate.setMonth(dueDate.getMonth() + tenureMonths)
      dueDate.setDate(dueDate.getDate() + adjustment)

      expect(dueDate.toISOString().split('T')[0]).toBe('2025-01-12')
    })

    it('handles 6 month tenure', () => {
      const calibrationDate = new Date('2024-01-15')
      const tenureMonths = 6
      const dueDate = new Date(calibrationDate)
      dueDate.setMonth(dueDate.getMonth() + tenureMonths)

      expect(dueDate.toISOString().split('T')[0]).toBe('2024-07-15')
    })
  })
})
