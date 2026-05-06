'use client'

import { FolderOpen } from 'lucide-react'

export function OfflineHistoryFooter() {
  return (
    <div className="flex items-center gap-2 p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-[14px] mt-5 text-center justify-center">
      <FolderOpen className="size-4 text-[#94a3b8]" />
      <p className="text-[12px] text-[#94a3b8]">Full certificate history available when online</p>
    </div>
  )
}
