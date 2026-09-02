// Capability evaluation for master instrument selection.
//
// Answers the question scope section 1.3 asks: given a UUC parameter with a range and a
// required accuracy, which master instruments can do the job?
//
// Filtering is PER PARAMETER, not per certificate. 143 of 203 units in the registry
// cover exactly one parameter, so requiring a single master to cover every parameter on
// a certificate would exclude most of the lab - a Pressure + Temperature + RTD job has
// zero such masters. A certificate uses one master per parameter, which is what
// certificate-store's setParameterMasterInstrument and the CertificateMasterInstrument
// .parameterId column already assume.

import {
  type Accuracy,
  type CapabilityBucket,
  type CapabilityProfile,
  type MasterInstrumentRegistry,
  type ProfileRole,
  type RegistryAsset,
  type RegistryUnit,
  capabilityVariants,
} from './master-instrument-registry'

/** What an accuracy resolves to for a particular reading. */
export interface ResolvedAccuracy {
  value: number
  unit: string | null
}

/** Context an accuracy formula may need in order to produce a number. */
export interface AccuracyContext {
  /** The measured value the accuracy is being evaluated at. */
  reading: number
  /** Full-scale value, for "% of full scale" accuracies. Usually the profile max. */
  fullScale?: number | null
  /** Least count, to convert a "±n count" digits term into engineering units. */
  leastCount?: number | null
}

/**
 * Reduce an accuracy to a number for a given reading, or null when that is impossible.
 *
 * Returns null rather than guessing, because every case where it does is a case where a
 * wrong guess silently mis-ranks a master:
 *
 *   - a class accuracy ("F2 Class") carries no number at all
 *   - a formula whose basis is unstated - the registry has "+/- 1%" with no indication
 *     whether that is of reading, of full scale, or percentage points
 *   - a "% of full scale" formula with no full scale supplied
 *   - a "±n count" term with no least count supplied
 */
export function resolveAccuracy(
  accuracy: Accuracy | null,
  ctx: AccuracyContext,
): ResolvedAccuracy | null {
  if (!accuracy) return null

  if (accuracy.type === 'symmetric') {
    return { value: Math.abs(accuracy.value), unit: accuracy.unit }
  }

  // A class accuracy is a conformity grade, not a tolerance we can compute with.
  if (accuracy.type === 'class') return null

  let total = 0

  if (accuracy.percent_value != null) {
    if (accuracy.percent_of === 'reading') {
      total += accuracy.percent_value * Math.abs(ctx.reading)
    } else if (accuracy.percent_of === 'full_scale' || accuracy.percent_of === 'span') {
      if (ctx.fullScale == null) return null
      total += accuracy.percent_value * Math.abs(ctx.fullScale)
    } else {
      // Basis unstated - see the module note above.
      return null
    }
  }

  if (accuracy.digits != null) {
    if (ctx.leastCount == null) return null
    total += accuracy.digits * ctx.leastCount
  }

  if (accuracy.percent_value == null && accuracy.digits == null) return null

  return { value: total, unit: null }
}

function bucketCovers(bucket: CapabilityBucket, value: number): boolean {
  const aboveMin =
    bucket.min == null || (bucket.min_inclusive ? value >= bucket.min : value > bucket.min)
  const belowMax =
    bucket.max == null || (bucket.max_inclusive ? value <= bucket.max : value < bucket.max)
  return aboveMin && belowMax
}

/** Buckets whose range overlaps [min, max]. */
export function bucketsOverlapping(
  buckets: CapabilityBucket[],
  min: number,
  max: number,
): CapabilityBucket[] {
  return buckets.filter((b) => {
    const lo = b.min ?? -Infinity
    const hi = b.max ?? Infinity
    return hi >= min && lo <= max
  })
}

/** The bucket containing a single value, if any. */
export function bucketAt(
  buckets: CapabilityBucket[],
  value: number,
): CapabilityBucket | undefined {
  return buckets.find((b) => bucketCovers(b, value))
}

export interface ParameterRequirement {
  /** Standard parameter name, e.g. "Pressure". */
  parameter: string
  /** Required span the master must cover. */
  rangeMin: number
  rangeMax: number
  /**
   * Worst accuracy the master may have, in the parameter's own unit. Omit to filter on
   * range alone.
   */
  accuracy?: number
  /** Restrict to a subtype, e.g. "Pt-100". */
  subtype?: string
  /** Restrict to instruments that can source, or that can measure. */
  role?: ProfileRole
  /** Unit the requirement is expressed in. Must match the profile's unit. */
  unit?: string
}

export type IneligibleReason =
  | 'no-such-parameter'
  | 'no-such-subtype'
  | 'unit-mismatch'
  | 'range-not-covered'
  | 'accuracy-insufficient'
  | 'no-capability-data'
  | 'accuracy-not-comparable'
  | 'calibration-expired'

export interface CapabilityMatch {
  asset: RegistryAsset
  unit: RegistryUnit
  profile: CapabilityProfile
  subtype: string | null
  /** Buckets covering the required range, worst-accuracy first where comparable. */
  buckets: CapabilityBucket[]
  /** Worst resolved accuracy across the required range, when it can be computed. */
  worstAccuracy: ResolvedAccuracy | null
}

export interface CapabilityRejection {
  asset: RegistryAsset
  unit: RegistryUnit
  reason: IneligibleReason
  detail: string
}

/**
 * Evaluate one unit against one parameter requirement.
 *
 * Returns a match, or a rejection carrying the reason - the selection UI greys out
 * ineligible masters with an explanation rather than hiding them, and "we have no
 * capability data for this instrument" needs to read differently from "its range is too
 * narrow".
 */
