/**
 * Customer Approval Routes Unit Tests
 *
 * Tests for certificate approval and revision-request endpoints:
 *   POST /api/customer/review/:token/approve  (session-based & token-based)
 *   POST /api/customer/review/:token/reject   (session-based & token-based)
 *
 * Covers: happy-path approval with notifications, revision requests,
 * 404/400/403 error cases, and admin notification creation (the fix
 * from commit 32d9eed).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks (must precede imports) ──────────────────────────────────

vi.mock('@hta/database', () => {
  // Build a transactional proxy: when prisma.$transaction is called with
  // an async fn, the fn receives the same mocked prisma so all assertions
  // work transparently.
  const prisma: Record<string, any> = {
    customerUser: { findUnique: vi.fn() },
    certificate: { findUnique: vi.fn() },
    approvalToken: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    signature: { create: vi.fn() },
    certificateEvent: { findFirst: vi.fn(), create: vi.fn() },
    user: { findMany: vi.fn() },
    signingEvidence: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  }
  // $transaction: call the callback with prisma itself
  prisma.$transaction = vi.fn((fn: (tx: typeof prisma) => Promise<any>) => fn(prisma))
  return { prisma, Prisma: {} }
})

vi.mock('../../src/middleware/auth.js', () => ({
  requireCustomer: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  optionalAuth: vi.fn((_req: any, _reply: any, done: any) => done?.()),
}))

vi.mock('../../src/services/queue.js', () => ({
  queueCustomerApprovalNotificationEmail: vi.fn().mockResolvedValue(undefined),
  enqueueNotification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/lib/signing-evidence.js', () => ({
  appendSigningEvidence: vi.fn().mockResolvedValue(undefined),
  collectFastifyEvidence: vi.fn().mockReturnValue({}),
}))

vi.mock('../../src/lib/pagination.js', () => ({
  parsePagination: vi.fn((q: any) => {
    const page = Math.max(1, parseInt(q.page || '1'))
    const limit = Math.max(1, Math.min(parseInt(q.limit || '15'), 25))
    return { page, limit, skip: (page - 1) * limit }
  }),
  paginationResponse: vi.fn((page: number, limit: number, total: number) => ({
    page, limit, total, totalPages: Math.ceil(total / limit),
  })),
}))

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed'), compare: vi.fn() },
}))

import Fastify from 'fastify'
import { prisma } from '@hta/database'
import { queueCustomerApprovalNotificationEmail, enqueueNotification } from '../../src/services/queue.js'
import customerRoutes from '../../src/routes/customer/index.js'

const mockedPrisma = vi.mocked(prisma)
const mockedQueueEmail = vi.mocked(queueCustomerApprovalNotificationEmail)
const mockedEnqueueNotification = vi.mocked(enqueueNotification)

// ── Helpers ───────────────────────────────────────────────────────

function buildApp() {
  const app = Fastify()

  app.decorateRequest('tenantId', '')
  app.decorateRequest('user', null)
  app.addHook('preHandler', async (req) => {
    req.tenantId = (req.headers['x-tenant-id'] as string) || 'tenant-1'
    // Allow tests to set role via header; default to CUSTOMER for these tests
    const role = (req.headers['x-user-role'] as string) || 'CUSTOMER'
    req.user = {
      sub: (req.headers['x-user-id'] as string) || 'cust-user-1',
      role,
      email: (req.headers['x-user-email'] as string) || 'customer@acme.com',
      isAdmin: role === 'ADMIN',
    } as any
  })

  app.register(customerRoutes, { prefix: '/api/customer' })
  return app
}

// ── Shared fixtures ──────────────────────────────────────────────

const TENANT_ID = 'tenant-1'

const customerUser = {
  id: 'cust-user-1',
  tenantId: TENANT_ID,
  name: 'Jane Customer',
  email: 'customer@acme.com',
  companyName: 'Acme Corp',
  customerAccount: {
    id: 'acct-1',
    companyName: 'Acme Corp',
    primaryPocId: 'cust-user-1',
  },
  customerAccountId: 'acct-1',
}

const certificate = {
  id: 'cert-1',
  tenantId: TENANT_ID,
  certificateNumber: 'HTA-2026-001',
  customerName: 'Acme Corp',
  status: 'PENDING_CUSTOMER_APPROVAL',
  currentRevision: 1,
  reviewerId: 'reviewer-1',
  createdBy: {
    id: 'engineer-1',
    name: 'Bob Engineer',
    email: 'bob@hta.com',
  },
}

const approvalPayload = {
  signatureData: 'data:image/png;base64,iVBOR...',
  signerName: 'Jane Customer',
  signerEmail: 'customer@acme.com',
}

const tokenRecord = {
  id: 'token-rec-1',
  token: 'abc123',
  certificateId: 'cert-1',
  customerId: 'cust-user-1',
  usedAt: null as Date | null,
  expiresAt: new Date('2026-12-31T23:59:59Z'),
  createdAt: new Date('2026-05-01'),
  certificate: { ...certificate },
  customer: {
    id: 'cust-user-1',
    name: 'Jane Customer',
    email: 'customer@acme.com',
    companyName: 'Acme Corp',
  },
}

// ── Tests ────────────────────────────────────────────────────────

describe('customer approval routes', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildApp()
    await app.ready()

    // Default: the last event has sequenceNumber 5
    mockedPrisma.certificateEvent.findFirst.mockResolvedValue({ sequenceNumber: 5 } as any)
    mockedPrisma.certificateEvent.create.mockResolvedValue({} as any)
    mockedPrisma.signature.create.mockResolvedValue({ id: 'sig-1' } as any)
    mockedPrisma.approvalToken.updateMany.mockResolvedValue({ count: 1 } as any)
    mockedPrisma.approvalToken.update.mockResolvedValue({} as any)
    ;(mockedPrisma.certificate as any).update = vi.fn().mockResolvedValue({} as any)
  })

  afterEach(async () => {
    await app.close()
  })

  // ────────────────────────────────────────────────────────────────
  // SESSION-BASED APPROVAL  (POST /api/customer/review/cert:<id>/approve)
  // ────────────────────────────────────────────────────────────────

  describe('POST /api/customer/review/cert:<id>/approve (session-based)', () => {
    it('approves a certificate — creates signature, event, and notifies admins', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(customerUser as any)
      mockedPrisma.certificate.findUnique.mockResolvedValue(certificate as any)
      mockedPrisma.user.findMany.mockResolvedValue([
        { id: 'admin-1' },
        { id: 'admin-2' },
      ] as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/cert:cert-1/approve',
        headers: {
          'x-tenant-id': TENANT_ID,
          'x-user-id': 'cust-user-1',
          'x-user-email': 'customer@acme.com',
          'x-user-role': 'CUSTOMER',
        },
        payload: approvalPayload,
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.message).toMatch(/approved/i)

      // Signature was created inside the transaction
      expect(mockedPrisma.signature.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            certificateId: 'cert-1',
            signerType: 'CUSTOMER',
            signerName: 'Jane Customer',
          }),
        }),
      )

      // Certificate status updated to PENDING_ADMIN_AUTHORIZATION
      expect((mockedPrisma.certificate as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cert-1' },
          data: expect.objectContaining({ status: 'PENDING_ADMIN_AUTHORIZATION' }),
        }),
      )

      // CUSTOMER_APPROVED event was logged with correct sequence
      expect(mockedPrisma.certificateEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            certificateId: 'cert-1',
            sequenceNumber: 6,
            eventType: 'CUSTOMER_APPROVED',
            customerId: 'cust-user-1',
            userRole: 'CUSTOMER',
          }),
        }),
      )

      // Approval tokens invalidated
      expect(mockedPrisma.approvalToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ certificateId: 'cert-1', usedAt: null }),
        }),
      )

      // Engineer email notification sent
      expect(mockedQueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          staffEmail: 'bob@hta.com',
          approved: true,
        }),
      )

      // Engineer in-app notification
      expect(mockedEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'engineer-1',
          notificationType: 'CERTIFICATE_FINALIZED',
          certificateId: 'cert-1',
        }),
      )

      // Reviewer notification
      expect(mockedEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'reviewer-1',
          notificationType: 'CUSTOMER_APPROVED',
        }),
      )

      // Admin notifications (the fix from commit 32d9eed)
      expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: 'ADMIN', isActive: true, tenantId: TENANT_ID },
        }),
      )
      // Two admins => two calls for admin notifications
      const adminCalls = mockedEnqueueNotification.mock.calls.filter(
        (call) => call[0].notificationType === 'CUSTOMER_APPROVED' && call[0].userId?.startsWith('admin-'),
      )
      expect(adminCalls).toHaveLength(2)
    })

    it('returns 404 when certificate does not exist', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(customerUser as any)
      mockedPrisma.certificate.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/cert:nonexistent/approve',
        headers: {
          'x-tenant-id': TENANT_ID,
          'x-user-email': 'customer@acme.com',
          'x-user-role': 'CUSTOMER',
        },
        payload: approvalPayload,
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toMatch(/certificate not found/i)
      expect(mockedPrisma.signature.create).not.toHaveBeenCalled()
    })

    it('returns 400 when certificate is already AUTHORIZED (not available for approval)', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(customerUser as any)
      mockedPrisma.certificate.findUnique.mockResolvedValue({
        ...certificate,
        status: 'AUTHORIZED',
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/cert:cert-1/approve',
        headers: {
          'x-tenant-id': TENANT_ID,
          'x-user-email': 'customer@acme.com',
          'x-user-role': 'CUSTOMER',
        },
        payload: approvalPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/not available for approval/i)
      expect(mockedPrisma.signature.create).not.toHaveBeenCalled()
    })

    it('returns 403 when customer company does not match certificate customerName', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue({
        ...customerUser,
        companyName: 'Other Corp',
        customerAccount: { ...customerUser.customerAccount, companyName: 'Other Corp' },
      } as any)
      mockedPrisma.certificate.findUnique.mockResolvedValue(certificate as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/cert:cert-1/approve',
        headers: {
          'x-tenant-id': TENANT_ID,
          'x-user-email': 'customer@acme.com',
          'x-user-role': 'CUSTOMER',
        },
        payload: approvalPayload,
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error).toMatch(/permission/i)
    })

    it('returns 401 when user is not a CUSTOMER role', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/cert:cert-1/approve',
        headers: {
          'x-tenant-id': TENANT_ID,
          'x-user-role': 'ENGINEER',
        },
        payload: approvalPayload,
      })

      expect(res.statusCode).toBe(401)
      expect(res.json().error).toMatch(/unauthorized/i)
    })

    it('returns 400 when signatureData is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/cert:cert-1/approve',
        headers: {
          'x-tenant-id': TENANT_ID,
          'x-user-role': 'CUSTOMER',
        },
        payload: { signerName: 'Jane Customer' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/signature.*required/i)
    })

    it('allows approval when status is CUSTOMER_REVISION_REQUIRED', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(customerUser as any)
      mockedPrisma.certificate.findUnique.mockResolvedValue({
        ...certificate,
        status: 'CUSTOMER_REVISION_REQUIRED',
      } as any)
      mockedPrisma.user.findMany.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/cert:cert-1/approve',
        headers: {
          'x-tenant-id': TENANT_ID,
          'x-user-email': 'customer@acme.com',
          'x-user-role': 'CUSTOMER',
        },
        payload: approvalPayload,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
    })
  })

  // ────────────────────────────────────────────────────────────────
  // TOKEN-BASED APPROVAL  (POST /api/customer/review/<token>/approve)
  // ────────────────────────────────────────────────────────────────

  describe('POST /api/customer/review/:token/approve (token-based)', () => {
    it('approves via token — creates signature, event, and notifies admins', async () => {
      mockedPrisma.approvalToken.findUnique.mockResolvedValue(tokenRecord as any)
      mockedPrisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }] as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/abc123/approve',
        headers: { 'x-tenant-id': TENANT_ID },
        payload: approvalPayload,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)

      // Signature created
      expect(mockedPrisma.signature.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            certificateId: 'cert-1',
            signerType: 'CUSTOMER',
            customerId: 'cust-user-1',
          }),
        }),
      )

      // Token marked as used
      expect(mockedPrisma.approvalToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-rec-1' },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      )

      // CUSTOMER_APPROVED event logged
      expect(mockedPrisma.certificateEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'CUSTOMER_APPROVED',
            certificateId: 'cert-1',
          }),
        }),
      )

      // Admin notifications created (commit 32d9eed fix)
      expect(mockedPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: 'ADMIN', isActive: true, tenantId: TENANT_ID },
        }),
      )
      const adminNotifCalls = mockedEnqueueNotification.mock.calls.filter(
        (call) => call[0].notificationType === 'CUSTOMER_APPROVED' && call[0].userId === 'admin-1',
      )
      expect(adminNotifCalls).toHaveLength(1)
    })

    it('returns 404 for an invalid (nonexistent) token', async () => {
      mockedPrisma.approvalToken.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/bad-token/approve',
        headers: { 'x-tenant-id': TENANT_ID },
        payload: approvalPayload,
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toMatch(/invalid token/i)
    })

    it('returns 400 when token has already been used', async () => {
      mockedPrisma.approvalToken.findUnique.mockResolvedValue({
        ...tokenRecord,
        usedAt: new Date('2026-05-02'),
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/abc123/approve',
        headers: { 'x-tenant-id': TENANT_ID },
        payload: approvalPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/already been reviewed/i)
    })

    it('returns 400 when token has expired', async () => {
      mockedPrisma.approvalToken.findUnique.mockResolvedValue({
        ...tokenRecord,
        expiresAt: new Date('2025-01-01'),
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/abc123/approve',
        headers: { 'x-tenant-id': TENANT_ID },
        payload: approvalPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/expired/i)
    })

    it('returns 400 when certificate status is not eligible for approval', async () => {
      mockedPrisma.approvalToken.findUnique.mockResolvedValue({
        ...tokenRecord,
        certificate: { ...certificate, status: 'AUTHORIZED' },
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/abc123/approve',
        headers: { 'x-tenant-id': TENANT_ID },
        payload: approvalPayload,
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/not available for approval/i)
    })
  })

  // ────────────────────────────────────────────────────────────────
  // SESSION-BASED REJECTION  (POST /api/customer/review/cert:<id>/reject)
  // ────────────────────────────────────────────────────────────────

  describe('POST /api/customer/review/cert:<id>/reject (session-based)', () => {
    it('requests revision — creates event and notifies engineer + admins', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(customerUser as any)
      mockedPrisma.certificate.findUnique.mockResolvedValue({
        ...certificate,
        reviewer: { id: 'reviewer-1', name: 'Reviewer' },
      } as any)
      mockedPrisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }] as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/cert:cert-1/reject',
        headers: {
          'x-tenant-id': TENANT_ID,
          'x-user-email': 'customer@acme.com',
          'x-user-role': 'CUSTOMER',
        },
        payload: { notes: 'Section 5 results are incorrect' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(res.json().message).toMatch(/revision/i)

      // Certificate status changed to CUSTOMER_REVISION_REQUIRED
      expect((mockedPrisma.certificate as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cert-1' },
          data: expect.objectContaining({
            status: 'CUSTOMER_REVISION_REQUIRED',
            statusNotes: 'Section 5 results are incorrect',
          }),
        }),
      )

      // CUSTOMER_REVISION_REQUESTED event was logged
      expect(mockedPrisma.certificateEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            certificateId: 'cert-1',
            eventType: 'CUSTOMER_REVISION_REQUESTED',
            customerId: 'cust-user-1',
          }),
        }),
      )

      // Engineer was emailed
      expect(mockedQueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          staffEmail: 'bob@hta.com',
          approved: false,
          rejectionNote: 'Section 5 results are incorrect',
        }),
      )

      // Admin notifications were created
      expect(mockedEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          notificationType: 'CUSTOMER_REVISION_REQUEST',
          certificateId: 'cert-1',
        }),
      )
    })

    it('returns 400 when no feedback notes are provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/cert:cert-1/reject',
        headers: {
          'x-tenant-id': TENANT_ID,
          'x-user-role': 'CUSTOMER',
        },
        payload: {},
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/feedback.*required/i)
    })

    it('returns 404 when certificate does not exist', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(customerUser as any)
      mockedPrisma.certificate.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/cert:cert-1/reject',
        headers: {
          'x-tenant-id': TENANT_ID,
          'x-user-email': 'customer@acme.com',
          'x-user-role': 'CUSTOMER',
        },
        payload: { notes: 'Something is wrong' },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toMatch(/certificate not found/i)
    })

    it('returns 400 when certificate is not in a reviewable status', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(customerUser as any)
      mockedPrisma.certificate.findUnique.mockResolvedValue({
        ...certificate,
        status: 'AUTHORIZED',
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/cert:cert-1/reject',
        headers: {
          'x-tenant-id': TENANT_ID,
          'x-user-email': 'customer@acme.com',
          'x-user-role': 'CUSTOMER',
        },
        payload: { notes: 'Changes needed' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/not available for review/i)
    })

    it('formats structured sectionFeedbacks + generalNotes into notes', async () => {
      mockedPrisma.customerUser.findUnique.mockResolvedValue(customerUser as any)
      mockedPrisma.certificate.findUnique.mockResolvedValue({
        ...certificate,
        reviewer: null,
      } as any)
      mockedPrisma.user.findMany.mockResolvedValue([] as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/cert:cert-1/reject',
        headers: {
          'x-tenant-id': TENANT_ID,
          'x-user-email': 'customer@acme.com',
          'x-user-role': 'CUSTOMER',
        },
        payload: {
          sectionFeedbacks: [
            { section: 'results', comment: 'Values look off' },
          ],
          generalNotes: 'Please double-check',
        },
      })

      expect(res.statusCode).toBe(200)

      // The formatted notes should contain the section label and general notes
      expect((mockedPrisma.certificate as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusNotes: expect.stringContaining('Section 5: Calibration Results'),
          }),
        }),
      )
      expect((mockedPrisma.certificate as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusNotes: expect.stringContaining('General Notes'),
          }),
        }),
      )
    })
  })

  // ────────────────────────────────────────────────────────────────
  // TOKEN-BASED REJECTION  (POST /api/customer/review/<token>/reject)
  // ────────────────────────────────────────────────────────────────

  describe('POST /api/customer/review/:token/reject (token-based)', () => {
    it('requests revision via token — creates revision event', async () => {
      mockedPrisma.approvalToken.findUnique.mockResolvedValue({
        ...tokenRecord,
        certificate: { ...certificate, createdBy: certificate.createdBy, reviewer: { id: 'reviewer-1', name: 'Reviewer' } },
      } as any)
      mockedPrisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }] as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/abc123/reject',
        headers: { 'x-tenant-id': TENANT_ID },
        payload: { notes: 'Measurement data needs correction' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)

      // Certificate updated
      expect((mockedPrisma.certificate as any).update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CUSTOMER_REVISION_REQUIRED',
          }),
        }),
      )

      // Token marked as used
      expect(mockedPrisma.approvalToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-rec-1' },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      )

      // CUSTOMER_REVISION_REQUESTED event logged
      expect(mockedPrisma.certificateEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'CUSTOMER_REVISION_REQUESTED',
          }),
        }),
      )

      // Reviewer notification
      expect(mockedEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'reviewer-1',
          notificationType: 'CUSTOMER_REVISION_REQUEST',
        }),
      )

      // Admin notification
      expect(mockedEnqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          notificationType: 'CUSTOMER_REVISION_REQUEST',
        }),
      )
    })

    it('returns 404 for a nonexistent token', async () => {
      mockedPrisma.approvalToken.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/nonexistent/reject',
        headers: { 'x-tenant-id': TENANT_ID },
        payload: { notes: 'Something' },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error).toMatch(/invalid token/i)
    })

    it('returns 400 when token is already used', async () => {
      mockedPrisma.approvalToken.findUnique.mockResolvedValue({
        ...tokenRecord,
        usedAt: new Date('2026-05-02'),
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/abc123/reject',
        headers: { 'x-tenant-id': TENANT_ID },
        payload: { notes: 'Changes needed' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/already been reviewed/i)
    })

    it('returns 400 when token is expired', async () => {
      mockedPrisma.approvalToken.findUnique.mockResolvedValue({
        ...tokenRecord,
        expiresAt: new Date('2025-01-01'),
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/abc123/reject',
        headers: { 'x-tenant-id': TENANT_ID },
        payload: { notes: 'Changes needed' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/expired/i)
    })

    it('returns 400 when certificate is not in a reviewable status', async () => {
      mockedPrisma.approvalToken.findUnique.mockResolvedValue({
        ...tokenRecord,
        certificate: { ...certificate, status: 'PENDING_ADMIN_AUTHORIZATION' },
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/api/customer/review/abc123/reject',
        headers: { 'x-tenant-id': TENANT_ID },
        payload: { notes: 'Some feedback' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/not available for review/i)
    })
  })
})
