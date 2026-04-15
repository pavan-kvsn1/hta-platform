/**
 * Change Detection Unit Tests
 *
 * Tests for detecting changes between certificate versions:
 * - Field-level change detection
 * - Parameter additions/deletions/modifications
 * - Change summary generation
 *
 * Migrated from hta-calibration/tests/unit/change-detection.test.ts
 * Self-contained version with mock implementations
 */
import { describe, it, expect } from 'vitest'

// Types
interface FieldChange {
  field: string
  fieldLabel: string
  previousValue: string
  newValue: string
  section: string
}

interface ParameterChange {
  type: 'ADDED' | 'DELETED' | 'MODIFIED'
  parameterName: string
  parameterId?: string
  changes?: FieldChange[]
}

interface ChangeSet {
  certificateFields: FieldChange[]
  parameters: ParameterChange[]
  results: unknown[]
  hasChanges: boolean
}

// Field labels configuration
const FIELD_LABELS: Record<string, { label: string; section: string }> = {
  calibratedAt: { label: 'Calibrated At', section: 'summary' },
  srfNumber: { label: 'SRF Number', section: 'summary' },
  srfDate: { label: 'SRF Date', section: 'summary' },
  dateOfCalibration: { label: 'Date of Calibration', section: 'summary' },
  calibrationTenure: { label: 'Calibration Tenure', section: 'summary' },
  dueDateAdjustment: { label: 'Due Date Adjustment', section: 'summary' },
  calibrationDueDate: { label: 'Calibration Due Date', section: 'summary' },
  dueDateNotApplicable: { label: 'Due Date Not Applicable', section: 'summary' },
  customerName: { label: 'Customer Name', section: 'summary' },
  customerAddress: { label: 'Customer Address', section: 'summary' },
  uucDescription: { label: 'Description', section: 'uuc-details' },
  uucMake: { label: 'Make', section: 'uuc-details' },
  uucModel: { label: 'Model', section: 'uuc-details' },
  uucSerialNumber: { label: 'Serial Number', section: 'uuc-details' },
  uucInstrumentId: { label: 'Instrument ID', section: 'uuc-details' },
  uucLocationName: { label: 'Location', section: 'uuc-details' },
  uucMachineName: { label: 'Machine Name', section: 'uuc-details' },
  ambientTemperature: { label: 'Ambient Temperature', section: 'environment' },
  relativeHumidity: { label: 'Relative Humidity', section: 'environment' },
  calibrationStatus: { label: 'Calibration Status', section: 'conclusion' },
  engineerNotes: { label: 'Engineer Notes', section: 'remarks' },
}

const PARAMETER_FIELD_LABELS: Record<string, string> = {
  parameterName: 'Parameter Name',
  parameterUnit: 'Unit',
  rangeMin: 'Range Min',
  rangeMax: 'Range Max',
  accuracyValue: 'Accuracy Value',
  accuracyType: 'Accuracy Type',
  errorFormula: 'Error Formula',
  sopReference: 'SOP Reference',
}

// Utility functions
function normalizeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value instanceof Date) return value.toISOString().split('T')[0]
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.split('T')[0]
  }
  return String(value)
}

function parseArrayField(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.sort()
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.sort() : []
    } catch {
      return []
    }
  }
  return []
}

