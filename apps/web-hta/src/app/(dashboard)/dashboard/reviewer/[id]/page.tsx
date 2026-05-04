import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/utils/safe-json'
import { ReviewerPageClient } from './ReviewerPageClient'

// Render at runtime, not build time (needs database)
export const dynamic = 'force-dynamic'

// Status badge configuration
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-amber-50 text-amber-600 border-amber-100' },
  PENDING_REVIEW: { label: 'Pending Review', className: 'bg-blue-50 text-blue-600 border-blue-100' },
  REVISION_REQUIRED: { label: 'Revision Required', className: 'bg-orange-50 text-orange-600 border-orange-100' },
  CUSTOMER_REVISION_REQUIRED: { label: 'Customer Feedback', className: 'bg-purple-50 text-purple-600 border-purple-100' },
  PENDING_CUSTOMER_APPROVAL: { label: 'Pending Customer', className: 'bg-purple-50 text-purple-600 border-purple-100' },
  PENDING_ADMIN_AUTHORIZATION: { label: 'Pending Authorization', className: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  APPROVED: { label: 'Approved', className: 'bg-green-50 text-green-600 border-green-100' },
  AUTHORIZED: { label: 'Authorized', className: 'bg-green-50 text-green-600 border-green-100' },
  REJECTED: { label: 'Rejected', className: 'bg-red-50 text-red-600 border-red-100' },
  CUSTOMER_REVIEW_EXPIRED: { label: 'Review Expired', className: 'bg-red-50 text-red-600 border-red-100' },
}

interface Props {
  params: Promise<{ id: string }>
}

async function getCertificateDetails(id: string, userId: string, userRole: string) {
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
        where: { threadType: 'ASSIGNEE_REVIEWER' },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  })

  // Admins can view any certificate, others must be the assigned reviewer
  if (certificate && userRole !== 'ADMIN' && certificate.reviewerId !== userId) {
    return null
  }

  return certificate
}

// Calculate TAT (Turn Around Time) from submission
function calculateTAT(submittedAt: Date | null): { hours: number; status: 'ok' | 'warning' | 'overdue' } {
  if (!submittedAt) {
    return { hours: 0, status: 'ok' }
  }

  const now = new Date()
  const diffMs = now.getTime() - submittedAt.getTime()
  const hours = Math.floor(diffMs / (1000 * 60 * 60))

  // Define thresholds (adjust as needed)
  if (hours > 48) {
    return { hours, status: 'overdue' }
  } else if (hours > 24) {
    return { hours, status: 'warning' }
  }
  return { hours, status: 'ok' }
}

function _formatTAT(hours: number): string {
  if (hours < 24) {
    return `${hours}h`
  }
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  if (remainingHours === 0) {
    return `${days}d`
  }
  return `${days}d ${remainingHours}h`
}

