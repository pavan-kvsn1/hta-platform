/**
 * HTA Tenant Configuration
 *
 * This file contains all tenant-specific configuration.
 * For a new tenant, copy this file and customize the values.
 */

export const tenantConfig = {
  // Tenant identification
  id: 'hta',
  slug: 'hta',
  name: 'HTA Instrumentation',

  // Branding
  branding: {
    logoUrl: '/logo.png',
    logoAlt: 'HTA Instrumentation',
    faviconUrl: '/favicon.ico',
    primaryColor: '#00687a',
    accentColor: '#0ea5e9',
  },

  // Metadata
  metadata: {
    title: 'HTA Calibration Management System',
    description: 'Calibration certificate management for HTA Instrumentation',
  },

  // Contact
  contact: {
    supportEmail: 'support@htainstrumentation.com',
    websiteUrl: 'https://htainstrumentation.com',
  },

  // Features (enable/disable for this tenant)
  features: {
    customerPortal: true,
    internalRequests: true,
    multipleInstruments: true,
    emailNotifications: true,
    downloadTokens: true,
    darkMode: true,
  },

  // Settings
  settings: {
    defaultTatDays: 5,
    maxInstrumentsPerCertificate: 10,
    sessionTimeout: 86400, // 24 hours
  },
} as const

export type TenantConfig = typeof tenantConfig
