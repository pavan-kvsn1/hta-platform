import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/utils/safe-json'
import { CustomerCertReviewClient } from './CustomerCertReviewClient'

// Render at runtime, not build time (needs database)
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

// Status badge configuration
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING_CUSTOMER_APPROVAL: { label: 'Pending Your Approval', className: 'bg-[#f5f3ff] text-[#7c3aed] border-[#e9d5ff]' },
  CUSTOMER_REVISION_REQUIRED: { label: 'Revision in Progress', className: 'bg-[#fff7ed] text-[#ea580c] border-[#fed7aa]' },
  REVISION_REQUIRED: { label: 'Under Revision', className: 'bg-[#fffbeb] text-[#d97706] border-[#fde68a]' },
  PENDING_ADMIN_AUTHORIZATION: { label: 'Pending Authorization', className: 'bg-[#eef2ff] text-[#4f46e5] border-[#c7d2fe]' },
  APPROVED: { label: 'Approved', className: 'bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]' },
  AUTHORIZED: { label: 'Authorized', className: 'bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]' },
}

export default async function CustomerCertReviewPage({ params }: Props) {
  const { id } = await params
  const session = await auth()

  // Must be logged in as customer
  if (!session?.user || session.user.role !== 'CUSTOMER') {
    redirect('/customer/login')
  }

  const customerEmail = session.user.email!

  // Get customer info with account
  const customer = await prisma.customerUser.findFirst({
    where: { email: customerEmail },
    include: { customerAccount: true },
  })

  if (!customer) {
    redirect('/customer/login')
  }

  // Get certificate with all related data
  const certificate = await prisma.certificate.findUnique({
    where: { id },
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

  // Get company name from customerAccount (preferred) or fallback to legacy companyName field
  const customerCompanyName = customer.customerAccount?.companyName || customer.companyName || ''

  // Verify access: certificate's customerName must match customer's companyName
  const allowedStatuses = [
    'PENDING_CUSTOMER_APPROVAL',
    'CUSTOMER_REVISION_REQUIRED',
    'REVISION_REQUIRED',
    'APPROVED',
    'PENDING_ADMIN_AUTHORIZATION',
    'PENDING_ADMIN_APPROVAL',
    'AUTHORIZED',
  ]

  const hasAccess =
    allowedStatuses.includes(certificate.status) &&
    !!customerCompanyName &&
    certificate.customerName?.toLowerCase() === customerCompanyName.toLowerCase()

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4">
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-lg p-8 max-w-md w-full text-center">
          <div className="size-14 bg-[#fef2f2] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="size-7 text-[#dc2626]"
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
          <h1 className="text-[18px] font-bold text-[#0f172a] mb-2">Access Denied</h1>
          <p className="text-[13px] text-[#64748b] mb-6">
            You don&apos;t have permission to review this certificate.
          </p>
          <div className="space-y-3">
            <a
              href="/customer/dashboard"
              className="block w-full py-2.5 px-4 bg-[#0f172a] text-white text-[13px] font-semibold rounded-[9px] hover:bg-[#1e293b] transition-colors"
            >
              Go to Dashboard
            </a>
            <p className="text-[12px] text-[#94a3b8]">
              Need help?{' '}
              <a href="mailto:calibration@htainstruments.com" className="text-[#2563eb] hover:underline">
                Contact HTA
              </a>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Parse JSON fields
  const conclusionStatements = safeJsonParse<string[]>(certificate.selectedConclusionStatements, [])
  const calibrationStatus = safeJsonParse<string[]>(certificate.calibrationStatus, [])

  // Get chat thread
  const chatThread = certificate.chatThreads[0] || null

  // Get approval token for TAT tracking (if exists)
  const approvalToken = await prisma.approvalToken.findFirst({
    where: { certificateId: certificate.id },
    orderBy: { createdAt: 'desc' },
  })

  // Get status config
  const statusConfig = STATUS_CONFIG[certificate.status] || { label: certificate.status, className: 'bg-[#f8fafc] text-[#64748b] border-[#e2e8f0]' }

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
    <CustomerCertReviewClient
      certificate={certificateData}
      customer={customerData}
      signatures={signatures}
      chatThreadId={chatThread?.id || null}
      headerData={headerData}
      expiresAt={approvalToken?.expiresAt?.toISOString() || null}
      sentAt={approvalToken?.createdAt?.toISOString() || null}
    />
  )
}