export function evaluateUnit(
  asset: RegistryAsset,
  unit: RegistryUnit,
  req: ParameterRequirement,
  options: { allowExpired?: boolean } = {},
): CapabilityMatch | CapabilityRejection {
  const reject = (reason: IneligibleReason, detail: string): CapabilityRejection => ({
    asset,
    unit,
    reason,
    detail,
  })

  if (!options.allowExpired && unit.calibration_state === 'EXPIRED') {
    return reject(
      'calibration-expired',
      `Calibration expired${unit.calibration_days != null ? ` ${unit.calibration_days} days ago` : ''}`,
    )
  }

  const profiles = unit.capability_profiles.filter(
    (p) => p.parameter === req.parameter && (!req.role || p.role === req.role),
  )
  if (profiles.length === 0) {
    return reject('no-such-parameter', `Does not cover ${req.parameter}`)
  }

  let lastRejection: CapabilityRejection = reject(
    'range-not-covered',
    `Does not cover ${req.rangeMin}–${req.rangeMax}`,
  )

  for (const profile of profiles) {
    if (req.unit && profile.unit && profile.unit !== req.unit) {
      lastRejection = reject(
        'unit-mismatch',
        `Measures ${req.parameter} in ${profile.unit}, not ${req.unit}`,
      )
      continue
    }

    for (const variant of capabilityVariants(profile)) {
      if (req.subtype && variant.subtype !== req.subtype) continue

      if (variant.min == null || variant.max == null) {
        lastRejection = reject(
          'no-capability-data',
          `No range recorded for ${req.parameter}`,
        )
        continue
      }
      if (variant.min > req.rangeMin || variant.max < req.rangeMax) {
        lastRejection = reject(
          'range-not-covered',
          `Covers ${variant.min}–${variant.max}, needs ${req.rangeMin}–${req.rangeMax}`,
        )
        continue
      }

      const buckets = bucketsOverlapping(variant.buckets, req.rangeMin, req.rangeMax)

      if (req.accuracy == null) {
        return { asset, unit, profile, subtype: variant.subtype, buckets, worstAccuracy: null }
      }

      if (buckets.length === 0) {
        lastRejection = reject(
          'no-capability-data',
          `No accuracy data over ${req.rangeMin}–${req.rangeMax}`,
        )
        continue
      }

      // Worst case across the required span: evaluate each overlapping bucket at the
      // reading where its accuracy is largest, which for a percent-of-reading formula
      // is the top of the requested range.
      let worst: ResolvedAccuracy | null = null
      let uncomparable = false
      for (const bucket of buckets) {
        const resolved = resolveAccuracy(bucket.accuracy, {
          reading: req.rangeMax,
          fullScale: variant.max,
          leastCount: bucket.least_count?.value ?? null,
        })
        if (!resolved) {
          uncomparable = true
          break
        }
        if (!worst || resolved.value > worst.value) worst = resolved
      }

      if (uncomparable || !worst) {
        lastRejection = reject(
          'accuracy-not-comparable',
          `Accuracy cannot be evaluated for ${req.parameter}`,
        )
        continue
      }

      if (worst.value > req.accuracy) {
        lastRejection = reject(
          'accuracy-insufficient',
          `Accuracy ±${worst.value} over this range, needs ±${req.accuracy}`,
        )
        continue
      }

      return { asset, unit, profile, subtype: variant.subtype, buckets, worstAccuracy: worst }
    }
  }

  if (req.subtype && !profiles.some((p) => p.subtypes?.some((s) => s.id === req.subtype))) {
    return reject('no-such-subtype', `Does not provide ${req.subtype}`)
  }

  return lastRejection
}

export function isMatch(
  result: CapabilityMatch | CapabilityRejection,
): result is CapabilityMatch {
  return 'profile' in result
}

export interface EligibilityResult {
  eligible: CapabilityMatch[]
  ineligible: CapabilityRejection[]
  /** Total units considered, for the "3 of 45 eligible" counter. */
  considered: number
}

/** Evaluate the whole registry against one parameter requirement. */
export function findEligible(
  registry: MasterInstrumentRegistry,
  req: ParameterRequirement,
  options: { allowExpired?: boolean } = {},
): EligibilityResult {
  const eligible: CapabilityMatch[] = []
  const ineligible: CapabilityRejection[] = []
  let considered = 0

  for (const asset of registry.assets) {
    for (const unit of asset.units) {
      considered += 1
      const result = evaluateUnit(asset, unit, req, options)
      if (isMatch(result)) eligible.push(result)
      else ineligible.push(result)
    }
  }

  return { eligible, ineligible, considered }
}

/**
 * Which of a set of requirements each unit covers.
 *
 * Backs the per-master coverage ticks in the selection UI ("✓ Pressure, ✓ Temperature,
 * ✗ RTD"). A master covering only some requirements is still useful - the others get a
 * different master.
 */
export function coverageByParameter(
  registry: MasterInstrumentRegistry,
  requirements: ParameterRequirement[],
  options: { allowExpired?: boolean } = {},
): Map<string, { unit: RegistryUnit; asset: RegistryAsset; covers: Set<string> }> {
  const byUnit = new Map<
    string,
    { unit: RegistryUnit; asset: RegistryAsset; covers: Set<string> }
  >()

  for (const asset of registry.assets) {
    for (const unit of asset.units) {
      const key = `${asset.id}/${unit.id}`
      const covers = new Set<string>()
      for (const req of requirements) {
        if (isMatch(evaluateUnit(asset, unit, req, options))) covers.add(req.parameter)
      }
      byUnit.set(key, { unit, asset, covers })
    }
  }

  return byUnit
}
