// Legacy MasterInstrument shape, derived from the registry.
//
// This is the seam for retiring src/data/master-instruments.json. Rather than change
// every consumer at once, the registry projects the old shape, consumers keep working
// unchanged, and each one moves to registry-native data on its own schedule. When the
// last one has moved, this file and the JSON go together.
//
// What can be derived, and what cannot, was measured across all 209 instruments rather
// than assumed:
//
//   Identity and status  - fully derivable. Every difference between the two files is
//                          representational, not substantive: composites are {ind, sen}
//                          in the old file and a joined string plus _parts in the
//                          registry, dates are M/D/YYYY against ISO, and absent values
//                          are '' against null.
//   remarks              - dead. Populated on 0 of 209 rows, so nothing is lost.
//   range, parameter,    - NOT derivable, and deliberately so: capability_profiles
//   parameter_group        supersedes them with per-bucket least count and accuracy
//                          that the old shape cannot express. A consumer still reading
//                          these is a consumer still to be migrated, which is what
//                          LEGACY_ONLY_FIELDS records.
//
// So the projection covers identity and status only. It is not a way to keep the old
// capability model alive.

import type {
  InstrumentCategory,
  InstrumentStatus,
  MasterInstrument,
} from '@/lib/master-instruments'
import type { IndSenParts, RegistryAsset, RegistryUnit } from '@/lib/master-instrument-registry'

/**
 * Fields the registry cannot produce, because the capability profile replaced them.
 *
 * Kept as data so a test can assert the list only ever shrinks: each entry is a piece
 * of the old model still in use somewhere, and removing one is what finishing a
 * migration step looks like.
 */
export const LEGACY_ONLY_FIELDS = ['range', 'parameter', 'parameter_group'] as const

export type LegacyOnlyField = (typeof LEGACY_ONLY_FIELDS)[number]

/** The part of MasterInstrument the registry can produce on its own. */
export type ProjectedInstrument = Omit<MasterInstrument, LegacyOnlyField | 'remarks'>

/**
 * Composite instruments are one indicator plus one sensor. The old file holds that as
 * an object; the registry holds the printed string plus the same object in _parts, so
 * the object is what projects back.
 */
function projectValue(whole: string | null, parts: IndSenParts | null): string | IndSenParts {
  if (parts) return parts
  return whole ?? ''
}

/**
 * ISO to the M/D/YYYY the old file uses, without leading zeros.
 *
 * Deliberately not Date.parse: an ISO date string parsed as a Date is UTC midnight,
 * which renders as the previous day anywhere west of Greenwich. A due date that moves
 * by a day decides whether an instrument reads as expired.
 */
export function isoToLegacyDate(iso: string | null): string {
  if (!iso) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return ''
  const [, year, month, day] = match
  return `${Number(month)}/${Number(day)}/${year}`
}

/** Build the legacy identity and status view of one registry unit. */
export function projectLegacyInstrument(
  asset: RegistryAsset,
  unit: RegistryUnit,
): ProjectedInstrument {
  return {
    id: unit.legacy_id,
    type: (unit.category ?? '') as InstrumentCategory,
    instrument_desc: unit.instrument_desc ?? '',
    make: projectValue(unit.make, unit.make_parts),
    model: projectValue(unit.model, unit.model_parts),
    asset_no: asset.asset_no,
    instrument_sl_no: projectValue(unit.serial_no, unit.serial_parts),
    usage: (unit.usage ?? '') as MasterInstrument['usage'],
    calibrated_at: unit.calibrated_at ?? '',
    report_no: unit.report_no ?? '',
    next_due_on: isoToLegacyDate(unit.next_due_on),
    sop_references: unit.sop_references,
    // The registry has already worked the status out, including the 60-day warning
    // window, so recomputing it here would be a second implementation to disagree with.
    // UNKNOWN has no legacy equivalent: those are units known only from a certificate,
    // with no master-list record and so no due date to be valid against.
    status:
      unit.calibration_state === 'UNKNOWN'
        ? undefined
        : (unit.calibration_state as InstrumentStatus),
    daysUntilExpiry: unit.calibration_days ?? undefined,
  }
}
