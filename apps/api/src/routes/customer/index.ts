import { FastifyPluginAsync } from 'fastify'
import { prisma, Prisma } from '@hta/database'
import { requireCustomer, optionalAuth } from '../../middleware/auth.js'
import { parsePagination, paginationResponse } from '../../lib/pagination.js'
import bcrypt from 'bcryptjs'
import { queueCustomerApprovalNotificationEmail, enqueueNotification } from '../../services/queue.js'
import { appendSigningEvidence, collectFastifyEvidence } from '../../lib/signing-evidence.js'

// Helper to safely parse JSON strings
function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (!value) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

const customerRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/customer/dashboard - Customer dashboard data
  fastify.get('/dashboard', {
    preHandler: [requireCustomer],
  }, async (request) => {
    const customerEmail = request.user!.email
    const tenantId = request.tenantId

    // Get customer's company name for matching certificates
    const customer = await prisma.customerUser.findUnique({
      where: { tenantId_email: { tenantId, email: customerEmail } },
      include: { customerAccount: true },
    })

    if (!customer) {
      return { error: 'Customer not found' }
    }

    const companyName = customer.customerAccount?.companyName || customer.companyName || ''
    const companyNameLower = companyName.toLowerCase()
    const isPrimaryPoc = customer.customerAccount?.primaryPocId === customer.id

    // Count team members
    const userCount = customer.customerAccount
      ? await prisma.customerUser.count({
          where: { customerAccountId: customer.customerAccount.id }
        })
      : 0

    // Fetch dashboard data in parallel
    const [
      pendingTokens,
      pendingCompanyMatch,
      awaitingCerts,
      completedSignatures,
      authorizedCerts,
      masterInstruments,
    ] = await Promise.all([
      // Pending Review: Certificates with active tokens
      prisma.approvalToken.findMany({
        where: {
          customer: { email: customerEmail },
          usedAt: null,
          expiresAt: { gt: new Date() },
          certificate: { tenantId, status: 'PENDING_CUSTOMER_APPROVAL' },
        },
        include: {
          certificate: {
            include: {
              events: {
                where: { eventType: 'SENT_TO_CUSTOMER' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Pending Review: Company-matched certificates
      prisma.certificate.findMany({
        where: { tenantId, status: 'PENDING_CUSTOMER_APPROVAL' },
        orderBy: { updatedAt: 'desc' },
      }),

      // Awaiting Response
      prisma.certificate.findMany({
        where: {
          tenantId,
          status: { in: ['PENDING_REVIEW', 'CUSTOMER_REVISION_REQUIRED', 'REVISION_REQUIRED'] },
        },
        include: {
          events: {
            where: {
              eventType: { in: ['CUSTOMER_REVISION_REQUESTED', 'ADMIN_REPLIED_TO_CUSTOMER'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 2,
            include: { user: { select: { name: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),

      // Completed: Customer signatures on PENDING_ADMIN_AUTHORIZATION
      prisma.signature.findMany({
        where: {
          signerEmail: customerEmail,
          signerType: 'CUSTOMER',
          certificate: { tenantId, status: 'PENDING_ADMIN_AUTHORIZATION' },
        },
        include: {
          certificate: {
            include: {
              signatures: { select: { signerType: true } },
            },
          },
        },
        orderBy: { signedAt: 'desc' },
      }),

      // Authorized certificates
      prisma.signature.findMany({
        where: {
          signerEmail: customerEmail,
          signerType: 'CUSTOMER',
          certificate: { tenantId, status: { in: ['AUTHORIZED', 'APPROVED'] } },
        },
        include: { certificate: true },
        orderBy: { signedAt: 'desc' },
      }),

      // Master instruments used in customer's certificates
      prisma.certificateMasterInstrument.findMany({
        where: { certificate: { tenantId } },
        include: {
          certificate: {
            select: {
              id: true,
              certificateNumber: true,
              uucDescription: true,
              dateOfCalibration: true,
              customerName: true,
            },
          },
        },
      }),
    ])

    // Process pending review data (deduplicate by certificate ID — multiple tokens may exist across revision cycles)
    const seenPendingIds = new Set<string>()
    const pendingFromTokens: Array<{
      id: string; certificateNumber: string; uucDescription: string | null;
      uucMake: string | null; uucModel: string | null; sentAt: string;
      expiresAt: string | null; tokenId: string | null; hasToken: boolean;
      adminMessage: string | null; srfNumber: string | null; dateOfCalibration: string | null;
    }> = []
    for (const token of pendingTokens) {
      if (seenPendingIds.has(token.certificate.id)) continue
      seenPendingIds.add(token.certificate.id)
      let adminMessage: string | null = null
      if (token.certificate.events[0]) {
        const data = safeJsonParse<Record<string, string>>(token.certificate.events[0].eventData, {})
        adminMessage = data.message || null
      }
      pendingFromTokens.push({
        id: token.certificate.id,
        certificateNumber: token.certificate.certificateNumber,
        uucDescription: token.certificate.uucDescription,
        uucMake: token.certificate.uucMake,
        uucModel: token.certificate.uucModel,
        sentAt: token.createdAt.toISOString(),
        expiresAt: token.expiresAt.toISOString(),
        tokenId: token.token,
        hasToken: true,
        adminMessage,
        srfNumber: token.certificate.srfNumber,
        dateOfCalibration: token.certificate.dateOfCalibration?.toISOString() || null,
      })
    }
    const pending = [
      ...pendingFromTokens,
      ...pendingCompanyMatch
        .filter((cert: (typeof pendingCompanyMatch)[number]) =>
          !seenPendingIds.has(cert.id) &&
          cert.customerName?.toLowerCase() === companyNameLower
        )
        .map((cert: (typeof pendingCompanyMatch)[number]) => ({
          id: cert.id,
          certificateNumber: cert.certificateNumber,
          uucDescription: cert.uucDescription,
          uucMake: cert.uucMake,
          uucModel: cert.uucModel,
          sentAt: cert.updatedAt.toISOString(),
          expiresAt: null,
          tokenId: null,
          hasToken: false,
          adminMessage: null,
          srfNumber: cert.srfNumber,
          dateOfCalibration: cert.dateOfCalibration?.toISOString() || null,
        })),
    ]

    // Process awaiting response data
    const awaiting = awaitingCerts
      .filter((cert: (typeof awaitingCerts)[number]) => cert.customerName?.toLowerCase() === companyNameLower)
      .map((cert: (typeof awaitingCerts)[number]) => {
        const customerEvent = cert.events.find((e: (typeof cert.events)[number]) => e.eventType === 'CUSTOMER_REVISION_REQUESTED')
        const adminEvent = cert.events.find((e: (typeof cert.events)[number]) => e.eventType === 'ADMIN_REPLIED_TO_CUSTOMER')

        let customerFeedback: string | null = null
        let feedbackDate: string | null = null
        let adminResponse: string | null = null
        let adminName: string | null = null
        let respondedAt: string | null = null

        if (customerEvent) {
          const data = safeJsonParse<Record<string, string>>(customerEvent.eventData, {})
          customerFeedback = data.notes || data.feedback || null
          feedbackDate = customerEvent.createdAt.toISOString()
        }

        if (adminEvent) {
          const data = safeJsonParse<Record<string, string>>(adminEvent.eventData, {})
          adminResponse = data.response || null
          adminName = adminEvent.user?.name || null
          respondedAt = adminEvent.createdAt.toISOString()
        }

        return {
          id: cert.id,
          certificateNumber: cert.certificateNumber,
          uucDescription: cert.uucDescription,
          uucMake: cert.uucMake,
          uucModel: cert.uucModel,
          updatedAt: cert.updatedAt.toISOString(),
          internalStatus: cert.status,
          customerFeedback,
          feedbackDate,
          adminResponse,
          adminName,
          respondedAt,
        }
      })

    // Process completed data (deduplicate by certificate ID, keep latest signature)
    const completedMap = new Map<string, (typeof completedSignatures)[number]>()
    for (const sig of completedSignatures) {
      if (!completedMap.has(sig.certificate.id)) {
        completedMap.set(sig.certificate.id, sig)
      }
    }
    const completed = Array.from(completedMap.values()).map((sig) => {
      const sigTypes = sig.certificate.signatures.map((s: (typeof sig.certificate.signatures)[number]) => s.signerType)
      return {
        id: sig.certificate.id,
        certificateNumber: sig.certificate.certificateNumber,
        uucDescription: sig.certificate.uucDescription,
        uucMake: sig.certificate.uucMake,
        uucModel: sig.certificate.uucModel,
        signedAt: sig.signedAt.toISOString(),
        signerName: sig.signerName,
        hasEngineerSig: sigTypes.includes('ASSIGNEE'),
        hasReviewerSig: sigTypes.includes('REVIEWER'),
        hasCustomerSig: sigTypes.includes('CUSTOMER'),
        hasAdminSig: sigTypes.includes('ADMIN'),
      }
    })

    // Process authorized data (deduplicate by certificate ID)
    const authorizedMap = new Map<string, (typeof authorizedCerts)[number]>()
    for (const sig of authorizedCerts) {
      if (!authorizedMap.has(sig.certificate.id)) {
        authorizedMap.set(sig.certificate.id, sig)
      }
    }
    const authorized = Array.from(authorizedMap.values()).map((sig) => ({
      id: sig.certificate.id,
      certificateNumber: sig.certificate.certificateNumber,
      uucDescription: sig.certificate.uucDescription,
      uucMake: sig.certificate.uucMake,
      uucModel: sig.certificate.uucModel,
      dateOfCalibration: sig.certificate.dateOfCalibration?.toISOString() || null,
      calibrationDueDate: sig.certificate.calibrationDueDate?.toISOString() || null,
      signedPdfPath: sig.certificate.signedPdfPath,
    }))

    // Process traceability data
    const filteredMasterInstruments = masterInstruments.filter(
      (cmi: (typeof masterInstruments)[number]) => cmi.certificate.customerName?.toLowerCase() === companyNameLower
    )

    const instrumentMap = new Map<string, {
      id: string
      description: string
      serialNumber: string | null
      category: string | null
      make: string | null
      model: string | null
      reportNo: string | null
      calibrationDueDate: string | null
      calibratedAt: string | null
      certificatesUsedIn: {
        id: string
        certificateNumber: string
        uucDescription: string | null
        dateOfCalibration: string | null
      }[]
    }>()

    for (const cmi of filteredMasterInstruments) {
      const key = cmi.masterInstrumentId
      if (!instrumentMap.has(key)) {
        instrumentMap.set(key, {
          id: key,
          description: cmi.description || 'Unknown Instrument',
          serialNumber: cmi.serialNumber,
          category: cmi.category,
          make: cmi.make,
          model: cmi.model,
          reportNo: cmi.reportNo,
          calibrationDueDate: cmi.calibrationDueDate,
          calibratedAt: cmi.calibratedAt,
          certificatesUsedIn: [],
        })
      }
      instrumentMap.get(key)!.certificatesUsedIn.push({
        id: cmi.certificate.id,
        certificateNumber: cmi.certificate.certificateNumber,
        uucDescription: cmi.certificate.uucDescription,
        dateOfCalibration: cmi.certificate.dateOfCalibration?.toISOString() || null,
      })
    }

    const traceability = Array.from(instrumentMap.values())

    return {
      counts: {
        pending: pending.length,
        awaiting: awaiting.length,
        completed: completed.length,
        authorized: authorized.length,
        traceability: traceability.length,
      },
      pending,
      awaiting,
      completed,
      authorized,
      traceability,
      isPrimaryPoc,
      companyName,
      userCount,
    }
  })

  // --- Paginated dashboard endpoints ---

  // Helper: get customer context (email, tenantId, companyName)
  async function getCustomerContext(request: { user: { email: string; sub: string } | null; tenantId: string }) {
    const customerEmail = request.user!.email
    const tenantId = request.tenantId
    const customer = await prisma.customerUser.findUnique({
      where: { tenantId_email: { tenantId, email: customerEmail } },
      include: { customerAccount: true },
    })
    if (!customer) return null
    const companyName = customer.customerAccount?.companyName || customer.companyName || ''
    return { customerEmail, tenantId, companyName, customer }
  }

  // GET /api/customer/dashboard/counts
  fastify.get('/dashboard/counts', {
    preHandler: [requireCustomer],
  }, async (request) => {
    const ctx = await getCustomerContext(request as Parameters<typeof getCustomerContext>[0])
    if (!ctx) return { error: 'Customer not found' }
    const { customerEmail, tenantId, companyName, customer } = ctx

    const [pending, awaiting, completed, authorized, userCount] = await Promise.all([
      prisma.certificate.count({
        where: {
          tenantId,
          status: 'PENDING_CUSTOMER_APPROVAL',
          OR: [
            { approvalTokens: { some: { customer: { email: customerEmail }, usedAt: null, expiresAt: { gt: new Date() } } } },
            { customerName: { equals: companyName, mode: 'insensitive' } },
          ],
        },
      }),
      prisma.certificate.count({
        where: {
          tenantId,
          status: { in: ['PENDING_REVIEW', 'CUSTOMER_REVISION_REQUIRED', 'REVISION_REQUIRED'] },
          customerName: { equals: companyName, mode: 'insensitive' },
        },
      }),
      prisma.certificate.count({
        where: {
          tenantId,
          status: 'PENDING_ADMIN_AUTHORIZATION',
          signatures: { some: { signerEmail: customerEmail, signerType: 'CUSTOMER' } },
        },
      }),
      prisma.certificate.count({
        where: {
          tenantId,
          status: { in: ['AUTHORIZED', 'APPROVED'] },
          signatures: { some: { signerEmail: customerEmail, signerType: 'CUSTOMER' } },
        },
      }),
      customer.customerAccount
        ? prisma.customerUser.count({ where: { customerAccountId: customer.customerAccount.id } })
        : Promise.resolve(0),
    ])

    return {
      counts: { pending, awaiting, completed, authorized },
      isPrimaryPoc: customer.customerAccount?.primaryPocId === customer.id,
      companyName,
      userCount,
    }
  })

  // GET /api/customer/dashboard/pending
  fastify.get('/dashboard/pending', {
    preHandler: [requireCustomer],
  }, async (request) => {
    const ctx = await getCustomerContext(request as Parameters<typeof getCustomerContext>[0])
    if (!ctx) return { error: 'Customer not found' }
    const { customerEmail, tenantId, companyName } = ctx
    const query = request.query as { page?: string; limit?: string; search?: string; sort?: string }
    const { page, limit, skip } = parsePagination(query)

    const baseWhere: Prisma.CertificateWhereInput = {
      tenantId,
      status: 'PENDING_CUSTOMER_APPROVAL',
      OR: [
        { approvalTokens: { some: { customer: { email: customerEmail }, usedAt: null, expiresAt: { gt: new Date() } } } },
        { customerName: { equals: companyName, mode: 'insensitive' } },
      ],
    }

    if (query.search) {
      baseWhere.AND = [{
        OR: [
          { certificateNumber: { contains: query.search, mode: 'insensitive' } },
          { uucDescription: { contains: query.search, mode: 'insensitive' } },
          { uucMake: { contains: query.search, mode: 'insensitive' } },
        ],
      }]
    }

    const orderBy: Prisma.CertificateOrderByWithRelationInput =
      query.sort === 'oldest' ? { updatedAt: 'asc' } : { updatedAt: 'desc' }

    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        where: baseWhere,
        include: {
          approvalTokens: {
            where: { customer: { email: customerEmail }, usedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          events: {
            where: { eventType: 'SENT_TO_CUSTOMER' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.certificate.count({ where: baseWhere }),
    ])

    return {
      items: certificates.map((cert) => {
        const token = cert.approvalTokens[0]
        let adminMessage: string | null = null
        if (cert.events[0]) {
          const data = safeJsonParse<Record<string, string>>(cert.events[0].eventData, {})
          adminMessage = data.message || null
        }
        return {
          id: cert.id,
          certificateNumber: cert.certificateNumber,
          uucDescription: cert.uucDescription,
          uucMake: cert.uucMake,
          uucModel: cert.uucModel,
          sentAt: token?.createdAt.toISOString() || cert.updatedAt.toISOString(),
          expiresAt: token?.expiresAt.toISOString() || null,
          tokenId: token?.token || null,
          hasToken: !!token,
          adminMessage,
          srfNumber: cert.srfNumber,
          dateOfCalibration: cert.dateOfCalibration?.toISOString() || null,
        }
      }),
      pagination: paginationResponse(page, limit, total),
    }
  })

  // GET /api/customer/dashboard/awaiting
  fastify.get('/dashboard/awaiting', {
    preHandler: [requireCustomer],
  }, async (request) => {
    const ctx = await getCustomerContext(request as Parameters<typeof getCustomerContext>[0])
    if (!ctx) return { error: 'Customer not found' }
    const { tenantId, companyName } = ctx
    const query = request.query as { page?: string; limit?: string; search?: string; sort?: string }
    const { page, limit, skip } = parsePagination(query)

    const where: Prisma.CertificateWhereInput = {
      tenantId,
      status: { in: ['PENDING_REVIEW', 'CUSTOMER_REVISION_REQUIRED', 'REVISION_REQUIRED'] },
      customerName: { equals: companyName, mode: 'insensitive' },
    }

    if (query.search) {
      where.AND = [{
        OR: [
          { certificateNumber: { contains: query.search, mode: 'insensitive' } },
          { uucDescription: { contains: query.search, mode: 'insensitive' } },
          { uucMake: { contains: query.search, mode: 'insensitive' } },
        ],
      }]
    }

    const orderBy: Prisma.CertificateOrderByWithRelationInput =
      query.sort === 'oldest' ? { updatedAt: 'asc' }
        : query.sort === 'status' ? { status: 'asc' }
        : { updatedAt: 'desc' }

    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        include: {
          events: {
            where: { eventType: { in: ['CUSTOMER_REVISION_REQUESTED', 'ADMIN_REPLIED_TO_CUSTOMER'] } },
            orderBy: { createdAt: 'desc' },
            take: 2,
            include: { user: { select: { name: true } } },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.certificate.count({ where }),
    ])

    return {
      items: certificates.map((cert) => {
        const customerEvent = cert.events.find((e) => e.eventType === 'CUSTOMER_REVISION_REQUESTED')
        const adminEvent = cert.events.find((e) => e.eventType === 'ADMIN_REPLIED_TO_CUSTOMER')
        let customerFeedback: string | null = null
        let feedbackDate: string | null = null
        let adminResponse: string | null = null
        let adminName: string | null = null
        let respondedAt: string | null = null
        if (customerEvent) {
          const data = safeJsonParse<Record<string, string>>(customerEvent.eventData, {})
          customerFeedback = data.notes || data.feedback || null
          feedbackDate = customerEvent.createdAt.toISOString()
        }
        if (adminEvent) {
          const data = safeJsonParse<Record<string, string>>(adminEvent.eventData, {})
          adminResponse = data.response || null
          adminName = adminEvent.user?.name || null
          respondedAt = adminEvent.createdAt.toISOString()
        }
        return {
          id: cert.id,
          certificateNumber: cert.certificateNumber,
          uucDescription: cert.uucDescription,
          uucMake: cert.uucMake,
          uucModel: cert.uucModel,
          updatedAt: cert.updatedAt.toISOString(),
          internalStatus: cert.status,
          customerFeedback,
          feedbackDate,
          adminResponse,
          adminName,
          respondedAt,
        }
      }),
      pagination: paginationResponse(page, limit, total),
    }
  })

  // GET /api/customer/dashboard/completed
  fastify.get('/dashboard/completed', {
    preHandler: [requireCustomer],
  }, async (request) => {
    const ctx = await getCustomerContext(request as Parameters<typeof getCustomerContext>[0])
    if (!ctx) return { error: 'Customer not found' }
    const { customerEmail, tenantId } = ctx
    const query = request.query as { page?: string; limit?: string; search?: string; sort?: string }
    const { page, limit, skip } = parsePagination(query)

    const where: Prisma.CertificateWhereInput = {
      tenantId,
      status: 'PENDING_ADMIN_AUTHORIZATION',
      signatures: { some: { signerEmail: customerEmail, signerType: 'CUSTOMER' } },
    }

    if (query.search) {
      where.AND = [{
        OR: [
          { certificateNumber: { contains: query.search, mode: 'insensitive' } },
          { uucDescription: { contains: query.search, mode: 'insensitive' } },
          { uucMake: { contains: query.search, mode: 'insensitive' } },
        ],
      }]
    }

    const orderBy: Prisma.CertificateOrderByWithRelationInput =
      query.sort === 'oldest' ? { updatedAt: 'asc' } : { updatedAt: 'desc' }

    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        include: {
          signatures: {
            where: { signerEmail: customerEmail, signerType: 'CUSTOMER' },
            orderBy: { signedAt: 'desc' },
            take: 1,
          },
          _count: { select: { signatures: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.certificate.count({ where }),
    ])

    // Get all signature types for these certificates in one query
    const certIds = certificates.map(c => c.id)
    const allSigs = certIds.length > 0 ? await prisma.signature.findMany({
      where: { certificateId: { in: certIds } },
      select: { certificateId: true, signerType: true },
    }) : []
    const sigsByCert = new Map<string, string[]>()
    for (const s of allSigs) {
      const types = sigsByCert.get(s.certificateId) || []
      types.push(s.signerType)
      sigsByCert.set(s.certificateId, types)
    }

    return {
      items: certificates.map((cert) => {
        const customerSig = cert.signatures[0]
        const sigTypes = sigsByCert.get(cert.id) || []
        return {
          id: cert.id,
          certificateNumber: cert.certificateNumber,
          uucDescription: cert.uucDescription,
          uucMake: cert.uucMake,
          uucModel: cert.uucModel,
          signedAt: customerSig?.signedAt.toISOString() || cert.updatedAt.toISOString(),
          signerName: customerSig?.signerName || '',
          hasEngineerSig: sigTypes.includes('ASSIGNEE'),
          hasReviewerSig: sigTypes.includes('REVIEWER'),
          hasCustomerSig: sigTypes.includes('CUSTOMER'),
          hasAdminSig: sigTypes.includes('ADMIN'),
        }
      }),
      pagination: paginationResponse(page, limit, total),
    }
  })

  // GET /api/customer/dashboard/authorized
  fastify.get('/dashboard/authorized', {
    preHandler: [requireCustomer],
  }, async (request) => {
    const ctx = await getCustomerContext(request as Parameters<typeof getCustomerContext>[0])
    if (!ctx) return { error: 'Customer not found' }
    const { customerEmail, tenantId } = ctx
    const query = request.query as { page?: string; limit?: string; search?: string; sort?: string; year?: string }
    const { page, limit, skip } = parsePagination(query)

    const where: Prisma.CertificateWhereInput = {
      tenantId,
      status: { in: ['AUTHORIZED', 'APPROVED'] },
      signatures: { some: { signerEmail: customerEmail, signerType: 'CUSTOMER' } },
    }

    if (query.year) {
      const year = parseInt(query.year)
      where.dateOfCalibration = {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      }
    }

    if (query.search) {
      where.AND = [{
        OR: [
          { certificateNumber: { contains: query.search, mode: 'insensitive' } },
          { uucDescription: { contains: query.search, mode: 'insensitive' } },
          { uucMake: { contains: query.search, mode: 'insensitive' } },
        ],
      }]
    }

    const orderBy: Prisma.CertificateOrderByWithRelationInput =
      query.sort === 'oldest' ? { dateOfCalibration: 'asc' }
        : query.sort === 'due' ? { calibrationDueDate: 'asc' }
        : { dateOfCalibration: 'desc' }

    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.certificate.count({ where }),
    ])

    return {
      items: certificates.map((cert) => ({
        id: cert.id,
        certificateNumber: cert.certificateNumber,
        uucDescription: cert.uucDescription,
        uucMake: cert.uucMake,
        uucModel: cert.uucModel,
        dateOfCalibration: cert.dateOfCalibration?.toISOString() || null,
        calibrationDueDate: cert.calibrationDueDate?.toISOString() || null,
        signedPdfPath: cert.signedPdfPath,
      })),
      pagination: paginationResponse(page, limit, total),
    }
  })

  // TODO: The old /dashboard endpoint above can be deprecated once all frontends use the new paginated endpoints

  // POST /api/customer/register - Submit customer registration
  fastify.post('/register', async (request, reply) => {
    const tenantId = request.tenantId
    const body = request.body as {
      name: string
      email: string
      password: string
      customerAccountId: string
    }

    // Validate required fields
    if (!body.name?.trim() || !body.email?.trim() || !body.password || !body.customerAccountId) {
      return reply.status(400).send({
        error: 'Name, email, password, and company are required',
      })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return reply.status(400).send({ error: 'Invalid email format' })
    }

    // Validate password strength
    if (body.password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' })
    }

    // Check if customer account exists and is active
    const customerAccount = await prisma.customerAccount.findUnique({
      where: { id: body.customerAccountId },
    })

    if (!customerAccount || !customerAccount.isActive) {
      return reply.status(400).send({ error: 'Invalid company selected' })
    }

    // Check if email is already registered
    const existingUser = await prisma.customerUser.findUnique({
      where: { tenantId_email: { tenantId, email: body.email.toLowerCase() } },
    })

    if (existingUser) {
      return reply.status(400).send({ error: 'An account with this email already exists' })
    }

    // Check for pending registration
    const existingRegistration = await prisma.customerRegistration.findFirst({
      where: {
        email: body.email.toLowerCase(),
        status: 'PENDING',
      },
    })

    if (existingRegistration) {
      return reply.status(400).send({ error: 'A registration request for this email is already pending' })
    }

    // Hash password and create registration
    const passwordHash = await bcrypt.hash(body.password, 12)

    const registration = await prisma.customerRegistration.create({
      data: {
        name: body.name.trim(),
        email: body.email.toLowerCase().trim(),
        passwordHash,
        customerAccountId: body.customerAccountId,
        status: 'PENDING',
      },
    })

    return {
      success: true,
      message: 'Registration submitted successfully. An administrator will review your request.',
      registrationId: registration.id,
    }
  })

  // GET /api/customer/register/companies - List available companies for registration
  fastify.get('/register/companies', async (request) => {
    const tenantId = request.tenantId

    const accounts = await prisma.customerAccount.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        companyName: true,
      },
      orderBy: { companyName: 'asc' },
    })

    return { companies: accounts }
  })

  // GET /api/customer/activate - Validate activation token
  fastify.get('/activate', async (request, reply) => {
    const query = request.query as { token?: string }

    if (!query.token) {
      return reply.status(400).send({ error: 'Activation token is required' })
    }

    const user = await prisma.customerUser.findUnique({
      where: { activationToken: query.token },
      include: {
        customerAccount: {
          select: { id: true, companyName: true },
        },
      },
    })

    if (!user) {
      return reply.status(400).send({ error: 'Invalid activation token' })
    }

    if (user.isActive) {
      return reply.status(400).send({ error: 'Account has already been activated' })
    }

    if (user.activationExpiry && user.activationExpiry < new Date()) {
      return reply.status(400).send({ error: 'Activation token has expired. Please contact your administrator.' })
    }

    return {
      valid: true,
      user: {
        name: user.name,
        email: user.email,
        companyName: user.customerAccount?.companyName,
      },
    }
  })

  // POST /api/customer/activate - Activate account with password
  fastify.post('/activate', async (request, reply) => {
    const body = request.body as { token: string; password: string }

    if (!body.token) {
      return reply.status(400).send({ error: 'Activation token is required' })
    }

    if (!body.password) {
      return reply.status(400).send({ error: 'Password is required' })
    }

    // Validate password strength
    if (body.password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' })
    }

    if (!/[A-Z]/.test(body.password)) {
      return reply.status(400).send({ error: 'Password must contain at least one uppercase letter' })
    }

    if (!/[0-9]/.test(body.password)) {
      return reply.status(400).send({ error: 'Password must contain at least one number' })
    }

    const user = await prisma.customerUser.findUnique({
      where: { activationToken: body.token },
      include: {
        customerAccount: { select: { id: true, companyName: true } },
      },
    })

    if (!user) {
      return reply.status(400).send({ error: 'Invalid activation token' })
    }

    if (user.isActive) {
      return reply.status(400).send({ error: 'Account has already been activated' })
    }

    if (user.activationExpiry && user.activationExpiry < new Date()) {
      return reply.status(400).send({ error: 'Activation token has expired. Please contact your administrator.' })
    }

    // Hash password and activate
    const passwordHash = await bcrypt.hash(body.password, 12)

    await prisma.customerUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
        isActive: true,
        activatedAt: new Date(),
        activationToken: null,
        activationExpiry: null,
      },
    })

    return {
      success: true,
      message: 'Account activated successfully. You can now log in.',
      user: {
        name: user.name,
        email: user.email,
        companyName: user.customerAccount?.companyName,
      },
    }
  })

  // GET /api/customer/team - Get team members (with optional pagination)
  fastify.get('/team', {
    preHandler: [requireCustomer],
  }, async (request, reply) => {
    const user = request.user!
    const query = request.query as { page?: string; limit?: string; search?: string }

    // Get customer account ID from user session or lookup
    const customer = await prisma.customerUser.findUnique({
      where: { id: user.sub },
      include: { customerAccount: true },
    })

    if (!customer?.customerAccountId) {
      return reply.status(400).send({ error: 'No customer account found' })
    }

    const accountId = customer.customerAccountId

    // Get account info + primary POC
    const customerAccount = await prisma.customerAccount.findUnique({
      where: { id: accountId },
      include: {
        primaryPoc: {
          select: { id: true, name: true, email: true, isActive: true, activatedAt: true, createdAt: true },
        },
      },
    })

    if (!customerAccount) {
      return reply.status(404).send({ error: 'Customer account not found' })
    }

    // Get pending requests
    const pendingRequests = await prisma.customerRequest.findMany({
      where: {
        customerAccountId: accountId,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    })

    const baseResponse = {
      account: {
        id: customerAccount.id,
        companyName: customerAccount.companyName,
        primaryPocId: customerAccount.primaryPocId,
      },
      primaryPoc: customerAccount.primaryPoc,
      pendingRequests: pendingRequests.map((req: (typeof pendingRequests)[number]) => ({
        id: req.id,
        type: req.type,
        data: JSON.parse(req.data),
        createdAt: req.createdAt,
      })),
      currentUserId: user.sub,
      isPrimaryPoc: customerAccount.primaryPocId === user.sub,
    }

    // Paginated path (when page param is provided)
    if (query.page) {
      const { page, limit, skip } = parsePagination(query)

      const userWhere: Prisma.CustomerUserWhereInput = {
        customerAccountId: accountId,
      }
      if (query.search) {
        userWhere.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ]
      }

      const [users, totalUsers] = await Promise.all([
        prisma.customerUser.findMany({
          where: userWhere,
          select: { id: true, name: true, email: true, isActive: true, activatedAt: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          skip,
          take: limit,
        }),
        prisma.customerUser.count({ where: userWhere }),
      ])

      return {
        ...baseResponse,
        users,
        pagination: paginationResponse(page, limit, totalUsers),
      }
    }

    // Full list path (backward compatible for settings/change-poc pages)
    const users = await prisma.customerUser.findMany({
      where: { customerAccountId: accountId },
      select: { id: true, name: true, email: true, isActive: true, activatedAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    return {
      ...baseResponse,
      users,
    }
  })

  // GET /api/customer/review/:token/certificate - Get certificate for review
  fastify.get<{ Params: { token: string } }>('/review/:token/certificate', {
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { token } = request.params

    // Session-based access (cert:ID format)
    if (token.startsWith('cert:')) {
      const certificateId = token.substring(5)

      if (!request.user || request.user.role !== 'CUSTOMER') {
        return reply.status(401).send({ error: 'Unauthorized - please log in' })
      }

      const tenantId = request.tenantId
      const customer = await prisma.customerUser.findUnique({
        where: { tenantId_email: { tenantId, email: request.user.email } },
        include: { customerAccount: true },
      })

      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found' })
      }

      const certificate = await prisma.certificate.findUnique({
        where: { id: certificateId },
      })

      if (!certificate) {
        return reply.status(404).send({ error: 'Certificate not found' })
      }

      // Verify access
      const customerCompanyName = customer.customerAccount?.companyName || customer.companyName
      if (!customerCompanyName || certificate.customerName?.toLowerCase() !== customerCompanyName.toLowerCase()) {
        return reply.status(403).send({ error: 'You do not have permission to view this certificate' })
      }

      const allowedStatuses = [
        'PENDING_CUSTOMER_APPROVAL',
        'CUSTOMER_REVISION_REQUIRED',
        'REVISION_REQUIRED',
        'APPROVED',
        'PENDING_ADMIN_AUTHORIZATION',
        'PENDING_ADMIN_APPROVAL',
        'AUTHORIZED',
      ]
      if (!allowedStatuses.includes(certificate.status)) {
        return reply.status(400).send({ error: 'Certificate is not available for review' })
      }

      return getFullCertificateData(certificateId)
    }

    // Token-based access
    const tokenRecord = await prisma.approvalToken.findUnique({
      where: { token },
      include: { customer: true },
    })

    if (!tokenRecord) {
      return reply.status(404).send({ error: 'Invalid token' })
    }

    if (tokenRecord.usedAt) {
      return reply.status(400).send({ error: 'This certificate has already been reviewed' })
    }

    if (new Date() > tokenRecord.expiresAt) {
      return reply.status(400).send({ error: 'This review link has expired' })
    }

    return getFullCertificateData(tokenRecord.certificateId)
  })

  // POST /api/customer/review/:token/approve - Approve certificate
  fastify.post<{ Params: { token: string } }>('/review/:token/approve', {
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { token } = request.params
    const body = request.body as {
      signatureData: string
      signerName: string
      signerEmail?: string
    }

    if (!body.signatureData || !body.signerName) {
      return reply.status(400).send({ error: 'Signature and name are required' })
    }

    // Session-based approval
    if (token.startsWith('cert:')) {
      const certificateId = token.substring(5)

      if (!request.user || request.user.role !== 'CUSTOMER') {
        return reply.status(401).send({ error: 'Unauthorized - please log in' })
      }

      const tenantId = request.tenantId
      const customer = await prisma.customerUser.findUnique({
        where: { tenantId_email: { tenantId, email: request.user.email } },
        include: { customerAccount: true },
      })

      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found' })
      }

      const certificate = await prisma.certificate.findUnique({
        where: { id: certificateId },
        include: { createdBy: true },
      })

      if (!certificate) {
        return reply.status(404).send({ error: 'Certificate not found' })
      }

      // Verify access
      const customerCompanyName = customer.customerAccount?.companyName || customer.companyName
      if (!customerCompanyName || certificate.customerName?.toLowerCase() !== customerCompanyName.toLowerCase()) {
        return reply.status(403).send({ error: 'You do not have permission to approve this certificate' })
      }

      if (certificate.status !== 'PENDING_CUSTOMER_APPROVAL' && certificate.status !== 'CUSTOMER_REVISION_REQUIRED') {
        return reply.status(400).send({ error: 'Certificate is not available for approval' })
      }

      // Validate signer name
      if (customer.name && body.signerName.trim().toLowerCase() !== customer.name.toLowerCase()) {
        return reply.status(400).send({ error: 'Signer name must match your registered name' })
      }

      const now = new Date()

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Create signature
        const customerSig = await tx.signature.create({
          data: {
            certificateId: certificate.id,
            signerType: 'CUSTOMER',
            signerName: body.signerName,
            signerEmail: body.signerEmail || request.user!.email,
            signatureData: body.signatureData,
            customerId: customer.id,
          },
        })

        // Record signing evidence
        await appendSigningEvidence(tx, {
          certificateId: certificate.id,
          signatureId: customerSig.id,
          eventType: 'CUSTOMER_SIGNED',
          revision: certificate.currentRevision,
          evidence: collectFastifyEvidence(request, {
            signerType: 'CUSTOMER',
            signerName: body.signerName,
            signerEmail: body.signerEmail || request.user!.email,
            sessionMethod: 'session',
          }),
        })

        // Update certificate status
        await tx.certificate.update({
          where: { id: certificate.id },
          data: {
            status: 'PENDING_ADMIN_AUTHORIZATION',
            updatedAt: now,
          },
        })

        // Invalidate all active approval tokens for this certificate
        await tx.approvalToken.updateMany({
          where: {
            certificateId: certificate.id,
            usedAt: null,
          },
          data: { usedAt: now },
        })

        // Log event
        const lastEvent = await tx.certificateEvent.findFirst({
          where: { certificateId: certificate.id },
          orderBy: { sequenceNumber: 'desc' },
        })

        await tx.certificateEvent.create({
          data: {
            certificateId: certificate.id,
            sequenceNumber: (lastEvent?.sequenceNumber || 0) + 1,
            revision: certificate.currentRevision,
            eventType: 'CUSTOMER_APPROVED',
            eventData: JSON.stringify({
              signerName: body.signerName,
              signerEmail: body.signerEmail || request.user!.email,
              customerCompany: customer.companyName,
              approvedAt: now.toISOString(),
              accessMethod: 'session',
            }),
            customerId: customer.id,
            userRole: 'CUSTOMER',
          },
        })
      })

      // Notify the engineer/creator (email + notification)
      const certNum = certificate.certificateNumber || `CERT-${certificate.id.substring(0, 8)}`
      if (certificate.createdBy) {
        queueCustomerApprovalNotificationEmail({
          staffEmail: certificate.createdBy.email,
          staffName: certificate.createdBy.name,
          certificateNumber: certNum,
          customerName: customer.name || customer.companyName || 'Customer',
          approved: true,
        }).catch(() => {})

        enqueueNotification({
          type: 'create-notification',
          userId: certificate.createdBy.id,
          notificationType: 'CERTIFICATE_FINALIZED',
          certificateId: certificate.id,
          data: { certificateNumber: certNum },
        }).catch(() => {})
      }

      // Notify reviewer
      if (certificate.reviewerId) {
        enqueueNotification({
          type: 'create-notification',
          userId: certificate.reviewerId,
          notificationType: 'CUSTOMER_APPROVED',
          certificateId: certificate.id,
          data: { certificateNumber: certNum },
        }).catch(() => {})
      }

      // Notify all admins
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true, tenantId },
        select: { id: true },
      })
      for (const admin of admins) {
        enqueueNotification({
          type: 'create-notification',
          userId: admin.id,
          notificationType: 'CUSTOMER_APPROVED',
          certificateId: certificate.id,
          data: { certificateNumber: certNum },
        }).catch(() => {})
      }

      return { success: true, message: 'Certificate approved successfully' }
    }

    // Token-based approval
    const tokenRecord = await prisma.approvalToken.findUnique({
      where: { token },
      include: {
        certificate: { include: { createdBy: true } },
        customer: true,
      },
    })

    if (!tokenRecord) {
      return reply.status(404).send({ error: 'Invalid token' })
    }

    if (tokenRecord.usedAt) {
      return reply.status(400).send({ error: 'This certificate has already been reviewed' })
    }

    if (new Date() > tokenRecord.expiresAt) {
      return reply.status(400).send({ error: 'This review link has expired' })
    }

    if (tokenRecord.certificate.status !== 'PENDING_CUSTOMER_APPROVAL' && tokenRecord.certificate.status !== 'CUSTOMER_REVISION_REQUIRED') {
      return reply.status(400).send({ error: 'Certificate is not available for approval' })
    }

    // Validate signer name
    if (tokenRecord.customer.name && body.signerName.trim().toLowerCase() !== tokenRecord.customer.name.toLowerCase()) {
      return reply.status(400).send({ error: 'Signer name must match your registered name' })
    }

    const now = new Date()

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create signature
      const customerSig = await tx.signature.create({
        data: {
          certificateId: tokenRecord.certificateId,
          signerType: 'CUSTOMER',
          signerName: body.signerName,
          signerEmail: body.signerEmail || tokenRecord.customer.email,
          signatureData: body.signatureData,
          customerId: tokenRecord.customerId,
        },
      })

      // Record signing evidence
      await appendSigningEvidence(tx, {
        certificateId: tokenRecord.certificateId,
        signatureId: customerSig.id,
        eventType: 'CUSTOMER_SIGNED',
        revision: tokenRecord.certificate.currentRevision,
        evidence: collectFastifyEvidence(request, {
          signerType: 'CUSTOMER',
          signerName: body.signerName,
          signerEmail: body.signerEmail || tokenRecord.customer.email,
          sessionMethod: 'token',
        }),
      })

      // Update certificate status
      await tx.certificate.update({
        where: { id: tokenRecord.certificateId },
        data: {
          status: 'PENDING_ADMIN_AUTHORIZATION',
          updatedAt: now,
        },
      })

      // Mark token as used
      await tx.approvalToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: now },
      })

      // Log event
      const lastEvent = await tx.certificateEvent.findFirst({
        where: { certificateId: tokenRecord.certificateId },
        orderBy: { sequenceNumber: 'desc' },
      })

      await tx.certificateEvent.create({
        data: {
          certificateId: tokenRecord.certificateId,
          sequenceNumber: (lastEvent?.sequenceNumber || 0) + 1,
          revision: tokenRecord.certificate.currentRevision,
          eventType: 'CUSTOMER_APPROVED',
          eventData: JSON.stringify({
            signerName: body.signerName,
            signerEmail: body.signerEmail || tokenRecord.customer.email,
            customerCompany: tokenRecord.customer.companyName,
            approvedAt: now.toISOString(),
          }),
          customerId: tokenRecord.customer.id,
          userRole: 'CUSTOMER',
        },
      })
    })

    // Notify the engineer/creator (token-based flow - email + notification)
    const certNum = tokenRecord.certificate.certificateNumber || `CERT-${tokenRecord.certificateId.substring(0, 8)}`
    if (tokenRecord.certificate.createdBy) {
      queueCustomerApprovalNotificationEmail({
        staffEmail: tokenRecord.certificate.createdBy.email,
        staffName: tokenRecord.certificate.createdBy.name,
        certificateNumber: certNum,
        customerName: tokenRecord.customer.name || tokenRecord.customer.companyName || 'Customer',
        approved: true,
      }).catch(() => {})

      enqueueNotification({
        type: 'create-notification',
        userId: tokenRecord.certificate.createdBy.id,
        notificationType: 'CERTIFICATE_FINALIZED',
        certificateId: tokenRecord.certificateId,
        data: { certificateNumber: certNum },
      }).catch(() => {})
    }

    // Notify reviewer
    if (tokenRecord.certificate.reviewerId) {
      enqueueNotification({
        type: 'create-notification',
        userId: tokenRecord.certificate.reviewerId,
        notificationType: 'CUSTOMER_APPROVED',
        certificateId: tokenRecord.certificateId,
        data: { certificateNumber: certNum },
      }).catch(() => {})
    }

    // Notify all admins
    const tenantId = request.tenantId
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true, tenantId },
      select: { id: true },
    })
    for (const admin of admins) {
      enqueueNotification({
        type: 'create-notification',
        userId: admin.id,
        notificationType: 'CUSTOMER_APPROVED',
        certificateId: tokenRecord.certificateId,
        data: { certificateNumber: certNum },
      }).catch(() => {})
    }

    return { success: true, message: 'Certificate approved successfully' }
  })

  // POST /api/customer/review/:token/reject - Request revision
  fastify.post<{ Params: { token: string } }>('/review/:token/reject', {
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { token } = request.params
    const body = request.body as {
      notes?: string
      sectionFeedbacks?: { section: string; comment: string }[]
      generalNotes?: string
    }

    // Format feedback
    let formattedNotes: string
    if (body.sectionFeedbacks || body.generalNotes) {
      const parts: string[] = []
      const sectionLabels: Record<string, string> = {
        'summary': 'Section 1: Summary',
        'uuc-details': 'Section 2: UUC Details',
        'master-inst': 'Section 3: Master Instruments',
        'environment': 'Section 4: Environmental Conditions',
        'results': 'Section 5: Calibration Results',
        'remarks': 'Section 6: Remarks',
        'conclusion': 'Section 7: Conclusion',
      }

      if (body.sectionFeedbacks) {
        for (const feedback of body.sectionFeedbacks) {
          const label = sectionLabels[feedback.section] || feedback.section
          parts.push(`[${label}]\n${feedback.comment}`)
        }
      }

      if (body.generalNotes) {
        parts.push(`[General Notes]\n${body.generalNotes}`)
      }

      formattedNotes = parts.join('\n\n')
    } else if (body.notes) {
      formattedNotes = body.notes.trim()
    } else {
      formattedNotes = ''
    }

    if (!formattedNotes) {
      return reply.status(400).send({ error: 'Feedback notes are required' })
    }

    // Session-based rejection
    if (token.startsWith('cert:')) {
      const certificateId = token.substring(5)

      if (!request.user || request.user.role !== 'CUSTOMER') {
        return reply.status(401).send({ error: 'Unauthorized - please log in' })
      }

      const tenantId = request.tenantId
      const customer = await prisma.customerUser.findUnique({
        where: { tenantId_email: { tenantId, email: request.user.email } },
        include: { customerAccount: true },
      })

      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found' })
      }

      const certificate = await prisma.certificate.findUnique({
        where: { id: certificateId },
        include: { createdBy: true, reviewer: true },
      })

      if (!certificate) {
        return reply.status(404).send({ error: 'Certificate not found' })
      }

      // Verify access
      const customerCompanyName = customer.customerAccount?.companyName || customer.companyName
      if (!customerCompanyName || certificate.customerName?.toLowerCase() !== customerCompanyName.toLowerCase()) {
        return reply.status(403).send({ error: 'You do not have permission to reject this certificate' })
      }

      if (certificate.status !== 'PENDING_CUSTOMER_APPROVAL' && certificate.status !== 'CUSTOMER_REVISION_REQUIRED') {
        return reply.status(400).send({ error: 'Certificate is not available for review' })
      }

      const now = new Date()

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Update certificate status
        await tx.certificate.update({
          where: { id: certificate.id },
          data: {
            status: 'CUSTOMER_REVISION_REQUIRED',
            statusNotes: formattedNotes,
            updatedAt: now,
          },
        })

        // Invalidate all active approval tokens for this certificate
        await tx.approvalToken.updateMany({
          where: {
            certificateId: certificate.id,
            usedAt: null,
          },
          data: { usedAt: now },
        })

        // Log event
        const lastEvent = await tx.certificateEvent.findFirst({
          where: { certificateId: certificate.id },
          orderBy: { sequenceNumber: 'desc' },
        })

        await tx.certificateEvent.create({
          data: {
            certificateId: certificate.id,
            sequenceNumber: (lastEvent?.sequenceNumber || 0) + 1,
            revision: certificate.currentRevision,
            eventType: 'CUSTOMER_REVISION_REQUESTED',
            eventData: JSON.stringify({
              notes: formattedNotes,
              sectionFeedbacks: body.sectionFeedbacks || null,
              generalNotes: body.generalNotes || null,
              customerEmail: customer.email,
              customerName: customer.name,
              customerCompany: customer.companyName,
              requestedAt: now.toISOString(),
              accessMethod: 'session',
            }),
            customerId: customer.id,
            userRole: 'CUSTOMER',
          },
        })
      })

      // Notify engineer about customer revision request (email + notification)
      const certNum = certificate.certificateNumber || `CERT-${certificate.id.substring(0, 8)}`
      if (certificate.createdBy) {
        queueCustomerApprovalNotificationEmail({
          staffEmail: certificate.createdBy.email,
          staffName: certificate.createdBy.name,
          certificateNumber: certNum,
          customerName: customer.name || customer.companyName || 'Customer',
          approved: false,
          rejectionNote: formattedNotes,
        }).catch(() => {})
      }

      // Notify reviewer too
      if (certificate.reviewerId) {
        enqueueNotification({
          type: 'create-notification',
          userId: certificate.reviewerId,
          notificationType: 'CUSTOMER_REVISION_REQUEST',
          certificateId: certificate.id,
          data: { certificateNumber: certNum },
        }).catch(() => {})
      }

      // Notify all admins
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true, tenantId },
        select: { id: true },
      })
      for (const admin of admins) {
        enqueueNotification({
          type: 'create-notification',
          userId: admin.id,
          notificationType: 'CUSTOMER_REVISION_REQUEST',
          certificateId: certificate.id,
          data: { certificateNumber: certNum },
        }).catch(() => {})
      }

      return { success: true, message: 'Revision request submitted successfully' }
    }

    // Token-based rejection
    const tokenRecord = await prisma.approvalToken.findUnique({
      where: { token },
      include: {
        certificate: { include: { createdBy: true, reviewer: true } },
        customer: true,
      },
    })

    if (!tokenRecord) {
      return reply.status(404).send({ error: 'Invalid token' })
    }

    if (tokenRecord.usedAt) {
      return reply.status(400).send({ error: 'This certificate has already been reviewed' })
    }

    if (new Date() > tokenRecord.expiresAt) {
      return reply.status(400).send({ error: 'This review link has expired' })
    }

    if (tokenRecord.certificate.status !== 'PENDING_CUSTOMER_APPROVAL' && tokenRecord.certificate.status !== 'CUSTOMER_REVISION_REQUIRED') {
      return reply.status(400).send({ error: 'Certificate is not available for review' })
    }

    const now = new Date()

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Update certificate status
      await tx.certificate.update({
        where: { id: tokenRecord.certificateId },
        data: {
          status: 'CUSTOMER_REVISION_REQUIRED',
          statusNotes: formattedNotes,
          updatedAt: now,
        },
      })

      // Mark token as used
      await tx.approvalToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: now },
      })

      // Log event
      const lastEvent = await tx.certificateEvent.findFirst({
        where: { certificateId: tokenRecord.certificateId },
        orderBy: { sequenceNumber: 'desc' },
      })

      await tx.certificateEvent.create({
        data: {
          certificateId: tokenRecord.certificateId,
          sequenceNumber: (lastEvent?.sequenceNumber || 0) + 1,
          revision: tokenRecord.certificate.currentRevision,
          eventType: 'CUSTOMER_REVISION_REQUESTED',
          eventData: JSON.stringify({
            notes: formattedNotes,
            sectionFeedbacks: body.sectionFeedbacks || null,
            generalNotes: body.generalNotes || null,
            customerEmail: tokenRecord.customer.email,
            customerName: tokenRecord.customer.name,
            customerCompany: tokenRecord.customer.companyName,
            requestedAt: now.toISOString(),
            accessMethod: 'token',
          }),
          customerId: tokenRecord.customer.id,
          userRole: 'CUSTOMER',
        },
      })
    })

    // Notify engineer about customer revision request (token-based, email + notification)
    const certNum = tokenRecord.certificate.certificateNumber || `CERT-${tokenRecord.certificateId.substring(0, 8)}`
    if (tokenRecord.certificate.createdBy) {
      queueCustomerApprovalNotificationEmail({
        staffEmail: tokenRecord.certificate.createdBy.email,
        staffName: tokenRecord.certificate.createdBy.name,
        certificateNumber: certNum,
        customerName: tokenRecord.customer.name || tokenRecord.customer.companyName || 'Customer',
        approved: false,
        rejectionNote: formattedNotes,
      }).catch(() => {})
    }

    // Notify reviewer too
    if (tokenRecord.certificate.reviewer) {
      enqueueNotification({
        type: 'create-notification',
        userId: tokenRecord.certificate.reviewer.id,
        notificationType: 'CUSTOMER_REVISION_REQUEST',
        certificateId: tokenRecord.certificateId,
        data: { certificateNumber: certNum },
      }).catch(() => {})
    }

    // Notify all admins
    const tenantId = request.tenantId
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true, tenantId },
      select: { id: true },
    })
    for (const admin of admins) {
      enqueueNotification({
        type: 'create-notification',
        userId: admin.id,
        notificationType: 'CUSTOMER_REVISION_REQUEST',
        certificateId: tokenRecord.certificateId,
        data: { certificateNumber: certNum },
      }).catch(() => {})
    }

    return { success: true, message: 'Revision request submitted successfully' }
  })

  // GET /api/customer/instruments - List instruments used in customer's authorized certificates
  fastify.get('/instruments', {
    preHandler: [requireCustomer],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const customerEmail = request.user!.email
    const query = request.query as {
      search?: string
      page?: string
      limit?: string
    }

    const search = query.search
    const page = Math.max(1, parseInt(query.page || '1'))
    const limit = Math.max(1, Math.min(parseInt(query.limit || '20'), 25))

    // Get customer with their account
    const customer = await prisma.customerUser.findUnique({
      where: { tenantId_email: { tenantId, email: customerEmail } },
      include: { customerAccount: true },
    })

    if (!customer?.customerAccountId) {
      return reply.status(400).send({ error: 'No customer account found' })
    }

    const companyName = customer.customerAccount?.companyName || customer.companyName || ''

    // Build where clause for master instruments used in authorized certificates
    const certificateInstrumentWhere: Record<string, unknown> = {
      certificate: {
        tenantId,
        status: 'AUTHORIZED',
        customerName: companyName,
      },
    }

    // Search filter
    if (search) {
      certificateInstrumentWhere.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { make: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { assetNo: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Get all certificate master instruments
    const certificateInstruments = await prisma.certificateMasterInstrument.findMany({
      where: certificateInstrumentWhere,
      include: {
        certificate: {
          select: {
            id: true,
            certificateNumber: true,
            uucDescription: true,
            dateOfCalibration: true,
            status: true,
          },
        },
      },
      orderBy: [
        { description: 'asc' },
        { make: 'asc' },
      ],
    })

    // Group by masterInstrumentId
    const instrumentMap = new Map<string, {
      masterInstrumentId: string
      category: string | null
      description: string | null
      make: string | null
      model: string | null
      assetNo: string | null
      serialNumber: string | null
      calibratedAt: string | null
      reportNo: string | null
      calibrationDueDate: string | null
      sopReference: string
      certificates: Array<{
        id: string
        certificateNumber: string
        uucDescription: string | null
        dateOfCalibration: string | null
      }>
    }>()

    for (const ci of certificateInstruments) {
      const key = ci.masterInstrumentId
      if (!instrumentMap.has(key)) {
        instrumentMap.set(key, {
          masterInstrumentId: ci.masterInstrumentId,
          category: ci.category,
          description: ci.description,
          make: ci.make,
          model: ci.model,
          assetNo: ci.assetNo,
          serialNumber: ci.serialNumber,
          calibratedAt: ci.calibratedAt,
          reportNo: ci.reportNo,
          calibrationDueDate: ci.calibrationDueDate,
          sopReference: ci.sopReference,
          certificates: [],
        })
      }
      const inst = instrumentMap.get(key)!
      if (!inst.certificates.find(c => c.id === ci.certificate.id)) {
        inst.certificates.push({
          id: ci.certificate.id,
          certificateNumber: ci.certificate.certificateNumber,
          uucDescription: ci.certificate.uucDescription,
          dateOfCalibration: ci.certificate.dateOfCalibration?.toISOString() || null,
        })
      }
    }

    // Paginate
    const allInstruments = Array.from(instrumentMap.values())
    const total = allInstruments.length
    const paginatedInstruments = allInstruments.slice((page - 1) * limit, page * limit)

    // Get stats
    const totalAuthorizedCertificates = await prisma.certificate.count({
      where: {
        tenantId,
        status: 'AUTHORIZED',
        customerName: companyName,
      },
    })

    return {
      instruments: paginatedInstruments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        totalInstruments: total,
        totalAuthorizedCertificates,
      },
    }
  })

  // GET /api/customer/download/:token - Validate download token and get certificate info
  fastify.get<{ Params: { token: string } }>('/download/:token', async (request, reply) => {
    const { token } = request.params

    // Find the download token
    const downloadToken = await prisma.downloadToken.findUnique({
      where: { token },
      include: {
        certificate: {
          select: {
            id: true,
            certificateNumber: true,
            status: true,
            uucDescription: true,
            uucMake: true,
            uucModel: true,
            uucSerialNumber: true,
            dateOfCalibration: true,
            calibrationDueDate: true,
            customerName: true,
            signedPdfPath: true,
          },
        },
      },
    })

    if (!downloadToken) {
      return reply.status(404).send({ error: 'Invalid or expired download link' })
    }

    // Check if token is expired
    if (new Date() > downloadToken.expiresAt) {
      return reply.status(410).send({ error: 'This download link has expired' })
    }

    // Check if downloads exhausted
    if (downloadToken.downloadCount >= downloadToken.maxDownloads) {
      return reply.status(410).send({ error: 'Maximum download limit reached for this link' })
    }

    // Log access
    const ipAddress = (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      request.ip || 'unknown'
    const userAgent = request.headers['user-agent'] as string | undefined

    await prisma.tokenAccessLog.create({
      data: {
        tokenType: 'DOWNLOAD',
        tokenId: downloadToken.id,
        action: 'VIEWED',
        ipAddress,
        userAgent,
      },
    })

    const certificate = downloadToken.certificate

    return {
      valid: true,
      certificate: {
        certificateNumber: certificate.certificateNumber,
        instrumentDescription: certificate.uucDescription,
        make: certificate.uucMake,
        model: certificate.uucModel,
        serialNumber: certificate.uucSerialNumber,
        calibrationDate: certificate.dateOfCalibration?.toISOString() || null,
        calibrationDueDate: certificate.calibrationDueDate?.toISOString() || null,
        customerName: certificate.customerName,
        hasPdf: !!certificate.signedPdfPath,
      },
      download: {
        customerName: downloadToken.customerName,
        customerEmail: downloadToken.customerEmail,
        downloadCount: downloadToken.downloadCount,
        maxDownloads: downloadToken.maxDownloads,
        remainingDownloads: downloadToken.maxDownloads - downloadToken.downloadCount,
        expiresAt: downloadToken.expiresAt.toISOString(),
      },
    }
  })

  // GET /api/customer/download/:token/pdf - Download certificate PDF
  fastify.get<{ Params: { token: string } }>('/download/:token/pdf', async (request, reply) => {
    const { token } = request.params

    // Find the download token with certificate
    const downloadToken = await prisma.downloadToken.findUnique({
      where: { token },
      include: {
        certificate: {
          select: {
            id: true,
            certificateNumber: true,
            signedPdfPath: true,
          },
        },
      },
    })

    if (!downloadToken) {
      return reply.status(404).send({ error: 'Invalid or expired download link' })
    }

    // Check if token is expired
    if (new Date() > downloadToken.expiresAt) {
      return reply.status(410).send({ error: 'This download link has expired' })
    }

    // Check if downloads exhausted
    if (downloadToken.downloadCount >= downloadToken.maxDownloads) {
      return reply.status(410).send({ error: 'Maximum download limit reached for this link' })
    }

    const certificate = downloadToken.certificate

    // Check if PDF exists
    if (!certificate.signedPdfPath) {
      return reply.status(404).send({ error: 'Certificate PDF not available' })
    }

    // Read the PDF file
    const fs = await import('fs/promises')
    const path = await import('path')

    let pdfBuffer: Buffer
    try {
      const pdfPath = certificate.signedPdfPath.startsWith('/')
        ? certificate.signedPdfPath
        : path.join(process.cwd(), certificate.signedPdfPath)

      pdfBuffer = await fs.readFile(pdfPath)
    } catch {
      return reply.status(404).send({ error: 'Certificate PDF not found' })
    }

    // Log access and increment download count
    const ipAddress = (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      request.ip || 'unknown'
    const userAgent = request.headers['user-agent'] as string | undefined

    await prisma.$transaction([
      prisma.downloadToken.update({
        where: { id: downloadToken.id },
        data: {
          downloadCount: { increment: 1 },
          downloadedAt: downloadToken.downloadedAt || new Date(),
        },
      }),
      prisma.tokenAccessLog.create({
        data: {
          tokenType: 'DOWNLOAD',
          tokenId: downloadToken.id,
          action: 'DOWNLOADED',
          ipAddress,
          userAgent,
        },
      }),
    ])

    // Return the PDF
    const filename = `Certificate-${certificate.certificateNumber}.pdf`

    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    reply.header('Content-Length', pdfBuffer.length.toString())
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate')

    return reply.send(pdfBuffer)
  })

  // POST /api/customer/review/:token/note - Add a note during certificate review
  fastify.post<{ Params: { token: string } }>('/review/:token/note', async (request, reply) => {
    const { token } = request.params
    const body = request.body as { message: string }

    if (!body.message?.trim()) {
      return reply.status(400).send({ error: 'Message is required' })
    }

    // Validate token
    const tokenRecord = await prisma.approvalToken.findUnique({
      where: { token },
      include: { certificate: true, customer: true },
    })

    if (!tokenRecord) {
      return reply.status(404).send({ error: 'Invalid token' })
    }

    if (tokenRecord.usedAt || new Date() > tokenRecord.expiresAt) {
      return reply.status(400).send({ error: 'Token expired or already used' })
    }

    // Create feedback record for the customer note
    const feedback = await prisma.reviewFeedback.create({
      data: {
        certificateId: tokenRecord.certificateId,
        revisionNumber: tokenRecord.certificate.currentRevision,
        feedbackType: 'CUSTOMER_NOTE',
        comment: body.message,
        userId: tokenRecord.customer.id,
      },
    })

    // Log event
    const lastEvent = await prisma.certificateEvent.findFirst({
      where: { certificateId: tokenRecord.certificateId },
      orderBy: { sequenceNumber: 'desc' },
    })

    await prisma.certificateEvent.create({
      data: {
        certificateId: tokenRecord.certificateId,
        sequenceNumber: (lastEvent?.sequenceNumber || 0) + 1,
        revision: tokenRecord.certificate.currentRevision,
        eventType: 'CUSTOMER_NOTE_ADDED',
        eventData: JSON.stringify({
          message: body.message,
          customerEmail: tokenRecord.customer.email,
          customerName: tokenRecord.customer.name,
        }),
        customerId: tokenRecord.customer.id,
        userRole: 'CUSTOMER',
      },
    })

    return { success: true, feedbackId: feedback.id }
  })

  // GET /api/customer/review/:token/chat - Get customer chat messages
  fastify.get<{ Params: { token: string } }>('/review/:token/chat', {
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { token } = request.params
    const decodedToken = decodeURIComponent(token)

    // Validate access (token-based or session-based with cert: prefix)
    let customerId: string
    let certificateId: string

    if (decodedToken.startsWith('cert:')) {
      // Session-based access
      if (!request.user || request.user.role !== 'CUSTOMER') {
        return reply.status(401).send({ error: 'Unauthorized' })
      }
      certificateId = decodedToken.substring(5)
      const customer = await prisma.customerUser.findUnique({
        where: { tenantId_email: { tenantId: request.tenantId, email: request.user.email } },
        include: { customerAccount: true },
      })
      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found' })
      }
      const certificate = await prisma.certificate.findUnique({ where: { id: certificateId } })
      if (!certificate) {
        return reply.status(404).send({ error: 'Certificate not found' })
      }
      const customerCompany = customer.customerAccount?.companyName || customer.companyName
      if (!customerCompany || certificate.customerName?.toLowerCase() !== customerCompany.toLowerCase()) {
        return reply.status(403).send({ error: 'Access denied' })
      }
      customerId = customer.id
    } else {
      // Token-based access
      const tokenRecord = await prisma.approvalToken.findUnique({
        where: { token: decodedToken },
        include: { certificate: true, customer: true },
      })
      if (!tokenRecord) {
        return reply.status(404).send({ error: 'Invalid token' })
      }
      if (new Date() > tokenRecord.expiresAt) {
        return reply.status(400).send({ error: 'Token expired' })
      }
      customerId = tokenRecord.customer.id
      certificateId = tokenRecord.certificateId
    }

    // Get or create REVIEWER_CUSTOMER thread
    let thread = await prisma.chatThread.findFirst({
      where: { certificateId, threadType: 'REVIEWER_CUSTOMER' },
    })
    if (!thread) {
      thread = await prisma.chatThread.create({
        data: { certificateId, threadType: 'REVIEWER_CUSTOMER' },
      })
    }

    // Get messages
    const messages = await prisma.chatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, name: true, email: true } },
        attachments: true,
      },
    })

    // Mark messages from others as read
    await prisma.chatMessage.updateMany({
      where: {
        threadId: thread.id,
        customerId: { not: customerId },
        senderType: { not: 'CUSTOMER' },
        readAt: null,
      },
      data: { readAt: new Date() },
    })

    return {
      threadId: thread.id,
      messages: messages.map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        senderType: msg.senderType,
        senderName: msg.senderType === 'CUSTOMER' ? msg.customer?.name : msg.sender?.name,
        isOwnMessage: msg.customerId === customerId,
        createdAt: msg.createdAt.toISOString(),
        attachments: msg.attachments.map((att: any) => ({
          id: att.id,
          fileName: att.fileName,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
        })),
      })),
    }
  })

  // POST /api/customer/review/:token/chat - Send customer chat message
  fastify.post<{ Params: { token: string } }>('/review/:token/chat', {
    preHandler: [optionalAuth],
  }, async (request, reply) => {
    const { token } = request.params
    const decodedToken = decodeURIComponent(token)
    const body = request.body as { content: string }

    if (!body.content || !body.content.trim()) {
      return reply.status(400).send({ error: 'Message content is required' })
    }

    // Validate access
    let customerId: string
    let customerName: string
    let certificateId: string

    if (decodedToken.startsWith('cert:')) {
      if (!request.user || request.user.role !== 'CUSTOMER') {
        return reply.status(401).send({ error: 'Unauthorized' })
      }
      certificateId = decodedToken.substring(5)
      const customer = await prisma.customerUser.findUnique({
        where: { tenantId_email: { tenantId: request.tenantId, email: request.user.email } },
        include: { customerAccount: true },
      })
      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found' })
      }
      const certificate = await prisma.certificate.findUnique({ where: { id: certificateId } })
      if (!certificate) {
        return reply.status(404).send({ error: 'Certificate not found' })
      }
      const customerCompany = customer.customerAccount?.companyName || customer.companyName
      if (!customerCompany || certificate.customerName?.toLowerCase() !== customerCompany.toLowerCase()) {
        return reply.status(403).send({ error: 'Access denied' })
      }
      customerId = customer.id
      customerName = customer.name
    } else {
      const tokenRecord = await prisma.approvalToken.findUnique({
        where: { token: decodedToken },
        include: { certificate: true, customer: { include: { customerAccount: true } } },
      })
      if (!tokenRecord) {
        return reply.status(404).send({ error: 'Invalid token' })
      }
      if (new Date() > tokenRecord.expiresAt) {
        return reply.status(400).send({ error: 'Token expired' })
      }
      customerId = tokenRecord.customer.id
      customerName = tokenRecord.customer.name
      certificateId = tokenRecord.certificateId
    }

    // Get or create thread
    let thread = await prisma.chatThread.findFirst({
      where: { certificateId, threadType: 'REVIEWER_CUSTOMER' },
    })
    if (!thread) {
      thread = await prisma.chatThread.create({
        data: { certificateId, threadType: 'REVIEWER_CUSTOMER' },
      })
    }

    // Create message
    const message = await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        customerId,
        senderType: 'CUSTOMER',
        content: body.content.trim(),
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
      },
    })

    // Notify reviewer
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      select: { reviewerId: true, certificateNumber: true },
    })

    if (certificate?.reviewerId) {
      enqueueNotification({
        type: 'create-notification',
        userId: certificate.reviewerId,
        notificationType: 'NEW_CHAT_MESSAGE',
        certificateId,
        data: {
          certificateNumber: certificate.certificateNumber,
          customerName,
          preview: body.content.trim().substring(0, 100),
        },
      }).catch(() => {})
    }

    return {
      message: {
        id: message.id,
        content: message.content,
        senderType: message.senderType,
        senderName: message.customer?.name,
        isOwnMessage: true,
        createdAt: message.createdAt.toISOString(),
        attachments: [],
      },
    }
  })

  // ============================================================================
  // CUSTOMER TEAM REQUESTS
  // ============================================================================

  // POST /api/customer/team/request - Submit a user addition, POC change, or account deletion request
  fastify.post('/team/request', {
    preHandler: [requireCustomer],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const customerEmail = request.user!.email

    const customer = await prisma.customerUser.findUnique({
      where: { tenantId_email: { tenantId, email: customerEmail } },
      include: { customerAccount: true },
    })

    if (!customer || !customer.customerAccountId) {
      return reply.status(400).send({ error: 'No customer account found' })
    }

    const body = request.body as { type: string; data: Record<string, unknown> }
    const { type, data } = body

    if (!type || !['USER_ADDITION', 'POC_CHANGE', 'ACCOUNT_DELETION', 'DATA_EXPORT'].includes(type)) {
      return reply.status(400).send({ error: 'Invalid request type' })
    }

    // Only POC can submit USER_ADDITION and POC_CHANGE requests
    if ((type === 'USER_ADDITION' || type === 'POC_CHANGE') && customer.customerAccount?.primaryPocId !== customer.id) {
      return reply.status(403).send({ error: 'Only the primary POC can submit requests' })
    }

    if (type === 'ACCOUNT_DELETION') {
      const existingRequest = await prisma.customerRequest.findFirst({
        where: {
          customerAccountId: customer.customerAccountId,
          type: 'ACCOUNT_DELETION',
          status: 'PENDING',
          requestedById: customer.id,
        },
      })
      if (existingRequest) {
        return reply.status(400).send({ error: 'A pending account deletion request already exists' })
      }
    }

    if (type === 'DATA_EXPORT') {
      const existingRequest = await prisma.customerRequest.findFirst({
        where: {
          customerAccountId: customer.customerAccountId,
          type: 'DATA_EXPORT',
          status: 'PENDING',
          requestedById: customer.id,
        },
      })
      if (existingRequest) {
        return reply.status(400).send({ error: 'A pending data export request already exists' })
      }
    }

    if (type === 'USER_ADDITION') {
      if (!data?.name || !data?.email) {
        return reply.status(400).send({ error: 'Name and email are required for user addition' })
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(data.email as string)) {
        return reply.status(400).send({ error: 'Invalid email format' })
      }

      const existingUser = await prisma.customerUser.findFirst({
        where: { tenantId, email: (data.email as string).toLowerCase() },
      })
      if (existingUser) {
        return reply.status(400).send({ error: 'A user with this email already exists' })
      }

      const existingRequests = await prisma.customerRequest.findMany({
        where: {
          customerAccountId: customer.customerAccountId,
          type: 'USER_ADDITION',
          status: 'PENDING',
        },
      })
      const duplicateRequest = existingRequests.find((req) => {
        const reqData = typeof req.data === 'string' ? JSON.parse(req.data) : req.data
        return (reqData as Record<string, string>)?.email?.toLowerCase() === (data.email as string).toLowerCase()
      })
      if (duplicateRequest) {
        return reply.status(400).send({ error: 'A pending request for this email already exists' })
      }
    }

    if (type === 'POC_CHANGE') {
      if (!data?.newPocUserId) {
        return reply.status(400).send({ error: 'New POC user ID is required' })
      }

      const newPocUser = await prisma.customerUser.findFirst({
        where: {
          id: data.newPocUserId as string,
          customerAccountId: customer.customerAccountId,
          isActive: true,
        },
      })
      if (!newPocUser) {
        return reply.status(400).send({ error: 'Selected user is not a valid active member of this account' })
      }

      const existingRequest = await prisma.customerRequest.findFirst({
        where: {
          customerAccountId: customer.customerAccountId,
          type: 'POC_CHANGE',
          status: 'PENDING',
        },
      })
      if (existingRequest) {
        return reply.status(400).send({ error: 'A pending POC change request already exists' })
      }
    }

    const customerRequest = await prisma.customerRequest.create({
      data: {
        type: type as any,
        customerAccountId: customer.customerAccountId,
        requestedById: customer.id,
        data: JSON.stringify(data || {}),
        status: 'PENDING',
      },
    })

    return {
      success: true,
      request: {
        id: customerRequest.id,
        type: customerRequest.type,
        status: customerRequest.status,
        createdAt: customerRequest.createdAt,
      },
    }
  })

  // ============================================================================
  // CUSTOMER DELETE ACCOUNT
  // ============================================================================

  // POST /api/customer/delete-account - Customer requests account deletion
  fastify.post('/delete-account', {
    preHandler: [requireCustomer],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const customerEmail = request.user!.email
    const body = request.body as { password: string }

    if (!body.password) {
      return reply.status(400).send({ error: 'Password is required to confirm account deletion' })
    }

    const customer = await prisma.customerUser.findUnique({
      where: { tenantId_email: { tenantId, email: customerEmail } },
      include: { customerAccount: true },
    })

    if (!customer) {
      return reply.status(404).send({ error: 'Customer not found' })
    }

    if (!customer.passwordHash) {
      return reply.status(400).send({ error: 'Account not activated. Please contact support.' })
    }

    const { verifyPassword } = await import('@hta/shared/auth')
    const isPasswordValid = await verifyPassword(body.password, customer.passwordHash)
    if (!isPasswordValid) {
      return reply.status(400).send({ error: 'Invalid password' })
    }

    const anonymousId = `deleted-${customer.id.slice(0, 8)}-${Date.now()}`

    await prisma.customerUser.update({
      where: { id: customer.id },
      data: {
        email: `${anonymousId}@anonymized.local`,
        name: 'Deleted User',
        passwordHash: null,
        isActive: false,
      },
    })

    return {
      success: true,
      message: 'Your account has been deleted. You will be logged out.',
    }
  })

  // ============================================================================
  // CUSTOMER FORGOT/RESET PASSWORD
  // ============================================================================

  // POST /api/customer/forgot-password - Request password reset
  fastify.post('/forgot-password', async (request) => {
    const body = request.body as { email: string }

    if (!body.email) {
      return {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      }
    }

    const normalizedEmail = body.email.trim().toLowerCase()

    const customer = await prisma.customerUser.findFirst({
      where: { email: normalizedEmail, isActive: true },
      select: { id: true, name: true, email: true, passwordHash: true },
    })

    if (customer && customer.passwordHash) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      const recentTokens = await prisma.passwordResetToken.count({
        where: {
          customerId: customer.id,
          createdAt: { gte: oneHourAgo },
        },
      })

      if (recentTokens < 3) {
        const { randomUUID } = await import('crypto')
        const token = randomUUID()
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

        await prisma.passwordResetToken.create({
          data: {
            token,
            customerId: customer.id,
            expiresAt,
          },
        })

        const baseUrl = process.env.APP_URL || 'https://app.hta-calibration.com'
        const resetUrl = `${baseUrl}/customer/reset-password/${token}`

        const { sendEmail } = await import('../../services/email.js')
        sendEmail({
          to: customer.email,
          template: 'password-reset',
          props: {
            userName: customer.name,
            resetUrl,
          },
        }).catch(() => {})
      }
    }

    return {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    }
  })

  // GET /api/customer/reset-password - Validate reset token
  fastify.get('/reset-password', async (request) => {
    const query = request.query as { token?: string }
    const token = query.token

    if (!token) {
      return { valid: false, error: 'Token is required' }
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      select: {
        id: true,
        expiresAt: true,
        usedAt: true,
        customerId: true,
        customer: { select: { email: true } },
      },
    })

    if (!resetToken) {
      return { valid: false, error: 'Invalid reset link' }
    }
    if (resetToken.usedAt) {
      return { valid: false, error: 'This reset link has already been used' }
    }
    if (new Date() > resetToken.expiresAt) {
      return { valid: false, error: 'This reset link has expired' }
    }
    if (!resetToken.customerId) {
      return { valid: false, error: 'Invalid reset link' }
    }

    return { valid: true, email: resetToken.customer?.email }
  })

  // POST /api/customer/reset-password - Reset password with token
  fastify.post('/reset-password', async (request, reply) => {
    const body = request.body as { token: string; newPassword: string; confirmPassword: string }

    if (!body.token) {
      return reply.status(400).send({ error: 'Token is required' })
    }
    if (!body.newPassword || body.newPassword.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' })
    }
    if (body.newPassword !== body.confirmPassword) {
      return reply.status(400).send({ error: 'Passwords do not match' })
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: body.token },
      include: { customer: true },
    })

    if (!resetToken) {
      return reply.status(400).send({ error: 'Invalid or expired reset link' })
    }
    if (resetToken.usedAt) {
      return reply.status(400).send({ error: 'This reset link has already been used' })
    }
    if (new Date() > resetToken.expiresAt) {
      return reply.status(400).send({ error: 'This reset link has expired' })
    }
    if (!resetToken.customerId || !resetToken.customer) {
      return reply.status(400).send({ error: 'Invalid reset link' })
    }

    const { hashPassword } = await import('@hta/shared/auth')
    const newPasswordHash = await hashPassword(body.newPassword)

    await prisma.$transaction([
      prisma.customerUser.update({
        where: { id: resetToken.customerId },
        data: { passwordHash: newPasswordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ])

    return {
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    }
  })

  // ============================================================================
  // CUSTOMER INSTRUMENT DETAIL
  // ============================================================================

  // GET /api/customer/instruments/:id - Get instrument details with customer's certificates
  fastify.get<{ Params: { id: string } }>('/instruments/:id', {
    preHandler: [requireCustomer],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const customerEmail = request.user!.email
    const { id } = request.params

    const customer = await prisma.customerUser.findUnique({
      where: { tenantId_email: { tenantId, email: customerEmail } },
      include: { customerAccount: true },
    })

    if (!customer?.customerAccount) {
      return reply.status(400).send({ error: 'No customer account found' })
    }

    const companyName = customer.customerAccount.companyName

    // The id may be a UUID, instrumentId, or a stringified legacyId
    let masterInstrument = await prisma.masterInstrument.findFirst({
      where: { id, tenantId, isLatest: true },
    })

    // Try by instrumentId
    if (!masterInstrument) {
      masterInstrument = await prisma.masterInstrument.findFirst({
        where: { instrumentId: id, tenantId, isLatest: true },
      })
    }

    // Try by legacyId (stored as stringified number in CertificateMasterInstrument)
    if (!masterInstrument) {
      const legacyId = parseInt(id, 10)
      if (!isNaN(legacyId)) {
        masterInstrument = await prisma.masterInstrument.findFirst({
          where: { legacyId, tenantId, isLatest: true },
        })
      }
    }

    if (!masterInstrument) {
      return reply.status(404).send({ error: 'Instrument not found' })
    }

    const certificateInstruments = await prisma.certificateMasterInstrument.findMany({
      where: {
        masterInstrumentId: id,
        certificate: {
          tenantId,
          status: 'AUTHORIZED',
          customerName: companyName,
        },
      },
      include: {
        certificate: {
          select: {
            id: true,
            certificateNumber: true,
            uucDescription: true,
            uucMake: true,
            uucModel: true,
            uucSerialNumber: true,
            dateOfCalibration: true,
            calibrationDueDate: true,
            createdAt: true,
          },
        },
        parameter: {
          select: {
            id: true,
            parameterName: true,
            parameterUnit: true,
          },
        },
      },
      orderBy: {
        certificate: { createdAt: 'desc' },
      },
    })

    if (certificateInstruments.length === 0) {
      return reply.status(404).send({ error: 'Instrument not found in your certificates' })
    }

    let instrumentStatus = 'VALID'
    let daysUntilExpiry = 999
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (masterInstrument.calibrationDueDate) {
      const dueDate = new Date(masterInstrument.calibrationDueDate)
      const diffTime = dueDate.getTime() - today.getTime()
      daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      if (daysUntilExpiry < 0) {
        instrumentStatus = 'EXPIRED'
      } else if (daysUntilExpiry <= 30) {
        instrumentStatus = 'EXPIRING_SOON'
      }
    }

    return {
      instrument: {
        ...masterInstrument,
        status: instrumentStatus,
        daysUntilExpiry,
        rangeData: safeJsonParse(masterInstrument.rangeData, []),
      },
      certificates: certificateInstruments.map(ci => ({
          id: ci.certificate.id,
          certificateNumber: ci.certificate.certificateNumber,
          uucDescription: ci.certificate.uucDescription,
          uucMake: ci.certificate.uucMake,
          uucModel: ci.certificate.uucModel,
          uucSerialNumber: ci.certificate.uucSerialNumber,
          dateOfCalibration: ci.certificate.dateOfCalibration,
          calibrationDueDate: ci.certificate.calibrationDueDate,
          createdAt: ci.certificate.createdAt,
          parameter: ci.parameter ? {
            id: ci.parameter.id,
            parameterName: ci.parameter.parameterName,
            parameterUnit: ci.parameter.parameterUnit,
          } : null,
          sopReference: ci.sopReference,
        })),
      totalCertificates: certificateInstruments.length,
    }
  })
}