function detectCertificateChanges(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): ChangeSet {
  const certificateFields: FieldChange[] = []
  const parameters: ParameterChange[] = []

  // Detect certificate field changes
  for (const field of Object.keys(FIELD_LABELS)) {
    const prev = existing[field]
    const next = incoming[field]

    // Special handling for array fields
    if (field === 'calibrationStatus') {
      const prevArray = parseArrayField(prev)
      const nextArray = parseArrayField(next)
      if (JSON.stringify(prevArray) !== JSON.stringify(nextArray)) {
        certificateFields.push({
          field,
          fieldLabel: FIELD_LABELS[field].label,
          previousValue: prevArray.join(', '),
          newValue: nextArray.join(', '),
          section: FIELD_LABELS[field].section,
        })
      }
      continue
    }

    const prevNorm = normalizeValue(prev)
    const nextNorm = normalizeValue(next)

    if (prevNorm !== nextNorm) {
      certificateFields.push({
        field,
        fieldLabel: FIELD_LABELS[field].label,
        previousValue: prevNorm,
        newValue: nextNorm,
        section: FIELD_LABELS[field].section,
      })
    }
  }

  // Detect parameter changes
  const existingParams = (existing.parameters as Array<{ id?: string; parameterName?: string; [key: string]: unknown }>) || []
  const incomingParams = (incoming.parameters as Array<{ id?: string; dbId?: string; parameterName?: string; [key: string]: unknown }>) || []

  // Map existing params by ID
  const existingById = new Map(existingParams.map((p) => [p.id, p]))
  const processedIds = new Set<string>()

  // Check incoming params
  for (const incParam of incomingParams) {
    const dbId = incParam.dbId || incParam.id
    if (dbId && existingById.has(dbId)) {
      // Modified or unchanged
      processedIds.add(dbId)
      const existingParam = existingById.get(dbId)!
      const changes: FieldChange[] = []

      for (const field of Object.keys(PARAMETER_FIELD_LABELS)) {
        const prev = normalizeValue(existingParam[field])
        const next = normalizeValue(incParam[field])
        if (prev !== next) {
          changes.push({
            field,
            fieldLabel: PARAMETER_FIELD_LABELS[field],
            previousValue: prev,
            newValue: next,
            section: 'parameters',
          })
        }
      }

      if (changes.length > 0) {
        parameters.push({
          type: 'MODIFIED',
          parameterName: incParam.parameterName || existingParam.parameterName || 'Unknown',
          parameterId: dbId,
          changes,
        })
      }
    } else {
      // Added
      parameters.push({
        type: 'ADDED',
        parameterName: incParam.parameterName || 'Unknown',
      })
    }
  }

  // Check for deleted params
  for (const existingParam of existingParams) {
    if (!processedIds.has(existingParam.id!)) {
      parameters.push({
        type: 'DELETED',
        parameterName: existingParam.parameterName || 'Unknown',
        parameterId: existingParam.id,
      })
    }
  }

  return {
    certificateFields,
    parameters,
    results: [],
    hasChanges: certificateFields.length > 0 || parameters.length > 0,
  }
}

function generateChangeSummary(changeSet: ChangeSet): string {
  if (!changeSet.hasChanges) return 'No changes'

  const parts: string[] = []

  if (changeSet.certificateFields.length > 0) {
    const count = changeSet.certificateFields.length
    parts.push(`${count} field${count === 1 ? '' : 's'}`)
  }

  const added = changeSet.parameters.filter((p) => p.type === 'ADDED').length
  const modified = changeSet.parameters.filter((p) => p.type === 'MODIFIED').length
  const deleted = changeSet.parameters.filter((p) => p.type === 'DELETED').length

  if (added > 0) parts.push(`${added} parameter${added === 1 ? '' : 's'} added`)
  if (modified > 0) parts.push(`${modified} parameter${modified === 1 ? '' : 's'} modified`)
  if (deleted > 0) parts.push(`${deleted} parameter${deleted === 1 ? '' : 's'} deleted`)

  return `Updated ${parts.join(', ')}`
}

