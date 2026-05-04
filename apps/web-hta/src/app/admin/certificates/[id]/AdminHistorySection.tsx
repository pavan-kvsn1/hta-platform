'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  Send,
  RotateCcw,
  XCircle,
  Shield,
  Plus,
  MessageSquare,
  AlertTriangle,
  PenTool,
  PenLine,
  UserCheck,
  ArrowRightLeft,
  Reply,
  Download,
} from 'lucide-react'
import { format } from 'date-fns'
import type { Feedback, CertificateEvent } from './AdminCertificateClient'

interface AdminHistorySectionProps {
  feedbacks: Feedback[]
  events: CertificateEvent[]
  currentRevision: number
  className?: string
}

// Section labels for display
const SECTION_LABELS: Record<string, string> = {
  'summary': 'Summary',
  'uuc-details': 'UUC Details',
  'master-inst': 'Master Instruments',
  'environment': 'Environmental Conditions',
  'results': 'Calibration Results',
  'remarks': 'Remarks',
  'conclusion': 'Conclusion',
  'general': 'General',
}

// Field labels for field change events
const FIELD_LABELS: Record<string, string> = {
  'certificateNumber': 'Certificate Number',
  'srfNumber': 'SRF Number',
  'srfDate': 'SRF Date',
  'customerName': 'Customer Name',
  'customerAddress': 'Customer Address',
  'customerContactName': 'Customer Contact Name',
  'customerContactEmail': 'Customer Contact Email',
  'calibratedAt': 'Calibrated At',
  'dateOfCalibration': 'Date of Calibration',
  'calibrationDueDate': 'Calibration Due Date',
  'reviewerId': 'Reviewer',
}

// Role labels
const ROLE_LABELS: Record<string, string> = {
  'ENGINEER': 'Engineer',
  'HOD': 'Peer Reviewer',
  'ADMIN': 'Admin',
  'CUSTOMER': 'Customer',
}

// Timeline item types
interface TimelineItem {
  id: string
  type: 'event' | 'feedback'
  timestamp: Date
  data: {
    eventType?: string
    feedbackType?: string
    actorName: string
    actorRole: string
    comment?: string | null
    section?: string | null
    metadata?: Record<string, unknown>
  }
}

