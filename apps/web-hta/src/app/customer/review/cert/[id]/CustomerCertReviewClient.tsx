'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useCallback, useEffect } from 'react'
import { CustomerCertificateHeader } from './CustomerCertificateHeader'
import { CustomerCertificateContent } from './CustomerCertificateContent'
import { CustomerApprovalActions } from './CustomerApprovalActions'
import { CustomerChatContainer } from '@/components/chat/CustomerChatContainer'
import { InlinePDFViewer } from '@/app/(dashboard)/dashboard/reviewer/[id]/InlinePDFViewer'
import { cn } from '@/lib/utils'
import { MessageSquare, Settings2, Clock, AlertTriangle } from 'lucide-react'
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
      } else if (remainingMs <= 6 * 60 * 60 * 1000) {
        setRemaining(formatTATTime(remainingMs))
        setStatus('warning')
      } else {
        setRemaining(formatTATTime(remainingMs))
        setStatus('good')
      }
    }

    calculateTAT()
    const interval = setInterval(calculateTAT, 60000)
    return () => clearInterval(interval)
  }, [sentAt, targetHours])

  const config = {
    good: { bg: 'bg-[#f0fdf4]', border: 'border-[#bbf7d0]', text: 'text-[#166534]', icon: <Clock className="size-3.5 text-[#16a34a]" /> },
    warning: { bg: 'bg-[#fffbeb]', border: 'border-[#fde68a]', text: 'text-[#92400e]', icon: <AlertTriangle className="size-3.5 text-[#d97706]" /> },
    critical: { bg: 'bg-[#fef2f2]', border: 'border-[#fecaca]', text: 'text-[#991b1b]', icon: <AlertTriangle className="size-3.5 text-[#dc2626]" /> },
  }

  const c = config[status]

  return (
    <div className={cn('mx-2.5 mb-1 px-4 py-2 rounded-xl border flex items-center justify-between text-[12.5px]', c.bg, c.border, c.text)}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {c.icon}
          <span className="font-semibold">
            TAT: {elapsed.hours}h {elapsed.minutes}m elapsed
          </span>
        </div>
        <span className="text-[#e2e8f0]">|</span>
        <span>Target: {targetHours}h</span>
      </div>
      <div>
        {status === 'critical' ? (
          <span className="font-semibold">Target exceeded</span>
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
  chatThreadId: _chatThreadId,
  headerData,
  expiresAt,
  sentAt,
}: CustomerCertReviewClientProps) {
  const [viewMode, setViewMode] = useState<'details' | 'pdf'>('details')
  const [isDownloading, setIsDownloading] = useState(false)

  // Collapsible panel states
  const [isChatExpanded, setIsChatExpanded] = useState(true)
  const [isActionsExpanded, setIsActionsExpanded] = useState(true)

  // Track local status after customer takes action
  const [localStatus, setLocalStatus] = useState<string | null>(null)
  const effectiveStatus = localStatus || certificate.status

  const canApprove = effectiveStatus === 'PENDING_CUSTOMER_APPROVAL'
  const isAuthorized = effectiveStatus === 'AUTHORIZED'
  const isCompleted = ['APPROVED', 'PENDING_ADMIN_AUTHORIZATION', 'PENDING_ADMIN_APPROVAL', 'AUTHORIZED'].includes(effectiveStatus)

  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    try {
      const response = await apiFetch(`/api/certificates/${certificate.id}/pdf-data`)
      if (!response.ok) throw new Error('Failed to fetch certificate data')
      const data = await response.json()
      const { signatures, ...certData } = data

      const { generatePDFWithOptimalSpacing } = await import('@/components/pdf/pdf-two-pass')
      const result = await generatePDFWithOptimalSpacing(certData, signatures)

      const fileName = `${certificate.certificateNumber.replace(/\//g, '-')}.pdf`
      const url = URL.createObjectURL(result.blob)
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
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden">
      {/* Left Side - Header + Content */}
      <div className="flex-1 flex flex-col min-w-0 p-2.5 pr-0 overflow-hidden">
        {/* TAT Banner */}
        {sentAt && !isCompleted && (
          <div className="flex-shrink-0 mb-1.5">
            <TATBanner sentAt={sentAt} />
          </div>
        )}

        {/* Certificate Card */}
        <div className="flex-1 flex flex-col bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          {/* Header */}
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

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-[#f8fafc] p-5">
            {viewMode === 'details' ? (
              <div className="space-y-6">
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

      {/* Right Panel - Chat & Actions */}
      <div className="w-[380px] flex-shrink-0 flex flex-col gap-2.5 p-2.5 pl-0 h-full overflow-hidden">
        {/* ===== CHAT SECTION ===== */}
        <div className={cn(
          'flex flex-col bg-white rounded-[14px] border border-[#f1f5f9] overflow-hidden',
          isChatExpanded ? 'flex-1 min-h-0' : 'flex-shrink-0'
        )}>
          <button
            onClick={() => setIsChatExpanded(!isChatExpanded)}
            className="flex items-center justify-between px-[18px] py-[13px] hover:bg-[#f8fafc] transition-colors flex-shrink-0"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="size-[14px] text-[#94a3b8]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Discussion</span>
            </div>
          </button>

          {isChatExpanded && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* HTA Team Header */}
              <div className="flex-shrink-0 px-[18px] py-[14px] border-b border-[#f8fafc]">
                <div className="flex items-center gap-2.5">
                  <div className="w-[38px] h-[38px] rounded-full bg-[#0f1e2e] text-white flex items-center justify-center font-bold text-[13px] flex-shrink-0">
                    HTA
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-[#0f172a] truncate">
                      HTA Calibration Team
                    </p>
                    <p className="text-[12px] text-[#94a3b8] flex items-center gap-[5px] mt-px">
                      <span>Certificate Review</span>
                      <span className="w-[7px] h-[7px] rounded-full bg-[#22c55e] inline-block flex-shrink-0" />
                      <span className="text-[#22c55e]">Online</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Chat Area */}
              <div className="flex-1 min-h-0 overflow-hidden text-xs">
                <CustomerChatContainer
                  token={`cert:${certificate.id}`}
                  className="h-full border-0 rounded-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* ===== ACTIONS SECTION ===== */}
        <div className="flex flex-col bg-white rounded-[14px] border border-[#f1f5f9] overflow-hidden flex-shrink-0">
          <button
            onClick={() => setIsActionsExpanded(!isActionsExpanded)}
            className="flex items-center justify-between px-[18px] py-[13px] hover:bg-[#f8fafc] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="size-[14px] text-[#94a3b8]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Your Actions</span>
            </div>
          </button>

          {isActionsExpanded && (
            <div className="border-t border-[#f1f5f9]">
              <CustomerApprovalActions
                certificate={certificate}
                customer={customer}
                signatures={signatures}
                canApprove={canApprove}
                onStatusChange={setLocalStatus}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
