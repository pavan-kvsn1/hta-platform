'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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

  // Action states
  const [_isApproving, setIsApproving] = useState(false)
  const [isRequestingRevision, setIsRequestingRevision] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal states
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)

  // Form states
  const [sectionFeedbackEntries, setSectionFeedbackEntries] = useState<
    { id: string; section: string; comment: string }[]
  >([{ id: crypto.randomUUID(), section: '', comment: '' }])
  const [generalNotes, setGeneralNotes] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  // Determine reviewability based on status
  const canReview = certificate.status === 'PENDING_REVIEW'
  const isRevisionRequired = certificate.status === 'REVISION_REQUIRED'
  const isPendingCustomer = certificate.status === 'PENDING_CUSTOMER_APPROVAL'
  const isCustomerRevisionRequired = certificate.status === 'CUSTOMER_REVISION_REQUIRED'
  const isApproved = certificate.status === 'APPROVED'
  const isRejected = certificate.status === 'REJECTED'

  // Approval data type
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
    const hasGeneralNotes = generalNotes.trim().length > 0

    if (validSectionFeedbacks.length === 0 && !hasGeneralNotes) {
      setError('Please provide at least one section feedback or general notes')
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
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsRejecting(false)
    }
  }

  // Section feedback handlers
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
      <div className="px-4 pb-4 pt-3 space-y-3">
        {error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Review action buttons - only when reviewable */}
        {canReview && (
          <div className="space-y-2">
            <Button
              onClick={() => setShowApproveModal(true)}
              size="sm"
              className="w-full bg-green-600 hover:bg-green-700 text-white h-9 text-xs font-medium"
            >
              <CheckCircle className="h-3.5 w-3.5 mr-2" />
              Approve & Authorize
            </Button>

            <Button
              onClick={() => setShowRevisionModal(true)}
              variant="outline"
              size="sm"
              className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 h-9 text-xs font-medium"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-2" />
              Request Revision
            </Button>

            <Button
              onClick={() => setShowRejectModal(true)}
              variant="outline"
              size="sm"
              className="w-full border-red-300 text-red-700 hover:bg-red-50 h-9 text-xs font-medium"
            >
              <XCircle className="h-3.5 w-3.5 mr-2" />
              Reject
            </Button>
          </div>
        )}

        {/* Status indicators for non-reviewable states */}
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

        {isCustomerRevisionRequired && (
          <div className="flex items-center gap-3 py-3 px-4 bg-pink-50 rounded-xl border border-pink-100">
            <div className="size-8 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
              <RotateCcw className="h-4 w-4 text-pink-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-pink-800">Customer Revision Requested</p>
              <p className="text-xs text-pink-600">Awaiting engineer response</p>
            </div>
          </div>
        )}

        {isApproved && (
          <div className="flex items-center gap-3 py-3 px-4 bg-green-50 rounded-xl border border-green-100">
            <div className="size-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-800">Certificate Authorized</p>
              <p className="text-xs text-green-600">Finalized and complete</p>
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

        {/* Draft state */}
        {certificate.status === 'DRAFT' && (
          <div className="flex items-center gap-3 py-3 px-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="size-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Clock className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">Draft</p>
              <p className="text-xs text-slate-600">Not yet submitted for review</p>
            </div>
          </div>
        )}
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
        customerName={certificate.customerName}
        onApprove={handleApprove}
      />

      {/* Revision Modal */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
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

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-700">Section Feedback</label>
                  <span className="text-[10px] text-gray-500">
                    {sectionFeedbackEntries.filter(e => e.section && e.comment.trim()).length} of {sectionFeedbackEntries.length} complete
                  </span>
                </div>

                <div className="space-y-3">
                  {sectionFeedbackEntries.map((entry) => {
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
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-0.5 block pb-2">Section</label>
                              <select
                                value={entry.section}
                                onChange={(e) => updateSectionEntry(entry.id, 'section', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                              >
                                <option value="">Select a section...</option>
                                {(currentSection ? [currentSection, ...availableSections.filter(s => s.id !== currentSection.id)] : availableSections).map((section) => (
                                  <option key={section.id} value={section.id}>{section.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-0.5 block py-2">Feedback</label>
                              <Textarea
                                placeholder="Describe what needs to be revised..."
                                value={entry.comment}
                                onChange={(e) => updateSectionEntry(entry.id, 'comment', e.target.value)}
                                rows={2}
                                className="resize-none text-xs focus:ring-orange-500 focus:border-orange-500"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSectionEntry(entry.id)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors mt-4"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
                    className="mt-2 flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 font-medium px-2 py-1.5 hover:bg-orange-50 rounded transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Another Section
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 pb-2">
                  General Notes <span className="text-gray-400 font-normal ml-1">(optional)</span>
                </label>
                <Textarea
                  placeholder="Any overall feedback or notes..."
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  rows={2}
                  className="resize-none text-xs focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </div>

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
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleRequestRevision}
                disabled={isRequestingRevision || (
                  sectionFeedbackEntries.every(e => !e.section || !e.comment.trim()) &&
                  !generalNotes.trim()
                )}
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

            <div className="p-4 space-y-3">
              <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex-shrink-0">
                  <svg className="h-4 w-4 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-red-800">This action is permanent</h4>
                  <p className="text-xs text-red-700">The certificate will be permanently rejected.</p>
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
                  className="resize-none text-xs focus:ring-red-500 focus:border-red-500"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </div>

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
                className="text-xs"
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
    </>
  )
}
