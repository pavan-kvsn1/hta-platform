/**
 * Why a master instrument is, or is not, worth choosing for one parameter.
 *
 * The instrument list is ranked by this rather than filtered by it: an instrument that
 * cannot be used stays on screen with the reason, because an empty list teaches the
 * engineer nothing about why their instrument is missing.
 *
 * The order of the checks matters. "Does not record this parameter" is a permanent
 * fact about the instrument and is reported before "calibration expired", which is a
 * fact about today.
 */

import type { RegistryUnit } from './master-instrument-registry'
import {
  DEFAULT_ACCURACY_RATIO,
  chooseCapability,
  declaredCapability,
  matchesParameter,
  type RequiredRange,
} from './master-instrument-capability'

export type EligibilityTone = 'green' | 'amber' | 'orange' | 'red' | 'slate'

/**
 * How one aspect of a master stands against the requirement.
 *
 * Four states rather than two, because "it will do" and "it will do with nothing to
 * spare" are different answers and an engineer acts on them differently:
 *
 *   safe         - meets it with margin
 *   compatible   - meets it, with none
 *   incompatible - does not meet it
 *   unknown      - nothing recorded to judge it by
 */
export type Compatibility = 'safe' | 'compatible' | 'incompatible' | 'unknown'

export const COMPATIBILITY_BADGE: Record<Compatibility, string> = {
  safe: 'bg-green-100 text-green-700',
  compatible: 'bg-amber-100 text-amber-700',
  incompatible: 'bg-red-100 text-red-700',
  unknown: 'bg-slate-200 text-slate-500',
}

export interface Eligibility {
  /** Sort key - 0 is the best answer, 5 the least useful. */
  rank: number
  tone: EligibilityTone
  usable: boolean
  /** The badge: a ratio, or the reason it has none. */
  verdict: string
  /** The line under the instrument name, saying what the verdict is based on. */
  detail: string
  /**
   * The two things an engineer is actually judging, where they can be judged at all.
   * They are separate because they fail for different reasons: a coarser least count
   * means the readings cannot be recorded as written, while a thin accuracy ratio is a
   * judgement the lab can accept with a reason. Null where nothing supports an answer,
   * in which case `verdict` says why.
   */
  leastCount: Compatibility
  accuracy: Compatibility
  /** The worst ratio across the required ranges, for the badge's tooltip. */
  accuracyRatio: number | null
  /** Why each badge reads as it does, shown on hover. */
  leastCountNote: string
  accuracyNote: string
  /**
   * The capability does not span the required range. Distinct from a thin accuracy or
   * a coarse resolution, which are judgements; this one is arithmetic, and the
   * instrument cannot be used whatever else it offers.
   */
  outOfRange?: boolean
}

export const ELIGIBILITY_BADGE: Record<EligibilityTone, string> = {
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  orange: 'bg-orange-100 text-orange-700',
  red: 'bg-red-100 text-red-700',
  slate: 'bg-slate-200 text-slate-600',
}

const n = (v: number) => Number(v.toFixed(4)).toString()

/** Nothing recorded to judge either aspect by. */
const unjudged = (note: string) => ({
  leastCount: 'unknown' as const,
  accuracy: 'unknown' as const,
  accuracyRatio: null,
  leastCountNote: note,
  accuracyNote: note,
})

