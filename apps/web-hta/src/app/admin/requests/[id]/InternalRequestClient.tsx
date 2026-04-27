'use client'

import { apiFetch } from '@/lib/api-client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  Loader2,
  Unlock,
  CheckCircle,
  XCircle,
  Eye,
  ChevronDown,
  ChevronRight,
  FileText,
  User,
  MapPin,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { AdminCertificateContent } from '@/app/admin/certificates/[id]/AdminCertificateContent'
import { AdminHistorySection } from '@/app/admin/certificates/[id]/AdminHistorySection'
import { InlinePDFViewer } from '@/app/(dashboard)/dashboard/reviewer/[id]/InlinePDFViewer'
import type { CertificateData, Assignee, Feedback, CertificateEvent } from '@/app/admin/certificates/[id]/AdminCertificateClient'

// Section label mapping
const SECTION_LABELS: Record<string, string> = {
  'summary': 'Section 1: Summary',
  'uuc-details': 'Section 2: UUC Details',
  'master-inst': 'Section 3: Master Instruments',
  'environment': 'Section 4: Environmental Conditions',
  'results': 'Section 5: Calibration Results',
  'remarks': 'Section 6: Remarks',
  'conclusion': 'Section 7: Conclusion',
}

interface InternalRequestData {
  id: string
  type: 'SECTION_UNLOCK'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  data: { sections: string[]; reason: string }
  requestedBy: { id: string; name: string; email: string }
  reviewedBy: { id: string; name: string } | null
  reviewedAt: string | null
  adminNote: string | null
  createdAt: string
}

interface InternalRequestClientProps {
  request: InternalRequestData
  certificate: CertificateData
  assignee: Assignee
  reviewer: { id: string; name: string; email: string } | null
  feedbacks: Feedback[]
  events: CertificateEvent[]
  currentlyUnlockedSections: string[]
}

