'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SignatureModal } from '@/components/signatures'
import type { SignatureData } from '@/types/signatures'
import {
  CheckCircle,
  RotateCcw,
  Loader2,
  X,
  FileEdit,
  Send,
  AlertCircle,
  FileText,
} from 'lucide-react'
import type { CertificateData, CustomerData, Signature } from './CustomerCertReviewClient'

interface CustomerApprovalActionsProps {
  certificate: CertificateData
  customer: CustomerData
  signatures: Signature[]
  canApprove: boolean
  onStatusChange?: (status: string) => void
}

export function CustomerApprovalActions({
  certificate,
  customer,
  signatures,
  canApprove,
  onStatusChange,
}: CustomerApprovalActionsProps) {
  const router = useRouter()
  const [isApproving, setIsApproving] = useState(false)
  const [isRequestingRevision, setIsRequestingRevision] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRevisionModal, setShowRevisionModal] = useState(false)

  const [revisionNotes, setRevisionNotes] = useState('')

  const [actionTaken, setActionTaken] = useState<'approved' | 'revision' | null>(null)

  const isRevisionRequired = certificate.status === 'REVISION_REQUIRED'
  const isCustomerRevisionRequired = actionTaken === 'revision' || certificate.status === 'CUSTOMER_REVISION_REQUIRED'
  const isApproved = actionTaken === 'approved' || ['APPROVED', 'PENDING_ADMIN_AUTHORIZATION', 'PENDING_ADMIN_APPROVAL', 'AUTHORIZED'].includes(certificate.status)

  const customerSignature = signatures.find(s => s.signerType === 'CUSTOMER')

  const handleApprove = useCallback(async (data: SignatureData) => {
    setIsApproving(true)
    setError(null)

    try {
      const token = `cert:${certificate.id}`
      const encodedToken = encodeURIComponent(token)

      const response = await apiFetch(`/api/customer/review/${encodedToken}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureData: data.signatureImage,
          signerName: data.signerName,
          signerEmail: customer.email,
          clientEvidence: data.clientEvidence,
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Failed to approve certificate'
        try {
          const text = await response.text()
          if (text) {
            const responseData = JSON.parse(text)
            errorMessage = responseData.error || errorMessage
          }
        } catch {
          errorMessage = `Server error (${response.status})`
        }
        throw new Error(errorMessage)
      }

      setShowApproveModal(false)
      setActionTaken('approved')
      onStatusChange?.('APPROVED')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      throw err
    } finally {
      setIsApproving(false)
    }
  }, [certificate.id, customer.email, router, onStatusChange])

  const handleRequestRevision = async () => {
    if (!revisionNotes.trim()) {
      setError('Please describe what needs to be revised')
      return
    }

    setIsRequestingRevision(true)
    setError(null)

    try {
      const token = `cert:${certificate.id}`
      const encodedToken = encodeURIComponent(token)

      const response = await apiFetch(`/api/customer/review/${encodedToken}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: revisionNotes.trim(),
        }),
      })

      if (!response.ok) {
        const responseData = await response.json()
        throw new Error(responseData.error || 'Failed to request revision')
      }

      setShowRevisionModal(false)
      setRevisionNotes('')
      setActionTaken('revision')
      onStatusChange?.('CUSTOMER_REVISION_REQUIRED')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsRequestingRevision(false)
    }
  }

  return (
    <div className="px-[18px] pb-[18px] pt-3 space-y-2.5">
      {error && (
        <div className="p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg text-[12px] text-[#dc2626] flex items-center gap-2">
          <AlertCircle className="size-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Action Buttons */}
      {canApprove && !customerSignature && (
        <div className="space-y-2">
          <Button
            onClick={() => setShowApproveModal(true)}
            size="sm"
            className="w-full bg-[#16a34a] hover:bg-[#15803d] text-white h-9 rounded-[9px] text-[12.5px] font-semibold"
          >
            <CheckCircle className="size-3.5 mr-1.5" />
            Approve & Sign
          </Button>

          <Button
            onClick={() => setShowRevisionModal(true)}
            size="sm"
            className="w-full bg-[#d97706] hover:bg-[#b45309] text-white h-9 rounded-[9px] text-[12.5px] font-semibold"
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            Request Revision
          </Button>

          <p className="text-[10px] text-[#94a3b8] text-center pt-0.5">
            By approving, you confirm all details are correct.
          </p>
        </div>
      )}

      {/* Status Indicators */}
      {isRevisionRequired && (
        <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#eff6ff] rounded-xl border border-[#bfdbfe]">
          <div className="size-7 rounded-lg bg-[#dbeafe] flex items-center justify-center flex-shrink-0">
            <FileEdit className="size-3.5 text-[#2563eb]" />
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-[#1e40af]">Under Revision</p>
            <p className="text-[11px] text-[#2563eb]">The engineer is working on updates</p>
          </div>
        </div>
      )}

      {isCustomerRevisionRequired && (
        <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#faf5ff] rounded-xl border border-[#e9d5ff]">
          <div className="size-7 rounded-lg bg-[#f3e8ff] flex items-center justify-center flex-shrink-0">
            <Send className="size-3.5 text-[#7c3aed]" />
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-[#6b21a8]">Awaiting Response</p>
            <p className="text-[11px] text-[#7c3aed]">HTA is reviewing your feedback</p>
          </div>
        </div>
      )}

      {isApproved && (
        <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#f0fdf4] rounded-xl border border-[#bbf7d0]">
          <div className="size-7 rounded-lg bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
            <CheckCircle className="size-3.5 text-[#16a34a]" />
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-[#166534]">
              {certificate.status === 'AUTHORIZED' ? 'Certificate Completed' : 'Certificate Approved'}
            </p>
            <p className="text-[11px] text-[#16a34a]">
              {certificate.status === 'AUTHORIZED'
                ? 'Fully authorized and ready for download'
                : 'Awaiting final authorization'}
            </p>
          </div>
        </div>
      )}

      {customerSignature && !isApproved && (
        <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#f0fdf4] rounded-xl border border-[#bbf7d0]">
          <div className="size-7 rounded-lg bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
            <CheckCircle className="size-3.5 text-[#16a34a]" />
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-[#166534]">You Signed</p>
            <p className="text-[11px] text-[#16a34a]">Approved by {customerSignature.signerName}</p>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      <SignatureModal
        isOpen={showApproveModal}
        onClose={() => {
          setShowApproveModal(false)
          setError(null)
        }}
        onConfirm={handleApprove}
        defaultName={customer.name}
        nameReadOnly={true}
        title="Approve Certificate"
        description="Please sign below to approve this calibration certificate. Your signature will be added to the final document."
        confirmLabel="Confirm Approval"
        loading={isApproving}
        error={error}
      />

      {/* Revision Modal */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-[#fef3c7] rounded-[9px]">
                  <RotateCcw className="size-4 text-[#d97706]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-[#0f172a]">Request Revision</h2>
                  <p className="text-[11px] text-[#94a3b8]">{certificate.certificateNumber}</p>
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
                <FileText className="size-3.5 text-[#94a3b8] flex-shrink-0" />
                <span className="font-semibold text-[#0f172a]">{certificate.uucDescription || '—'}</span>
                <span className="text-[#e2e8f0]">·</span>
                <span>{certificate.customerName || '—'}</span>
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                  What needs to be revised? <span className="text-[#dc2626]">*</span>
                </label>
                <Textarea
                  placeholder="Describe the issues or changes you require..."
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  rows={4}
                  className="resize-none text-[12.5px] md:text-[12.5px] border-[#e2e8f0] rounded-lg focus:ring-[#d97706]/20 focus:border-[#d97706] placeholder:text-[#94a3b8]"
                />
              </div>

              <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-3.5 text-[12px] text-[#1e40af]">
                <p className="font-semibold mb-1">What happens next?</p>
                <p className="text-[#2563eb]">Your feedback will be sent to the HTA team. They may contact you via the Discussion panel to clarify or resolve any issues.</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                  <AlertCircle className="size-3.5 text-[#dc2626] flex-shrink-0" />
                  <p className="text-[12px] text-[#dc2626]">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-end gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowRevisionModal(false)
                  setRevisionNotes('')
                  setError(null)
                }}
                disabled={isRequestingRevision}
                className="rounded-[9px] border-[#e2e8f0] text-[12.5px] font-semibold text-[#475569]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleRequestRevision}
                disabled={isRequestingRevision || !revisionNotes.trim()}
                className="bg-[#d97706] hover:bg-[#b45309] text-white rounded-[9px] text-[12.5px] font-semibold"
              >
                {isRequestingRevision ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5 mr-1.5" />
                )}
                Submit Feedback
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
