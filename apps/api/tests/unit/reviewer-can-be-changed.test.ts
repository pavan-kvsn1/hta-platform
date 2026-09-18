/**
 * Changing who reviews a certificate.
 *
 * Both write paths used to set the reviewer only when the certificate had none:
 * `reviewerId && !existing.reviewerId` on the update, and the same shape on the submit.
 * So the first save that named a reviewer settled it forever. 37 of the 58 editable
 * certificates in the lab were in that state, and an engineer whose reviewer had left,
 * or gone on leave, or simply been picked by mistake, had no way to reassign - the
 * dropdown changed, the save reported success, and the server discarded it.
 *
 * Nothing else was guarding it. The update route already refuses anyone but the creator
 * or an admin, and refuses any status but DRAFT or REVISION_REQUIRED.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@hta/database', () => {
  const prisma: Record<string, any> = {
    certificate: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    parameter: { deleteMany: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'p-new' }) },
    calibrationResult: { deleteMany: vi.fn(), createMany: vi.fn() },
    certificateMasterInstrument: { deleteMany: vi.fn(), createMany: vi.fn() },
    certificateEvent: { findFirst: vi.fn().mockResolvedValue({ sequenceNumber: 4 }), create: vi.fn() },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  }
  prisma.$transaction = vi.fn((fn: (tx: typeof prisma) => Promise<any>) => fn(prisma))
  return { prisma, Prisma: { DbNull: null } }
})

vi.mock('../../src/middleware/auth.js', () => ({
  requireAuth: vi.fn((_r: any, _y: any, done: any) => done?.()),
  requireStaff: vi.fn((_r: any, _y: any, done: any) => done?.()),
  requireAdmin: vi.fn((_r: any, _y: any, done: any) => done?.()),
}))

vi.mock('../../src/lib/pagination.js', () => ({
  parsePagination: vi.fn(() => ({ page: 1, limit: 15, skip: 0 })),
  paginationResponse: vi.fn(() => ({ page: 1, limit: 15, total: 0, totalPages: 0 })),
}))

vi.mock('../../src/services/index.js', () => ({
  enforceLimit: vi.fn().mockResolvedValue(undefined),
  updateUsageTracking: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/services/queue.js', () => ({
  buildCertificateUucDetails: vi.fn(() => ({})),
  queueCertificateSubmittedEmail: vi.fn().mockResolvedValue(undefined),
  queueCertificateReviewedEmail: vi.fn().mockResolvedValue(undefined),
  queueCustomerReviewEmail: vi.fn().mockResolvedValue(undefined),
  queueCustomerReviewRegisteredEmail: vi.fn().mockResolvedValue(undefined),
  enqueueNotification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/lib/change-detection.js', () => ({
  detectCertificateChanges: vi.fn(() => []),
  generateChangeSummary: vi.fn(() => ''),
}))

vi.mock('../../src/lib/signing-evidence.js', () => ({
  appendSigningEvidence: vi.fn().mockResolvedValue(undefined),
  collectFastifyEvidence: vi.fn(() => ({})),
}))

vi.mock('../../src/lib/activity-audit.js', () => ({
  writeCertificateEditSession: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/routes/certificates/images/index.js', () => ({
  default: async () => {},
}))

import Fastify from 'fastify'
import { prisma } from '@hta/database'
import certificateRoutes from '../../src/routes/certificates/index.js'

const db = vi.mocked(prisma) as any

const ENGINEER = 'eng-1'
const OLD_REVIEWER = 'rev-old'
const NEW_REVIEWER = 'rev-new'

function buildApp() {
  const app = Fastify()
  app.decorateRequest('tenantId', '')
  app.decorateRequest('user', null)
  app.addHook('preHandler', async (req) => {
    req.tenantId = 'tenant-1'
    ;(req as any).user = { sub: ENGINEER, role: 'ENGINEER', email: 'e@hta.test', isAdmin: false }
  })
  app.register(certificateRoutes, { prefix: '/api/certificates' })
  return app
}

const draft = (over: Record<string, unknown> = {}) => ({
  id: 'cert-1',
  tenantId: 'tenant-1',
  status: 'DRAFT',
  createdById: ENGINEER,
  reviewerId: OLD_REVIEWER,
  currentRevision: 1,
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  parameters: [],
  masterInstruments: [],
  ...over,
})

/** The minimum a save carries; the store sends the whole form. */
const save = (over: Record<string, unknown> = {}) => ({
  calibratedAt: 'LAB',
  calibrationStatus: [],
  selectedConclusionStatements: [],
  parameters: [],
  masterInstruments: [],
  ...over,
})

const put = (app: any, payload: Record<string, unknown>) =>
  app.inject({ method: 'PUT', url: '/api/certificates/cert-1', payload })

beforeEach(() => {
  vi.clearAllMocks()
  db.certificate.findFirst.mockResolvedValue(draft())
  db.certificate.update.mockResolvedValue(draft())
  db.certificateEvent.findFirst.mockResolvedValue({ sequenceNumber: 4 })
  db.user.findFirst.mockResolvedValue({ id: NEW_REVIEWER, role: 'ENGINEER' })
})

const dataSent = () => db.certificate.update.mock.calls[0][0].data

