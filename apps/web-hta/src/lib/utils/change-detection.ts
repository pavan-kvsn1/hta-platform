/**
 * Change Detection Utility
 *
 * Detects field-level changes between existing and incoming certificate data
 * for audit logging and optimistic concurrency control.
 */

// Core types
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

export interface ResultChange {
  type: 'ADDED' | 'MODIFIED' | 'DELETED'
  pointNumber: number
  parameterId: string
  parameterName: string
}

export interface ChangeSet {
  certificateFields: FieldChange[]
  parameters: ParameterChange[]
  results: ResultChange[]
  hasChanges: boolean
}

// Field label mappings for human-readable audit logs
export const FIELD_LABELS: Record<string, { label: string; section: string }> = {
  // Summary section
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

  // UUC Details section
  uucDescription: { label: 'UUC Description', section: 'uuc-details' },
  uucMake: { label: 'UUC Make', section: 'uuc-details' },
  uucModel: { label: 'UUC Model', section: 'uuc-details' },
  uucSerialNumber: { label: 'UUC Serial Number', section: 'uuc-details' },
  uucInstrumentId: { label: 'UUC Instrument ID', section: 'uuc-details' },
  uucLocationName: { label: 'UUC Location', section: 'uuc-details' },
  uucMachineName: { label: 'UUC Machine Name', section: 'uuc-details' },

  // Environmental section
  ambientTemperature: { label: 'Ambient Temperature', section: 'environment' },
  relativeHumidity: { label: 'Relative Humidity', section: 'environment' },

  // Remarks section
  calibrationStatus: { label: 'Calibration Status', section: 'remarks' },
  stickerOldRemoved: { label: 'Old Sticker Removed', section: 'remarks' },
  stickerNewAffixed: { label: 'New Sticker Affixed', section: 'remarks' },

  // Conclusion section
  selectedConclusionStatements: { label: 'Conclusion Statements', section: 'conclusion' },
  additionalConclusionStatement: { label: 'Additional Conclusion', section: 'conclusion' },
}

// Parameter field labels
export const PARAMETER_FIELD_LABELS: Record<string, string> = {
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
  bins: 'Bins',
  sopReference: 'SOP Reference',
  masterInstrumentId: 'Master Instrument',
}

/**
 * Normalize a value for comparison
 * - Treats null, undefined, and empty string as equivalent
 * - Converts dates to ISO date strings (YYYY-MM-DD)
 * - Handles JSON arrays
 */
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined || value === '') {
    return null
  }

  // Handle Date objects - extract just the date part
  if (value instanceof Date) {
    return value.toISOString().split('T')[0]
  }

  // Handle date strings (ISO format) - extract just the date part
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.split('T')[0]
  }

  // Handle arrays (like calibrationStatus)
  if (Array.isArray(value)) {
    // Sort for consistent comparison
    return JSON.stringify([...value].sort())
  }

  return value
}

/**
 * Compare two values and determine if they are different
 */
function valuesAreDifferent(prev: unknown, next: unknown): boolean {
  const normalizedPrev = normalizeValue(prev)
  const normalizedNext = normalizeValue(next)

  // Handle JSON string comparison (e.g., calibrationStatus stored as JSON)
  if (typeof normalizedPrev === 'string' && typeof normalizedNext === 'string') {
    try {
      const parsedPrev = JSON.parse(normalizedPrev)
      const parsedNext = JSON.parse(normalizedNext)
      if (Array.isArray(parsedPrev) && Array.isArray(parsedNext)) {
        return JSON.stringify([...parsedPrev].sort()) !== JSON.stringify([...parsedNext].sort())
      }
    } catch {
      // Not JSON, compare as strings
    }
  }

  return normalizedPrev !== normalizedNext
}

/**
 * Format a value for display in audit logs
 */
function formatValueForDisplay(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '(empty)'
  }

  if (value instanceof Date) {
    return value.toISOString().split('T')[0]
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.split('T')[0]
  }

  if (Array.isArray(value)) {
    return value.join(', ') || '(none)'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  // Try to parse JSON arrays stored as strings
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.join(', ') || '(none)'
      }
    } catch {
      // Not JSON, return as-is
    }
  }

  return String(value)
}

/**
 * Detect changes in certificate fields
 */
