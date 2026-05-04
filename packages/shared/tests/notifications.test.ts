/**
 * Notifications Service Unit Tests
 *
 * Tests for:
 * - createNotification() — correct type, userId, tenantId; stores metadata JSON
 * - getNotifications() — paginated list; filters by read/unread
 * - markNotificationsAsRead() — marks specified IDs; ignores already-read
 * - notifyReviewerOnSubmit() — creates notification for assigned reviewer
 * - notifyAssigneeOnReview() — creates notification for engineer with review outcome
 * - notifyOnSentToCustomer() — creates notification for customer with approval link
 * - notifyOnCustomerApproval() — notifies reviewer + engineer when customer approves
 * - notifyAdminsOnRegistration() — fan-out: creates notification for every admin
 * - notifyOnChatMessage() — creates notification for message recipient
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted so mocks are available in the hoisted vi.mock factory
const { mockPrismaNotification, mockPrismaUser } = vi.hoisted(() => ({
  mockPrismaNotification: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  },
  mockPrismaUser: {
    findMany: vi.fn(),
  },
}))

vi.mock('@hta/database', () => {
  return {
    prisma: {
      notification: mockPrismaNotification,
      user: mockPrismaUser,
    },
    Prisma: {
      DbNull: Symbol('DbNull'),
    },
  }
})

import {
  createNotification,
  getNotifications,
  markNotificationsAsRead,
  notifyReviewerOnSubmit,
  notifyAssigneeOnReview,
  notifyOnSentToCustomer,
  notifyOnCustomerApproval,
  notifyAdminsOnRegistration,
  notifyOnChatMessage,
  notifyReviewerOnAssigneeResponse,
  notifyReviewerOnCustomerRevision,
  notifyCustomerOnReviewerReply,
  notifyCustomerOnRegistrationApproved,
  getUnreadCount,
} from '../src/notifications'

describe('Notifications Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createNotification', () => {
    it('creates a notification with userId and correct type', async () => {
      const mockNotification = {
        id: 'notif-1',
        userId: 'user-1',
        customerId: null,
        type: 'CERTIFICATE_APPROVED',
        title: 'Certificate Approved',
        message: 'Your certificate CERT-001 has been approved',
        certificateId: 'cert-1',
        data: { certificateNumber: 'CERT-001' },
      }
      mockPrismaNotification.create.mockResolvedValue(mockNotification)

      const result = await createNotification({
        userId: 'user-1',
        type: 'CERTIFICATE_APPROVED',
        certificateId: 'cert-1',
        data: { certificateNumber: 'CERT-001' },
      })

      expect(result).toEqual(mockNotification)
      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'CERTIFICATE_APPROVED',
          title: 'Certificate Approved',
          certificateId: 'cert-1',
          data: { certificateNumber: 'CERT-001' },
        }),
      })
    })

    it('creates a notification with customerId', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-2' })

      await createNotification({
        customerId: 'cust-1',
        type: 'CERTIFICATE_READY',
        certificateId: 'cert-1',
        data: { certificateNumber: 'CERT-002' },
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerId: 'cust-1',
          type: 'CERTIFICATE_READY',
        }),
      })
    })

    it('stores metadata as Prisma.DbNull when data is empty', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-3' })

      await createNotification({
        userId: 'user-1',
        type: 'PASSWORD_CHANGED',
      })

      const callArg = mockPrismaNotification.create.mock.calls[0][0]
      // Empty data should result in Prisma.DbNull
      expect(typeof callArg.data.data).toBe('symbol')
    })

    it('stores metadata as JSON when data has keys', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-4' })

      await createNotification({
        userId: 'user-1',
        type: 'SUBMITTED_FOR_REVIEW',
        data: { certificateNumber: 'CERT-003', assigneeName: 'John' },
      })

      const callArg = mockPrismaNotification.create.mock.calls[0][0]
      expect(callArg.data.data).toEqual({
        certificateNumber: 'CERT-003',
        assigneeName: 'John',
      })
    })

    it('throws if neither userId nor customerId is provided', async () => {
      await expect(
        createNotification({
          type: 'PASSWORD_CHANGED',
        })
      ).rejects.toThrow('Either userId or customerId must be provided')
    })

    it('uses template title and message when not overridden', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-5' })

      await createNotification({
        userId: 'user-1',
        type: 'REVISION_REQUESTED',
        data: { certificateNumber: 'CERT-004', reviewerName: 'Jane' },
      })

      const callArg = mockPrismaNotification.create.mock.calls[0][0]
      expect(callArg.data.title).toBe('Revision Requested')
      expect(callArg.data.message).toBe('Jane requested revision on CERT-004')
    })

    it('allows overriding title and message', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-6' })

      await createNotification({
        userId: 'user-1',
        type: 'CERTIFICATE_APPROVED',
        title: 'Custom Title',
        message: 'Custom message body',
        data: { certificateNumber: 'CERT-005' },
      })

      const callArg = mockPrismaNotification.create.mock.calls[0][0]
      expect(callArg.data.title).toBe('Custom Title')
      expect(callArg.data.message).toBe('Custom message body')
    })

    it('template handles missing data fields gracefully', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-7' })

      await createNotification({
        userId: 'user-1',
        type: 'REVISION_REQUESTED',
        data: { certificateNumber: 'CERT-006' },
      })

      const callArg = mockPrismaNotification.create.mock.calls[0][0]
      expect(callArg.data.message).toBe('Reviewer requested revision on CERT-006')
    })
  })

  describe('getNotifications', () => {
    it('returns paginated notifications with total and unread count', async () => {
      const mockNotifications = [
        { id: 'n-1', type: 'CERTIFICATE_APPROVED', read: false },
        { id: 'n-2', type: 'REVISION_REQUESTED', read: true },
      ]
      mockPrismaNotification.findMany.mockResolvedValue(mockNotifications)
      mockPrismaNotification.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(5)  // unreadCount

      const result = await getNotifications({
        userId: 'user-1',
        limit: 10,
        offset: 0,
      })

      expect(result.notifications).toEqual(mockNotifications)
      expect(result.total).toBe(10)
      expect(result.unreadCount).toBe(5)
    })

    it('applies unreadOnly filter', async () => {
      mockPrismaNotification.findMany.mockResolvedValue([])
      mockPrismaNotification.count.mockResolvedValue(0)

      await getNotifications({
        userId: 'user-1',
        unreadOnly: true,
      })

      const findManyCall = mockPrismaNotification.findMany.mock.calls[0][0]
      expect(findManyCall.where).toHaveProperty('read', false)
    })

    it('applies pagination (skip/take)', async () => {
      mockPrismaNotification.findMany.mockResolvedValue([])
      mockPrismaNotification.count.mockResolvedValue(0)

      await getNotifications({
        userId: 'user-1',
        limit: 5,
        offset: 10,
      })

      const findManyCall = mockPrismaNotification.findMany.mock.calls[0][0]
      expect(findManyCall.skip).toBe(10)
      expect(findManyCall.take).toBe(5)
    })

    it('throws if neither userId nor customerId provided', async () => {
      await expect(
        getNotifications({})
      ).rejects.toThrow('Either userId or customerId must be provided')
    })

    it('supports customerId filtering', async () => {
      mockPrismaNotification.findMany.mockResolvedValue([])
      mockPrismaNotification.count.mockResolvedValue(0)

      await getNotifications({
        customerId: 'cust-1',
      })

      const findManyCall = mockPrismaNotification.findMany.mock.calls[0][0]
      expect(findManyCall.where).toHaveProperty('customerId', 'cust-1')
    })

    it('uses filterByInvolvement with userId', async () => {
      mockPrismaNotification.findMany.mockResolvedValue([])
      mockPrismaNotification.count.mockResolvedValue(0)

      await getNotifications({
        userId: 'user-1',
        filterByInvolvement: true,
      })

      const findManyCall = mockPrismaNotification.findMany.mock.calls[0][0]
      expect(findManyCall.where).toHaveProperty('OR')
    })

    it('uses default limit and offset', async () => {
      mockPrismaNotification.findMany.mockResolvedValue([])
      mockPrismaNotification.count.mockResolvedValue(0)

      await getNotifications({ userId: 'user-1' })

      const findManyCall = mockPrismaNotification.findMany.mock.calls[0][0]
      expect(findManyCall.skip).toBe(0)
      expect(findManyCall.take).toBe(10)
    })
  })

  describe('getUnreadCount', () => {
    it('returns unread count for userId', async () => {
      mockPrismaNotification.count.mockResolvedValue(7)

      const result = await getUnreadCount({ userId: 'user-1' })

      expect(result).toBe(7)
      expect(mockPrismaNotification.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 'user-1',
          read: false,
        }),
      })
    })

    it('throws if neither userId nor customerId is provided', async () => {
      await expect(
        getUnreadCount({})
      ).rejects.toThrow('Either userId or customerId must be provided')
    })

    it('supports filterByInvolvement', async () => {
      mockPrismaNotification.count.mockResolvedValue(3)

      await getUnreadCount({ userId: 'user-1', filterByInvolvement: true })

      const countCall = mockPrismaNotification.count.mock.calls[0][0]
      expect(countCall.where).toHaveProperty('OR')
    })
  })

  describe('markNotificationsAsRead', () => {
    it('marks specified notification IDs as read', async () => {
      mockPrismaNotification.updateMany.mockResolvedValue({ count: 2 })

      const result = await markNotificationsAsRead({
        notificationIds: ['n-1', 'n-2'],
        userId: 'user-1',
      })

      expect(result.count).toBe(2)
      expect(mockPrismaNotification.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 'user-1',
          read: false,
          id: { in: ['n-1', 'n-2'] },
        }),
        data: expect.objectContaining({
          read: true,
          readAt: expect.any(Date),
        }),
      })
    })

    it('marks all notifications as read when markAll is true', async () => {
      mockPrismaNotification.updateMany.mockResolvedValue({ count: 5 })

      await markNotificationsAsRead({
        userId: 'user-1',
        markAll: true,
      })

      const updateCall = mockPrismaNotification.updateMany.mock.calls[0][0]
      expect(updateCall.where).not.toHaveProperty('id')
    })

    it('throws if neither userId nor customerId provided', async () => {
      await expect(
        markNotificationsAsRead({ notificationIds: ['n-1'] })
      ).rejects.toThrow('Either userId or customerId must be provided')
    })

    it('only updates unread notifications (read: false filter)', async () => {
      mockPrismaNotification.updateMany.mockResolvedValue({ count: 0 })

      await markNotificationsAsRead({
        notificationIds: ['n-1'],
        userId: 'user-1',
      })

      const updateCall = mockPrismaNotification.updateMany.mock.calls[0][0]
      expect(updateCall.where.read).toBe(false)
    })
  })

  describe('notifyReviewerOnSubmit', () => {
    it('creates notification for assigned reviewer with cert number', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-10' })

      await notifyReviewerOnSubmit({
        certificateId: 'cert-1',
        certificateNumber: 'CERT-001',
        assigneeName: 'John Engineer',
        reviewerId: 'reviewer-1',
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'reviewer-1',
          type: 'SUBMITTED_FOR_REVIEW',
          certificateId: 'cert-1',
          data: expect.objectContaining({
            certificateNumber: 'CERT-001',
            assigneeName: 'John Engineer',
          }),
        }),
      })
    })
  })

  describe('notifyAssigneeOnReview', () => {
    it('creates CERTIFICATE_APPROVED notification when approved', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-11' })

      await notifyAssigneeOnReview({
        certificateId: 'cert-1',
        certificateNumber: 'CERT-001',
        assigneeId: 'eng-1',
        approved: true,
        reviewerName: 'Jane Reviewer',
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'eng-1',
          type: 'CERTIFICATE_APPROVED',
          data: expect.objectContaining({
            certificateNumber: 'CERT-001',
            reviewerName: 'Jane Reviewer',
          }),
        }),
      })
    })

    it('creates REVISION_REQUESTED notification when not approved', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-12' })

      await notifyAssigneeOnReview({
        certificateId: 'cert-1',
        certificateNumber: 'CERT-001',
        assigneeId: 'eng-1',
        approved: false,
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'eng-1',
          type: 'REVISION_REQUESTED',
          data: expect.objectContaining({
            reviewerName: 'Reviewer',
          }),
        }),
      })
    })
  })

  describe('notifyReviewerOnAssigneeResponse', () => {
    it('creates ENGINEER_RESPONDED notification for reviewer', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-13' })

      await notifyReviewerOnAssigneeResponse({
        certificateId: 'cert-1',
        certificateNumber: 'CERT-001',
        assigneeName: 'John',
        reviewerId: 'rev-1',
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'rev-1',
          type: 'ENGINEER_RESPONDED',
          data: expect.objectContaining({
            certificateNumber: 'CERT-001',
            assigneeName: 'John',
          }),
        }),
      })
    })
  })

  describe('notifyOnSentToCustomer', () => {
    it('creates notification for assignee', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-14' })

      await notifyOnSentToCustomer({
        certificateId: 'cert-1',
        certificateNumber: 'CERT-001',
        assigneeId: 'eng-1',
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledTimes(1)
      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'eng-1',
          type: 'SENT_TO_CUSTOMER',
        }),
      })
    })

    it('also creates notification for customer when customerId provided', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-15' })

      await notifyOnSentToCustomer({
        certificateId: 'cert-1',
        certificateNumber: 'CERT-001',
        assigneeId: 'eng-1',
        customerId: 'cust-1',
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledTimes(2)
      // Second call should be for customer
      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerId: 'cust-1',
          type: 'CERTIFICATE_READY',
        }),
      })
    })
  })

  describe('notifyReviewerOnCustomerRevision', () => {
    it('creates CUSTOMER_REVISION_REQUEST notification for reviewer', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-16' })

      await notifyReviewerOnCustomerRevision({
        certificateId: 'cert-1',
        certificateNumber: 'CERT-001',
        reviewerId: 'rev-1',
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'rev-1',
          type: 'CUSTOMER_REVISION_REQUEST',
        }),
      })
    })
  })

  describe('notifyCustomerOnReviewerReply', () => {
    it('creates REVIEWER_REPLIED notification for customer', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-17' })

      await notifyCustomerOnReviewerReply({
        certificateId: 'cert-1',
        certificateNumber: 'CERT-001',
        customerId: 'cust-1',
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerId: 'cust-1',
          type: 'REVIEWER_REPLIED',
        }),
      })
    })
  })

  describe('notifyOnCustomerApproval', () => {
    it('notifies both reviewer and engineer when customer approves', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-18' })

      await notifyOnCustomerApproval({
        certificateId: 'cert-1',
        certificateNumber: 'CERT-001',
        assigneeId: 'eng-1',
        reviewerId: 'rev-1',
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledTimes(2)

      // Reviewer gets CUSTOMER_APPROVED
      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'rev-1',
          type: 'CUSTOMER_APPROVED',
        }),
      })

      // Engineer gets CERTIFICATE_FINALIZED
      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'eng-1',
          type: 'CERTIFICATE_FINALIZED',
        }),
      })
    })

    it('only notifies engineer when no reviewerId provided', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-19' })

      await notifyOnCustomerApproval({
        certificateId: 'cert-1',
        certificateNumber: 'CERT-001',
        assigneeId: 'eng-1',
        reviewerId: null,
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledTimes(1)
      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'eng-1',
          type: 'CERTIFICATE_FINALIZED',
        }),
      })
    })
  })

  describe('notifyAdminsOnRegistration', () => {
    it('creates notification for every admin user (fan-out)', async () => {
      mockPrismaUser.findMany.mockResolvedValue([
        { id: 'admin-1' },
        { id: 'admin-2' },
        { id: 'admin-3' },
      ])
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-20' })

      await notifyAdminsOnRegistration({
        name: 'New User',
        email: 'new@example.com',
        companyName: 'Acme Corp',
      })

      // Should find admins first
      expect(mockPrismaUser.findMany).toHaveBeenCalledWith({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      })

      // Should create notification for each admin
      expect(mockPrismaNotification.create).toHaveBeenCalledTimes(3)
      for (const adminId of ['admin-1', 'admin-2', 'admin-3']) {
        expect(mockPrismaNotification.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: adminId,
            type: 'REGISTRATION_SUBMITTED',
            data: expect.objectContaining({
              name: 'New User',
              email: 'new@example.com',
              companyName: 'Acme Corp',
            }),
          }),
        })
      }
    })

    it('handles zero admins gracefully', async () => {
      mockPrismaUser.findMany.mockResolvedValue([])

      await notifyAdminsOnRegistration({
        name: 'User',
        email: 'u@test.com',
        companyName: 'Test',
      })

      expect(mockPrismaNotification.create).not.toHaveBeenCalled()
    })
  })

  describe('notifyCustomerOnRegistrationApproved', () => {
    it('creates REGISTRATION_APPROVED notification for customer', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-21' })

      await notifyCustomerOnRegistrationApproved({
        customerId: 'cust-1',
        companyName: 'Acme Corp',
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerId: 'cust-1',
          type: 'REGISTRATION_APPROVED',
          data: expect.objectContaining({
            companyName: 'Acme Corp',
          }),
        }),
      })
    })
  })

  describe('notifyOnChatMessage', () => {
    it('creates notification for USER recipient', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-22' })

      await notifyOnChatMessage({
        recipientId: 'user-1',
        recipientType: 'USER',
        certificateId: 'cert-1',
        certificateNumber: 'CERT-001',
        senderName: 'Bob',
        threadType: 'internal',
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'NEW_CHAT_MESSAGE',
          certificateId: 'cert-1',
          data: expect.objectContaining({
            certificateNumber: 'CERT-001',
            senderName: 'Bob',
            threadType: 'internal',
          }),
        }),
      })
    })

    it('creates notification for CUSTOMER recipient', async () => {
      mockPrismaNotification.create.mockResolvedValue({ id: 'notif-23' })

      await notifyOnChatMessage({
        recipientId: 'cust-1',
        recipientType: 'CUSTOMER',
        certificateId: 'cert-1',
        certificateNumber: 'CERT-001',
        senderName: 'Alice',
        threadType: 'customer',
      })

      expect(mockPrismaNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerId: 'cust-1',
          type: 'NEW_CHAT_MESSAGE',
        }),
      })
    })
  })
})
