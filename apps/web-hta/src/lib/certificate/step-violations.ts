/**
 * Readings that no instrument could have shown.
 *
 * A least count is the size of one division, so an instrument stepping in 0.05 shows
 * 49.70 and 49.75 and nothing between them. A stored 49.72 is therefore a typing error
 * or a wrong least count, and either way it is not a reading - it says the unit was
 * found accurate to a precision the instrument cannot resolve.
 *
 * This lives outside the results table because two places need the same answer: the
 * table, which shows the engineer where the reading went wrong while there is still
 * something to type, and the finalize checklist, which will not let the certificate
 * leave while any stand. Two implementations would drift, and the one that drifted
 * would be the gate.
 */
import { checkStep } from '@/lib/utils/least-count'
import {
  masterResolution,
  uucResolution,
  type ReadingResolution,
  type UucResolutionSource,
} from '@/lib/utils/reading-resolution'
import { declaredCapability } from '@/lib/master/capability'
import type { CapabilityBucket, CapabilityProfile } from '@/lib/master/registry'
import {
  fieldResolution,
  needsResolution,
  type CalibrationResultRow,
  type ErrorConfig,
  type FieldDefinition,
} from './fields'
import { getPrecisionFromLeastCount } from '@/lib/utils/calibration-precision'

/**
 * The parameter, declared structurally rather than imported.
 *
 * certificate-store's Parameter is far wider than this needs and importing it would tie
 * a pure module to the store. This shape is a subset of it and assignable from it.
 */
export interface StepCheckParameter extends UucResolutionSource {
  id?: string
  errorConfig: ErrorConfig
  fieldDefinitions: FieldDefinition[]
  resultRows: CalibrationResultRow[]
  masterInstrumentId?: number | null
  masterProfileId?: string | null
  masterSubtype?: string | null
}

/** One master named on the certificate, either for a parameter or for all of them. */
export interface MasterDeclaration {
  masterInstrumentId: number
  masterProfileId?: string | null
  masterSubtype?: string | null
  parameterId?: string | null
}

/** Just enough of the registry unit to find its profiles. */
export interface RegistryLookup {
  (legacyId: number): { capability_profiles?: CapabilityProfile[] } | undefined
}

/**
 * The bands of every master on this parameter, pooled.
 *
 * A parameter can be served by more than one - two instruments over the whole of it, or
 * each over a part. Each brings its own resolution, and which applies depends on where
 * in the range the reading sits, so the bands go in together and the row picks from
 * them. The parameter's own master is included whether or not an entry names it: that
 * is what certificates written before a parameter could hold several carry.
 */
export function masterBucketsFor(
  parameter: StepCheckParameter,
  masters: MasterDeclaration[],
  getUnitByLegacyId: RegistryLookup,
): CapabilityBucket[] {
  const declarations: { instrumentId: number; profileId?: string | null; subtype?: string | null }[] =
    []

  for (const entry of masters) {
    if (entry.masterInstrumentId <= 0 || !entry.masterProfileId) continue
    if (entry.parameterId && entry.parameterId !== parameter.id) continue
    if (!entry.parameterId && entry.masterInstrumentId !== parameter.masterInstrumentId) continue
    declarations.push({
      instrumentId: entry.masterInstrumentId,
      profileId: entry.masterProfileId,
      subtype: entry.masterSubtype,
    })
  }

  if (parameter.masterInstrumentId && parameter.masterProfileId) {
    const already = declarations.some(
      (d) =>
        d.instrumentId === parameter.masterInstrumentId &&
        d.profileId === parameter.masterProfileId,
    )
    if (!already) {
      declarations.push({
        instrumentId: parameter.masterInstrumentId,
        profileId: parameter.masterProfileId,
        subtype: parameter.masterSubtype,
      })
    }
  }

  return declarations.flatMap((d) => {
    const unit = getUnitByLegacyId(d.instrumentId)
    const profile = (unit?.capability_profiles ?? []).find((c) => c.id === d.profileId)
    return profile ? declaredCapability(profile, d.subtype).buckets : []
  })
}

/**
 * What each instrument resolves to at this row's point of the range.
 *
 * The master's comes from the registry band the reading falls in, the UUC's from the
 * parameter or its bin. This is what a column inherits when it has not declared a step
 * of its own.
 */
