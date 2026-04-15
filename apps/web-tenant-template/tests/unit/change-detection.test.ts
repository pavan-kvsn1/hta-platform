import { describe, it, expect } from 'vitest'
import {
  detectCertificateChanges,
  generateChangeSummary,
  FIELD_LABELS,
  PARAMETER_FIELD_LABELS,
  type ChangeSet,
} from '../../src/lib/utils/change-detection'

describe('Change Detection Utils', () => {
  describe('detectCertificateChanges', () => {
    describe('certificate field changes', () => {
      it('should detect no changes when objects are identical', () => {
        const existing = {
          calibratedAt: 'Lab A',
          srfNumber: 'SRF-001',
          uucDescription: 'Test Instrument',
        }
        const incoming = {
          calibratedAt: 'Lab A',
          srfNumber: 'SRF-001',
          uucDescription: 'Test Instrument',
        }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(false)
        expect(result.certificateFields).toHaveLength(0)
      })

      it('should detect changed string field', () => {
        const existing = { srfNumber: 'SRF-001' }
        const incoming = { srfNumber: 'SRF-002' }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(true)
        expect(result.certificateFields).toHaveLength(1)
        expect(result.certificateFields[0].field).toBe('srfNumber')
        expect(result.certificateFields[0].previousValue).toBe('SRF-001')
        expect(result.certificateFields[0].newValue).toBe('SRF-002')
      })

      it('should detect change from null to value', () => {
        const existing = { uucMake: null }
        const incoming = { uucMake: 'Fluke' }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(true)
        expect(result.certificateFields[0].previousValue).toBe('(empty)')
        expect(result.certificateFields[0].newValue).toBe('Fluke')
      })

      it('should detect change from value to null', () => {
        const existing = { uucMake: 'Fluke' }
        const incoming = { uucMake: null }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(true)
        expect(result.certificateFields[0].previousValue).toBe('Fluke')
        expect(result.certificateFields[0].newValue).toBe('(empty)')
      })

      it('should treat null, undefined, and empty string as equivalent', () => {
        const existing = { uucMake: null }
        const incoming = { uucMake: '' }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(false)
      })

      it('should detect date changes correctly', () => {
        const existing = { dateOfCalibration: new Date('2024-01-15') }
        const incoming = { dateOfCalibration: new Date('2024-01-16') }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(true)
        expect(result.certificateFields[0].field).toBe('dateOfCalibration')
      })

      it('should treat same date as no change (ignoring time)', () => {
        const existing = { dateOfCalibration: new Date('2024-01-15T10:00:00Z') }
        const incoming = { dateOfCalibration: new Date('2024-01-15T22:00:00Z') }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(false)
      })

      it('should detect array field changes (calibrationStatus)', () => {
        const existing = { calibrationStatus: ['OK', 'WITHIN_TOLERANCE'] }
        const incoming = { calibrationStatus: ['OK', 'ADJUSTED'] }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(true)
      })

      it('should treat arrays with same elements in different order as equal', () => {
        const existing = { calibrationStatus: ['OK', 'WITHIN_TOLERANCE'] }
        const incoming = { calibrationStatus: ['WITHIN_TOLERANCE', 'OK'] }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(false)
      })

      it('should include section info in field changes', () => {
        const existing = { srfNumber: 'SRF-001', uucMake: 'Fluke' }
        const incoming = { srfNumber: 'SRF-002', uucMake: 'Keysight' }

        const result = detectCertificateChanges(existing, incoming)

        const srfChange = result.certificateFields.find(c => c.field === 'srfNumber')
        const uucChange = result.certificateFields.find(c => c.field === 'uucMake')

        expect(srfChange?.section).toBe('summary')
        expect(uucChange?.section).toBe('uuc-details')
      })
    })

    describe('parameter changes', () => {
      it('should detect no parameter changes when identical', () => {
        const existing = {
          parameters: [{ id: 'p1', parameterName: 'Temperature', rangeMin: 0 }],
        }
        const incoming = {
          parameters: [{ dbId: 'p1', parameterName: 'Temperature', rangeMin: 0 }],
        }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.parameters).toHaveLength(0)
      })

      it('should detect added parameter', () => {
        const existing = {
          parameters: [{ id: 'p1', parameterName: 'Temperature' }],
        }
        const incoming = {
          parameters: [
            { dbId: 'p1', parameterName: 'Temperature' },
            { parameterName: 'Humidity' }, // New, no dbId
          ],
        }

        const result = detectCertificateChanges(existing, incoming)

        const addedParam = result.parameters.find(p => p.type === 'ADDED')
        expect(addedParam).toBeDefined()
        expect(addedParam?.parameterName).toBe('Humidity')
      })

      it('should detect deleted parameter', () => {
        const existing = {
          parameters: [
            { id: 'p1', parameterName: 'Temperature' },
            { id: 'p2', parameterName: 'Humidity' },
          ],
        }
        const incoming = {
          parameters: [{ dbId: 'p1', parameterName: 'Temperature' }],
        }

        const result = detectCertificateChanges(existing, incoming)

        const deletedParam = result.parameters.find(p => p.type === 'DELETED')
        expect(deletedParam).toBeDefined()
        expect(deletedParam?.parameterName).toBe('Humidity')
        expect(deletedParam?.parameterId).toBe('p2')
      })

      it('should detect modified parameter', () => {
        const existing = {
          parameters: [{ id: 'p1', parameterName: 'Temperature', rangeMin: 0, rangeMax: 100 }],
        }
        const incoming = {
          parameters: [{ dbId: 'p1', parameterName: 'Temperature', rangeMin: 0, rangeMax: 150 }],
        }

        const result = detectCertificateChanges(existing, incoming)

        const modifiedParam = result.parameters.find(p => p.type === 'MODIFIED')
        expect(modifiedParam).toBeDefined()
        expect(modifiedParam?.parameterName).toBe('Temperature')
        expect(modifiedParam?.changes).toBeDefined()
        expect(modifiedParam?.changes?.length).toBe(1)
        expect(modifiedParam?.changes?.[0].field).toBe('rangeMax')
      })

      it('should detect parameter rename', () => {
        const existing = {
          parameters: [{ id: 'p1', parameterName: 'Temperature' }],
        }
        const incoming = {
          parameters: [{ dbId: 'p1', parameterName: 'Ambient Temperature' }],
        }

        const result = detectCertificateChanges(existing, incoming)

        const modifiedParam = result.parameters.find(p => p.type === 'MODIFIED')
        expect(modifiedParam).toBeDefined()
        expect(modifiedParam?.changes?.some(c => c.field === 'parameterName')).toBe(true)
      })
    })

    describe('hasChanges flag', () => {
      it('should be false when no changes', () => {
        const result = detectCertificateChanges({}, {})
        expect(result.hasChanges).toBe(false)
      })

      it('should be true when certificate fields changed', () => {
        const result = detectCertificateChanges(
          { srfNumber: 'OLD' },
          { srfNumber: 'NEW' }
        )
        expect(result.hasChanges).toBe(true)
      })

      it('should be true when parameters changed', () => {
        const result = detectCertificateChanges(
          { parameters: [{ id: 'p1', parameterName: 'Temp' }] },
          { parameters: [] }
        )
        expect(result.hasChanges).toBe(true)
      })
    })
  })

  describe('generateChangeSummary', () => {
    it('should return "No changes" when no changes', () => {
      const changeSet: ChangeSet = {
        certificateFields: [],
        parameters: [],
        results: [],
        hasChanges: false,
      }

      expect(generateChangeSummary(changeSet)).toBe('No changes')
    })

    it('should summarize field changes correctly (singular)', () => {
      const changeSet: ChangeSet = {
        certificateFields: [
          {
            field: 'srfNumber',
            fieldLabel: 'SRF Number',
            previousValue: 'OLD',
            newValue: 'NEW',
            section: 'summary',
          },
        ],
        parameters: [],
        results: [],
        hasChanges: true,
      }

      expect(generateChangeSummary(changeSet)).toBe('Updated 1 field')
    })

    it('should summarize field changes correctly (plural)', () => {
      const changeSet: ChangeSet = {
        certificateFields: [
          { field: 'srfNumber', fieldLabel: 'SRF Number', previousValue: 'a', newValue: 'b', section: 's' },
          { field: 'uucMake', fieldLabel: 'UUC Make', previousValue: 'c', newValue: 'd', section: 's' },
        ],
        parameters: [],
        results: [],
        hasChanges: true,
      }

      expect(generateChangeSummary(changeSet)).toBe('Updated 2 fields')
    })

    it('should summarize added parameters', () => {
      const changeSet: ChangeSet = {
        certificateFields: [],
        parameters: [
          { type: 'ADDED', parameterName: 'Temp' },
          { type: 'ADDED', parameterName: 'Humidity' },
        ],
        results: [],
        hasChanges: true,
      }

      expect(generateChangeSummary(changeSet)).toBe('Updated 2 parameters added')
    })

    it('should summarize modified parameters', () => {
      const changeSet: ChangeSet = {
        certificateFields: [],
        parameters: [
          { type: 'MODIFIED', parameterName: 'Temp', parameterId: 'p1', changes: [] },
        ],
        results: [],
        hasChanges: true,
      }

      expect(generateChangeSummary(changeSet)).toBe('Updated 1 parameter modified')
    })

    it('should summarize deleted parameters', () => {
      const changeSet: ChangeSet = {
        certificateFields: [],
        parameters: [
          { type: 'DELETED', parameterName: 'Temp', parameterId: 'p1' },
        ],
        results: [],
        hasChanges: true,
      }

      expect(generateChangeSummary(changeSet)).toBe('Updated 1 parameter deleted')
    })

    it('should combine multiple change types', () => {
      const changeSet: ChangeSet = {
        certificateFields: [
          { field: 'srfNumber', fieldLabel: 'SRF', previousValue: 'a', newValue: 'b', section: 's' },
        ],
        parameters: [
          { type: 'ADDED', parameterName: 'Temp' },
          { type: 'MODIFIED', parameterName: 'Humidity', parameterId: 'p1', changes: [] },
        ],
        results: [],
        hasChanges: true,
      }

      const summary = generateChangeSummary(changeSet)
      expect(summary).toContain('1 field')
      expect(summary).toContain('1 parameter added')
      expect(summary).toContain('1 parameter modified')
    })
  })

  describe('FIELD_LABELS', () => {
    it('should have labels for all summary fields', () => {
      expect(FIELD_LABELS.calibratedAt).toEqual({ label: 'Calibrated At', section: 'summary' })
      expect(FIELD_LABELS.srfNumber).toEqual({ label: 'SRF Number', section: 'summary' })
      expect(FIELD_LABELS.dateOfCalibration).toEqual({ label: 'Date of Calibration', section: 'summary' })
    })

    it('should have labels for UUC fields', () => {
      expect(FIELD_LABELS.uucDescription.section).toBe('uuc-details')
      expect(FIELD_LABELS.uucMake.section).toBe('uuc-details')
      expect(FIELD_LABELS.uucModel.section).toBe('uuc-details')
    })

    it('should have labels for environmental fields', () => {
      expect(FIELD_LABELS.ambientTemperature.section).toBe('environment')
      expect(FIELD_LABELS.relativeHumidity.section).toBe('environment')
    })
  })

  describe('PARAMETER_FIELD_LABELS', () => {
    it('should have labels for parameter fields', () => {
      expect(PARAMETER_FIELD_LABELS.parameterName).toBe('Parameter Name')
      expect(PARAMETER_FIELD_LABELS.rangeMin).toBe('Range Min')
      expect(PARAMETER_FIELD_LABELS.rangeMax).toBe('Range Max')
      expect(PARAMETER_FIELD_LABELS.leastCountValue).toBe('Least Count')
      expect(PARAMETER_FIELD_LABELS.accuracyValue).toBe('Accuracy Value')
    })
  })
})
