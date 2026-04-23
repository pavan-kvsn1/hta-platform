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
  Clock as _Clock,
  FileEdit,
  Send,
  AlertCircle,
} from 'lucide-react'
import { cn as _cn } from '@/lib/utils'
import type { CertificateData, CustomerData, Signature } from './CustomerCertReviewClient'

interface CustomerApprovalActionsProps {
  certificate: CertificateData
  customer: CustomerData
  signatures: Signature[]
  canApprove: boolean
}

export function CustomerApprovalActions({
  certificate,
  customer,
  signatures,
  canApprove,
}: CustomerApprovalActionsProps) {
  const router = useRouter()
  const [isApproving, setIsApproving] = useState(false)
  const [isRequestingRevision, setIsRequestingRevision] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal states
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRevisionModal, setShowRevisionModal] = useState(false)

  // Form states
  const [revisionNotes, setRevisionNotes] = useState('')

  // Status checks
  const isRevisionRequired = certificate.status === 'REVISION_REQUIRED'
  const isCustomerRevisionRequired = certificate.status === 'CUSTOMER_REVISION_REQUIRED'
  const _isPendingApproval = certificate.status === 'PENDING_CUSTOMER_APPROVAL'
  const isApproved = ['APPROVED', 'PENDING_ADMIN_AUTHORIZATION', 'PENDING_ADMIN_APPROVAL', 'AUTHORIZED'].includes(certificate.status)

  // Check if customer already signed
  const customerSignature = signatures.find(s => s.signerType === 'CUSTOMER')

  const handleApprove = useCallback(async (data: SignatureData) => {
    setIsApproving(true)
    setError(null)

    try {
      // Use session-based token format: cert:ID
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
      router.push('/customer/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      throw err
    } finally {
      setIsApproving(false)
    }
  }, [certificate.id, customer.email, router])

  const handleRequestRevision = async () => {
    if (!revisionNotes.trim()) {
      setError('Please describe what needs to be revised')
      return
    }

    setIsRequestingRevision(true)
    setError(null)

    try {
      // Use session-based token format: cert:ID
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
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsRequestingRevision(false)
    }
  }

  return (
    <div className="px-4 pb-4 pt-3 space-y-3">
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Customer can take action */}
      {canApprove && !customerSignature && (
        <div className="space-y-2">
          {/* Primary Action - Approve */}
          <Button
            onClick={() => setShowApproveModal(true)}
            size="sm"
            className="w-full bg-green-600 hover:bg-green-700 text-white h-9 text-xs font-medium"
          >
            <CheckCircle className="h-3.5 w-3.5 mr-2" />
            Approve & Sign
          </Button>

          {/* Secondary Action - Request Revision */}
          <Button
            onClick={() => setShowRevisionModal(true)}
            variant="outline"
            size="sm"
            className="w-full bg-orange-600 hover:bg-orange-700 text-white h-9 text-xs font-medium"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-2" />
            Request Revision
          </Button>

          <p className="text-[10px] text-gray-400 text-center pt-1">
            By approving, you confirm all details are correct.
          </p>
        </div>
      )}

      {/* Status Indicators for non-action states */}
      {isRevisionRequired && (
        <div className="flex items-center gap-3 py-3 px-4 bg-blue-50 rounded-xl border border-blue-100">
          <div className="size-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <FileEdit className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-800">Under Revision</p>
            <p className="text-xs text-blue-600">The engineer is working on updates</p>
          </div>
        </div>
      )}

      {isCustomerRevisionRequired && (
        <div className="flex items-center gap-3 py-3 px-4 bg-purple-50 rounded-xl border border-purple-100">
          <div className="size-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Send className="h-4 w-4 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-purple-800">Awaiting Response</p>
            <p className="text-xs text-purple-600">HTA is reviewing your feedback</p>
          </div>
        </div>
      )}

      {isApproved && (
        <div className="flex items-center gap-3 py-3 px-4 bg-green-50 rounded-xl border border-green-100">
          <div className="size-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-green-800">
              {certificate.status === 'AUTHORIZED' ? 'Certificate Completed' : 'Certificate Approved'}
            </p>
            <p className="text-xs text-green-600">
              {certificate.status === 'AUTHORIZED'
                ? 'Fully authorized and ready for download'
                : 'Awaiting final authorization'}
            </p>
          </div>
        </div>
      )}

      {/* If customer already signed */}
      {customerSignature && !isApproved && (
        <div className="flex items-center gap-3 py-3 px-4 bg-green-50 rounded-xl border border-green-100">
          <div className="size-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-green-800">You Signed</p>
            <p className="text-xs text-green-600">Certificate approved by {customerSignature.signerName}</p>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-100 rounded-lg">
                  <RotateCcw className="h-4 w-4 text-amber-600" />
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

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Please describe what needs to be revised <span className="text-red-500">*</span>
                </label>
                <Textarea
                  placeholder="Describe the issues or changes you require..."
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  rows={4}
                  className="resize-none text-sm focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
                <p className="font-medium mb-1">What happens next?</p>
                <p>Your feedback will be sent to the HTA team for review. They may contact you via the Discussion panel to clarify or resolve any issues.</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
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
                  setRevisionNotes('')
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
                disabled={isRequestingRevision || !revisionNotes.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
              >
                {isRequestingRevision ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
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
