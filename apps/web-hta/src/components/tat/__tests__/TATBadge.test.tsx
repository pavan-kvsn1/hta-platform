import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TATBadge, calculateTAT, formatHours } from '../TATBadge'
import type { TATStatus, TATInfo } from '../TATBadge'

// Test the exports from index.ts
import * as TATExports from '../index'

describe('TAT index exports', () => {
  it('exports TATBadge component', () => {
    expect(TATExports.TATBadge).toBeDefined()
    expect(typeof TATExports.TATBadge).toBe('function')
  })

  it('exports calculateTAT function', () => {
    expect(TATExports.calculateTAT).toBeDefined()
    expect(typeof TATExports.calculateTAT).toBe('function')
  })

  it('exports formatHours function', () => {
    expect(TATExports.formatHours).toBeDefined()
    expect(typeof TATExports.formatHours).toBe('function')
  })
})

describe('formatHours', () => {
  it('formats sub-hour times as minutes', () => {
    expect(formatHours(0.5)).toBe('30m')
    expect(formatHours(0.25)).toBe('15m')
    expect(formatHours(0.1)).toBe('6m')
  })

  it('formats hours under 24 with hours and minutes', () => {
    expect(formatHours(1)).toBe('1h')
    expect(formatHours(1.5)).toBe('1h 30m')
    expect(formatHours(23.75)).toBe('23h 45m')
  })

  it('formats hours 24 and above as days and hours', () => {
    expect(formatHours(24)).toBe('1d')
    expect(formatHours(25)).toBe('1d 1h')
    expect(formatHours(48)).toBe('2d')
    expect(formatHours(50)).toBe('2d 2h')
    expect(formatHours(72)).toBe('3d')
  })

  it('handles negative hours by using absolute value', () => {
    expect(formatHours(-0.5)).toBe('30m')
    expect(formatHours(-2)).toBe('2h')
    expect(formatHours(-24)).toBe('1d')
  })
})

describe('calculateTAT', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns on_track status when elapsed time is under 75% of target', () => {
    const createdAt = new Date('2024-01-15T00:00:00Z') // 12 hours ago
    const result = calculateTAT(createdAt, null, 48)

    expect(result.status).toBe('on_track')
    expect(result.elapsedHours).toBeCloseTo(12)
    expect(result.remainingHours).toBeCloseTo(36)
    expect(result.label).toBe('On Track')
  })

  it('returns warning status when elapsed time is between 75% and 100% of target', () => {
    const createdAt = new Date('2024-01-13T00:00:00Z') // 60 hours ago (but test with 40h elapsed)
    vi.setSystemTime(new Date('2024-01-15T16:00:00Z')) // 40 hours from 1/14 00:00
    const testCreatedAt = new Date('2024-01-14T00:00:00Z')
    const result = calculateTAT(testCreatedAt, null, 48)

    expect(result.status).toBe('warning')
    expect(result.label).toBe('Warning')
  })

  it('returns overdue status when elapsed time exceeds target', () => {
    const createdAt = new Date('2024-01-12T00:00:00Z') // 84 hours ago
    const result = calculateTAT(createdAt, null, 48)

    expect(result.status).toBe('overdue')
    expect(result.label).toBe('Overdue')
  })

  it('returns completed status when certificate is completed on time', () => {
    const createdAt = new Date('2024-01-14T00:00:00Z')
    const completedAt = new Date('2024-01-15T00:00:00Z') // 24 hours later
    const result = calculateTAT(createdAt, completedAt, 48)

    expect(result.status).toBe('completed')
    expect(result.elapsedHours).toBeCloseTo(24)
    expect(result.label).toBe('Completed On Time')
  })

  it('returns completed status with late indicator when completed after target', () => {
    const createdAt = new Date('2024-01-12T00:00:00Z')
    const completedAt = new Date('2024-01-15T00:00:00Z') // 72 hours later
    const result = calculateTAT(createdAt, completedAt, 48)

    expect(result.status).toBe('completed')
    expect(result.elapsedHours).toBeCloseTo(72)
    expect(result.label).toBe('Completed Late')
  })

  it('accepts string dates', () => {
    const result = calculateTAT('2024-01-15T00:00:00Z', null, 48)
    expect(result.status).toBe('on_track')
    expect(result.elapsedHours).toBeCloseTo(12)
  })

  it('accepts string dates for completedAt', () => {
    const result = calculateTAT('2024-01-14T00:00:00Z', '2024-01-15T00:00:00Z', 48)
    expect(result.status).toBe('completed')
    expect(result.elapsedHours).toBeCloseTo(24)
  })
})

describe('TATBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('default variant', () => {
    it('renders on_track status', () => {
      render(<TATBadge createdAt="2024-01-15T00:00:00Z" targetHours={48} />)
      expect(screen.getByText('On Track')).toBeInTheDocument()
      expect(screen.getByText('12h')).toBeInTheDocument()
    })

    it('renders warning status', () => {
      vi.setSystemTime(new Date('2024-01-15T16:00:00Z'))
      render(<TATBadge createdAt="2024-01-14T00:00:00Z" targetHours={48} />)
      expect(screen.getByText('Warning')).toBeInTheDocument()
    })

    it('renders overdue status', () => {
      render(<TATBadge createdAt="2024-01-12T00:00:00Z" targetHours={48} />)
      expect(screen.getByText('Overdue')).toBeInTheDocument()
    })

    it('renders completed status on time', () => {
      render(
        <TATBadge
          createdAt="2024-01-14T00:00:00Z"
          completedAt="2024-01-15T00:00:00Z"
          targetHours={48}
        />
      )
      expect(screen.getByText('Completed On Time')).toBeInTheDocument()
    })

    it('renders completed status late', () => {
      render(
        <TATBadge
          createdAt="2024-01-12T00:00:00Z"
          completedAt="2024-01-15T00:00:00Z"
          targetHours={48}
        />
      )
      expect(screen.getByText('Completed Late')).toBeInTheDocument()
    })

    it('uses default 48h target if not specified', () => {
      render(<TATBadge createdAt="2024-01-15T00:00:00Z" />)
      expect(screen.getByText('48h')).toBeInTheDocument()
    })

    it('applies custom className', () => {
      const { container } = render(
        <TATBadge createdAt="2024-01-15T00:00:00Z" className="custom-class" />
      )
      expect(container.firstChild).toHaveClass('custom-class')
    })
  })

  describe('compact variant', () => {
    it('renders compact version', () => {
      const { container } = render(
        <TATBadge createdAt="2024-01-15T00:00:00Z" variant="compact" />
      )
      expect(screen.getByText('On Track')).toBeInTheDocument()
      // Compact variant is a span
      expect(container.querySelector('span')).toBeInTheDocument()
    })

    it('shows title on hover', () => {
      render(<TATBadge createdAt="2024-01-15T00:00:00Z" variant="compact" />)
      const badge = screen.getByText('On Track')
      expect(badge).toHaveAttribute('title')
    })
  })

  describe('detailed variant', () => {
    it('renders detailed version with progress bar', () => {
      render(<TATBadge createdAt="2024-01-15T00:00:00Z" variant="detailed" />)
      expect(screen.getByText('On Track')).toBeInTheDocument()
      expect(screen.getByText('Target: 48h')).toBeInTheDocument()
    })

    it('shows elapsed time', () => {
      render(
        <TATBadge
          createdAt="2024-01-15T00:00:00Z"
          variant="detailed"
          targetHours={48}
        />
      )
      expect(screen.getByText('12h')).toBeInTheDocument()
    })
  })
})
