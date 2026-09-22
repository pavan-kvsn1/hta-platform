/**
 * A master entry, as every read-only view and every PDF needs it.
 *
 * Six pages built this object by hand and five of them listed five fields, so the
 * certificate number, where it was calibrated, which parameter it served and the
 * specification it was chosen against never reached the page. Each omission looked
 * like a missing feature rather than a dropped field, which is how the master's least
 * count reached the database and printed as "Not recorded".
 *
 * One mapper, so a field added to the row reaches every reader at once.
 */
import { leastCountText, type LeastCountFromStore } from '@/lib/utils/least-count'

export interface MasterInstrumentRow {
  id: string
  masterInstrumentId?: string | null
  parameterId?: string | null
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
  /** DECIMAL in the database, so a server component reading Prisma gets an object. */
  masterLeastCount?: LeastCountFromStore
  masterLeastCountUnit?: string | null
  masterAccuracy?: string | null
  masterAccuracyUnit?: string | null
}

export function masterEntryForView(mi: MasterInstrumentRow) {
  return {
    id: mi.id,
    masterInstrumentId: parseInt(String(mi.masterInstrumentId ?? '')) || 0,
    /** Which parameter this entry served, so a PDF can group by instrument. */
    parameterId: mi.parameterId || '',
    category: mi.category || '',
    description: mi.description || '',
    make: mi.make || '',
    model: mi.model || '',
    assetNo: mi.assetNo || '',
    serialNumber: mi.serialNumber || '',
    calibratedAt: mi.calibratedAt || '',
    reportNo: mi.reportNo || '',
    calibrationDueDate: mi.calibrationDueDate || '',
    /** What the master's own certificate said when it was chosen. */
    capabilityParameter: mi.capabilityParameter || '',
    masterLeastCount: leastCountText(mi.masterLeastCount),
    masterLeastCountUnit: mi.masterLeastCountUnit || '',
    masterAccuracy: mi.masterAccuracy || '',
    masterAccuracyUnit: mi.masterAccuracyUnit || '',
    isExpired: false,
    isExpiringSoon: false,
  }
}
