'use client'

import Link from 'next/link'
import { ChevronLeft, User, Building2, MapPin, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ViewToggleButton } from '@/components/certificate/ViewToggleButton'
import { MetaInfoItem } from '@/components/certificate/MetaInfoItem'

interface HeaderData {
  certificateNumber: string
  status: string
  statusLabel: string
  statusClassName: string
  assigneeName: string
  customerName: string
  calibratedAt: string | null
  currentRevision: number
  dateOfCalibration: string | null
}

interface AdminAuthHeaderProps {
  headerData: HeaderData
  viewMode: 'details' | 'pdf'
  onViewModeChange: (mode: 'details' | 'pdf') => void
  onDownload?: () => void
  isDownloading?: boolean
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function AdminAuthHeader({
  headerData,
  viewMode,
  onViewModeChange,
  onDownload,
  isDownloading,
}: AdminAuthHeaderProps) {
  const isAuthorized = headerData.status === 'AUTHORIZED'

  return (
    <div className="flex-shrink-0 border-b border-[#e2e8f0] bg-white px-6 py-4">
      {/* Header Content */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/authorization"
            className="text-[#94a3b8] hover:text-[#475569] transition-colors"
          >
            <ChevronLeft className="size-6" strokeWidth={2} />
          </Link>
          <span className="text-[#cbd5e1] text-xl">|</span>
          <h1 className="text-xl font-bold text-[#0f172a] tracking-tight">
            {headerData.certificateNumber}
          </h1>
          <span
            className={cn(
              'inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border',
              headerData.statusClassName
            )}
          >
            {headerData.statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-3">
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
        <MetaInfoItem icon={User} emphasized>{headerData.assigneeName}</MetaInfoItem>
        <MetaInfoItem icon={Building2}>{headerData.customerName || '-'}</MetaInfoItem>
        <MetaInfoItem icon={MapPin}>
          {headerData.calibratedAt === 'LAB' ? 'Laboratory' : 'Site'}
        </MetaInfoItem>
        <MetaInfoItem icon={Calendar}>{formatDate(headerData.dateOfCalibration)}</MetaInfoItem>
        <div className="flex items-center gap-2 text-[#64748b]">
          <span className="text-[#cbd5e1]">|</span>
          <span>Revision {headerData.currentRevision}</span>
        </div>
      </div>
    </div>
  )
}
