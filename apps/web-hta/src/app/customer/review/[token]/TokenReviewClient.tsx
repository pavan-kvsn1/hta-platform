'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TokenReviewContent } from './TokenReviewContent'
import { TokenApprovalActions } from './TokenApprovalActions'
import { CustomerChatContainer } from '@/components/chat/CustomerChatContainer'
import { InlinePDFViewer } from '@/app/(dashboard)/dashboard/reviewer/[id]/InlinePDFViewer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Clock,
  AlertTriangle,
  Eye,
  FileText,
  Building2,
  Calendar,
} from 'lucide-react'
import type {
  CertificateData,
  CertificateSignature,
  CustomerData,
  CustomerHeaderData,
} from '@/types/certificate'

// Re-export types for components that import from this file
export type { CertificateData, CustomerData }
export type Signature = CertificateSignature
export type HeaderData = CustomerHeaderData

interface TokenReviewClientProps {
  token: string
  certificate: CertificateData
  customer: CustomerData
  signatures: Signature[]
  chatThreadId: string | null
  headerData: HeaderData
  expiresAt: string | null
  sentAt: string | null
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatTATTime(ms: number): { hours: number; minutes: number } {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  return { hours, minutes }
}

function TATBanner({ sentAt, targetHours = 48 }: { sentAt: string; targetHours?: number }) {
  const [elapsed, setElapsed] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [remaining, setRemaining] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [status, setStatus] = useState<'good' | 'warning' | 'critical'>('good')

  useEffect(() => {
    const calculateTAT = () => {
      const sentTime = new Date(sentAt).getTime()
      const now = Date.now()
      const elapsedMs = now - sentTime
      const targetMs = targetHours * 60 * 60 * 1000
      const remainingMs = targetMs - elapsedMs

      setElapsed(formatTATTime(elapsedMs))

      if (remainingMs <= 0) {
        setRemaining({ hours: 0, minutes: 0 })
        setStatus('critical')
      } else if (remainingMs <= 6 * 60 * 60 * 1000) { // < 6 hours
        setRemaining(formatTATTime(remainingMs))
        setStatus('warning')
      } else {
        setRemaining(formatTATTime(remainingMs))
        setStatus('good')
      }
    }

    calculateTAT()
    const interval = setInterval(calculateTAT, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [sentAt, targetHours])

  const statusColors = {
    good: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    critical: 'bg-red-50 border-red-200 text-red-800',
  }

  const statusIcons = {
    good: <Clock className="h-4 w-4 text-green-600" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    critical: <AlertTriangle className="h-4 w-4 text-red-600" />,
  }

  return (
    <div className={`px-4 py-2 rounded-lg border ${statusColors[status]} flex items-center justify-between text-sm mb-3`}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {statusIcons[status]}
          <span className="font-medium">
            TAT: {elapsed.hours}h {elapsed.minutes}m elapsed
          </span>
        </div>
        <span className="text-gray-500">|</span>
        <span>Target: {targetHours}h</span>
      </div>
      <div>
        {status === 'critical' ? (
          <span className="font-medium text-red-700">Target exceeded</span>
        ) : (
          <span>
            {remaining.hours}h {remaining.minutes}m remaining
          </span>
        )}
      </div>
    </div>
  )
}

export function TokenReviewClient({
  token,
  certificate,
  customer,
  signatures,
  chatThreadId: _chatThreadId,
  headerData,
  expiresAt,
  sentAt,
}: TokenReviewClientProps) {
  // View mode state: 'details' shows certificate content, 'pdf' shows PDF preview
  const [viewMode, setViewMode] = useState<'details' | 'pdf'>('details')

  // Collapsible panel states
  const [isChatExpanded, setIsChatExpanded] = useState(true)
  const [isActionsExpanded, setIsActionsExpanded] = useState(true)

  // Check if customer can take action
  const canApprove = certificate.status === 'PENDING_CUSTOMER_APPROVAL' || certificate.status === 'CUSTOMER_REVISION_REQUIRED'

  // Check if certificate is completed (read-only)
  const isCompleted = ['APPROVED', 'PENDING_ADMIN_AUTHORIZATION', 'PENDING_ADMIN_APPROVAL', 'AUTHORIZED'].includes(certificate.status)

  return (
    <div className="p-3 h-screen overflow-hidden">
      {/* Master Bounding Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
        {/* TAT Banner - Inside the bounding box */}
        {sentAt && !isCompleted && (
          <div className="p-3 pb-0">
            <TATBanner sentAt={sentAt} />
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex flex-1 p-3 gap-3 min-h-0">
          {/* Left Side - Certificate Content */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Certificate Card */}
            <div className="flex-1 flex flex-col bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
              {/* Header Section */}
              <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-4">
                {/* Header Content */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Link
                      href="/customer/dashboard"
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <ChevronLeft className="size-6" strokeWidth={2} />
                    </Link>
                    <span className="text-slate-300 text-xl">|</span>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                      {headerData.certificateNumber}
                    </h1>
                    <Badge
                      variant="outline"
                      className={cn(
                        'px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                        headerData.statusClassName
                      )}
                    >
                      {headerData.statusLabel}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Expiry info */}
                    {expiresAt && (
                      <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Link expires: {formatDate(expiresAt)}</span>
                      </div>
                    )}
                    {/* View Toggle Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewMode(viewMode === 'details' ? 'pdf' : 'details')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-700"
                    >
                      {viewMode === 'details' ? (
                        <>
                          <Eye className="h-4 w-4" />
                          Preview PDF
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          View Details
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Meta Info Row */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm mt-3">
                  <div className="flex items-center gap-2 text-slate-600">
                    <div className="p-1 rounded bg-slate-100">
                      <Building2 className="size-3 text-slate-500" />
                    </div>
                    <span className="font-medium text-slate-700">{headerData.customerName || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <div className="p-1 rounded bg-slate-100">
                      <Calendar className="size-3 text-slate-500" />
                    </div>
                    <span>Calibrated: {formatDate(headerData.dateOfCalibration)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="text-slate-300">|</span>
                    <span>Revision {headerData.currentRevision}</span>
                  </div>
                </div>
              </div>

              {/* Content Area - Scrollable */}
              <div className="flex-1 overflow-auto">
                {viewMode === 'details' ? (
                  <div className="p-6 space-y-6 bg-section-inner">
                    <TokenReviewContent
                      certificate={certificate}
                      signatures={signatures}
                    />
                  </div>
                ) : (
                  <InlinePDFViewer
                    certificateId={certificate.id}
                    certificateNumber={certificate.certificateNumber}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Fixed to screen, no independent scroll */}
          <div className="w-[380px] flex-shrink-0 flex flex-col gap-3 overflow-hidden">
            {/* ===== CHAT SECTION ===== */}
            <div className={cn(
              'flex flex-col bg-slate-50 rounded-lg border border-slate-200 overflow-hidden',
              isChatExpanded ? 'flex-1 min-h-0' : 'flex-shrink-0'
            )}>
              {/* Chat Header - Collapsible */}
              <button
                onClick={() => setIsChatExpanded(!isChatExpanded)}
                className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors border-b border-slate-200"
              >
                <div className="flex items-center gap-2">
                  {isChatExpanded ? (
                    <ChevronDown className="size-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="size-4 text-slate-400" />
                  )}
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Discussion</span>
                </div>
              </button>

              {/* Chat Content - Only when expanded */}
              {isChatExpanded && (
                <div className="flex-1 flex flex-col min-h-0 bg-white">
                  {/* Reviewer Info Header */}
                  <div className="flex-shrink-0 px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="size-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm flex-shrink-0">
                        HTA
                      </div>
                      {/* Name & Status */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          HTA Calibration Team
                        </p>
                        <p className="text-xs text-slate-500">
                          Certificate Review Discussion
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Chat Messages Area */}
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <CustomerChatContainer
                      token={token}
                      className="h-full"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ===== REVIEW ACTIONS SECTION ===== */}
            <div className="flex flex-col bg-slate-50 rounded-lg border border-slate-200 overflow-hidden flex-shrink-0">
              {/* Actions Header - Collapsible */}
              <button
                onClick={() => setIsActionsExpanded(!isActionsExpanded)}
                className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors border-b border-slate-200"
              >
                <div className="flex items-center gap-2">
                  {isActionsExpanded ? (
                    <ChevronDown className="size-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="size-4 text-slate-400" />
                  )}
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Your Actions</span>
                </div>
              </button>

              {/* Actions Content - Only when expanded */}
              {isActionsExpanded && (
                <div className="bg-white">
                  <TokenApprovalActions
                    token={token}
                    certificate={certificate}
                    customer={customer}
                    signatures={signatures}
                    canApprove={canApprove}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
