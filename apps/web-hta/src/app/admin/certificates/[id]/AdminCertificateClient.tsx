'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useCallback } from 'react'
import { AdminCertificateHeader } from './AdminCertificateHeader'
import { AdminCertificateContent } from './AdminCertificateContent'
import { AdminHistorySection } from './AdminHistorySection'
import { AdminChatPanel } from './AdminChatPanel'
import { AdminEditPanel } from './AdminEditPanel'
import { AdminReviewActions } from './AdminReviewActions'
import { InlinePDFViewer } from '@/app/(dashboard)/dashboard/reviewer/[id]/InlinePDFViewer'
import { cn } from '@/lib/utils'
import { MessageSquare, Pencil, Settings2, X } from 'lucide-react'
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
  chatThreadIds: _chatThreadIds,
  headerData,
  reviewers,
}: AdminCertificateClientProps) {
  const [viewMode, setViewMode] = useState<'details' | 'pdf'>('details')
  const [isDownloading, setIsDownloading] = useState(false)
  const [isChatVisible, setIsChatVisible] = useState(true)

  const isAuthorized = headerData.status === 'AUTHORIZED'

  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    try {
      const response = await apiFetch(`/api/certificates/${certificate.id}/download-signed`)
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
    <div className="flex h-full bg-[#f1f5f9] overflow-hidden">
      {/* Left Side - Header + Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto p-6 pr-3">
        {/* Header */}
        <AdminCertificateHeader
          headerData={headerData}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isAuthorized={isAuthorized}
          onDownload={isAuthorized ? handleDownload : undefined}
          isDownloading={isDownloading}
        />

        {/* Content Area */}
        {viewMode === 'details' ? (
          <div className="space-y-5 mt-5">
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
          <div className="mt-5 flex-1 bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <InlinePDFViewer
              certificateId={certificate.id}
              certificateNumber={certificate.certificateNumber}
            />
          </div>
        )}
      </div>

      {/* Right Panel */}
      <div className="w-[380px] flex-shrink-0 flex flex-col gap-2.5 p-6 pl-3 overflow-y-auto">
        {/* Chat Panel — always expanded when visible, closeable */}
        {isChatVisible ? (
          <div className={cn(
            'flex flex-col bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden',
            'flex-1 min-h-0'
          )}>
            {/* Chat Header */}
            <div className="flex items-center justify-between px-[18px] py-[13px] bg-[#f8fafc] border-b border-[#f1f5f9] flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="size-[14px] text-[#94a3b8]" />
                <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Chat</span>
              </div>
              <button
                onClick={() => setIsChatVisible(false)}
                className="p-1 text-[#94a3b8] hover:text-[#0f172a] hover:bg-[#f1f5f9] rounded-md transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Chat Content */}
            <div className="flex-1 min-h-0">
              <AdminChatPanel
                certificateId={certificate.id}
                assignee={assignee}
                customerName={certificate.customerName}
              />
            </div>
          </div>
        ) : (
          /* Collapsed: small button to reopen */
          <button
            onClick={() => setIsChatVisible(true)}
            className="flex items-center gap-2 px-[18px] py-[13px] bg-white rounded-[14px] border border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors flex-shrink-0"
          >
            <MessageSquare className="size-[14px] text-[#94a3b8]" />
            <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Open Chat</span>
          </button>
        )}

        {/* Edit Actions — always visible */}
        <div className="flex flex-col bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden flex-shrink-0">
          <div className="flex items-center gap-2 px-[18px] py-[13px] bg-[#f8fafc] border-b border-[#f1f5f9]">
            <Pencil className="size-[14px] text-[#94a3b8]" />
            <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Edit Actions</span>
          </div>
          <AdminEditPanel
            certificate={certificate}
            reviewer={reviewer}
            reviewers={reviewers}
            events={events}
          />
        </div>

        {/* Review Actions — always visible */}
        <div className="flex flex-col bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden flex-shrink-0">
          <div className="flex items-center gap-2 px-[18px] py-[13px] bg-[#f8fafc] border-b border-[#f1f5f9]">
            <Settings2 className="size-[14px] text-[#94a3b8]" />
            <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Review Actions</span>
          </div>
          <AdminReviewActions
            certificate={certificate}
            assignee={assignee}
          />
        </div>
      </div>
    </div>
  )
}
