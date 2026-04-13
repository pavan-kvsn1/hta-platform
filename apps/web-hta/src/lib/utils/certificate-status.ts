/**
 * Certificate Status State Machine
 *
 * This module defines the valid certificate statuses and transition rules.
 * Used by both the application (for enforcing transitions) and tests (for validation).
 */

export const CERTIFICATE_STATUSES = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  PENDING_CUSTOMER_APPROVAL: 'PENDING_CUSTOMER_APPROVAL',
  CUSTOMER_REVISION_REQUIRED: 'CUSTOMER_REVISION_REQUIRED',
  APPROVED: 'APPROVED',
  PENDING_ADMIN_AUTHORIZATION: 'PENDING_ADMIN_AUTHORIZATION',
  AUTHORIZED: 'AUTHORIZED',
  REJECTED: 'REJECTED',
} as const

export type CertificateStatus = typeof CERTIFICATE_STATUSES[keyof typeof CERTIFICATE_STATUSES]

/**
 * Valid status transitions map.
 * Each status maps to an array of statuses it can transition to.
 */
export const VALID_TRANSITIONS: Record<CertificateStatus, CertificateStatus[]> = {
  DRAFT: ['PENDING_REVIEW'],
  PENDING_REVIEW: ['REVISION_REQUIRED', 'PENDING_CUSTOMER_APPROVAL', 'REJECTED'],
  REVISION_REQUIRED: ['PENDING_REVIEW'],
  PENDING_CUSTOMER_APPROVAL: ['CUSTOMER_REVISION_REQUIRED', 'APPROVED'],
  CUSTOMER_REVISION_REQUIRED: ['PENDING_CUSTOMER_APPROVAL', 'REVISION_REQUIRED'],
  APPROVED: ['PENDING_ADMIN_AUTHORIZATION'],
  PENDING_ADMIN_AUTHORIZATION: ['AUTHORIZED'],
  AUTHORIZED: [],
  REJECTED: [],
}

/**
 * Check if a status transition is valid.
 * @param from - Current status
 * @param to - Target status
 * @returns true if the transition is allowed
 */
export function canTransition(from: CertificateStatus, to: CertificateStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Check if a status is terminal (no further transitions allowed).
 * @param status - Status to check
 * @returns true if AUTHORIZED or REJECTED
 */
export function isTerminalStatus(status: CertificateStatus): boolean {
  return status === 'AUTHORIZED' || status === 'REJECTED'
}

/**
 * Check if a status requires customer action.
 * @param status - Status to check
 * @returns true if customer must take action
 */
export function requiresCustomerAction(status: CertificateStatus): boolean {
  return status === 'PENDING_CUSTOMER_APPROVAL' || status === 'CUSTOMER_REVISION_REQUIRED'
}

/**
 * Check if a status requires staff (Engineer/Reviewer/Admin) action.
 * @param status - Status to check
 * @returns true if staff must take action
 */
export function requiresStaffAction(status: CertificateStatus): boolean {
  return ['DRAFT', 'PENDING_REVIEW', 'REVISION_REQUIRED', 'PENDING_ADMIN_AUTHORIZATION'].includes(status)
}

/**
 * Get human-readable label for a status.
 * @param status - Status to get label for
 * @returns Human-readable status label
 */
export function getStatusLabel(status: CertificateStatus): string {
  const labels: Record<CertificateStatus, string> = {
    DRAFT: 'Draft',
    PENDING_REVIEW: 'Pending Review',
    REVISION_REQUIRED: 'Revision Required',
    PENDING_CUSTOMER_APPROVAL: 'Pending Customer Approval',
    CUSTOMER_REVISION_REQUIRED: 'Customer Revision Required',
    APPROVED: 'Approved',
    PENDING_ADMIN_AUTHORIZATION: 'Pending Admin Authorization',
    AUTHORIZED: 'Authorized',
    REJECTED: 'Rejected',
  }
  return labels[status] || status
}

/**
 * Get the next valid statuses from the current status.
 * @param status - Current status
 * @returns Array of valid next statuses
 */
export function getNextStatuses(status: CertificateStatus): CertificateStatus[] {
  return VALID_TRANSITIONS[status] || []
}
