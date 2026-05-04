import { redirect, notFound } from 'next/navigation'
import { auth, canAccessAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/utils/safe-json'
import { AdminAuthorizationClient } from './AdminAuthorizationClient'
import type { ParameterBin } from '@/lib/stores/certificate-store'
import type { SignatureInfo } from '@/components/certificates'
import type { CertificateFormData } from './AdminAuthContent'

// Render at runtime, not build time (needs database)
export const dynamic = 'force-dynamic'

// Status badge configuration
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-[#fffbeb] text-[#d97706] border-[#fef3c7]' },
  PENDING_REVIEW: { label: 'Pending Review', className: 'bg-[#eff6ff] text-[#2563eb] border-[#dbeafe]' },
  REVISION_REQUIRED: { label: 'Revision Required', className: 'bg-[#fff7ed] text-[#ea580c] border-[#ffedd5]' },
  PENDING_CUSTOMER_APPROVAL: { label: 'Pending Customer', className: 'bg-[#faf5ff] text-[#9333ea] border-[#f3e8ff]' },
  CUSTOMER_REVISION_REQUIRED: { label: 'Customer Revision', className: 'bg-[#fdf2f8] text-[#db2777] border-[#fce7f3]' },
  PENDING_ADMIN_AUTHORIZATION: { label: 'Pending Authorization', className: 'bg-[#eef2ff] text-[#4f46e5] border-[#e0e7ff]' },
  APPROVED: { label: 'Approved', className: 'bg-[#f0fdf4] text-[#16a34a] border-[#dcfce7]' },
  AUTHORIZED: { label: 'Authorized', className: 'bg-[#f0fdf4] text-[#16a34a] border-[#dcfce7]' },
  REJECTED: { label: 'Rejected', className: 'bg-[#fef2f2] text-[#dc2626] border-[#fee2e2]' },
  CUSTOMER_REVIEW_EXPIRED: { label: 'Review Expired', className: 'bg-[#fef2f2] text-[#dc2626] border-[#fee2e2]' },
}

interface Props {
  params: Promise<{ id: string }>
}

async function getCertificateData(id: string) {
  // Get certificate with full data including feedbacks and events
  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: {
      parameters: {
        include: {
          results: {
            orderBy: { pointNumber: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      masterInstruments: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      feedbacks: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { name: true, role: true },
          },
        },
      },
      events: {
        orderBy: { sequenceNumber: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, role: true },
          },
          customer: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  })

  if (!certificate) {
    return null
  }

  // Serialize feedbacks
  const serializedFeedbacks = certificate.feedbacks.map((f) => ({
    id: f.id,
    feedbackType: f.feedbackType,
    comment: f.comment,
    createdAt: f.createdAt.toISOString(),
    revisionNumber: f.revisionNumber,
    targetSection: f.targetSection,
    user: {
      name: f.user.name,
      role: f.user.role,
    },
  }))

  // Serialize events for audit log
  const serializedEvents = certificate.events.map((e) => ({
    id: e.id,
    sequenceNumber: e.sequenceNumber,
    revision: e.revision,
    eventType: e.eventType,
    eventData: e.eventData ? (typeof e.eventData === 'string' ? e.eventData : JSON.stringify(e.eventData)) : '',
    userRole: e.userRole,
    createdAt: e.createdAt.toISOString(),
    user: e.user ? {
      id: e.user.id,
      name: e.user.name,
      role: e.user.role,
    } : null,
    customer: e.customer ? {
      id: e.customer.id,
      name: e.customer.name,
      email: e.customer.email,
    } : null,
  }))

  // Fetch signature records for this certificate
  const dbSignatures = await prisma.signature.findMany({
    where: { certificateId: id },
    orderBy: { signedAt: 'desc' },
  })

  // Fetch signing evidence for current revision to validate signatures
  const signingEvidence = await prisma.signingEvidence.findMany({
    where: {
      certificateId: id,
      revision: certificate.currentRevision,
    },
    orderBy: { sequenceNumber: 'asc' },
  })

  // Helper to check if signature has evidence for current revision
  const hasEvidenceForCurrentRevision = (signatureId: string, signerType: string): boolean => {
    const eventTypeMap: Record<string, string> = {
      'ASSIGNEE': 'ASSIGNEE_SIGNED',
      'REVIEWER': 'REVIEWER_SIGNED',
      'ADMIN': 'ADMIN_SIGNED',
      'CUSTOMER': 'CUSTOMER_SIGNED',
    }
    return signingEvidence.some(e =>
      e.signatureId === signatureId || e.eventType === eventTypeMap[signerType]
    )
  }

  // Build signatures array for SignatureStatusBar
  const signatures: SignatureInfo[] = []

  const assigneeSig = dbSignatures.find(s => s.signerType === 'ASSIGNEE')
  const reviewerSig = dbSignatures.find(s => s.signerType === 'REVIEWER')
  const customerSig = dbSignatures.find(s => s.signerType === 'CUSTOMER')
  const adminSig = dbSignatures.find(s => s.signerType === 'ADMIN')

  if (assigneeSig && hasEvidenceForCurrentRevision(assigneeSig.id, 'ASSIGNEE')) {
    signatures.push({
      signerType: 'ASSIGNEE',
      signerName: assigneeSig.signerName,
      signedAt: assigneeSig.signedAt.toISOString(),
    })
  }

  if (reviewerSig && hasEvidenceForCurrentRevision(reviewerSig.id, 'REVIEWER')) {
    signatures.push({
      signerType: 'REVIEWER',
      signerName: reviewerSig.signerName,
      signedAt: reviewerSig.signedAt.toISOString(),
    })
  }

  if (customerSig && hasEvidenceForCurrentRevision(customerSig.id, 'CUSTOMER')) {
    signatures.push({
      signerType: 'CUSTOMER',
      signerName: customerSig.signerName,
      signedAt: customerSig.signedAt.toISOString(),
    })
  }

  if (adminSig && hasEvidenceForCurrentRevision(adminSig.id, 'ADMIN')) {
    signatures.push({
      signerType: 'ADMIN',
      signerName: adminSig.signerName,
      signedAt: adminSig.signedAt.toISOString(),
    })
  }

  // Build form data for content display
  const formData: CertificateFormData = {
    certificateNumber: certificate.certificateNumber,
    calibratedAt: certificate.calibratedAt || 'LAB',
    srfNumber: certificate.srfNumber || '',
    srfDate: certificate.srfDate?.toISOString().split('T')[0] || '',
    dateOfCalibration: certificate.dateOfCalibration?.toISOString().split('T')[0] || '',
    calibrationDueDate: certificate.calibrationDueDate?.toISOString().split('T')[0] || '',
    dueDateNotApplicable: certificate.dueDateNotApplicable || false,
    customerName: certificate.customerName || '',
    customerAddress: certificate.customerAddress || '',
    uucDescription: certificate.uucDescription || '',
    uucMake: certificate.uucMake || '',
    uucModel: certificate.uucModel || '',
    uucSerialNumber: certificate.uucSerialNumber || '',
    uucLocationName: certificate.uucLocationName || '',
    ambientTemperature: certificate.ambientTemperature || '',
    relativeHumidity: certificate.relativeHumidity || '',
    calibrationStatus: safeJsonParse<string[]>(certificate.calibrationStatus, []),
    selectedConclusionStatements: safeJsonParse<string[]>(certificate.selectedConclusionStatements, []),
    additionalConclusionStatement: certificate.additionalConclusionStatement || '',
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
      errorFormula: param.errorFormula || 'A-B',
      showAfterAdjustment: param.showAfterAdjustment || false,
      requiresBinning: param.requiresBinning || false,
      bins: safeJsonParse<ParameterBin[]>(param.bins, []),
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
      description: mi.description || '',
      make: mi.make || '',
      model: mi.model || '',
      serialNumber: mi.serialNumber || '',
      calibrationDueDate: mi.calibrationDueDate || '',
    })),
  }

  return {
    certificate: {
      id: certificate.id,
      certificateNumber: certificate.certificateNumber,
      status: certificate.status,
      currentRevision: certificate.currentRevision,
      customerName: certificate.customerName,
      dateOfCalibration: certificate.dateOfCalibration?.toISOString() || null,
      createdBy: certificate.createdBy,
    },
    formData,
    signatures,
    feedbacks: serializedFeedbacks,
    events: serializedEvents,
    calibratedAt: certificate.calibratedAt,
    customerContactName: certificate.customerContactName,
    customerContactEmail: certificate.customerContactEmail,
    certificateCreatedAt: certificate.createdAt.toISOString(),
  }
}

