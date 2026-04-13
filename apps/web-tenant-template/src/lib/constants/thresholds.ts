/**
 * Business logic threshold constants.
 *
 * Centralizes time-related thresholds used across the application
 * for TAT calculations, performance metrics, and token expiry.
 */

/**
 * TAT Thresholds for status indicators.
 * Used by TATBadge components to determine color/urgency.
 */
export const TAT_THRESHOLDS = {
  /** Hours before TAT is considered "warning" (amber) */
  WARNING_HOURS: 24,
  /** Hours before TAT is considered "overdue" (red) */
  OVERDUE_HOURS: 48,
} as const

/**
 * Performance metrics thresholds.
 * Used by user-tat-calculator for metrics analysis.
 */
export const PERFORMANCE_THRESHOLDS = {
  /** Hours threshold for "quick resolution" credit */
  QUICK_RESOLUTION_HOURS: 4,
} as const

/**
 * Token/session expiry durations.
 */
export const EXPIRY_DURATIONS = {
  /** Days until activation token expires */
  ACTIVATION_TOKEN_DAYS: 7,
  /** Days until customer review token expires */
  CUSTOMER_REVIEW_TOKEN_DAYS: 30,
} as const

/**
 * Default TAT target for customer response time.
 * Used when calculating if a certificate is overdue for customer action.
 */
export const DEFAULT_CUSTOMER_TAT_TARGET_HOURS = 48
