'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { apiFetch } from '@/lib/api-client'
import { Loader2 } from 'lucide-react'
import { ReviewerPageClient } from './ReviewerPageClient'

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

function calculateTAT(updatedAt: string | null): { hours: number; status: 'ok' | 'warning' | 'overdue' } {
  if (!updatedAt) return { hours: 0, status: 'ok' }
  const hours = Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60))
  if (hours > 48) return { hours, status: 'overdue' }
  if (hours > 24) return { hours, status: 'warning' }
  return { hours, status: 'ok' }
}

export default function ReviewerReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const [props, setProps] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id || !session?.user) return

    async function fetchData() {
      try {
        // Fetch certificate with all includes
        const certRes = await apiFetch(`/api/certificates/${id}`)
        if (!certRes.ok) {
          setError(certRes.status === 404 ? 'Certificate not found' : 'Failed to load certificate')
          return
        }
        const cert = await certRes.json()

        // Fetch internal requests for this certificate
        const reqRes = await apiFetch(`/api/internal-requests?certificateId=${id}`)
        const allRequests = reqRes.ok ? (await reqRes.json()).requests || [] : []

        const fieldChangeRequests = allRequests
          .filter((r: Record<string, unknown>) => r.type === 'FIELD_CHANGE')
          .map((r: Record<string, unknown>) => {
            const data = typeof r.data === 'string' ? JSON.parse(r.data as string) : (r.data || {})
            return {
              id: r.id,
              status: r.status,
              fields: data.fields || [],
              description: data.description || '',
              adminNote: r.adminNote,
              reviewedBy: r.reviewedByName || null,
              reviewedAt: r.reviewedAt || null,
              createdAt: r.createdAt,
            }
          })

        const sectionUnlockRequests = allRequests
          .filter((r: Record<string, unknown>) => r.type === 'SECTION_UNLOCK')
          .map((r: Record<string, unknown>) => {
            const data = typeof r.data === 'string' ? JSON.parse(r.data as string) : (r.data || {})
            return {
              id: r.id,
              type: 'SECTION_UNLOCK' as const,
              status: r.status,
              sections: data.sections || [],
              reason: data.reason || '',
              adminNote: r.adminNote,
              requestedByName: r.requestedByName || undefined,
              reviewedByName: r.reviewedByName || null,
              createdAt: r.createdAt,
              revisionNumber: data.revisionNumber,
            }
          })

        // Extract customer feedback from events
        const events = cert.events || []
        const customerRevisionEvent = events.find((e: Record<string, unknown>) => e.eventType === 'CUSTOMER_REVISION_REQUESTED')
        let customerFeedback: Record<string, unknown> | null = null
        if (customerRevisionEvent?.eventData) {
          const eventData = typeof customerRevisionEvent.eventData === 'string'
            ? JSON.parse(customerRevisionEvent.eventData)
            : customerRevisionEvent.eventData
          customerFeedback = {
            notes: eventData.notes || '',
            sectionFeedbacks: eventData.sectionFeedbacks ?? null,
            generalNotes: eventData.generalNotes || null,
            customerName: eventData.customerName || 'Customer',
            customerEmail: eventData.customerEmail || '',
            requestedAt: eventData.requestedAt || customerRevisionEvent.createdAt,
            revision: customerRevisionEvent.revision,
          }
        }

        // Extract customer send info
        const sentEvent = events.find((e: Record<string, unknown>) => e.eventType === 'SENT_TO_CUSTOMER')
        const lastSentCustomerInfo = sentEvent?.eventData
          ? (() => {
              const d = typeof sentEvent.eventData === 'string' ? JSON.parse(sentEvent.eventData) : sentEvent.eventData
              return d.customerEmail || d.customerName ? { email: d.customerEmail || null, name: d.customerName || null } : null
            })()
          : null

        // TAT start time
        let tatStartedAt = null
        if (['PENDING_REVIEW', 'CUSTOMER_REVISION_REQUIRED'].includes(cert.status)) {
          const tatEvent = events.find((e: Record<string, unknown>) =>
            ['SUBMITTED_FOR_REVIEW', 'RESUBMITTED_FOR_REVIEW', 'CUSTOMER_REVISION_REQUESTED'].includes(e.eventType as string)
          )
          tatStartedAt = tatEvent?.createdAt || null
        }

        const statusConfig = STATUS_CONFIG[cert.status] || STATUS_CONFIG.PENDING_REVIEW
        const tat = calculateTAT(cert.updatedAt)

        // Parse JSON fields
        const calibrationStatus = typeof cert.calibrationStatus === 'string'
          ? JSON.parse(cert.calibrationStatus) : (cert.calibrationStatus || [])
        const conclusionStatements = typeof cert.selectedConclusionStatements === 'string'
          ? JSON.parse(cert.selectedConclusionStatements) : (cert.selectedConclusionStatements || [])

        setProps({
          certificate: {
            id: cert.id,
            certificateNumber: cert.certificateNumber,
            status: cert.status,
            customerName: cert.customerName,
            customerAddress: cert.customerAddress,
            customerContactName: cert.customerContactName,
            customerContactEmail: cert.customerContactEmail,
            calibratedAt: cert.calibratedAt,
            srfNumber: cert.srfNumber,
            srfDate: cert.srfDate,
            dateOfCalibration: cert.dateOfCalibration,
            calibrationDueDate: cert.calibrationDueDate,
            dueDateNotApplicable: cert.dueDateNotApplicable,
            uucDescription: cert.uucDescription,
            uucMake: cert.uucMake,
            uucModel: cert.uucModel,
            uucSerialNumber: cert.uucSerialNumber,
            uucLocationName: cert.uucLocationName,
            ambientTemperature: cert.ambientTemperature,
            relativeHumidity: cert.relativeHumidity,
            calibrationStatus,
            conclusionStatements,
            additionalConclusionStatement: cert.additionalConclusionStatement,
            currentRevision: cert.currentRevision,
            parameters: (cert.parameters || []).map((p: Record<string, unknown>) => ({
              ...p,
              bins: p.bins ? (typeof p.bins === 'string' ? p.bins : JSON.stringify(p.bins)) : null,
              results: (p.results as Record<string, unknown>[])?.map((r: Record<string, unknown>) => ({
                id: r.id,
                pointNumber: r.pointNumber,
                standardReading: r.standardReading,
                beforeAdjustment: r.beforeAdjustment,
                afterAdjustment: r.afterAdjustment,
                errorObserved: r.errorObserved,
                isOutOfLimit: r.isOutOfLimit,
              })) || [],
            })),
            masterInstruments: cert.masterInstruments || [],
          },
          assignee: {
            id: cert.createdBy?.id,
            name: cert.createdBy?.name || 'Unknown',
            email: cert.createdBy?.email,
          },
          feedbacks: (cert.feedbacks || []).map((f: Record<string, unknown>) => ({
            id: f.id,
            feedbackType: f.feedbackType,
            comment: f.comment,
            createdAt: f.createdAt,
            revisionNumber: f.revisionNumber,
            targetSection: f.targetSection,
            user: f.user,
          })),
          chatThreadId: cert.chatThreads?.[0]?.id || null,
          headerData: {
            certificateNumber: cert.certificateNumber,
            status: cert.status,
            statusLabel: statusConfig.label,
            statusClassName: statusConfig.className,
            tat,
            assigneeName: cert.createdBy?.name || 'Unknown',
            customerName: cert.customerName || '-',
            calibratedAt: cert.calibratedAt,
            currentRevision: cert.currentRevision,
          },
          userRole: session?.user?.role || '',
          customerFeedback,
          lastSentCustomerInfo,
          tatStartedAt,
          certificateCreatedAt: cert.createdAt,
          fieldChangeRequests,
          sectionUnlockRequests,
        })
      } catch {
        setError('Failed to load certificate data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id, session?.user])

  if (loading) {
    return (
      <div className="h-full bg-[#f1f5f9] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#7c3aed]" />
      </div>
    )
  }

  if (error || !props) {
    return (
      <div className="h-full bg-[#f1f5f9] flex items-center justify-center">
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-8 max-w-md text-center">
          <p className="text-[14px] text-[#dc2626] mb-4">{error || 'No data'}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-[#7c3aed] hover:bg-[#6d28d9] rounded-[9px]"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <ReviewerPageClient
      certificate={props.certificate as never}
      assignee={props.assignee as never}
      feedbacks={props.feedbacks as never}
      chatThreadId={props.chatThreadId as string | null}
      headerData={props.headerData as never}
      userRole={props.userRole as string}
      customerFeedback={props.customerFeedback as never}
      lastSentCustomerInfo={props.lastSentCustomerInfo as never}
      tatStartedAt={props.tatStartedAt as string | null}
      certificateCreatedAt={props.certificateCreatedAt as string}
      fieldChangeRequests={props.fieldChangeRequests as never}
      sectionUnlockRequests={props.sectionUnlockRequests as never}
    />
  )
}
