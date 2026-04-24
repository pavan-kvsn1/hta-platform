/**
 * Change Detection Utility
 *
 * Detects field-level changes between existing and incoming certificate data
 * for audit logging. Ported from hta-calibration.
 */

export interface FieldChange {
  field: string
  fieldLabel: string
  previousValue: unknown
  newValue: unknown
  section: string
}

export interface ParameterChange {
  type: 'ADDED' | 'MODIFIED' | 'DELETED'
  parameterName: string
  parameterId?: string
  changes?: FieldChange[]
}

export interface ChangeSet {
  certificateFields: FieldChange[]
  parameters: ParameterChange[]
  hasChanges: boolean
}

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
  uucDescription: { label: 'UUC Description', section: 'uuc-details' },
  uucMake: { label: 'UUC Make', section: 'uuc-details' },
  uucModel: { label: 'UUC Model', section: 'uuc-details' },
  uucSerialNumber: { label: 'UUC Serial Number', section: 'uuc-details' },
  uucInstrumentId: { label: 'UUC Instrument ID', section: 'uuc-details' },
  uucLocationName: { label: 'UUC Location', section: 'uuc-details' },
  uucMachineName: { label: 'UUC Machine Name', section: 'uuc-details' },
  ambientTemperature: { label: 'Ambient Temperature', section: 'environment' },
  relativeHumidity: { label: 'Relative Humidity', section: 'environment' },
  calibrationStatus: { label: 'Calibration Status', section: 'remarks' },
  stickerOldRemoved: { label: 'Old Sticker Removed', section: 'remarks' },
  stickerNewAffixed: { label: 'New Sticker Affixed', section: 'remarks' },
  selectedConclusionStatements: { label: 'Conclusion Statements', section: 'conclusion' },
  additionalConclusionStatement: { label: 'Additional Conclusion', section: 'conclusion' },
}

const PARAMETER_FIELD_LABELS: Record<string, string> = {
  parameterName: 'Parameter Name',
  parameterUnit: 'Parameter Unit',
  rangeMin: 'Range Min',
  rangeMax: 'Range Max',
  rangeUnit: 'Range Unit',
  operatingMin: 'Operating Min',
  operatingMax: 'Operating Max',
  operatingUnit: 'Operating Unit',
  leastCountValue: 'Least Count',
  leastCountUnit: 'Least Count Unit',
  accuracyValue: 'Accuracy Value',
  accuracyUnit: 'Accuracy Unit',
  accuracyType: 'Accuracy Type',
  errorFormula: 'Error Formula',
  showAfterAdjustment: 'Show After Adjustment',
  requiresBinning: 'Requires Binning',
  sopReference: 'SOP Reference',
  masterInstrumentId: 'Master Instrument',
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value.toISOString().split('T')[0]
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.split('T')[0]
  if (Array.isArray(value)) return JSON.stringify([...value].sort())
  return value
}

function valuesAreDifferent(prev: unknown, next: unknown): boolean {
  const a = normalizeValue(prev)
  const b = normalizeValue(next)
  if (typeof a === 'string' && typeof b === 'string') {
    try {
      const pa = JSON.parse(a)
      const pb = JSON.parse(b)
      if (Array.isArray(pa) && Array.isArray(pb)) {
        return JSON.stringify([...pa].sort()) !== JSON.stringify([...pb].sort())
      }
    } catch { /* not JSON */ }
  }
  return a !== b
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (value instanceof Date) return value.toISOString().split('T')[0]
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.split('T')[0]
  if (Array.isArray(value)) return value.join(', ') || '(none)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.join(', ') || '(none)'
    } catch { /* not JSON */ }
  }
  return String(value)
}

export function detectCertificateChanges(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): ChangeSet {
  // Certificate field changes
  const certificateFields: FieldChange[] = []
  for (const field of Object.keys(FIELD_LABELS)) {
    const cfg = FIELD_LABELS[field]
    if (valuesAreDifferent(existing[field], incoming[field])) {
      certificateFields.push({
        field,
        fieldLabel: cfg.label,
        previousValue: formatValue(existing[field]),
        newValue: formatValue(incoming[field]),
        section: cfg.section,
      })
    }
  }

  // Parameter changes
  const existingParams = (existing.parameters || []) as Array<{ id: string; parameterName: string } & Record<string, unknown>>
  const incomingParams = (incoming.parameters || []) as Array<{ dbId?: string; id?: string; parameterName: string } & Record<string, unknown>>
  const parameters: ParameterChange[] = []

  const existingMap = new Map(existingParams.map(p => [p.id, p]))
  const seenIds = new Set<string>()

  for (const inc of incomingParams) {
    const dbId = inc.dbId || inc.id
    const ex = dbId ? existingMap.get(dbId) : null
    if (ex) {
      seenIds.add(ex.id)
      const changes: FieldChange[] = []
      for (const f of Object.keys(PARAMETER_FIELD_LABELS)) {
        if (valuesAreDifferent(ex[f], inc[f])) {
          changes.push({ field: f, fieldLabel: PARAMETER_FIELD_LABELS[f], previousValue: formatValue(ex[f]), newValue: formatValue(inc[f]), section: 'results' })
        }
      }
      if (changes.length > 0) {
        parameters.push({ type: 'MODIFIED', parameterName: inc.parameterName || ex.parameterName, parameterId: ex.id, changes })
      }
    } else {
      parameters.push({ type: 'ADDED', parameterName: inc.parameterName || '(unnamed)' })
    }
  }
  for (const ex of existingParams) {
    if (!seenIds.has(ex.id)) {
      parameters.push({ type: 'DELETED', parameterName: ex.parameterName || '(unnamed)', parameterId: ex.id })
    }
  }

  return {
    certificateFields,
    parameters,
    hasChanges: certificateFields.length > 0 || parameters.length > 0,
  }
}

export function generateChangeSummary(changeSet: ChangeSet): string {
  const parts: string[] = []
  if (changeSet.certificateFields.length > 0) {
    parts.push(`${changeSet.certificateFields.length} field${changeSet.certificateFields.length > 1 ? 's' : ''}`)
  }
  const added = changeSet.parameters.filter(p => p.type === 'ADDED').length
  const modified = changeSet.parameters.filter(p => p.type === 'MODIFIED').length
  const deleted = changeSet.parameters.filter(p => p.type === 'DELETED').length
  if (added > 0) parts.push(`${added} parameter${added > 1 ? 's' : ''} added`)
  if (modified > 0) parts.push(`${modified} parameter${modified > 1 ? 's' : ''} modified`)
  if (deleted > 0) parts.push(`${deleted} parameter${deleted > 1 ? 's' : ''} deleted`)
  return parts.length === 0 ? 'No changes' : `Updated ${parts.join(', ')}`
}
