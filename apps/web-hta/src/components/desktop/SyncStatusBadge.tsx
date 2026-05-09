'use client'

import { useState, useEffect } from 'react'
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface SyncStatus {
  online: boolean
  lastSyncedAt: string | null
  pending?: { drafts: number; images: number; auditLogs: number }
  conflicts?: number
}

type BadgeState = 'online' | 'syncing' | 'offline' | 'conflict'

function getBadgeState(status: SyncStatus): BadgeState {
  // Only drafts and images count as user-visible pending sync work
  // (audit logs sync in background and shouldn't affect the badge)
  const hasPending = status.pending &&
    (status.pending.drafts > 0 || status.pending.images > 0)

  if (status.conflicts && status.conflicts > 0) return 'conflict'
  if (!status.online) return 'offline'
  if (hasPending) return 'syncing'
  return 'online'
}

const STATE_CONFIG: Record<BadgeState, {
  dotColor: string
  iconColor: string
  label: string
}> = {
  online:   { dotColor: 'bg-[#16a34a]', iconColor: 'text-[#16a34a]', label: 'Online' },
  syncing:  { dotColor: 'bg-[#eab308] animate-pulse', iconColor: 'text-[#eab308]', label: 'Syncing' },
  offline:  { dotColor: 'bg-[#dc2626]', iconColor: 'text-[#dc2626]', label: 'Offline' },
  conflict: { dotColor: 'bg-[#7c3aed] animate-pulse', iconColor: 'text-[#7c3aed]', label: 'Conflict' },
}

export function SyncStatusBadge({ compact = false }: { compact?: boolean } = {}) {
  const [status, setStatus] = useState<SyncStatus | null>(null)

  const electronAPI = typeof window !== 'undefined'
    ? (window as unknown as { electronAPI?: {
        getSyncStatus?: () => Promise<SyncStatus>
        onSyncStatus?: (cb: (s: SyncStatus) => void) => (() => void)
      } }).electronAPI
    : undefined

  useEffect(() => {
    if (!electronAPI) return

    // Initial fetch
    electronAPI.getSyncStatus?.().then(setStatus).catch(() => {})

    // Listen for push updates from main process
    const removeSyncListener = electronAPI.onSyncStatus?.((s) => setStatus(s))

    // Poll every 30s
    const interval = setInterval(() => {
      electronAPI.getSyncStatus?.().then(setStatus).catch(() => {})
    }, 30_000)

    return () => {
      clearInterval(interval)
      removeSyncListener?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!electronAPI || !status) return null

  const state = getBadgeState(status)
  const config = STATE_CONFIG[state]

  const syncedText = status.lastSyncedAt
    ? `Synced ${formatDistanceToNow(new Date(status.lastSyncedAt), { addSuffix: true })}`
    : 'Not synced yet'

  if (compact) {
    return (
      <div className="flex justify-center py-2" title={`${config.label} — ${syncedText}`}>
        <div className={`size-2.5 rounded-full ${config.dotColor}`} />
      </div>
    )
  }

  const Icon = state === 'conflict' ? AlertTriangle
    : state === 'syncing' ? RefreshCw
    : state === 'offline' ? WifiOff
    : Wifi

  const pending = status.pending
  const hasPending = pending && (pending.drafts > 0 || pending.images > 0 || pending.auditLogs > 0)

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className={`size-3.5 ${config.iconColor} ${state === 'syncing' ? 'animate-spin' : ''}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-[#cbd5e1] truncate">{config.label}</p>
          <p className="text-[10px] text-[#64748b] truncate">{syncedText}</p>
        </div>
      </div>
      {state === 'conflict' && status.conflicts! > 0 && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#7c3aed]">
          <AlertTriangle className="size-3" />
          <span>{status.conflicts} conflict{status.conflicts! > 1 ? 's' : ''} — review needed</span>
        </div>
      )}
      {state === 'syncing' && hasPending && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#94a3b8]">
          <RefreshCw className="size-3 text-[#eab308]" />
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