export default async function ReviewerReviewPage({ params }: Props) {
  const { id } = await params
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const certificate = await getCertificateDetails(id, session.user.id, session.user.role || '')

  if (!certificate) {
    notFound()
  }

  // Calculate TAT using createdAt since submittedAt might not be available
  const tat = calculateTAT(certificate.updatedAt)

  // Parse conclusion statements
  const conclusionStatements = safeJsonParse<string[]>(
    certificate.selectedConclusionStatements,
    []
  )

  // Parse calibration status
  const calibrationStatus = safeJsonParse<string[]>(
    certificate.calibrationStatus,
    []
  )

  // Get chat thread if exists
  const chatThread = certificate.chatThreads[0] || null

  // Get latest customer feedback (show in timeline for its respective revision)
  let customerFeedback: {
    notes: string
    sectionFeedbacks: { section: string; comment: string }[] | null
    generalNotes: string | null
    customerName: string
    customerEmail: string
    requestedAt: string
    revision: number
  } | null = null

  // Fetch the most recent customer feedback event (regardless of revision)
  const latestCustomerEvent = await prisma.certificateEvent.findFirst({
    where: {
      certificateId: certificate.id,
      eventType: 'CUSTOMER_REVISION_REQUESTED',
    },
    orderBy: { createdAt: 'desc' },
  })

  if (latestCustomerEvent?.eventData) {
    interface CustomerEventData {
      notes?: string
      sectionFeedbacks?: { section: string; comment: string }[]
      generalNotes?: string
      customerName?: string
      customerEmail?: string
      requestedAt?: string
    }
    const eventData = safeJsonParse<CustomerEventData>(latestCustomerEvent.eventData, {})
    if (Object.keys(eventData).length > 0) {
      customerFeedback = {
        notes: eventData.notes || '',
        sectionFeedbacks: eventData.sectionFeedbacks ?? null,
        generalNotes: eventData.generalNotes || null,
        customerName: eventData.customerName || 'Customer',
        customerEmail: eventData.customerEmail || '',
        requestedAt: eventData.requestedAt || latestCustomerEvent.createdAt.toISOString(),
        revision: latestCustomerEvent.revision,
      }
    } else {
      // Fallback to statusNotes if event data parsing fails
      customerFeedback = {
        notes: certificate.statusNotes || '',
        sectionFeedbacks: null,
        generalNotes: null,
        customerName: 'Customer',
        customerEmail: '',
        requestedAt: latestCustomerEvent.createdAt.toISOString(),
        revision: latestCustomerEvent.revision,
      }
    }
  }

  // Fetch customer email from SENT_TO_CUSTOMER event if not available in customerFeedback
  let lastSentCustomerEmail: string | null = null
  let lastSentCustomerName: string | null = null

  const latestSentEvent = await prisma.certificateEvent.findFirst({
    where: {
      certificateId: certificate.id,
      eventType: 'SENT_TO_CUSTOMER',
    },
    orderBy: { createdAt: 'desc' },
  })

  if (latestSentEvent?.eventData) {
    interface SentEventData {
      customerEmail?: string
      customerName?: string
    }
    const sentData = safeJsonParse<SentEventData>(latestSentEvent.eventData, {})
    lastSentCustomerEmail = sentData.customerEmail || null
    lastSentCustomerName = sentData.customerName || null
  }

  // Get TAT start time — when the reviewer's clock started ticking
  let tatStartedAt: string | null = null

  if (['PENDING_REVIEW', 'CUSTOMER_REVISION_REQUIRED'].includes(certificate.status)) {
    const tatEvent = await prisma.certificateEvent.findFirst({
      where: {
        certificateId: certificate.id,
        eventType: {
          in: ['SUBMITTED_FOR_REVIEW', 'RESUBMITTED_FOR_REVIEW', 'CUSTOMER_REVISION_REQUESTED'],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    tatStartedAt = tatEvent?.createdAt?.toISOString() || null
  }

  // Fetch all internal requests for this certificate (field changes + section unlocks)
  // FIELD_CHANGE enum not in generated client yet — filter in JS until next prisma generate
  const allInternalRequests = await prisma.internalRequest.findMany({
    where: { certificateId: certificate.id },
    orderBy: { createdAt: 'desc' },
  })
  const fieldChangeRequests = allInternalRequests.filter(r => (r.type as string) === 'FIELD_CHANGE')
  const sectionUnlockRequests = allInternalRequests.filter(r => (r.type as string) === 'SECTION_UNLOCK')

  // Lookup names for reviewedBy and requestedBy
  const allUserIds = [
    ...allInternalRequests.map(r => r.reviewedById).filter(Boolean),
    ...allInternalRequests.map(r => r.requestedById).filter(Boolean),
  ] as string[]
  const uniqueUserIds = [...new Set(allUserIds)]
  const allRequestUsers = uniqueUserIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: uniqueUserIds } }, select: { id: true, name: true } })
    : []
  const userNameMap = new Map(allRequestUsers.map(u => [u.id, u.name]))

  const serializedFieldChangeRequests = fieldChangeRequests.map((r) => {
    let data: { fields?: string[]; description?: string } = { fields: [], description: '' }
    try { data = JSON.parse(r.data) } catch { /* ignore */ }
    return {
      id: r.id,
      status: r.status as 'PENDING' | 'APPROVED' | 'REJECTED',
      fields: data.fields || [],
      description: data.description || '',
      adminNote: r.adminNote,
      reviewedBy: r.reviewedById ? (userNameMap.get(r.reviewedById) || null) : null,
      reviewedAt: r.reviewedAt?.toISOString() || null,
      createdAt: r.createdAt.toISOString(),
    }
  })

  const serializedSectionUnlockRequests = sectionUnlockRequests.map((r) => {
    let data: { sections?: string[]; reason?: string; revisionNumber?: number } = { sections: [], reason: '' }
    try { data = JSON.parse(r.data) } catch { /* ignore */ }
    return {
      id: r.id,
      type: 'SECTION_UNLOCK' as const,
      status: r.status as 'PENDING' | 'APPROVED' | 'REJECTED',
      sections: data.sections || [],
      reason: data.reason || '',
      adminNote: r.adminNote,
      requestedByName: r.requestedById ? (userNameMap.get(r.requestedById) || undefined) : undefined,
      reviewedByName: r.reviewedById ? (userNameMap.get(r.reviewedById) || null) : null,
      createdAt: r.createdAt.toISOString(),
      revisionNumber: data.revisionNumber,
    }
  })

  // Fallback: look up customer contact email from CustomerAccount if not on the certificate
  let resolvedContactEmail = certificate.customerContactEmail
  let resolvedContactName = certificate.customerContactName
  if (!resolvedContactEmail && certificate.customerName) {
    const customerAccount = await prisma.customerAccount.findFirst({
      where: { companyName: certificate.customerName, tenantId: certificate.tenantId },
      select: {
        contactEmail: true,
        primaryPoc: { select: { name: true, email: true } },
      },
    })
    if (customerAccount) {
      resolvedContactEmail = customerAccount.primaryPoc?.email || customerAccount.contactEmail || null
      if (!resolvedContactName) {
        resolvedContactName = customerAccount.primaryPoc?.name || null
      }
    }
  }

  // Serialize feedbacks for client
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

  // Get status config
  const statusConfig = STATUS_CONFIG[certificate.status] || STATUS_CONFIG.PENDING_REVIEW

  // Prepare header data for client component
  const headerData = {
    certificateNumber: certificate.certificateNumber,
    status: certificate.status,
    statusLabel: statusConfig.label,
    statusClassName: statusConfig.className,
    tat,
    assigneeName: certificate.createdBy.name || 'Unknown',
    customerName: certificate.customerName || '-',
    calibratedAt: certificate.calibratedAt,
    currentRevision: certificate.currentRevision,
  }

  return (
    <ReviewerPageClient
      certificate={{
        id: certificate.id,
        certificateNumber: certificate.certificateNumber,
        status: certificate.status,
        customerName: certificate.customerName,
        customerAddress: certificate.customerAddress,
        customerContactName: resolvedContactName,
        customerContactEmail: resolvedContactEmail,
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
      }}
      assignee={{
        id: certificate.createdBy.id,
        name: certificate.createdBy.name || 'Unknown',
        email: certificate.createdBy.email,
      }}
      feedbacks={serializedFeedbacks}
      chatThreadId={chatThread?.id || null}
      headerData={headerData}
      userRole={session.user.role || ''}
      customerFeedback={customerFeedback}
      lastSentCustomerInfo={lastSentCustomerEmail || lastSentCustomerName ? {
        email: lastSentCustomerEmail,
        name: lastSentCustomerName,
      } : null}
      tatStartedAt={tatStartedAt}
      certificateCreatedAt={certificate.createdAt.toISOString()}
      fieldChangeRequests={serializedFieldChangeRequests}
      sectionUnlockRequests={serializedSectionUnlockRequests}
    />
  )
}
