/**
 * Whether a number typed into a parameter is one the certificate can compute with.
 *
 * These fields are free text, and the lab's own records show what gets typed into
 * them: a Pressure range starting at the letter "O" rather than zero, a Flow accuracy
 * of "#", a Pressure least count of "NA". Nothing rejected any of it, so it saved, and
 * every downstream calculation quietly gave up - requiredRanges returns nothing unless
 * all four values parse, so the master comparison, the accuracy ratio and the
 * least-count check all went blank with no explanation.
 *
 * Caught at entry it is five seconds' work. Caught later it is a certificate that
 * cannot be checked against its master and nobody knowing why.
 */

/** A run of digits with an optional sign and decimal point, and nothing else. */
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/

export type NumericField = 'range' | 'least count' | 'accuracy'

/**
 * The problem with a typed value, or null if there is none.
 *
 * Blank is not a problem here. A parameter still being filled in is not the same as one
 * filled in wrongly, and saying so on every empty field would train people to ignore
 * the message. What is missing is reported where it matters - on the master comparison,
 * which is the thing that cannot be done without it.
 */
export function numberProblem(value: string | undefined, field: NumericField): string | null {
  const raw = (value ?? '').trim()
  if (raw === '') return null

  // "± 0.5" is how an accuracy is often written down, and it is not a mistake.
  const cleaned = raw.replace('±', '').trim()

  if (!NUMBER.test(cleaned)) {
    // The two that actually happen: a capital O for zero, a lowercase l for one. Both
    // sit next to their digit on the keyboard and read identically in most fonts.
    const repaired = cleaned.replace(/O/g, '0').replace(/l/g, '1')
    if (repaired !== cleaned && NUMBER.test(repaired)) {
      return `Not a number - did you mean ${repaired}?`
    }
    return 'Not a number'
  }

  const parsed = parseFloat(cleaned)
  if (field !== 'range' && parsed <= 0) {
    // A least count of zero claims infinite resolution; a zero accuracy claims a
    // perfect instrument. Both divide into the ratios further down.
    return `${field === 'accuracy' ? 'Accuracy' : 'Least count'} must be greater than zero`
  }

  return null
}

/** Whether a range reads the right way round, once both ends are numbers. */
export function rangeProblem(min: string | undefined, max: string | undefined): string | null {
  if (numberProblem(min, 'range') || numberProblem(max, 'range')) return null
  const from = parseFloat((min ?? '').trim())
  const to = parseFloat((max ?? '').trim())
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return to > from ? null : 'Max must be greater than Min'
}
