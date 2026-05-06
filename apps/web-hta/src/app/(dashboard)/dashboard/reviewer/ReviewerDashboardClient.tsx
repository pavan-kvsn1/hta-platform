'use client'

import { apiFetch } from '@/lib/api-client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { ReviewerCertificateTable } from './ReviewerCertificateTable'
import { OfflineBanner } from '@/components/desktop/OfflineBanner'
import { PendingSyncSummary } from '@/components/desktop/PendingSyncSummary'
import { SyncToast } from '@/components/desktop/SyncToast'
import { OfflineHistoryFooter } from '@/components/desktop/OfflineHistoryFooter'

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

interface CachedCertificate {
  id: string
  certificateNumber: string
  customerName: string
  status: string
  updatedAt: string
  reviewerName?: string
}

export function ReviewerDashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOffline, setIsOffline] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [offlineCerts, setOfflineCerts] = useState<CachedCertificate[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const loadOfflineData = useCallback(async () => {
    setIsOffline(true)
    const electronAPI = (window as unknown as { electronAPI?: {
      listCachedCertificates?: (role?: string) => Promise<CachedCertificate[]>
      getSyncStatus?: () => Promise<{ lastSyncedAt: string | null; reviewerCounts: Stats | null }>
    } }).electronAPI

    if (electronAPI) {
      try {
        if (electronAPI.listCachedCertificates) {
          const cached = await electronAPI.listCachedCertificates('reviewer')
          setOfflineCerts(cached || [])
        }
        if (electronAPI.getSyncStatus) {
          const syncStatus = await electronAPI.getSyncStatus()
          setLastSyncedAt(syncStatus.lastSyncedAt)
          if (syncStatus.reviewerCounts) {
            setStats(syncStatus.reviewerCounts)
          }
        }
      } catch { /* ignore */ }
    }
  }, [])

  const fetchCounts = useCallback(async () => {
    try {
      setIsLoading(true)
      setFetchError(null)
      const response = await apiFetch('/api/certificates/reviewer/counts')
      if (response.ok) {
        setStats(await response.json())
        setIsOffline(false)
      } else if (response.status === 401) {
        setFetchError('Session expired. Please log in again.')
      } else {
        await loadOfflineData()
      }
    } catch {
      await loadOfflineData()
    } finally {
      setIsLoading(false)
    }
  }, [loadOfflineData])

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
        {/* Sync toast */}
        <SyncToast />

        {/* Offline banner */}
        {isOffline && (
          <OfflineBanner
            message="Showing your pending reviews. Review actions require an online connection."
            onRetry={fetchCounts}
            isRetrying={isLoading}
            lastSyncedAt={lastSyncedAt}
          />
        )}

        {/* Pending sync summary */}
        <PendingSyncSummary />

        {/* Auth error */}
        {fetchError && !isOffline && (
          <div className="flex items-center gap-3 p-3.5 bg-[#fef2f2] border border-[#fecaca] rounded-[14px] mb-5">
            <p className="text-[13px] font-semibold text-[#dc2626]">{fetchError}</p>
          </div>
        )}

        {/* Page header */}
        <div className="mb-7">
          <h1 className="text-[26px] font-extrabold tracking-tight text-[#0f172a]">Reviews</h1>
          <p className="text-sm text-muted-foreground mt-1">Certificates assigned to you for review</p>
        </div>

        {/* Stat cards */}
        {isOffline && lastSyncedAt && (
          <p className="text-[11px] text-[#94a3b8] mb-2">(as of {new Date(lastSyncedAt).toLocaleString()})</p>
        )}
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

        {/* Certificate Table — online from API, offline from SQLCipher */}
        {isOffline && offlineCerts.length > 0 ? (
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-[14px] border-b border-[#f1f5f9]">
              <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                Pending Reviews (Cached)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Certificate #</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Customer</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Last Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {offlineCerts.map((cert) => (
                    <tr key={cert.id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
                      <td className="py-2.5 px-4 font-medium text-[#0f172a]">{cert.certificateNumber}</td>
                      <td className="py-2.5 px-4 text-[#64748b]">{cert.customerName || '—'}</td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#f1f5f9] text-[#64748b]">
                          {cert.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-[#94a3b8]">{cert.updatedAt ? new Date(cert.updatedAt).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-[#f1f5f9]">
              <p className="text-[11px] text-[#94a3b8]">View-only offline. Approve/reject requires online connection.</p>
            </div>
          </div>
        ) : isOffline ? (
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-8 text-center">
            <p className="text-[13px] font-medium text-[#64748b]">No cached reviews</p>
            <p className="text-[12px] text-[#94a3b8] mt-1">
              Pending reviews will be cached locally after your first online session.
            </p>
          </div>
        ) : (
          <ReviewerCertificateTable />
        )}

        {isOffline && <OfflineHistoryFooter />}
      </div>
    </div>
  )
}
