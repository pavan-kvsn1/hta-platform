'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ReviewerContent } from './ReviewerContent'
import { ReviewerApproveModal } from './ReviewerApproveModal'
import { InlinePDFViewer } from './InlinePDFViewer'
import {
  CheckCircle,
  RotateCcw,
  XCircle,
  Loader2,
  X,
  Send,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  User,
  Building2,
  MapPin,
  Plus,
  Trash2,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ViewToggleButton } from '@/components/certificate/ViewToggleButton'
import { MetaInfoItem } from '@/components/certificate/MetaInfoItem'
import { TATBadge } from '@/components/certificate/TATBadge'
import { REVISION_SECTIONS } from '@/components/feedback/shared/feedback-utils'
import type { ClientEvidence } from '@/types/signatures'
import type {
  CertificateData,
  Assignee,
  Feedback,
  AdminHeaderData,
} from '@/types/certificate'

type HeaderData = AdminHeaderData

interface CustomerFeedback {
  notes: string
  sectionFeedbacks: { section: string; comment: string }[] | null
  generalNotes: string | null
  customerName: string
  customerEmail: string
  requestedAt: string
}

interface LastSentCustomerInfo {
  email: string | null
  name: string | null
}

interface ReviewerPageClientProps {
  certificate: CertificateData
  assignee: Assignee
  feedbacks: Feedback[]
  chatThreadId: string | null
  headerData: HeaderData
  userRole: string
  customerFeedback: CustomerFeedback | null
  lastSentCustomerInfo: LastSentCustomerInfo | null
}
export function ReviewerPageClient({
  certificate,
  assignee,
  feedbacks,
  chatThreadId: _chatThreadId,
  headerData,
  userRole,
  customerFeedback,
  lastSentCustomerInfo,
}: ReviewerPageClientProps) {
  const router = useRouter()

  // Determine back link based on user role
  const backLink = userRole === 'ADMIN' ? '/admin/certificates' : '/dashboard/reviewer'
  const [_isApproving, setIsApproving] = useState(false)
  const [isRequestingRevision, setIsRequestingRevision] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal states
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)

  // Form states - New section feedback entries structure
  const [sectionFeedbackEntries, setSectionFeedbackEntries] = useState<
    { id: string; section: string; comment: string }[]
  >([{ id: crypto.randomUUID(), section: '', comment: '' }])
  const [generalNotes, setGeneralNotes] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  // Chat tab state
  const [activeChatTab, setActiveChatTab] = useState<'engineer' | 'customer'>('engineer')

  // Collapsible panel states
  const [isChatExpanded, setIsChatExpanded] = useState(true)
  const [isActionsExpanded, setIsActionsExpanded] = useState(true)

  // View mode state: 'details' shows certificate content, 'pdf' shows PDF preview
  const [viewMode, setViewMode] = useState<'details' | 'pdf'>('details')
  const [isDownloading, setIsDownloading] = useState(false)

  const decisionMade = ['APPROVED', 'PENDING_CUSTOMER_APPROVAL', 'PENDING_ADMIN_AUTHORIZATION', 'AUTHORIZED', 'REJECTED'].includes(certificate.status)
  const canReview = !decisionMade
  const isRevisionRequired = certificate.status === 'REVISION_REQUIRED'
  const isCustomerRevisionRequired = certificate.status === 'CUSTOMER_REVISION_REQUIRED'
  const isPendingCustomer = certificate.status === 'PENDING_CUSTOMER_APPROVAL'
  const isPendingAdminAuth = certificate.status === 'PENDING_ADMIN_AUTHORIZATION'
  const isApproved = certificate.status === 'APPROVED'
  const isAuthorized = certificate.status === 'AUTHORIZED'
  const isRejected = certificate.status === 'REJECTED'

  // Customer chat only available when sent to customer or customer has responded
  const canAccessCustomerChat = isPendingCustomer || isPendingAdminAuth || isApproved || isAuthorized || isCustomerRevisionRequired

  // Approval data type for the modal
  interface ApprovalData {
    comment?: string
    sendToCustomer?: {
      email: string
      name: string
      message?: string
    }
    signatureInfo: {
      signatureImage: string
      signerName: string
      clientEvidence: ClientEvidence
    }
  }

  const handleApprove = useCallback(async (data: ApprovalData) => {
    setIsApproving(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/certificates/${certificate.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          comment: data.comment,
          sendToCustomer: data.sendToCustomer,
          signatureData: data.signatureInfo.signatureImage,
          signerName: data.signatureInfo.signerName,
          clientEvidence: data.signatureInfo.clientEvidence,
        }),
      })

      if (!response.ok) {
        const responseData = await response.json()
        throw new Error(responseData.error || 'Failed to approve certificate')
      }

      setShowApproveModal(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      throw err
    } finally {
      setIsApproving(false)
    }
  }, [certificate.id, router])

  const handleRequestRevision = async () => {
    // Validate at least one feedback entry has a section and comment
    const validSectionFeedbacks = sectionFeedbackEntries.filter(
      e => e.section && e.comment.trim()
    )

    // Section feedback is required - general notes alone are not sufficient
    if (validSectionFeedbacks.length === 0) {
      setError('Please select at least one section and provide feedback for it')
      return
    }

    setIsRequestingRevision(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/certificates/${certificate.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_revision',
          sectionFeedbacks: validSectionFeedbacks.map(e => ({
            section: e.section,
            comment: e.comment.trim(),
          })),
          generalNotes: generalNotes.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to request revision')
      }

      setShowRevisionModal(false)
      setSectionFeedbackEntries([{ id: crypto.randomUUID(), section: '', comment: '' }])
      setGeneralNotes('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsRequestingRevision(false)
    }
  }

  // Section feedback entry handlers
  const addSectionEntry = () => {
    setSectionFeedbackEntries(prev => [
      ...prev,
      { id: crypto.randomUUID(), section: '', comment: '' }
    ])
  }

  const removeSectionEntry = (id: string) => {
    setSectionFeedbackEntries(prev => {
      if (prev.length <= 1) {
        // Don't remove last entry, just clear it
        return [{ id: crypto.randomUUID(), section: '', comment: '' }]
      }
      return prev.filter(e => e.id !== id)
    })
  }

  const updateSectionEntry = (id: string, field: 'section' | 'comment', value: string) => {
    setSectionFeedbackEntries(prev =>
      prev.map(e => e.id === id ? { ...e, [field]: value } : e)
    )
  }

  // Get available sections (not already selected in other entries)
  const getAvailableSections = (currentEntryId: string) => {
    const selectedSections = sectionFeedbackEntries
      .filter(e => e.id !== currentEntryId && e.section)
      .map(e => e.section)
    return REVISION_SECTIONS.filter(s => !selectedSections.includes(s.id))
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError('Please provide a reason for rejection')
      return
    }

    setIsRejecting(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/certificates/${certificate.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          comment: rejectReason.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to reject certificate')
      }

      setShowRejectModal(false)
      setRejectReason('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsRejecting(false)
    }
  }

  // Handle download PDF (only for authorized certificates)
  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    try {
      const response = await apiFetch(`/api/certificates/${certificate.id}/download-signed`)
      if (!response.ok) {
        throw new Error('Failed to download PDF')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const fileName = `${certificate.certificateNumber.replace(/\//g, '-')}.pdf`
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error downloading PDF:', err)
      alert('Failed to download PDF')
    } finally {
      setIsDownloading(false)
    }
  }, [certificate.id, certificate.certificateNumber])

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-slate-100 overflow-hidden">
      {/* Left Side - Header + Content (Scrollable) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Certificate Card - Bounding Box */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header Section - Fixed at top of content area */}
          <div className="flex-shrink-0 border-b border-slate-200 px-6 py-4 bg-slate-50">
          {/* Header Content */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href={backLink}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ChevronLeft className="size-6" strokeWidth={2} />
              </Link>
              <span className="text-slate-300 text-xl">|</span>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {headerData.certificateNumber}
              </h1>
              <Badge
                variant="outline"
                className={cn(
                  'px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                  headerData.statusClassName
                )}
              >
                {headerData.statusLabel}
              </Badge>
            </div>

            <div className="flex items-center gap-3">
              <TATBadge tat={headerData.tat} />
              <ViewToggleButton
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                isAuthorized={isAuthorized}
                onDownload={isAuthorized ? handleDownload : undefined}
                isDownloading={isDownloading}
              />
            </div>
          </div>

          {/* Meta Info Row */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm mt-3 pt-3 border-t border-muted-foreground/40">
            <MetaInfoItem icon={User} emphasized>{headerData.assigneeName}</MetaInfoItem>
            <MetaInfoItem icon={Building2}>{headerData.customerName}</MetaInfoItem>
            <MetaInfoItem icon={MapPin}>
              {headerData.calibratedAt === 'LAB' ? 'Laboratory' : 'Site'}
            </MetaInfoItem>
            <div className="flex items-center gap-2 text-slate-500">
              <span className="text-slate-300">|</span>
              <span>Revision {headerData.currentRevision}</span>
            </div>
          </div>
          </div>

          {/* Content Area - Scrollable */}
          <div className="flex-1 overflow-auto p-6 bg-section-inner">
            {viewMode === 'details' ? (
              <ReviewerContent
                certificate={certificate}
                assignee={assignee}
                feedbacks={feedbacks}
                customerFeedback={customerFeedback}
              />
            ) : (
              <InlinePDFViewer
                certificateId={certificate.id}
                certificateNumber={certificate.certificateNumber}
              />
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Chat & Actions, fixed to viewport height */}
      <div className="w-[380px] flex-shrink-0 flex flex-col gap-2 bg-section-inner p-2 h-full overflow-hidden">

        {/* ===== CHAT SECTION ===== */}
        <div className={cn(
          'flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
          isChatExpanded ? 'flex-1 min-h-0' : 'flex-shrink-0'
        )}>
          {/* Chat Header - Collapsible */}
          <button
            onClick={() => setIsChatExpanded(!isChatExpanded)}
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {isChatExpanded ? (
                <ChevronDown className="size-4 text-slate-400" />
              ) : (
                <ChevronRight className="size-4 text-slate-400" />
              )}
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Chat</span>
            </div>
            {/* Unread counts when collapsed */}
            {!isChatExpanded && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Eng</span>
                {canAccessCustomerChat && (
                  <>
                    <span>•</span>
                    <span>Cust</span>
                  </>
                )}
              </div>
            )}
          </button>

          {/* Chat Content - Only when expanded */}
          {isChatExpanded && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Person Header */}
              <div className="flex-shrink-0 px-4 py-3 border-t border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="size-10 rounded-full bg-slate-700 text-white flex items-center justify-center font-semibold text-sm flex-shrink-0">
                    {activeChatTab === 'engineer'
                      ? assignee.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                      : (certificate.customerName || 'C').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                    }
                  </div>
                  {/* Name & Status */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {activeChatTab === 'engineer' ? assignee.name : (certificate.customerName || 'Customer')}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      {activeChatTab === 'engineer' ? (
                        <>
                          <span>Engineer</span>
                          <span className="size-1.5 rounded-full bg-green-500" />
                          <span className="text-green-600">Online</span>
                        </>
                      ) : (
                        <>
                          <span>{certificate.customerName ? 'Customer' : 'No customer'}</span>
                          {isPendingCustomer && <span className="text-amber-600">• Pending response</span>}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Pill-Style Tab Switcher */}
              <div className="flex-shrink-0 px-4 py-2 border-b border-slate-200 bg-white">
                <div className="flex bg-slate-100 rounded-full p-1">
                  <button
                    onClick={() => setActiveChatTab('engineer')}
                    className={cn(
                      'flex-1 px-4 py-1.5 text-xs font-medium rounded-full transition-all',
                      activeChatTab === 'engineer'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    Engineer
                  </button>
                  <button
                    onClick={() => canAccessCustomerChat && setActiveChatTab('customer')}
                    disabled={!canAccessCustomerChat}
                    className={cn(
                      'flex-1 px-4 py-1.5 text-xs font-medium rounded-full transition-all',
                      activeChatTab === 'customer'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700',
                      !canAccessCustomerChat && 'opacity-40 cursor-not-allowed'
                    )}
                    title={!canAccessCustomerChat ? 'Available after sending to customer' : ''}
                  >
                    Customer {!canAccessCustomerChat && '🔒'}
                  </button>
                </div>
              </div>

              {/* Chat Messages Area */}
              <div className="flex-1 min-h-0 overflow-hidden text-xs">
                {activeChatTab === 'engineer' ? (
                  <ChatSidebar
                    isOpen={true}
                    onClose={() => {}}
                    certificateId={certificate.id}
                    threadType="ASSIGNEE_REVIEWER"
                    embedded={true}
                  />
                ) : canAccessCustomerChat ? (
                  <ChatSidebar
                    isOpen={true}
                    onClose={() => {}}
                    certificateId={certificate.id}
                    threadType="REVIEWER_CUSTOMER"
                    embedded={true}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-xs p-4 text-center">
                    Customer chat will be available after the certificate is sent for customer approval
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ===== REVIEW ACTIONS SECTION ===== */}
        <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
          {/* Actions Header - Collapsible */}
          <button
            onClick={() => setIsActionsExpanded(!isActionsExpanded)}
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {isActionsExpanded ? (
                <ChevronDown className="size-4 text-slate-400" />
              ) : (
                <ChevronRight className="size-4 text-slate-400" />
              )}
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Review Actions</span>
            </div>
          </button>

          {/* Actions Content - Only when expanded */}
          {isActionsExpanded && (
            <div className="px-4 pb-4 pt-3 space-y-3 border-t border-slate-100">
              {error && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {error}
                </div>
              )}

              {canReview && (
                <div className="space-y-2">
                  {/* Primary Action */}
                  <Button
                    onClick={() => setShowApproveModal(true)}
                    size="sm"
                    className="w-full bg-green-600 hover:bg-green-700 text-white h-9 text-xs font-medium"
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-2" />
                    Approve & Send
                  </Button>

                  {/* Secondary Action */}
                  <Button
                    onClick={() => setShowRevisionModal(true)}
                    variant="outline"
                    size="sm"
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white h-9 text-xs font-medium"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-2" />
                    Request Revision
                  </Button>

                  {/* Tertiary Action */}
                  <Button
                    onClick={() => setShowRejectModal(true)}
                    variant="outline"
                    size="sm"
                    className="w-full bg-red-600 hover:bg-red-700 text-white h-9 text-xs font-medium"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-2" />
                    Reject
                  </Button>
                </div>
              )}

              {/* Status Indicators for post-decision states */}
              {isRevisionRequired && (
                <div className="flex items-center gap-3 py-3 px-4 bg-amber-50 rounded-xl border border-amber-100">
                  <div className="size-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-amber-800">Waiting for Engineer</p>
                    <p className="text-xs text-amber-600">{assignee.name} is working on revisions</p>
                  </div>
                </div>
              )}

              {isPendingCustomer && (
                <div className="flex items-center gap-3 py-3 px-4 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="size-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Send className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-800">Sent to Customer</p>
                    <p className="text-xs text-blue-600">Awaiting customer approval</p>
                  </div>
                </div>
              )}

              {/* Customer Revision Status Banner - feedback details shown inline in sections */}
              {isCustomerRevisionRequired && customerFeedback && (
                <div className="flex items-center gap-3 py-3 px-4 bg-purple-50 rounded-xl border border-purple-100">
                  <div className="size-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <RotateCcw className="h-4 w-4 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-purple-800">Customer Requests Revision</p>
                    <p className="text-xs text-purple-600">
                      {customerFeedback.customerName} • {customerFeedback.sectionFeedbacks?.length || 0} section{(customerFeedback.sectionFeedbacks?.length || 0) !== 1 ? 's' : ''} flagged
                    </p>
                  </div>
                </div>
              )}

              {isPendingAdminAuth && (
                <div className="flex items-center gap-3 py-3 px-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <div className="size-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-indigo-800">Pending Admin Authorization</p>
                    <p className="text-xs text-indigo-600">Awaiting final admin approval</p>
                  </div>
                </div>
              )}

              {isApproved && (
                <div className="flex items-center gap-3 py-3 px-4 bg-green-50 rounded-xl border border-green-100">
                  <div className="size-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-800">Certificate Approved</p>
                    <p className="text-xs text-green-600">Finalized and complete</p>
                  </div>
                </div>
              )}

              {isAuthorized && (
                <div className="flex items-center gap-3 py-3 px-4 bg-green-50 rounded-xl border border-green-100">
                  <div className="size-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-800">Certificate Authorized</p>
                    <p className="text-xs text-green-600">Fully authorized and complete</p>
                  </div>
                </div>
              )}

              {isRejected && (
                <div className="flex items-center gap-3 py-3 px-4 bg-red-50 rounded-xl border border-red-100">
                  <div className="size-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                    <XCircle className="h-4 w-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-800">Certificate Rejected</p>
                    <p className="text-xs text-red-600">Permanently rejected</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Approve Modal */}
      <ReviewerApproveModal
        isOpen={showApproveModal}
        onClose={() => {
          setShowApproveModal(false)
          setError(null)
        }}
        certificateId={certificate.id}
        certificateNumber={certificate.certificateNumber}
        uucDescription={certificate.uucDescription}
        customerName={certificate.customerContactName || certificate.customerName}
        customerEmail={certificate.customerContactEmail || customerFeedback?.customerEmail || lastSentCustomerInfo?.email || null}
        onApprove={handleApprove}
      />

      {/* Revision Modal - New Multi-Section Design */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-orange-100 rounded-lg">
                  <RotateCcw className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Request Revision</h2>
                  <p className="text-xs text-slate-500">{certificate.certificateNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setShowRevisionModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Section Feedback Entries */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-700">
                    Section Feedback <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-gray-500">
                    {sectionFeedbackEntries.filter(e => e.section && e.comment.trim()).length} of {sectionFeedbackEntries.length} complete
                  </span>
                </div>

                <div className="space-y-3">
                  {sectionFeedbackEntries.map((entry, _index) => {
                    const availableSections = getAvailableSections(entry.id)
                    const currentSection = REVISION_SECTIONS.find(s => s.id === entry.section)

                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          'border rounded-lg p-3 transition-colors',
                          entry.section && entry.comment.trim()
                            ? 'border-orange-200 bg-orange-50/50'
                            : 'border-gray-200 bg-white'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 space-y-2">
                            {/* Section Dropdown */}
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-0.5 block pb-2">
                                Section
                              </label>
                              <select
                                value={entry.section}
                                onChange={(e) => updateSectionEntry(entry.id, 'section', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                              >
                                <option value="">Select a section...</option>
                                {(currentSection ? [currentSection, ...availableSections.filter(s => s.id !== currentSection.id)] : availableSections).map((section) => (
                                  <option key={section.id} value={section.id}>
                                    {section.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Comment Textarea */}
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-0.5 block py-2">
                                Feedback
                              </label>
                              <Textarea
                                placeholder="Describe what needs to be revised..."
                                value={entry.comment}
                                onChange={(e) => updateSectionEntry(entry.id, 'comment', e.target.value)}
                                rows={2}
                                className="resize-none text-xs md:text-xs focus:ring-orange-500 focus:border-orange-500"
                              />
                            </div>
                          </div>

                          {/* Remove Button */}
                          <button
                            type="button"
                            onClick={() => removeSectionEntry(entry.id)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors mt-4"
                            title="Remove entry"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Add Section Button */}
                {sectionFeedbackEntries.length < REVISION_SECTIONS.length && (
                  <button
                    type="button"
                    onClick={addSectionEntry}
                    className="mt-2 flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 font-medium px-2 py-1.5 hover:bg-orange-50 rounded transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Another Section
                  </button>
                )}
              </div>

              {/* General Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 pb-2">
                  General Notes
                  <span className="text-gray-400 font-normal ml-1">(optional)</span>
                </label>
                <Textarea
                  placeholder="Any overall feedback or notes that don't relate to a specific section..."
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  rows={2}
                  className="resize-none text-xs md:text-xs focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-end gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowRevisionModal(false)
                  setSectionFeedbackEntries([{ id: crypto.randomUUID(), section: '', comment: '' }])
                  setGeneralNotes('')
                  setError(null)
                }}
                disabled={isRequestingRevision}
                className='text-xs'
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleRequestRevision}
                disabled={isRequestingRevision || sectionFeedbackEntries.every(e => !e.section || !e.comment.trim())}
                className="bg-orange-600 hover:bg-orange-700 text-white text-xs"
              >
                {isRequestingRevision ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Request Revision
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto">
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-red-100 rounded-lg">
                  <XCircle className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Reject Certificate</h2>
                  <p className="text-xs text-slate-500">{certificate.certificateNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setShowRejectModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {/* Warning Banner */}
              <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex-shrink-0">
                  <svg className="h-4 w-4 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-red-800">This action is permanent</h4>
                  <p className="text-xs text-red-700">
                    The certificate will be permanently rejected and cannot be recovered.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 py-0.5">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <Textarea
                  placeholder="Explain why this certificate is being rejected..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="resize-none text-xs focus:ring-red-500 focus:border-red-500 md:text-xs"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t bg-gray-50 flex justify-end gap-2 sticky bottom-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectReason('')
                  setError(null)
                }}
                disabled={isRejecting}
                className='text-xs'
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleReject}
                disabled={isRejecting || !rejectReason.trim()}
                className="bg-red-600 hover:bg-red-700 text-white text-xs"
              >
                {isRejecting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                )}
                Reject Certificate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
