import { describe, it, expect } from 'vitest'
import {
  TAT_THRESHOLDS,
  PERFORMANCE_THRESHOLDS,
  EXPIRY_DURATIONS,
  DEFAULT_CUSTOMER_TAT_TARGET_HOURS,
} from '../../src/lib/constants/thresholds'

describe('Threshold Constants', () => {
  describe('TAT_THRESHOLDS', () => {
    it('should have WARNING_HOURS defined', () => {
      expect(TAT_THRESHOLDS.WARNING_HOURS).toBeDefined()
      expect(typeof TAT_THRESHOLDS.WARNING_HOURS).toBe('number')
    })

    it('should have OVERDUE_HOURS defined', () => {
      expect(TAT_THRESHOLDS.OVERDUE_HOURS).toBeDefined()
      expect(typeof TAT_THRESHOLDS.OVERDUE_HOURS).toBe('number')
    })

    it('should have WARNING_HOURS less than OVERDUE_HOURS', () => {
      expect(TAT_THRESHOLDS.WARNING_HOURS).toBeLessThan(TAT_THRESHOLDS.OVERDUE_HOURS)
    })

    it('should have expected values for TAT indicators', () => {
      expect(TAT_THRESHOLDS.WARNING_HOURS).toBe(24)
      expect(TAT_THRESHOLDS.OVERDUE_HOURS).toBe(48)
    })
  })

  describe('PERFORMANCE_THRESHOLDS', () => {
    it('should have QUICK_RESOLUTION_HOURS defined', () => {
      expect(PERFORMANCE_THRESHOLDS.QUICK_RESOLUTION_HOURS).toBeDefined()
      expect(typeof PERFORMANCE_THRESHOLDS.QUICK_RESOLUTION_HOURS).toBe('number')
    })

    it('should have expected value for quick resolution', () => {
      expect(PERFORMANCE_THRESHOLDS.QUICK_RESOLUTION_HOURS).toBe(4)
    })
  })

  describe('EXPIRY_DURATIONS', () => {
    it('should have ACTIVATION_TOKEN_DAYS defined', () => {
      expect(EXPIRY_DURATIONS.ACTIVATION_TOKEN_DAYS).toBeDefined()
      expect(typeof EXPIRY_DURATIONS.ACTIVATION_TOKEN_DAYS).toBe('number')
    })

    it('should have CUSTOMER_REVIEW_TOKEN_DAYS defined', () => {
      expect(EXPIRY_DURATIONS.CUSTOMER_REVIEW_TOKEN_DAYS).toBeDefined()
      expect(typeof EXPIRY_DURATIONS.CUSTOMER_REVIEW_TOKEN_DAYS).toBe('number')
    })

    it('should have expected values for token expiry', () => {
      expect(EXPIRY_DURATIONS.ACTIVATION_TOKEN_DAYS).toBe(7)
      expect(EXPIRY_DURATIONS.CUSTOMER_REVIEW_TOKEN_DAYS).toBe(30)
    })

    it('should have customer token expiry longer than activation token', () => {
      expect(EXPIRY_DURATIONS.CUSTOMER_REVIEW_TOKEN_DAYS).toBeGreaterThan(
        EXPIRY_DURATIONS.ACTIVATION_TOKEN_DAYS
      )
    })
  })

  describe('DEFAULT_CUSTOMER_TAT_TARGET_HOURS', () => {
    it('should be defined and a number', () => {
      expect(DEFAULT_CUSTOMER_TAT_TARGET_HOURS).toBeDefined()
      expect(typeof DEFAULT_CUSTOMER_TAT_TARGET_HOURS).toBe('number')
    })

    it('should have expected value', () => {
      expect(DEFAULT_CUSTOMER_TAT_TARGET_HOURS).toBe(48)
    })

    it('should match TAT_THRESHOLDS.OVERDUE_HOURS', () => {
      // These should be consistent for business logic
      expect(DEFAULT_CUSTOMER_TAT_TARGET_HOURS).toBe(TAT_THRESHOLDS.OVERDUE_HOURS)
    })
  })

  describe('threshold business logic validation', () => {
    it('should allow reasonable time windows for each stage', () => {
      // Warning at 24 hours gives staff time to react
      expect(TAT_THRESHOLDS.WARNING_HOURS).toBeGreaterThanOrEqual(8)

      // Overdue at 48 hours is a reasonable business SLA
      expect(TAT_THRESHOLDS.OVERDUE_HOURS).toBeGreaterThanOrEqual(24)
      expect(TAT_THRESHOLDS.OVERDUE_HOURS).toBeLessThanOrEqual(72)
    })

    it('should have quick resolution threshold shorter than warning', () => {
      expect(PERFORMANCE_THRESHOLDS.QUICK_RESOLUTION_HOURS).toBeLessThan(
        TAT_THRESHOLDS.WARNING_HOURS
      )
    })
  })
})
