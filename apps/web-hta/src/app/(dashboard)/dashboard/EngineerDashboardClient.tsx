'use client'

import { apiFetch } from '@/lib/api-client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import Link from 'next/link'
import { CertificateTable } from '@/components/dashboard/CertificateTable'
import { OfflineBanner } from '@/components/desktop/OfflineBanner'
import { PendingSyncSummary } from '@/components/desktop/PendingSyncSummary'
import { SyncToast } from '@/components/desktop/SyncToast'
import { OfflineHistoryFooter } from '@/components/desktop/OfflineHistoryFooter'

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

interface CachedCertificate {
  id: string
  certificateNumber: string
  customerName: string
  status: string
  updatedAt: string
}

export function EngineerDashboardClient() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOffline, setIsOffline] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [offlineCerts, setOfflineCerts] = useState<CachedCertificate[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const loadOfflineData = useCallback(async () => {
    setIsOffline(true)
    const electronAPI = (window as unknown as { electronAPI?: {
      listDrafts?: () => Promise<{ id: string; certificateNumber?: string; customerName?: string; status: string; updatedAt?: string }[]>
      listCachedCertificates?: (role?: string) => Promise<CachedCertificate[]>
      getSyncStatus?: () => Promise<{ lastSyncedAt: string | null; engineerCounts: Stats | null }>
    } }).electronAPI

    if (electronAPI) {
      try {
        // Load cached certificates (creator role)
        if (electronAPI.listCachedCertificates) {
          const cached = await electronAPI.listCachedCertificates('creator')
          setOfflineCerts(cached || [])
        }

        // Load cached stat counts
        let gotCounts = false
        if (electronAPI.getSyncStatus) {
          const syncStatus = await electronAPI.getSyncStatus()
          setLastSyncedAt(syncStatus.lastSyncedAt)
          if (syncStatus.engineerCounts) {
            setStats(syncStatus.engineerCounts)
            gotCounts = true
          }
        }

        // Fallback: compute counts from cached certs + local drafts
        if (!gotCounts) {
          const allCached = await electronAPI.listCachedCertificates?.('creator') || []
          const drafts = electronAPI.listDrafts ? await electronAPI.listDrafts() : []
          setStats({
            draft: allCached.filter(c => c.status === 'DRAFT').length + drafts.filter(d => d.status === 'DRAFT').length,
            pending: allCached.filter(c => c.status === 'PENDING_REVIEW').length,
            approved: allCached.filter(c => c.status === 'APPROVED' || c.status === 'AUTHORIZED').length,
            revision: allCached.filter(c => c.status === 'REVISION_REQUIRED').length,
            conflict: drafts.filter(d => d.status === 'CONFLICT').length,
          })
        }
      } catch { /* ignore */ }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      } else if (response.status === 502 || response.status === 504 || response.status === 503) {
        // Gateway error — VPN down or server unreachable
        await loadOfflineData()
      } else {
        // Any other error — likely offline
        await loadOfflineData()
      }
    } catch {
      // Network error — offline or VPN down
      await loadOfflineData()
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCounts()
  }, [fetchCounts])

  // Listen for sync status changes to update conflict count reactively
  useEffect(() => {
    const electronAPI = (window as unknown as { electronAPI?: {
      onSyncStatus?: (cb: (s: { conflicts?: number }) => void) => (() => void)
      listDrafts?: () => Promise<{ status: string }[]>
    } }).electronAPI
    if (!electronAPI) return

    const cleanup = electronAPI.onSyncStatus?.((syncStatus) => {
      // Update conflict count when sync reports conflicts
      if (syncStatus.conflicts !== undefined) {
        setStats(prev => prev ? { ...prev, conflict: syncStatus.conflicts } : prev)
      }
    })

    return () => { cleanup?.() }
  }, [])

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
        {/* Sync toast (after reconnect) */}
        <SyncToast />

        {/* Offline banner */}
        {isOffline && (
          <OfflineBanner
            message="Showing your active certificates. Go online for full history and to sync changes."
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
          <h1 className="text-[26px] font-extrabold tracking-tight text-[#0f172a]">My Certificates</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and track your calibration certificates</p>
        </div>

        {/* Stat cards */}
        {isOffline && lastSyncedAt && (
          <p className="text-[11px] text-[#94a3b8] mb-2">(as of {new Date(lastSyncedAt).toLocaleString()})</p>
        )}
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

        {/* Certificate Table — online from API, offline from SQLCipher */}
        {isOffline ? (
          <div>
            {/* Toolbar — matches online CertificateTable design */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center mb-[18px]">
              <div className="relative flex-1">
                <input
                  placeholder="Cached certificates (search available online)"
                  disabled
                  className="w-full h-10 rounded-[9px] border border-[#e2e8f0] pl-3.5 pr-3.5 text-sm bg-[#f8fafc] text-[#94a3b8]"
                />
              </div>
              <Link href="/dashboard/certificates/new">
                <button className="h-10 px-[18px] rounded-[9px] bg-primary text-white text-sm font-bold tracking-[-0.01em] inline-flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  New Certificate
                </button>
              </Link>
            </div>

            {offlineCerts.length > 0 ? (
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-[#f8fafc]">
                      <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Certificate No.</th>
                      <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Customer</th>
                      <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Status</th>
                      <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offlineCerts.map((cert) => (
                      <tr
                        key={cert.id}
                        className="border-b border-border hover:bg-[#f8fafc] cursor-pointer transition-colors"
                        onClick={() => router.push(`/dashboard/certificates/${cert.id}/edit`)}
                      >
                        <td className="py-3 px-4">
                          <span className="font-semibold text-primary">{cert.certificateNumber}</span>
                        </td>
                        <td className="py-3 px-4 text-[#64748b]">{cert.customerName || '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            cert.status === 'DRAFT' ? 'bg-slate-100 text-slate-700' :
                            cert.status === 'PENDING_REVIEW' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            cert.status === 'REVISION_REQUIRED' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                            cert.status === 'APPROVED' || cert.status === 'AUTHORIZED' ? 'bg-green-50 text-green-700 border border-green-200' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {cert.status === 'PENDING_REVIEW' ? 'Pending' :
                             cert.status === 'REVISION_REQUIRED' ? 'Revision' :
                             cert.status === 'AUTHORIZED' ? 'Authorized' :
                             cert.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#94a3b8] text-sm">{cert.updatedAt ? new Date(cert.updatedAt).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-3 border-t border-border text-xs text-[#94a3b8]">
                  Showing {offlineCerts.length} cached certificate{offlineCerts.length !== 1 ? 's' : ''}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-border p-8 text-center">
                <p className="text-sm font-medium text-[#64748b]">No cached certificates</p>
                <p className="text-xs text-[#94a3b8] mt-1">
                  Certificates will be cached locally after your first online session.
                </p>
              </div>
            )}
            <OfflineHistoryFooter />
          </div>
        ) : (
          <CertificateTable userRole="ENGINEER" />
        )}
      </div>
    </div>
  )
}
