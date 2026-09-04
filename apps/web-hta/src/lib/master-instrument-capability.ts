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

// ---------------------------------------------------------------------------------
// Adapters for the certificate's master selection
// ---------------------------------------------------------------------------------
//
// evaluateUnit is the strict form used for eligibility: it rejects expired
// calibrations, insists the units match, and reports why. The selection UI asks two
// smaller questions and has always answered them permissively - an instrument with
// nothing recorded is allowed rather than hidden - so these mirror that, reading
// capability profiles instead of the old flat range list.

/** Every profile on a unit, including those nested under a subtype. */
function profilesFor(unit: RegistryUnit, parameter: string): CapabilityProfile[] {
  const wanted = parameter.trim().toLowerCase()
  if (!wanted) return []
  return unit.capability_profiles.filter((profile) =>
    profile.parameter.toLowerCase().includes(wanted),
  )
}

/**
 * Whether this instrument records the parameter at all.
 *
 * A unit with no profiles recorded is allowed through: three assets in the registry
 * still have none, and hiding them would remove instruments the lab actually uses.
 */
export function unitCanMeasure(unit: RegistryUnit, parameter: string): boolean {
  if (unit.capability_profiles.length === 0) return true
  if (!parameter.trim()) return true
  return profilesFor(unit, parameter).length > 0
}

/**
 * Whether the instrument's span for the parameter covers what is being calibrated.
 *
 * Takes the widest span the profile offers, subtypes included: a thermocouple
 * calibrator's overall range is the union of its types, and the type is chosen
 * separately.
 */
