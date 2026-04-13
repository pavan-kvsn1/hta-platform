'use client'

import { useState } from 'react'
import {
  MessageSquare,
  X,
  ChevronDown,
  ChevronRight,
  User,
  Send,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CustomerFeedback {
  id: string
  eventType: string
  eventData: {
    notes?: string
    message?: string
    response?: string // Admin reply to customer
    customerEmail?: string
    customerName?: string
    customerCompany?: string
    requestedAt?: string
    sentAt?: string
    approvedAt?: string
  }
  createdAt: string
  revision: number
  user?: {
    name: string
    role: string
  }
}

interface CustomerFeedbackSidebarProps {
  feedbacks: CustomerFeedback[]
  isOpen: boolean
  onToggle: () => void
  currentRevision?: number
}

// Group feedbacks by revision
function groupFeedbacksByRevision(feedbacks: CustomerFeedback[]) {
  const groups: Record<number, CustomerFeedback[]> = {}

  feedbacks.forEach(feedback => {
    const revision = feedback.revision || 1
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
      feedbacks: items.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    }))
}

// Get icon and color based on event type
function getFeedbackStyle(eventType: string) {
  switch (eventType) {
    case 'SENT_TO_CUSTOMER':
      return {
        icon: Send,
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-600',
        borderColor: 'border-blue-200',
        label: 'Sent to Customer'
      }
    case 'CUSTOMER_REVISION_REQUESTED':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-purple-100',
        textColor: 'text-purple-600',
        borderColor: 'border-purple-200',
        label: 'Customer Revision Request'
      }
    case 'CUSTOMER_APPROVED':
      return {
        icon: CheckCircle,
        bgColor: 'bg-green-100',
        textColor: 'text-green-600',
        borderColor: 'border-green-200',
        label: 'Customer Approved'
      }
    case 'CUSTOMER_REVISION_FORWARDED':
      return {
        icon: Send,
        bgColor: 'bg-orange-100',
        textColor: 'text-orange-600',
        borderColor: 'border-orange-200',
        label: 'Forwarded to Engineer'
      }
    case 'ADMIN_REPLIED_TO_CUSTOMER':
      return {
        icon: MessageSquare,
        bgColor: 'bg-amber-100',
        textColor: 'text-amber-600',
        borderColor: 'border-amber-200',
        label: 'Admin Response'
      }
    default:
      return {
        icon: MessageSquare,
        bgColor: 'bg-slate-100',
        textColor: 'text-slate-600',
        borderColor: 'border-slate-200',
        label: 'Event'
      }
  }
}

export function CustomerFeedbackSidebar({
  feedbacks,
  isOpen,
  onToggle,
  currentRevision = 1
}: CustomerFeedbackSidebarProps) {
  const [expandedRevisions, setExpandedRevisions] = useState<Set<number>>(new Set([currentRevision]))

  const groupedFeedbacks = groupFeedbacksByRevision(feedbacks)
  const revisionRequestCount = feedbacks.filter(f => f.eventType === 'CUSTOMER_REVISION_REQUESTED').length

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
          className="fixed right-4 top-[calc(50%+60px)] -translate-y-1/2 z-50 flex flex-col items-center gap-1 px-3 py-4 bg-white border-2 border-purple-200 rounded-xl shadow-lg hover:border-purple-400 hover:shadow-xl transition-all"
        >
          <User className="size-5 text-purple-600" />
          {revisionRequestCount > 0 && (
            <span className="absolute -top-2 -right-2 size-5 flex items-center justify-center text-[10px] font-bold text-white bg-purple-500 rounded-full">
              {revisionRequestCount}
            </span>
          )}
          <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">
            Customer
          </span>
        </button>
      )}

      {/* Sidebar Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full bg-white border-l-2 border-purple-200 shadow-2xl z-50 transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          'w-[380px]'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-50 to-purple-100 border-b border-purple-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <User className="size-5 text-purple-700" />
            <h2 className="font-bold text-purple-900">Customer History</h2>
          </div>
          <button
            onClick={onToggle}
            className="p-2 hover:bg-purple-200 rounded-lg transition-colors"
          >
            <X className="size-5 text-purple-600" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-65px)] px-4 py-4">
          {groupedFeedbacks.length === 0 ? (
            <div className="text-center py-12">
              <User className="size-12 text-purple-200 mx-auto mb-3" />
              <p className="text-purple-400 text-sm">No customer interaction history yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedFeedbacks.map(({ revision, feedbacks: revisionFeedbacks }) => (
                <div key={revision} className="rounded-xl border border-purple-200 overflow-hidden">
                  {/* Revision Header */}
                  <button
                    onClick={() => toggleRevision(revision)}
                    className={cn(
                      'w-full px-4 py-3 flex items-center justify-between text-left hover:bg-purple-50 transition-colors',
                      revision === currentRevision && 'bg-purple-50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {expandedRevisions.has(revision) ? (
                        <ChevronDown className="size-4 text-purple-400" />
                      ) : (
                        <ChevronRight className="size-4 text-purple-400" />
                      )}
                      <span className="text-[14px] font-semibold text-purple-900">
                        Version {revision}
                      </span>
                      {revision === currentRevision && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-200 text-purple-700 font-bold uppercase">
                          Current
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-purple-400">
                      {revisionFeedbacks.length} event{revisionFeedbacks.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {/* Revision Content */}
                  {expandedRevisions.has(revision) && (
                    <div className="px-4 pb-4 space-y-3">
                      {revisionFeedbacks.map((feedback) => {
                        const style = getFeedbackStyle(feedback.eventType)
                        const Icon = style.icon
                        const isCustomerAction = feedback.eventType === 'CUSTOMER_REVISION_REQUESTED' ||
                                                  feedback.eventType === 'CUSTOMER_APPROVED'

                        return (
                          <div
                            key={feedback.id}
                            className={cn(
                              'rounded-lg border p-3',
                              style.borderColor,
                              isCustomerAction ? 'bg-purple-50/50' : 'bg-white'
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <div className={cn('p-1.5 rounded-full', style.bgColor)}>
                                <Icon className={cn('size-3', style.textColor)} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn('font-semibold text-[13px]', style.textColor)}>
                                    {style.label}
                                  </span>
                                </div>

                                {/* Customer Info */}
                                {(feedback.eventData.customerName || feedback.eventData.customerEmail) && (
                                  <div className="text-[11px] text-slate-500 mb-1">
                                    {feedback.eventData.customerName && (
                                      <span className="font-medium">{feedback.eventData.customerName}</span>
                                    )}
                                    {feedback.eventData.customerCompany && (
                                      <span> • {feedback.eventData.customerCompany}</span>
                                    )}
                                  </div>
                                )}

                                {/* Notes/Message/Response */}
                                {(feedback.eventData.notes || feedback.eventData.message || feedback.eventData.response) && (
                                  <p className="text-[12px] text-slate-600 whitespace-pre-wrap break-words bg-white/50 p-2 rounded border border-slate-100">
                                    {feedback.eventData.notes || feedback.eventData.message || feedback.eventData.response}
                                  </p>
                                )}

                                {/* Actor info for Admin actions */}
                                {feedback.user && !isCustomerAction && (
                                  <p className="text-[11px] text-slate-400 mt-1">
                                    by {feedback.user.name}
                                  </p>
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