describe('changing the reviewer on a draft', () => {
  it('replaces one that was already chosen', async () => {
    const res = await put(buildApp(), save({ reviewerId: NEW_REVIEWER }))
    expect(res.statusCode).toBe(200)
    expect(dataSent().reviewerId).toBe(NEW_REVIEWER)
  })

  it('still sets one where the certificate had none', async () => {
    db.certificate.findFirst.mockResolvedValue(draft({ reviewerId: null }))
    await put(buildApp(), save({ reviewerId: NEW_REVIEWER }))
    expect(dataSent().reviewerId).toBe(NEW_REVIEWER)
  })

  it('leaves the reviewer alone when the save does not mention them', async () => {
    // A save from a screen with no reviewer control must not clear the one chosen.
    await put(buildApp(), save())
    expect(dataSent()).not.toHaveProperty('reviewerId')
  })

  it('clears it when the engineer deselected, which a draft is allowed to be', async () => {
    await put(buildApp(), save({ reviewerId: null }))
    expect(dataSent().reviewerId).toBeNull()
  })

  it('writes nothing when the same reviewer is sent back', async () => {
    await put(buildApp(), save({ reviewerId: OLD_REVIEWER }))
    expect(dataSent()).not.toHaveProperty('reviewerId')
  })
})

describe('who is allowed to be a reviewer', () => {
  it('refuses somebody who is not on the staff', async () => {
    db.user.findFirst.mockResolvedValue(null)
    const res = await put(buildApp(), save({ reviewerId: 'nobody' }))
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/not available/)
  })

  it('refuses a customer', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'cust-1', role: 'CUSTOMER' })
    const res = await put(buildApp(), save({ reviewerId: 'cust-1' }))
    expect(res.statusCode).toBe(400)
  })

  it('refuses the engineer who wrote it', async () => {
    // Nobody reviews their own work, and the route would otherwise accept it.
    db.user.findFirst.mockResolvedValue({ id: ENGINEER, role: 'ENGINEER' })
    const res = await put(buildApp(), save({ reviewerId: ENGINEER }))
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/cannot be reviewed by the engineer who wrote it/)
  })

  it('does not go looking when the reviewer is only being cleared', async () => {
    await put(buildApp(), save({ reviewerId: null }))
    expect(db.user.findFirst).not.toHaveBeenCalled()
  })
})

describe('a reassignment leaves a trace', () => {
  it('is recorded, because it decides who is answerable for the certificate', async () => {
    await put(buildApp(), save({ reviewerId: NEW_REVIEWER }))
    expect(db.certificateEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'REVIEWER_REASSIGNED',
          eventData: JSON.stringify({ from: OLD_REVIEWER, to: NEW_REVIEWER }),
          userId: ENGINEER,
        }),
      }),
    )
  })

  it('writes its data the way every other event on the certificate does', async () => {
    /**
     * As a string, not as an object. The column is Json and takes either, but the
     * screens that read a certificate's history call JSON.parse on it - so an object
     * came back as "[object Object]" and threw on every load of the edit page. Thirteen
     * other events in this route stringify; this one did not.
     */
    await put(buildApp(), save({ reviewerId: NEW_REVIEWER }))
    const { eventData } = db.certificateEvent.create.mock.calls[0][0].data
    expect(typeof eventData).toBe('string')
    expect(JSON.parse(eventData)).toEqual({ from: OLD_REVIEWER, to: NEW_REVIEWER })
  })

  it('follows the events already on the certificate', async () => {
    await put(buildApp(), save({ reviewerId: NEW_REVIEWER }))
    expect(db.certificateEvent.create.mock.calls[0][0].data.sequenceNumber).toBe(5)
  })

  it('records nothing when a first reviewer is simply being chosen', async () => {
    // There is no reassignment to explain, and the submission event says the rest.
    db.certificate.findFirst.mockResolvedValue(draft({ reviewerId: null }))
    await put(buildApp(), save({ reviewerId: NEW_REVIEWER }))
    expect(db.certificateEvent.create).not.toHaveBeenCalled()
  })
})

describe('the guards that were already there', () => {
  it('will not touch a certificate that has left the engineer', async () => {
    db.certificate.findFirst.mockResolvedValue(draft({ status: 'PENDING_REVIEW' }))
    const res = await put(buildApp(), save({ reviewerId: NEW_REVIEWER }))
    expect(res.statusCode).toBe(400)
    expect(db.certificate.update).not.toHaveBeenCalled()
  })

  it('will not let somebody else reassign a reviewer', async () => {
    db.certificate.findFirst.mockResolvedValue(draft({ createdById: 'someone-else' }))
    const res = await put(buildApp(), save({ reviewerId: NEW_REVIEWER }))
    expect(res.statusCode).toBe(403)
  })

  it('still allows it on a certificate sent back for revision', async () => {
    // Where it is most likely to be needed: the reviewer who asked for changes may be
    // the one who is now away.
    db.certificate.findFirst.mockResolvedValue(draft({ status: 'REVISION_REQUIRED' }))
    const res = await put(buildApp(), save({ reviewerId: NEW_REVIEWER }))
    expect(res.statusCode).toBe(200)
    expect(dataSent().reviewerId).toBe(NEW_REVIEWER)
  })
})
