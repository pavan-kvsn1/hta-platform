/**
 * Compliance Module
 *
 * GDPR compliance features for the HTA Platform.
 * - Data Processing Inventory (Article 30)
 * - Data Subject Rights (Articles 15-17)
 * - Consent Management (Article 7)
 * - Compliance Audit Logging
 */

// Types
export type {
  ConsentType,
  ConsentRecord,
  DataExportResult,
  DataDeletionResult,
  DataProcessingActivity,
  ComplianceAuditEvent,
} from './types.js'

// Data Processing Inventory
export {
  DataProcessingInventory,
  getActiveProcessingActivities,
  getProcessingActivitiesByService,
  getProcessingActivitiesByLegalBasis,
  getThirdPartyRecipients,
  getDataCategories,
} from './data-inventory.js'

// Compliance Audit Logging
export {
  logComplianceEvent,
  logPiiAccess,
  logPiiModification,
  logDataExport,
  logDataDeletion,
  logDataRectification,
  logConsentChange,
  queryComplianceAuditLogs,
} from './audit-logger.js'

// Data Subject Rights
export {
  exportCustomerUserData,
  exportUserData,
  deleteCustomerUserData,
  rectifyCustomerUserData,
  rectifyUserData,
} from './dsr.js'

// Consent Management
export {
  CONSENT_VERSIONS,
  recordConsent,
  checkConsent,
  getUserConsents,
  revokeAllConsents,
  isConsentRequired,
  getConsentStatus,
  validateConsentForProcessing,
} from './consent.js'
