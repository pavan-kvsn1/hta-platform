/**
 * Data Processing Inventory Unit Tests
 *
 * Tests for GDPR Article 30 - Records of Processing Activities
 */

import { describe, it, expect } from 'vitest'
import {
  DataProcessingInventory,
  getActiveProcessingActivities,
  getProcessingActivitiesByService,
  getProcessingActivitiesByLegalBasis,
  getThirdPartyRecipients,
  getDataCategories,
} from '../src/compliance/data-inventory'

describe('DataProcessingInventory', () => {
  it('has all expected processing activities', () => {
    const expectedIds = [
      'customer-registration',
      'user-account',
      'certificate-processing',
      'email-notifications',
      'authentication-logs',
      'audit-logging',
      'error-tracking',
      'file-storage',
    ]
    for (const id of expectedIds) {
      expect(DataProcessingInventory).toHaveProperty(id)
    }
  })

  it('each activity has all required fields', () => {
    for (const [id, activity] of Object.entries(DataProcessingInventory)) {
      expect(activity.id).toBe(id)
      expect(activity.purpose).toBeTruthy()
      expect(activity.legalBasis).toBeTruthy()
      expect(Array.isArray(activity.dataCategories)).toBe(true)
      expect(activity.dataCategories.length).toBeGreaterThan(0)
      expect(activity.retention).toBeTruthy()
      expect(Array.isArray(activity.thirdParties)).toBe(true)
      expect(Array.isArray(activity.services)).toBe(true)
      expect(activity.services.length).toBeGreaterThan(0)
      expect(typeof activity.isActive).toBe('boolean')
    }
  })

  it('all activities are currently active', () => {
    for (const activity of Object.values(DataProcessingInventory)) {
      expect(activity.isActive).toBe(true)
    }
  })
})

describe('getActiveProcessingActivities', () => {
  it('returns all active activities', () => {
    const activities = getActiveProcessingActivities()
    expect(activities.length).toBe(Object.keys(DataProcessingInventory).length)
  })

  it('each returned activity is active', () => {
    const activities = getActiveProcessingActivities()
    for (const activity of activities) {
      expect(activity.isActive).toBe(true)
    }
  })
})

describe('getProcessingActivitiesByService', () => {
  it('returns activities for the api service', () => {
    const activities = getProcessingActivitiesByService('api')
    expect(activities.length).toBeGreaterThan(0)
    for (const activity of activities) {
      expect(activity.services).toContain('api')
    }
  })

  it('returns activities for the web service', () => {
    const activities = getProcessingActivitiesByService('web')
    expect(activities.length).toBeGreaterThan(0)
    for (const activity of activities) {
      expect(activity.services).toContain('web')
    }
  })

  it('returns activities for the worker service', () => {
    const activities = getProcessingActivitiesByService('worker')
    expect(activities.length).toBeGreaterThan(0)
    for (const activity of activities) {
      expect(activity.services).toContain('worker')
    }
  })
})

describe('getProcessingActivitiesByLegalBasis', () => {
  it('returns contract-based activities', () => {
    const activities = getProcessingActivitiesByLegalBasis('contract')
    expect(activities.length).toBeGreaterThan(0)
    for (const activity of activities) {
      expect(activity.legalBasis).toBe('contract')
    }
  })

  it('returns legitimate_interests activities', () => {
    const activities = getProcessingActivitiesByLegalBasis('legitimate_interests')
    expect(activities.length).toBeGreaterThan(0)
    for (const activity of activities) {
      expect(activity.legalBasis).toBe('legitimate_interests')
    }
  })

  it('returns legal_obligation activities', () => {
    const activities = getProcessingActivitiesByLegalBasis('legal_obligation')
    expect(activities.length).toBeGreaterThan(0)
  })

  it('returns empty for unused legal basis', () => {
    const activities = getProcessingActivitiesByLegalBasis('vital_interests')
    expect(activities).toHaveLength(0)
  })
})

describe('getThirdPartyRecipients', () => {
  it('returns sorted list of unique third parties', () => {
    const parties = getThirdPartyRecipients()
    expect(parties.length).toBeGreaterThan(0)
    // Check sorted
    const sorted = [...parties].sort()
    expect(parties).toEqual(sorted)
  })

  it('includes known third parties', () => {
    const parties = getThirdPartyRecipients()
    expect(parties).toContain('Sentry')
    expect(parties).toContain('Google Cloud Logging')
    expect(parties).toContain('Google Cloud Storage')
  })

  it('has no duplicates', () => {
    const parties = getThirdPartyRecipients()
    const unique = [...new Set(parties)]
    expect(parties).toEqual(unique)
  })
})

describe('getDataCategories', () => {
  it('returns sorted list of unique data categories', () => {
    const categories = getDataCategories()
    expect(categories.length).toBeGreaterThan(0)
    const sorted = [...categories].sort()
    expect(categories).toEqual(sorted)
  })

  it('includes common data categories', () => {
    const categories = getDataCategories()
    expect(categories).toContain('email')
    expect(categories).toContain('name')
  })

  it('has no duplicates', () => {
    const categories = getDataCategories()
    const unique = [...new Set(categories)]
    expect(categories).toEqual(unique)
  })
})
