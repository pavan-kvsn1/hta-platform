'use client'

import { useState, useCallback, useEffect } from 'react'
import { CustomerCertificateHeader } from './CustomerCertificateHeader'
import { CustomerCertificateContent } from './CustomerCertificateContent'
import { CustomerApprovalActions } from './CustomerApprovalActions'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { InlinePDFViewer } from '@/app/(dashboard)/dashboard/reviewer/[id]/InlinePDFViewer'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Clock, AlertTriangle } from 'lucide-react'
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

interface CustomerCertReviewClientProps {
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

export function CustomerCertReviewClient({
  certificate,
  customer,
  signatures,
  chatThreadId,
  headerData,
  expiresAt,
  sentAt,
}: CustomerCertReviewClientProps) {
  // View mode state: 'details' shows certificate content, 'pdf' shows PDF preview
  const [viewMode, setViewMode] = useState<'details' | 'pdf'>('details')
  const [isDownloading, setIsDownloading] = useState(false)

  // Collapsible panel states
  const [isChatExpanded, setIsChatExpanded] = useState(true)
  const [isActionsExpanded, setIsActionsExpanded] = useState(true)

  // Check if customer can take action
  const canApprove = certificate.status === 'PENDING_CUSTOMER_APPROVAL' || certificate.status === 'CUSTOMER_REVISION_REQUIRED'
  const isAuthorized = certificate.status === 'AUTHORIZED'

  // Check if certificate is completed (read-only)
  const isCompleted = ['APPROVED', 'PENDING_ADMIN_AUTHORIZATION', 'PENDING_ADMIN_APPROVAL', 'AUTHORIZED'].includes(certificate.status)

  // Handle download PDF (only for authorized certificates)
  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    try {
      const response = await fetch(`/api/certificates/${certificate.id}/download-signed`)
      if (!response.ok) {
        throw new Error('Failed to download PDF')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const fileName = `${certificate.certificateNumber.replace(/\//g, '-')}.pdf`
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error downloading PDF:', err)
      alert('Failed to download PDF')
    } finally {
      setIsDownloading(false)
    }
  }, [certificate.id, certificate.certificateNumber])

  return (
    <div className="flex flex-col h-full bg-slate-100 pt-3 overflow-hidden">
      {/* TAT Banner - Only show when not completed and has sentAt */}
      {sentAt && !isCompleted && (
        <div className="flex-shrink-0">
          <TATBanner sentAt={sentAt} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Side - Certificate with scrollable content */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Certificate Card */}
          <div className="flex-1 flex flex-col rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header Section - Fixed */}
            <div className="flex-shrink-0">
              <CustomerCertificateHeader
              headerData={headerData}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              isAuthorized={isAuthorized}
              onDownload={isAuthorized ? handleDownload : undefined}
              isDownloading={isDownloading}
              expiresAt={expiresAt}
            />
          </div>

          {/* Content Area - Scrollable */}
          <div className="flex-1 overflow-y-auto bg-section-inner">
            {viewMode === 'details' ? (
              <div className="p-4 space-y-6">
                <CustomerCertificateContent
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

      {/* Right Panel - Fixed to screen height, no independent scroll */}
      <div className="w-[380px] flex-shrink-0 flex flex-col p-2 gap-3 h-full overflow-hidden bg-section-inner">
        {/* ===== CHAT SECTION ===== */}
        <div className={cn(
          'flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
          isChatExpanded ? 'flex-1 min-h-0' : 'flex-shrink-0'
        )}>
          {/* Chat Header - Collapsible */}
          <button
            onClick={() => setIsChatExpanded(!isChatExpanded)}
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
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
            <div className="flex-1 flex flex-col min-h-0">
              {/* Reviewer Info Header */}
              <div className="flex-shrink-0 px-4 py-3 border-t border-b border-slate-100 bg-slate-50/50">
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
              <div className="flex-1 min-h-0 overflow-hidden text-xs">
                <ChatSidebar
                  isOpen={true}
                  onClose={() => {}}
                  certificateId={certificate.id}
                  threadType="REVIEWER_CUSTOMER"
                  embedded={true}
                />
              </div>
            </div>
          )}
        </div>

        {/* ===== REVIEW ACTIONS SECTION ===== */}
        <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
          {/* Actions Header - Collapsible */}
          <button
            onClick={() => setIsActionsExpanded(!isActionsExpanded)}
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
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
            <div className="border-t border-slate-100">
              <CustomerApprovalActions
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
  )
}
