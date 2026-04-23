'use client'

import { apiFetch } from '@/lib/api-client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import {
  CheckCircle,
  RotateCcw,
  MessageSquare,
  FileText,
  Send,
  Loader2,
  X,
} from 'lucide-react'

interface ReviewerActionsProps {
  certificateId: string
  certificateNumber: string
  status: string
  assigneeId: string
  assigneeName: string
  chatThreadId: string | null
}

export function ReviewerActions({
  certificateId,
  certificateNumber,
  status,
  assigneeId: _assigneeId,
  assigneeName,
  chatThreadId: _chatThreadId,
}: ReviewerActionsProps) {
  const router = useRouter()
  const [isApproving, setIsApproving] = useState(false)
  const [isRequestingRevision, setIsRequestingRevision] = useState(false)
  const [isSendingToCustomer, setIsSendingToCustomer] = useState(false)
  const [showRevisionForm, setShowRevisionForm] = useState(false)
  const [showChatSidebar, setShowChatSidebar] = useState(false)
  const [revisionComment, setRevisionComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canReview = status === 'PENDING_REVIEW'
  const isRevisionRequired = status === 'REVISION_REQUIRED'
  const isPendingCustomer = status === 'PENDING_CUSTOMER_APPROVAL'
  const isApproved = status === 'APPROVED'

  const handleApprove = async () => {
    setIsApproving(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/certificates/${certificateId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to approve certificate')
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsApproving(false)
    }
  }

  const handleRequestRevision = async () => {
    if (!revisionComment.trim()) {
      setError('Please provide feedback for the revision request')
      return
    }

    setIsRequestingRevision(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/certificates/${certificateId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_revision',
          comment: revisionComment.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to request revision')
      }

      setShowRevisionForm(false)
      setRevisionComment('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsRequestingRevision(false)
    }
  }

  const handleSendToCustomer = async () => {
    setIsSendingToCustomer(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/certificates/${certificateId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_to_customer',
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send to customer')
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSendingToCustomer(false)
    }
  }

  return (
    <>
      <div className="space-y-4">
        {/* Review Actions Card */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-500" />
            Review Actions
          </h3>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {canReview && !showRevisionForm && (
              <>
                <Button
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isApproving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Approve Certificate
                </Button>

                <Button
                  onClick={() => setShowRevisionForm(true)}
                  variant="outline"
                  className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Request Revision
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-500">or</span>
                  </div>
                </div>

                <Button
                  onClick={handleSendToCustomer}
                  disabled={isSendingToCustomer}
                  variant="outline"
                  className="w-full"
                >
                  {isSendingToCustomer ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send to Customer
                </Button>
              </>
            )}

            {/* Inline Revision Form */}
            {canReview && showRevisionForm && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900">Request Revision</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowRevisionForm(false)
                      setRevisionComment('')
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-gray-500">
                  Provide feedback for the assignee about what needs to be revised.
                </p>
                <Textarea
                  placeholder="Enter your feedback for the revision..."
                  value={revisionComment}
                  onChange={(e) => setRevisionComment(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRevisionForm(false)
                      setRevisionComment('')
                    }}
                    disabled={isRequestingRevision}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRequestRevision}
                    disabled={isRequestingRevision || !revisionComment.trim()}
                    className="flex-1 bg-orange-600 hover:bg-orange-700"
                  >
                    {isRequestingRevision ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-2" />
                    )}
                    Submit
                  </Button>
                </div>
              </div>
            )}

            {isRevisionRequired && (
              <div className="text-center py-4">
                <div className="text-orange-600 font-medium mb-2">
                  Revision Requested
                </div>
                <p className="text-sm text-gray-500">
                  Waiting for {assigneeName} to make revisions and resubmit.
                </p>
              </div>
            )}

            {isPendingCustomer && (
              <div className="text-center py-4">
                <div className="text-blue-600 font-medium mb-2">
                  Sent to Customer
                </div>
                <p className="text-sm text-gray-500">
                  Waiting for customer approval.
                </p>
              </div>
            )}

            {isApproved && (
              <div className="text-center py-4">
                <div className="text-green-600 font-medium mb-2">
                  <CheckCircle className="h-5 w-5 inline mr-2" />
                  Certificate Approved
                </div>
                <p className="text-sm text-gray-500">
                  This certificate has been approved.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Chat with Assignee Card */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-gray-500" />
            Communication
          </h3>

          <Button
            onClick={() => setShowChatSidebar(true)}
            variant="outline"
            className="w-full"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Chat with {assigneeName}
          </Button>

          <p className="text-xs text-gray-500 mt-2 text-center">
            Discuss the certificate with the assignee
          </p>
        </div>

        {/* Certificate Info */}
        <div className="bg-gray-50 rounded-lg border p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Certificate Info
          </h4>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Number:</dt>
              <dd className="font-medium text-gray-900">{certificateNumber}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Assignee:</dt>
              <dd className="font-medium text-gray-900">{assigneeName}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Chat Sidebar */}
      <ChatSidebar
        isOpen={showChatSidebar}
        onClose={() => setShowChatSidebar(false)}
        certificateId={certificateId}
        threadType="ASSIGNEE_REVIEWER"
      />
    </>
  )
}
