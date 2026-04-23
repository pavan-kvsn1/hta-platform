/**
 * Queue Integration Tests
 *
 * Tests that route handlers correctly trigger email and notification
 * queue jobs through the full HTTP → route → queue pipeline.
 *
 * Uses a real database with Fastify .inject() and a mocked queue service.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

// Mock the queue service BEFORE importing anything that uses it
const mockEnqueueEmail = vi.fn().mockResolvedValue(undefined)
const mockEnqueueNotification = vi.fn().mockResolvedValue(undefined)
const mockQueuePasswordResetEmail = vi.fn().mockResolvedValue(undefined)
const mockQueueStaffActivationEmail = vi.fn().mockResolvedValue(undefined)
const mockQueueCertificateSubmittedEmail = vi.fn().mockResolvedValue(undefined)
const mockQueueCertificateReviewedEmail = vi.fn().mockResolvedValue(undefined)
const mockQueueCustomerReviewEmail = vi.fn().mockResolvedValue(undefined)
const mockQueueCustomerApprovalNotificationEmail = vi.fn().mockResolvedValue(undefined)
const mockCloseQueues = vi.fn().mockResolvedValue(undefined)

vi.mock('../../src/services/queue.js', () => ({
  enqueueEmail: mockEnqueueEmail,
  enqueueNotification: mockEnqueueNotification,
  queuePasswordResetEmail: mockQueuePasswordResetEmail,
  queueStaffActivationEmail: mockQueueStaffActivationEmail,
  queueCertificateSubmittedEmail: mockQueueCertificateSubmittedEmail,
  queueCertificateReviewedEmail: mockQueueCertificateReviewedEmail,
  queueCustomerReviewEmail: mockQueueCustomerReviewEmail,
  queueCustomerApprovalNotificationEmail: mockQueueCustomerApprovalNotificationEmail,
  closeQueues: mockCloseQueues,
}))

import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanTestDatabase,
  prisma,
} from './setup/test-db'
import {
  createTestTenant,
  createTestUser,
  createEngineerWithAdmin,
  createTestCertificate,
  createMasterInstrument,
  createCustomerAccount,
  createCustomerUser,
  createTestSubscription,
  TEST_PASSWORD,
} from './setup/fixtures'
import { hashPassword } from '@hta/shared/auth'

// =============================================================================
// HELPERS
// =============================================================================

const JWT_SECRET = 'test-secret-for-queue-integration'

interface TestUser {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'ENGINEER' | 'CUSTOMER'
  userType: 'STAFF' | 'CUSTOMER'
  tenantId: string
  isAdmin?: boolean
  adminType?: 'MASTER' | 'WORKER' | null
}

/**
 * Build a minimal Fastify test app with JWT + tenant middleware + a single route plugin.
 */
async function buildTestApp(
  routePlugin: (fastify: FastifyInstance) => Promise<void> | void,
  prefix: string
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(jwt, { secret: JWT_SECRET, sign: { expiresIn: '5m' } })

  // Tenant middleware: resolve from X-Tenant-ID header
  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/health')) return
    const slug = request.headers['x-tenant-id'] as string
    if (!slug) return reply.status(400).send({ error: 'Missing X-Tenant-ID' })

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, isActive: true, settings: true },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    request.tenant = tenant
    request.tenantId = tenant.id
  })

  await app.register(routePlugin, { prefix })
  await app.ready()
  return app
}

function signToken(app: FastifyInstance, user: TestUser): string {
  return app.jwt.sign({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    userType: user.userType,
    tenantId: user.tenantId,
    isAdmin: user.isAdmin ?? false,
    adminType: user.adminType ?? null,
  })
}

// =============================================================================
// TESTS
// =============================================================================

