const TIME_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

export function isCalibrationTime(value?: string | null): value is string {
  return typeof value === 'string' && TIME_24H_REGEX.test(value)
}

export function calculateCalibrationMinutes(
  startTime?: string | null,
  endTime?: string | null,
): number | null {
  if (!isCalibrationTime(startTime) || !isCalibrationTime(endTime)) return null

  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [endHours, endMinutes] = endTime.split(':').map(Number)
  const total = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes)

  return total > 0 ? total : null
}

export function formatCalibrationHours(
  startTime?: string | null,
  endTime?: string | null,
): string {
  const minutes = calculateCalibrationMinutes(startTime, endTime)
  if (!minutes) return '-'

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) return `${remainingMinutes}m`
  if (remainingMinutes === 0) return `${hours}h`
  return `${hours}h ${remainingMinutes}m`
}

export function formatCalibrationTimeRange(
  startTime?: string | null,
  endTime?: string | null,
): string {
  if (!isCalibrationTime(startTime) || !isCalibrationTime(endTime)) return '-'
  return `${startTime} - ${endTime}`
}
