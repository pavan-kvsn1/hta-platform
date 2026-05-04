'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  Loader2,
  Unlock,
  PenLine,
  CheckCircle,
  XCircle,
  Eye,
  ChevronDown,
  ChevronRight,
  FileText,
  User,
  MapPin,
  Save,
  ArrowRight,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { AdminCertificateContent } from '@/app/admin/certificates/[id]/AdminCertificateContent'
import { AdminHistorySection } from '@/app/admin/certificates/[id]/AdminHistorySection'
import { InlinePDFViewer } from '@/app/(dashboard)/dashboard/reviewer/[id]/InlinePDFViewer'
import type { CertificateData, Assignee, Feedback, CertificateEvent } from '@/app/admin/certificates/[id]/AdminCertificateClient'
import { DatePicker } from '@/components/ui/date-picker'

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

// Field label mapping
const FIELD_LABELS: Record<string, string> = {
  'certificateNumber': 'Certificate Number',
  'srfNumber': 'SRF Number',
  'srfDate': 'SRF Date',
  'customerName': 'Customer Name',
  'customerAddress': 'Customer Address',
  'customerContactName': 'Customer Contact Name',
  'customerContactEmail': 'Customer Contact Email',
  'calibratedAt': 'Calibrated At',
  'dateOfCalibration': 'Date of Calibration',
  'calibrationDueDate': 'Calibration Due Date',
}

interface InternalRequestData {
  id: string
  type: 'SECTION_UNLOCK' | 'FIELD_CHANGE'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  data: { sections?: string[]; reason?: string; fields?: string[]; description?: string }
  requestedBy: { id: string; name: string; email: string }
  reviewedBy: { id: string; name: string } | null
  reviewedAt: string | null
  adminNote: string | null
  createdAt: string
}

function formatTATTime(ms: number): { hours: number; minutes: number } {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  return { hours, minutes }
}

function TATBanner({ sentAt, certificateCreatedAt, targetHours = 12, totalTargetHours = 48 }: { sentAt: string; certificateCreatedAt?: string | null; targetHours?: number; totalTargetHours?: number }) {
  const [elapsed, setElapsed] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [remaining, setRemaining] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [totalElapsed, setTotalElapsed] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [totalRemaining, setTotalRemaining] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [status, setStatus] = useState<'good' | 'warning' | 'critical'>('good')
  const [totalStatus, setTotalStatus] = useState<'good' | 'warning' | 'critical'>('good')

  useEffect(() => {
    const calculateTAT = () => {
      const now = Date.now()

      const sentTime = new Date(sentAt).getTime()
      const elapsedMs = now - sentTime
      const targetMs = targetHours * 60 * 60 * 1000
      const remainingMs = targetMs - elapsedMs

      setElapsed(formatTATTime(elapsedMs))

      if (remainingMs <= 0) {
        setRemaining({ hours: 0, minutes: 0 })
        setStatus('critical')
      } else if (remainingMs <= 3 * 60 * 60 * 1000) {
        setRemaining(formatTATTime(remainingMs))
        setStatus('warning')
      } else {
        setRemaining(formatTATTime(remainingMs))
        setStatus('good')
      }

      if (certificateCreatedAt) {
        const createdTime = new Date(certificateCreatedAt).getTime()
        const totalElapsedMs = now - createdTime
        const totalTargetMs = totalTargetHours * 60 * 60 * 1000
        const totalRemainingMs = totalTargetMs - totalElapsedMs

        setTotalElapsed(formatTATTime(totalElapsedMs))

        if (totalRemainingMs <= 0) {
          setTotalRemaining({ hours: 0, minutes: 0 })
          setTotalStatus('critical')
        } else if (totalRemainingMs <= 8 * 60 * 60 * 1000) {
          setTotalRemaining(formatTATTime(totalRemainingMs))
          setTotalStatus('warning')
        } else {
          setTotalRemaining(formatTATTime(totalRemainingMs))
          setTotalStatus('good')
        }
      }
    }

    calculateTAT()
    const interval = setInterval(calculateTAT, 60000)
    return () => clearInterval(interval)
  }, [sentAt, certificateCreatedAt, targetHours, totalTargetHours])

  const config = {
    good: { bg: 'bg-[#f0fdf4]', border: 'border-[#bbf7d0]', text: 'text-[#166534]', icon: <Clock className="size-3.5 text-[#16a34a]" /> },
    warning: { bg: 'bg-[#fffbeb]', border: 'border-[#fde68a]', text: 'text-[#92400e]', icon: <AlertTriangle className="size-3.5 text-[#d97706]" /> },
    critical: { bg: 'bg-[#fef2f2]', border: 'border-[#fecaca]', text: 'text-[#991b1b]', icon: <AlertTriangle className="size-3.5 text-[#dc2626]" /> },
  }

  const c = config[status]
  const totalColor = totalStatus === 'critical' ? 'text-[#dc2626]' : totalStatus === 'warning' ? 'text-[#d97706]' : 'text-[#64748b]'

  return (
    <div className={cn('px-4 py-2 rounded-xl border flex items-center justify-between text-[12.5px]', c.bg, c.border, c.text)}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {c.icon}
          <span className="font-semibold">
            Phase: {elapsed.hours}h {elapsed.minutes}m
          </span>
        </div>
        <span className="text-[#e2e8f0]">|</span>
        {status === 'critical' ? (
          <span className="font-semibold">{targetHours}h target exceeded</span>
        ) : (
          <span>{remaining.hours}h {remaining.minutes}m of {targetHours}h left</span>
        )}
      </div>
      {certificateCreatedAt && (
        <div className={cn('flex items-center gap-1.5', totalColor)}>
          <span className="text-[#cbd5e1]">|</span>
          <span className="font-medium">
            Total: {totalElapsed.hours}h {totalElapsed.minutes}m
          </span>
          <span className="opacity-60">·</span>
          {totalStatus === 'critical' ? (
            <span className="font-semibold">{totalTargetHours}h exceeded</span>
          ) : (
            <span>{totalRemaining.hours}h {totalRemaining.minutes}m of {totalTargetHours}h left</span>
          )}
        </div>
      )}
    </div>
  )
}

