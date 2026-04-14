/**
 * Notification API Integration Tests
 *
 * Tests notification CRUD operations with real database interactions.
 * Migrated from hta-calibration/tests/integration/api/notifications.test.ts
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
  createTestNotification,
} from './setup/fixtures'

describe('Notification API Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('Notification CRUD Operations', () => {
    it('should create a notification', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id)

      const notification = await createTestNotification(prisma, engineer.id, certificate.id, {
        type: 'CERTIFICATE_APPROVED',
        title: 'Certificate Approved',
        message: 'Your certificate has been approved.',
      })

      expect(notification).toBeDefined()
      expect(notification.id).toBeDefined()
      expect(notification.type).toBe('CERTIFICATE_APPROVED')
      expect(notification.read).toBe(false)
    })

    it('should retrieve notifications for a user', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id)

      await createTestNotification(prisma, engineer.id, certificate.id, {
        type: 'CERTIFICATE_APPROVED',
        title: 'Notification 1',
      })
      await createTestNotification(prisma, engineer.id, certificate.id, {
        type: 'REVISION_REQUESTED',
        title: 'Notification 2',
      })

      const notifications = await prisma.notification.findMany({
        where: { userId: engineer.id },
        orderBy: { createdAt: 'desc' },
      })

      expect(notifications).toHaveLength(2)
    })

    it('should mark notification as read', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)
      const notification = await createTestNotification(prisma, engineer.id, null)

      expect(notification.read).toBe(false)

      const updated = await prisma.notification.update({
        where: { id: notification.id },
        data: { read: true },
      })

      expect(updated.read).toBe(true)
    })

    it('should filter unread notifications', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)

      await createTestNotification(prisma, engineer.id, null, { read: false })
      await createTestNotification(prisma, engineer.id, null, { read: true })
      await createTestNotification(prisma, engineer.id, null, { read: false })

      const unreadNotifications = await prisma.notification.findMany({
        where: {
          userId: engineer.id,
          read: false,
        },
      })

      expect(unreadNotifications).toHaveLength(2)
    })

    it('should count unread notifications', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)

      await createTestNotification(prisma, engineer.id, null, { read: false })
      await createTestNotification(prisma, engineer.id, null, { read: false })
      await createTestNotification(prisma, engineer.id, null, { read: true })

      const unreadCount = await prisma.notification.count({
        where: {
          userId: engineer.id,
          read: false,
        },
      })

      expect(unreadCount).toBe(2)
    })

    it('should paginate notifications', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)

      // Create 5 notifications
      for (let i = 0; i < 5; i++) {
        await createTestNotification(prisma, engineer.id, null, {
          title: `Notification ${i + 1}`,
        })
        await new Promise((r) => setTimeout(r, 10)) // Ensure different timestamps
      }

      // Get first page (limit 2)
      const page1 = await prisma.notification.findMany({
        where: { userId: engineer.id },
        orderBy: { createdAt: 'desc' },
        take: 2,
        skip: 0,
      })

      // Get second page
      const page2 = await prisma.notification.findMany({
        where: { userId: engineer.id },
        orderBy: { createdAt: 'desc' },
        take: 2,
        skip: 2,
      })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
      expect(page1[0].id).not.toBe(page2[0].id)
    })
  })

  describe('Notification Associations', () => {
    it('should associate notification with certificate', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, engineer.id)

      const notification = await createTestNotification(prisma, engineer.id, certificate.id)

      const retrieved = await prisma.notification.findUnique({
        where: { id: notification.id },
        include: { certificate: true },
      })

      expect(retrieved?.certificate).toBeDefined()
      expect(retrieved?.certificate?.id).toBe(certificate.id)
    })

    it('should allow notification without certificate', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)

      const notification = await createTestNotification(prisma, engineer.id, null, {
        type: 'SYSTEM_ANNOUNCEMENT',
        title: 'System Update',
      })

      expect(notification.certificateId).toBeNull()
    })
  })

  describe('Notification Deletion', () => {
    it('should delete notification', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)
      const notification = await createTestNotification(prisma, engineer.id, null)

      await prisma.notification.delete({
        where: { id: notification.id },
      })

      const deleted = await prisma.notification.findUnique({
        where: { id: notification.id },
      })

      expect(deleted).toBeNull()
    })

    it('should delete all notifications for a user', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)
      await createTestNotification(prisma, engineer.id, null)
      await createTestNotification(prisma, engineer.id, null)

      // Delete all notifications for user
      await prisma.notification.deleteMany({ where: { userId: engineer.id } })

      const notifications = await prisma.notification.findMany({
        where: { userId: engineer.id },
      })

      expect(notifications).toHaveLength(0)
    })
  })

  describe('Bulk Notification Operations', () => {
    it('should mark all notifications as read', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)

      await createTestNotification(prisma, engineer.id, null, { read: false })
      await createTestNotification(prisma, engineer.id, null, { read: false })
      await createTestNotification(prisma, engineer.id, null, { read: false })

      await prisma.notification.updateMany({
        where: { userId: engineer.id, read: false },
        data: { read: true },
      })

      const unreadCount = await prisma.notification.count({
        where: { userId: engineer.id, read: false },
      })

      expect(unreadCount).toBe(0)
    })

    it('should delete old read notifications', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)

      // Create old read notification
      const oldNotification = await createTestNotification(prisma, engineer.id, null, {
        read: true,
      })

      // Manually backdate the notification
      await prisma.notification.update({
        where: { id: oldNotification.id },
        data: { createdAt: new Date('2023-01-01') },
      })

      // Create recent notification
      await createTestNotification(prisma, engineer.id, null, { read: true })

      // Delete notifications older than 1 year
      const oneYearAgo = new Date()
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

      await prisma.notification.deleteMany({
        where: {
          userId: engineer.id,
          read: true,
          createdAt: { lt: oneYearAgo },
        },
      })

      const remaining = await prisma.notification.findMany({
        where: { userId: engineer.id },
      })

      expect(remaining).toHaveLength(1)
    })
  })
})
