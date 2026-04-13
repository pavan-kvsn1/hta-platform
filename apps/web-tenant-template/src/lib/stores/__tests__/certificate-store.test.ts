import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/setup'
import { useCertificateStore, ACCURACY_TYPE_CONFIG, type Parameter, type CalibrationResult } from '../certificate-store'

describe('certificate-store', () => {
  beforeEach(() => {
    // Reset the store completely before each test
    useCertificateStore.setState({
      formData: {
        certificateNumber: '',
        status: 'DRAFT',
        lastSaved: null,
        reviewerId: null,
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
        uucInstrumentId: '',
        uucLocationName: '',
        uucMachineName: '',
        parameters: [{
          id: 'default-param',
          parameterName: '',
          parameterUnit: '',
          rangeMin: '',
          rangeMax: '',
          rangeUnit: '',
          operatingMin: '',
          operatingMax: '',
          operatingUnit: '',
          leastCountValue: '',
          leastCountUnit: '',
          accuracyValue: '',
          accuracyUnit: '',
          accuracyType: 'ABSOLUTE',
          requiresBinning: false,
          bins: [],
          errorFormula: 'A-B',
          results: [{
            id: 'default-result',
            pointNumber: 1,
            standardReading: '',
            beforeAdjustment: '',
            afterAdjustment: '',
            errorObserved: null,
            isOutOfLimit: false,
          }],
          showAfterAdjustment: false,
          masterInstrumentId: null,
          sopReference: '',
        }],
        masterInstruments: [{
          id: 'default-mi',
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
        }],
        ambientTemperature: '',
        relativeHumidity: '',
        calibrationStatus: [],
        stickerOldRemoved: null,
        stickerNewAffixed: null,
        statusNotes: '',
        selectedConclusionStatements: [],
        additionalConclusionStatement: '',
        engineerNotes: '',
        sectionResponses: {},
      },
      isDirty: false,
      isSaving: false,
      validationErrors: {},
      isHydrated: false,
      certificateId: null,
    })
    vi.clearAllMocks()
  })

  describe('ACCURACY_TYPE_CONFIG', () => {
    it('has correct config for PERCENT_READING', () => {
      expect(ACCURACY_TYPE_CONFIG.PERCENT_READING.label).toBe('% of Reading')
      expect(ACCURACY_TYPE_CONFIG.PERCENT_READING.shortLabel).toBe('%Rdg')
    })

    it('has correct config for ABSOLUTE', () => {
      expect(ACCURACY_TYPE_CONFIG.ABSOLUTE.label).toBe('Absolute')
      expect(ACCURACY_TYPE_CONFIG.ABSOLUTE.shortLabel).toBe('Abs')
    })

    it('has correct config for PERCENT_SCALE', () => {
      expect(ACCURACY_TYPE_CONFIG.PERCENT_SCALE.label).toBe('% of Scale')
      expect(ACCURACY_TYPE_CONFIG.PERCENT_SCALE.shortLabel).toBe('%Scale')
    })
  })

  describe('hydrate', () => {
    it('generates certificate number when not set', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.hydrate()
      })

      expect(result.current.isHydrated).toBe(true)
      expect(result.current.formData.certificateNumber).toMatch(/^HTA\/C\d{5}\/\d{2}\/\d{2}$/)
    })

    it('generates dateOfCalibration when not set', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.hydrate()
      })

      expect(result.current.formData.dateOfCalibration).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('does not re-hydrate if already hydrated', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.hydrate()
      })

      const certNumber = result.current.formData.certificateNumber

      act(() => {
        result.current.hydrate()
      })

      expect(result.current.formData.certificateNumber).toBe(certNumber)
    })
  })

  describe('setFormField', () => {
    it('updates a form field', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setFormField('customerName', 'Test Corp')
      })

      expect(result.current.formData.customerName).toBe('Test Corp')
      expect(result.current.isDirty).toBe(true)
    })

    it('auto-calculates due date when dateOfCalibration changes', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setFormField('dateOfCalibration', '2024-01-15')
      })

      expect(result.current.formData.calibrationDueDate).toBe('2025-01-15')
    })

    it('auto-calculates due date when calibrationTenure changes', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setFormField('dateOfCalibration', '2024-01-15')
        result.current.setFormField('calibrationTenure', 6)
      })

      expect(result.current.formData.calibrationDueDate).toBe('2024-07-15')
    })

    it('auto-calculates due date when dueDateAdjustment changes', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setFormField('dateOfCalibration', '2024-01-15')
        result.current.setFormField('dueDateAdjustment', -3)
      })

      expect(result.current.formData.calibrationDueDate).toBe('2025-01-12')
    })
  })

  describe('setParameter', () => {
    it('updates a parameter', () => {
      const { result } = renderHook(() => useCertificateStore())

      const newParameter: Parameter = {
        ...result.current.formData.parameters[0],
        parameterName: 'Temperature',
      }

      act(() => {
        result.current.setParameter(0, newParameter)
      })

      expect(result.current.formData.parameters[0].parameterName).toBe('Temperature')
      expect(result.current.isDirty).toBe(true)
    })

    it('recalculates errors when accuracy type changes', () => {
      const { result } = renderHook(() => useCertificateStore())

      const parameterWithResult: Parameter = {
        ...result.current.formData.parameters[0],
        parameterName: 'Test',
        accuracyValue: '10',
        accuracyType: 'ABSOLUTE',
        results: [{
          id: 'r1',
          pointNumber: 1,
          standardReading: '100',
          beforeAdjustment: '105',
          afterAdjustment: '',
          errorObserved: null,
          isOutOfLimit: false,
        }],
      }

      act(() => {
        result.current.setParameter(0, parameterWithResult)
      })

      // Change accuracy type
      act(() => {
        result.current.setParameter(0, {
          ...result.current.formData.parameters[0],
          accuracyType: 'PERCENT_READING',
        })
      })

      expect(result.current.isDirty).toBe(true)
    })
  })

  describe('addParameter', () => {
    it('adds a new parameter', () => {
      const { result } = renderHook(() => useCertificateStore())
      const initialCount = result.current.formData.parameters.length

      act(() => {
        result.current.addParameter()
      })

      expect(result.current.formData.parameters.length).toBe(initialCount + 1)
      expect(result.current.isDirty).toBe(true)
    })
  })

  describe('removeParameter', () => {
    it('removes a parameter', () => {
      const { result } = renderHook(() => useCertificateStore())

      // Add a second parameter first
      act(() => {
        result.current.addParameter()
      })

      const countAfterAdd = result.current.formData.parameters.length

      act(() => {
        result.current.removeParameter(1)
      })

      expect(result.current.formData.parameters.length).toBe(countAfterAdd - 1)
    })

    it('does not remove the last parameter', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.removeParameter(0)
      })

      expect(result.current.formData.parameters.length).toBe(1)
    })
  })

  describe('setResult', () => {
    it('updates a result', () => {
      const { result } = renderHook(() => useCertificateStore())

      const newResult: CalibrationResult = {
        id: 'r1',
        pointNumber: 1,
        standardReading: '100',
        beforeAdjustment: '99',
        afterAdjustment: '',
        errorObserved: null,
        isOutOfLimit: false,
      }

      act(() => {
        result.current.setResult(0, 0, newResult)
      })

      expect(result.current.formData.parameters[0].results[0].standardReading).toBe('100')
    })
  })

  describe('addResult', () => {
    it('adds a new result to a parameter', () => {
      const { result } = renderHook(() => useCertificateStore())
      const initialCount = result.current.formData.parameters[0].results.length

      act(() => {
        result.current.addResult(0)
      })

      expect(result.current.formData.parameters[0].results.length).toBe(initialCount + 1)
      expect(result.current.formData.parameters[0].results[initialCount].pointNumber).toBe(initialCount + 1)
    })
  })

  describe('removeResult', () => {
    it('removes a result from a parameter', () => {
      const { result } = renderHook(() => useCertificateStore())

      // Add a second result first
      act(() => {
        result.current.addResult(0)
      })

      const countAfterAdd = result.current.formData.parameters[0].results.length

      act(() => {
        result.current.removeResult(0, 1)
      })

      expect(result.current.formData.parameters[0].results.length).toBe(countAfterAdd - 1)
    })

    it('does not remove the last result', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.removeResult(0, 0)
      })

      expect(result.current.formData.parameters[0].results.length).toBe(1)
    })

    it('renumbers results after removal', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.addResult(0)
        result.current.addResult(0)
      })

      act(() => {
        result.current.removeResult(0, 0)
      })

      expect(result.current.formData.parameters[0].results[0].pointNumber).toBe(1)
      expect(result.current.formData.parameters[0].results[1].pointNumber).toBe(2)
    })
  })

  describe('setPointCount', () => {
    it('adds results when count increases', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setPointCount(0, 5)
      })

      expect(result.current.formData.parameters[0].results.length).toBe(5)
    })

    it('removes results when count decreases', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setPointCount(0, 5)
      })

      act(() => {
        result.current.setPointCount(0, 2)
      })

      expect(result.current.formData.parameters[0].results.length).toBe(2)
    })
  })

  describe('addMasterInstrument', () => {
    it('adds a new master instrument', () => {
      const { result } = renderHook(() => useCertificateStore())
      const initialCount = result.current.formData.masterInstruments.length

      act(() => {
        result.current.addMasterInstrument()
      })

      expect(result.current.formData.masterInstruments.length).toBe(initialCount + 1)
    })
  })

  describe('removeMasterInstrument', () => {
    it('removes a master instrument', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.addMasterInstrument()
      })

      const countAfterAdd = result.current.formData.masterInstruments.length

      act(() => {
        result.current.removeMasterInstrument(1)
      })

      expect(result.current.formData.masterInstruments.length).toBe(countAfterAdd - 1)
    })

    it('does not remove the last master instrument', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.removeMasterInstrument(0)
      })

      expect(result.current.formData.masterInstruments.length).toBe(1)
    })
  })

  describe('setMasterInstrument', () => {
    it('updates a master instrument', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setMasterInstrument(0, {
          ...result.current.formData.masterInstruments[0],
          description: 'Test Instrument',
        })
      })

      expect(result.current.formData.masterInstruments[0].description).toBe('Test Instrument')
    })
  })

  describe('setParameterMasterInstrument', () => {
    it('assigns a master instrument to a parameter', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setParameterMasterInstrument(0, 123)
      })

      expect(result.current.formData.parameters[0].masterInstrumentId).toBe(123)
    })
  })

  describe('calculateDueDate', () => {
    it('calculates due date correctly', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setFormField('dateOfCalibration', '2024-01-15')
        result.current.setFormField('calibrationTenure', 12)
        result.current.calculateDueDate()
      })

      expect(result.current.formData.calibrationDueDate).toBe('2025-01-15')
    })
  })

  describe('calculateError', () => {
    it('calculates error with A-B formula', () => {
      const { result } = renderHook(() => useCertificateStore())

      const parameter: Parameter = {
        ...result.current.formData.parameters[0],
        errorFormula: 'A-B',
        accuracyValue: '10',
        accuracyType: 'ABSOLUTE',
        results: [{
          id: 'r1',
          pointNumber: 1,
          standardReading: '100',
          beforeAdjustment: '95',
          afterAdjustment: '',
          errorObserved: null,
          isOutOfLimit: false,
        }],
      }

      act(() => {
        result.current.setParameter(0, parameter)
        result.current.calculateError(0, 0)
      })

      expect(result.current.formData.parameters[0].results[0].errorObserved).toBe(5)
    })

    it('calculates error with B-A formula', () => {
      const { result } = renderHook(() => useCertificateStore())

      const parameter: Parameter = {
        ...result.current.formData.parameters[0],
        errorFormula: 'B-A',
        accuracyValue: '10',
        accuracyType: 'ABSOLUTE',
        results: [{
          id: 'r1',
          pointNumber: 1,
          standardReading: '100',
          beforeAdjustment: '95',
          afterAdjustment: '',
          errorObserved: null,
          isOutOfLimit: false,
        }],
      }

      act(() => {
        result.current.setParameter(0, parameter)
        result.current.calculateError(0, 0)
      })

      expect(result.current.formData.parameters[0].results[0].errorObserved).toBe(-5)
    })

    it('marks result as out of limit when error exceeds accuracy', () => {
      const { result } = renderHook(() => useCertificateStore())

      const parameter: Parameter = {
        ...result.current.formData.parameters[0],
        errorFormula: 'A-B',
        accuracyValue: '5',
        accuracyType: 'ABSOLUTE',
        results: [{
          id: 'r1',
          pointNumber: 1,
          standardReading: '100',
          beforeAdjustment: '90', // Error would be 10, exceeding limit of 5
          afterAdjustment: '',
          errorObserved: null,
          isOutOfLimit: false,
        }],
      }

      act(() => {
        result.current.setParameter(0, parameter)
        result.current.calculateError(0, 0)
      })

      expect(result.current.formData.parameters[0].results[0].isOutOfLimit).toBe(true)
    })

    it('does not calculate error if readings are invalid', () => {
      const { result } = renderHook(() => useCertificateStore())

      const parameter: Parameter = {
        ...result.current.formData.parameters[0],
        results: [{
          id: 'r1',
          pointNumber: 1,
          standardReading: 'invalid',
          beforeAdjustment: '95',
          afterAdjustment: '',
          errorObserved: null,
          isOutOfLimit: false,
        }],
      }

      act(() => {
        result.current.setParameter(0, parameter)
        result.current.calculateError(0, 0)
      })

      expect(result.current.formData.parameters[0].results[0].errorObserved).toBeNull()
    })
  })

  describe('toggleCalibrationStatus', () => {
    it('adds status when not present', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.toggleCalibrationStatus('PASS')
      })

      expect(result.current.formData.calibrationStatus).toContain('PASS')
    })

    it('removes status when present', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.toggleCalibrationStatus('PASS')
        result.current.toggleCalibrationStatus('PASS')
      })

      expect(result.current.formData.calibrationStatus).not.toContain('PASS')
    })
  })

  describe('setIsSaving', () => {
    it('sets saving state', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setIsSaving(true)
      })

      expect(result.current.isSaving).toBe(true)
    })
  })

  describe('setLastSaved', () => {
    it('sets last saved date and clears dirty flag', () => {
      const { result } = renderHook(() => useCertificateStore())
      const date = new Date()

      act(() => {
        result.current.setFormField('customerName', 'Test')
        result.current.setLastSaved(date)
      })

      expect(result.current.formData.lastSaved).toBe(date)
      expect(result.current.isDirty).toBe(false)
    })
  })

  describe('resetForm', () => {
    it('resets form to initial state', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setFormField('customerName', 'Test Corp')
        result.current.setCertificateId('cert-123')
        result.current.resetForm()
      })

      expect(result.current.formData.customerName).toBe('')
      expect(result.current.certificateId).toBeNull()
      expect(result.current.isDirty).toBe(false)
    })
  })

  describe('loadForm', () => {
    it('loads partial form data', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.loadForm({
          customerName: 'Loaded Corp',
          uucDescription: 'Test Equipment',
        })
      })

      expect(result.current.formData.customerName).toBe('Loaded Corp')
      expect(result.current.formData.uucDescription).toBe('Test Equipment')
      expect(result.current.isDirty).toBe(false)
    })
  })

  describe('setCertificateId', () => {
    it('sets certificate ID', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setCertificateId('cert-123')
      })

      expect(result.current.certificateId).toBe('cert-123')
    })
  })

  describe('saveDraft', () => {
    it('creates new certificate when no ID exists', async () => {
      server.use(
        http.post('/api/certificates', () => {
          return HttpResponse.json({ certificate: { id: 'new-cert-123' } })
        })
      )

      const { result } = renderHook(() => useCertificateStore())

      let saveResult: { success: boolean }
      await act(async () => {
        saveResult = await result.current.saveDraft()
      })

      expect(saveResult!.success).toBe(true)
      expect(result.current.certificateId).toBe('new-cert-123')
    })

    it('updates existing certificate when ID exists', async () => {
      server.use(
        http.put('/api/certificates/:id', () => {
          return HttpResponse.json({ certificate: { id: 'cert-123' } })
        })
      )

      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setCertificateId('cert-123')
      })

      let saveResult: { success: boolean }
      await act(async () => {
        saveResult = await result.current.saveDraft()
      })

      expect(saveResult!.success).toBe(true)
    })

    it('returns error on failed save', async () => {
      server.use(
        http.post('/api/certificates', () => {
          return HttpResponse.json({ error: 'Save failed' }, { status: 400 })
        })
      )

      const { result } = renderHook(() => useCertificateStore())

      let saveResult: { success: boolean; error?: string }
      await act(async () => {
        saveResult = await result.current.saveDraft()
      })

      expect(saveResult!.success).toBe(false)
      expect(saveResult!.error).toBe('Save failed')
    })

    it('handles network errors', async () => {
      server.use(
        http.post('/api/certificates', () => {
          return HttpResponse.error()
        })
      )

      const { result } = renderHook(() => useCertificateStore())

      let saveResult: { success: boolean; error?: string }
      await act(async () => {
        saveResult = await result.current.saveDraft()
      })

      expect(saveResult!.success).toBe(false)
      expect(saveResult!.error).toBeDefined()
    })
  })

  describe('setEngineerNotes', () => {
    it('sets engineer notes', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setEngineerNotes('Updated per feedback')
      })

      expect(result.current.formData.engineerNotes).toBe('Updated per feedback')
      expect(result.current.isDirty).toBe(true)
    })
  })

  describe('setSectionResponse', () => {
    it('sets section response', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setSectionResponse('summary', 'Updated summary section')
      })

      expect(result.current.formData.sectionResponses.summary).toBe('Updated summary section')
      expect(result.current.isDirty).toBe(true)
    })
  })

  describe('clearSectionResponses', () => {
    it('clears all section responses', () => {
      const { result } = renderHook(() => useCertificateStore())

      act(() => {
        result.current.setSectionResponse('summary', 'Response 1')
        result.current.setSectionResponse('results', 'Response 2')
        result.current.clearSectionResponses()
      })

      expect(result.current.formData.sectionResponses).toEqual({})
    })
  })
})
