/**
 * Tenant Configuration Template
 *
 * This file contains all tenant-specific configuration.
 * Copy this entire app folder and customize the values below for your tenant.
 *
 * INSTRUCTIONS:
 * 1. Copy this app folder to apps/web-{your-tenant-slug}
 * 2. Update package.json name to "@hta/web-{your-tenant-slug}"
 * 3. Update values in this file with your tenant's configuration
 * 4. Update globals.css with your tenant's color scheme
 * 5. Add your logo to public/logo.png
 */

export const tenantConfig = {
  // Tenant identification - REQUIRED
  // The id should match your tenant ID in the database
  id: 'your-tenant-id',
  slug: 'your-tenant-slug',
  name: 'Your Company Name',

  // Branding - REQUIRED
  branding: {
    logoUrl: '/logo.png',
    logoAlt: 'Your Company Name',
    faviconUrl: '/favicon.ico',
    // Primary brand color - used for buttons, links, and accents
    primaryColor: '#1e40af',
    // Accent color - used for highlights and secondary elements
    accentColor: '#3b82f6',
  },

  // Metadata - REQUIRED
  metadata: {
    title: 'Your Calibration Management System',
    description: 'Calibration certificate management for Your Company',
  },

  // Contact - REQUIRED
  contact: {
    supportEmail: 'support@yourcompany.com',
    websiteUrl: 'https://yourcompany.com',
  },

  // Features - Configure which features are enabled for this tenant
  features: {
    // Enable customer portal for external access
    customerPortal: true,
    // Enable internal calibration requests
    internalRequests: true,
    // Allow multiple instruments per certificate
    multipleInstruments: true,
    // Enable email notifications
    emailNotifications: true,
    // Enable secure download tokens for certificates
    downloadTokens: true,
    // Enable dark mode toggle
    darkMode: true,
  },

  // Settings - Customize operational settings
  settings: {
    // Default turnaround time in days
    defaultTatDays: 5,
    // Maximum instruments allowed per certificate
    maxInstrumentsPerCertificate: 10,
    // Session timeout in seconds (default: 24 hours)
    sessionTimeout: 86400,
  },
} as const

export type TenantConfig = typeof tenantConfig
