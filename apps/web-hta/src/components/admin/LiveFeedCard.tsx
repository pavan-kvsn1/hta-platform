'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  ChevronUp,
  Eye,
  ExternalLink,
  FileText,
} from 'lucide-react'

interface CertificateEvent {
  id: string
  eventType: string
  createdAt: string
  userName: string | null
  userRole: string
}

interface CertificateWithEvents {
  id: string
  certificateNumber: string
  customerName: string | null
  status: string
  events: CertificateEvent[]
}

interface LiveFeedCardProps {
  certificates: CertificateWithEvents[]
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  REVISION_REQUIRED: 'Revision Required',
  PENDING_CUSTOMER_APPROVAL: 'Pending Customer',
  CUSTOMER_REVISION_REQUIRED: 'Customer Revision',
  PENDING_ADMIN_AUTHORIZATION: 'Pending Auth',
  APPROVED: 'Approved',
  AUTHORIZED: 'Authorized',
  REJECTED: 'Rejected',
}

const EVENT_LABELS: Record<string, string> = {
  CERTIFICATE_CREATED: 'Certificate Created',
  SUBMITTED_FOR_REVIEW: 'Submitted for Review',
  REVIEWER_APPROVED: 'Reviewer Approved',
  REVIEWER_APPROVED_SENT_TO_CUSTOMER: 'Sent to Customer',
  CUSTOMER_APPROVED: 'Customer Approved',
  ADMIN_AUTHORIZED: 'Authorized',
  REVISION_REQUESTED: 'Revision Requested',
  CUSTOMER_REVISION_REQUESTED: 'Customer Revision',
  SECTION_UNLOCK_REQUESTED: 'Unlock Requested',
  SECTION_UNLOCK_APPROVED: 'Unlock Approved',
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
  SECTION_UNLOCK_REQUESTED: 'bg-indigo-500',
  SECTION_UNLOCK_APPROVED: 'bg-green-500',
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

export function LiveFeedCard({ certificates }: LiveFeedCardProps) {
  const [expandedCerts, setExpandedCerts] = useState<Set<string>>(new Set())

  const toggleExpand = (certId: string) => {
    setExpandedCerts((prev) => {
      const next = new Set(prev)
      if (next.has(certId)) {
        next.delete(certId)
      } else {
        next.add(certId)
      }
      return next
    })
  }

  if (certificates.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-sm">No recent activity</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-100">
      {certificates.map((cert) => {
        const isExpanded = expandedCerts.has(cert.id)
        const lastEvent = cert.events[0]
        const displayedEvents = cert.events.slice(0, 3)
        const hasMoreEvents = cert.events.length > 3

        return (
          <div key={cert.id} className="p-4">
            {/* Certificate Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 text-sm">
                    {cert.certificateNumber}
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 rounded">
                    {cert.events.length} events
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {cert.customerName || 'Unknown'} · {STATUS_LABELS[cert.status] || cert.status}
                </p>
                {lastEvent && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Last: {EVENT_LABELS[lastEvent.eventType] || lastEvent.eventType} · {formatRelativeTime(lastEvent.createdAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleExpand(cert.id)}
                  title={isExpanded ? 'Collapse' : 'Expand'}
                  className={`p-2 rounded-lg transition-colors ${
                    isExpanded
                      ? 'text-primary bg-primary/10'
                      : 'text-slate-500 hover:text-primary hover:bg-primary/10'
                  }`}
                >
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>
                <Link
                  href={`/admin/certificates/${cert.id}`}
                  title="View Certificate"
                  className="p-2 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                >
                  <Eye className="w-5 h-5" />
                </Link>
              </div>
            </div>

            {/* Expanded Events List */}
            {isExpanded && (
              <div className="mt-3 ml-2 pl-3 border-l-2 border-slate-200 space-y-2">
                {displayedEvents.map((event) => (
                  <div key={event.id} className="flex items-start gap-2">
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        EVENT_DOT_COLORS[event.eventType] || 'bg-slate-400'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700">
                        {EVENT_LABELS[event.eventType] || event.eventType}
                      </p>
                      <p className="text-xs text-slate-400">
                        {event.userName || event.userRole} · {formatRelativeTime(event.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
                {hasMoreEvents && (
                  <Link
                    href={`/admin/certificates/${cert.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-1"
                  >
                    +{cert.events.length - 3} more events
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
