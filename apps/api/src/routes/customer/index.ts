import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import { requireCustomer, optionalAuth } from '../../middleware/auth.js'
import bcrypt from 'bcryptjs'

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

    // Process pending review data
    const tokenCertIds = new Set(pendingTokens.map((t) => t.certificate.id))
    const pending = [
      ...pendingTokens.map((token) => {
        let adminMessage: string | null = null
        if (token.certificate.events[0]) {
          const data = safeJsonParse<Record<string, string>>(token.certificate.events[0].eventData, {})
          adminMessage = data.message || null
        }
        return {
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
        }
      }),
      ...pendingCompanyMatch
        .filter((cert) =>
          !tokenCertIds.has(cert.id) &&
          cert.customerName?.toLowerCase() === companyNameLower
        )
        .map((cert) => ({
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
      .filter((cert) => cert.customerName?.toLowerCase() === companyNameLower)
      .map((cert) => {
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
      })

    // Process completed data
    const completed = completedSignatures.map((sig) => {
      const sigTypes = sig.certificate.signatures.map((s) => s.signerType)
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

    // Process authorized data
    const authorized = authorizedCerts.map((sig) => ({
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
      (cmi) => cmi.certificate.customerName?.toLowerCase() === companyNameLower
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

  // GET /api/customer/team - Get team members
  fastify.get('/team', {
    preHandler: [requireCustomer],
  }, async (request, reply) => {
    const user = request.user!

    // Get customer account ID from user session or lookup
    const customer = await prisma.customerUser.findUnique({
      where: { id: user.sub },
      include: { customerAccount: true },
    })

    if (!customer?.customerAccountId) {
      return reply.status(400).send({ error: 'No customer account found' })
    }

    const customerAccount = await prisma.customerAccount.findUnique({
      where: { id: customer.customerAccountId },
      include: {
        primaryPoc: {
          select: { id: true, name: true, email: true, isActive: true, activatedAt: true, createdAt: true },
        },
        users: {
          select: { id: true, name: true, email: true, isActive: true, activatedAt: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!customerAccount) {
      return reply.status(404).send({ error: 'Customer account not found' })
    }

    // Get pending requests
    const pendingRequests = await prisma.customerRequest.findMany({
      where: {
        customerAccountId: customerAccount.id,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    })

    return {
      account: {
        id: customerAccount.id,
        companyName: customerAccount.companyName,
        primaryPocId: customerAccount.primaryPocId,
      },
      users: customerAccount.users,
      primaryPoc: customerAccount.primaryPoc,
      pendingRequests: pendingRequests.map((req) => ({
        id: req.id,
        type: req.type,
        data: JSON.parse(req.data),
        createdAt: req.createdAt,
      })),
      currentUserId: user.sub,
      isPrimaryPoc: customerAccount.primaryPocId === user.sub,
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

      await prisma.$transaction(async (tx) => {
        // Create signature
        await tx.signature.create({
          data: {
            certificateId: certificate.id,
            signerType: 'CUSTOMER',
            signerName: body.signerName,
            signerEmail: body.signerEmail || request.user!.email,
            signatureData: body.signatureData,
            customerId: customer.id,
          },
        })

        // Update certificate status
        await tx.certificate.update({
          where: { id: certificate.id },
          data: {
            status: 'PENDING_ADMIN_AUTHORIZATION',
            updatedAt: now,
          },
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

    await prisma.$transaction(async (tx) => {
      // Create signature
      await tx.signature.create({
        data: {
          certificateId: tokenRecord.certificateId,
          signerType: 'CUSTOMER',
          signerName: body.signerName,
          signerEmail: body.signerEmail || tokenRecord.customer.email,
          signatureData: body.signatureData,
          customerId: tokenRecord.customerId,
        },
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

      await prisma.$transaction(async (tx) => {
        // Update certificate status
        await tx.certificate.update({
          where: { id: certificate.id },
          data: {
            status: 'CUSTOMER_REVISION_REQUIRED',
            statusNotes: formattedNotes,
            updatedAt: now,
          },
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

    await prisma.$transaction(async (tx) => {
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
    const page = parseInt(query.page || '1')
    const limit = parseInt(query.limit || '20')

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

  const assigneeSig = dbSignatures.find((s) => s.signerType === 'ASSIGNEE')
  const reviewerSig = dbSignatures.find((s) => s.signerType === 'REVIEWER')
  const adminSig = dbSignatures.find((s) => s.signerType === 'ADMIN')
  const customerSig = dbSignatures.find((s) => s.signerType === 'CUSTOMER')

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
    parameters: certificate.parameters.map((param) => ({
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
      results: param.results.map((result) => ({
        id: result.id,
        pointNumber: result.pointNumber,
        standardReading: result.standardReading || '',
        beforeAdjustment: result.beforeAdjustment || '',
        afterAdjustment: result.afterAdjustment || '',
        errorObserved: result.errorObserved,
        isOutOfLimit: result.isOutOfLimit || false,
      })),
    })),
    masterInstruments: certificate.masterInstruments.map((mi) => ({
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
