import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/utils/safe-json'
import { AdminCertificateClient } from './AdminCertificateClient'

// Render at runtime, not build time (needs database)
export const dynamic = 'force-dynamic'

// Status badge configuration
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-[#fffbeb] text-[#d97706] border-[#fde68a]' },
  PENDING_REVIEW: { label: 'Pending Review', className: 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]' },
  REVISION_REQUIRED: { label: 'Revision Required', className: 'bg-[#fff7ed] text-[#ea580c] border-[#fed7aa]' },
  PENDING_CUSTOMER_APPROVAL: { label: 'Pending Customer', className: 'bg-[#faf5ff] text-[#7c3aed] border-[#e9d5ff]' },
  CUSTOMER_REVISION_REQUIRED: { label: 'Customer Revision', className: 'bg-[#fdf2f8] text-[#db2777] border-[#fbcfe8]' },
  PENDING_ADMIN_AUTHORIZATION: { label: 'Pending Authorization', className: 'bg-[#eef2ff] text-[#4f46e5] border-[#c7d2fe]' },
  APPROVED: { label: 'Approved', className: 'bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]' },
  AUTHORIZED: { label: 'Authorized', className: 'bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]' },
  REJECTED: { label: 'Rejected', className: 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]' },
}

interface Props {
  params: Promise<{ id: string }>
}

// Calculate TAT (Turn Around Time)
// If endDate is provided (for authorized certificates), calculate TAT up to that point
// Otherwise calculate TAT up to now
function calculateTAT(createdAt: Date, endDate?: Date | null): { hours: number; status: 'ok' | 'warning' | 'overdue' } {
  const end = endDate || new Date()
  const diffMs = end.getTime() - createdAt.getTime()
  const hours = Math.floor(diffMs / (1000 * 60 * 60))

  if (hours > 48) {
    return { hours, status: 'overdue' }
  } else if (hours > 24) {
    return { hours, status: 'warning' }
  }
  return { hours, status: 'ok' }
}

async function getCertificateDetails(id: string) {
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
      feedbacks: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { name: true, role: true },
          },
        },
      },
      chatThreads: {
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
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

  return certificate
}

export default async function AdminCertificatePage({ params }: Props) {
  const { id } = await params
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Only ADMIN role can access
  if (session.user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  const certificate = await getCertificateDetails(id)

  if (!certificate) {
    notFound()
  }

  // Calculate TAT: from first submission to admin authorization
  // Start: first SUBMITTED_FOR_REVIEW event
  // End: ADMIN_AUTHORIZED event (if authorized) or now
  const submissionEvents = certificate.events.filter(e => e.eventType === 'SUBMITTED_FOR_REVIEW')
  const firstSubmission = submissionEvents.length > 0
    ? submissionEvents.reduce((earliest, e) => e.createdAt < earliest.createdAt ? e : earliest)
    : null
  const authorizedEvent = certificate.status === 'AUTHORIZED'
    ? certificate.events.find(e => e.eventType === 'ADMIN_AUTHORIZED')
    : null
  const tat = firstSubmission
    ? calculateTAT(firstSubmission.createdAt, authorizedEvent?.createdAt)
    : { hours: 0, status: 'ok' as const }

  // Parse JSON fields
  const conclusionStatements = safeJsonParse<string[]>(certificate.selectedConclusionStatements, [])
  const calibrationStatus = safeJsonParse<string[]>(certificate.calibrationStatus, [])

  // Get chat threads by type
  const engineerThread = certificate.chatThreads.find(t => t.threadType === 'ASSIGNEE_REVIEWER')
  const customerThread = certificate.chatThreads.find(t => t.threadType === 'REVIEWER_CUSTOMER')

  // Get status config
  const statusConfig = STATUS_CONFIG[certificate.status] || STATUS_CONFIG.PENDING_REVIEW

  // Get list of reviewers for reassignment dropdown (any engineer except admin)
  const reviewers = await prisma.user.findMany({
    where: {
      role: { not: 'ADMIN' },
      id: { not: certificate.createdById },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: { name: 'asc' },
  })

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

  return (
    <AdminCertificateClient
      certificate={{
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
        createdAt: certificate.createdAt.toISOString(),
        updatedAt: certificate.updatedAt.toISOString(),
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
      }}
      assignee={{
        id: certificate.createdBy.id,
        name: certificate.createdBy.name || 'Unknown',
        email: certificate.createdBy.email,
      }}
      reviewer={certificate.reviewer ? {
        id: certificate.reviewer.id,
        name: certificate.reviewer.name || 'Unknown',
        email: certificate.reviewer.email,
      } : null}
      feedbacks={serializedFeedbacks}
      events={serializedEvents}
      chatThreadIds={{
        engineer: engineerThread?.id || null,
        customer: customerThread?.id || null,
      }}
      headerData={{
        certificateNumber: certificate.certificateNumber,
        status: certificate.status,
        statusLabel: statusConfig.label,
        statusClassName: statusConfig.className,
        tat,
        assigneeName: certificate.createdBy.name || 'Unknown',
        customerName: certificate.customerName || '-',
        calibratedAt: certificate.calibratedAt,
        currentRevision: certificate.currentRevision,
      }}
      reviewers={reviewers}
    />
  )
}
