'use client'

import { cn } from '@/lib/utils'
import { ArrowRight, Calendar } from 'lucide-react'
import {
  type Feedback,
  type ReviewerEdit,
  getFeedbackStyle,
  isRevisionRequest,
  isEngineerResponse,
  isApproval,
  isCustomerFeedback,
  formatDateTime,
  formatDateDisplay,
  getUserInitials,
  getRoleBadge,
} from './feedback-utils'

interface FeedbackItemProps {
  feedback: Feedback
  showTimeline?: boolean
  isLast?: boolean
  variant?: 'default' | 'compact'
  currentUserName?: string
}

export function FeedbackItem({
  feedback,
  showTimeline = false,
  isLast = true,
  variant = 'default',
  currentUserName,
}: FeedbackItemProps) {
  const style = getFeedbackStyle(feedback.feedbackType)
  const Icon = style.icon
  const isCustomer = isCustomerFeedback(feedback.feedbackType)
  const isEngineer = isEngineerResponse(feedback.feedbackType)
  const isApproved = isApproval(feedback.feedbackType)
  const isRevision = isRevisionRequest(feedback.feedbackType)
  const roleBadge = getRoleBadge(feedback.user.role || 'UNKNOWN')
  const userName = feedback.user.name || 'Unknown'

  // Determine if this is "You" (current user's response)
  const isCurrentUser = currentUserName &&
    userName.toLowerCase() === currentUserName.toLowerCase()

  const bgColor = isApproved
    ? 'bg-green-50'
    : isCustomer
      ? 'bg-purple-50'
      : isEngineer
        ? 'bg-blue-50'
        : isRevision
          ? 'bg-orange-50'
          : 'bg-white'

  const borderColor = isApproved
    ? 'border-green-200'
    : isCustomer
      ? 'border-purple-200'
      : isEngineer
        ? 'border-blue-200'
        : isRevision
          ? 'border-orange-200'
          : 'border-slate-200'

  return (
    <div className="relative">
      {/* Timeline connector */}
      {showTimeline && !isLast && (
        <div className="absolute left-[14px] top-8 bottom-0 w-px bg-slate-200" />
      )}

      <div className={cn(
        'rounded-lg border p-3',
        bgColor,
        borderColor,
        variant === 'compact' && 'p-2'
      )}>
        <div className="flex items-start gap-2.5">
          {/* Avatar */}
          <div className={cn(
            'size-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 relative z-10 ring-2',
            style.bgColor,
            style.textColor,
            isApproved ? 'ring-green-50' : isCustomer ? 'ring-purple-50' : isEngineer ? 'ring-blue-50' : 'ring-orange-50'
          )}>
            {isApproved ? (
              <Icon className="size-4" />
            ) : (
              getUserInitials(userName)
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn(
                  'text-xs font-semibold',
                  isApproved ? 'text-green-900' : isCustomer ? 'text-purple-900' : isEngineer ? 'text-blue-900' : 'text-slate-900'
                )}>
                  {isCurrentUser ? 'You' : userName}
                </span>
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-medium',
                  isApproved ? 'bg-green-100 text-green-700' :
                  isCustomer ? 'bg-purple-100 text-purple-700' :
                  isEngineer ? 'bg-blue-100 text-blue-700' :
                  roleBadge.className
                )}>
                  {style.label}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 flex-shrink-0">
                {formatDateTime(feedback.createdAt)}
              </span>
            </div>

            {/* Comment */}
            {feedback.comment && (
              <p className={cn(
                'text-xs leading-relaxed whitespace-pre-wrap',
                variant === 'compact' ? 'text-slate-600' : 'text-slate-700'
              )}>
                {feedback.comment}
              </p>
            )}

            {/* Reviewer Edits */}
            {feedback.reviewerEdits && feedback.reviewerEdits.length > 0 && (
              <ReviewerEditsDisplay edits={feedback.reviewerEdits} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Sub-component for displaying Reviewer edits
function ReviewerEditsDisplay({ edits }: { edits: ReviewerEdit[] }) {
  return (
    <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px]">
      <div className="flex items-center gap-1.5 text-amber-700 font-semibold mb-2">
        <Calendar className="size-3.5" />
        Edits Applied
      </div>
      <div className="space-y-2">
        {edits.map((edit, idx) => (
          <div
            key={`${edit.field}-${idx}`}
            className={cn(idx > 0 && 'pt-2 border-t border-amber-200/60')}
          >
            <p className="font-semibold text-slate-700 text-[11px] mb-1">
              {edit.fieldLabel}
            </p>
            <div className="flex items-center gap-1.5 text-slate-600">
              <span>{formatDateDisplay(edit.previousValue)}</span>
              <ArrowRight className="size-3 text-slate-400" />
              <span className={cn(
                'font-medium',
                edit.autoCalculated ? 'text-blue-600' : 'text-amber-700'
              )}>
                {formatDateDisplay(edit.newValue)}
              </span>
            </div>
            {edit.reason && !edit.autoCalculated && (
              <p className="text-[10px] text-slate-500 mt-1 italic">
                {edit.reason}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Specialized approval item
export function ApprovalItem({ feedback }: { feedback: Feedback }) {
  const style = getFeedbackStyle(feedback.feedbackType)
  const Icon = style.icon
  const userName = feedback.user.name || 'Unknown'

  return (
    <div className="rounded-lg bg-white border border-green-100 p-3">
      <div className="flex items-start gap-2.5">
        <div className="size-7 rounded-full flex items-center justify-center bg-green-200 text-green-700 ring-2 ring-green-50 flex-shrink-0">
          <Icon className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-green-900">
                {userName}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700">
                Approved
              </span>
            </div>
            <span className="text-[10px] text-slate-400 flex-shrink-0">
              {formatDateTime(feedback.createdAt)}
            </span>
          </div>
          {feedback.comment && (
            <p className="text-xs text-slate-700 leading-relaxed">
              {feedback.comment}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