// Event configuration
const EVENT_CONFIG: Record<string, {
  label: string
  icon: typeof Send
  bgClass: string
  iconClass: string
  borderClass: string
}> = {
  CERTIFICATE_CREATED: {
    label: 'Certificate Created',
    icon: Plus,
    bgClass: 'bg-blue-100',
    iconClass: 'text-blue-600',
    borderClass: 'border-blue-200',
  },
  SUBMITTED_FOR_REVIEW: {
    label: 'Submitted for Review',
    icon: Send,
    bgClass: 'bg-blue-100',
    iconClass: 'text-blue-600',
    borderClass: 'border-blue-200',
  },
  REVISION_REQUESTED: {
    label: 'Revision Requested',
    icon: RotateCcw,
    bgClass: 'bg-orange-100',
    iconClass: 'text-orange-600',
    borderClass: 'border-orange-200',
  },
  REVISION_SUBMITTED: {
    label: 'Revision Submitted',
    icon: Send,
    bgClass: 'bg-amber-100',
    iconClass: 'text-amber-600',
    borderClass: 'border-amber-200',
  },
  APPROVED: {
    label: 'Approved & Authorized',
    icon: CheckCircle2,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
  },
  REVIEWER_APPROVED_SENT_TO_CUSTOMER: {
    label: 'Reviewer Approved & Sent to Customer',
    icon: CheckCircle2,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
  },
  REVIEWER_APPROVED: {
    label: 'Reviewer Approved',
    icon: CheckCircle2,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
  },
  REJECTED: {
    label: 'Rejected',
    icon: XCircle,
    bgClass: 'bg-red-100',
    iconClass: 'text-red-600',
    borderClass: 'border-red-200',
  },
  SENT_TO_CUSTOMER: {
    label: 'Sent to Customer',
    icon: Send,
    bgClass: 'bg-purple-100',
    iconClass: 'text-purple-600',
    borderClass: 'border-purple-200',
  },
  CUSTOMER_APPROVED: {
    label: 'Customer Approved',
    icon: CheckCircle2,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
  },
  CUSTOMER_REVISION_REQUESTED: {
    label: 'Customer Revision Requested',
    icon: AlertTriangle,
    bgClass: 'bg-pink-100',
    iconClass: 'text-pink-600',
    borderClass: 'border-pink-200',
  },
  CUSTOMER_REVISION_FORWARDED: {
    label: 'Customer Revision Forwarded',
    icon: RotateCcw,
    bgClass: 'bg-orange-100',
    iconClass: 'text-orange-600',
    borderClass: 'border-orange-200',
  },
  ADMIN_EDIT: {
    label: 'Admin Edit',
    icon: Shield,
    bgClass: 'bg-amber-100',
    iconClass: 'text-amber-600',
    borderClass: 'border-amber-200',
  },
  ADMIN_AUTHORIZED: {
    label: 'Admin Authorized',
    icon: Shield,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
  },
  SECTION_UNLOCK_REQUESTED: {
    label: 'Section Unlock Requested',
    icon: RotateCcw,
    bgClass: 'bg-indigo-100',
    iconClass: 'text-indigo-600',
    borderClass: 'border-indigo-200',
  },
  SECTION_UNLOCK_APPROVED: {
    label: 'Section Unlock Approved',
    icon: CheckCircle2,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
  },
  SECTION_UNLOCK_REJECTED: {
    label: 'Section Unlock Rejected',
    icon: XCircle,
    bgClass: 'bg-red-100',
    iconClass: 'text-red-600',
    borderClass: 'border-red-200',
  },
  RESUBMITTED_FOR_REVIEW: {
    label: 'Resubmitted for Review',
    icon: Send,
    bgClass: 'bg-blue-100',
    iconClass: 'text-blue-600',
    borderClass: 'border-blue-200',
  },
  FIELD_CHANGE_REQUESTED: {
    label: 'Field Change Requested',
    icon: PenLine,
    bgClass: 'bg-yellow-100',
    iconClass: 'text-yellow-700',
    borderClass: 'border-yellow-200',
  },
  FIELD_CHANGE_APPROVED: {
    label: 'Field Change Approved',
    icon: CheckCircle2,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
  },
  FIELD_CHANGE_REJECTED: {
    label: 'Field Change Rejected',
    icon: XCircle,
    bgClass: 'bg-red-100',
    iconClass: 'text-red-600',
    borderClass: 'border-red-200',
  },
  ASSIGNEE_SIGNED: {
    label: 'Engineer Signed',
    icon: PenTool,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
  },
  REVIEWER_SIGNED: {
    label: 'Reviewer Signed',
    icon: PenTool,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
  },
  CUSTOMER_SIGNED: {
    label: 'Customer Signed',
    icon: UserCheck,
    bgClass: 'bg-purple-100',
    iconClass: 'text-purple-600',
    borderClass: 'border-purple-200',
  },
  ADMIN_SIGNED: {
    label: 'Admin Signed',
    icon: Shield,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
  },
  REVIEWER_CHANGED: {
    label: 'Reviewer Changed',
    icon: ArrowRightLeft,
    bgClass: 'bg-slate-100',
    iconClass: 'text-slate-600',
    borderClass: 'border-slate-200',
  },
  ADMIN_REPLIED_TO_CUSTOMER: {
    label: 'Admin Replied to Customer',
    icon: Reply,
    bgClass: 'bg-indigo-100',
    iconClass: 'text-indigo-600',
    borderClass: 'border-indigo-200',
  },
  DOWNLOAD_LINK_SENT: {
    label: 'Download Link Sent',
    icon: Download,
    bgClass: 'bg-teal-100',
    iconClass: 'text-teal-600',
    borderClass: 'border-teal-200',
  },
  SUBMITTED_FOR_AUTHORIZATION: {
    label: 'Submitted for Authorization',
    icon: Send,
    bgClass: 'bg-indigo-100',
    iconClass: 'text-indigo-600',
    borderClass: 'border-indigo-200',
  },
}

