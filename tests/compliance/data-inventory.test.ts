/**
 * Data Processing Inventory Tests
 *
 * Tests for GDPR Article 30 compliance - Records of Processing Activities
 */

import { describe, it, expect } from 'vitest'
import {
  DataProcessingInventory,
  getActiveProcessingActivities,
  getProcessingActivitiesByService,
  getProcessingActivitiesByLegalBasis,
  getThirdPartyRecipients,
  getDataCategories,
} from '../../packages/shared/src/compliance/data-inventory.js'

describe('Data Processing Inventory', () => {
  describe('Structure', () => {
    it('should have all required fields for each activity', () => {
      const requiredFields = [
        'id',
        'purpose',
        'legalBasis',
        'dataCategories',
        'retention',
        'thirdParties',
        'services',
        'isActive',
      ]

      for (const [id, activity] of Object.entries(DataProcessingInventory)) {
        for (const field of requiredFields) {
          expect(activity).toHaveProperty(field)
          expect(activity[field as keyof typeof activity]).toBeDefined()
        }
        // ID should match the key
        expect(activity.id).toBe(id)
      }
    })

    it('should have non-empty data categories', () => {
      for (const activity of Object.values(DataProcessingInventory)) {
        expect(activity.dataCategories.length).toBeGreaterThan(0)
      }
    })

    it('should have valid services', () => {
      const validServices = ['web', 'api', 'worker']

      for (const activity of Object.values(DataProcessingInventory)) {
        for (const service of activity.services) {
          expect(validServices).toContain(service)
        }
      }
    })
  })

  describe('Certificate Processing', () => {
    it('should have 10-year retention for regulatory compliance', () => {
      const certActivity = DataProcessingInventory['certificate-processing']

      expect(certActivity).toBeDefined()
      expect(certActivity.retention).toContain('10 years')
      expect(certActivity.retention).toContain('ISO/IEC 17025')
    })

    it('should be contract-based legal basis', () => {
      const certActivity = DataProcessingInventory['certificate-processing']
      expect(certActivity.legalBasis).toBe('contract')
    })
  })

  describe('Audit Logging', () => {
    it('should be legal obligation based', () => {
      const auditActivity = DataProcessingInventory['audit-logging']

      expect(auditActivity).toBeDefined()
      expect(auditActivity.legalBasis).toBe('legal_obligation')
    })

    it('should span all services', () => {
      const auditActivity = DataProcessingInventory['audit-logging']

      expect(auditActivity.services).toContain('web')
      expect(auditActivity.services).toContain('api')
      expect(auditActivity.services).toContain('worker')
    })
  })

  describe('getActiveProcessingActivities', () => {
    it('should return only active activities', () => {
      const active = getActiveProcessingActivities()

      expect(active.length).toBeGreaterThan(0)
      for (const activity of active) {
        expect(activity.isActive).toBe(true)
      }
    })

    it('should include core activities', () => {
      const active = getActiveProcessingActivities()
      const ids = active.map(a => a.id)

      expect(ids).toContain('certificate-processing')
      expect(ids).toContain('customer-registration')
      expect(ids).toContain('audit-logging')
    })
  })

  describe('getProcessingActivitiesByService', () => {
    it('should filter by web service', () => {
      const webActivities = getProcessingActivitiesByService('web')

      expect(webActivities.length).toBeGreaterThan(0)
      for (const activity of webActivities) {
        expect(activity.services).toContain('web')
      }
    })

    it('should filter by worker service', () => {
      const workerActivities = getProcessingActivitiesByService('worker')

      expect(workerActivities.length).toBeGreaterThan(0)
      for (const activity of workerActivities) {
        expect(activity.services).toContain('worker')
      }

      // Email notifications should be in worker
      const ids = workerActivities.map(a => a.id)
      expect(ids).toContain('email-notifications')
    })
  })

  describe('getProcessingActivitiesByLegalBasis', () => {
    it('should filter by contract basis', () => {
      const contractActivities = getProcessingActivitiesByLegalBasis('contract')

      expect(contractActivities.length).toBeGreaterThan(0)
      for (const activity of contractActivities) {
        expect(activity.legalBasis).toBe('contract')
      }
    })

    it('should filter by legitimate interests', () => {
      const legitActivities = getProcessingActivitiesByLegalBasis('legitimate_interests')

      expect(legitActivities.length).toBeGreaterThan(0)
      const ids = legitActivities.map(a => a.id)
      expect(ids).toContain('authentication-logs')
    })
  })

  describe('getThirdPartyRecipients', () => {
    it('should return sorted unique list', () => {
      const thirdParties = getThirdPartyRecipients()

      expect(thirdParties.length).toBeGreaterThan(0)

      // Check sorted
      const sorted = [...thirdParties].sort()
      expect(thirdParties).toEqual(sorted)

      // Check unique
      const unique = new Set(thirdParties)
      expect(thirdParties.length).toBe(unique.size)
    })

    it('should include known third parties', () => {
      const thirdParties = getThirdPartyRecipients()

      expect(thirdParties).toContain('Resend')
      expect(thirdParties).toContain('Sentry')
    })
  })

  describe('getDataCategories', () => {
    it('should return sorted unique list', () => {
      const categories = getDataCategories()

      expect(categories.length).toBeGreaterThan(0)

      // Check sorted
      const sorted = [...categories].sort()
      expect(categories).toEqual(sorted)

      // Check unique
      const unique = new Set(categories)
      expect(categories.length).toBe(unique.size)
    })

    it('should include PII categories', () => {
      const categories = getDataCategories()

      expect(categories).toContain('email')
      expect(categories).toContain('name')
    })

    it('should include business data categories', () => {
      const categories = getDataCategories()

      expect(categories).toContain('calibration_readings')
      expect(categories).toContain('equipment_details')
    })
  })
})