export function InternalRequestClient({
  request,
  certificate,
  assignee,
  reviewer: _reviewer,
  feedbacks,
  events,
  currentlyUnlockedSections,
}: InternalRequestClientProps) {
  const router = useRouter()
  const [processing, setProcessing] = useState(false)
  const [adminNote, setAdminNote] = useState('')
  const [error, setError] = useState('')

  const [isDecisionExpanded, setIsDecisionExpanded] = useState(true)
  const [viewMode, setViewMode] = useState<'details' | 'pdf'>('details')

  const isPending = request.status === 'PENDING'

  const handleReview = async (action: 'approve' | 'reject') => {
    setError('')
    setProcessing(true)
    try {
      const res = await apiFetch(`/api/admin/internal-requests/${request.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          adminNote: adminNote.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action} request`)
      }
      router.push('/admin/requests')
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} request`)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="flex h-full bg-[#f1f5f9] overflow-hidden">
      {/* Left Side - Certificate Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto p-6 pr-3">
        {/* Header */}
        <div className="mb-5">
          <Link
            href="/admin/requests"
            className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-4 transition-colors"
          >
            <ChevronLeft className="size-4" />
            Back to Requests
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#dbeafe] rounded-[9px]">
                <Unlock className="size-5 text-[#2563eb]" />
              </div>
              <h1 className="text-[22px] font-bold text-[#0f172a]">
                Section Unlock Request
              </h1>
              <span className={cn(
                'px-2 py-0.5 rounded-md text-[11px] font-semibold',
                isPending && 'bg-[#fffbeb] text-[#d97706]',
                request.status === 'APPROVED' && 'bg-[#f0fdf4] text-[#16a34a]',
                request.status === 'REJECTED' && 'bg-[#fef2f2] text-[#dc2626]'
              )}>
                {request.status}
              </span>
            </div>
            <button
              onClick={() => setViewMode(viewMode === 'details' ? 'pdf' : 'details')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-[#64748b] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors"
            >
              {viewMode === 'details' ? (
                <>
                  <Eye className="size-4" />
                  Preview PDF
                </>
              ) : (
                <>
                  <FileText className="size-4" />
                  View Details
                </>
              )}
            </button>
          </div>

          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] mt-3">
            <div className="flex items-center gap-2 text-[#64748b]">
              <FileText className="size-4 text-[#94a3b8]" />
              <span className="font-semibold text-[#0f172a]">{certificate.certificateNumber}</span>
            </div>
            <div className="flex items-center gap-2 text-[#64748b]">
              <User className="size-4 text-[#94a3b8]" />
              <span>{certificate.customerName || 'No customer'}</span>
            </div>
            <div className="flex items-center gap-2 text-[#64748b]">
              <MapPin className="size-4 text-[#94a3b8]" />
              <span>{certificate.calibratedAt === 'LAB' ? 'Laboratory' : 'Site'}</span>
            </div>
            <span className="text-[#cbd5e1]">|</span>
            <span className="text-[#94a3b8]">Revision {certificate.currentRevision}</span>
          </div>
        </div>

        {/* Content Area */}
        {viewMode === 'details' ? (
          <div className="space-y-5">
            {/* Unlock Request Banner */}
            <div className="bg-[#eff6ff] rounded-[14px] border border-[#bfdbfe] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#bfdbfe] bg-[#dbeafe]/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#bfdbfe] rounded-[9px]">
                    <Unlock className="size-5 text-[#1d4ed8]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[13px] text-[#1e3a5f]">Sections Requested for Unlock</h3>
                    <p className="text-[12px] text-[#2563eb]">
                      Requested by {request.requestedBy.name} &bull; {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                {/* Requested Sections */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {request.data.sections.map((sectionId) => (
                    <div
                      key={sectionId}
                      className="flex items-center gap-2 px-3 py-2 bg-white rounded-[9px] border border-[#bfdbfe]"
                    >
                      <Unlock className="size-4 text-[#3b82f6]" />
                      <span className="text-[12px] font-semibold text-[#0f172a]">
                        {SECTION_LABELS[sectionId] || sectionId}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Reason */}
                <div className="bg-white rounded-[9px] border border-[#e2e8f0] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2">Reason for Request</p>
                  <p className="text-[13px] text-[#64748b] whitespace-pre-wrap">{request.data.reason}</p>
                </div>

                {/* Currently Unlocked Sections */}
                {currentlyUnlockedSections.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[#bfdbfe]">
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2">
                      Already Unlocked (from reviewer feedback)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {currentlyUnlockedSections.map((sectionId) => (
                        <div
                          key={sectionId}
                          className="flex items-center gap-1.5 px-2 py-1 bg-[#f0fdf4] rounded border border-[#bbf7d0] text-[11px] text-[#16a34a] font-medium"
                        >
                          <CheckCircle className="size-3" />
                          {SECTION_LABELS[sectionId] || sectionId}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Certificate Content - Reusing admin component */}
            <AdminCertificateContent
              certificate={certificate}
              assignee={assignee}
            />

            {/* History Section - Reusing admin component */}
            <AdminHistorySection
              feedbacks={feedbacks}
              events={events}
              currentRevision={certificate.currentRevision}
            />
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <InlinePDFViewer
              certificateId={certificate.id}
              certificateNumber={certificate.certificateNumber}
            />
          </div>
        )}
      </div>

      {/* Right Panel - Decision Panel */}
      <div className="w-[380px] flex-shrink-0 p-6 pl-3 overflow-y-auto">
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          <button
            onClick={() => setIsDecisionExpanded(!isDecisionExpanded)}
            className="w-full flex items-center justify-between px-5 py-3 bg-[#f8fafc] hover:bg-[#f1f5f9] transition-colors"
          >
            <div className="flex items-center gap-2">
              {isDecisionExpanded ? (
                <ChevronDown className="size-4 text-[#94a3b8]" />
              ) : (
                <ChevronRight className="size-4 text-[#94a3b8]" />
              )}
              <span className="text-[11px] font-bold text-[#0f172a] uppercase tracking-[0.07em]">
                Decision Panel
              </span>
            </div>
            <span className={cn(
              'px-2 py-0.5 rounded-md text-[10px] font-semibold',
              isPending && 'bg-[#fffbeb] text-[#d97706]',
              request.status === 'APPROVED' && 'bg-[#f0fdf4] text-[#16a34a]',
              request.status === 'REJECTED' && 'bg-[#fef2f2] text-[#dc2626]'
            )}>
              {request.status}
            </span>
          </button>

          {isDecisionExpanded && (
            <div className="border-t border-[#e2e8f0]">
              {/* Request Info */}
              <div className="p-4 bg-[#f8fafc] border-b border-[#f1f5f9]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Requested</p>
                    <p className="font-medium text-[#0f172a] mt-0.5 text-[12px]">
                      {format(new Date(request.createdAt), 'PPp')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">By</p>
                    <p className="font-medium text-[#0f172a] mt-0.5 text-[12px]">{request.requestedBy.name}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Sections ({request.data.sections.length})</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {request.data.sections.map((sectionId) => (
                        <span
                          key={sectionId}
                          className="px-2 py-0.5 bg-[#dbeafe] text-[#1d4ed8] rounded text-[11px] font-medium"
                        >
                          {SECTION_LABELS[sectionId]?.replace('Section ', 'S') || sectionId}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4">
                {/* Status for processed requests */}
                {!isPending && (
                  <div className={cn(
                    'p-4 rounded-[9px]',
                    request.status === 'APPROVED' && 'bg-[#f0fdf4] border border-[#bbf7d0]',
                    request.status === 'REJECTED' && 'bg-[#fef2f2] border border-[#fecaca]'
                  )}>
                    <div className="flex items-center gap-2 mb-2 text-[13px]">
                      {request.status === 'APPROVED' ? (
                        <CheckCircle className="size-5 text-[#16a34a]" />
                      ) : (
                        <XCircle className="size-5 text-[#dc2626]" />
                      )}
                      <span className="font-semibold text-[#0f172a]">
                        {request.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                      </span>
                    </div>
                    {request.reviewedBy && (
                      <p className="text-[12px] text-[#64748b]">
                        by {request.reviewedBy.name}
                        {request.reviewedAt && (
                          <span> on {format(new Date(request.reviewedAt), 'PPP')}</span>
                        )}
                      </p>
                    )}
                    {request.adminNote && (
                      <p className="mt-2 text-[12px] text-[#64748b] italic">
                        &ldquo;{request.adminNote}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* Action Form (only for pending) */}
                {isPending && (
                  <>
                    {error && (
                      <div className="mb-4 p-3 text-[12px] text-[#dc2626] bg-[#fef2f2] rounded-[9px] border border-[#fecaca]">
                        {error}
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label htmlFor="adminNote" className="block text-[12px] font-semibold text-[#0f172a] mb-2">
                          Message to Engineer (optional)
                        </label>
                        <textarea
                          id="adminNote"
                          value={adminNote}
                          onChange={(e) => setAdminNote(e.target.value)}
                          placeholder="Add a note for the engineer..."
                          rows={3}
                          className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none resize-none"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => handleReview('reject')}
                          disabled={processing}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold border border-[#fecaca] text-[#dc2626] hover:bg-[#fef2f2] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {processing ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <XCircle className="size-4" />
                          )}
                          Reject
                        </button>
                        <button
                          onClick={() => handleReview('approve')}
                          disabled={processing}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {processing ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <CheckCircle className="size-4" />
                          )}
                          Approve
                        </button>
                      </div>

                      <p className="text-[10px] text-[#94a3b8] text-center">
                        Approving will allow the engineer to edit the requested sections.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
