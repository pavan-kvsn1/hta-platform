import { declaredCapability, bucketForRange } from '@/lib/master-instrument-capability'
import type { CapabilityBucket, RegistryUnit } from '@/lib/master-instrument-registry'

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
export interface MasterSpecSnapshot {
  /** The master's own name for what it measures here, which may differ from the UUC's. */
  capabilityParameter: string
  masterLeastCount: string
  masterLeastCountUnit: string
  masterAccuracy: string
  masterAccuracyUnit: string
}

export const EMPTY_SNAPSHOT: MasterSpecSnapshot = {
  capabilityParameter: '',
  masterLeastCount: '',
  masterLeastCountUnit: '',
  masterAccuracy: '',
  masterAccuracyUnit: '',
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
 * Three shapes, and only one of them is a number. A formula ("±0.02% of reading ±2
 * count") and a class ("F2 Class") carry no scalar, so they are printed as written
 * rather than resolved against a reading the certificate is not about.
 */
function accuracyOf(bucket: CapabilityBucket): { value: string; unit: string } {
  const accuracy = bucket.accuracy
  if (!accuracy) return { value: '', unit: '' }
  if (accuracy.type === 'symmetric') {
    return { value: text(accuracy.value), unit: accuracy.unit ?? '' }
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

  const accuracy = accuracyOf(bucket)
  return {
    capabilityParameter,
    masterLeastCount: text(bucket.least_count?.value),
    masterLeastCountUnit: bucket.least_count?.unit ?? '',
    masterAccuracy: accuracy.value,
    masterAccuracyUnit: accuracy.unit,
  }
}
