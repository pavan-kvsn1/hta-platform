import { declaredCapability, bucketForRange } from '@/lib/master/capability'
import type { CapabilityBucket, RegistryUnit } from '@/lib/master/registry'

/**
 * What the master's own certificate says, taken at the moment it is chosen.
 *
 * These numbers live on the capability profile in the master registry, and the
 * registry is regenerated as instruments are recalibrated. Reading them at render
 * time would make a certificate reissued next year print figures the original never
 * carried, which is the one thing a traceability document must not do. So they are
 * copied onto the certificate and never read again.
 *
 * Nothing is invented. Where the registry states no least count - 118 buckets do -
 * the snapshot is empty and the certificate says so.
 */
/** One band of a master's capability, as its own certificate states it. */
export interface MasterBand {
  from: number | null
  to: number | null
  leastCount: string
  leastCountUnit: string
  accuracy: string
  accuracyUnit: string
}

export interface MasterSpecSnapshot {
  /** The master's own name for what it measures here, which may differ from the UUC's. */
  capabilityParameter: string
  masterLeastCount: string
  masterLeastCountUnit: string
  masterAccuracy: string
  masterAccuracyUnit: string
  /**
   * Every band the used range touches, in order.
   *
   * The four fields above are one pair of figures, taken from the first of these. That
   * is the whole truth for a master with one band, and 218 of this lab's 369 profiles
   * have exactly one. For the rest it describes part of a range and stands in for all
   * of it - a Fluke 5522A sourcing DC current declares five bands between 0 and 329.9,
   * with a different resolution and accuracy in each - so the bands are kept too.
   *
   * Only the bands the calibration actually reached. A master's full capability is a
   * fact about the instrument and lives in the register; what belongs on a certificate
   * is what this calibration was done with.
   */
  masterBands: MasterBand[]
}

export const EMPTY_SNAPSHOT: MasterSpecSnapshot = {
  capabilityParameter: '',
  masterLeastCount: '',
  masterLeastCountUnit: '',
  masterAccuracy: '',
  masterAccuracyUnit: '',
  masterBands: [],
}

/** The span the master was used over, in the master's own units. */
export interface UsedRange {
  from: number
  to: number
}

const text = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value) ? '' : String(value)

/**
 * The accuracy as the master's certificate states it.
 *
 * Four shapes, and only two of them are a number. A formula ("±0.02% of reading ±2
 * count") and a class ("F2 Class") carry no scalar, so they are printed as written
 * rather than resolved against a reading the certificate is not about.
 */
function accuracyOf(bucket: CapabilityBucket): { value: string; unit: string } {
  const accuracy = bucket.accuracy
  if (!accuracy) return { value: '', unit: '' }
  if (accuracy.type === 'symmetric') {
    return { value: text(accuracy.value), unit: accuracy.unit ?? '' }
  }
  if (accuracy.type === 'asymmetric') {
    // Printed as two bounds, because that is what was measured. Collapsing them to one
    // figure would put a number on the certificate that no calibration produced.
    const sides = [
      accuracy.upper === null ? null : `+${Math.abs(accuracy.upper)}`,
      accuracy.lower === null ? null : `-${Math.abs(accuracy.lower)}`,
    ].filter((s): s is string => s !== null)
    return { value: sides.join(' / '), unit: accuracy.unit ?? '' }
  }
  if (accuracy.type === 'formula') {
    return { value: accuracy.expression ?? '', unit: '' }
  }
  return { value: accuracy.class ?? '', unit: '' }
}

/**
 * The spec for one master-and-parameter pairing.
 *
 * `profileId` and `subtype` are what the engineer declared on the card; `range` is the
 * span being calibrated, in the master's units - the mapped one where the master
 * measures something else, the parameter's own otherwise. The bucket is chosen by that
 * span, since a master's resolution and accuracy change across its range.
 */
export function masterSpecFor(
  unit: RegistryUnit | undefined,
  profileId: string | undefined | null,
  subtype: string | undefined | null,
  range: UsedRange | null,
): MasterSpecSnapshot {
  if (!unit || !profileId) return EMPTY_SNAPSHOT

  const profile = (unit.capability_profiles ?? []).find((p) => p.id === profileId)
  if (!profile) return EMPTY_SNAPSHOT

  const capabilityParameter = profile.parameter?.trim() ?? ''
  const { buckets } = declaredCapability(profile, subtype)

  // No span to choose by, or nothing covering it: the capability is still worth
  // recording, and the numbers stay empty rather than being taken from a bucket that
  // does not apply.
  // bucketForRange picks by span alone; the other two fields are the caller's
  // requirement, which is not what is being recorded here.
  const bucket = range
    ? bucketForRange(buckets, { from: range.from, to: range.to, leastCount: 0, accuracy: 0 })
    : null
  if (!bucket) return { ...EMPTY_SNAPSHOT, capabilityParameter }

  /**
   * Every band the used range touches, not only the one a lookup settles on.
   *
   * bucketForRange answers "which band serves this range", and for a range crossing
   * two it has to pick. What the certificate should say is what was actually used, so
   * the overlap is taken directly. An open-ended bound counts as reaching that way:
   * a band recorded without a maximum has no upper edge to fall short of.
   */
  const touched = range
    ? buckets.filter(
        (b) =>
          (b.max === null || b.max >= Math.min(range.from, range.to)) &&
          (b.min === null || b.min <= Math.max(range.from, range.to)),
      )
    : [bucket]

  // The band the lookup settled on leads, so the scalar figures below - which every
  // certificate already written reads - keep saying what they said before.
  const ordered = [bucket, ...touched.filter((b) => b.id !== bucket.id)]

  const accuracy = accuracyOf(bucket)
  return {
    capabilityParameter,
    masterLeastCount: text(bucket.least_count?.value),
    masterLeastCountUnit: bucket.least_count?.unit ?? '',
    masterAccuracy: accuracy.value,
    masterAccuracyUnit: accuracy.unit,
    masterBands: ordered.map((b) => {
      const acc = accuracyOf(b)
      return {
        from: b.min,
        to: b.max,
        leastCount: text(b.least_count?.value),
        leastCountUnit: b.least_count?.unit ?? '',
        accuracy: acc.value,
        accuracyUnit: acc.unit,
      }
    }),
  }
}
