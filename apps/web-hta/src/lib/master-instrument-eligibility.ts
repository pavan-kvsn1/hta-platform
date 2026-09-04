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
  type RequiredRange,
} from './master-instrument-capability'

export type EligibilityTone = 'green' | 'amber' | 'orange' | 'red' | 'slate'

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
  leastCount?: 'compatible' | 'not compatible' | null
  accuracyRatio?: number | null
}

export const ELIGIBILITY_BADGE: Record<EligibilityTone, string> = {
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  orange: 'bg-orange-100 text-orange-700',
  red: 'bg-red-100 text-red-700',
  slate: 'bg-slate-200 text-slate-600',
}

const n = (v: number) => Number(v.toFixed(4)).toString()

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
      detail: 'nothing to check against',
    }
  }

  const wanted = parameter.name.trim().toLowerCase()
  const profiles = wanted
    ? unit.capability_profiles.filter((p) => p.parameter.toLowerCase().includes(wanted))
    : []
  if (profiles.length === 0) {
    return {
      rank: 5,
      tone: 'slate',
      usable: false,
      verdict: `Does not record ${parameter.name || 'this parameter'}`,
      detail: '',
    }
  }

  if (instrument.status === 'EXPIRED') {
    const days = instrument.daysUntilExpiry
    return {
      rank: 4,
      tone: 'red',
      usable: false,
      verdict: 'Calibration expired',
      detail: days != null ? `${Math.abs(days)} days ago` : '',
    }
  }

  // Without a stated requirement there is nothing to rate the instrument against, but
  // it does record the parameter, so it stays offered. "Records it" said nothing an
  // engineer could act on; the reason it cannot be rated is more use.
  if (parameter.required.length === 0) {
    return {
      rank: 3,
      tone: 'slate',
      usable: true,
      verdict: 'Requirement not set',
      detail: 'set the range, least count and accuracy in Section 02 to rate this',
    }
  }

  const chosen = chooseCapability(unit, parameter.name, parameter.required, { threshold })
  if (!chosen) {
    return {
      rank: 3,
      tone: 'slate',
      usable: true,
      verdict: 'Requirement not set',
      detail: 'nothing recorded against this capability to compare',
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
      detail: `${reach}${short}`,
    }
  }

  const leastCount = chosen.suitability.resolvable
    ? ('compatible' as const)
    : ('not compatible' as const)
  const ratio = chosen.suitability.worstRatio

  if (ratio === null) {
    return {
      rank: 3,
      tone: 'slate',
      usable: true,
      verdict: 'Class accuracy',
      detail: reach ? `${reach} · not comparable as a number` : 'not comparable as a number',
      leastCount,
      accuracyRatio: null,
    }
  }

  return {
    rank: ratio >= threshold ? 0 : 1,
    tone: ratio >= threshold ? 'green' : 'amber',
    usable: true,
    verdict: `${ratio.toFixed(1)} : 1`,
    detail: reach,
    leastCount,
    accuracyRatio: ratio,
  }
}
