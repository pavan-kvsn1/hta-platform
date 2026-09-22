/**
 * Whether a reading is one an instrument could have shown.
 *
 * A least count is a step, not a number of decimal places. An instrument stepping in
 * 0.025 shows 0.050 and 0.075 and nothing in between, and a reading of 0.031 is not a
 * reading at all - it is a typing error, or the least count is wrong. Neither is
 * something to correct silently, so nothing here rewrites a value: it says which two
 * readings sit either side and leaves the choice to the person who saw the instrument.
 *
 * Read as decimal places, 0.025 and 0.001 are indistinguishable - both "three" - which
 * is why this works from the step itself.
 */
import { decimalsWritten } from './calibration-precision'

export type StepCheck =
  /** The value is a whole number of steps. */
  | { kind: 'ok' }
  /** It is not, and these are the two readings either side of it. */
  | { kind: 'off'; below: string; above: string }
  /** No step was recorded, or the value is not a figure. Nothing can be judged. */
  | { kind: 'unknown' }

const figure = (value: string | number | null | undefined): number | null => {
  const text = String(value ?? '').trim()
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Both figures as whole numbers of the same unit.
 *
 * Dividing does not work here. A computer asked for 0.075 / 0.025 answers
 * 3.0000000000000004, and 2.4 / 0.2 answers 11.999999999999998 - so a reading that
 * lands exactly on a step is reported as falling between two, on the instruments whose
 * least counts most need checking. Scaling both to integers first and rounding away the
 * representation error is what makes the question answerable at all.
 */
function inWholeSteps(value: number, step: number): { value: number; step: number } {
  const places = Math.max(decimalsWritten(value), decimalsWritten(step))
  const scale = Math.pow(10, places)
  return { value: Math.round(value * scale), step: Math.round(step * scale) }
}

/** Does this reading land on a step of this size? */
export function checkStep(
  reading: string | number | null | undefined,
  leastCount: string | number | null | undefined,
): StepCheck {
  const value = figure(reading)
  const step = figure(leastCount)
  if (value === null || step === null || step <= 0) return { kind: 'unknown' }

  const scaled = inWholeSteps(value, step)
  if (scaled.step === 0) return { kind: 'unknown' }
  if (scaled.value % scaled.step === 0) return { kind: 'ok' }

  // Written to the step's own decimals, so the suggestions read like readings rather
  // than like arithmetic: 49.70 and 49.75, not 49.7 and 49.75.
  const places = decimalsWritten(leastCount)
  const stepsBelow = Math.floor(scaled.value / scaled.step)
  const below = (stepsBelow * scaled.step) / Math.pow(10, Math.max(decimalsWritten(value), places))
  return {
    kind: 'off',
    below: below.toFixed(places),
    above: (below + step).toFixed(places),
  }
}

/**
 * The sentence a reader is shown when a value falls between steps.
 *
 * Both neighbours, never one: picking for them would be a guess about which way the
 * instrument actually read, and that is the one thing the person typing knows and this
 * does not.
 */
export function stepWarning(
  reading: string | number | null | undefined,
  leastCount: string | number | null | undefined,
): string | null {
  const check = checkStep(reading, leastCount)
  if (check.kind !== 'off') return null
  return `${String(reading).trim()} is not a multiple of ${String(leastCount).trim()}. Nearest valid readings: ${check.below} or ${check.above}.`
}
