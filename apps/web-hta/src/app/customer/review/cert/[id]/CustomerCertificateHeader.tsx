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
    <div className="flex-shrink-0 border-b border-[#e2e8f0] px-5 py-3.5">
      {/* Header Content */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/customer/dashboard"
            className="text-[#94a3b8] hover:text-[#475569] transition-colors flex-shrink-0"
          >
            <ChevronLeft className="size-[18px]" strokeWidth={2} />
          </Link>
          <span className="text-[#e2e8f0] text-lg flex-shrink-0">|</span>
          <h1 className="text-[15px] font-medium text-[#0f172a] tracking-[0.01em] truncate">
            {headerData.certificateNumber}
          </h1>
          <Badge
            variant="outline"
            className={cn(
              'px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] flex-shrink-0',
              headerData.statusClassName
            )}
          >
            {headerData.statusLabel}
          </Badge>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          {expiresAt && (
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-[#94a3b8]">
              <Clock className="size-3" />
              <span>Expires: {formatDate(expiresAt)}</span>
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
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-[#64748b] mt-2">
        <MetaInfoItem icon={Building2} emphasized>{headerData.customerName || '-'}</MetaInfoItem>
        <MetaInfoItem icon={Calendar}>Calibrated: {formatDate(headerData.dateOfCalibration)}</MetaInfoItem>
        <span className="text-[#e2e8f0]">|</span>
        <span>Revision {headerData.currentRevision}</span>
      </div>
    </div>
  )
}
