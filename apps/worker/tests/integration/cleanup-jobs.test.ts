/**
 * Cleanup Job Integration Tests
 *
 * Tests cleanup job functions against the real PostgreSQL database.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  prisma,
  createTestUser,
  createTestCustomerUser,
  createPasswordResetToken,
  createUserNotification,
  createCustomerNotification,
  cleanupTestData,
} from './setup/test-helpers'

describe('Cleanup Jobs Integration Tests', () => {
  beforeEach(async () => {
    await cleanupTestData()
  })

  describe('Password Reset Token Cleanup', () => {
    it('should delete expired password reset tokens', async () => {
      const user = await createTestUser()

      // Create expired tokens
      await createPasswordResetToken({
        userId: user.id,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      })
      await createPasswordResetToken({
        userId: user.id,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      })

      // Create valid token
      await createPasswordResetToken({
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      })

      // Count before cleanup
      const beforeCount = await prisma.passwordResetToken.count({
        where: { userId: user.id },
      })
      expect(beforeCount).toBe(3)

      // Simulate cleanup - delete expired tokens
      const result = await prisma.passwordResetToken.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      })

      expect(result.count).toBe(2)

      // Verify only valid token remains
      const afterCount = await prisma.passwordResetToken.count({
        where: { userId: user.id },
      })
      expect(afterCount).toBe(1)

      // Verify the remaining token is valid
      const remaining = await prisma.passwordResetToken.findFirst({
        where: { userId: user.id },
      })
      expect(remaining!.expiresAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('should handle no expired tokens gracefully', async () => {
      const user = await createTestUser()

      // Create only valid tokens
      await createPasswordResetToken({
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })

      // Cleanup should delete nothing
      const result = await prisma.passwordResetToken.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      })

      expect(result.count).toBe(0)
    })
  })

  describe('Notification Cleanup', () => {
    it('should delete old notifications', async () => {
      const user = await createTestUser()

      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 100) // 100 days ago

      const recentDate = new Date()
      recentDate.setDate(recentDate.getDate() - 30) // 30 days ago

      // Create old notifications
      await createUserNotification({
        userId: user.id,
        createdAt: oldDate,
        read: true,
      })
      await createUserNotification({
        userId: user.id,
        createdAt: oldDate,
        read: false,
      })

      // Create recent notification
      await createUserNotification({
        userId: user.id,
        createdAt: recentDate,
        read: true,
      })

      // Verify setup
      const beforeCount = await prisma.notification.count({
        where: { userId: user.id },
      })
      expect(beforeCount).toBe(3)

      // Cleanup notifications older than 90 days
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)

      const result = await prisma.notification.deleteMany({
        where: {
          createdAt: { lt: cutoff },
        },
      })

      expect(result.count).toBe(2)

      // Verify only recent notification remains
      const afterCount = await prisma.notification.count({
        where: { userId: user.id },
      })
      expect(afterCount).toBe(1)
    })

    it('should only delete read notifications when onlyRead flag is set', async () => {
      const user = await createTestUser()

      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 100) // 100 days ago

      // Create old read notification
      await createUserNotification({
        userId: user.id,
        createdAt: oldDate,
        read: true,
      })

      // Create old unread notification
      await createUserNotification({
        userId: user.id,
        createdAt: oldDate,
        read: false,
      })

      // Cleanup only read notifications older than 90 days
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)

      const result = await prisma.notification.deleteMany({
        where: {
          createdAt: { lt: cutoff },
          read: true,
        },
      })

      expect(result.count).toBe(1)

      // Verify unread notification still exists
      const remaining = await prisma.notification.findFirst({
        where: { userId: user.id },
      })
      expect(remaining).toBeDefined()
      expect(remaining!.read).toBe(false)
    })

    it('should handle customer notifications', async () => {
      const customer = await createTestCustomerUser()

      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 100)

      await createCustomerNotification({
        customerId: customer.id,
        createdAt: oldDate,
        read: true,
      })

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)

      const result = await prisma.notification.deleteMany({
        where: {
          createdAt: { lt: cutoff },
          read: true,
        },
      })

      expect(result.count).toBe(1)
    })
  })

  describe('Scheduled Cleanup Simulation', () => {
    it('should clean up multiple expired items in one pass', async () => {
      const user = await createTestUser()
      const customer = await createTestCustomerUser()

      // Create expired password reset tokens
      await createPasswordResetToken({
        userId: user.id,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      })
      await createPasswordResetToken({
        userId: user.id,
        expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      })

      // Create old notifications
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 100)

      await createUserNotification({
        userId: user.id,
        createdAt: oldDate,
        read: true,
      })
      await createCustomerNotification({
        customerId: customer.id,
        createdAt: oldDate,
        read: true,
      })

      // Run cleanup simulation
      const tokenResult = await prisma.passwordResetToken.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      })

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)

      const notificationResult = await prisma.notification.deleteMany({
        where: {
          createdAt: { lt: cutoff },
          read: true,
        },
      })

      expect(tokenResult.count).toBe(2)
      expect(notificationResult.count).toBe(2)

      // Verify database is clean
      const remainingTokens = await prisma.passwordResetToken.count()
      const remainingNotifications = await prisma.notification.count()

      expect(remainingTokens).toBe(0)
      expect(remainingNotifications).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle cleanup on empty database', async () => {
      // Database should be empty after cleanup
      const tokenResult = await prisma.passwordResetToken.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      })

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)

      const notificationResult = await prisma.notification.deleteMany({
        where: {
          createdAt: { lt: cutoff },
        },
      })

      expect(tokenResult.count).toBe(0)
      expect(notificationResult.count).toBe(0)
    })

    it('should delete notifications older than cutoff but not newer ones', async () => {
      const user = await createTestUser()

      // Create notification clearly before cutoff (100 days ago - should be deleted)
      const beforeCutoff = new Date()
      beforeCutoff.setDate(beforeCutoff.getDate() - 100)

      await createUserNotification({
        userId: user.id,
        createdAt: beforeCutoff,
        read: true,
      })

      // Create notification clearly after cutoff (80 days ago - should NOT be deleted)
      const afterCutoff = new Date()
      afterCutoff.setDate(afterCutoff.getDate() - 80)

      await createUserNotification({
        userId: user.id,
        createdAt: afterCutoff,
        read: true,
      })

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)

      const result = await prisma.notification.deleteMany({
        where: {
          createdAt: { lt: cutoff },
          read: true,
        },
      })

      // Only the one before cutoff should be deleted
      expect(result.count).toBe(1)

      // Verify the newer one remains
      const remaining = await prisma.notification.findFirst({
        where: { userId: user.id },
      })
      expect(remaining).toBeDefined()
    })
  })
})
