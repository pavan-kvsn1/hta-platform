'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Building2, Calendar, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ViewToggleButton } from '@/components/certificate/ViewToggleButton'
import { MetaInfoItem } from '@/components/certificate/MetaInfoItem'

interface HeaderData {
  certificateNumber: string
  status: string
  statusLabel: string
  statusClassName: string
  customerName: string
  currentRevision: number
  dateOfCalibration: string | null
}

interface CustomerCertificateHeaderProps {
  headerData: HeaderData
  viewMode: 'details' | 'pdf'
  onViewModeChange: (mode: 'details' | 'pdf') => void
  isAuthorized?: boolean
  onDownload?: () => void
  isDownloading?: boolean
  expiresAt?: string | null
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

export function CustomerCertificateHeader({
  headerData,
  viewMode,
  onViewModeChange,
  isAuthorized = false,
  onDownload,
  isDownloading = false,
  expiresAt,
}: CustomerCertificateHeaderProps) {
  return (
    <div className="flex-shrink-0 border-b border-slate-200 px-6 py-4">
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
          <ViewToggleButton
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            isAuthorized={isAuthorized}
            onDownload={onDownload}
            isDownloading={isDownloading}
          />
        </div>
      </div>

      {/* Meta Info Row */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm mt-3">
        <MetaInfoItem icon={Building2} emphasized>{headerData.customerName || '-'}</MetaInfoItem>
        <MetaInfoItem icon={Calendar}>Calibrated: {formatDate(headerData.dateOfCalibration)}</MetaInfoItem>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="text-slate-300">|</span>
          <span>Revision {headerData.currentRevision}</span>
        </div>
      </div>
    </div>
  )
}
