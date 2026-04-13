'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { MessageSquare, Pencil, Check, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useCertificateStore } from '@/lib/stores/certificate-store'
import {
  isRevisionRequest,
  isEngineerResponse,
  type Feedback as BaseFeedback,
} from '@/components/feedback/shared/feedback-utils'

// Extend base feedback type to allow non-nullable user fields (for display)
interface Feedback extends Omit<BaseFeedback, 'user'> {
  user: {
    name: string
    role: string
  }
}

interface SectionFeedbackProps {
  feedbacks: Feedback[]
  sectionId: string
  className?: string
  currentUserName?: string
  currentRevision?: number
}

export function SectionFeedback({ feedbacks, sectionId, className, currentUserName = 'You', currentRevision }: SectionFeedbackProps) {
  const { formData, setSectionResponse } = useCertificateStore()
  const savedResponse = formData.sectionResponses[sectionId] || ''

  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(savedResponse)

  // Sync editText when savedResponse changes (e.g., from store hydration)
  useEffect(() => {
    if (!isEditing) {
      setEditText(savedResponse)
    }
  }, [savedResponse, isEditing])

  // Filter feedbacks for this specific section
  // Only show feedbacks from the current revision cycle if currentRevision is provided
  const sectionFeedbacks = feedbacks.filter(
    (f) => f.targetSection === sectionId && f.comment &&
      (currentRevision === undefined || f.revisionNumber === currentRevision)
  )

  if (sectionFeedbacks.length === 0) {
    return null
  }

  // Get the latest revision request for this section
  const latestRequest = sectionFeedbacks
    .filter(f => isRevisionRequest(f.feedbackType) || f.feedbackType === 'CUSTOMER_REVISION_FORWARDED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

  if (!latestRequest) {
    return null
  }

  // Find the user's previously submitted response (from a prior revision)
  const submittedResponse = sectionFeedbacks
    .filter(f => isEngineerResponse(f.feedbackType))
    .filter(f => new Date(f.createdAt).getTime() > new Date(latestRequest.createdAt).getTime())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]

  const isCustomerForwarded = latestRequest.feedbackType === 'CUSTOMER_REVISION_FORWARDED'

  // Determine if we have a draft response (local) or a submitted response (from DB)
  const hasDraftResponse = savedResponse.trim().length > 0
  const hasSubmittedResponse = !!submittedResponse

  const handleSaveResponse = () => {
    if (editText.trim()) {
      setSectionResponse(sectionId, editText.trim())
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditText(savedResponse)
    setIsEditing(false)
  }

  const handleStartEdit = () => {
    setEditText(savedResponse)
    setIsEditing(true)
  }

  const handleStartNewResponse = () => {
    setEditText('')
    setIsEditing(true)
  }

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden',
      isCustomerForwarded
        ? 'bg-purple-50 border-purple-200'
        : 'bg-orange-50 border-orange-200',
      className
    )}>
      {/* Header */}
      <div className={cn(
        'px-4 py-2 border-b',
        isCustomerForwarded
          ? 'bg-purple-100/50 border-purple-200'
          : 'bg-orange-100/50 border-orange-200'
      )}>
        <span className={cn(
          'text-xs font-bold uppercase tracking-wider',
          isCustomerForwarded ? 'text-purple-700' : 'text-orange-700'
        )}>
          Section Feedback (Latest)
        </span>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Reviewer Feedback */}
        <div className={cn(
          'bg-white rounded-lg border-l-4 p-3',
          isCustomerForwarded ? 'border-purple-400' : 'border-orange-400'
        )}>
          <div className="flex items-start gap-2">
            <div className={cn(
              'size-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold',
              isCustomerForwarded ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'
            )}>
              {latestRequest.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-slate-900 text-xs">
                  {latestRequest.user.name}
                </span>
                <span className="text-[10px] text-slate-400">
                  Reviewer • {formatDistanceToNow(new Date(latestRequest.createdAt), { addSuffix: true })}
                </span>
              </div>
              <p className="text-slate-700 text-xs whitespace-pre-wrap">
                {latestRequest.comment}
              </p>
            </div>
          </div>
        </div>

        {/* Previously Submitted Response (from DB - read only) */}
        {hasSubmittedResponse && (
          <div className="bg-white rounded-lg border-l-4 border-green-400 p-3">
            <div className="flex items-start gap-2">
              <div className="size-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold bg-green-100 text-green-700">
                {currentUserName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-900 text-xs">You</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                    Submitted
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {formatDistanceToNow(new Date(submittedResponse.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-slate-700 text-xs whitespace-pre-wrap">
                  {submittedResponse.comment}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Draft Response (local - editable) */}
        {!hasSubmittedResponse && hasDraftResponse && !isEditing && (
          <div className="bg-white rounded-lg border-l-4 border-blue-400 p-3">
            <div className="flex items-start gap-2">
              <div className="size-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold bg-blue-100 text-blue-700">
                {currentUserName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 text-xs">You</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                      Draft
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700"
                    onClick={handleStartEdit}
                  >
                    <Pencil className="size-3 mr-1" />
                    Edit
                  </Button>
                </div>
                <p className="text-slate-700 text-xs whitespace-pre-wrap">
                  {savedResponse}
                </p>
                <p className="text-[10px] text-amber-600 mt-2 italic">
                  This response will be submitted when you submit the certificate.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Edit/New Response Input */}
        {!hasSubmittedResponse && (isEditing || !hasDraftResponse) && (
          <div className="bg-white rounded-lg border border-slate-200 p-2">
            <div className="flex items-center gap-2 mb-2 text-[10px] text-slate-500">
              <MessageSquare className="size-3" />
              <span className="text-xs">
                {hasDraftResponse ? 'Edit your response' : "Add your response when you've addressed this feedback"}
              </span>
            </div>
            <div className="space-y-2">
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="Describe how you've addressed this feedback..."
                className="min-h-[60px] text-xs resize-none md:text-xs p-2"
                autoFocus={isEditing}
              />
              <div className="flex justify-end gap-2">
                {isEditing && hasDraftResponse && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={handleCancelEdit}
                  >
                    <X className="size-3 mr-1" />
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={handleSaveResponse}
                  disabled={!editText.trim()}
                >
                  <Check className="size-3 mr-1" />
                  {hasDraftResponse ? 'Update' : 'Save Response'}
                </Button>
              </div>
              {!hasDraftResponse && (
                <p className="text-[10px] text-slate-400 italic">
                  Your response will be saved locally and submitted when you submit the certificate.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