function detectCertificateFieldChanges(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): FieldChange[] {
  const changes: FieldChange[] = []

  for (const field of Object.keys(FIELD_LABELS)) {
    const fieldConfig = FIELD_LABELS[field]
    const existingValue = existing[field]
    const incomingValue = incoming[field]

    if (valuesAreDifferent(existingValue, incomingValue)) {
      changes.push({
        field,
        fieldLabel: fieldConfig.label,
        previousValue: formatValueForDisplay(existingValue),
        newValue: formatValueForDisplay(incomingValue),
        section: fieldConfig.section,
      })
    }
  }

  return changes
}

/**
 * Compare two parameters and detect field-level changes
 */
function compareParameters(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): FieldChange[] {
  const changes: FieldChange[] = []

  for (const field of Object.keys(PARAMETER_FIELD_LABELS)) {
    const existingValue = existing[field]
    const incomingValue = incoming[field]

    if (valuesAreDifferent(existingValue, incomingValue)) {
      changes.push({
        field,
        fieldLabel: PARAMETER_FIELD_LABELS[field],
        previousValue: formatValueForDisplay(existingValue),
        newValue: formatValueForDisplay(incomingValue),
        section: 'results',
      })
    }
  }

  return changes
}

/**
 * Detect changes in parameters
 */
function detectParameterChanges(
  existingParams: Array<{ id: string; parameterName: string } & Record<string, unknown>>,
  incomingParams: Array<{ dbId?: string; id?: string; parameterName: string } & Record<string, unknown>>
): ParameterChange[] {
  const changes: ParameterChange[] = []

  // Build map of existing parameters by ID
  const existingMap = new Map(existingParams.map(p => [p.id, p]))
  const seenIds = new Set<string>()

  // Check each incoming parameter
  for (const incoming of incomingParams) {
    // dbId is the database ID that matches existing parameters
    const dbId = incoming.dbId || incoming.id
    const existing = dbId ? existingMap.get(dbId) : null

    if (existing) {
      // Mark as seen
      seenIds.add(existing.id)

      // Compare fields
      const fieldChanges = compareParameters(existing, incoming)

      if (fieldChanges.length > 0) {
        changes.push({
          type: 'MODIFIED',
          parameterName: incoming.parameterName || existing.parameterName,
          parameterId: existing.id,
          changes: fieldChanges,
        })
      }
    } else {
      // New parameter
      changes.push({
        type: 'ADDED',
        parameterName: incoming.parameterName || '(unnamed)',
      })
    }
  }

  // Check for deleted parameters
  for (const existing of existingParams) {
    if (!seenIds.has(existing.id)) {
      changes.push({
        type: 'DELETED',
        parameterName: existing.parameterName || '(unnamed)',
        parameterId: existing.id,
      })
    }
  }

  return changes
}

/**
 * Main function: Detect all changes between existing and incoming certificate data
 */
export function detectCertificateChanges(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): ChangeSet {
  // Detect certificate field changes
  const certificateFields = detectCertificateFieldChanges(existing, incoming)

  // Detect parameter changes
  const existingParams = (existing.parameters || []) as Array<{ id: string; parameterName: string } & Record<string, unknown>>
  const incomingParams = (incoming.parameters || []) as Array<{ dbId?: string; id?: string; parameterName: string } & Record<string, unknown>>
  const parameters = detectParameterChanges(existingParams, incomingParams)

  // Results changes are tracked as part of parameter changes
  const results: ResultChange[] = []

  const hasChanges = certificateFields.length > 0 || parameters.length > 0 || results.length > 0

  return {
    certificateFields,
    parameters,
    results,
    hasChanges,
  }
}

/**
 * Generate a human-readable summary of changes
 */
export function generateChangeSummary(changeSet: ChangeSet): string {
  const parts: string[] = []

  if (changeSet.certificateFields.length > 0) {
    parts.push(`${changeSet.certificateFields.length} field${changeSet.certificateFields.length > 1 ? 's' : ''}`)
  }

  const addedParams = changeSet.parameters.filter(p => p.type === 'ADDED').length
  const modifiedParams = changeSet.parameters.filter(p => p.type === 'MODIFIED').length
  const deletedParams = changeSet.parameters.filter(p => p.type === 'DELETED').length

  if (addedParams > 0) {
    parts.push(`${addedParams} parameter${addedParams > 1 ? 's' : ''} added`)
  }
  if (modifiedParams > 0) {
    parts.push(`${modifiedParams} parameter${modifiedParams > 1 ? 's' : ''} modified`)
  }
  if (deletedParams > 0) {
    parts.push(`${deletedParams} parameter${deletedParams > 1 ? 's' : ''} deleted`)
  }

  if (parts.length === 0) {
    return 'No changes'
  }

  return `Updated ${parts.join(', ')}`
}
