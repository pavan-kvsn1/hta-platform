'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
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
      const res = await fetch(`/api/admin/internal-requests/${request.id}/review`, {
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
    <div className="flex h-full bg-slate-100 p-3 gap-3 overflow-hidden">
      {/* Left Side - Certificate Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-slate-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link
                  href="/admin/requests"
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <ArrowLeft className="size-5" strokeWidth={2} />
                </Link>
                <span className="text-slate-300 text-xl">|</span>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Unlock className="size-5 text-blue-600" />
                </div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Section Unlock Request
                </h1>
                <Badge className={cn(
                  'px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                  isPending && 'bg-amber-50 text-amber-700 border-amber-200',
                  request.status === 'APPROVED' && 'bg-green-50 text-green-700 border-green-200',
                  request.status === 'REJECTED' && 'bg-red-50 text-red-700 border-red-200'
                )}>
                  {request.status}
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === 'details' ? 'pdf' : 'details')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-700"
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
              </Button>
            </div>

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm mt-3">
              <div className="flex items-center gap-2 text-slate-600">
                <FileText className="size-4 text-slate-400" />
                <span className="font-semibold">{certificate.certificateNumber}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <User className="size-4 text-slate-400" />
                <span>{certificate.customerName || 'No customer'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin className="size-4 text-slate-400" />
                <span>{certificate.calibratedAt === 'LAB' ? 'Laboratory' : 'Site'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <span className="text-slate-300">|</span>
                <span>Revision {certificate.currentRevision}</span>
              </div>
            </div>
          </div>

          {/* Content Area - Scrollable */}
          <div className="flex-1 overflow-auto bg-slate-50/30">
            {viewMode === 'details' ? (
              <div className="p-6 space-y-6">
                {/* Unlock Request Banner */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border-2 border-indigo-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-indigo-200 bg-indigo-100/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-200 rounded-lg">
                        <Unlock className="size-5 text-indigo-700" />
                      </div>
                      <div>
                        <h3 className="font-bold text-indigo-900">Sections Requested for Unlock</h3>
                        <p className="text-xs text-indigo-600">
                          Requested by {request.requestedBy.name} • {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
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
                          className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-indigo-200 shadow-sm"
                        >
                          <Unlock className="size-4 text-indigo-500" />
                          <span className="text-xs font-semibold text-slate-700">
                            {SECTION_LABELS[sectionId] || sectionId}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Reason */}
                    <div className="bg-white rounded-lg border border-slate-200 p-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Reason for Request</p>
                      <p className="text-slate-700 whitespace-pre-wrap text-xs">{request.data.reason}</p>
                    </div>

                    {/* Currently Unlocked Sections */}
                    {currentlyUnlockedSections.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-indigo-200">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                          Already Unlocked (from reviewer feedback)
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {currentlyUnlockedSections.map((sectionId) => (
                            <div
                              key={sectionId}
                              className="flex items-center gap-1.5 px-2 py-1 bg-green-50 rounded border border-green-200 text-xs text-green-700"
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
              <InlinePDFViewer
                certificateId={certificate.id}
                certificateNumber={certificate.certificateNumber}
              />
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Decision Panel */}
      <div className="w-[380px] flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
        <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setIsDecisionExpanded(!isDecisionExpanded)}
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {isDecisionExpanded ? (
                <ChevronDown className="size-4 text-slate-400" />
              ) : (
                <ChevronRight className="size-4 text-slate-400" />
              )}
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Decision Panel
              </span>
            </div>
            <Badge className={cn(
              'text-[10px]',
              isPending && 'bg-amber-100 text-amber-700',
              request.status === 'APPROVED' && 'bg-green-100 text-green-700',
              request.status === 'REJECTED' && 'bg-red-100 text-red-700'
            )}>
              {request.status}
            </Badge>
          </button>

          {isDecisionExpanded && (
            <div className="border-t border-slate-100">
              {/* Request Info */}
              <div className="p-4 bg-slate-50/50 border-b border-slate-100">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Requested</p>
                    <p className="font-medium text-slate-700 mt-0.5 text-xs">
                      {format(new Date(request.createdAt), 'PPp')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">By</p>
                    <p className="font-medium text-slate-700 mt-0.5 text-xs">{request.requestedBy.name}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Sections ({request.data.sections.length})</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {request.data.sections.map((sectionId) => (
                        <span
                          key={sectionId}
                          className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium"
                        >
                          {SECTION_LABELS[sectionId]?.replace('Section ', 'S') || sectionId}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4">
                {/* Status Info for processed requests */}
                {!isPending && (
                  <div className={cn(
                    'p-4 rounded-lg',
                    request.status === 'APPROVED' && 'bg-green-50 border border-green-200',
                    request.status === 'REJECTED' && 'bg-red-50 border border-red-200'
                  )}>
                    <div className="flex items-center gap-2 mb-2 text-xs">
                      {request.status === 'APPROVED' ? (
                        <CheckCircle className="size-5 text-green-600" />
                      ) : (
                        <XCircle className="size-5 text-red-600" />
                      )}
                      <span className="font-semibold text-slate-900">
                        {request.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                      </span>
                    </div>
                    {request.reviewedBy && (
                      <p className="text-xs text-slate-600">
                        by {request.reviewedBy.name}
                        {request.reviewedAt && (
                          <span> on {format(new Date(request.reviewedAt), 'PPP')}</span>
                        )}
                      </p>
                    )}
                    {request.adminNote && (
                      <p className="mt-2 text-sm text-slate-600 italic">
                        &ldquo;{request.adminNote}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* Action Form (only for pending) */}
                {isPending && (
                  <>
                    {error && (
                      <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
                        {error}
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="adminNote" className="text-xs font-medium text-slate-700">
                          Message to Engineer (optional)
                        </Label>
                        <Textarea
                          id="adminNote"
                          value={adminNote}
                          onChange={(e) => setAdminNote(e.target.value)}
                          placeholder="Add a note for the engineer..."
                          rows={3}
                          className="mt-2 text-sm"
                        />
                      </div>

                      <div className="flex gap-3">
                        <Button
                          onClick={() => handleReview('reject')}
                          disabled={processing}
                          variant="outline"
                          className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          {processing ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4 mr-2" />
                          )}
                          Reject
                        </Button>
                        <Button
                          onClick={() => handleReview('approve')}
                          disabled={processing}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          {processing ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          Approve
                        </Button>
                      </div>

                      <p className="text-[10px] text-slate-400 text-center">
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
