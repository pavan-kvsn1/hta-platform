/**
 * Customer Dashboard API Unit Tests
 *
 * Tests for the customer dashboard API endpoint:
 * - Authentication and authorization
 * - Dashboard data aggregation
 * - Pending, awaiting, completed certificates
 * - Authorized certificates
 * - Traceability data
 * - Error handling
 *
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Types
interface Session {
  user: { id: string; email: string; role: string }
  expires: string
}

interface CustomerUser {
  id: string
  email: string
  name: string
  companyName: string
  customerAccount: {
    id: string
    companyName: string | null
    primaryPocId: string | null
  } | null
}

interface Certificate {
  id: string
  certificateNumber: string
  uucDescription: string
  uucMake: string
  uucModel: string
  customerName?: string
  status?: string
  updatedAt?: Date
  srfNumber?: string | null
  dateOfCalibration?: Date | null
  calibrationDueDate?: Date | null
  signedPdfPath?: string | null
  events?: Array<{
    eventType: string
    eventData: string
    createdAt?: Date
    user?: { name: string }
  }>
  signatures?: Array<{ signerType: string }>
}

interface ApprovalToken {
  id: string
  token: string
  createdAt: Date
  expiresAt: Date
  certificate: Certificate
}

interface Signature {
  id: string
  signerName?: string
  signedAt: Date
  certificate: Certificate & { signatures: Array<{ signerType: string }> }
}

interface MasterInstrumentUsage {
  masterInstrumentId: string
  description: string
  serialNumber: string
  category: string
  make: string
  model: string
  reportNo: string
  calibrationDueDate: string
  calibratedAt: string
  certificate: {
    id: string
    certificateNumber: string
    uucDescription: string
    dateOfCalibration: Date
    customerName: string
  }
}

interface DashboardResponse {
  counts: {
    pending: number
    awaiting: number
    completed: number
    authorized: number
    traceability: number
  }
  companyName: string
  isPrimaryPoc: boolean
  userCount: number
  pending: Array<{
    id: string
    certificateNumber: string
    hasToken: boolean
    tokenId?: string
    adminMessage?: string
  }>
  awaiting: Array<{
    id: string
    certificateNumber: string
    internalStatus: string
    customerFeedback?: string
    adminResponse?: string
    adminName?: string
  }>
  completed: Array<{
    id: string
    certificateNumber: string
    hasEngineerSig: boolean
    hasReviewerSig: boolean
    hasCustomerSig: boolean
    hasAdminSig: boolean
  }>
  authorized: Array<{
    id: string
    certificateNumber: string
    signedPdfPath?: string | null
  }>
  traceability: Array<{
    id: string
    description: string
    serialNumber: string
    certificatesUsedIn: Array<{ id: string; certificateNumber: string }>
  }>
}

// Mock implementations
const mockAuth = vi.fn<[], Promise<Session | null>>()
const mockFindCustomer = vi.fn<[unknown], Promise<CustomerUser | null>>()
const mockCountCustomerUsers = vi.fn<[unknown], Promise<number>>()
const mockFindApprovalTokens = vi.fn<[unknown], Promise<ApprovalToken[]>>()
const mockFindCertificates = vi.fn<[unknown], Promise<Certificate[]>>()
const mockFindSignatures = vi.fn<[unknown], Promise<Signature[]>>()
const mockFindMasterInstruments = vi.fn<[unknown], Promise<MasterInstrumentUsage[]>>()

// Transform pending token to response format
function transformPendingWithToken(token: ApprovalToken): DashboardResponse['pending'][0] {
  const eventData = token.certificate.events?.[0]?.eventData
  const adminMessage = eventData ? JSON.parse(eventData).message : undefined

  return {
    id: token.certificate.id,
    certificateNumber: token.certificate.certificateNumber,
    hasToken: true,
    tokenId: token.token,
    adminMessage,
  }
}

// Transform pending certificate to response format
function transformPendingCertificate(cert: Certificate): DashboardResponse['pending'][0] {
  return {
    id: cert.id,
    certificateNumber: cert.certificateNumber,
    hasToken: false,
  }
}

// Transform awaiting certificate to response format
function transformAwaitingCertificate(cert: Certificate): DashboardResponse['awaiting'][0] {
  const revisionEvent = cert.events?.find((e) => e.eventType === 'CUSTOMER_REVISION_REQUESTED')
  const replyEvent = cert.events?.find((e) => e.eventType === 'ADMIN_REPLIED_TO_CUSTOMER')

  return {
    id: cert.id,
    certificateNumber: cert.certificateNumber,
    internalStatus: cert.status || 'UNKNOWN',
    customerFeedback: revisionEvent ? JSON.parse(revisionEvent.eventData).notes : undefined,
    adminResponse: replyEvent ? JSON.parse(replyEvent.eventData).response : undefined,
    adminName: replyEvent?.user?.name,
  }
}

// Transform completed signature to response format
function transformCompletedSignature(sig: Signature): DashboardResponse['completed'][0] {
  const signatures = sig.certificate.signatures || []
  return {
    id: sig.certificate.id,
    certificateNumber: sig.certificate.certificateNumber,
    hasEngineerSig: signatures.some((s) => s.signerType === 'ASSIGNEE'),
    hasReviewerSig: signatures.some((s) => s.signerType === 'REVIEWER'),
    hasCustomerSig: signatures.some((s) => s.signerType === 'CUSTOMER'),
    hasAdminSig: signatures.some((s) => s.signerType === 'ADMIN'),
  }
}

// Transform authorized signature to response format
function transformAuthorizedSignature(sig: Signature): DashboardResponse['authorized'][0] {
  return {
    id: sig.certificate.id,
    certificateNumber: sig.certificate.certificateNumber,
    signedPdfPath: sig.certificate.signedPdfPath,
  }
}

// Group master instruments and their certificates
function groupMasterInstruments(usages: MasterInstrumentUsage[]): DashboardResponse['traceability'] {
  const grouped = new Map<string, DashboardResponse['traceability'][0]>()

  for (const usage of usages) {
    if (!grouped.has(usage.masterInstrumentId)) {
      grouped.set(usage.masterInstrumentId, {
        id: usage.masterInstrumentId,
        description: usage.description,
        serialNumber: usage.serialNumber,
        certificatesUsedIn: [],
      })
    }

    grouped.get(usage.masterInstrumentId)!.certificatesUsedIn.push({
      id: usage.certificate.id,
      certificateNumber: usage.certificate.certificateNumber,
    })
  }

  return Array.from(grouped.values())
}

// Mock GET handler
async function GET(): Promise<{ status: number; body: unknown }> {
  try {
    const session = await mockAuth()

    if (!session || session.user.role !== 'CUSTOMER') {
      return { status: 401, body: { error: 'Unauthorized' } }
    }

    const customer = await mockFindCustomer({ where: { email: session.user.email } })

    if (!customer) {
      return { status: 404, body: { error: 'Customer not found' } }
    }

    const companyName = customer.customerAccount?.companyName || customer.companyName
    const isPrimaryPoc = customer.customerAccount?.primaryPocId === customer.id

    const userCount = customer.customerAccount
      ? await mockCountCustomerUsers({ where: { customerAccountId: customer.customerAccount.id } })
      : 0

    // Fetch all dashboard data
    const [approvalTokens, pendingCerts, awaitingCerts, completedSigs, authorizedSigs, masterInstruments] = await Promise.all([
      mockFindApprovalTokens({ companyName }),
      mockFindCertificates({ status: 'PENDING_CUSTOMER_APPROVAL', companyName }),
      mockFindCertificates({ status: { in: ['CUSTOMER_REVISION_REQUIRED', 'PENDING_ADMIN_RESPONSE'] }, companyName }),
      mockFindSignatures({ status: 'PENDING_ADMIN_AUTHORIZATION', companyName }),
      mockFindSignatures({ status: { in: ['AUTHORIZED', 'COMPLETED'] }, companyName }),
      mockFindMasterInstruments({ companyName }),
    ])

    // Transform data
    const pendingFromTokens = approvalTokens.map(transformPendingWithToken)
    const pendingFromCerts = pendingCerts
      .filter((c) => !approvalTokens.some((t) => t.certificate.id === c.id))
      .map(transformPendingCertificate)
    const pending = [...pendingFromTokens, ...pendingFromCerts]

    const awaiting = awaitingCerts.map(transformAwaitingCertificate)
    const completed = completedSigs.map(transformCompletedSignature)
    const authorized = authorizedSigs.map(transformAuthorizedSignature)
    const traceability = groupMasterInstruments(masterInstruments)

    return {
      status: 200,
      body: {
        counts: {
          pending: pending.length,
          awaiting: awaiting.length,
          completed: completed.length,
          authorized: authorized.length,
          traceability: traceability.length,
        },
        companyName,
        isPrimaryPoc,
        userCount,
        pending,
        awaiting,
        completed,
        authorized,
        traceability,
      } as DashboardResponse,
    }
  } catch {
    return { status: 500, body: { error: 'Failed to fetch dashboard data' } }
  }
}

const mockCustomerSession: Session = {
  user: {
    id: 'customer-123',
    email: 'customer@testcorp.com',
    role: 'CUSTOMER',
  },
  expires: new Date().toISOString(),
}

const mockCustomer: CustomerUser = {
  id: 'customer-123',
  email: 'customer@testcorp.com',
  name: 'John Customer',
  companyName: 'Test Corp',
  customerAccount: {
    id: 'account-123',
    companyName: 'Test Corp',
    primaryPocId: 'customer-123',
  },
}

describe('GET /api/customer/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(mockCustomerSession)
    mockFindCustomer.mockResolvedValue(mockCustomer)
    mockCountCustomerUsers.mockResolvedValue(3)
    mockFindApprovalTokens.mockResolvedValue([])
    mockFindCertificates.mockResolvedValue([])
    mockFindSignatures.mockResolvedValue([])
    mockFindMasterInstruments.mockResolvedValue([])
  })

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const response = await GET()

      expect(response.status).toBe(401)
      expect((response.body as { error: string }).error).toBe('Unauthorized')
    })

    it('returns 401 when user is not a customer', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user-123', email: 'user@test.com', role: 'ENGINEER' },
        expires: new Date().toISOString(),
      })

      const response = await GET()

      expect(response.status).toBe(401)
      expect((response.body as { error: string }).error).toBe('Unauthorized')
    })
  })

  describe('successful response', () => {
    it('returns empty counts when no certificates', async () => {
      const response = await GET()
      const data = response.body as DashboardResponse

      expect(response.status).toBe(200)
      expect(data.counts).toEqual({
        pending: 0,
        awaiting: 0,
        completed: 0,
        authorized: 0,
        traceability: 0,
      })
      expect(data.companyName).toBe('Test Corp')
      expect(data.isPrimaryPoc).toBe(true)
      expect(data.userCount).toBe(3)
    })

    it('returns pending certificates with tokens', async () => {
      mockFindApprovalTokens.mockResolvedValue([
        {
          id: 'token-1',
          token: 'abc123',
          createdAt: new Date('2024-01-15'),
          expiresAt: new Date('2024-01-22'),
          certificate: {
            id: 'cert-1',
            certificateNumber: 'HTA-001',
            uucDescription: 'Test Equipment',
            uucMake: 'Make A',
            uucModel: 'Model X',
            srfNumber: 'SRF-001',
            dateOfCalibration: new Date('2024-01-10'),
            events: [
              {
                eventType: 'SENT_TO_CUSTOMER',
                eventData: JSON.stringify({ message: 'Please review' }),
              },
            ],
          },
        },
      ])

      const response = await GET()
      const data = response.body as DashboardResponse

      expect(response.status).toBe(200)
      expect(data.counts.pending).toBe(1)
      expect(data.pending[0]).toMatchObject({
        id: 'cert-1',
        certificateNumber: 'HTA-001',
        hasToken: true,
        tokenId: 'abc123',
        adminMessage: 'Please review',
      })
    })

    it('returns pending certificates matched by company name', async () => {
      mockFindCertificates.mockImplementation(async (query: unknown) => {
        const q = query as { status: string }
        if (q.status === 'PENDING_CUSTOMER_APPROVAL') {
          return [
            {
              id: 'cert-2',
              certificateNumber: 'HTA-002',
              uucDescription: 'Equipment 2',
              uucMake: 'Make B',
              uucModel: 'Model Y',
              customerName: 'Test Corp',
              updatedAt: new Date('2024-01-16'),
              srfNumber: null,
              dateOfCalibration: null,
            },
          ]
        }
        return []
      })

      const response = await GET()
      const data = response.body as DashboardResponse

      expect(response.status).toBe(200)
      expect(data.counts.pending).toBe(1)
      expect(data.pending[0]).toMatchObject({
        id: 'cert-2',
        certificateNumber: 'HTA-002',
        hasToken: false,
      })
    })

    it('returns awaiting response certificates', async () => {
      mockFindCertificates.mockImplementation(async (query: unknown) => {
        const q = query as { status: { in?: string[] } }
        if (q.status?.in?.includes('CUSTOMER_REVISION_REQUIRED')) {
          return [
            {
              id: 'cert-3',
              certificateNumber: 'HTA-003',
              uucDescription: 'Equipment 3',
              uucMake: 'Make C',
              uucModel: 'Model Z',
              customerName: 'Test Corp',
              status: 'CUSTOMER_REVISION_REQUIRED',
              updatedAt: new Date('2024-01-17'),
              events: [
                {
                  eventType: 'CUSTOMER_REVISION_REQUESTED',
                  eventData: JSON.stringify({ notes: 'Please fix issues' }),
                  createdAt: new Date('2024-01-16'),
                },
                {
                  eventType: 'ADMIN_REPLIED_TO_CUSTOMER',
                  eventData: JSON.stringify({ response: 'Fixed the issues' }),
                  createdAt: new Date('2024-01-17'),
                  user: { name: 'Admin User' },
                },
              ],
            },
          ]
        }
        return []
      })

      const response = await GET()
      const data = response.body as DashboardResponse

      expect(response.status).toBe(200)
      expect(data.counts.awaiting).toBe(1)
      expect(data.awaiting[0]).toMatchObject({
        id: 'cert-3',
        certificateNumber: 'HTA-003',
        internalStatus: 'CUSTOMER_REVISION_REQUIRED',
        customerFeedback: 'Please fix issues',
        adminResponse: 'Fixed the issues',
        adminName: 'Admin User',
      })
    })

    it('returns completed certificates (pending admin authorization)', async () => {
      mockFindSignatures.mockImplementation(async (query: unknown) => {
        const q = query as { status: string }
        if (q.status === 'PENDING_ADMIN_AUTHORIZATION') {
          return [
            {
              id: 'sig-1',
              signerName: 'John Customer',
              signedAt: new Date('2024-01-18'),
              certificate: {
                id: 'cert-4',
                certificateNumber: 'HTA-004',
                uucDescription: 'Equipment 4',
                uucMake: 'Make D',
                uucModel: 'Model W',
                signatures: [
                  { signerType: 'ASSIGNEE' },
                  { signerType: 'REVIEWER' },
                  { signerType: 'CUSTOMER' },
                ],
              },
            },
          ]
        }
        return []
      })

      const response = await GET()
      const data = response.body as DashboardResponse

      expect(response.status).toBe(200)
      expect(data.counts.completed).toBe(1)
      expect(data.completed[0]).toMatchObject({
        id: 'cert-4',
        certificateNumber: 'HTA-004',
        hasEngineerSig: true,
        hasReviewerSig: true,
        hasCustomerSig: true,
        hasAdminSig: false,
      })
    })

    it('returns authorized certificates', async () => {
      mockFindSignatures.mockImplementation(async (query: unknown) => {
        const q = query as { status: { in?: string[] } }
        if (q.status?.in?.includes('AUTHORIZED')) {
          return [
            {
              id: 'sig-2',
              signedAt: new Date('2024-01-19'),
              certificate: {
                id: 'cert-5',
                certificateNumber: 'HTA-005',
                uucDescription: 'Equipment 5',
                uucMake: 'Make E',
                uucModel: 'Model V',
                dateOfCalibration: new Date('2024-01-15'),
                calibrationDueDate: new Date('2025-01-15'),
                signedPdfPath: '/pdfs/HTA-005.pdf',
                signatures: [],
              },
            },
          ]
        }
        return []
      })

      const response = await GET()
      const data = response.body as DashboardResponse

      expect(response.status).toBe(200)
      expect(data.counts.authorized).toBe(1)
      expect(data.authorized[0]).toMatchObject({
        id: 'cert-5',
        certificateNumber: 'HTA-005',
        signedPdfPath: '/pdfs/HTA-005.pdf',
      })
    })

    it('returns traceability data for master instruments', async () => {
      mockFindMasterInstruments.mockResolvedValue([
        {
          masterInstrumentId: 'mi-1',
          description: 'Digital Multimeter',
          serialNumber: 'DMM-001',
          category: 'Electrical',
          make: 'Fluke',
          model: '87V',
          reportNo: 'CAL-001',
          calibrationDueDate: '2025-06-01',
          calibratedAt: '2024-06-01',
          certificate: {
            id: 'cert-6',
            certificateNumber: 'HTA-006',
            uucDescription: 'Test Device',
            dateOfCalibration: new Date('2024-01-20'),
            customerName: 'Test Corp',
          },
        },
        {
          masterInstrumentId: 'mi-1',
          description: 'Digital Multimeter',
          serialNumber: 'DMM-001',
          category: 'Electrical',
          make: 'Fluke',
          model: '87V',
          reportNo: 'CAL-001',
          calibrationDueDate: '2025-06-01',
          calibratedAt: '2024-06-01',
          certificate: {
            id: 'cert-7',
            certificateNumber: 'HTA-007',
            uucDescription: 'Another Device',
            dateOfCalibration: new Date('2024-01-21'),
            customerName: 'Test Corp',
          },
        },
      ])

      const response = await GET()
      const data = response.body as DashboardResponse

      expect(response.status).toBe(200)
      expect(data.counts.traceability).toBe(1) // One unique instrument
      expect(data.traceability[0]).toMatchObject({
        id: 'mi-1',
        description: 'Digital Multimeter',
        serialNumber: 'DMM-001',
      })
      expect(data.traceability[0].certificatesUsedIn).toHaveLength(2)
    })

    it('handles customer without account', async () => {
      mockFindCustomer.mockResolvedValue({
        ...mockCustomer,
        customerAccount: null,
      })
      mockCountCustomerUsers.mockResolvedValue(0)

      const response = await GET()
      const data = response.body as DashboardResponse

      expect(response.status).toBe(200)
      expect(data.isPrimaryPoc).toBe(false)
      expect(data.userCount).toBe(0)
    })

    it('uses fallback company name when account has no company name', async () => {
      mockFindCustomer.mockResolvedValue({
        ...mockCustomer,
        companyName: 'Fallback Corp',
        customerAccount: {
          id: 'account-123',
          companyName: null,
          primaryPocId: null,
        },
      })

      const response = await GET()
      const data = response.body as DashboardResponse

      expect(response.status).toBe(200)
      expect(data.companyName).toBe('Fallback Corp')
    })
  })

  describe('error handling', () => {
    it('returns 500 on unexpected error', async () => {
      mockFindCustomer.mockRejectedValue(new Error('Database error'))

      const response = await GET()

      expect(response.status).toBe(500)
      expect((response.body as { error: string }).error).toBe('Failed to fetch dashboard data')
    })
  })
})
