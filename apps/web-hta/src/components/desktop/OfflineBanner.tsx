'use client'

import { WifiOff, RefreshCw } from 'lucide-react'

interface OfflineBannerProps {
  message: string
  onRetry?: () => void
  isRetrying?: boolean
  lastSyncedAt?: string | null
}

export function OfflineBanner({ message, onRetry, isRetrying, lastSyncedAt }: OfflineBannerProps) {
  return (
    <div className="flex items-center gap-3 p-3.5 bg-[#fffbeb] border border-[#fde68a] rounded-[14px] mb-5">
      <WifiOff className="size-5 text-[#d97706] shrink-0" />
      <div className="flex-1">
        <p className="text-[13px] font-semibold text-[#92400e]">Offline Mode</p>
        <p className="text-[12px] text-[#b45309]">{message}</p>
        {lastSyncedAt && (
          <p className="text-[11px] text-[#d97706] mt-0.5">
            Last synced: {new Date(lastSyncedAt).toLocaleString()}
          </p>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-[#92400e] border border-[#fde68a] bg-white hover:bg-[#fffbeb] rounded-[9px] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
          Retry
        </button>
      )}
    </div>
  )
}
