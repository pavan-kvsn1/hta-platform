import Link from 'next/link'
import { FileText } from 'lucide-react'

interface FeedEvent {
  id: string
  eventType: string
  createdAt: string
  certificateId: string
  certificateNumber: string
  customerName: string | null
  status: string
  ownerName: string
}

interface LiveFeedCardProps {
  events: FeedEvent[]
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Review',
  REVISION_REQUIRED: 'Revision',
  PENDING_CUSTOMER_APPROVAL: 'Customer',
  CUSTOMER_REVISION_REQUIRED: 'Cust. Revis',
  PENDING_ADMIN_AUTHORIZATION: 'Pend Auth',
  APPROVED: 'Approved',
  AUTHORIZED: 'Authorized',
  REJECTED: 'Rejected',
  CUSTOMER_REVIEW_EXPIRED: 'Expired',
}

const EVENT_LABELS: Record<string, string> = {
  CERTIFICATE_CREATED: 'Created',
  SUBMITTED_FOR_REVIEW: 'Submitted for Review',
  REVIEWER_APPROVED: 'Reviewer Approved',
  REVIEWER_APPROVED_SENT_TO_CUSTOMER: 'Sent to Customer',
  CUSTOMER_APPROVED: 'Customer Approved',
  ADMIN_AUTHORIZED: 'Authorized',
  REVISION_REQUESTED: 'Revision Requested',
  CUSTOMER_REVISION_REQUESTED: 'Customer Revision',
  CUSTOMER_REVISION_FORWARDED: 'Cust. Revision Fwd',
  SECTION_UNLOCK_REQUESTED: 'Unlock Requested',
  SECTION_UNLOCK_APPROVED: 'Unlock Approved',
  SUBMITTED_FOR_AUTHORIZATION: 'Sent for Auth',
  CUSTOMER_REVIEW_EXPIRED: 'Review Expired',
}

const EVENT_DOT_COLORS: Record<string, string> = {
  CERTIFICATE_CREATED: 'bg-slate-400',
  SUBMITTED_FOR_REVIEW: 'bg-blue-500',
  REVIEWER_APPROVED: 'bg-green-500',
  REVIEWER_APPROVED_SENT_TO_CUSTOMER: 'bg-green-500',
  CUSTOMER_APPROVED: 'bg-purple-500',
  ADMIN_AUTHORIZED: 'bg-green-600',
  REVISION_REQUESTED: 'bg-orange-500',
  CUSTOMER_REVISION_REQUESTED: 'bg-pink-500',
  CUSTOMER_REVISION_FORWARDED: 'bg-orange-500',
  SECTION_UNLOCK_REQUESTED: 'bg-indigo-500',
  SECTION_UNLOCK_APPROVED: 'bg-green-500',
  SUBMITTED_FOR_AUTHORIZATION: 'bg-indigo-500',
  CUSTOMER_REVIEW_EXPIRED: 'bg-red-500',
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function LiveFeedCard({ events }: LiveFeedCardProps) {
  if (events.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-sm">No recent activity</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-100">
      {events.map((evt) => (
        <Link
          key={evt.id}
          href={`/admin/certificates/${evt.certificateId}`}
          className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors group"
        >
          {/* Color dot */}
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              EVENT_DOT_COLORS[evt.eventType] || 'bg-slate-400'
            }`}
          />

          {/* Cert number */}
          <span className="text-[12px] font-semibold text-slate-900 flex-shrink-0">
            {evt.certificateNumber}
          </span>

          {/* Event name */}
          <span className="text-[13px] font-medium text-slate-700 w-[140px] truncate flex-shrink-0">
            {EVENT_LABELS[evt.eventType] || evt.eventType}
          </span>

          {/* Current status */}
          <span className="text-[11px] text-slate-400 flex-shrink-0">
            {STATUS_LABELS[evt.status] || evt.status}
          </span>

          {/* Customer name */}
          <span className="text-[12px] text-slate-500 flex-1 min-w-0 truncate">
            {evt.customerName || 'Unknown'}
          </span>

          {/* Owner */}
          <span className="text-[11px] text-slate-400 w-[100px] truncate flex-shrink-0 text-right">
            {evt.ownerName}
          </span>

          {/* Time */}
          <span className="text-[11px] text-slate-400 w-[60px] flex-shrink-0 text-right">
            {formatRelativeTime(evt.createdAt)}
          </span>
        </Link>
      ))}
    </div>
  )
}
