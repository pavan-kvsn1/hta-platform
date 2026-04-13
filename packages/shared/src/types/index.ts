/**
 * @hta/shared - Shared Types
 *
 * Common types used across the platform.
 */

/**
 * API Response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

/**
 * Pagination params
 */
export interface PaginationParams {
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/**
 * Certificate status
 */
export const CertificateStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  FEEDBACK_PROVIDED: 'FEEDBACK_PROVIDED',
  REVISIONS_REQUESTED: 'REVISIONS_REQUESTED',
  CUSTOMER_REVIEW: 'CUSTOMER_REVIEW',
  CUSTOMER_APPROVED: 'CUSTOMER_APPROVED',
  APPROVED: 'APPROVED',
  AUTHORIZED: 'AUTHORIZED',
} as const

export type CertificateStatusType = (typeof CertificateStatus)[keyof typeof CertificateStatus]

/**
 * Request status
 */
export const RequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const

export type RequestStatusType = (typeof RequestStatus)[keyof typeof RequestStatus]
