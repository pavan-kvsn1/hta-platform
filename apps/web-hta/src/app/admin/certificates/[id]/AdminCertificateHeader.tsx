'use client'

import Link from 'next/link'
import { ChevronLeft, User, Building2, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ViewToggleButton } from '@/components/certificate/ViewToggleButton'
import { MetaInfoItem } from '@/components/certificate/MetaInfoItem'
import { TATBadge } from '@/components/certificate/TATBadge'
import type { HeaderData } from './AdminCertificateClient'

interface AdminCertificateHeaderProps {
  headerData: HeaderData
  viewMode: 'details' | 'pdf'
  onViewModeChange: (mode: 'details' | 'pdf') => void
  isAuthorized?: boolean
  onDownload?: () => void
  isDownloading?: boolean
}

export function AdminCertificateHeader({
  headerData,
  viewMode,
  onViewModeChange,
  isAuthorized = false,
  onDownload,
  isDownloading = false,
}: AdminCertificateHeaderProps) {
  return (
    <div className="flex-shrink-0 mb-5">
      {/* Back Link */}
      <Link
        href="/admin/certificates"
        className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-4 transition-colors"
      >
        <ChevronLeft className="size-4" />
        Back to Certificates
      </Link>

      {/* Header Content */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-bold text-[#0f172a] tracking-tight">
            {headerData.certificateNumber}
          </h1>
          <span
            className={cn(
              'px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border',
              headerData.statusClassName
            )}
          >
            {headerData.statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <TATBadge tat={headerData.tat} />
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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] mt-3">
        <MetaInfoItem icon={User} emphasized>{headerData.assigneeName}</MetaInfoItem>
        <MetaInfoItem icon={Building2}>{headerData.customerName}</MetaInfoItem>
        <MetaInfoItem icon={MapPin}>
          {headerData.calibratedAt === 'LAB' ? 'Laboratory' : 'Site'}
        </MetaInfoItem>
        <div className="flex items-center gap-2 text-[#94a3b8]">
          <span className="text-[#cbd5e1]">|</span>
          <span>Revision {headerData.currentRevision}</span>
        </div>
      </div>
    </div>
  )
}
