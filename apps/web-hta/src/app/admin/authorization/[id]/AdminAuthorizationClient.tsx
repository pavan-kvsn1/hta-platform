'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useCallback, useEffect } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
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

function formatTATTime(ms: number): { hours: number; minutes: number } {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  return { hours, minutes }
}

function TATBanner({ sentAt, certificateCreatedAt, targetHours = 12, totalTargetHours = 48 }: { sentAt: string; certificateCreatedAt?: string | null; targetHours?: number; totalTargetHours?: number }) {
  const [elapsed, setElapsed] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [remaining, setRemaining] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [totalElapsed, setTotalElapsed] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [totalRemaining, setTotalRemaining] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [status, setStatus] = useState<'good' | 'warning' | 'critical'>('good')
  const [totalStatus, setTotalStatus] = useState<'good' | 'warning' | 'critical'>('good')

  useEffect(() => {
    const calculateTAT = () => {
      const now = Date.now()

      const sentTime = new Date(sentAt).getTime()
      const elapsedMs = now - sentTime
      const targetMs = targetHours * 60 * 60 * 1000
      const remainingMs = targetMs - elapsedMs

      setElapsed(formatTATTime(elapsedMs))

      if (remainingMs <= 0) {
        setRemaining({ hours: 0, minutes: 0 })
        setStatus('critical')
      } else if (remainingMs <= 3 * 60 * 60 * 1000) {
        setRemaining(formatTATTime(remainingMs))
        setStatus('warning')
      } else {
        setRemaining(formatTATTime(remainingMs))
        setStatus('good')
      }

      if (certificateCreatedAt) {
        const createdTime = new Date(certificateCreatedAt).getTime()
        const totalElapsedMs = now - createdTime
        const totalTargetMs = totalTargetHours * 60 * 60 * 1000
        const totalRemainingMs = totalTargetMs - totalElapsedMs

        setTotalElapsed(formatTATTime(totalElapsedMs))

        if (totalRemainingMs <= 0) {
          setTotalRemaining({ hours: 0, minutes: 0 })
          setTotalStatus('critical')
        } else if (totalRemainingMs <= 8 * 60 * 60 * 1000) {
          setTotalRemaining(formatTATTime(totalRemainingMs))
          setTotalStatus('warning')
        } else {
          setTotalRemaining(formatTATTime(totalRemainingMs))
          setTotalStatus('good')
        }
      }
    }

    calculateTAT()
    const interval = setInterval(calculateTAT, 60000)
    return () => clearInterval(interval)
  }, [sentAt, certificateCreatedAt, targetHours, totalTargetHours])

  const config = {
    good: { bg: 'bg-[#f0fdf4]', border: 'border-[#bbf7d0]', text: 'text-[#166534]', icon: <Clock className="size-3.5 text-[#16a34a]" /> },
    warning: { bg: 'bg-[#fffbeb]', border: 'border-[#fde68a]', text: 'text-[#92400e]', icon: <AlertTriangle className="size-3.5 text-[#d97706]" /> },
    critical: { bg: 'bg-[#fef2f2]', border: 'border-[#fecaca]', text: 'text-[#991b1b]', icon: <AlertTriangle className="size-3.5 text-[#dc2626]" /> },
  }

  const c = config[status]
  const totalColor = totalStatus === 'critical' ? 'text-[#dc2626]' : totalStatus === 'warning' ? 'text-[#d97706]' : 'text-[#64748b]'

  return (
    <div className={cn('px-4 py-2 rounded-xl border flex items-center justify-between text-[12.5px]', c.bg, c.border, c.text)}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {c.icon}
          <span className="font-semibold">
            Phase: {elapsed.hours}h {elapsed.minutes}m
          </span>
        </div>
        <span className="text-[#e2e8f0]">|</span>
        {status === 'critical' ? (
          <span className="font-semibold">{targetHours}h target exceeded</span>
        ) : (
          <span>{remaining.hours}h {remaining.minutes}m of {targetHours}h left</span>
        )}
      </div>
      {certificateCreatedAt && (
        <div className={cn('flex items-center gap-1.5', totalColor)}>
          <span className="text-[#cbd5e1]">|</span>
          <span className="font-medium">
            Total: {totalElapsed.hours}h {totalElapsed.minutes}m
          </span>
          <span className="opacity-60">·</span>
          {totalStatus === 'critical' ? (
            <span className="font-semibold">{totalTargetHours}h exceeded</span>
          ) : (
            <span>{totalRemaining.hours}h {totalRemaining.minutes}m of {totalTargetHours}h left</span>
          )}
        </div>
      )}
    </div>
  )
}

interface AdminAuthorizationClientProps {
  certificate: CertificateData
  formData: CertificateFormData
  signatures: SignatureInfo[]
  feedbacks: Feedback[]
  events: CertificateEvent[]
  headerData: HeaderData
  customerEmail?: string | null
  customerContactName?: string | null
  tatStartedAt?: string | null
  certificateCreatedAt?: string | null
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
  tatStartedAt,
  certificateCreatedAt,
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
    <div className="flex h-full bg-[#f1f5f9] overflow-hidden">
      {/* Left Side - Header + Signatures + Content (Scrollable) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
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

        {/* TAT Banner — visible for non-terminal statuses */}
        {tatStartedAt && (
          <div className="px-3 pt-3">
            <TATBanner sentAt={tatStartedAt} certificateCreatedAt={certificateCreatedAt} targetHours={12} />
          </div>
        )}

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-auto bg-[#f8fafc]">
          {viewMode === 'details' ? (
            <div className="p-3 space-y-6">
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

      {/* Right Panel - Chat & Authorization */}
      <div className="w-[380px] flex-shrink-0 flex flex-col p-2 overflow-y-auto bg-[#f1f5f9]">
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
