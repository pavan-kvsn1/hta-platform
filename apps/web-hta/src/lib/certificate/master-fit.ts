/**
 * How a master stood against the parameter it was used for, read off the certificate.
 *
 * The engineer's form judges this live against the master register, which is right
 * while the certificate is being written and wrong afterwards: the register is
 * regenerated as instruments are recalibrated, so a certificate reissued next year
 * would print figures the original never carried. That is why the certificate keeps its
 * own copy of the master's least count and accuracy at the moment it was chosen.
 *
 * So this reads the snapshot and nothing else. On a certificate saved before the
 * snapshot existed, both are absent and both verdicts come back 'unknown' - which is
 * the honest answer, and the same grey badge the engineer saw when the register itself
 * had nothing to judge by.
 *
 * The thresholds are the ones lib/master/eligibility.ts applies, and the accuracy
 * verdict is its function rather than a second copy of the rule.
 */

import { accuracyCompatibility, type Compatibility } from '@/lib/master/eligibility'
import { DEFAULT_ACCURACY_RATIO } from '@/lib/master/capability'

/** What a certificate records about the master it used for one parameter. */
export interface MasterSnapshot {
  masterLeastCount?: string | null
  masterLeastCountUnit?: string | null
  masterAccuracy?: string | null
  masterAccuracyUnit?: string | null
  /** The parameter the master's own certificate names, where it differs from ours. */
  capabilityParameter?: string | null
}

/** What the parameter asked of it. */
export interface MasterRequirement {
  leastCountValue?: string | null
  leastCountUnit?: string | null
  accuracyValue?: string | null
  accuracyUnit?: string | null
  parameterUnit?: string | null
}

export interface MasterFit {
  leastCount: Compatibility
  accuracy: Compatibility
  /** How many times finer the master's accuracy is, or null where it cannot be said. */
  ratio: number | null
  leastCountNote: string
  accuracyNote: string
  /**
   * The master was judged in a different unit from the parameter's own.
   *
   * A thermocouple calibrator is rated in millivolts against a parameter named in
   * degrees. That is legitimate and common, but it means the ratio beside it was
   * computed against a different quantity, and a reader should be told so rather than
   * left to assume the two figures share a scale.
   */
  otherScale: string | null
}

const figure = (value: string | null | undefined): number | null => {
  const parsed = parseFloat(String(value ?? '').replace('±', '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

const clean = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

export function masterFit(
  snapshot: MasterSnapshot,
  requirement: MasterRequirement,
  threshold: number = DEFAULT_ACCURACY_RATIO,
): MasterFit {
  const masterLc = figure(snapshot.masterLeastCount)
  const neededLc = figure(requirement.leastCountValue)
  const masterAcc = figure(snapshot.masterAccuracy)
  const neededAcc = figure(requirement.accuracyValue)

  /**
   * The unit the master was judged in, named only when it differs from the parameter's.
   * Compared case-insensitively and trimmed, because the two are typed on different
   * screens and "°C" and "°c " are the same scale.
   */
  const masterUnit = clean(snapshot.masterAccuracyUnit) ?? clean(snapshot.masterLeastCountUnit)
  const ownUnit = clean(requirement.parameterUnit) ?? clean(requirement.accuracyUnit)
  const otherScale =
    masterUnit && ownUnit && masterUnit.toLowerCase() !== ownUnit.toLowerCase()
      ? masterUnit
      : null

  let leastCount: Compatibility = 'unknown'
  let leastCountNote = 'No least count recorded on this certificate for this master.'
  if (masterLc !== null && neededLc !== null && neededLc !== 0) {
    // The same three-way comparison the register makes: finer has margin, equal has
    // none, coarser cannot record the readings as they were written.
    if (Math.abs(masterLc - neededLc) < 1e-9) {
      leastCount = 'compatible'
      leastCountNote = `Matches the parameter exactly at ${masterLc}, with nothing to spare.`
    } else if (masterLc < neededLc) {
      leastCount = 'safe'
      leastCountNote = `${masterLc} against the ${neededLc} the parameter is recorded to.`
    } else {
      leastCount = 'incompatible'
      leastCountNote = `${masterLc} is coarser than the ${neededLc} the readings were written to.`
    }
  }

  const ratio =
    masterAcc !== null && neededAcc !== null && masterAcc !== 0
      ? Math.abs(neededAcc) / Math.abs(masterAcc)
      : null
  const accuracy = accuracyCompatibility(ratio, threshold)
  const accuracyNote =
    ratio === null
      ? 'No accuracy recorded on this certificate for this master.'
      : `±${masterAcc} against the parameter's ±${neededAcc} — ${ratio.toFixed(1)} : 1, where the lab asks for ${threshold} : 1.` +
        (otherScale ? ` Judged in ${otherScale}, not ${ownUnit}.` : '')

  return { leastCount, accuracy, ratio, leastCountNote, accuracyNote, otherScale }
}