describe('Queue Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // AUTH ROUTES — password change, forgot-password, reset-password
  // ---------------------------------------------------------------------------
  describe('Auth routes → Queue', () => {
    let app: FastifyInstance
    let tenantSlug: string
    let tenantId: string

    beforeAll(async () => {
      // Import route lazily to use mocked queue
      const { default: authRoutes } = await import('../../src/routes/auth/index.js')
      app = await buildTestApp(authRoutes, '/api/auth')
    })

    afterAll(async () => {
      await app.close()
    })

    beforeEach(async () => {
      await cleanTestDatabase()
      vi.clearAllMocks()
      const tenant = await createTestTenant(prisma, { slug: `auth-test-${Date.now()}` })
      tenantSlug = tenant.slug
      tenantId = tenant.id
    })

    it('POST /change-password → enqueueNotification(PASSWORD_CHANGED)', async () => {
      const passwordHash = await hashPassword('OldPassword1!')
      const user = await createTestUser(prisma, {
        tenantId,
        role: 'ENGINEER',
        passwordHash,
      })

      const token = signToken(app, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: 'ENGINEER',
        userType: 'STAFF',
        tenantId,
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': tenantSlug,
        },
        payload: {
          currentPassword: 'OldPassword1!',
          newPassword: 'NewPassword2!',
          confirmPassword: 'NewPassword2!',
        },
      })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).success).toBe(true)

      // Should have queued a PASSWORD_CHANGED notification
      expect(mockEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'create-notification',
          userId: user.id,
          notificationType: 'PASSWORD_CHANGED',
        })
      )
    })

    it('POST /forgot-password (staff) → queuePasswordResetEmail', async () => {
      const passwordHash = await hashPassword('SomePass1!')
      const user = await createTestUser(prisma, {
        tenantId,
        email: `forgot-${Date.now()}@test.com`,
        passwordHash,
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        headers: { 'x-tenant-id': tenantSlug },
        payload: {
          email: user.email,
          userType: 'STAFF',
        },
      })

      expect(res.statusCode).toBe(200)

      // Should have queued a password reset email
      expect(mockQueuePasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: user.email,
          userName: user.name,
        })
      )
    })

    it('POST /reset-password → enqueueNotification(PASSWORD_CHANGED)', async () => {
      const passwordHash = await hashPassword('OldPass1!')
      const user = await createTestUser(prisma, { tenantId, passwordHash })

      // Create a valid reset token
      const resetToken = await prisma.passwordResetToken.create({
        data: {
          token: `reset-${Date.now()}`,
          userId: user.id,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        headers: { 'x-tenant-id': tenantSlug },
        payload: {
          token: resetToken.token,
          newPassword: 'BrandNew1!',
          confirmPassword: 'BrandNew1!',
        },
      })

      expect(res.statusCode).toBe(200)

      expect(mockEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'create-notification',
          userId: user.id,
          notificationType: 'PASSWORD_CHANGED',
        })
      )
    })
  })

  // ---------------------------------------------------------------------------
  // ADMIN ROUTES — create staff, authorize certificate
  // ---------------------------------------------------------------------------
  describe('Admin routes → Queue', () => {
    let app: FastifyInstance
    let tenantSlug: string
    let tenantId: string

    beforeAll(async () => {
      const { default: adminRoutes } = await import('../../src/routes/admin/index.js')
      app = await buildTestApp(adminRoutes, '/api/admin')
    })

    afterAll(async () => {
      await app.close()
    })

    beforeEach(async () => {
      await cleanTestDatabase()
      vi.clearAllMocks()
      const tenant = await createTestTenant(prisma, { slug: `admin-test-${Date.now()}` })
      tenantSlug = tenant.slug
      tenantId = tenant.id
      // Create subscription so limit checks pass
      await createTestSubscription(prisma, tenantId)
    })

    it('POST /users → queueStaffActivationEmail + enqueueNotification(STAFF_CREATED)', async () => {
      // Create TWO admins: actor + recipient (notification only fires to OTHER admins)
      const actorAdmin = await createTestUser(prisma, {
        tenantId,
        role: 'ADMIN',
        isAdmin: true,
        name: 'Master Admin',
      })
      const otherAdmin = await createTestUser(prisma, {
        tenantId,
        role: 'ADMIN',
        isAdmin: true,
        name: 'Worker Admin',
      })

      const token = signToken(app, {
        id: actorAdmin.id,
        email: actorAdmin.email,
        name: actorAdmin.name,
        role: 'ADMIN',
        userType: 'STAFF',
        tenantId,
        isAdmin: true,
        adminType: 'MASTER',
      })

      const newEmail = `new-staff-${Date.now()}@test.com`

      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/users',
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': tenantSlug,
        },
        payload: {
          email: newEmail,
          name: 'New Staff',
          role: 'ENGINEER',
          assignedAdminId: actorAdmin.id,
        },
      })

      expect(res.statusCode).toBe(200)

      // Should queue activation email
      expect(mockQueueStaffActivationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: newEmail,
          userName: 'New Staff',
        })
      )

      // Wait for async fire-and-forget notification chain
      // (route does prisma.user.findMany().then(admins => enqueueNotification()))
      await new Promise((r) => setTimeout(r, 500))

      // Should queue STAFF_CREATED notification to the other admin
      expect(mockEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'create-notification',
          userId: otherAdmin.id,
          notificationType: 'STAFF_CREATED',
        })
      )
    })
  })

  // ---------------------------------------------------------------------------
  // CERTIFICATE ROUTES — submit, review (approve/revision/reject)
  // ---------------------------------------------------------------------------
  describe('Certificate routes → Queue', () => {
    let app: FastifyInstance
    let tenantSlug: string
    let tenantId: string

    beforeAll(async () => {
      const { default: certRoutes } = await import('../../src/routes/certificates/index.js')
      app = await buildTestApp(certRoutes, '/api/certificates')
    })

    afterAll(async () => {
      await app.close()
    })

    beforeEach(async () => {
      await cleanTestDatabase()
      vi.clearAllMocks()
      const tenant = await createTestTenant(prisma, { slug: `cert-test-${Date.now()}` })
      tenantSlug = tenant.slug
      tenantId = tenant.id
      await createTestSubscription(prisma, tenantId)
    })

    it('POST /:id/submit → queueCertificateSubmittedEmail + enqueueNotification(SUBMITTED_FOR_REVIEW)', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma, tenantId)

      // Create a DRAFT certificate with all required fields for submission
      const instrument = await createMasterInstrument(prisma, tenantId, admin.id)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id, {
        status: 'DRAFT',
        customerName: 'Test Customer Ltd',
      })

      // Add required fields that the submit handler validates
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: {
          dateOfCalibration: new Date(),
          ambientTemperature: '25°C',
          reviewerId: admin.id,
        },
      })

      // Link master instrument to certificate
      await prisma.certificateMasterInstrument.create({
        data: {
          certificateId: certificate.id,
          masterInstrumentId: instrument.id,
          sopReference: 'SOP-001',
        },
      })

      const token = signToken(app, {
        id: engineer.id,
        email: engineer.email,
        name: engineer.name,
        role: 'ENGINEER',
        userType: 'STAFF',
        tenantId,
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/certificates/${certificate.id}/submit`,
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': tenantSlug,
        },
        payload: {
          signatureData: 'data:image/png;base64,abc123',
          signerName: engineer.name,
        },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)

      // Wait for async non-blocking queue calls to settle
      await new Promise((r) => setTimeout(r, 200))

      // Should queue submitted email to reviewer
      expect(mockQueueCertificateSubmittedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewerEmail: admin.email,
          reviewerName: admin.name,
          assigneeName: engineer.name,
        })
      )

      // Should queue SUBMITTED_FOR_REVIEW notification
      expect(mockEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'create-notification',
          userId: admin.id,
          notificationType: 'SUBMITTED_FOR_REVIEW',
        })
      )
    })

    it('POST /:id/review (approve) → queueCertificateReviewedEmail + enqueueNotification(CERTIFICATE_APPROVED)', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma, tenantId)

      const certificate = await createTestCertificate(prisma, tenantId, engineer.id, {
        status: 'PENDING_REVIEW',
      })
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: { reviewerId: admin.id },
      })

      const token = signToken(app, {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: 'ADMIN',
        userType: 'STAFF',
        tenantId,
        isAdmin: true,
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/certificates/${certificate.id}/review`,
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': tenantSlug,
        },
        payload: {
          action: 'approve',
          signatureData: 'data:image/png;base64,xyz789',
          signerName: admin.name,
        },
      })

      expect(res.statusCode).toBe(200)

      // Wait for async non-blocking queue calls
      await new Promise((r) => setTimeout(r, 200))

      // Should queue reviewed email to engineer
      expect(mockQueueCertificateReviewedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          assigneeEmail: engineer.email,
          assigneeName: engineer.name,
          approved: true,
        })
      )

      // Should queue CERTIFICATE_APPROVED notification
      expect(mockEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'create-notification',
          userId: engineer.id,
          notificationType: 'CERTIFICATE_APPROVED',
        })
      )
    })

    it('POST /:id/review (request_revision) → email + REVISION_REQUESTED notification', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma, tenantId)

      const certificate = await createTestCertificate(prisma, tenantId, engineer.id, {
        status: 'PENDING_REVIEW',
      })
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: { reviewerId: admin.id },
      })

      const token = signToken(app, {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: 'ADMIN',
        userType: 'STAFF',
        tenantId,
        isAdmin: true,
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/certificates/${certificate.id}/review`,
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': tenantSlug,
        },
        payload: {
          action: 'request_revision',
          comment: 'Please fix the readings',
          generalNotes: 'Temperature values seem off',
        },
      })

      expect(res.statusCode).toBe(200)

      await new Promise((r) => setTimeout(r, 200))

      // Should queue revision email
      expect(mockQueueCertificateReviewedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          assigneeEmail: engineer.email,
          approved: false,
          revisionNote: expect.any(String),
        })
      )

      // Should queue REVISION_REQUESTED notification
      expect(mockEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'create-notification',
          userId: engineer.id,
          notificationType: 'REVISION_REQUESTED',
        })
      )
    })

    it('POST /:id/review (reject) → email + CERTIFICATE_REJECTED notification', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma, tenantId)

      const certificate = await createTestCertificate(prisma, tenantId, engineer.id, {
        status: 'PENDING_REVIEW',
      })
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: { reviewerId: admin.id },
      })

      const token = signToken(app, {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: 'ADMIN',
        userType: 'STAFF',
        tenantId,
        isAdmin: true,
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/certificates/${certificate.id}/review`,
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': tenantSlug,
        },
        payload: {
          action: 'reject',
          comment: 'Readings are incorrect',
        },
      })

      expect(res.statusCode).toBe(200)

      await new Promise((r) => setTimeout(r, 200))

      expect(mockQueueCertificateReviewedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          assigneeEmail: engineer.email,
          approved: false,
        })
      )

      expect(mockEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: engineer.id,
          notificationType: 'CERTIFICATE_REJECTED',
        })
      )
    })
  })

  // ---------------------------------------------------------------------------
  // CHAT ROUTES — new message → notification to other participants
  // ---------------------------------------------------------------------------
  describe('Chat routes → Queue', () => {
    let app: FastifyInstance
    let tenantSlug: string
    let tenantId: string

    beforeAll(async () => {
      const { default: chatRoutes } = await import('../../src/routes/chat/index.js')
      app = await buildTestApp(chatRoutes, '/api/chat')
    })

    afterAll(async () => {
      await app.close()
    })

    beforeEach(async () => {
      await cleanTestDatabase()
      vi.clearAllMocks()
      const tenant = await createTestTenant(prisma, { slug: `chat-test-${Date.now()}` })
      tenantSlug = tenant.slug
      tenantId = tenant.id
    })

    it('POST /threads/:id/messages → enqueueNotification(NEW_CHAT_MESSAGE) to other participants', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma, tenantId)

      // Create certificate and chat thread
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id)
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: { reviewerId: admin.id },
      })

      const thread = await prisma.chatThread.create({
        data: {
          certificateId: certificate.id,
          threadType: 'ASSIGNEE_REVIEWER',
        },
      })

      const token = signToken(app, {
        id: engineer.id,
        email: engineer.email,
        name: engineer.name,
        role: 'ENGINEER',
        userType: 'STAFF',
        tenantId,
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/chat/threads/${thread.id}/messages`,
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': tenantSlug,
        },
        payload: {
          content: 'Can we discuss the voltage readings?',
        },
      })

      expect(res.statusCode).toBe(201)

      // Wait for async fire-and-forget calls
      await new Promise((r) => setTimeout(r, 200))

      // Should notify the reviewer (admin) about the new message
      expect(mockEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'create-notification',
          userId: admin.id,
          notificationType: 'NEW_CHAT_MESSAGE',
          certificateId: certificate.id,
          data: expect.objectContaining({
            threadId: thread.id,
            senderName: engineer.name,
          }),
        })
      )
    })
  })

  // ---------------------------------------------------------------------------
  // CROSS-CUTTING: dual email + notification for critical actions
  // ---------------------------------------------------------------------------
  describe('Critical actions trigger BOTH email and notification', () => {
    let app: FastifyInstance
    let tenantSlug: string
    let tenantId: string

    beforeAll(async () => {
      const { default: certRoutes } = await import('../../src/routes/certificates/index.js')
      app = await buildTestApp(certRoutes, '/api/certificates')
    })

    afterAll(async () => {
      await app.close()
    })

    beforeEach(async () => {
      await cleanTestDatabase()
      vi.clearAllMocks()
      const tenant = await createTestTenant(prisma, { slug: `dual-test-${Date.now()}` })
      tenantSlug = tenant.slug
      tenantId = tenant.id
      await createTestSubscription(prisma, tenantId)
    })

    it('certificate approval triggers both email and in-app notification', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma, tenantId)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id, {
        status: 'PENDING_REVIEW',
      })
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: { reviewerId: admin.id },
      })

      const token = signToken(app, {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: 'ADMIN',
        userType: 'STAFF',
        tenantId,
        isAdmin: true,
      })

      const res = await app.inject({
        method: 'POST',
        url: `/api/certificates/${certificate.id}/review`,
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': tenantSlug,
        },
        payload: {
          action: 'approve',
          signatureData: 'data:image/png;base64,sig',
          signerName: admin.name,
        },
      })

      expect(res.statusCode).toBe(200)
      await new Promise((r) => setTimeout(r, 200))

      // Email was sent
      const emailCalled = mockQueueCertificateReviewedEmail.mock.calls.length > 0
      // Notification was sent
      const notifCalled = mockEnqueueNotification.mock.calls.some(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).notificationType === 'CERTIFICATE_APPROVED'
      )

      expect(emailCalled).toBe(true)
      expect(notifCalled).toBe(true)
    })

    it('revision request triggers both email and in-app notification', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma, tenantId)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id, {
        status: 'PENDING_REVIEW',
      })
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: { reviewerId: admin.id },
      })

      const token = signToken(app, {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: 'ADMIN',
        userType: 'STAFF',
        tenantId,
        isAdmin: true,
      })

      await app.inject({
        method: 'POST',
        url: `/api/certificates/${certificate.id}/review`,
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': tenantSlug,
        },
        payload: {
          action: 'request_revision',
          comment: 'Fix voltage readings',
        },
      })

      await new Promise((r) => setTimeout(r, 200))

      const emailCalled = mockQueueCertificateReviewedEmail.mock.calls.length > 0
      const notifCalled = mockEnqueueNotification.mock.calls.some(
        (call: unknown[]) =>
          (call[0] as Record<string, unknown>).notificationType === 'REVISION_REQUESTED'
      )

      expect(emailCalled).toBe(true)
      expect(notifCalled).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // GRACEFUL DEGRADATION: queue functions should never fail the request
  // ---------------------------------------------------------------------------
  describe('Queue failures do not break API responses', () => {
    let app: FastifyInstance
    let tenantSlug: string
    let tenantId: string

    beforeAll(async () => {
      const { default: authRoutes } = await import('../../src/routes/auth/index.js')
      app = await buildTestApp(authRoutes, '/api/auth')
    })

    afterAll(async () => {
      await app.close()
    })

    beforeEach(async () => {
      await cleanTestDatabase()
      vi.clearAllMocks()
      const tenant = await createTestTenant(prisma, { slug: `degrade-test-${Date.now()}` })
      tenantSlug = tenant.slug
      tenantId = tenant.id
    })

    it('password change succeeds even when notification queue throws', async () => {
      // Make notification fail
      mockEnqueueNotification.mockRejectedValueOnce(new Error('Redis connection lost'))

      const passwordHash = await hashPassword('OldPassword1!')
      const user = await createTestUser(prisma, { tenantId, passwordHash })

      const token = signToken(app, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: 'ENGINEER',
        userType: 'STAFF',
        tenantId,
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': tenantSlug,
        },
        payload: {
          currentPassword: 'OldPassword1!',
          newPassword: 'NewPassword2!',
          confirmPassword: 'NewPassword2!',
        },
      })

      // API should still succeed
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).success).toBe(true)
    })

    it('forgot-password succeeds even when email queue throws', async () => {
      mockQueuePasswordResetEmail.mockRejectedValueOnce(new Error('BullMQ unavailable'))

      const passwordHash = await hashPassword('SomePass1!')
      const user = await createTestUser(prisma, {
        tenantId,
        email: `degrade-${Date.now()}@test.com`,
        passwordHash,
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        headers: { 'x-tenant-id': tenantSlug },
        payload: {
          email: user.email,
          userType: 'STAFF',
        },
      })

      // Should still return success (prevents email enumeration)
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).success).toBe(true)
    })
  })
})
