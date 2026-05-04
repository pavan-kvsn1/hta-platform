'use client'

import { apiFetch } from '@/lib/api-client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { ReviewerCertificateTable } from './ReviewerCertificateTable'

interface TatInfo {
  overdue: number
  approaching: number
}

interface Stats {
  pendingReview: number
  revisionRequested: number
  approved: number
  total: number
  tat?: {
    pendingReview: TatInfo
    revisionRequested: TatInfo
  }
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
          {[
            { label: 'Pending Review', value: counts.pendingReview, borderColor: 'border-l-warning', countColor: 'text-[#b45309]', tatKey: 'pendingReview' as const },
            { label: 'Revision Requested', value: counts.revisionRequested, borderColor: 'border-l-destructive', countColor: 'text-destructive', tatKey: 'revisionRequested' as const },
            { label: 'Approved', value: counts.approved, borderColor: 'border-l-success', countColor: 'text-[#15803d]', tatKey: null },
            { label: 'Total Assigned', value: counts.total, borderColor: 'border-l-[#cbd5e1]', countColor: 'text-[#475569]', tatKey: null },
          ].map((card) => {
            const tat = card.tatKey && counts.tat ? counts.tat[card.tatKey] : null
            const overdue = tat?.overdue || 0
            const approaching = tat?.approaching || 0
            const onTime = card.value - overdue - approaching
            const pO = card.value > 0 ? Math.round((overdue / card.value) * 100) : 0
            const pA = card.value > 0 ? Math.round((approaching / card.value) * 100) : 0
            const pG = card.value > 0 ? 100 - pO - pA : 0

            return (
              <div key={card.label} className={`bg-white border border-border rounded-xl px-5 py-5 border-l-[3px] ${card.borderColor}`}>
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2.5">{card.label}</div>
                <div className={`text-[38px] font-extrabold leading-none tracking-tight ${card.countColor}`}>{card.value}</div>
                {tat && card.value > 0 && (
                  <>
                    <div className="mt-3 h-[6px] rounded-full bg-[#f1f5f9] overflow-hidden">
                      <div className="h-full flex">
                        {overdue > 0 && <div className="bg-[#ef4444] h-full" style={{ width: `${pO}%` }} />}
                        {approaching > 0 && <div className="bg-[#f59e0b] h-full" style={{ width: `${pA}%` }} />}
                        {onTime > 0 && <div className="bg-[#22c55e] h-full" style={{ width: `${pG}%` }} />}
                      </div>
                    </div>
                    {(overdue > 0 || approaching > 0) && (
                      <div className="flex items-center gap-2 mt-1.5">
                        {overdue > 0 && <span className="text-[10px] font-semibold text-[#dc2626]">{overdue} overdue</span>}
                        {approaching > 0 && <span className="text-[10px] font-semibold text-[#d97706]">{approaching} soon</span>}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Certificate Table */}
        <ReviewerCertificateTable />
      </div>
    </div>
  )
}
