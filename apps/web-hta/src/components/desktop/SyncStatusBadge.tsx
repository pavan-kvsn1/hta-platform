'use client'

import { useState, useEffect } from 'react'
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface SyncStatus {
  online: boolean
  lastSyncedAt: string | null
  pending?: { drafts: number; images: number; auditLogs: number }
}

export function SyncStatusBadge({ compact = false }: { compact?: boolean } = {}) {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [syncing, setSyncing] = useState(false)

  const electronAPI = typeof window !== 'undefined'
    ? (window as unknown as { electronAPI?: {
        getSyncStatus?: () => Promise<SyncStatus>
        onSyncStatus?: (cb: (s: SyncStatus) => void) => void
      } }).electronAPI
    : undefined

  useEffect(() => {
    if (!electronAPI) return

    // Initial fetch
    electronAPI.getSyncStatus?.().then(setStatus).catch(() => {})

    // Listen for updates
    electronAPI.onSyncStatus?.((s) => {
      setStatus(s)
      setSyncing(false)
    })

    // Poll every 30s for online/offline changes
    const interval = setInterval(() => {
      electronAPI.getSyncStatus?.().then(setStatus).catch(() => {})
    }, 30_000)

    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!electronAPI || !status) return null

  const pending = status.pending
  const hasPending = pending && (pending.drafts > 0 || pending.images > 0 || pending.auditLogs > 0)

  if (compact) {
    return (
      <div className="flex justify-center py-2" title={
        syncing ? 'Syncing...' :
        status.online ? `Online — synced ${status.lastSyncedAt ? formatDistanceToNow(new Date(status.lastSyncedAt), { addSuffix: true }) : 'never'}` :
        `Offline${status.lastSyncedAt ? ` — last synced ${formatDistanceToNow(new Date(status.lastSyncedAt), { addSuffix: true })}` : ''}`
      }>
        <div className={`size-2.5 rounded-full ${
          syncing ? 'bg-[#3b82f6] animate-pulse' :
          status.online ? 'bg-[#16a34a]' :
          'bg-[#d97706]'
        }`} />
      </div>
    )
  }

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        {syncing ? (
          <RefreshCw className="size-3.5 text-[#3b82f6] animate-spin" />
        ) : status.online ? (
          <Wifi className="size-3.5 text-[#16a34a]" />
        ) : (
          <WifiOff className="size-3.5 text-[#d97706]" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-[#cbd5e1] truncate">
            {syncing ? 'Syncing...' : status.online ? 'Online' : 'Offline'}
          </p>
          <p className="text-[10px] text-[#64748b] truncate">
            {status.lastSyncedAt
              ? `Synced ${formatDistanceToNow(new Date(status.lastSyncedAt), { addSuffix: true })}`
              : 'Not synced yet'}
          </p>
        </div>
      </div>
      {hasPending && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#94a3b8]">
          <AlertCircle className="size-3 text-[#d97706]" />
          <span>
            {[
              pending!.drafts > 0 && `${pending!.drafts} cert${pending!.drafts > 1 ? 's' : ''}`,
              pending!.images > 0 && `${pending!.images} img${pending!.images > 1 ? 's' : ''}`,
            ].filter(Boolean).join(', ')} pending
          </span>
        </div>
      )}
    </div>
  )
}
