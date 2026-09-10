import type { SelectedMasterInstrument } from '@/lib/stores/certificate-store'

/**
 * A master entry as the API sends it.
 *
 * Everything optional, because certificates written at different times carry
 * different fields and the form has to open all of them.
 */
export interface ApiMasterEntry {
  parameterIndex?: number
  masterInstrumentId?: string | number
  category?: string | null
  description?: string | null
  make?: string | null
  model?: string | null
  assetNo?: string | null
  serialNumber?: string | null
  calibratedAt?: string | null
  reportNo?: string | null
  calibrationDueDate?: string | null
  capabilityParameter?: string | null
  masterLeastCount?: string | null
  masterLeastCountUnit?: string | null
  masterAccuracy?: string | null
  masterAccuracyUnit?: string | null
}

/**
 * One master entry, from what the API sends to what the form holds.
 *
 * Extracted from the edit page because a field left out here is invisible: the
 * certificate keeps it, the API sends it, and the form silently drops it - which is
 * how the master's least count reached the database and never reached the PDF.
 */
export function masterEntryFromApi(
  entry: ApiMasterEntry,
  parameters: { id: string }[],
  newId: () => string,
  now: Date = new Date(),
): SelectedMasterInstrument {
  const due = entry.calibrationDueDate ? new Date(entry.calibrationDueDate) : null
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  return {
    id: newId(),
    // The API answers with a position, since the parameters have only just been
    // written; the form works in the parameters' own ids.
    parameterId:
      entry.parameterIndex !== undefined && entry.parameterIndex >= 0
        ? parameters[entry.parameterIndex]?.id
        : undefined,
    masterInstrumentId: parseInt(String(entry.masterInstrumentId ?? '')) || 0,
    category: entry.category || '',
    description: entry.description || '',
    make: entry.make || '',
    model: entry.model || '',
    assetNo: entry.assetNo || '',
    serialNumber: entry.serialNumber || '',
    calibratedAt: entry.calibratedAt || '',
    reportNo: entry.reportNo || '',
    calibrationDueDate: entry.calibrationDueDate || '',
    // What the master's own certificate said when it was chosen.
    capabilityParameter: entry.capabilityParameter || '',
    masterLeastCount: entry.masterLeastCount || '',
    masterLeastCountUnit: entry.masterLeastCountUnit || '',
    masterAccuracy: entry.masterAccuracy || '',
    masterAccuracyUnit: entry.masterAccuracyUnit || '',
    isExpired: due ? due < now : false,
    isExpiringSoon: due ? due >= now && due <= thirtyDays : false,
  }
}
