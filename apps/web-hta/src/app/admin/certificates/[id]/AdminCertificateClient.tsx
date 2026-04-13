'use client'

import { useState, useCallback } from 'react'
import { AdminCertificateHeader } from './AdminCertificateHeader'
import { AdminCertificateContent } from './AdminCertificateContent'
import { AdminHistorySection } from './AdminHistorySection'
import { AdminChatPanel } from './AdminChatPanel'
import { AdminEditPanel } from './AdminEditPanel'
import { AdminReviewActions } from './AdminReviewActions'
import { InlinePDFViewer } from '@/app/(dashboard)/dashboard/reviewer/[id]/InlinePDFViewer'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type {
  CertificateData,
  Assignee,
  Reviewer,
  Feedback,
  CertificateEvent,
  AdminHeaderData,
} from '@/types/certificate'

// Re-export types for components that import from this file
export type { CertificateData, Assignee, Reviewer, Feedback, CertificateEvent }
export type HeaderData = AdminHeaderData

interface AdminCertificateClientProps {
  certificate: CertificateData
  assignee: Assignee
  reviewer: Reviewer | null
  feedbacks: Feedback[]
  events: CertificateEvent[]
  chatThreadIds: {
    engineer: string | null
    customer: string | null
  }
  headerData: HeaderData
  reviewers: Reviewer[]
}

export function AdminCertificateClient({
  certificate,
  assignee,
  reviewer,
  feedbacks,
  events,
  chatThreadIds,
  headerData,
  reviewers,
}: AdminCertificateClientProps) {
  // View mode state: 'details' shows certificate content, 'pdf' shows PDF preview
  const [viewMode, setViewMode] = useState<'details' | 'pdf'>('details')
  const [isDownloading, setIsDownloading] = useState(false)

  // Collapsible panel states
  const [isChatExpanded, setIsChatExpanded] = useState(true)
  const [isEditExpanded, setIsEditExpanded] = useState(true)
  const [isReviewExpanded, setIsReviewExpanded] = useState(true)

  const isAuthorized = headerData.status === 'AUTHORIZED'

  // Handle download PDF
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
    <div className="flex h-full bg-slate-100 overflow-hidden">
      {/* Left Side - Header + Content (Scrollable) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Certificate Card - Bounding Box */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header Section - Fixed at top of content area */}
          <AdminCertificateHeader
            headerData={headerData}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            isAuthorized={isAuthorized}
            onDownload={isAuthorized ? handleDownload : undefined}
            isDownloading={isDownloading}
          />

          {/* Content Area - Scrollable */}
          <div className="flex-1 overflow-auto bg-slate-50/30">
            {viewMode === 'details' ? (
              <div className="p-3 space-y-6] bg-section-inner">
                <AdminCertificateContent
                  certificate={certificate}
                  assignee={assignee}
                />
                <AdminHistorySection
                  feedbacks={feedbacks}
                  events={events}
                  currentRevision={certificate.currentRevision}
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

      {/* Right Panel - Collapsible Chat, Edit & Review */}
      <div className="w-[380px] flex-shrink-0 flex flex-col p-3 overflow-y-auto bg-section-inner">
        {/* Chat Section */}
        <div className={cn(
          'flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
          isChatExpanded ? 'min-h-[730px] max-h-[1000px]' : 'flex-shrink-0'
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
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Chat</span>
            </div>
            {!isChatExpanded && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Eng</span>
                <span>|</span>
                <span>Cust</span>
              </div>
            )}
          </button>

          {/* Chat Content - Only when expanded */}
          {isChatExpanded && (
            <div className="flex-1 min-h-0 border-t border-slate-100">
              <AdminChatPanel
                certificateId={certificate.id}
                assignee={assignee}
                customerName={certificate.customerName}
              />
            </div>
          )}
        </div>

        {/* Edit Section */}
        <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
          {/* Edit Header - Collapsible */}
          <button
            onClick={() => setIsEditExpanded(!isEditExpanded)}
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {isEditExpanded ? (
                <ChevronDown className="size-4 text-slate-400" />
              ) : (
                <ChevronRight className="size-4 text-slate-400" />
              )}
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Edit Actions</span>
            </div>
          </button>

          {/* Edit Content - Only when expanded */}
          {isEditExpanded && (
            <div className="border-t border-slate-100">
              <AdminEditPanel
                certificate={certificate}
                reviewer={reviewer}
                reviewers={reviewers}
                events={events}
              />
            </div>
          )}
        </div>

        {/* Review Actions Section */}
        <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
          {/* Review Header - Collapsible */}
          <button
            onClick={() => setIsReviewExpanded(!isReviewExpanded)}
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {isReviewExpanded ? (
                <ChevronDown className="size-4 text-slate-400" />
              ) : (
                <ChevronRight className="size-4 text-slate-400" />
              )}
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Review Actions</span>
            </div>
          </button>

          {/* Review Content - Only when expanded */}
          {isReviewExpanded && (
            <div className="border-t border-slate-100">
              <AdminReviewActions
                certificate={certificate}
                assignee={assignee}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
