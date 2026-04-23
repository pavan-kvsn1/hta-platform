/**
 * Notification Types
 */

// Notification types
export type NotificationType =
  // Engineer (Assignee) notifications
  | 'REVISION_REQUESTED'            // Reviewer requested revision
  | 'CERTIFICATE_APPROVED'          // Reviewer approved certificate
  | 'CERTIFICATE_REJECTED'          // Reviewer rejected certificate
  | 'SENT_TO_CUSTOMER'              // Certificate sent to customer
  | 'CERTIFICATE_FINALIZED'         // Customer approved certificate
  | 'CUSTOMER_REVISION_FORWARDED'   // Admin forwarded customer revision to engineer
  // Reviewer notifications
  | 'SUBMITTED_FOR_REVIEW'          // Assignee submitted for review
  | 'ENGINEER_RESPONDED'            // Assignee responded to revision
  | 'CUSTOMER_REVISION_REQUEST'     // Customer requested revision
  | 'CUSTOMER_APPROVED'             // Customer approved certificate
  // Admin notifications
  | 'ADMIN_AUTHORIZED'              // Admin authorized certificate
  | 'STAFF_CREATED'                 // Admin created a new staff user
  | 'MASTER_INSTRUMENT_CHANGE'      // Master instrument created/updated/deleted
  // Customer notifications
  | 'CERTIFICATE_READY'             // Certificate sent for approval
  | 'REVIEWER_REPLIED'              // Reviewer replied to feedback
  // Chat notifications
  | 'NEW_CHAT_MESSAGE'              // New chat message received
  // Account notifications
  | 'PASSWORD_CHANGED'              // User password was changed
  // Registration notifications
  | 'REGISTRATION_SUBMITTED'        // Customer submitted registration (to Admin)
  | 'REGISTRATION_APPROVED'         // Admin approved registration (to Customer)
  | 'REGISTRATION_REJECTED'         // Admin rejected registration (to Customer)

// Notification template config
export interface NotificationTemplate {
  title: string
  message: (data: Record<string, string>) => string
}

// Notification creation params
export interface CreateNotificationParams {
  userId?: string
  customerId?: string
  type: NotificationType
  certificateId?: string
  data?: Record<string, string>
  title?: string
  message?: string
}

// Notification query params
export interface GetNotificationsParams {
  userId?: string
  customerId?: string
  limit?: number
  offset?: number
  unreadOnly?: boolean
  filterByInvolvement?: boolean
}

// Notification result
export interface NotificationResult {
  notifications: Notification[]
  total: number
  unreadCount: number
}

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  readAt: Date | null
  certificateId: string | null
  data: Record<string, unknown> | null
  createdAt: Date
  certificate?: {
    id: string
    certificateNumber: string
    status: string
  } | null
}
