/**
 * Audit Types
 */

export type AuditAction =
  // Authentication events
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_COMPLETE'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNLOCKED'
  | 'SESSION_INVALIDATED'
  | 'TOKEN_REFRESHED'
  // User management
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'USER_ACTIVATED'
  | 'ROLE_CHANGED'
  // Certificate events
  | 'CERTIFICATE_CREATED'
  | 'CERTIFICATE_UPDATED'
  | 'CERTIFICATE_SUBMITTED'
  | 'CERTIFICATE_APPROVED'
  | 'CERTIFICATE_REJECTED'
  | 'CERTIFICATE_SENT_TO_CUSTOMER'
  | 'CERTIFICATE_FINALIZED'
  | 'CERTIFICATE_DELETED'
  // Customer events
  | 'CUSTOMER_REGISTERED'
  | 'CUSTOMER_APPROVED'
  | 'CUSTOMER_REJECTED'
  | 'CUSTOMER_FEEDBACK_SUBMITTED'
  // Admin actions
  | 'ADMIN_ACTION'
  | 'SETTINGS_CHANGED'
  | 'DATA_EXPORT'
  | 'DATA_IMPORT'

export type EntityType =
  | 'USER'
  | 'CUSTOMER'
  | 'CERTIFICATE'
  | 'COMPANY'
  | 'SYSTEM'
  | 'SESSION'

export type ActorType =
  | 'USER'
  | 'CUSTOMER'
  | 'SYSTEM'
  | 'ANONYMOUS'

export interface AuditEvent {
  entityType: EntityType
  entityId: string
  action: AuditAction
  actorId?: string
  actorType: ActorType
  changes?: Record<string, unknown>
}

export interface AuditLogEntry extends AuditEvent {
  id: string
  createdAt: Date
}