export default async function AdminAuthorizationPage({ params }: Props) {
  const { id } = await params
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (!canAccessAdmin(session.user)) {
    redirect('/dashboard')
  }

  const data = await getCertificateData(id)

  if (!data) {
    notFound()
  }

  // Get status config
  const statusConfig = STATUS_CONFIG[data.certificate.status] || STATUS_CONFIG.PENDING_ADMIN_AUTHORIZATION

  // Prepare header data
  const headerData = {
    certificateNumber: data.certificate.certificateNumber,
    status: data.certificate.status,
    statusLabel: statusConfig.label,
    statusClassName: statusConfig.className,
    assigneeName: data.certificate.createdBy?.name || 'Unknown',
    customerName: data.certificate.customerName || '-',
    calibratedAt: data.calibratedAt,
    currentRevision: data.certificate.currentRevision,
    dateOfCalibration: data.certificate.dateOfCalibration,
  }

  // Compute TAT start for authorization phase (12h target)
  const isTerminal = ['AUTHORIZED', 'REJECTED'].includes(data.certificate.status)
  const tatStartedAt = !isTerminal
    ? data.events
        .filter(e => e.eventType === 'SUBMITTED_FOR_AUTHORIZATION')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
        ?.createdAt || null
    : null

  return (
    <AdminAuthorizationClient
      certificate={data.certificate}
      formData={data.formData}
      signatures={data.signatures}
      feedbacks={data.feedbacks}
      events={data.events}
      headerData={headerData}
      customerEmail={data.customerContactEmail}
      customerContactName={data.customerContactName}
      tatStartedAt={tatStartedAt}
      certificateCreatedAt={data.certificateCreatedAt}
    />
  )
}
