/**
 * How much error a point is allowed, and which band said so.
 *
 * This is the lab's acceptance rule. A point passes when the error it recorded sits
 * inside the limit its parameter allows, and on a banded parameter that limit changes
 * from point to point - the band is chosen by where the master's reading fell, so five
 * points on one table can be judged against five different figures.
 *
 * It used to live privately inside the certificate store, which meant the engineer's
 * form applied the rule and every screen that only reads a certificate - the reviewer,
 * the authorising admin - printed a verdict it could not explain. Reading the same rule
 * from one place is what lets those screens show the figure a point was judged against
 * rather than a bare tick.
 */

export interface ErrorLimitBand {
  binMin: string
  binMax: string
  leastCount: string
  accuracy: string
}

/**
 * The parts of a parameter the rule reads. Structural on purpose: the store's parameter
 * and a certificate's stored parameter are different shapes of the same thing, and the
 * rule cares about neither.
 */
export interface ErrorLimitParameter {
  accuracyType?: string | null
  accuracyValue?: string | null
  rangeMin?: string | null
  rangeMax?: string | null
  requiresBinning?: boolean
  bins?: ErrorLimitBand[] | null
}

export interface ErrorLimit {
  /** The allowed error, or null where the parameter records nothing to judge by. */
  limit: number | null
  /** Which band decided it, or null on an unbanded parameter or where none matched. */
  bandIndex: number | null
  /** The band's accuracy as written, for a screen that wants to name it. */
  bandAccuracy: string | null
}

const NONE: ErrorLimit = { limit: null, bandIndex: null, bandAccuracy: null }

/** A figure as the form writes it: "±0.26" and "0.26" are the same number. */
const figure = (value: string | null | undefined): number => {
  const parsed = parseFloat(String(value ?? '').replace('±', '').trim())
  return Number.isFinite(parsed) ? parsed : NaN
}

/**
 * Turn an accuracy figure into an allowed error at a reading.
 *
 * Absolute accuracies are already an error. A percentage of reading is taken against
 * the reading itself, and a percentage of scale against the parameter's span - falling
 * back to the bare figure where no span is recorded, which is what the form has always
 * done and what the certificates in the lab were written under.
 */
function limitFrom(
  accuracy: number,
  accuracyType: string | null | undefined,
  reading: number,
  rangeMin: string | null | undefined,
  rangeMax: string | null | undefined,
): number {
  switch (accuracyType) {
    case 'PERCENT_READING':
      return (accuracy * Math.abs(reading)) / 100
    case 'PERCENT_SCALE': {
      const min = figure(rangeMin)
      const max = figure(rangeMax)
      if (Number.isNaN(min) || Number.isNaN(max)) return accuracy
      return (accuracy * Math.abs(max - min)) / 100
    }
    default:
      return accuracy
  }
}

/**
 * The error a point is allowed, given where the master's reading fell.
 *
 * Bands are searched in the order the parameter records them and the first containing
 * the reading wins. They are written inclusive at both ends and so touch at their
 * boundaries - a reading of exactly 20 on bands of 0-20 and 20-40 is taken by the
 * first. That is how the engineer's form has always resolved it, and a reviewer reading
 * a figure back has to be told the same one.
 */
export function calculateErrorLimit(
  parameter: ErrorLimitParameter,
  masterReading: number,
): ErrorLimit {
  const bands = parameter.bins ?? []

  if (parameter.requiresBinning && bands.length > 0) {
    if (!Number.isFinite(masterReading)) return NONE

    for (let i = 0; i < bands.length; i++) {
      const band = bands[i]
      const min = figure(band.binMin)
      const max = figure(band.binMax)
      if (Number.isNaN(min) || Number.isNaN(max)) continue
      if (masterReading < min || masterReading > max) continue

      const accuracy = figure(band.accuracy)
      if (Number.isNaN(accuracy)) {
        return { limit: null, bandIndex: i, bandAccuracy: band.accuracy }
      }
      return {
        limit: limitFrom(
          accuracy,
          parameter.accuracyType,
          masterReading,
          parameter.rangeMin,
          parameter.rangeMax,
        ),
        bandIndex: i,
        bandAccuracy: band.accuracy,
      }
    }

    // A reading outside every band is not a pass and not a fail; it is a point the
    // parameter says nothing about, and saying so is better than judging it by a band
    // that does not cover it.
    return NONE
  }

  const accuracy = figure(parameter.accuracyValue)
  if (Number.isNaN(accuracy)) return NONE

  return {
    limit: limitFrom(
      accuracy,
      parameter.accuracyType,
      masterReading,
      parameter.rangeMin,
      parameter.rangeMax,
    ),
    bandIndex: null,
    bandAccuracy: null,
  }
}

/** The bands a certificate stores, which may arrive as JSON text or already parsed. */
export function bandsOf(bins: unknown): ErrorLimitBand[] {
  const raw = typeof bins === 'string' ? safeParse(bins) : bins
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (b): b is ErrorLimitBand =>
      !!b && typeof b === 'object' && 'binMin' in b && 'binMax' in b,
  )
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