export function instrumentResolutions(
  row: { values: Record<string, string> },
  parameter: StepCheckParameter,
  masterBuckets: CapabilityBucket[],
): { master: ReadingResolution; uuc: ReadingResolution } {
  const master = Number(row.values[parameter.errorConfig.masterFieldId])
  const uuc = Number(row.values[parameter.errorConfig.uucFieldId])
  return {
    master: masterResolution(masterBuckets, master),
    // The UUC's bins are picked by the master reading, as the limit is - the bins
    // divide the range being calibrated, and the master says where in it the point
    // sits. A UUC reading that drifted is still that point of the range.
    uuc: uucResolution(parameter, Number.isFinite(master) ? master : uuc),
  }
}

/**
 * The step one column's figures move in, for one row.
 *
 * A column that declared a step of its own uses it. Otherwise it inherits from the
 * instrument it belongs to.
 */
export function resolutionForField(
  field: FieldDefinition,
  row: { values: Record<string, string> },
  parameter: StepCheckParameter,
  masterBuckets: CapabilityBucket[],
): ReadingResolution {
  const side = field.group === 'master' ? 'master' : 'uuc'
  const declared = fieldResolution(field)

  if (declared.source === 'custom') {
    const leastCount = Number(declared.leastCount.trim())
    // An unusable custom step is not a reason to fall back to the instrument's: the
    // column said it steps in something else, and borrowing a number it explicitly
    // declined would judge its readings against the wrong thing. The save gate on the
    // column declaration is what gets this fixed.
    return Number.isFinite(leastCount) && leastCount > 0
      ? {
          kind: 'declared',
          side,
          leastCount,
          precision: getPrecisionFromLeastCount(declared.leastCount.trim()),
        }
      : { kind: 'unrecorded', side }
  }

  return instrumentResolutions(row, parameter, masterBuckets)[side]
}

export interface StepViolation {
  pointNumber: number
  fieldId: string
  /** The column's heading, or a stand-in where it has none yet. */
  fieldName: string
  side: 'master' | 'uuc'
  /** What was typed, as typed. */
  value: string
  /** The step it was measured against, written the way a least count is. */
  leastCount: string
  /** The two readings either side of it. */
  below: string
  above: string
}

/**
 * Every reading on this parameter that does not land on a step.
 *
 * A column whose resolution nobody recorded is not judged - 118 bands in the registry
 * state an accuracy and no least count, and checking against a number borrowed from
 * elsewhere would be inventing a resolution. Empty cells are not judged either: a point
 * not yet taken is not a wrong one.
 */
export function stepViolations(
  parameter: StepCheckParameter,
  masterBuckets: CapabilityBucket[],
): StepViolation[] {
  const columns = parameter.fieldDefinitions.filter(needsResolution)
  const violations: StepViolation[] = []

  parameter.resultRows.forEach((row) => {
    columns.forEach((field) => {
      const value = (row.values[field.id] ?? '').trim()
      if (!value) return

      const resolution = resolutionForField(field, row, parameter, masterBuckets)
      if (resolution.kind !== 'declared') return

      const check = checkStep(value, resolution.leastCount)
      if (check.kind !== 'off') return

      violations.push({
        pointNumber: row.pointNumber,
        fieldId: field.id,
        fieldName: field.name.trim() || 'an unnamed column',
        side: resolution.side,
        value,
        leastCount: String(resolution.leastCount),
        below: check.below,
        above: check.above,
      })
    })
  })

  return violations
}

/**
 * The violations on a single row, for the warning shown beside it.
 *
 * Reuses the same pass rather than a second rule, so what the row says and what the
 * checklist counts can never disagree.
 */
export function rowStepViolations(
  parameter: StepCheckParameter,
  masterBuckets: CapabilityBucket[],
  pointNumber: number,
): StepViolation[] {
  return stepViolations(parameter, masterBuckets).filter((v) => v.pointNumber === pointNumber)
}

/**
 * One sentence covering a row's off-step readings.
 *
 * Both neighbours are named and neither is chosen. Which one the instrument actually
 * showed is the one thing the person who took the reading knows and this does not, and
 * rounding for them would put a figure on a certificate that nobody read.
 */
export function stepViolationSentence(violations: StepViolation[]): string | null {
  if (violations.length === 0) return null

  const each = violations.map(
    (v) => `${v.fieldName} reads ${v.value}, which is not a multiple of ${v.leastCount} (nearest: ${v.below} or ${v.above})`,
  )
  return `${each.join('; ')}.`
}
