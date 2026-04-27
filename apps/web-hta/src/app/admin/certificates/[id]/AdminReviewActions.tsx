'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle,
  RotateCcw,
  XCircle,
  Loader2,
  X,
  Clock,
  Send,
  Plus,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { REVISION_SECTIONS } from '@/components/feedback/shared/feedback-utils'
import type { CertificateData, Assignee } from './AdminCertificateClient'
import type { ClientEvidence } from '@/types/signatures'

// Import the approve modal from reviewer
import { ReviewerApproveModal } from '@/app/(dashboard)/dashboard/reviewer/[id]/ReviewerApproveModal'

interface AdminReviewActionsProps {
  certificate: CertificateData
  assignee: Assignee
}

export function AdminReviewActions({
  certificate,
  assignee,
}: AdminReviewActionsProps) {
  const router = useRouter()

  const [_isApproving, setIsApproving] = useState(false)
  const [isRequestingRevision, setIsRequestingRevision] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)

  const [sectionFeedbackEntries, setSectionFeedbackEntries] = useState<
    { id: string; section: string; comment: string }[]
  >([{ id: crypto.randomUUID(), section: '', comment: '' }])
  const [generalNotes, setGeneralNotes] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [rejectStep, setRejectStep] = useState<'reason' | 'confirm'>('reason')
  const [rejectConfirmText, setRejectConfirmText] = useState('')

  const canReview = certificate.status === 'PENDING_REVIEW'
  const isRevisionRequired = certificate.status === 'REVISION_REQUIRED'
  const isPendingCustomer = certificate.status === 'PENDING_CUSTOMER_APPROVAL'
  const isCustomerRevisionRequired = certificate.status === 'CUSTOMER_REVISION_REQUIRED'
  const isApproved = certificate.status === 'APPROVED'
  const isRejected = certificate.status === 'REJECTED'

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
    const validSectionFeedbacks = sectionFeedbackEntries.filter(
      e => e.section && e.comment.trim()
    )

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
      setRejectStep('reason')
      setRejectConfirmText('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsRejecting(false)
    }
  }

  const addSectionEntry = () => {
    setSectionFeedbackEntries(prev => [
      ...prev,
      { id: crypto.randomUUID(), section: '', comment: '' }
    ])
  }

  const removeSectionEntry = (id: string) => {
    setSectionFeedbackEntries(prev => {
      if (prev.length <= 1) {
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

  const getAvailableSections = (currentEntryId: string) => {
    const selectedSections = sectionFeedbackEntries
      .filter(e => e.id !== currentEntryId && e.section)
      .map(e => e.section)
    return REVISION_SECTIONS.filter(s => !selectedSections.includes(s.id))
  }

  return (
    <>
      <div className="px-[18px] pb-[18px] pt-3 space-y-3">
        {error && (
          <div className="p-2 bg-[#fef2f2] border border-[#fecaca] rounded-[9px] text-[12px] text-[#dc2626]">
            {error}
          </div>
        )}

        {/* Review action buttons */}
        {canReview && (
          <div className="space-y-2">
            <button
              onClick={() => setShowApproveModal(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors"
            >
              <CheckCircle className="size-3.5" />
              Approve &amp; Send
            </button>

            <button
              onClick={() => setShowRevisionModal(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#d97706] hover:bg-[#b45309] rounded-[9px] transition-colors"
            >
              <RotateCcw className="size-3.5" />
              Request Revision
            </button>

            <button
              onClick={() => setShowRejectModal(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-[9px] transition-colors"
            >
              <XCircle className="size-3.5" />
              Reject
            </button>
          </div>
        )}

        {/* Status indicators */}
        {isRevisionRequired && (
          <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#fffbeb] rounded-xl border border-[#fde68a]">
            <div className="size-7 rounded-lg bg-[#fef3c7] flex items-center justify-center flex-shrink-0">
              <Clock className="size-3.5 text-[#d97706]" />
            </div>
            <div>
              <p className="text-[12.5px] font-semibold text-[#92400e]">Waiting for Engineer</p>
              <p className="text-[11px] text-[#d97706]">{assignee.name} is working on revisions</p>
            </div>
          </div>
        )}

        {isPendingCustomer && (
          <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#eff6ff] rounded-xl border border-[#bfdbfe]">
            <div className="size-7 rounded-lg bg-[#dbeafe] flex items-center justify-center flex-shrink-0">
              <Send className="size-3.5 text-[#2563eb]" />
            </div>
            <div>
              <p className="text-[12.5px] font-semibold text-[#1e40af]">Sent to Customer</p>
              <p className="text-[11px] text-[#2563eb]">Awaiting customer approval</p>
            </div>
          </div>
        )}

        {isCustomerRevisionRequired && (
          <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#fdf2f8] rounded-xl border border-[#fbcfe8]">
            <div className="size-7 rounded-lg bg-[#fce7f3] flex items-center justify-center flex-shrink-0">
              <RotateCcw className="size-3.5 text-[#db2777]" />
            </div>
            <div>
              <p className="text-[12.5px] font-semibold text-[#831843]">Customer Revision Requested</p>
              <p className="text-[11px] text-[#db2777]">Awaiting engineer response</p>
            </div>
          </div>
        )}

        {isApproved && (
          <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#f0fdf4] rounded-xl border border-[#bbf7d0]">
            <div className="size-7 rounded-lg bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
              <CheckCircle className="size-3.5 text-[#16a34a]" />
            </div>
            <div>
              <p className="text-[12.5px] font-semibold text-[#166534]">Certificate Authorized</p>
              <p className="text-[11px] text-[#16a34a]">Finalized and complete</p>
            </div>
          </div>
        )}

        {isRejected && (
          <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#fef2f2] rounded-xl border border-[#fecaca]">
            <div className="size-7 rounded-lg bg-[#fee2e2] flex items-center justify-center flex-shrink-0">
              <XCircle className="size-3.5 text-[#dc2626]" />
            </div>
            <div>
              <p className="text-[12.5px] font-semibold text-[#991b1b]">Certificate Rejected</p>
              <p className="text-[11px] text-[#dc2626]">Permanently rejected</p>
            </div>
          </div>
        )}

        {certificate.status === 'DRAFT' && (
          <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#f8fafc] rounded-xl border border-[#e2e8f0]">
            <div className="size-7 rounded-lg bg-[#f1f5f9] flex items-center justify-center flex-shrink-0">
              <Clock className="size-3.5 text-[#64748b]" />
            </div>
            <div>
              <p className="text-[12.5px] font-semibold text-[#0f172a]">Draft</p>
              <p className="text-[11px] text-[#64748b]">Not yet submitted for review</p>
            </div>
          </div>
        )}
      </div>

      {/* Approve Modal — shared with reviewer */}
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
        customerEmail={certificate.customerContactEmail}
        onApprove={handleApprove}
      />

      {/* Revision Modal — aligned with reviewer */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-[#fef3c7] rounded-[9px]">
                  <RotateCcw className="size-4 text-[#d97706]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-[#0f172a]">Request Revision</h2>
                  <p className="text-[11px] font-mono text-[#94a3b8]">{certificate.certificateNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setShowRevisionModal(false)}
                className="p-1.5 hover:bg-[#f8fafc] rounded-lg transition-colors"
              >
                <X className="size-4 text-[#94a3b8]" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Summary Strip */}
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#f8fafc] border border-[#f1f5f9] rounded-lg text-[12px] text-[#64748b]">
                <span className="font-semibold text-[#0f172a]">{certificate.uucDescription || '\u2014'}</span>
                <span className="text-[#e2e8f0]">&middot;</span>
                <span>{certificate.customerName || '\u2014'}</span>
                <span className="text-[#e2e8f0]">&middot;</span>
                <span>{assignee.name}</span>
              </div>

              {/* Section Feedback */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-[12.5px] font-semibold text-[#0f172a]">
                    Section Feedback <span className="text-[#dc2626]">*</span>
                  </label>
                  <span className="text-[10px] font-mono text-[#94a3b8]">
                    {sectionFeedbackEntries.filter(e => e.section && e.comment.trim()).length} of {sectionFeedbackEntries.length} complete
                  </span>
                </div>

                <div className="space-y-2">
                  {sectionFeedbackEntries.map((entry) => {
                    const availableSections = getAvailableSections(entry.id)
                    const currentSection = REVISION_SECTIONS.find(s => s.id === entry.section)
                    const isComplete = !!(entry.section && entry.comment.trim())

                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          'border rounded-xl p-3 transition-colors',
                          isComplete
                            ? 'border-[#fde68a] bg-[#fffbeb]'
                            : 'border-[#e2e8f0] bg-white'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {/* Section dropdown */}
                          <div className="w-[180px] flex-shrink-0">
                            <select
                              value={entry.section}
                              onChange={(e) => updateSectionEntry(entry.id, 'section', e.target.value)}
                              className="w-full px-2.5 py-2 text-[12.5px] border border-[#e2e8f0] rounded-lg bg-white text-[#0f172a] focus:ring-2 focus:ring-[#d97706]/20 focus:border-[#d97706]"
                            >
                              <option value="">Select section...</option>
                              {(currentSection ? [currentSection, ...availableSections.filter(s => s.id !== currentSection.id)] : availableSections).map((section) => (
                                <option key={section.id} value={section.id}>
                                  {section.label}
                                </option>
                              ))}
                            </select>
                            {isComplete && (
                              <span className="text-[10px] text-[#16a34a] font-medium mt-1 block">Complete</span>
                            )}
                          </div>

                          {/* Feedback textarea */}
                          <div className="flex-1 min-w-0">
                            <textarea
                              placeholder="Describe what needs to be revised..."
                              value={entry.comment}
                              onChange={(e) => updateSectionEntry(entry.id, 'comment', e.target.value)}
                              rows={2}
                              className="w-full px-3 py-2 text-[12.5px] text-[#0f172a] border border-[#e2e8f0] rounded-lg placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#d97706]/20 focus:border-[#d97706] outline-none resize-none"
                            />
                          </div>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => removeSectionEntry(entry.id)}
                            className="p-1.5 text-[#94a3b8] hover:text-[#dc2626] hover:bg-[#fef2f2] rounded-lg transition-colors flex-shrink-0 mt-1"
                            title="Remove entry"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {sectionFeedbackEntries.length < REVISION_SECTIONS.length && (
                  <button
                    type="button"
                    onClick={addSectionEntry}
                    className="mt-2 flex items-center gap-1.5 text-[12px] text-[#d97706] hover:text-[#b45309] font-semibold px-2.5 py-1.5 hover:bg-[#fffbeb] rounded-lg transition-colors"
                  >
                    <Plus className="size-3.5" />
                    Add Another Section
                  </button>
                )}
              </div>

              {/* General Notes */}
              <div className="pt-3 border-t border-[#f1f5f9]">
                <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                  General Notes
                  <span className="text-[#94a3b8] font-normal ml-1">(optional)</span>
                </label>
                <textarea
                  placeholder="Any overall feedback or notes..."
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-[12.5px] text-[#0f172a] border border-[#e2e8f0] rounded-lg placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#d97706]/20 focus:border-[#d97706] outline-none resize-none"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                  <XCircle className="size-3.5 text-[#dc2626] flex-shrink-0" />
                  <p className="text-[12px] text-[#dc2626]">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-end gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  setShowRevisionModal(false)
                  setSectionFeedbackEntries([{ id: crypto.randomUUID(), section: '', comment: '' }])
                  setGeneralNotes('')
                  setError(null)
                }}
                disabled={isRequestingRevision}
                className="px-3 py-1.5 text-[12.5px] font-semibold text-[#64748b] border border-[#e2e8f0] hover:bg-[#f1f5f9] rounded-[9px] transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestRevision}
                disabled={isRequestingRevision || sectionFeedbackEntries.every(e => !e.section || !e.comment.trim())}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-white bg-[#d97706] hover:bg-[#b45309] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isRequestingRevision ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                Request Revision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal — Two-Step Confirmation aligned with reviewer */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-[#fee2e2] rounded-[9px]">
                  <XCircle className="size-4 text-[#dc2626]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-[#0f172a]">Reject Certificate</h2>
                  <p className="text-[11px] font-mono text-[#94a3b8]">{certificate.certificateNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setShowRejectModal(false)}
                className="p-1.5 hover:bg-[#f8fafc] rounded-lg transition-colors"
              >
                <X className="size-4 text-[#94a3b8]" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              {/* Summary Strip */}
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#f8fafc] border border-[#f1f5f9] rounded-lg text-[12px] text-[#64748b]">
                <span className="font-semibold text-[#0f172a]">{certificate.uucDescription || '\u2014'}</span>
                <span className="text-[#e2e8f0]">&middot;</span>
                <span>{certificate.customerName || '\u2014'}</span>
                <span className="text-[#e2e8f0]">&middot;</span>
                <span>{assignee.name}</span>
              </div>

              {/* Step 1: Reason */}
              {rejectStep === 'reason' && (
                <>
                  <div className="flex gap-2.5 p-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="size-4 text-[#dc2626]" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-[12px] font-semibold text-[#991b1b]">This action is permanent</h4>
                      <p className="text-[12px] text-[#dc2626]">
                        The certificate will be permanently rejected and cannot be recovered.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                      Rejection Reason <span className="text-[#dc2626]">*</span>
                    </label>
                    <textarea
                      placeholder="Explain why this certificate is being rejected..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 text-[12.5px] text-[#0f172a] border border-[#e2e8f0] rounded-lg placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#dc2626]/20 focus:border-[#dc2626] outline-none resize-none"
                    />
                  </div>
                </>
              )}

              {/* Step 2: Confirm */}
              {rejectStep === 'confirm' && (
                <>
                  <div className="bg-[#fef2f2] border border-[#fecaca] rounded-xl p-4 text-center space-y-2">
                    <svg className="size-8 text-[#dc2626] mx-auto" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <p className="text-[13px] font-semibold text-[#991b1b]">
                      You are about to permanently reject<br />
                      certificate <span className="font-mono">{certificate.certificateNumber}</span>
                    </p>
                    <div className="bg-white/60 rounded-lg px-3 py-2 mt-2 text-left">
                      <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Your reason</p>
                      <p className="text-[12.5px] text-[#0f172a] italic">&ldquo;{rejectReason.trim()}&rdquo;</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                      Type <span className="font-mono text-[#dc2626]">{certificate.certificateNumber}</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={rejectConfirmText}
                      onChange={(e) => setRejectConfirmText(e.target.value)}
                      placeholder={certificate.certificateNumber}
                      className="w-full px-3 py-2 text-[12.5px] font-mono border border-[#e2e8f0] rounded-lg bg-white text-[#0f172a] focus:ring-2 focus:ring-[#dc2626]/20 focus:border-[#dc2626] placeholder:text-[#cbd5e1]"
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                  <XCircle className="size-3.5 text-[#dc2626] flex-shrink-0" />
                  <p className="text-[12px] text-[#dc2626]">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-between flex-shrink-0">
              <div>
                {rejectStep === 'confirm' && (
                  <button
                    onClick={() => {
                      setRejectStep('reason')
                      setRejectConfirmText('')
                      setError(null)
                    }}
                    disabled={isRejecting}
                    className="text-[12.5px] font-semibold text-[#475569] hover:text-[#0f172a] px-3 py-1.5 hover:bg-[#f1f5f9] rounded-[9px] transition-colors disabled:opacity-40"
                  >
                    Back
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowRejectModal(false)
                    setRejectReason('')
                    setRejectStep('reason')
                    setRejectConfirmText('')
                    setError(null)
                  }}
                  disabled={isRejecting}
                  className="px-3 py-1.5 text-[12.5px] font-semibold text-[#64748b] border border-[#e2e8f0] hover:bg-[#f1f5f9] rounded-[9px] transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                {rejectStep === 'reason' ? (
                  <button
                    onClick={() => {
                      if (!rejectReason.trim()) {
                        setError('Please provide a rejection reason')
                        return
                      }
                      setError(null)
                      setRejectStep('confirm')
                    }}
                    disabled={!rejectReason.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    onClick={handleReject}
                    disabled={isRejecting || rejectConfirmText !== certificate.certificateNumber}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isRejecting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <XCircle className="size-3.5" />
                    )}
                    Reject Forever
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