export function unitCoversRange(
  unit: RegistryUnit,
  parameter: string,
  requiredMin: number,
  requiredMax: number,
): boolean {
  const profiles = profilesFor(unit, parameter)
  if (profiles.length === 0) return true

  for (const profile of profiles) {
    const spans: Array<{ min: number | null; max: number | null }> = [
      { min: profile.min, max: profile.max },
      ...(profile.subtypes ?? []).map((s) => ({ min: s.min, max: s.max })),
    ]
    for (const span of spans) {
      if (span.min == null || span.max == null) return true // nothing recorded to fail against
      if (span.min <= requiredMin && span.max >= requiredMax) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------------
// Master suitability
// ---------------------------------------------------------------------------------
//
// Whether a chosen master is good enough for what is being calibrated, judged per
// required range rather than once for the whole parameter. A parameter can be binned,
// and a master's own resolution and accuracy change across its bands, so one verdict
// for the pair would hide the case where the master is fine at one end and not the
// other.
//
// The comparison is a test ACCURACY ratio: the unit's acceptance limit against the
// master's accuracy specification. It is not a TUR - that needs the master's expanded
// uncertainty at 95%, which the registry does not record. Named accordingly so nobody
// reads it as the figure ILAC-G8 or Z540.3 ask for.

/** One range the calibration needs covered, from the unit under test. */
export interface RequiredRange {
  from: number
  to: number
  /** Resolution the readings are recorded at. */
  leastCount: number
  /** Acceptance limit the error is judged against. */
  accuracy: number
}

export type LeastCountVerdict = 'matches' | 'finer' | 'coarser'

export interface RangeSuitability {
  required: RequiredRange
  /** The band the readings fall in, or null when nothing covers them. */
  band: CapabilityBucket | null
  /** Whether the capability spans the required range at all. */
  covered: boolean
  /**
   * How the master's resolution compares. 'finer' is acceptable - the certificate
   * records the master's own least count - while 'coarser' means readings would be
   * written more precisely than the instrument can actually read.
   */
  leastCount: LeastCountVerdict | null
  /** Acceptance limit divided by the master's accuracy, or null when not comparable. */
  accuracyRatio: number | null
  /** Why the ratio could not be computed, when it could not. */
  notComparable: string | null
}

export interface AssignmentSuitability {
  ranges: RangeSuitability[]
  /** Every required range is spanned by the capability. */
  covered: boolean
  /** No required range is served by a coarser least count. */
  resolvable: boolean
  /** Lowest ratio across the ranges, or null when none could be computed. */
  worstRatio: number | null
  /** Whether that lowest ratio clears the threshold. */
  meetsThreshold: boolean
}

/** The ratio a lab expects between the unit's limit and the master's accuracy. */
export const DEFAULT_ACCURACY_RATIO = 4

/**
 * A subtype narrows the instrument: a thermocouple's Type K and Type S have different
 * spans and different accuracies, so the declared curve replaces the profile's own
 * range and buckets rather than sitting alongside them.
 */
export function declaredCapability(
  profile: CapabilityProfile,
  subtypeId?: string | null,
): { min: number | null; max: number | null; buckets: CapabilityBucket[] } {
  const subtype = subtypeId
    ? (profile.subtypes ?? []).find((s) => s.id === subtypeId)
    : undefined
  if (subtype) {
    return { min: subtype.min, max: subtype.max, buckets: subtype.buckets ?? [] }
  }
  return { min: profile.min, max: profile.max, buckets: profile.buckets ?? [] }
}

/** The bucket a required range falls in: one that spans it, else one that overlaps. */
export function bucketForRange(
  buckets: CapabilityBucket[],
  range: RequiredRange,
): CapabilityBucket | null {
  return (
    buckets.find((b) => b.min != null && b.max != null && b.min <= range.from && b.max >= range.to)
    ?? buckets.find((b) => b.min != null && b.max != null && b.max > range.from && b.min < range.to)
    ?? null
  )
}

function compareLeastCount(
  bucket: CapabilityBucket | null,
  required: number,
): LeastCountVerdict | null {
  const lc = bucket?.least_count?.value
  if (lc == null || !required) return null
  if (Math.abs(lc - required) < 1e-9) return 'matches'
  return lc < required ? 'finer' : 'coarser'
}

/**
 * Judge one master capability against everything the calibration requires.
 *
 * Returns per-range detail rather than a single verdict, because that is what an
 * engineer has to act on - which part of the range is the problem, and whether it is
 * the resolution or the accuracy.
 */
export function evaluateSuitability(
  profile: CapabilityProfile,
  required: RequiredRange[],
  options: { subtypeId?: string | null; threshold?: number } = {},
): AssignmentSuitability {
  const threshold = options.threshold ?? DEFAULT_ACCURACY_RATIO
  const declared = declaredCapability(profile, options.subtypeId)

  const ranges: RangeSuitability[] = required.map((range) => {
    const covered =
      declared.min != null && declared.max != null
      && declared.min <= range.from && declared.max >= range.to
    const bucket = bucketForRange(declared.buckets, range)
    const resolved = bucket ? resolveAccuracy(bucket.accuracy, { reading: range.to }) : null

    return {
      required: range,
      band: bucket,
      covered,
      leastCount: compareLeastCount(bucket, range.leastCount),
      accuracyRatio: resolved && resolved.value > 0 ? range.accuracy / resolved.value : null,
      notComparable: bucket
        ? resolved
          ? null
          : 'The accuracy for this band cannot be reduced to a number.'
        : 'No band covers this range.',
    }
  })

  const rated = ranges.map((r) => r.accuracyRatio).filter((r): r is number => r !== null)
  const worstRatio = rated.length ? Math.min(...rated) : null

  return {
    ranges,
    covered: ranges.every((r) => r.covered),
    resolvable: ranges.every((r) => r.leastCount !== 'coarser'),
    worstRatio,
    meetsThreshold: worstRatio !== null && worstRatio >= threshold,
  }
}

/**
 * The required ranges a parameter declares: its bins where it is binned, otherwise the
 * single range it was set up with. This is read from the unit under test, never
 * entered against the master.
 */
export function requiredRanges(parameter: {
  rangeMin?: string
  rangeMax?: string
  leastCountValue?: string
  accuracyValue?: string
  requiresBinning?: boolean
  bins?: { binMin: string; binMax: string; leastCount: string; accuracy: string }[]
}): RequiredRange[] {
  const num = (v?: string) => {
    const parsed = parseFloat((v ?? '').replace('±', ''))
    return Number.isFinite(parsed) ? parsed : null
  }

  if (parameter.requiresBinning && parameter.bins?.length) {
    return parameter.bins
      .map((bin) => ({
        from: num(bin.binMin),
        to: num(bin.binMax),
        leastCount: num(bin.leastCount),
        accuracy: num(bin.accuracy),
      }))
      .filter(
        (b): b is RequiredRange =>
          b.from !== null && b.to !== null && b.leastCount !== null && b.accuracy !== null,
      )
  }

  const from = num(parameter.rangeMin)
  const to = num(parameter.rangeMax)
  const leastCount = num(parameter.leastCountValue)
  const accuracy = num(parameter.accuracyValue)
  if (from === null || to === null || leastCount === null || accuracy === null) return []
  return [{ from, to, leastCount, accuracy }]
}

export interface ChosenCapability {
  profile: CapabilityProfile
  /** The declared curve, where the capability has any. */
  subtypeId: string | null
  suitability: AssignmentSuitability
}

/**
 * The capability that best serves a requirement, for use until it is declared.
 *
 * An engineer knows which capability and curve they used; the app does not, and
 * cannot read it from the readings. Until that declaration is stored this picks the
 * one that fits best - covering the range, resolving finely enough, then the highest
 * accuracy ratio - so the comparison shown is the instrument's best case rather than
 * whichever profile happened to be listed first. It is a stand-in, not an answer.
 */
export function chooseCapability(
  unit: RegistryUnit,
  parameter: string,
  required: RequiredRange[],
  options: { threshold?: number } = {},
): ChosenCapability | null {
  const wanted = parameter.trim().toLowerCase()
  if (!wanted || required.length === 0) return null

  const candidates: ChosenCapability[] = []
  for (const profile of unit.capability_profiles) {
    if (!profile.parameter.toLowerCase().includes(wanted)) continue
    const curves = (profile.subtypes ?? []).map((s) => s.id)
    const ids: (string | null)[] = curves.length ? curves : [null]
    for (const subtypeId of ids) {
      candidates.push({
        profile,
        subtypeId,
        suitability: evaluateSuitability(profile, required, { subtypeId, ...options }),
      })
    }
  }
  if (candidates.length === 0) return null

  const rank = (c: ChosenCapability) => [
    c.suitability.covered ? 0 : 1,
    c.suitability.resolvable ? 0 : 1,
    -(c.suitability.worstRatio ?? -1),
  ]
  return candidates.sort((a, b) => {
    const [ac, ar, aq] = rank(a)
    const [bc, br, bq] = rank(b)
    return ac - bc || ar - br || aq - bq
  })[0]
}