// Helper to get full certificate data for customer review
async function getFullCertificateData(certificateId: string) {
  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: {
      parameters: {
        include: {
          results: { orderBy: { pointNumber: 'asc' } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      masterInstruments: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  })

  if (!certificate) {
    return null
  }

  // Fetch signatures
  const dbSignatures = await prisma.signature.findMany({
    where: { certificateId },
    orderBy: { signedAt: 'desc' },
  })

  const assigneeSig = dbSignatures.find((s: (typeof dbSignatures)[number]) => s.signerType === 'ASSIGNEE')
  const reviewerSig = dbSignatures.find((s: (typeof dbSignatures)[number]) => s.signerType === 'REVIEWER')
  const adminSig = dbSignatures.find((s: (typeof dbSignatures)[number]) => s.signerType === 'ADMIN')
  const customerSig = dbSignatures.find((s: (typeof dbSignatures)[number]) => s.signerType === 'CUSTOMER')

  const signatures = (assigneeSig || reviewerSig || adminSig || customerSig) ? {
    ...(assigneeSig ? {
      engineer: {
        name: assigneeSig.signerName.toUpperCase(),
        image: assigneeSig.signatureData,
        signatureId: assigneeSig.id,
      }
    } : {}),
    ...(reviewerSig ? {
      hod: {
        name: reviewerSig.signerName.toUpperCase(),
        image: reviewerSig.signatureData,
        signatureId: reviewerSig.id,
      }
    } : {}),
    ...(adminSig ? {
      admin: {
        name: adminSig.signerName.toUpperCase(),
        image: adminSig.signatureData,
        signatureId: adminSig.id,
      }
    } : {}),
    ...(customerSig ? {
      customer: {
        name: customerSig.signerName.toUpperCase(),
        companyName: certificate.customerName || '',
        email: customerSig.signerEmail,
        image: customerSig.signatureData,
        signedAt: customerSig.signedAt.toISOString(),
        signatureId: customerSig.id,
      }
    } : {}),
  } : undefined

  return {
    signatures,
    certificateNumber: certificate.certificateNumber,
    status: certificate.status,
    lastSaved: certificate.updatedAt,
    calibratedAt: certificate.calibratedAt || 'LAB',
    srfNumber: certificate.srfNumber || '',
    srfDate: certificate.srfDate?.toISOString().split('T')[0] || '',
    dateOfCalibration: certificate.dateOfCalibration?.toISOString().split('T')[0] || '',
    calibrationTenure: certificate.calibrationTenure || 12,
    dueDateAdjustment: certificate.dueDateAdjustment || 0,
    calibrationDueDate: certificate.calibrationDueDate?.toISOString().split('T')[0] || '',
    dueDateNotApplicable: certificate.dueDateNotApplicable || false,
    customerName: certificate.customerName || '',
    customerAddress: certificate.customerAddress || '',
    uucDescription: certificate.uucDescription || '',
    uucMake: certificate.uucMake || '',
    uucModel: certificate.uucModel || '',
    uucSerialNumber: certificate.uucSerialNumber || '',
    uucInstrumentId: certificate.uucInstrumentId || '',
    uucLocationName: certificate.uucLocationName || '',
    uucMachineName: certificate.uucMachineName || '',
    parameters: certificate.parameters.map((param: (typeof certificate.parameters)[number]) => ({
      id: param.id,
      parameterName: param.parameterName || '',
      parameterUnit: param.parameterUnit || '',
      rangeMin: param.rangeMin || '',
      rangeMax: param.rangeMax || '',
      rangeUnit: param.rangeUnit || '',
      operatingMin: param.operatingMin || '',
      operatingMax: param.operatingMax || '',
      operatingUnit: param.operatingUnit || '',
      leastCountValue: param.leastCountValue || '',
      leastCountUnit: param.leastCountUnit || '',
      accuracyValue: param.accuracyValue || '',
      accuracyUnit: param.accuracyUnit || '',
      accuracyType: param.accuracyType || 'ABSOLUTE',
      requiresBinning: param.requiresBinning || false,
      bins: safeJsonParse<unknown[]>(param.bins, []),
      errorFormula: param.errorFormula || 'A-B',
      showAfterAdjustment: param.showAfterAdjustment || false,
      masterInstrumentId: param.masterInstrumentId ? parseInt(param.masterInstrumentId) : null,
      sopReference: param.sopReference || '',
      results: param.results.map((result: (typeof param.results)[number]) => ({
        id: result.id,
        pointNumber: result.pointNumber,
        standardReading: result.standardReading || '',
        beforeAdjustment: result.beforeAdjustment || '',
        afterAdjustment: result.afterAdjustment || '',
        errorObserved: result.errorObserved,
        isOutOfLimit: result.isOutOfLimit || false,
      })),
    })),
    masterInstruments: certificate.masterInstruments.map((mi: (typeof certificate.masterInstruments)[number]) => ({
      id: mi.id,
      masterInstrumentId: parseInt(mi.masterInstrumentId) || 0,
      category: mi.category || '',
      description: mi.description || '',
      make: mi.make || '',
      model: mi.model || '',
      assetNo: mi.assetNo || '',
      serialNumber: mi.serialNumber || '',
      calibratedAt: mi.calibratedAt || '',
      reportNo: mi.reportNo || '',
      calibrationDueDate: mi.calibrationDueDate || '',
      isExpired: false,
      isExpiringSoon: false,
    })),
    ambientTemperature: certificate.ambientTemperature || '',
    relativeHumidity: certificate.relativeHumidity || '',
    calibrationStatus: safeJsonParse<string[]>(certificate.calibrationStatus, []),
    stickerOldRemoved: certificate.stickerOldRemoved || null,
    stickerNewAffixed: certificate.stickerNewAffixed || null,
    statusNotes: certificate.statusNotes || '',
    selectedConclusionStatements: safeJsonParse<string[]>(certificate.selectedConclusionStatements, []),
    additionalConclusionStatement: certificate.additionalConclusionStatement || '',
    engineerNotes: '',
  }
}

export default customerRoutes
