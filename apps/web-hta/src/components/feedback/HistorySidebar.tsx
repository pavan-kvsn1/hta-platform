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
  PenLine,
  XCircle,
  Calendar,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Engineer feedback types
interface ReviewerEdit {
  field: string
  fieldLabel: string
  previousValue: string | null
  newValue: string
  reason: string
  autoCalculated: boolean
}

interface EngineerFeedback {
  id: string
  feedbackType: string
  comment: string | null
  createdAt: string
  revisionNumber: number
  user: {
    name: string
    role: string
  }
  reviewerEdits?: ReviewerEdit[] | null
}

// Customer event types
interface CustomerEvent {
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

interface HistorySidebarProps {
  engineerFeedbacks: EngineerFeedback[]
  customerEvents: CustomerEvent[]
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

// Group engineer feedbacks by revision
function groupEngineerFeedbacksByRevision(feedbacks: EngineerFeedback[]) {
  const groups: Record<number, EngineerFeedback[]> = {}

  feedbacks.forEach(feedback => {
    let revision = feedback.revisionNumber || 1
    if (feedback.feedbackType === 'ENGINEER_RESPONSE' && revision > 1) {
      revision = revision - 1
    }
    if (!groups[revision]) {
      groups[revision] = []
    }
    groups[revision].push(feedback)
  })

  return Object.entries(groups)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([revision, items]) => ({
      revision: Number(revision),
      feedbacks: items.sort((a, b) => {
        const aIsEngineer = a.feedbackType === 'ENGINEER_RESPONSE'
        const bIsEngineer = b.feedbackType === 'ENGINEER_RESPONSE'
        if (aIsEngineer !== bIsEngineer) {
          return aIsEngineer ? 1 : -1
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
    }))
}

// Group customer events by revision
function groupCustomerEventsByRevision(events: CustomerEvent[]) {
  const groups: Record<number, CustomerEvent[]> = {}

  events.forEach(event => {
    const revision = event.revision || 1
    if (!groups[revision]) {
      groups[revision] = []
    }
    groups[revision].push(event)
  })

  return Object.entries(groups)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([revision, items]) => ({
      revision: Number(revision),
      events: items.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    }))
}

// Get style for engineer feedback
function getEngineerFeedbackStyle(feedbackType: string) {
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

// Get style for customer event
function getCustomerEventStyle(eventType: string) {
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

export function HistorySidebar({
  engineerFeedbacks,
  customerEvents,
  isOpen,
  onToggle,
  currentRevision = 1
}: HistorySidebarProps) {
  const [activeTab, setActiveTab] = useState<'engineer' | 'customer'>('engineer')
  const [expandedRevisions, setExpandedRevisions] = useState<Set<number>>(new Set([currentRevision]))

  const groupedEngineerFeedbacks = groupEngineerFeedbacksByRevision(engineerFeedbacks)
  const groupedCustomerEvents = groupCustomerEventsByRevision(customerEvents)

  const engineerCount = engineerFeedbacks.filter(f => f.feedbackType === 'REVISION_REQUEST').length
  const customerCount = customerEvents.filter(e => e.eventType === 'CUSTOMER_REVISION_REQUESTED').length
  const totalCount = engineerCount + customerCount

  const hasEngineerData = engineerFeedbacks.length > 0
  const hasCustomerData = customerEvents.length > 0

  const toggleRevision = (revision: number) => {
    const newExpanded = new Set(expandedRevisions)
    if (newExpanded.has(revision)) {
      newExpanded.delete(revision)
    } else {
      newExpanded.add(revision)
    }
    setExpandedRevisions(newExpanded)
  }

  // Don't render if no data
  if (!hasEngineerData && !hasCustomerData) {
    return null
  }

  const handleTabClick = (tab: 'engineer' | 'customer') => {
    if (isOpen && activeTab === tab) {
      // Clicking the active tab closes the sidebar
      onToggle()
    } else {
      setActiveTab(tab)
      if (!isOpen) {
        onToggle()
      }
    }
  }

  return (
    <>
      {/* Vertical Folder Tabs - Fixed on right side, moves when sidebar is open */}
      <div className={cn(
        "fixed top-1/2 -translate-y-1/2 z-50 flex flex-col gap-1 transition-all duration-300 ease-in-out",
        isOpen ? "right-[400px]" : "right-0"
      )}>
        {/* Engineer Tab */}
        {hasEngineerData && (
          <button
            onClick={() => handleTabClick('engineer')}
            className={cn(
              'relative flex items-center justify-center px-2 py-6 border-2 border-r-0 rounded-l-xl shadow-lg transition-all',
              'hover:shadow-xl',
              isOpen && activeTab === 'engineer'
                ? 'bg-primary text-white border-primary'
                : 'bg-white border-slate-200 hover:border-primary text-slate-600 hover:text-primary'
            )}
          >
            <span
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              Engineer
            </span>
            {engineerCount > 0 && (
              <span className={cn(
                'absolute -top-1.5 -left-1.5 size-5 flex items-center justify-center text-[10px] font-bold rounded-full',
                isOpen && activeTab === 'engineer'
                  ? 'bg-orange-500 text-white'
                  : 'bg-orange-500 text-white'
              )}>
                {engineerCount}
              </span>
            )}
          </button>
        )}

        {/* Customer Tab */}
        {hasCustomerData && (
          <button
            onClick={() => handleTabClick('customer')}
            className={cn(
              'relative flex items-center justify-center px-2 py-6 border-2 border-r-0 rounded-l-xl shadow-lg transition-all',
              'hover:shadow-xl',
              isOpen && activeTab === 'customer'
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white border-slate-200 hover:border-purple-500 text-slate-600 hover:text-purple-600'
            )}
          >
            <span
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              Customer
            </span>
            {customerCount > 0 && (
              <span className={cn(
                'absolute -top-1.5 -left-1.5 size-5 flex items-center justify-center text-[10px] font-bold rounded-full',
                isOpen && activeTab === 'customer'
                  ? 'bg-purple-500 text-white'
                  : 'bg-purple-500 text-white'
              )}>
                {customerCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Sidebar Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full bg-white border-l-2 shadow-2xl z-40 transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          activeTab === 'engineer' ? 'border-primary' : 'border-purple-500',
          'w-[400px]'
        )}
      >
        {/* Header */}
        <div className={cn(
          'sticky top-0 border-b z-10',
          activeTab === 'engineer' ? 'bg-primary/5 border-primary/20' : 'bg-purple-50 border-purple-200'
        )}>
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {activeTab === 'engineer' ? (
                <MessageSquare className="size-5 text-primary" />
              ) : (
                <User className="size-5 text-purple-600" />
              )}
              <h2 className={cn(
                'font-bold',
                activeTab === 'engineer' ? 'text-primary' : 'text-purple-700'
              )}>
                {activeTab === 'engineer' ? 'Engineer History' : 'Customer History'}
              </h2>
            </div>
            <button
              onClick={onToggle}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            >
              <X className="size-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-65px)] px-4 py-4">
          {/* Engineer Tab Content */}
          {activeTab === 'engineer' && (
            <>
              {!hasEngineerData ? (
                <div className="text-center py-12">
                  <MessageSquare className="size-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No engineer feedback history yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedEngineerFeedbacks.map(({ revision, feedbacks }) => (
                    <div key={revision} className="rounded-xl border border-slate-200 overflow-hidden">
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
                          {feedbacks.length} item{feedbacks.length !== 1 ? 's' : ''}
                        </span>
                      </button>

                      {expandedRevisions.has(revision) && (
                        <div className="px-4 pb-4 space-y-3">
                          {feedbacks.map((feedback) => {
                            const style = getEngineerFeedbackStyle(feedback.feedbackType)
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
            </>
          )}

          {/* Customer Tab Content */}
          {activeTab === 'customer' && (
            <>
              {!hasCustomerData ? (
                <div className="text-center py-12">
                  <User className="size-12 text-purple-200 mx-auto mb-3" />
                  <p className="text-purple-400 text-sm">No customer interaction history yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedCustomerEvents.map(({ revision, events }) => (
                    <div key={revision} className="rounded-xl border border-purple-200 overflow-hidden">
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
                          {events.length} event{events.length !== 1 ? 's' : ''}
                        </span>
                      </button>

                      {expandedRevisions.has(revision) && (
                        <div className="px-4 pb-4 space-y-3">
                          {events.map((event) => {
                            const style = getCustomerEventStyle(event.eventType)
                            const Icon = style.icon
                            const isCustomerAction = event.eventType === 'CUSTOMER_REVISION_REQUESTED' ||
                                                      event.eventType === 'CUSTOMER_APPROVED'

                            return (
                              <div
                                key={event.id}
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
                                    {(event.eventData.customerName || event.eventData.customerEmail) && (
                                      <div className="text-[11px] text-slate-500 mb-1">
                                        {event.eventData.customerName && (
                                          <span className="font-medium">{event.eventData.customerName}</span>
                                        )}
                                        {event.eventData.customerCompany && (
                                          <span> • {event.eventData.customerCompany}</span>
                                        )}
                                      </div>
                                    )}

                                    {/* Notes/Message/Response */}
                                    {(event.eventData.notes || event.eventData.message || event.eventData.response) && (
                                      <p className="text-[12px] text-slate-600 whitespace-pre-wrap break-words bg-white/50 p-2 rounded border border-slate-100">
                                        {event.eventData.notes || event.eventData.message || event.eventData.response}
                                      </p>
                                    )}

                                    {/* Actor info for Admin actions */}
                                    {event.user && !isCustomerAction && (
                                      <p className="text-[11px] text-slate-400 mt-1">
                                        by {event.user.name}
                                      </p>
                                    )}

                                    <p className="text-[10px] text-slate-400 mt-2">
                                      {new Date(event.createdAt).toLocaleDateString('en-GB', {
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
            </>
          )}
        </div>
      </div>

      {/* Overlay when open - z-30 so sidebar content (z-40) is clickable */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30"
          onClick={onToggle}
        />
      )}
    </>
  )
}
