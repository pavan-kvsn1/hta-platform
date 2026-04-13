'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
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
    <div className="flex-shrink-0 border-b border-slate-200 px-8 py-6">
      {/* Header Content */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/certificates"
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
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm mt-3">
        <MetaInfoItem icon={User} emphasized>{headerData.assigneeName}</MetaInfoItem>
        <MetaInfoItem icon={Building2}>{headerData.customerName}</MetaInfoItem>
        <MetaInfoItem icon={MapPin}>
          {headerData.calibratedAt === 'LAB' ? 'Laboratory' : 'Site'}
        </MetaInfoItem>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="text-slate-300">|</span>
          <span>Revision {headerData.currentRevision}</span>
        </div>
      </div>
    </div>
  )
}
