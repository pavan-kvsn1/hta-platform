'use client'

import { apiFetch } from '@/lib/api-client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, WifiOff, RefreshCw } from 'lucide-react'
import { CertificateTable } from '@/components/dashboard/CertificateTable'

interface TatInfo {
  overdue: number
  approaching: number
}

interface Stats {
  draft: number
  pending: number
  approved: number
  revision: number
  conflict?: number
  tat?: {
    draft: TatInfo
    pending: TatInfo
    revision: TatInfo
  }
}

export function EngineerDashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOffline, setIsOffline] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchCounts = useCallback(async () => {
    try {
      setIsLoading(true)
      setFetchError(null)
      const response = await apiFetch('/api/certificates/engineer/counts')
      if (response.ok) {
        const data = await response.json()
        // In Electron, fetch local conflict count from IPC
        const electronAPI = (window as unknown as { electronAPI?: { listDrafts: () => Promise<{ status: string }[]> } }).electronAPI
        if (electronAPI?.listDrafts) {
          try {
            const drafts = await electronAPI.listDrafts()
            data.conflict = drafts.filter((d: { status: string }) => d.status === 'CONFLICT').length
          } catch { /* ignore */ }
        }
        setStats(data)
        setIsOffline(false)
      } else if (response.status === 401) {
        setFetchError('Session expired. Please log in again.')
      } else {
        setFetchError('Failed to load data from server.')
      }
    } catch {
      // Network error — likely offline or VPN down
      setIsOffline(true)
      // Try to load local draft count from Electron if available
      const electronAPI = (window as unknown as { electronAPI?: { listDrafts: () => Promise<{ status: string }[]> } }).electronAPI
      if (electronAPI?.listDrafts) {
        try {
          const drafts = await electronAPI.listDrafts()
          setStats({
            draft: drafts.filter((d: { status: string }) => d.status !== 'CONFLICT').length,
            pending: 0,
            approved: 0,
            revision: 0,
            conflict: drafts.filter((d: { status: string }) => d.status === 'CONFLICT').length,
          })
        } catch { /* ignore */ }
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

  const counts = stats || { draft: 0, pending: 0, approved: 0, revision: 0, conflict: 0 }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Offline / Error banner */}
        {isOffline && (
          <div className="flex items-center gap-3 p-3.5 bg-[#fffbeb] border border-[#fde68a] rounded-[14px] mb-5">
            <WifiOff className="size-5 text-[#d97706] shrink-0" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-[#92400e]">Offline Mode</p>
              <p className="text-[12px] text-[#b45309]">
                Cannot reach the server. Showing locally cached data. Your drafts are safe and will sync when reconnected.
              </p>
            </div>
            <button
              onClick={fetchCounts}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-[#92400e] border border-[#fde68a] bg-white hover:bg-[#fffbeb] rounded-[9px] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Retry
            </button>
          </div>
        )}

        {fetchError && !isOffline && (
          <div className="flex items-center gap-3 p-3.5 bg-[#fef2f2] border border-[#fecaca] rounded-[14px] mb-5">
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-[#dc2626]">{fetchError}</p>
            </div>
            <button
              onClick={fetchCounts}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-[#dc2626] border border-[#fecaca] bg-white hover:bg-[#fef2f2] rounded-[9px] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Retry
            </button>
          </div>
        )}

        {/* Page header */}
        <div className="mb-7">
          <h1 className="text-[26px] font-extrabold tracking-tight text-[#0f172a]">My Certificates</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and track your calibration certificates</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-7">
          {[
            { label: 'Drafts', value: counts.draft, borderColor: 'border-l-[#cbd5e1]', countColor: 'text-[#475569]', tatKey: 'draft' as const },
            { label: 'Pending Review', value: counts.pending, borderColor: 'border-l-warning', countColor: 'text-[#b45309]', tatKey: 'pending' as const },
            { label: 'Approved', value: counts.approved, borderColor: 'border-l-success', countColor: 'text-[#15803d]', tatKey: null },
            { label: 'Need Revision', value: counts.revision, borderColor: 'border-l-destructive', countColor: 'text-destructive', tatKey: 'revision' as const },
            { label: 'Sync Conflicts', value: counts.conflict || 0, borderColor: 'border-l-[#7c3aed]', countColor: 'text-[#7c3aed]', tatKey: null },
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
        <CertificateTable userRole="ENGINEER" />
      </div>
    </div>
  )
}