interface InternalRequestClientProps {
  request: InternalRequestData
  certificate: CertificateData
  assignee: Assignee
  reviewer: { id: string; name: string; email: string } | null
  feedbacks: Feedback[]
  events: CertificateEvent[]
  currentlyUnlockedSections: string[]
  certificateCreatedAt?: string | null
}

export function InternalRequestClient({
  request,
  certificate,
  assignee,
  reviewer: _reviewer,
  feedbacks,
  events,
  currentlyUnlockedSections,
  certificateCreatedAt,
}: InternalRequestClientProps) {
  const router = useRouter()
  const [processing, setProcessing] = useState(false)
  const [adminNote, setAdminNote] = useState('')
  const [error, setError] = useState('')

  const [isDecisionExpanded, setIsDecisionExpanded] = useState(true)
  const [viewMode, setViewMode] = useState<'details' | 'pdf'>('details')

  // Field edit state (for FIELD_CHANGE requests)
  const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({})
  const [isSavingEdits, setIsSavingEdits] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editsSaved, setEditsSaved] = useState(false)

  const DATE_FIELDS = ['dateOfCalibration', 'calibrationDueDate', 'srfDate']

  const getCurrentValue = (fieldId: string): string => {
    switch (fieldId) {
      case 'certificateNumber': return certificate.certificateNumber || ''
      case 'srfNumber': return certificate.srfNumber || ''
      case 'srfDate': return certificate.srfDate || ''
      case 'customerName': return certificate.customerName || ''
      case 'customerAddress': return certificate.customerAddress || ''
      case 'customerContactName': return certificate.customerContactName || ''
      case 'customerContactEmail': return certificate.customerContactEmail || ''
      case 'calibratedAt': return certificate.calibratedAt || ''
      case 'dateOfCalibration': return certificate.dateOfCalibration || ''
      case 'calibrationDueDate': return certificate.calibrationDueDate || ''
      default: return ''
    }
  }

  const formatDateForInput = (dateStr: string): string => {
    if (!dateStr) return ''
    try { return new Date(dateStr).toISOString().split('T')[0] } catch { return '' }
  }

  const formatDisplayDate = (dateStr: string): string => {
    if (!dateStr) return 'Not set'
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return dateStr }
  }

  const getDisplayValue = (fieldId: string, value: string): string => {
    if (!value) return 'Not set'
    if (DATE_FIELDS.includes(fieldId)) return formatDisplayDate(value)
    if (fieldId === 'calibratedAt') return value === 'LAB' ? 'Laboratory' : value === 'SITE' ? 'Site' : value
    return value
  }

  const handleFieldEditChange = (fieldId: string, value: string) => {
    setFieldEdits(prev => ({ ...prev, [fieldId]: value }))
    setEditsSaved(false)
  }

  const handleSaveEdits = async () => {
    const changedFields = Object.entries(fieldEdits).filter(
      ([fieldId, value]) => value !== getCurrentValue(fieldId) && value !== ''
    )
    if (changedFields.length === 0) {
      setEditError('No changes to save')
      return
    }

    setIsSavingEdits(true)
    setEditError(null)

    try {
      for (const [fieldId, value] of changedFields) {
        const response = await apiFetch(`/api/admin/certificates/${certificate.id}/edit`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field: fieldId,
            value,
            reason: `Field change request from ${request.requestedBy.name}: ${request.data.description || 'No description'}`,
          }),
        })
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || `Failed to update ${FIELD_LABELS[fieldId] || fieldId}`)
        }
      }
      setEditsSaved(true)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setIsSavingEdits(false)
    }
  }

  const isPending = request.status === 'PENDING'
  const isFieldChange = request.type === 'FIELD_CHANGE'
  const requestedFields = request.data.fields || []

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
              <div className={cn('p-2 rounded-[9px]', request.type === 'FIELD_CHANGE' ? 'bg-[#fef9c3]' : 'bg-[#dbeafe]')}>
                {request.type === 'FIELD_CHANGE'
                  ? <PenLine className="size-5 text-[#a16207]" />
                  : <Unlock className="size-5 text-[#2563eb]" />
                }
              </div>
              <h1 className="text-[22px] font-bold text-[#0f172a]">
                {request.type === 'FIELD_CHANGE' ? 'Field Change Request' : 'Section Unlock Request'}
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

        {/* TAT Banner — only for pending requests */}
        {isPending && (
          <TATBanner sentAt={request.createdAt} certificateCreatedAt={certificateCreatedAt} targetHours={12} />
        )}

        {/* Content Area */}
        {viewMode === 'details' ? (
          <div className="space-y-5">
            {/* Request Banner */}
            {request.type === 'SECTION_UNLOCK' ? (
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
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(request.data.sections || []).map((sectionId) => (
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
                  <div className="bg-white rounded-[9px] border border-[#e2e8f0] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2">Reason for Request</p>
                    <p className="text-[13px] text-[#64748b] whitespace-pre-wrap">{request.data.reason}</p>
                  </div>
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
            ) : (
              <div className="bg-[#fefce8] rounded-[14px] border border-[#fde68a] overflow-hidden">
                <div className="px-5 py-3 border-b border-[#fde68a] bg-[#fef9c3]/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#fde68a] rounded-[9px]">
                      <PenLine className="size-5 text-[#a16207]" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[13px] text-[#713f12]">Fields Requested for Change</h3>
                      <p className="text-[12px] text-[#a16207]">
                        Requested by {request.requestedBy.name} &bull; {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(request.data.fields || []).map((fieldId) => (
                      <div
                        key={fieldId}
                        className="flex items-center gap-2 px-3 py-2 bg-white rounded-[9px] border border-[#fde68a]"
                      >
                        <PenLine className="size-4 text-[#eab308]" />
                        <span className="text-[12px] font-semibold text-[#0f172a]">
                          {FIELD_LABELS[fieldId] || fieldId}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-[9px] border border-[#e2e8f0] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2">Description</p>
                    <p className="text-[13px] text-[#64748b] whitespace-pre-wrap">{request.data.description}</p>
                  </div>
                </div>
              </div>
            )}

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
                    {request.type === 'SECTION_UNLOCK' ? (
                      <>
                        <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Sections ({(request.data.sections || []).length})</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(request.data.sections || []).map((sectionId) => (
                            <span
                              key={sectionId}
                              className="px-2 py-0.5 bg-[#dbeafe] text-[#1d4ed8] rounded text-[11px] font-medium"
                            >
                              {SECTION_LABELS[sectionId]?.replace('Section ', 'S') || sectionId}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Fields ({(request.data.fields || []).length})</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(request.data.fields || []).map((fieldId) => (
                            <span
                              key={fieldId}
                              className="px-2 py-0.5 bg-[#fef9c3] text-[#a16207] rounded text-[11px] font-medium"
                            >
                              {FIELD_LABELS[fieldId] || fieldId}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
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

                {/* Inline Field Edits (only for pending FIELD_CHANGE) */}
                {isPending && isFieldChange && requestedFields.length > 0 && (
                  <div className="border-b border-[#e2e8f0] pb-4 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <PenLine className="size-4 text-[#a16207]" />
                      <span className="text-[12px] font-bold text-[#0f172a] uppercase tracking-[0.07em]">
                        Edit Fields
                      </span>
                    </div>

                    <div className="space-y-3">
                      {requestedFields.map((fieldId) => {
                        const currentVal = getCurrentValue(fieldId)
                        const editVal = fieldEdits[fieldId]
                        const isDate = DATE_FIELDS.includes(fieldId)
                        const isCalLocation = fieldId === 'calibratedAt'

                        return (
                          <div key={fieldId} className="bg-[#f8fafc] rounded-[9px] border border-[#e2e8f0] p-3">
                            <label className="block text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1.5">
                              {FIELD_LABELS[fieldId] || fieldId}
                            </label>
                            {/* Current value */}
                            <div className="flex items-center gap-1.5 mb-2">
                              <span className="text-[11px] text-[#94a3b8]">Current:</span>
                              <span className="text-[12px] text-[#64748b] font-medium">
                                {getDisplayValue(fieldId, currentVal)}
                              </span>
                            </div>
                            {/* Input */}
                            {isCalLocation ? (
                              <select
                                value={editVal ?? currentVal}
                                onChange={(e) => handleFieldEditChange(fieldId, e.target.value)}
                                className="w-full px-3 py-1.5 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[7px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                              >
                                <option value="LAB">Laboratory</option>
                                <option value="SITE">Site</option>
                              </select>
                            ) : isDate ? (
                              <DatePicker
                                value={editVal !== undefined ? formatDateForInput(editVal) : formatDateForInput(currentVal)}
                                onChange={(val) => handleFieldEditChange(fieldId, val)}
                                size="sm"
                              />
                            ) : (
                              <input
                                type="text"
                                value={editVal ?? currentVal}
                                onChange={(e) => handleFieldEditChange(fieldId, e.target.value)}
                                placeholder={`Enter new ${(FIELD_LABELS[fieldId] || fieldId).toLowerCase()}...`}
                                className="w-full px-3 py-1.5 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[7px] bg-white placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                              />
                            )}
                            {/* Show change indicator */}
                            {editVal !== undefined && editVal !== currentVal && (
                              <div className="flex items-center gap-1 mt-1.5 text-[10px] text-[#d97706]">
                                <span className="truncate max-w-[120px]">{getDisplayValue(fieldId, currentVal)}</span>
                                <ArrowRight className="size-3 flex-shrink-0" />
                                <span className="truncate max-w-[120px] font-semibold">{getDisplayValue(fieldId, editVal)}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {editError && (
                      <div className="mt-3 p-2 bg-[#fef2f2] border border-[#fecaca] rounded-[7px]">
                        <p className="text-[11px] text-[#dc2626]">{editError}</p>
                      </div>
                    )}

                    {editsSaved && (
                      <div className="mt-3 p-2 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[7px]">
                        <p className="text-[11px] text-[#16a34a] font-medium flex items-center gap-1">
                          <CheckCircle className="size-3" />
                          Changes saved successfully
                        </p>
                      </div>
                    )}

                    <button
                      onClick={handleSaveEdits}
                      disabled={isSavingEdits || editsSaved}
                      className="w-full mt-3 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#d97706] hover:bg-[#b45309] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isSavingEdits ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Saving...
                        </>
                      ) : editsSaved ? (
                        <>
                          <CheckCircle className="size-4" />
                          Changes Saved
                        </>
                      ) : (
                        <>
                          <Save className="size-4" />
                          Save Field Changes
                        </>
                      )}
                    </button>
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
                        {isFieldChange
                          ? 'Approving confirms the field changes have been applied.'
                          : 'Approving will allow the engineer to edit the requested sections.'}
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
