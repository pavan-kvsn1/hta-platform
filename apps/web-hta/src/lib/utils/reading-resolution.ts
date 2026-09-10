import {
  DEFAULT_CALIBRATION_PRECISION,
  getPrecisionFromLeastCount,
} from './calibration-precision'
import type { CapabilityBucket } from '@/lib/master-instrument-registry'

/**
 * How finely a reading can be written down - asked once, for either instrument.
 *
 * The two sides of a row are read off two different instruments and they do not
 * share a resolution. The UUC's lives on the certificate, as a blanket least count
 * or one per bin. The master's lives on its capability profile in the registry, and
 * until now was not plumbed through at all: master columns borrowed the UUC's, so a
 * thermometer resolving to 0.001 was told off for writing 0.001.
 *
 * Not every profile states one - 118 buckets across the registry record none. That is
 * a third answer, not a reason to fall back quietly: a column whose resolution nobody
 * wrote down cannot be judged, and the panel says so rather than borrowing a number
 * from the other instrument and presenting it as the master's.
 */
export type ReadingSide = 'master' | 'uuc'

export type ReadingResolution =
  /** Stated: this is the smallest division the instrument shows at this reading. */
  | { kind: 'declared'; side: ReadingSide; leastCount: number; precision: number }
  /** A profile and bucket were found, and neither records a least count. */
  | { kind: 'unrecorded'; side: ReadingSide }
  /** No capability was declared for this master, so there is nothing to look in. */
  | { kind: 'undeclared'; side: ReadingSide }

/** The UUC's own resolution, as the certificate states it. */
export interface UucResolutionSource {
  leastCountValue?: string | null
  requiresBinning?: boolean
  bins?: { binMin: string; binMax: string; leastCount: string }[]
}

const numeric = (value: string | null | undefined): number | null => {
  const parsed = Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The bin a reading falls in, or null.
 *
 * Bins are the certificate's own, so they are inclusive at both ends as written; a
 * reading on a boundary belongs to the first bin that claims it.
 */
function binFor(
  bins: NonNullable<UucResolutionSource['bins']>,
  reading: number,
): { leastCount: string } | null {
  if (!Number.isFinite(reading)) return null
  return (
    bins.find((bin) => {
      const min = numeric(bin.binMin)
      const max = numeric(bin.binMax)
      return min !== null && max !== null && reading >= min && reading <= max
    }) ?? null
  )
}

/**
 * The bucket a reading falls in.
 *
 * Buckets carry their own inclusivity, since a registry bucket that ends where the
 * next begins would otherwise claim the boundary twice.
 */
export function bucketForReading(
  buckets: CapabilityBucket[],
  reading: number,
): CapabilityBucket | null {
  if (!Number.isFinite(reading)) return null
  return (
    buckets.find((bucket) => {
      if (bucket.min === null || bucket.max === null) return false
      const overMin = bucket.min_inclusive ? reading >= bucket.min : reading > bucket.min
      const underMax = bucket.max_inclusive ? reading <= bucket.max : reading < bucket.max
      return overMin && underMax
    }) ?? null
  )
}

/** What the UUC's readings are good to at this point of its range. */
export function uucResolution(
  parameter: UucResolutionSource,
  reading: number,
): ReadingResolution {
  const bins = parameter.requiresBinning ? (parameter.bins ?? []) : []

  if (bins.length > 0) {
    // No bin claims the reading - the first one stands in, as it does for the limit,
    // so a reading typed before the bins were settled still has something to go on.
    const bin = binFor(bins, reading) ?? bins[0]
    const leastCount = numeric(bin.leastCount)
    return leastCount === null || leastCount <= 0
      ? { kind: 'unrecorded', side: 'uuc' }
      : {
          kind: 'declared',
          side: 'uuc',
          leastCount,
          precision: getPrecisionFromLeastCount(bin.leastCount),
        }
  }

  const blanket = numeric(parameter.leastCountValue)
  return blanket === null || blanket <= 0
    ? { kind: 'unrecorded', side: 'uuc' }
    : {
        kind: 'declared',
        side: 'uuc',
        leastCount: blanket,
        precision: getPrecisionFromLeastCount(parameter.leastCountValue ?? ''),
      }
}

/**
 * What the master's readings are good to at this point of its range.
 *
 * `buckets` are the ones the declared capability resolves to - the profile's, or the
 * subtype's where a curve or type was named. An empty list means no capability was
 * declared for this master, which is a different answer from one that declares a
 * bucket and states no resolution in it.
 */
export function masterResolution(
  buckets: CapabilityBucket[],
  reading: number,
): ReadingResolution {
  if (buckets.length === 0) return { kind: 'undeclared', side: 'master' }

  const bucket = bucketForReading(buckets, reading)
  // Reading outside every bucket: the capability check has its own say about that, and
  // it is not this function's to answer with a resolution that does not apply.
  if (!bucket) return { kind: 'unrecorded', side: 'master' }

  const leastCount = bucket.least_count?.value ?? null
  if (leastCount === null || !Number.isFinite(leastCount) || leastCount <= 0) {
    return { kind: 'unrecorded', side: 'master' }
  }

  return {
    kind: 'declared',
    side: 'master',
    leastCount,
    precision: getPrecisionFromLeastCount(String(leastCount)),
  }
}

/**
 * The decimals a column is written to, for display.
 *
 * A computed column has to print something, so where the master states no resolution
 * this falls back - to the UUC's where it has one, and to the default otherwise. The
 * warning does not fall back: it says the resolution is not recorded instead.
 */
export function precisionOf(
  resolution: ReadingResolution,
  fallback: ReadingResolution | null = null,
): number {
  if (resolution.kind === 'declared') return resolution.precision
  if (fallback?.kind === 'declared') return fallback.precision
  return DEFAULT_CALIBRATION_PRECISION
}
