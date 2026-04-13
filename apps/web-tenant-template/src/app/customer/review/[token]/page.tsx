import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/utils/safe-json'
import { notFound } from 'next/navigation'
import { TokenReviewClient } from './TokenReviewClient'

// Render at runtime, not build time (needs database)
export const dynamic = 'force-dynamic'

// Status badge configuration
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING_CUSTOMER_APPROVAL: { label: 'Pending Your Approval', className: 'bg-purple-50 text-purple-600 border-purple-100' },
  CUSTOMER_REVISION_REQUIRED: { label: 'Revision in Progress', className: 'bg-orange-50 text-orange-600 border-orange-100' },
  REVISION_REQUIRED: { label: 'Under Revision', className: 'bg-amber-50 text-amber-600 border-amber-100' },
  PENDING_ADMIN_AUTHORIZATION: { label: 'Pending Authorization', className: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  APPROVED: { label: 'Approved', className: 'bg-green-50 text-green-600 border-green-100' },
  AUTHORIZED: { label: 'Authorized', className: 'bg-green-50 text-green-600 border-green-100' },
}

async function validateToken(token: string): Promise<{
  valid: boolean
  error?: 'EXPIRED' | 'INVALID' | 'USED' | 'REVOKED'
  tokenId?: string
  certificateId?: string
  customerId?: string
  expiresAt?: Date
  sentAt?: Date
}> {
  const tokenRecord = await prisma.approvalToken.findUnique({
    where: { token },
    include: {
      certificate: true,
      customer: true,
    },
  })

  if (!tokenRecord) {
    return { valid: false, error: 'INVALID' }
  }

  if (tokenRecord.usedAt) {
    return { valid: false, error: 'USED' }
  }

  if (new Date() > tokenRecord.expiresAt) {
    return { valid: false, error: 'EXPIRED' }
  }

  // Allow access for PENDING_CUSTOMER_APPROVAL and CUSTOMER_REVISION_REQUIRED (after Admin reply)
  const allowedStatuses = ['PENDING_CUSTOMER_APPROVAL', 'CUSTOMER_REVISION_REQUIRED']
  if (!allowedStatuses.includes(tokenRecord.certificate.status)) {
    return { valid: false, error: 'USED' }
  }

  return {
    valid: true,
    tokenId: tokenRecord.id,
    certificateId: tokenRecord.certificateId,
    customerId: tokenRecord.customerId,
    expiresAt: tokenRecord.expiresAt,
    sentAt: tokenRecord.createdAt,
  }
}

