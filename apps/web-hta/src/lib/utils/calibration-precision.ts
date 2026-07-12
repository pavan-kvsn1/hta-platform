export const DEFAULT_CALIBRATION_PRECISION = 2
export const MAX_CALIBRATION_PRECISION = 12

export interface CalibrationPrecisionBin {
  binMin: string
  binMax: string
  leastCount: string
}

export interface CalibrationPrecisionParameter {
  leastCountValue?: string | null
  requiresBinning?: boolean
  bins?: CalibrationPrecisionBin[] | string | null
}

export interface ResolvedCalibrationPrecision {
  precision: number
  leastCount: string
  binIndex: number | null
}

function clampPrecision(precision: number): number {
  if (!Number.isFinite(precision)) return DEFAULT_CALIBRATION_PRECISION
  return Math.min(MAX_CALIBRATION_PRECISION, Math.max(0, Math.trunc(precision)))
}

export function getPrecisionFromLeastCount(
  leastCount: string | null | undefined,
  fallback = DEFAULT_CALIBRATION_PRECISION
): number {
  if (!leastCount) return clampPrecision(fallback)

  const text = leastCount.trim()
  const numericValue = Number(text)
  if (!text || !Number.isFinite(numericValue) || numericValue <= 0) {
    return clampPrecision(fallback)
  }

  const decimalIndex = text.indexOf('.')
  return decimalIndex === -1
    ? 0
    : clampPrecision(text.substring(decimalIndex + 1).length)
}

function parseBins(value: CalibrationPrecisionParameter['bins']): CalibrationPrecisionBin[] {
  if (!value) return []

  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }

  if (!Array.isArray(parsed)) return []

  return parsed.filter((bin): bin is CalibrationPrecisionBin => {
    if (!bin || typeof bin !== 'object') return false
    const candidate = bin as Record<string, unknown>
    return typeof candidate.binMin === 'string'
      && typeof candidate.binMax === 'string'
      && typeof candidate.leastCount === 'string'
  })
}

export function resolveCalibrationPrecision(
  parameter: CalibrationPrecisionParameter,
  standardReading: string | number | null | undefined
): ResolvedCalibrationPrecision {
  const bins = parameter.requiresBinning ? parseBins(parameter.bins) : []
  const numericReading = standardReading === null || standardReading === undefined || standardReading === ''
    ? Number.NaN
    : Number(standardReading)

  if (bins.length > 0) {
    const matchingIndex = Number.isFinite(numericReading)
      ? bins.findIndex((bin) => {
          const min = Number(bin.binMin)
          const max = Number(bin.binMax)
          return Number.isFinite(min)
            && Number.isFinite(max)
            && numericReading >= min
            && numericReading <= max
        })
      : -1

    const selectedIndex = matchingIndex >= 0 ? matchingIndex : 0
    const selectedBin = bins[selectedIndex]
    return {
      precision: getPrecisionFromLeastCount(selectedBin.leastCount),
      leastCount: selectedBin.leastCount,
      binIndex: matchingIndex >= 0 ? matchingIndex : null,
    }
  }

  const leastCount = parameter.leastCountValue?.trim() || ''
  return {
    precision: getPrecisionFromLeastCount(leastCount),
    leastCount,
    binIndex: null,
  }
}

export function roundToCalibrationPrecision(value: number, precision: number): number {
  if (!Number.isFinite(value)) return value

  const rounded = Number(value.toFixed(clampPrecision(precision)))
  return Object.is(rounded, -0) ? 0 : rounded
}

export function formatToCalibrationPrecision(
  value: string | number | null | undefined,
  precision: number,
  emptyValue = '-'
): string {
  if (value === null || value === undefined || value === '') return emptyValue

  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return String(value)
  return numericValue.toFixed(clampPrecision(precision))
}