describe('change-detection', () => {
  describe('detectCertificateChanges', () => {
    describe('certificate field changes', () => {
      it('detects simple field changes', () => {
        const existing = {
          customerName: 'ABC Corp',
          customerAddress: '123 Main St',
        }
        const incoming = {
          customerName: 'ABC Corporation',
          customerAddress: '123 Main St',
        }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(true)
        expect(result.certificateFields).toHaveLength(1)
        expect(result.certificateFields[0].field).toBe('customerName')
        expect(result.certificateFields[0].fieldLabel).toBe('Customer Name')
        expect(result.certificateFields[0].previousValue).toBe('ABC Corp')
        expect(result.certificateFields[0].newValue).toBe('ABC Corporation')
        expect(result.certificateFields[0].section).toBe('summary')
      })

      it('detects multiple field changes', () => {
        const existing = {
          customerName: 'ABC Corp',
          customerAddress: '123 Main St',
          uucDescription: 'Multimeter',
        }
        const incoming = {
          customerName: 'XYZ Corp',
          customerAddress: '456 Oak Ave',
          uucDescription: 'Multimeter',
        }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(true)
        expect(result.certificateFields).toHaveLength(2)
        expect(result.certificateFields.map((c) => c.field)).toContain('customerName')
        expect(result.certificateFields.map((c) => c.field)).toContain('customerAddress')
      })

      it('treats null and empty string as equivalent', () => {
        const existing = { customerName: null }
        const incoming = { customerName: '' }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.certificateFields).toHaveLength(0)
        expect(result.hasChanges).toBe(false)
      })

      it('treats undefined and empty string as equivalent', () => {
        const existing = {}
        const incoming = { customerName: '' }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.certificateFields).toHaveLength(0)
        expect(result.hasChanges).toBe(false)
      })

      it('compares array fields correctly (calibrationStatus)', () => {
        const existing = {
          calibrationStatus: '["OK", "IN_LIMIT"]',
        }
        const incoming = {
          calibrationStatus: '["IN_LIMIT", "OK"]', // Same items, different order
        }

        const result = detectCertificateChanges(existing, incoming)

        // Should not detect a change because both arrays have the same items
        expect(result.certificateFields.filter((c) => c.field === 'calibrationStatus')).toHaveLength(
          0
        )
      })

      it('detects array field changes when items differ', () => {
        const existing = {
          calibrationStatus: '["OK"]',
        }
        const incoming = {
          calibrationStatus: '["OK", "ADJUSTED"]',
        }

        const result = detectCertificateChanges(existing, incoming)

        const statusChange = result.certificateFields.find((c) => c.field === 'calibrationStatus')
        expect(statusChange).toBeDefined()
      })

      it('handles date comparisons correctly', () => {
        const existing = {
          dateOfCalibration: new Date('2024-01-15'),
        }
        const incoming = {
          dateOfCalibration: '2024-01-15',
        }

        const result = detectCertificateChanges(existing, incoming)

        // Should not detect a change because both represent the same date
        expect(
          result.certificateFields.filter((c) => c.field === 'dateOfCalibration')
        ).toHaveLength(0)
      })

      it('detects date changes', () => {
        const existing = {
          dateOfCalibration: new Date('2024-01-15'),
        }
        const incoming = {
          dateOfCalibration: '2024-01-20',
        }

        const result = detectCertificateChanges(existing, incoming)

        const dateChange = result.certificateFields.find((c) => c.field === 'dateOfCalibration')
        expect(dateChange).toBeDefined()
        expect(dateChange?.previousValue).toBe('2024-01-15')
        expect(dateChange?.newValue).toBe('2024-01-20')
      })

      it('detects boolean field changes', () => {
        const existing = {
          dueDateNotApplicable: false,
        }
        const incoming = {
          dueDateNotApplicable: true,
        }

        const result = detectCertificateChanges(existing, incoming)

        const boolChange = result.certificateFields.find((c) => c.field === 'dueDateNotApplicable')
        expect(boolChange).toBeDefined()
        expect(boolChange?.previousValue).toBe('No')
        expect(boolChange?.newValue).toBe('Yes')
      })
    })

    describe('parameter changes', () => {
      it('detects added parameters', () => {
        const existing = {
          parameters: [],
        }
        const incoming = {
          parameters: [{ parameterName: 'Temperature' }],
        }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.parameters).toHaveLength(1)
        expect(result.parameters[0].type).toBe('ADDED')
        expect(result.parameters[0].parameterName).toBe('Temperature')
      })

      it('detects deleted parameters', () => {
        const existing = {
          parameters: [{ id: 'param-1', parameterName: 'Temperature' }],
        }
        const incoming = {
          parameters: [],
        }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.parameters).toHaveLength(1)
        expect(result.parameters[0].type).toBe('DELETED')
        expect(result.parameters[0].parameterName).toBe('Temperature')
        expect(result.parameters[0].parameterId).toBe('param-1')
      })

      it('detects modified parameters by dbId', () => {
        const existing = {
          parameters: [{ id: 'param-1', parameterName: 'Temperature', parameterUnit: 'C' }],
        }
        const incoming = {
          parameters: [{ dbId: 'param-1', parameterName: 'Temperature', parameterUnit: 'F' }],
        }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.parameters).toHaveLength(1)
        expect(result.parameters[0].type).toBe('MODIFIED')
        expect(result.parameters[0].parameterName).toBe('Temperature')
        expect(result.parameters[0].changes).toBeDefined()
        expect(result.parameters[0].changes?.some((c) => c.field === 'parameterUnit')).toBe(true)
      })

      it('does not report modification when parameter unchanged', () => {
        const existing = {
          parameters: [{ id: 'param-1', parameterName: 'Temperature', parameterUnit: 'C' }],
        }
        const incoming = {
          parameters: [{ dbId: 'param-1', parameterName: 'Temperature', parameterUnit: 'C' }],
        }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.parameters).toHaveLength(0)
      })
    })

    describe('hasChanges flag', () => {
      it('returns false when no changes detected', () => {
        const existing = {
          customerName: 'ABC Corp',
          parameters: [{ id: 'p1', parameterName: 'Temp' }],
        }
        const incoming = {
          customerName: 'ABC Corp',
          parameters: [{ dbId: 'p1', parameterName: 'Temp' }],
        }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(false)
      })

      it('returns true when certificate field changes', () => {
        const existing = { customerName: 'ABC' }
        const incoming = { customerName: 'XYZ' }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(true)
      })

      it('returns true when parameters change', () => {
        const existing = { parameters: [] }
        const incoming = { parameters: [{ parameterName: 'New' }] }

        const result = detectCertificateChanges(existing, incoming)

        expect(result.hasChanges).toBe(true)
      })
    })
  })

  describe('generateChangeSummary', () => {
    it('generates summary for field changes only', () => {
      const changeSet: ChangeSet = {
        certificateFields: [
          {
            field: 'customerName',
            fieldLabel: 'Customer Name',
            previousValue: 'A',
            newValue: 'B',
            section: 'summary',
          },
          {
            field: 'customerAddress',
            fieldLabel: 'Customer Address',
            previousValue: 'X',
            newValue: 'Y',
            section: 'summary',
          },
        ],
        parameters: [],
        results: [],
        hasChanges: true,
      }

      const summary = generateChangeSummary(changeSet)

      expect(summary).toBe('Updated 2 fields')
    })

    it('generates summary for single field change', () => {
      const changeSet: ChangeSet = {
        certificateFields: [
          {
            field: 'customerName',
            fieldLabel: 'Customer Name',
            previousValue: 'A',
            newValue: 'B',
            section: 'summary',
          },
        ],
        parameters: [],
        results: [],
        hasChanges: true,
      }

      const summary = generateChangeSummary(changeSet)

      expect(summary).toBe('Updated 1 field')
    })

    it('generates summary for parameter changes', () => {
      const changeSet: ChangeSet = {
        certificateFields: [],
        parameters: [
          { type: 'ADDED' as const, parameterName: 'Temp' },
          { type: 'ADDED' as const, parameterName: 'Pressure' },
        ],
        results: [],
        hasChanges: true,
      }

      const summary = generateChangeSummary(changeSet)

      expect(summary).toBe('Updated 2 parameters added')
    })

    it('generates summary for mixed changes', () => {
      const changeSet: ChangeSet = {
        certificateFields: [
          {
            field: 'customerName',
            fieldLabel: 'Customer Name',
            previousValue: 'A',
            newValue: 'B',
            section: 'summary',
          },
        ],
        parameters: [
          { type: 'MODIFIED' as const, parameterName: 'Temp', changes: [] },
          { type: 'DELETED' as const, parameterName: 'Old', parameterId: 'p1' },
        ],
        results: [],
        hasChanges: true,
      }

      const summary = generateChangeSummary(changeSet)

      expect(summary).toContain('1 field')
      expect(summary).toContain('1 parameter modified')
      expect(summary).toContain('1 parameter deleted')
    })

    it('returns "No changes" when no changes detected', () => {
      const changeSet: ChangeSet = {
        certificateFields: [],
        parameters: [],
        results: [],
        hasChanges: false,
      }

      const summary = generateChangeSummary(changeSet)

      expect(summary).toBe('No changes')
    })
  })

  describe('FIELD_LABELS', () => {
    it('contains all expected summary fields', () => {
      const summaryFields = [
        'calibratedAt',
        'srfNumber',
        'srfDate',
        'dateOfCalibration',
        'calibrationTenure',
        'dueDateAdjustment',
        'calibrationDueDate',
        'dueDateNotApplicable',
        'customerName',
        'customerAddress',
      ]

      for (const field of summaryFields) {
        expect(FIELD_LABELS[field]).toBeDefined()
        expect(FIELD_LABELS[field].section).toBe('summary')
      }
    })

    it('contains all expected UUC details fields', () => {
      const uucFields = [
        'uucDescription',
        'uucMake',
        'uucModel',
        'uucSerialNumber',
        'uucInstrumentId',
        'uucLocationName',
        'uucMachineName',
      ]

      for (const field of uucFields) {
        expect(FIELD_LABELS[field]).toBeDefined()
        expect(FIELD_LABELS[field].section).toBe('uuc-details')
      }
    })

    it('contains all expected environmental fields', () => {
      const envFields = ['ambientTemperature', 'relativeHumidity']

      for (const field of envFields) {
        expect(FIELD_LABELS[field]).toBeDefined()
        expect(FIELD_LABELS[field].section).toBe('environment')
      }
    })
  })

  describe('PARAMETER_FIELD_LABELS', () => {
    it('contains all expected parameter fields', () => {
      const paramFields = [
        'parameterName',
        'parameterUnit',
        'rangeMin',
        'rangeMax',
        'accuracyValue',
        'accuracyType',
        'errorFormula',
        'sopReference',
      ]

      for (const field of paramFields) {
        expect(PARAMETER_FIELD_LABELS[field]).toBeDefined()
      }
    })
  })
})
