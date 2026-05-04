'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useCallback, useEffect } from 'react'
import { AdminCertificateHeader } from './AdminCertificateHeader'
import { AdminCertificateContent } from './AdminCertificateContent'
import { AdminHistorySection } from './AdminHistorySection'
import { AdminChatPanel } from './AdminChatPanel'
import { AdminEditPanel } from './AdminEditPanel'
import { AdminReviewActions } from './AdminReviewActions'
import { InlinePDFViewer } from '@/app/(dashboard)/dashboard/reviewer/[id]/InlinePDFViewer'
import { cn } from '@/lib/utils'
import { MessageSquare, Pencil, Settings2, ChevronDown, Clock } from 'lucide-react'
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

interface TATData {
  phaseStartedAt: string | null
  phaseLabel: string | null
  totalStartedAt: string
  totalEndedAt: string | null
}

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
  tatData: TATData
}

function computeElapsed(startIso: string, endIso: string | null) {
  const start = new Date(startIso).getTime()
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const diffMs = Math.max(0, end - start)
  return {
    hours: Math.floor(diffMs / (1000 * 60 * 60)),
    minutes: Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)),
  }
}

function getStatus(elapsedMs: number, targetHours: number, warningHours: number): 'good' | 'warning' | 'critical' {
  const remaining = targetHours * 3600000 - elapsedMs
  if (remaining <= 0) return 'critical'
  if (remaining <= warningHours * 3600000) return 'warning'
  return 'good'
}

function formatTime(h: number, m: number): string {
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

const STATUS_COLORS = {
  good: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
}

function TATBanner({ tatData }: { tatData: TATData }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (tatData.totalEndedAt) return // terminal — no live updates
    const interval = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(interval)
  }, [tatData.totalEndedAt])

  // Phase TAT (12h target, 3h warning)
  const phaseElapsed = tatData.phaseStartedAt
    ? computeElapsed(tatData.phaseStartedAt, null)
    : null
  const phaseElapsedMs = tatData.phaseStartedAt
    ? Date.now() - new Date(tatData.phaseStartedAt).getTime()
    : 0
  const phaseStatus = tatData.phaseStartedAt
    ? getStatus(phaseElapsedMs, 12, 3)
    : 'good'
  const phaseRemainingMs = 12 * 3600000 - phaseElapsedMs
  const phaseRemaining = {
    hours: Math.floor(Math.abs(phaseRemainingMs) / (1000 * 60 * 60)),
    minutes: Math.floor((Math.abs(phaseRemainingMs) % (1000 * 60 * 60)) / (1000 * 60)),
  }

  // Total TAT (48h target, 12h warning)
  const totalElapsed = computeElapsed(tatData.totalStartedAt, tatData.totalEndedAt)
  const totalElapsedMs = (tatData.totalEndedAt ? new Date(tatData.totalEndedAt).getTime() : Date.now()) - new Date(tatData.totalStartedAt).getTime()
  const totalStatus = getStatus(totalElapsedMs, 48, 12)

  // suppress unused var warning from tick
  void tick

  const phaseColors = STATUS_COLORS[phaseStatus]
  const totalColors = STATUS_COLORS[totalStatus]

  return (
    <div className="flex items-center justify-between bg-white rounded-[14px] border border-[#e2e8f0] px-4 py-3 mb-5">
      {/* Phase label */}
      <div className="flex items-center gap-3">
        <Clock className="size-4 text-[#94a3b8]" />
        <span className="text-[13px] font-medium text-[#64748b]">
          {tatData.phaseLabel || 'Processing'}
        </span>
      </div>

      {/* Pills */}
      <div className="flex items-center gap-3">
        {/* Phase pill */}
        {phaseElapsed && (
          <div className={cn(
            'px-3 py-1.5 rounded-[9px] border text-[12px] font-bold',
            phaseColors.bg, phaseColors.text, phaseColors.border
          )}>
            {phaseStatus === 'critical'
              ? `${formatTime(phaseRemaining.hours, phaseRemaining.minutes)} overdue`
              : `${formatTime(phaseRemaining.hours, phaseRemaining.minutes)} of 12h left`
            }
          </div>
        )}

        {/* Total pill */}
        <div className={cn(
          'px-3 py-1.5 rounded-[9px] border text-[12px] font-bold',
          totalColors.bg, totalColors.text, totalColors.border
        )}>
          Total: {formatTime(totalElapsed.hours, totalElapsed.minutes)} / 48h
        </div>
      </div>
    </div>
  )
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
  tatData,
}: AdminCertificateClientProps) {
  const [viewMode, setViewMode] = useState<'details' | 'pdf'>('details')
  const [isDownloading, setIsDownloading] = useState(false)
  const [chatOpen, setChatOpen] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)

  const isAuthorized = headerData.status === 'AUTHORIZED'

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

        {/* TAT Banner — visible for active statuses only */}
        {tatData.phaseStartedAt && (
          <TATBanner tatData={tatData} />
        )}

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

      {/* Right Panel — accordion: only one panel open at a time */}
      <div className="w-[380px] flex-shrink-0 flex flex-col gap-2.5 p-6 pl-3 overflow-y-auto">
        {/* Chat Panel */}
        <div className={cn(
          'flex flex-col bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden',
          chatOpen ? 'h-[75vh]' : ''
        )}>
          <button
            onClick={() => setChatOpen(prev => !prev)}
            className="flex items-center justify-between px-[18px] py-[13px] bg-[#f8fafc] border-b border-[#f1f5f9] flex-shrink-0 w-full text-left hover:bg-[#f1f5f9] transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="size-[14px] text-[#94a3b8]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Chat</span>
            </div>
            <ChevronDown className={cn(
              'size-3.5 text-[#94a3b8] transition-transform',
              chatOpen && 'rotate-180'
            )} />
          </button>
          {chatOpen && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <AdminChatPanel
                certificateId={certificate.id}
                assignee={assignee}
                customerName={certificate.customerName}
              />
            </div>
          )}
        </div>

        {/* Edit Actions */}
        <div className="flex flex-col bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          <button
            onClick={() => setEditOpen(prev => !prev)}
            className="flex items-center justify-between px-[18px] py-[13px] bg-[#f8fafc] border-b border-[#f1f5f9] flex-shrink-0 w-full text-left hover:bg-[#f1f5f9] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Pencil className="size-[14px] text-[#94a3b8]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Edit Actions</span>
            </div>
            <ChevronDown className={cn(
              'size-3.5 text-[#94a3b8] transition-transform',
              editOpen && 'rotate-180'
            )} />
          </button>
          {editOpen && (
            <div className="overflow-y-auto max-h-[50vh]">
              <AdminEditPanel
                certificate={certificate}
                reviewer={reviewer}
                reviewers={reviewers}
                events={events}
              />
            </div>
          )}
        </div>

        {/* Review Actions */}
        <div className="flex flex-col bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          <button
            onClick={() => setReviewOpen(prev => !prev)}
            className="flex items-center justify-between px-[18px] py-[13px] bg-[#f8fafc] border-b border-[#f1f5f9] flex-shrink-0 w-full text-left hover:bg-[#f1f5f9] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="size-[14px] text-[#94a3b8]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Review Actions</span>
            </div>
            <ChevronDown className={cn(
              'size-3.5 text-[#94a3b8] transition-transform',
              reviewOpen && 'rotate-180'
            )} />
          </button>
          {reviewOpen && (
            <div className="overflow-y-auto max-h-[50vh]">
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
