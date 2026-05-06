'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2 } from 'lucide-react'

export function SyncToast() {
  const [show, setShow] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)

  const electronAPI = typeof window !== 'undefined'
    ? (window as unknown as { electronAPI?: {
        onSyncStatus?: (cb: (s: { online: boolean }) => void) => void
      } }).electronAPI
    : undefined

  useEffect(() => {
    if (!electronAPI) return

    electronAPI.onSyncStatus?.((status) => {
      if (status.online && wasOffline) {
        // Just came back online and sync completed
        setShow(true)
        setTimeout(() => setShow(false), 5000)
      }
      setWasOffline(!status.online)
    })
  }, [wasOffline]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!show) return null

  return (
    <div className="flex items-center gap-2 p-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[14px] mb-5 animate-in fade-in duration-300">
      <CheckCircle2 className="size-4 text-[#16a34a]" />
      <p className="text-[13px] font-semibold text-[#14532d]">All changes synced</p>
    </div>
  )
}