export function eligibilityFor(
  unit: RegistryUnit | undefined,
  instrument: { status?: string; daysUntilExpiry?: number | null },
  parameter: { name: string; unit: string; required: RequiredRange[] },
  threshold: number = DEFAULT_ACCURACY_RATIO,
): Eligibility {
  if (!unit || unit.capability_profiles.length === 0) {
    return {
      rank: 3,
      tone: 'slate',
      usable: true,
      verdict: 'Capability not recorded',
      detail: 'no capability recorded for this instrument',
          ...unjudged('This instrument records no capability, so there is nothing to compare.'),
    }
  }

  const profiles = parameter.name.trim()
    ? unit.capability_profiles.filter((p) =>
        matchesParameter(p, parameter.name, parameter.unit),
      )
    : []
  if (profiles.length === 0) {
    return {
      rank: 5,
      tone: 'slate',
      usable: false,
      verdict: `Does not record ${parameter.name || 'this parameter'}`,
      detail: `does not record ${parameter.name || 'this parameter'}`,
          ...unjudged('This instrument does not record this parameter.'),
    }
  }

  if (instrument.status === 'EXPIRED') {
    const days = instrument.daysUntilExpiry
    return {
      rank: 4,
      tone: 'red',
      usable: false,
      verdict: 'Calibration expired',
      detail:
        days != null
          ? `calibration expired ${Math.abs(days)} days ago`
          : 'calibration expired',
          ...unjudged('Its calibration has expired, so it cannot be used.'),
    }
  }

  // Without a stated requirement there is nothing to rate the instrument against, but
  // it does record the parameter, so it stays offered.
  // Nothing to rate against. The reason belongs above the list, said once - repeated
  // down every row it is noise that buries what each row actually says.
  if (parameter.required.length === 0) {
    return {
      rank: 3,
      tone: 'slate',
      usable: true,
      verdict: 'Not rated',
      detail: '',
      ...unjudged('The parameter states no requirement to compare this against.'),
    }
  }

  const chosen = chooseCapability(unit, parameter.name, parameter.required, {
    threshold,
    parameterUnit: parameter.unit,
  })
  if (!chosen) {
    return {
      rank: 3,
      tone: 'slate',
      usable: true,
      verdict: 'Not rated',
      detail: '',
      ...unjudged('Nothing is recorded against this capability to compare.'),
    }
  }

  const span = declaredCapability(chosen.profile, chosen.subtypeId)
  const reach =
    span.min != null && span.max != null
      ? `range ${n(span.min)} to ${n(span.max)} ${chosen.profile.unit ?? parameter.unit}`
      : ''

  // A capability the registry names but records no span for. Nine of this lab's units
  // are like that. Judging it "Range Exceeds" states that the instrument falls short,
  // which nothing here establishes, and blocks it from being chosen at all.
  if (span.min == null || span.max == null) {
    return {
      rank: 3,
      tone: 'slate',
      usable: true,
      verdict: 'Range not recorded',
      detail: `records ${chosen.profile.parameter}, with no range against it`,
      ...unjudged('The registry names this capability but records no ranges for it.'),
    }
  }

  if (!chosen.suitability.covered) {
    const need = Math.max(...parameter.required.map((r) => r.to))
    const short = span.max != null && need > span.max ? ` · short of your ${n(need)} by ${n(need - span.max)}` : ''
    return {
      rank: 2,
      tone: 'orange',
      usable: false,
      verdict: 'Range Exceeds',
      detail: `${reach}${short} - does not reach the required range`,
      outOfRange: true,
      ...unjudged('Part of the required range falls outside this capability.'),
    }
  }

  // Least count, across every required range. A master finer than required has margin;
  // one that matches exactly has none, and any drift takes it out; a coarser one cannot
  // record the readings as written at all.
  const verdicts = chosen.suitability.ranges.map((r) => r.leastCount)
  const leastCount: Compatibility = verdicts.some((v) => v === null)
    ? 'unknown'
    : verdicts.some((v) => v === 'coarser')
      ? 'incompatible'
      : verdicts.some((v) => v === 'finer')
        ? 'safe'
        : 'compatible'
  const leastCountNote = {
    safe: 'Finer than the parameter requires on every range.',
    compatible: 'Matches the parameter exactly, with nothing to spare.',
    incompatible:
      'Coarser than required - readings would be recorded finer than this can read.',
    unknown: 'No least count recorded for the band serving this range.',
  }[leastCount]

  // Accuracy. Below 1:1 the master is no better than the unit it is checking, which is
  // not a thin margin but the wrong tool.
  const ratio = chosen.suitability.worstRatio
  const accuracy: Compatibility =
    ratio === null
      ? 'unknown'
      : ratio < 1
        ? 'incompatible'
        : ratio < threshold
          ? 'compatible'
          : 'safe'
  const accuracyNote =
    ratio === null
      ? 'Accuracy is recorded as a class, so it cannot be compared as a number.'
      : `${ratio.toFixed(1)} : 1 at worst across the required ranges; the lab asks for ${threshold}:1.`

  const judged = { leastCount, accuracy, accuracyRatio: ratio, leastCountNote, accuracyNote }

  if (ratio === null) {
    return {
      rank: 3,
      tone: 'slate',
      usable: true,
      verdict: 'Class accuracy',
      detail: reach ? `${reach} · not comparable as a number` : 'not comparable as a number',
      ...judged,
    }
  }

  return {
    rank: ratio >= threshold ? 0 : 1,
    tone: ratio >= threshold ? 'green' : 'amber',
    usable: true,
    verdict: `${ratio.toFixed(1)} : 1`,
    detail: reach,
    ...judged,
  }
}