// Feedback type configuration
const FEEDBACK_CONFIG: Record<string, {
  label: string
  icon: typeof MessageSquare
  bgClass: string
  iconClass: string
  borderClass: string
}> = {
  REVISION_REQUEST: {
    label: 'Revision Requested',
    icon: RotateCcw,
    bgClass: 'bg-orange-100',
    iconClass: 'text-orange-600',
    borderClass: 'border-orange-200',
  },
  REVISION_REQUESTED: {
    label: 'Revision Requested',
    icon: RotateCcw,
    bgClass: 'bg-orange-100',
    iconClass: 'text-orange-600',
    borderClass: 'border-orange-200',
  },
  REVISION_RESPONSE: {
    label: 'Response to Feedback',
    icon: MessageSquare,
    bgClass: 'bg-blue-100',
    iconClass: 'text-blue-600',
    borderClass: 'border-blue-200',
  },
  ASSIGNEE_RESPONSE: {
    label: 'Response to Feedback',
    icon: MessageSquare,
    bgClass: 'bg-blue-100',
    iconClass: 'text-blue-600',
    borderClass: 'border-blue-200',
  },
  CUSTOMER_REVISION_FORWARDED: {
    label: 'Customer Revision Requested',
    icon: AlertTriangle,
    bgClass: 'bg-pink-100',
    iconClass: 'text-pink-600',
    borderClass: 'border-pink-200',
  },
  APPROVED: {
    label: 'Approved',
    icon: CheckCircle2,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
  },
  APPROVAL: {
    label: 'Approved',
    icon: CheckCircle2,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
    borderClass: 'border-green-200',
  },
}

const DEFAULT_CONFIG = {
  label: 'Update',
  icon: MessageSquare,
  bgClass: 'bg-slate-100',
  iconClass: 'text-slate-600',
  borderClass: 'border-slate-200',
}

// Events to include in timeline (exclude low-level FIELDS_UPDATED)
const INCLUDED_EVENTS = [
  'CERTIFICATE_CREATED',
  'SUBMITTED_FOR_REVIEW',
  'RESUBMITTED_FOR_REVIEW',
  'REVISION_REQUESTED',
  'REVISION_SUBMITTED',
  'APPROVED',
  'REVIEWER_APPROVED_SENT_TO_CUSTOMER',
  'REVIEWER_APPROVED',
  'REJECTED',
  'SENT_TO_CUSTOMER',
  'CUSTOMER_APPROVED',
  'CUSTOMER_REVISION_REQUESTED',
  'CUSTOMER_REVISION_FORWARDED',
  'ADMIN_EDIT',
  'ADMIN_AUTHORIZED',
  'SECTION_UNLOCK_REQUESTED',
  'SECTION_UNLOCK_APPROVED',
  'SECTION_UNLOCK_REJECTED',
  'FIELD_CHANGE_REQUESTED',
  'FIELD_CHANGE_APPROVED',
  'FIELD_CHANGE_REJECTED',
  'ASSIGNEE_SIGNED',
  'REVIEWER_SIGNED',
  'CUSTOMER_SIGNED',
  'ADMIN_SIGNED',
  'REVIEWER_CHANGED',
  'ADMIN_REPLIED_TO_CUSTOMER',
  'DOWNLOAD_LINK_SENT',
  'SUBMITTED_FOR_AUTHORIZATION',
]

