/**
 * Worker Job Types
 */

// =============================================================================
// EMAIL JOB TYPES
// =============================================================================

export type EmailJobName =
  | 'password-reset'
  | 'staff-activation'
  | 'certificate-submitted'
  | 'certificate-reviewed'
  | 'customer-approval'
  | 'customer-review'
  | 'customer-review-registered'
  | 'customer-authorized-registered'
  | 'customer-authorized-token'
  | 'reviewer-customer-expired'
  | 'offline-codes-expiry'

export interface BaseEmailJob {
  to: string
  tenantName?: string
}

export interface PasswordResetEmailJob extends BaseEmailJob {
  type: 'password-reset'
  userName: string
  resetUrl: string
  expiryMinutes?: number
}

export interface StaffActivationEmailJob extends BaseEmailJob {
  type: 'staff-activation'
  userName: string
  activationUrl: string
}

export interface CertificateSubmittedEmailJob extends BaseEmailJob {
  type: 'certificate-submitted'
  reviewerName: string
  certificateNumber: string
  assigneeName: string
  customerName?: string
  dashboardUrl: string
}

export interface CertificateReviewedEmailJob extends BaseEmailJob {
  type: 'certificate-reviewed'
  assigneeName: string
  certificateNumber: string
  reviewerName: string
  approved: boolean
  revisionNote?: string
  dashboardUrl: string
}

export interface CustomerApprovalEmailJob extends BaseEmailJob {
  type: 'customer-approval'
  recipientName: string
  certificateNumber: string
  customerName: string
  approverName: string
  status: 'approved' | 'rejected'
  rejectionNote?: string
  dashboardUrl: string
}

export interface CustomerReviewEmailJob extends BaseEmailJob {
  type: 'customer-review'
  customerName: string
  certificateNumber: string
  instrumentDescription: string
  reviewUrl: string
}

export interface CustomerReviewRegisteredEmailJob extends BaseEmailJob {
  type: 'customer-review-registered'
  customerName: string
  certificateNumber: string
  instrumentDescription: string
  loginUrl: string
}

export interface CustomerAuthorizedRegisteredEmailJob extends BaseEmailJob {
  type: 'customer-authorized-registered'
  customerName: string
  certificateNumber: string
  instrumentDescription: string
  loginUrl: string
}

export interface CustomerAuthorizedTokenEmailJob extends BaseEmailJob {
  type: 'customer-authorized-token'
  customerName: string
  certificateNumber: string
  instrumentDescription: string
  downloadUrl: string
}

export interface ReviewerCustomerExpiredEmailJob extends BaseEmailJob {
  type: 'reviewer-customer-expired'
  reviewerName: string
  certificateNumber: string
  customerName: string
  instrumentDescription: string
  dashboardUrl: string
}

export interface OfflineCodesExpiryEmailJob extends BaseEmailJob {
  type: 'offline-codes-expiry'
  engineerName: string
  loginUrl: string
}

export type EmailJobData =
  | PasswordResetEmailJob
  | StaffActivationEmailJob
  | CertificateSubmittedEmailJob
  | CertificateReviewedEmailJob
  | CustomerApprovalEmailJob
  | CustomerReviewEmailJob
  | CustomerReviewRegisteredEmailJob
  | CustomerAuthorizedRegisteredEmailJob
  | CustomerAuthorizedTokenEmailJob
  | ReviewerCustomerExpiredEmailJob
  | OfflineCodesExpiryEmailJob

// =============================================================================
// NOTIFICATION JOB TYPES
// =============================================================================

export type NotificationJobName =
  | 'create-notification'
  | 'send-push'
  | 'batch-notifications'

export interface CreateNotificationJob {
  type: 'create-notification'
  userId?: string
  customerId?: string
  notificationType: string
  certificateId?: string
  data: Record<string, string>
}

export interface SendPushNotificationJob {
  type: 'send-push'
  userId?: string
  customerId?: string
  title: string
  body: string
  data?: Record<string, string>
}

export interface BatchNotificationsJob {
  type: 'batch-notifications'
  notifications: Array<{
    userId?: string
    customerId?: string
    notificationType: string
    certificateId?: string
    data: Record<string, string>
  }>
}

export type NotificationJobData =
  | CreateNotificationJob
  | SendPushNotificationJob
  | BatchNotificationsJob

// =============================================================================
// CLEANUP JOB TYPES
// =============================================================================

export type CleanupJobName =
  | 'expired-tokens'
  | 'expired-sessions'
  | 'old-notifications'
  | 'orphaned-files'
  | 'expired-reviews'
  | 'offline-codes'

export interface ExpiredTokensCleanupJob {
  type: 'expired-tokens'
  olderThan?: Date
}

export interface ExpiredSessionsCleanupJob {
  type: 'expired-sessions'
  olderThan?: Date
}

export interface OldNotificationsCleanupJob {
  type: 'old-notifications'
  olderThanDays: number
  onlyRead?: boolean
}

export interface OrphanedFilesCleanupJob {
  type: 'orphaned-files'
  dryRun?: boolean
}

export interface ExpiredReviewsCleanupJob {
  type: 'expired-reviews'
}

export interface OfflineCodesCleanupJob {
  type: 'offline-codes'
}

export type CleanupJobData =
  | ExpiredTokensCleanupJob
  | ExpiredSessionsCleanupJob
  | OldNotificationsCleanupJob
  | OrphanedFilesCleanupJob
  | ExpiredReviewsCleanupJob
  | OfflineCodesCleanupJob
