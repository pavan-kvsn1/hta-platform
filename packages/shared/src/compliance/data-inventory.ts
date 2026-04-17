/**
 * Data Processing Inventory
 *
 * GDPR Article 30 - Records of Processing Activities
 * Documents all personal data processing activities across the platform.
 */

import type { DataProcessingActivity } from './types.js'

export const DataProcessingInventory: Record<string, DataProcessingActivity> = {
  'customer-registration': {
    id: 'customer-registration',
    purpose: 'Account creation and service delivery',
    legalBasis: 'contract',
    dataCategories: ['email', 'name', 'company_name', 'phone'],
    retention: '7 years after last activity',
    thirdParties: ['Resend (email delivery)'],
    services: ['web', 'api'],
    isActive: true,
  },

  'user-account': {
    id: 'user-account',
    purpose: 'Employee account management and authentication',
    legalBasis: 'contract',
    dataCategories: ['email', 'name', 'role', 'signature_image'],
    retention: '7 years after employment ends',
    thirdParties: [],
    services: ['web', 'api'],
    isActive: true,
  },

  'certificate-processing': {
    id: 'certificate-processing',
    purpose: 'Calibration certificate creation and management',
    legalBasis: 'contract',
    dataCategories: ['equipment_details', 'calibration_readings', 'signatures', 'customer_contact'],
    retention: '10 years (ISO/IEC 17025 regulatory requirement)',
    thirdParties: [],
    services: ['api', 'worker'],
    isActive: true,
  },

  'email-notifications': {
    id: 'email-notifications',
    purpose: 'Service communications and certificate delivery',
    legalBasis: 'contract',
    dataCategories: ['email', 'name', 'certificate_attachments'],
    retention: 'Email logs: 90 days',
    thirdParties: ['Resend'],
    services: ['worker'],
    isActive: true,
  },

  'authentication-logs': {
    id: 'authentication-logs',
    purpose: 'Security monitoring and incident investigation',
    legalBasis: 'legitimate_interests',
    dataCategories: ['email', 'ip_address', 'user_agent', 'login_timestamps'],
    retention: '2 years',
    thirdParties: [],
    services: ['api'],
    isActive: true,
  },

  'audit-logging': {
    id: 'audit-logging',
    purpose: 'Compliance and security audit trail',
    legalBasis: 'legal_obligation',
    dataCategories: ['user_actions', 'timestamps', 'resource_changes'],
    retention: '7 years (regulatory compliance)',
    thirdParties: ['Google Cloud Logging'],
    services: ['web', 'api', 'worker'],
    isActive: true,
  },

  'error-tracking': {
    id: 'error-tracking',
    purpose: 'Application monitoring and bug resolution',
    legalBasis: 'legitimate_interests',
    dataCategories: ['user_id', 'session_data', 'stack_traces'],
    retention: '90 days',
    thirdParties: ['Sentry'],
    services: ['web', 'api', 'worker'],
    isActive: true,
  },

  'file-storage': {
    id: 'file-storage',
    purpose: 'Certificate attachments and images',
    legalBasis: 'contract',
    dataCategories: ['equipment_images', 'calibration_certificates', 'signatures'],
    retention: '10 years (same as certificates)',
    thirdParties: ['Google Cloud Storage'],
    services: ['api', 'worker'],
    isActive: true,
  },
}

/**
 * Get all active data processing activities
 */
export function getActiveProcessingActivities(): DataProcessingActivity[] {
  return Object.values(DataProcessingInventory).filter(activity => activity.isActive)
}

/**
 * Get processing activities for a specific service
 */
export function getProcessingActivitiesByService(
  service: 'web' | 'api' | 'worker'
): DataProcessingActivity[] {
  return Object.values(DataProcessingInventory).filter(
    activity => activity.isActive && activity.services.includes(service)
  )
}

/**
 * Get processing activities by legal basis
 */
export function getProcessingActivitiesByLegalBasis(
  legalBasis: DataProcessingActivity['legalBasis']
): DataProcessingActivity[] {
  return Object.values(DataProcessingInventory).filter(
    activity => activity.isActive && activity.legalBasis === legalBasis
  )
}

/**
 * Get all third parties that receive data
 */
export function getThirdPartyRecipients(): string[] {
  const thirdParties = new Set<string>()
  for (const activity of Object.values(DataProcessingInventory)) {
    if (activity.isActive) {
      activity.thirdParties.forEach(tp => thirdParties.add(tp))
    }
  }
  return Array.from(thirdParties).sort()
}

/**
 * Get data categories processed
 */
export function getDataCategories(): string[] {
  const categories = new Set<string>()
  for (const activity of Object.values(DataProcessingInventory)) {
    if (activity.isActive) {
      activity.dataCategories.forEach(cat => categories.add(cat))
    }
  }
  return Array.from(categories).sort()
}
