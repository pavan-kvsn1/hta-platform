/**
 * TAT (Turn Around Time) Badge Logic Unit Tests
 *
 * Tests for TAT calculation and formatting:
 * - Hour formatting (minutes, hours, days)
 * - TAT status calculation (on_track, warning, overdue, completed)
 * - Elapsed time computation
 *
 * Migrated from hta-calibration/src/components/__tests__/TATBadge.test.tsx
 * Self-contained version testing logic without React rendering
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Types
type TATStatus = 'on_track' | 'warning' | 'overdue' | 'completed'

interface TATResult {
  status: TATStatus
  label: string
  elapsedHours: number
  remainingHours?: number
  completedOnTime?: boolean
}

// Formatting function
function formatHours(hours: number): string {
  const absHours = Math.abs(hours)

  if (absHours < 1) {
    const minutes = Math.round(absHours * 60)
    return `${minutes}m`
  }

  if (absHours < 24) {
    const wholeHours = Math.floor(absHours)
    const minutes = Math.round((absHours - wholeHours) * 60)

    if (minutes === 0) {
      return `${wholeHours}h`
    }
    return `${wholeHours}h ${minutes}m`
  }

  const days = Math.floor(absHours / 24)
  const remainingHours = Math.floor(absHours % 24)

  if (remainingHours === 0) {
    return `${days}d`
  }
  return `${days}d ${remainingHours}h`
}

// TAT calculation function
function calculateTAT(
  createdAt: Date,
  completedAt: Date | null,
  targetHours: number = 48
): TATResult {
  const now = Date.now()
  const startTime = createdAt.getTime()
  const endTime = completedAt ? completedAt.getTime() : now

  const elapsedMs = endTime - startTime
  const elapsedHours = elapsedMs / (1000 * 60 * 60)

  // If completed, check if on time
  if (completedAt) {
    const completedOnTime = elapsedHours <= targetHours
    return {
      status: 'completed',
      label: completedOnTime ? 'Completed On Time' : 'Completed Late',
      elapsedHours,
      completedOnTime,
    }
  }

  const percentUsed = elapsedHours / targetHours

  // Overdue: > 100% of target
  if (percentUsed > 1) {
    return {
      status: 'overdue',
      label: 'Overdue',
      elapsedHours,
      remainingHours: 0,
    }
  }

  // Warning: 75-100% of target
  if (percentUsed >= 0.75) {
    return {
      status: 'warning',
      label: 'Warning',
      elapsedHours,
      remainingHours: targetHours - elapsedHours,
    }
  }

  // On track: < 75% of target
  return {
    status: 'on_track',
    label: 'On Track',
    elapsedHours,
    remainingHours: targetHours - elapsedHours,
  }
}

// Status styling
function getTATStatusStyles(status: TATStatus): { bgClass: string; textClass: string } {
  switch (status) {
    case 'on_track':
      return { bgClass: 'bg-green-100', textClass: 'text-green-800' }
    case 'warning':
      return { bgClass: 'bg-yellow-100', textClass: 'text-yellow-800' }
    case 'overdue':
      return { bgClass: 'bg-red-100', textClass: 'text-red-800' }
    case 'completed':
      return { bgClass: 'bg-blue-100', textClass: 'text-blue-800' }
    default:
      return { bgClass: 'bg-gray-100', textClass: 'text-gray-700' }
  }
}

describe('formatHours', () => {
  it('formats less than 1 hour as minutes', () => {
    expect(formatHours(0)).toBe('0m')
    expect(formatHours(0.5)).toBe('30m')
  })

  it('formats hours less than 24 correctly', () => {
    expect(formatHours(1)).toBe('1h')
    expect(formatHours(12)).toBe('12h')
    expect(formatHours(23)).toBe('23h')
  })

  it('formats hours with remaining minutes', () => {
    expect(formatHours(1.5)).toBe('1h 30m')
    expect(formatHours(2.25)).toBe('2h 15m')
  })

  it('formats exactly 24 hours as 1 day', () => {
    expect(formatHours(24)).toBe('1d')
  })

  it('formats multiple days correctly', () => {
    expect(formatHours(48)).toBe('2d')
    expect(formatHours(72)).toBe('3d')
  })

  it('formats days with remaining hours', () => {
    expect(formatHours(25)).toBe('1d 1h')
    expect(formatHours(36)).toBe('1d 12h')
    expect(formatHours(50)).toBe('2d 2h')
  })

  it('handles negative hours by taking absolute value', () => {
    expect(formatHours(-5)).toBe('5h')
  })
})

describe('calculateTAT', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns on_track status when elapsed time is less than 75% of target', () => {
    const now = new Date('2024-01-01T12:00:00Z')
    vi.setSystemTime(now)

    const createdAt = new Date('2024-01-01T00:00:00Z') // 12 hours ago
    const result = calculateTAT(createdAt, null, 48) // 48 hour target

    expect(result.status).toBe('on_track')
    expect(result.label).toBe('On Track')
    expect(result.elapsedHours).toBeCloseTo(12, 0)
  })

  it('returns warning status when elapsed time is between 75% and 100% of target', () => {
    const now = new Date('2024-01-02T12:00:00Z')
    vi.setSystemTime(now)

    const createdAt = new Date('2024-01-01T00:00:00Z') // 36 hours ago
    const result = calculateTAT(createdAt, null, 48) // 48 hour target (75% = 36h)

    expect(result.status).toBe('warning')
    expect(result.label).toBe('Warning')
  })

  it('returns overdue status when elapsed time exceeds target', () => {
    const now = new Date('2024-01-03T12:00:00Z')
    vi.setSystemTime(now)

    const createdAt = new Date('2024-01-01T00:00:00Z') // 60 hours ago
    const result = calculateTAT(createdAt, null, 48) // 48 hour target

    expect(result.status).toBe('overdue')
    expect(result.label).toBe('Overdue')
  })

  it('returns completed status when completedAt is provided', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z')
    const completedAt = new Date('2024-01-02T00:00:00Z') // 24 hours later
    const result = calculateTAT(createdAt, completedAt, 48)

    expect(result.status).toBe('completed')
    expect(result.label).toBe('Completed On Time')
  })

  it('indicates late completion when completed after target', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z')
    const completedAt = new Date('2024-01-03T12:00:00Z') // 60 hours later
    const result = calculateTAT(createdAt, completedAt, 48)

    expect(result.status).toBe('completed')
    expect(result.label).toBe('Completed Late')
  })

  it('calculates remaining hours for in-progress certificates', () => {
    const now = new Date('2024-01-01T12:00:00Z')
    vi.setSystemTime(now)

    const createdAt = new Date('2024-01-01T00:00:00Z') // 12 hours ago
    const result = calculateTAT(createdAt, null, 48)

    expect(result.remainingHours).toBeCloseTo(36, 0)
  })

  it('sets remaining to 0 when overdue', () => {
    const now = new Date('2024-01-03T12:00:00Z')
    vi.setSystemTime(now)

    const createdAt = new Date('2024-01-01T00:00:00Z')
    const result = calculateTAT(createdAt, null, 48)

    expect(result.remainingHours).toBe(0)
  })

  it('uses default 48 hour target when not specified', () => {
    const now = new Date('2024-01-01T12:00:00Z')
    vi.setSystemTime(now)

    const createdAt = new Date('2024-01-01T00:00:00Z')
    const result = calculateTAT(createdAt, null)

    // 12 hours / 48 hours = 25%, should be on track
    expect(result.status).toBe('on_track')
  })
})

describe('getTATStatusStyles', () => {
  it('returns green colors for on_track status', () => {
    const styles = getTATStatusStyles('on_track')
    expect(styles.bgClass).toBe('bg-green-100')
    expect(styles.textClass).toBe('text-green-800')
  })

  it('returns yellow colors for warning status', () => {
    const styles = getTATStatusStyles('warning')
    expect(styles.bgClass).toBe('bg-yellow-100')
    expect(styles.textClass).toBe('text-yellow-800')
  })

  it('returns red colors for overdue status', () => {
    const styles = getTATStatusStyles('overdue')
    expect(styles.bgClass).toBe('bg-red-100')
    expect(styles.textClass).toBe('text-red-800')
  })

  it('returns blue colors for completed status', () => {
    const styles = getTATStatusStyles('completed')
    expect(styles.bgClass).toBe('bg-blue-100')
    expect(styles.textClass).toBe('text-blue-800')
  })
})

describe('TAT calculation edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('handles very short elapsed times', () => {
    const now = new Date('2024-01-01T00:30:00Z')
    vi.setSystemTime(now)

    const createdAt = new Date('2024-01-01T00:00:00Z') // 30 minutes ago
    const result = calculateTAT(createdAt, null, 48)

    expect(result.status).toBe('on_track')
    expect(result.elapsedHours).toBeCloseTo(0.5, 1)
  })

  it('handles custom short target hours', () => {
    const now = new Date('2024-01-01T03:00:00Z')
    vi.setSystemTime(now)

    const createdAt = new Date('2024-01-01T00:00:00Z') // 3 hours ago
    const result = calculateTAT(createdAt, null, 4) // 4 hour target (75% = 3h)

    expect(result.status).toBe('warning')
  })

  it('handles exactly 75% threshold', () => {
    const now = new Date('2024-01-02T12:00:00Z')
    vi.setSystemTime(now)

    const createdAt = new Date('2024-01-01T00:00:00Z') // Exactly 36 hours = 75% of 48
    const result = calculateTAT(createdAt, null, 48)

    expect(result.status).toBe('warning')
  })

  it('handles exactly 100% threshold', () => {
    const now = new Date('2024-01-03T00:00:00Z')
    vi.setSystemTime(now)

    const createdAt = new Date('2024-01-01T00:00:00Z') // Exactly 48 hours = 100%
    const result = calculateTAT(createdAt, null, 48)

    // At exactly 100%, it's not yet overdue (percentUsed === 1, not > 1)
    expect(result.status).toBe('warning')
  })

  it('handles just over 100% threshold', () => {
    const now = new Date('2024-01-03T00:00:01Z')
    vi.setSystemTime(now)

    const createdAt = new Date('2024-01-01T00:00:00Z') // Just over 48 hours
    const result = calculateTAT(createdAt, null, 48)

    expect(result.status).toBe('overdue')
  })
})