export function AdminHistorySection({
  feedbacks,
  events,
  currentRevision: _currentRevision,
  className,
}: AdminHistorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Build unified timeline
  const timeline = useMemo(() => {
    const items: TimelineItem[] = []

    // Add events (excluding ones that duplicate feedback)
    for (const event of events) {
      if (!INCLUDED_EVENTS.includes(event.eventType)) continue

      // Skip REVISION_REQUESTED events if we have feedback for it
      // (the feedback contains the actual comment, event is just a marker)
      if (event.eventType === 'REVISION_REQUESTED') {
        const hasFeedback = feedbacks.some(
          f => (f.feedbackType === 'REVISION_REQUEST' || f.feedbackType === 'REVISION_REQUESTED') &&
               Math.abs(new Date(f.createdAt).getTime() - new Date(event.createdAt).getTime()) < 60000
        )
        if (hasFeedback) continue
      }

      // Skip CUSTOMER_REVISION_REQUESTED events if we have forwarded feedback
      if (event.eventType === 'CUSTOMER_REVISION_REQUESTED') {
        const hasFeedback = feedbacks.some(
          f => f.feedbackType === 'CUSTOMER_REVISION_FORWARDED' &&
               Math.abs(new Date(f.createdAt).getTime() - new Date(event.createdAt).getTime()) < 60000
        )
        if (hasFeedback) continue
      }

      // Skip CUSTOMER_REVISION_FORWARDED events if we have feedback for it
      if (event.eventType === 'CUSTOMER_REVISION_FORWARDED') {
        const hasFeedback = feedbacks.some(
          f => f.feedbackType === 'CUSTOMER_REVISION_FORWARDED' &&
               Math.abs(new Date(f.createdAt).getTime() - new Date(event.createdAt).getTime()) < 60000
        )
        if (hasFeedback) continue
      }

      const actorName = event.user?.name || event.customer?.name || event.customer?.email || 'System'
      const actorRole = event.customer ? 'CUSTOMER' : event.userRole

      items.push({
        id: `event-${event.id}`,
        type: 'event',
        timestamp: new Date(event.createdAt),
        data: {
          eventType: event.eventType,
          actorName,
          actorRole,
          metadata: event.eventData ? JSON.parse(event.eventData) : undefined,
        },
      })
    }

    // Add feedbacks
    for (const feedback of feedbacks) {
      items.push({
        id: `feedback-${feedback.id}`,
        type: 'feedback',
        timestamp: new Date(feedback.createdAt),
        data: {
          feedbackType: feedback.feedbackType,
          actorName: feedback.user.name || 'Unknown',
          actorRole: feedback.user.role,
          comment: feedback.comment,
          section: feedback.targetSection,
        },
      })
    }

    // Sort by timestamp descending (most recent first)
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    return items
  }, [feedbacks, events])

  const formatTimestamp = (date: Date) => {
    return format(date, 'dd MMM, h:mm a')
  }

  if (timeline.length === 0) {
    return (
      <div className={cn('bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden', className)}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#f8fafc] transition-colors"
        >
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="size-4 text-[#94a3b8]" /> : <ChevronRight className="size-4 text-[#94a3b8]" />}
            <span className="text-xs font-bold text-[#334155] uppercase tracking-wider">Audit History</span>
          </div>
        </button>
        {isExpanded && (
          <div className="px-4 py-8 text-center border-t border-[#f1f5f9]">
            <Clock className="size-8 mx-auto mb-2 text-[#cbd5e1]" />
            <p className="text-sm font-medium text-[#64748b]">No history yet</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden', className)}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#f8fafc] transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="size-4 text-[#94a3b8]" /> : <ChevronRight className="size-4 text-[#94a3b8]" />}
          <span className="text-xs font-bold text-[#334155] uppercase tracking-wider">Audit History</span>
        </div>
        <span className="text-xs text-[#64748b]">{timeline.length} items</span>
      </button>

      {/* Timeline */}
      {isExpanded && (
        <div className="border-t border-[#f1f5f9]">
          <div className="relative px-4 py-4">
            {/* Vertical line */}
            <div className="absolute left-[27px] top-4 bottom-4 w-px bg-[#e2e8f0]" />

            {/* Timeline items */}
            <div className="space-y-4">
              {timeline.map((item, index) => {
                const config = item.type === 'event'
                  ? EVENT_CONFIG[item.data.eventType || ''] || DEFAULT_CONFIG
                  : FEEDBACK_CONFIG[item.data.feedbackType || ''] || DEFAULT_CONFIG

                const Icon = config.icon
                const isFirst = index === 0

                return (
                  <div key={item.id} className="relative pl-10">
                    {/* Timeline dot */}
                    <div className={cn(
                      'absolute left-0 size-7 rounded-full flex items-center justify-center ring-2 ring-white',
                      config.bgClass
                    )}>
                      <Icon className={cn('size-3.5', config.iconClass)} />
                    </div>

                    {/* Content card */}
                    <div className={cn(
                      'rounded-lg border p-3',
                      config.borderClass,
                      isFirst && 'ring-1 ring-blue-200'
                    )}>
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                              'text-sm font-semibold',
                              config.iconClass.replace('text-', 'text-').replace('-600', '-900')
                            )}>
                              {config.label}
                            </span>
                            {isFirst && (
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Latest
                              </span>
                            )}
                          </div>

                          {/* Actor info */}
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-xs text-slate-700">{item.data.actorName}</span>
                            <span className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded font-medium',
                              item.data.actorRole === 'CUSTOMER' && 'bg-purple-100 text-purple-700',
                              item.data.actorRole === 'HOD' && 'bg-blue-100 text-blue-700',
                              item.data.actorRole === 'ENGINEER' && 'bg-green-100 text-green-700',
                              item.data.actorRole === 'ADMIN' && 'bg-amber-100 text-amber-700',
                              !['CUSTOMER', 'HOD', 'ENGINEER', 'ADMIN'].includes(item.data.actorRole) && 'bg-slate-100 text-slate-700'
                            )}>
                              {ROLE_LABELS[item.data.actorRole] || item.data.actorRole}
                            </span>
                          </div>

                          {/* Section tag */}
                          {item.data.section && (
                            <div className="mt-1.5">
                              <span className="text-[11px] text-slate-500">
                                Section: <span className="font-medium text-slate-700">{SECTION_LABELS[item.data.section] || item.data.section}</span>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Timestamp */}
                        <span className="text-[11px] text-slate-400 flex-shrink-0">
                          {formatTimestamp(item.timestamp)}
                        </span>
                      </div>

                      {/* Comment box */}
                      {item.data.comment && (
                        <div className="mt-2 p-2.5 bg-white/80 rounded border border-slate-100">
                          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {item.data.comment}
                          </p>
                        </div>
                      )}

                      {/* Approval signature metadata */}
                      {(item.data.eventType === 'APPROVED' ||
                        item.data.eventType === 'REVIEWER_APPROVED_SENT_TO_CUSTOMER' ||
                        item.data.eventType === 'REVIEWER_APPROVED') &&
                        item.data.metadata?.signerName ? (
                        <div className="mt-2 p-2.5 bg-green-50/80 rounded border border-green-100">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="size-3.5 text-green-600" />
                            <p className="text-xs text-green-800">
                              <span className="font-medium">Signed by:</span>{' '}
                              {String(item.data.metadata.signerName)}
                              {item.data.metadata.signerEmail ? (
                                <span className="text-green-600 ml-1">
                                  ({String(item.data.metadata.signerEmail)})
                                </span>
                              ) : null}
                            </p>
                          </div>
                          {item.data.metadata.comment ? (
                            <p className="text-xs text-green-700 mt-1.5 pl-5">
                              {String(item.data.metadata.comment)}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Admin edit metadata */}
                      {item.data.eventType === 'ADMIN_EDIT' && item.data.metadata && (
                        <div className="mt-2 p-2.5 bg-white/80 rounded border border-slate-100">
                          <p className="text-xs text-slate-700">
                            <span className="font-medium">Field:</span> {String(item.data.metadata.field || 'Unknown')}
                          </p>
                          {item.data.metadata.from !== undefined && item.data.metadata.to !== undefined && (
                            <p className="text-xs text-slate-600 mt-1">
                              <code className="bg-slate-100 px-1 rounded">{String(item.data.metadata.from || 'empty')}</code>
                              {' → '}
                              <code className="bg-amber-100 px-1 rounded">{String(item.data.metadata.to || 'empty')}</code>
                            </p>
                          )}
                          {typeof item.data.metadata.reason === 'string' && item.data.metadata.reason && (
                            <p className="text-xs text-slate-600 mt-1">
                              <span className="font-medium">Reason:</span> {item.data.metadata.reason}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Section unlock metadata */}
                      {(item.data.eventType === 'SECTION_UNLOCK_REQUESTED' ||
                        item.data.eventType === 'SECTION_UNLOCK_APPROVED' ||
                        item.data.eventType === 'SECTION_UNLOCK_REJECTED') &&
                        item.data.metadata && (
                        <div className={cn(
                          'mt-2 p-2.5 rounded border',
                          item.data.eventType === 'SECTION_UNLOCK_REQUESTED' && 'bg-indigo-50/80 border-indigo-100',
                          item.data.eventType === 'SECTION_UNLOCK_APPROVED' && 'bg-green-50/80 border-green-100',
                          item.data.eventType === 'SECTION_UNLOCK_REJECTED' && 'bg-red-50/80 border-red-100'
                        )}>
                          {Array.isArray(item.data.metadata.sections) && item.data.metadata.sections.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {(item.data.metadata.sections as string[]).map((sectionId: string) => (
                                <span
                                  key={sectionId}
                                  className={cn(
                                    'px-2 py-0.5 rounded text-[10px] font-medium',
                                    item.data.eventType === 'SECTION_UNLOCK_REQUESTED' && 'bg-indigo-100 text-indigo-700',
                                    item.data.eventType === 'SECTION_UNLOCK_APPROVED' && 'bg-green-100 text-green-700',
                                    item.data.eventType === 'SECTION_UNLOCK_REJECTED' && 'bg-red-100 text-red-700'
                                  )}
                                >
                                  {SECTION_LABELS[sectionId] || sectionId}
                                </span>
                              ))}
                            </div>
                          )}
                          {typeof item.data.metadata.reason === 'string' && item.data.metadata.reason && (
                            <p className="text-xs text-slate-600">
                              <span className="font-medium">Reason:</span> {item.data.metadata.reason}
                            </p>
                          )}
                          {typeof item.data.metadata.adminNote === 'string' && item.data.metadata.adminNote && (
                            <p className="text-xs text-slate-600 mt-1">
                              <span className="font-medium">Admin Note:</span> {item.data.metadata.adminNote}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Customer revision feedback — section-by-section detail */}
                      {(item.data.eventType === 'CUSTOMER_REVISION_REQUESTED' ||
                        item.data.eventType === 'CUSTOMER_REVISION_FORWARDED') &&
                        item.data.metadata && (
                        <div className="mt-2 p-2.5 bg-pink-50/80 rounded border border-pink-100">
                          {typeof item.data.metadata.customerName === 'string' && item.data.metadata.customerName && (
                            <p className="text-xs text-pink-800 mb-1.5">
                              <span className="font-medium">From:</span> {item.data.metadata.customerName}
                              {typeof item.data.metadata.customerEmail === 'string' && item.data.metadata.customerEmail && (
                                <span className="text-pink-600 ml-1">({item.data.metadata.customerEmail})</span>
                              )}
                            </p>
                          )}
                          {Array.isArray(item.data.metadata.sectionFeedbacks) && item.data.metadata.sectionFeedbacks.length > 0 && (
                            <div className="space-y-1.5 mb-1.5">
                              {(item.data.metadata.sectionFeedbacks as { section: string; comment: string }[]).map((sf, i) => (
                                <div key={i} className="flex gap-2">
                                  <span className="px-1.5 py-0.5 bg-pink-100 text-pink-700 rounded text-[10px] font-medium flex-shrink-0">
                                    {SECTION_LABELS[sf.section] || sf.section}
                                  </span>
                                  <p className="text-xs text-slate-700">{sf.comment}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {typeof item.data.metadata.generalNotes === 'string' && item.data.metadata.generalNotes && (
                            <p className="text-xs text-slate-700">
                              <span className="font-medium">General Notes:</span> {item.data.metadata.generalNotes}
                            </p>
                          )}
                          {typeof item.data.metadata.notes === 'string' && item.data.metadata.notes && !item.data.metadata.generalNotes && (
                            <p className="text-xs text-slate-700">{item.data.metadata.notes}</p>
                          )}
                        </div>
                      )}

                      {/* Field change request/approval/rejection metadata */}
                      {(item.data.eventType === 'FIELD_CHANGE_REQUESTED' ||
                        item.data.eventType === 'FIELD_CHANGE_APPROVED' ||
                        item.data.eventType === 'FIELD_CHANGE_REJECTED') &&
                        item.data.metadata && (
                        <div className={cn(
                          'mt-2 p-2.5 rounded border',
                          item.data.eventType === 'FIELD_CHANGE_REQUESTED' && 'bg-yellow-50/80 border-yellow-100',
                          item.data.eventType === 'FIELD_CHANGE_APPROVED' && 'bg-green-50/80 border-green-100',
                          item.data.eventType === 'FIELD_CHANGE_REJECTED' && 'bg-red-50/80 border-red-100'
                        )}>
                          {Array.isArray(item.data.metadata.fields) && item.data.metadata.fields.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1.5">
                              {(item.data.metadata.fields as string[]).map((fieldId: string) => (
                                <span
                                  key={fieldId}
                                  className={cn(
                                    'px-2 py-0.5 rounded text-[10px] font-medium',
                                    item.data.eventType === 'FIELD_CHANGE_REQUESTED' && 'bg-yellow-100 text-yellow-800',
                                    item.data.eventType === 'FIELD_CHANGE_APPROVED' && 'bg-green-100 text-green-700',
                                    item.data.eventType === 'FIELD_CHANGE_REJECTED' && 'bg-red-100 text-red-700'
                                  )}
                                >
                                  {FIELD_LABELS[fieldId] || fieldId}
                                </span>
                              ))}
                            </div>
                          )}
                          {typeof item.data.metadata.description === 'string' && item.data.metadata.description && (
                            <p className="text-xs text-slate-600">
                              <span className="font-medium">Description:</span> {item.data.metadata.description}
                            </p>
                          )}
                          {typeof item.data.metadata.adminNote === 'string' && item.data.metadata.adminNote && (
                            <p className="text-xs text-slate-600 mt-1">
                              <span className="font-medium">Admin Note:</span> {item.data.metadata.adminNote}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Reviewer changed metadata */}
                      {item.data.eventType === 'REVIEWER_CHANGED' && item.data.metadata && (
                        <div className="mt-2 p-2.5 bg-slate-50/80 rounded border border-slate-100">
                          <p className="text-xs text-slate-700">
                            <code className="bg-slate-100 px-1 rounded">{String(item.data.metadata.previousReviewerName || 'None')}</code>
                            {' → '}
                            <code className="bg-blue-100 px-1 rounded">{String(item.data.metadata.newReviewerName || 'Unknown')}</code>
                          </p>
                        </div>
                      )}

                      {/* Admin replied to customer metadata */}
                      {item.data.eventType === 'ADMIN_REPLIED_TO_CUSTOMER' && item.data.metadata && (
                        <div className="mt-2 p-2.5 bg-indigo-50/80 rounded border border-indigo-100">
                          <p className="text-xs text-slate-700 whitespace-pre-wrap">
                            {String(item.data.metadata.response || '')}
                          </p>
                        </div>
                      )}

                      {/* Download link sent metadata */}
                      {item.data.eventType === 'DOWNLOAD_LINK_SENT' && item.data.metadata && (
                        <div className="mt-2 p-2.5 bg-teal-50/80 rounded border border-teal-100">
                          <p className="text-xs text-teal-800">
                            <span className="font-medium">Sent to:</span> {String(item.data.metadata.customerName || '')}
                            {typeof item.data.metadata.customerEmail === 'string' && item.data.metadata.customerEmail && (
                              <span className="text-teal-600 ml-1">({item.data.metadata.customerEmail})</span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Resubmission metadata */}
                      {item.data.eventType === 'RESUBMITTED_FOR_REVIEW' && item.data.metadata && (
                        <div className="mt-2 p-2.5 bg-blue-50/80 rounded border border-blue-100">
                          {typeof item.data.metadata.engineerNotes === 'string' && item.data.metadata.engineerNotes && (
                            <p className="text-xs text-slate-700">
                              <span className="font-medium">Engineer Notes:</span> {item.data.metadata.engineerNotes}
                            </p>
                          )}
                          {item.data.metadata.sectionResponseCount != null && Number(item.data.metadata.sectionResponseCount) > 0 && (
                            <p className="text-xs text-slate-500 mt-1">
                              {String(item.data.metadata.sectionResponseCount)} section response(s) included
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
