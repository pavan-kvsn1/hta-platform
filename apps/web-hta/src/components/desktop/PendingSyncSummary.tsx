'use client'

import { useState, useEffect } from 'react'
import { Clock, FileEdit, ImageIcon, ClipboardList } from 'lucide-react'

interface PendingCounts {
  drafts: number
  images: number
  auditLogs: number
}

export function PendingSyncSummary() {
  const [pending, setPending] = useState<PendingCounts | null>(null)
  const [online, setOnline] = useState(true)

  const electronAPI = typeof window !== 'undefined'
    ? (window as unknown as { electronAPI?: {
        getSyncStatus?: () => Promise<{ online: boolean; pending: PendingCounts }>
        onSyncStatus?: (cb: (s: { online: boolean; pending: PendingCounts }) => void) => void
      } }).electronAPI
    : undefined

  useEffect(() => {
    if (!electronAPI) return

    electronAPI.getSyncStatus?.().then((s) => {
      setPending(s.pending)
      setOnline(s.online)
    }).catch(() => {})

    electronAPI.onSyncStatus?.((s) => {
      setPending(s.pending)
      setOnline(s.online)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!electronAPI || !pending) return null

  const total = pending.drafts + pending.images + pending.auditLogs
  if (total === 0) return null

  const items = [
    pending.drafts > 0 && { icon: FileEdit, label: `${pending.drafts} cert${pending.drafts > 1 ? 's' : ''} modified` },
    pending.images > 0 && { icon: ImageIcon, label: `${pending.images} image${pending.images > 1 ? 's' : ''} pending` },
    pending.auditLogs > 0 && { icon: ClipboardList, label: `${pending.auditLogs} audit entr${pending.auditLogs > 1 ? 'ies' : 'y'}` },
  ].filter(Boolean) as { icon: typeof FileEdit; label: string }[]

  return (
    <div className="flex items-center gap-3 p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-[14px] mb-5">
      <Clock className="size-4 text-[#94a3b8] shrink-0" />
      <div className="flex-1 flex items-center gap-4 flex-wrap">
        <span className="text-[12px] font-semibold text-[#64748b]">Waiting to sync:</span>
        {items.map(({ icon: Icon, label }) => (
          <span key={label} className="inline-flex items-center gap-1 text-[12px] text-[#94a3b8]">
            <Icon className="size-3.5" />
            {label}
          </span>
        ))}
      </div>
      <span className="text-[11px] text-[#94a3b8]">
        {online ? 'Syncing soon' : 'When reconnected'}
      </span>
    </div>
  )
}
