'use client'

import { apiFetch } from '@/lib/api-client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { ReviewerCertificateTable } from './ReviewerCertificateTable'

interface Stats {
  pendingReview: number
  revisionRequested: number
  approved: number
  total: number
}

export function ReviewerDashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchCounts = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await apiFetch('/api/certificates/reviewer/counts')
      if (response.ok) {
        setStats(await response.json())
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCounts()
  }, [fetchCounts])

  if (isLoading && !stats) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  const counts = stats || { pendingReview: 0, revisionRequested: 0, approved: 0, total: 0 }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Page header */}
        <div className="mb-7">
          <h1 className="text-[26px] font-extrabold tracking-tight text-[#0f172a]">Reviews</h1>
          <p className="text-sm text-muted-foreground mt-1">Certificates assigned to you for review</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
          <div className="bg-white border border-border rounded-xl px-5 py-5 border-l-[3px] border-l-warning">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2.5">Pending Review</div>
            <div className="text-[38px] font-extrabold leading-none tracking-tight text-[#b45309]">{counts.pendingReview}</div>
          </div>
          <div className="bg-white border border-border rounded-xl px-5 py-5 border-l-[3px] border-l-destructive">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2.5">Revision Requested</div>
            <div className="text-[38px] font-extrabold leading-none tracking-tight text-destructive">{counts.revisionRequested}</div>
          </div>
          <div className="bg-white border border-border rounded-xl px-5 py-5 border-l-[3px] border-l-success">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2.5">Approved</div>
            <div className="text-[38px] font-extrabold leading-none tracking-tight text-[#15803d]">{counts.approved}</div>
          </div>
          <div className="bg-white border border-border rounded-xl px-5 py-5 border-l-[3px] border-l-[#cbd5e1]">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2.5">Total Assigned</div>
            <div className="text-[38px] font-extrabold leading-none tracking-tight text-[#475569]">{counts.total}</div>
          </div>
        </div>

        {/* Certificate Table */}
        <ReviewerCertificateTable />
      </div>
    </div>
  )
}
