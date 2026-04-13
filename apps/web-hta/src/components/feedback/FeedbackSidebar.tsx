'use client'

import { useState } from 'react'
import {
  MessageSquare,
  X,
  ChevronDown,
  ChevronRight,
  User,
  AlertTriangle,
  CheckCircle,
  XCircle,
  PenLine,
  Calendar,
  ArrowRight
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Individual Reviewer edit
interface ReviewerEdit {
  field: string
  fieldLabel: string
  previousValue: string | null
  newValue: string
  reason: string
  autoCalculated: boolean
}

interface Feedback {
  id: string
  feedbackType: string
  comment: string | null
  createdAt: string
  revisionNumber?: number
  user: {
    name: string
    role: string
  }
  // Individual Reviewer edits (new format)
  reviewerEdits?: ReviewerEdit[] | null
}

interface FeedbackSidebarProps {
  feedbacks: Feedback[]
  isOpen: boolean
  onToggle: () => void
  currentRevision?: number
}

// Format date for display
function formatDateDisplay(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Group feedbacks by revision
// Engineer responses are grouped with the PREVIOUS version they're responding to
function groupFeedbacksByRevision(feedbacks: Feedback[]) {
  const groups: Record<number, Feedback[]> = {}

  feedbacks.forEach(feedback => {
    let revision = feedback.revisionNumber || 1

    // Engineer responses belong to the previous version (the one they're responding to)
    // e.g., if engineer submits response with version 3, it's a response to version 2's feedback
    if (feedback.feedbackType === 'ENGINEER_RESPONSE' && revision > 1) {
      revision = revision - 1
    }

    if (!groups[revision]) {
      groups[revision] = []
    }
    groups[revision].push(feedback)
  })

  // Sort by revision descending (newest first)
  return Object.entries(groups)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([revision, items]) => ({
      revision: Number(revision),
      // Sort within group: Reviewer feedback first, then engineer response (by date)
      feedbacks: items.sort((a, b) => {
        // Reviewer feedbacks (non-engineer) come first
        const aIsEngineer = a.feedbackType === 'ENGINEER_RESPONSE'
        const bIsEngineer = b.feedbackType === 'ENGINEER_RESPONSE'
        if (aIsEngineer !== bIsEngineer) {
          return aIsEngineer ? 1 : -1 // Engineer responses come after Reviewer feedback
        }
        // Within same type, sort by date
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
    }))
}

// Get icon and color based on feedback type
function getFeedbackStyle(feedbackType: string) {
  switch (feedbackType) {
    case 'REVISION_REQUEST':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-orange-100',
        textColor: 'text-orange-600',
        borderColor: 'border-orange-200',
        label: 'Revision Request'
      }
    case 'APPROVAL_NOTE':
      return {
        icon: CheckCircle,
        bgColor: 'bg-green-100',
        textColor: 'text-green-600',
        borderColor: 'border-green-200',
        label: 'Approved'
      }
    case 'REJECTION_REASON':
      return {
        icon: XCircle,
        bgColor: 'bg-red-100',
        textColor: 'text-red-600',
        borderColor: 'border-red-200',
        label: 'Rejected'
      }
    case 'ENGINEER_RESPONSE':
      return {
        icon: PenLine,
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-600',
        borderColor: 'border-blue-200',
        label: 'Engineer Response'
      }
    case 'CUSTOMER_REVISION_REQUEST':
      return {
        icon: User,
        bgColor: 'bg-purple-100',
        textColor: 'text-purple-600',
        borderColor: 'border-purple-200',
        label: 'Customer Revision Request'
      }
    case 'CUSTOMER_REVISION_FORWARDED':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-purple-100',
        textColor: 'text-purple-600',
        borderColor: 'border-purple-200',
        label: 'Customer Feedback Forwarded'
      }
    default:
      return {
        icon: MessageSquare,
        bgColor: 'bg-slate-100',
        textColor: 'text-slate-600',
        borderColor: 'border-slate-200',
        label: 'Comment'
      }
  }
}

export function FeedbackSidebar({ feedbacks, isOpen, onToggle, currentRevision = 1 }: FeedbackSidebarProps) {
  const [expandedRevisions, setExpandedRevisions] = useState<Set<number>>(new Set([currentRevision]))

  const groupedFeedbacks = groupFeedbacksByRevision(feedbacks)
  const unreadCount = feedbacks.filter(f => f.feedbackType === 'REVISION_REQUEST').length

  const toggleRevision = (revision: number) => {
    const newExpanded = new Set(expandedRevisions)
    if (newExpanded.has(revision)) {
      newExpanded.delete(revision)
    } else {
      newExpanded.add(revision)
    }
    setExpandedRevisions(newExpanded)
  }

  return (
    <>
      {/* Toggle Button - Fixed on right side when collapsed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed right-4 top-[calc(50%-60px)] -translate-y-1/2 z-50 flex flex-col items-center gap-1 px-3 py-4 bg-white border-2 border-slate-200 rounded-xl shadow-lg hover:border-primary hover:shadow-xl transition-all"
        >
          <MessageSquare className="size-5 text-slate-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 size-5 flex items-center justify-center text-[10px] font-bold text-white bg-orange-500 rounded-full">
              {unreadCount}
            </span>
          )}
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Engineer
          </span>
        </button>
      )}

      {/* Sidebar Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full bg-white border-l-2 border-slate-200 shadow-2xl z-50 transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          'w-[380px]'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <MessageSquare className="size-5 text-slate-700" />
            <h2 className="font-bold text-slate-900">Engineer History</h2>
          </div>
          <button
            onClick={onToggle}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="size-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-65px)] px-4 py-4">
          {groupedFeedbacks.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="size-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No feedback history yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedFeedbacks.map(({ revision, feedbacks: revisionFeedbacks }) => (
                <div key={revision} className="rounded-xl border border-slate-200 overflow-hidden">
                  {/* Revision Header */}
                  <button
                    onClick={() => toggleRevision(revision)}
                    className={cn(
                      'w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors',
                      revision === currentRevision && 'bg-primary/5'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {expandedRevisions.has(revision) ? (
                        <ChevronDown className="size-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="size-4 text-slate-400" />
                      )}
                      <span className="text-[14px] font-semibold text-slate-900">
                        Version {revision}
                      </span>
                      {revision === currentRevision && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold uppercase">
                          Current
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {revisionFeedbacks.length} item{revisionFeedbacks.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {/* Revision Content */}
                  {expandedRevisions.has(revision) && (
                    <div className="px-4 pb-4 space-y-3">
                      {revisionFeedbacks.map((feedback) => {
                        const style = getFeedbackStyle(feedback.feedbackType)
                        const Icon = style.icon
                        const isReviewer = feedback.user.role === 'ADMIN'

                        return (
                          <div
                            key={feedback.id}
                            className={cn(
                              'rounded-lg border p-3',
                              style.borderColor,
                              isReviewer ? 'bg-white' : 'bg-blue-50/50'
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <div className={cn('p-1.5 rounded-full', style.bgColor)}>
                                {isReviewer ? (
                                  <Icon className={cn('size-3', style.textColor)} />
                                ) : (
                                  <PenLine className="size-3 text-blue-600" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold text-[13px] text-slate-700 truncate">
                                    {feedback.user.name}
                                  </span>
                                  <span className={cn(
                                    'text-[10px] px-1.5 py-0.5 rounded font-medium',
                                    isReviewer ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-600'
                                  )}>
                                    {isReviewer ? 'Reviewer' : 'Engineer'}
                                  </span>
                                </div>
                                {feedback.comment && (
                                  <p className="text-[12px] text-slate-500 whitespace-pre-wrap break-words">
                                    {feedback.comment}
                                  </p>
                                )}

                                {/* Reviewer Edits Info */}
                                {feedback.reviewerEdits && feedback.reviewerEdits.length > 0 && (
                                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px]">
                                    <div className="flex items-center gap-1.5 text-amber-700 font-semibold mb-2">
                                      <Calendar className="size-3.5" />
                                      Reviewer Edits Applied
                                    </div>
                                    <div className="space-y-2">
                                      {feedback.reviewerEdits.map((edit, idx) => (
                                        <div
                                          key={edit.field}
                                          className={cn(
                                            idx > 0 && 'pt-2 border-t border-amber-200/60'
                                          )}
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
                                          <p className={cn(
                                            'text-[10px] mt-1 italic',
                                            edit.autoCalculated ? 'text-blue-500' : 'text-slate-500'
                                          )}>
                                            {edit.autoCalculated ? (
                                              <>⚡ {edit.reason}</>
                                            ) : (
                                              <>Reason: {edit.reason}</>
                                            )}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <p className="text-[10px] text-slate-400 mt-2">
                                  {new Date(feedback.createdAt).toLocaleDateString('en-GB', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overlay when open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onToggle}
        />
      )}
    </>
  )
}
