'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useCallback } from 'react'
import { AdminAuthHeader } from './AdminAuthHeader'
import { AdminAuthContent, CertificateFormData } from './AdminAuthContent'
import { AdminAuthChatPanel } from './AdminAuthChatPanel'
import { AdminAuthorizationPanel } from './AdminAuthorizationPanel'
import { AdminHistorySection } from '@/app/admin/certificates/[id]/AdminHistorySection'
import { SignatureStatusBar, SignatureInfo } from '@/components/certificates'
import { InlinePDFViewer } from '@/app/(dashboard)/dashboard/reviewer/[id]/InlinePDFViewer'
import type {
  AuthorizationCertificateData,
  AuthorizationHeaderData,
  Feedback,
  CertificateEvent,
} from '@/types/certificate'

// Re-export types for components that import from this file
export type { Feedback, CertificateEvent }
type CertificateData = AuthorizationCertificateData
type HeaderData = AuthorizationHeaderData

interface AdminAuthorizationClientProps {
  certificate: CertificateData
  formData: CertificateFormData
  signatures: SignatureInfo[]
  feedbacks: Feedback[]
  events: CertificateEvent[]
  headerData: HeaderData
  customerEmail?: string | null
  customerContactName?: string | null
}

export function AdminAuthorizationClient({
  certificate,
  formData,
  signatures,
  feedbacks,
  events,
  headerData,
  customerEmail,
  customerContactName,
}: AdminAuthorizationClientProps) {
  // View mode state: 'details' shows certificate content, 'pdf' shows PDF preview
  const [viewMode, setViewMode] = useState<'details' | 'pdf'>('details')
  const [isDownloading, setIsDownloading] = useState(false)

  const isAuthorized = certificate.status === 'AUTHORIZED'

  // Handle download PDF
  const handleDownload = useCallback(async () => {
    try {
      setIsDownloading(true)

      // Use the signed PDF download endpoint
      const response = await apiFetch(`/api/certificates/${certificate.id}/download-signed`)
      if (!response.ok) {
        throw new Error('Failed to download PDF')
      }

      const blob = await response.blob()
      const fileName = `${certificate.certificateNumber.replace(/\//g, '-')}.pdf`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (err) {
      console.error('Error downloading PDF:', err)
      alert('Failed to download PDF')
    } finally {
      setIsDownloading(false)
    }
  }, [certificate.id, certificate.certificateNumber])

  return (
    <div className="flex h-full bg-slate-100 overflow-hidden">
      {/* Left Side - Header + Signatures + Content (Scrollable) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Certificate Card - Bounding Box */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header Section - Fixed at top of content area */}
          <AdminAuthHeader
            headerData={headerData}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onDownload={isAuthorized ? handleDownload : undefined}
            isDownloading={isDownloading}
          />

          {/* Signature Status Bar - Fixed below header */}
          <SignatureStatusBar
            signatures={signatures}
            showAdminPending={!isAuthorized}
          />

          {/* Content Area - Scrollable */}
          <div className="flex-1 overflow-auto bg-slate-50/30">
            {viewMode === 'details' ? (
              <div className="p-3 space-y-6 bg-section-inner">
                <AdminAuthContent formData={formData} certificateId={certificate.id} />

                {/* Audit History Section - at the bottom */}
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

      {/* Right Panel - Chat & Authorization */}
      <div className="w-[380px] flex-shrink-0 flex flex-col p-2 overflow-y-auto bg-section-inner">
        {/* Chat Panel */}
        <AdminAuthChatPanel
          certificateId={certificate.id}
          assigneeName={headerData.assigneeName}
          customerName={certificate.customerName}
        />

        {/* Authorization Panel */}
        <AdminAuthorizationPanel
          certificateId={certificate.id}
          isAuthorized={isAuthorized}
          currentRevision={certificate.currentRevision}
          createdByName={certificate.createdBy?.name || null}
          customerName={customerContactName || certificate.customerName}
          customerEmail={customerEmail}
        />
      </div>
    </div>
  )
}