function TokenErrorPage({ error }: { error: 'EXPIRED' | 'INVALID' | 'USED' | 'REVOKED' }) {
  const errorMessages = {
    EXPIRED: {
      title: 'Link Expired',
      message: 'This review link has expired. Please contact HTA for a new link.',
    },
    INVALID: {
      title: 'Invalid Link',
      message: 'This review link is invalid. Please check the link or contact HTA.',
    },
    USED: {
      title: 'Already Reviewed',
      message: 'This certificate has already been reviewed. Check your dashboard for the status.',
    },
    REVOKED: {
      title: 'Access Revoked',
      message: 'Access to this certificate has been revoked. Please contact HTA for assistance.',
    },
  }

  const { title, message } = errorMessages[error]

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="space-y-3">
          <a
            href="/customer/login"
            className="block w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Go to Customer Portal
          </a>
          <p className="text-sm text-gray-500">
            Need help?{' '}
            <a href="mailto:calibration@htainstruments.com" className="text-green-600 hover:underline">
              Contact HTA
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default async function CustomerReviewPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const result = await validateToken(token)

  if (!result.valid) {
    return <TokenErrorPage error={result.error!} />
  }

  const { certificateId, customerId, expiresAt, sentAt } = result

  // Fetch full certificate data
  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      reviewer: {
        select: { id: true, name: true, email: true },
      },
      parameters: {
        include: {
          results: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
      masterInstruments: true,
      signatures: {
        select: {
          id: true,
          signerType: true,
          signerName: true,
          signedAt: true,
        },
      },
      chatThreads: {
        where: { threadType: 'REVIEWER_CUSTOMER' },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  })

  if (!certificate) {
    notFound()
  }

  // Fetch customer data
  const customer = await prisma.customerUser.findUnique({
    where: { id: customerId },
    include: { customerAccount: true },
  })

  if (!customer) {
    return <TokenErrorPage error="INVALID" />
  }

  // Parse JSON fields
  const conclusionStatements = certificate.selectedConclusionStatements
    ? safeJsonParse<string[]>(certificate.selectedConclusionStatements, [])
    : []

  const calibrationStatus = certificate.calibrationStatus
    ? safeJsonParse<string[]>(certificate.calibrationStatus, [])
    : []

  // Get chat thread
  const chatThread = certificate.chatThreads[0] || null

  // Get status config
  const statusConfig = STATUS_CONFIG[certificate.status] || { label: certificate.status, className: 'bg-gray-50 text-gray-600 border-gray-100' }

  // Serialize certificate data
  const certificateData = {
    id: certificate.id,
    certificateNumber: certificate.certificateNumber,
    status: certificate.status,
    customerName: certificate.customerName,
    customerAddress: certificate.customerAddress,
    customerContactName: certificate.customerContactName,
    customerContactEmail: certificate.customerContactEmail,
    calibratedAt: certificate.calibratedAt,
    srfNumber: certificate.srfNumber,
    srfDate: certificate.srfDate?.toISOString() || null,
    dateOfCalibration: certificate.dateOfCalibration?.toISOString() || null,
    calibrationDueDate: certificate.calibrationDueDate?.toISOString() || null,
    dueDateNotApplicable: certificate.dueDateNotApplicable,
    uucDescription: certificate.uucDescription,
    uucMake: certificate.uucMake,
    uucModel: certificate.uucModel,
    uucSerialNumber: certificate.uucSerialNumber,
    uucLocationName: certificate.uucLocationName,
    ambientTemperature: certificate.ambientTemperature,
    relativeHumidity: certificate.relativeHumidity,
    calibrationStatus,
    conclusionStatements,
    additionalConclusionStatement: certificate.additionalConclusionStatement,
    currentRevision: certificate.currentRevision,
    parameters: certificate.parameters.map((p) => ({
      id: p.id,
      parameterName: p.parameterName,
      parameterUnit: p.parameterUnit,
      rangeMin: p.rangeMin,
      rangeMax: p.rangeMax,
      rangeUnit: p.rangeUnit,
      operatingMin: p.operatingMin,
      operatingMax: p.operatingMax,
      operatingUnit: p.operatingUnit,
      leastCountValue: p.leastCountValue,
      leastCountUnit: p.leastCountUnit,
      accuracyValue: p.accuracyValue,
      accuracyUnit: p.accuracyUnit,
      accuracyType: p.accuracyType,
      errorFormula: p.errorFormula,
      showAfterAdjustment: p.showAfterAdjustment,
      requiresBinning: p.requiresBinning,
      bins: p.bins ? (typeof p.bins === 'string' ? p.bins : JSON.stringify(p.bins)) : null,
      sopReference: p.sopReference,
      results: p.results.map((r) => ({
        id: r.id,
        pointNumber: r.pointNumber,
        standardReading: r.standardReading,
        beforeAdjustment: r.beforeAdjustment,
        afterAdjustment: r.afterAdjustment,
        errorObserved: r.errorObserved,
        isOutOfLimit: r.isOutOfLimit,
      })),
    })),
    masterInstruments: certificate.masterInstruments.map((mi) => ({
      id: mi.id,
      description: mi.description,
      make: mi.make,
      model: mi.model,
      serialNumber: mi.serialNumber,
      calibrationDueDate: mi.calibrationDueDate,
    })),
  }

  // Serialize signatures
  const signatures = certificate.signatures.map((s) => ({
    id: s.id,
    signerType: s.signerType,
    signerName: s.signerName,
    signedAt: s.signedAt?.toISOString() || null,
  }))

  // Get company name from customerAccount (preferred) or fallback to legacy companyName field
  const customerCompanyName = customer.customerAccount?.companyName || customer.companyName || ''

  const customerData = {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    companyName: customerCompanyName,
  }

  const headerData = {
    certificateNumber: certificate.certificateNumber,
    status: certificate.status,
    statusLabel: statusConfig.label,
    statusClassName: statusConfig.className,
    customerName: certificate.customerName || '-',
    currentRevision: certificate.currentRevision,
    dateOfCalibration: certificate.dateOfCalibration?.toISOString() || null,
  }

  return (
    <TokenReviewClient
      token={token}
      certificate={certificateData}
      customer={customerData}
      signatures={signatures}
      chatThreadId={chatThread?.id || null}
      headerData={headerData}
      expiresAt={expiresAt?.toISOString() || null}
      sentAt={sentAt?.toISOString() || null}
    />
  )
}
