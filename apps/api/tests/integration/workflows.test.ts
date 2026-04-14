/**
 * Workflow Integration Tests
 *
 * Tests certificate workflow transitions with real database interactions.
 * Migrated from hta-calibration/tests/integration/api/workflows.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanTestDatabase,
  prisma,
} from './setup/test-db'
import {
  createEngineerWithAdmin,
  createTestCertificate,
  createCustomerAccount,
  createCustomerUser,
  createTestNotification,
} from './setup/fixtures'

// Valid status transitions as per business rules
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_REVIEW'],
  PENDING_REVIEW: ['REVISION_REQUIRED', 'PENDING_CUSTOMER_APPROVAL', 'PENDING_ADMIN_AUTHORIZATION'],
  REVISION_REQUIRED: ['PENDING_REVIEW'],
  PENDING_CUSTOMER_APPROVAL: ['CUSTOMER_REVISION_REQUIRED', 'APPROVED', 'PENDING_ADMIN_AUTHORIZATION'],
  CUSTOMER_REVISION_REQUIRED: ['PENDING_CUSTOMER_APPROVAL'],
  PENDING_ADMIN_AUTHORIZATION: ['AUTHORIZED', 'REVISION_REQUIRED'],
  AUTHORIZED: ['APPROVED'],
  APPROVED: [], // Terminal state
  REJECTED: [], // Terminal state
}

describe('Workflow Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('Status Transitions', () => {
    it('should transition from DRAFT to PENDING_REVIEW', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id, {
        status: 'DRAFT',
      })

      const updated = await prisma.certificate.update({
        where: { id: certificate.id },
        data: { status: 'PENDING_REVIEW' },
      })

      expect(updated.status).toBe('PENDING_REVIEW')
    })

    it('should record status change events', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id, {
        status: 'DRAFT',
      })

      // Create event for status change
      await prisma.certificateEvent.create({
        data: {
          certificateId: certificate.id,
          sequenceNumber: 1,
          revision: 1,
          eventType: 'STATUS_CHANGED',
          eventData: JSON.stringify({
            from: 'DRAFT',
            to: 'PENDING_REVIEW',
          }),
          userId: engineer.id,
          userRole: 'ENGINEER',
        },
      })

      // Update status
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: { status: 'PENDING_REVIEW' },
      })

      const events = await prisma.certificateEvent.findMany({
        where: { certificateId: certificate.id },
      })

      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('STATUS_CHANGED')
    })

    it('should track revision numbers on status changes', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id, {
        status: 'DRAFT',
      })

      // Submit for review
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: { status: 'PENDING_REVIEW' },
      })

      // Reviewer requests revision
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: {
          status: 'REVISION_REQUIRED',
          currentRevision: 2,
        },
      })

      const updated = await prisma.certificate.findUnique({
        where: { id: certificate.id },
      })

      expect(updated?.currentRevision).toBe(2)
    })
  })

  describe('Certificate Events', () => {
    it('should maintain event sequence order', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id)

      // Create multiple events
      await prisma.certificateEvent.createMany({
        data: [
          {
            certificateId: certificate.id,
            sequenceNumber: 1,
            revision: 1,
            eventType: 'CERTIFICATE_CREATED',
            eventData: '{}',
            userId: engineer.id,
            userRole: 'ENGINEER',
          },
          {
            certificateId: certificate.id,
            sequenceNumber: 2,
            revision: 1,
            eventType: 'FIELD_UPDATED',
            eventData: JSON.stringify({ field: 'customerName' }),
            userId: engineer.id,
            userRole: 'ENGINEER',
          },
          {
            certificateId: certificate.id,
            sequenceNumber: 3,
            revision: 1,
            eventType: 'SUBMITTED_FOR_REVIEW',
            eventData: '{}',
            userId: engineer.id,
            userRole: 'ENGINEER',
          },
        ],
      })

      const events = await prisma.certificateEvent.findMany({
        where: { certificateId: certificate.id },
        orderBy: { sequenceNumber: 'asc' },
      })

      expect(events).toHaveLength(3)
      expect(events[0].eventType).toBe('CERTIFICATE_CREATED')
      expect(events[1].eventType).toBe('FIELD_UPDATED')
      expect(events[2].eventType).toBe('SUBMITTED_FOR_REVIEW')
    })

    it('should enforce unique sequence numbers per certificate', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id)

      await prisma.certificateEvent.create({
        data: {
          certificateId: certificate.id,
          sequenceNumber: 1,
          revision: 1,
          eventType: 'CERTIFICATE_CREATED',
          eventData: '{}',
          userId: engineer.id,
          userRole: 'ENGINEER',
        },
      })

      // Attempt to create duplicate sequence number
      await expect(
        prisma.certificateEvent.create({
          data: {
            certificateId: certificate.id,
            sequenceNumber: 1, // Duplicate
            revision: 1,
            eventType: 'FIELD_UPDATED',
            eventData: '{}',
            userId: engineer.id,
            userRole: 'ENGINEER',
          },
        })
      ).rejects.toThrow()
    })
  })

  describe('Certificate Revisions', () => {
    it('should create revision snapshot', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id, {
        customerName: 'Original Customer',
      })

      // Create revision snapshot
      await prisma.certificateRevision.create({
        data: {
          certificateId: certificate.id,
          revisionNumber: 1,
          snapshotData: JSON.stringify({
            customerName: 'Original Customer',
            status: 'PENDING_REVIEW',
          }),
          status: 'PENDING_REVIEW',
          submittedById: engineer.id,
          submittedAt: new Date(),
          fromEventSeq: 1,
          toEventSeq: 5,
        },
      })

      const revision = await prisma.certificateRevision.findFirst({
        where: { certificateId: certificate.id },
      })

      expect(revision).toBeDefined()
      expect(revision?.revisionNumber).toBe(1)

      const snapshotData = JSON.parse(revision?.snapshotData || '{}')
      expect(snapshotData.customerName).toBe('Original Customer')
    })

    it('should track multiple revisions', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id)

      // Create two revisions
      await prisma.certificateRevision.createMany({
        data: [
          {
            certificateId: certificate.id,
            revisionNumber: 1,
            snapshotData: '{"version": 1}',
            status: 'PENDING_REVIEW',
            submittedById: engineer.id,
            fromEventSeq: 1,
            toEventSeq: 3,
          },
          {
            certificateId: certificate.id,
            revisionNumber: 2,
            snapshotData: '{"version": 2}',
            status: 'PENDING_REVIEW',
            submittedById: engineer.id,
            fromEventSeq: 4,
            toEventSeq: 7,
          },
        ],
      })

      const revisions = await prisma.certificateRevision.findMany({
        where: { certificateId: certificate.id },
        orderBy: { revisionNumber: 'asc' },
      })

      expect(revisions).toHaveLength(2)
      expect(revisions[0].revisionNumber).toBe(1)
      expect(revisions[1].revisionNumber).toBe(2)
    })
  })

  describe('Review Feedback', () => {
    it('should add reviewer feedback to certificate', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id, {
        status: 'PENDING_REVIEW',
      })

      await prisma.reviewFeedback.create({
        data: {
          certificateId: certificate.id,
          revisionNumber: 1,
          feedbackType: 'REVISION_REQUEST',
          targetField: 'customerName',
          comment: 'Please verify the customer name spelling',
          userId: admin.id,
        },
      })

      const feedback = await prisma.reviewFeedback.findMany({
        where: { certificateId: certificate.id },
      })

      expect(feedback).toHaveLength(1)
      expect(feedback[0].comment).toContain('customer name')
    })

    it('should track resolved feedback', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id)

      const feedback = await prisma.reviewFeedback.create({
        data: {
          certificateId: certificate.id,
          revisionNumber: 1,
          feedbackType: 'COMMENT',
          comment: 'Initial feedback',
          userId: admin.id,
        },
      })

      // Resolve the feedback
      await prisma.reviewFeedback.update({
        where: { id: feedback.id },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedById: engineer.id,
        },
      })

      const resolved = await prisma.reviewFeedback.findUnique({
        where: { id: feedback.id },
      })

      expect(resolved?.isResolved).toBe(true)
      expect(resolved?.resolvedById).toBe(engineer.id)
    })
  })

  describe('Workflow Notifications', () => {
    it('should create notification on status change', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id)

      await createTestNotification(prisma, admin.id, certificate.id, {
        type: 'SUBMITTED_FOR_REVIEW',
        title: 'New Certificate for Review',
        message: `Certificate ${certificate.certificateNumber} submitted for review`,
      })

      const notifications = await prisma.notification.findMany({
        where: { userId: admin.id },
      })

      expect(notifications).toHaveLength(1)
      expect(notifications[0].type).toBe('SUBMITTED_FOR_REVIEW')
    })

    it('should mark notifications as read', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id)

      const notification = await createTestNotification(prisma, admin.id, certificate.id)

      // Mark as read
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          read: true,
          readAt: new Date(),
        },
      })

      const updated = await prisma.notification.findUnique({
        where: { id: notification.id },
      })

      expect(updated?.read).toBe(true)
      expect(updated?.readAt).toBeDefined()
    })

    it('should count unread notifications', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id)

      await createTestNotification(prisma, admin.id, certificate.id, { read: false })
      await createTestNotification(prisma, admin.id, certificate.id, { read: false })
      await createTestNotification(prisma, admin.id, certificate.id, { read: true })

      const unreadCount = await prisma.notification.count({
        where: {
          userId: admin.id,
          read: false,
        },
      })

      expect(unreadCount).toBe(2)
    })
  })

  describe('Customer Workflow', () => {
    it('should create approval token for customer', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const account = await createCustomerAccount(prisma, { assignedAdminId: admin.id })
      const customer = await createCustomerUser(prisma, account.id)
      const certificate = await createTestCertificate(prisma, engineer.id)

      const token = await prisma.approvalToken.create({
        data: {
          certificateId: certificate.id,
          customerId: customer.id,
          token: 'unique-approval-token-123',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      })

      expect(token).toBeDefined()
      expect(token.token).toBe('unique-approval-token-123')
    })

    it('should track token usage', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const account = await createCustomerAccount(prisma)
      const customer = await createCustomerUser(prisma, account.id)
      const certificate = await createTestCertificate(prisma, engineer.id)

      const token = await prisma.approvalToken.create({
        data: {
          certificateId: certificate.id,
          customerId: customer.id,
          token: 'usage-tracking-token',
          expiresAt: new Date(Date.now() + 86400000),
        },
      })

      // Mark as used
      await prisma.approvalToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      })

      const used = await prisma.approvalToken.findUnique({
        where: { id: token.id },
      })

      expect(used?.usedAt).toBeDefined()
    })

    it('should find valid unexpired tokens', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const account = await createCustomerAccount(prisma)
      const customer = await createCustomerUser(prisma, account.id)
      const certificate = await createTestCertificate(prisma, engineer.id)

      // Create valid token
      await prisma.approvalToken.create({
        data: {
          certificateId: certificate.id,
          customerId: customer.id,
          token: 'valid-token',
          expiresAt: new Date(Date.now() + 86400000), // Tomorrow
        },
      })

      // Create expired token
      await prisma.approvalToken.create({
        data: {
          certificateId: certificate.id,
          customerId: customer.id,
          token: 'expired-token',
          expiresAt: new Date(Date.now() - 86400000), // Yesterday
        },
      })

      const validTokens = await prisma.approvalToken.findMany({
        where: {
          customerId: customer.id,
          expiresAt: { gt: new Date() },
          usedAt: null,
        },
      })

      expect(validTokens).toHaveLength(1)
      expect(validTokens[0].token).toBe('valid-token')
    })
  })
})
