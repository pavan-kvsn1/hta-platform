/**
 * Compliance Types
 *
 * Type definitions for GDPR compliance features.
 */

export type ConsentType =
  | 'essential_cookies'
  | 'analytics'
  | 'marketing_email'
  | 'third_party_sharing'
  | 'data_processing'

export interface ConsentRecord {
  userId: string
  userType: 'user' | 'customer'
  type: ConsentType
  granted: boolean
  grantedAt?: Date
  revokedAt?: Date
  version: string
  ipAddress?: string
  userAgent?: string
}

export interface DataExportResult {
  user: {
    id: string
    email: string
    name: string
    companyName?: string | null
    createdAt: Date
    updatedAt: Date
  }
  certificates: Array<{
    id: string
    certificateNumber: string
    status: string
    createdAt: Date
  }>
  auditLogs: Array<{
    id: string
    action: string
    entityType: string
    createdAt: Date
  }>
  consents: ConsentRecord[]
  exportedAt: Date
  format: 'json'
}

export interface DataDeletionResult {
  success: boolean
  pseudonymized: boolean
  retainedData?: string[]
  deletedAt: Date
}

export interface DataProcessingActivity {
  id: string
  purpose: string
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests'
  dataCategories: string[]
  retention: string
  thirdParties: string[]
  services: ('web' | 'api' | 'worker')[]
  isActive: boolean
}

export interface ComplianceAuditEvent {
  action: string
  resourceType: string
  resourceId: string
  userId?: string
  userEmail?: string
  userRole?: string
  userType?: 'user' | 'customer'
  service: 'web' | 'api' | 'worker'
  tenantId?: string
  ipAddress?: string
  userAgent?: string
  details?: Record<string, unknown>
  piiAccessed?: string[]
  piiModified?: string[]
}
