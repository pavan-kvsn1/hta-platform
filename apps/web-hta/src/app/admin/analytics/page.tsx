'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, Fragment, useCallback } from 'react'
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Download,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  BarChart3,
  ChevronRight,
  // Unlock,
  // GitPullRequestArrow,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StageMetrics {
  avgHours: number
  medianHours: number
  count: number
  changePercent: number
}

interface SectionCount {
  section: string
  count: number
}

interface RevisionMetrics {
  total: number
  avgPerCert: number
  avgTATHours: number
  firstPassRate: number
  prevTotal: number
  prevAvgPerCert: number
  prevAvgTATHours: number
  prevFirstPassRate: number
  hasPrevData: boolean
  bySections: SectionCount[]
}

interface UnlockMetrics {
  total: number
  avgTATHours: number
  approvedPercent: number
  rejectedPercent: number
  bySections: SectionCount[]
}

interface CertificateDetail {
  id: string
  certificateNumber: string
  customer: string
  engineer: string
  totalTATHours: number
  reviewerRevisions: number
  customerRevisions: number
  unlocks: number
  status: string
  stages: {
    name: string
    hours: number
    status: 'ok' | 'slow' | 'stuck'
  }[]
}

interface AnalyticsData {
  stageTAT: {
    createdToSubmitted: StageMetrics
    submittedToReviewed: StageMetrics
    reviewedToCustomer: StageMetrics
    customerToAuthorized: StageMetrics
    total: StageMetrics
  }
  bottleneck: string | null
  unlockMetrics: UnlockMetrics
  reviewerRevisions: RevisionMetrics
  customerRevisions: RevisionMetrics
  certificates: CertificateDetail[]
  totalCertificates: number
}

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary',
  'uuc-details': 'UUC Details',
  'master-inst': 'Master Instruments',
  environment: 'Environmental Conditions',
  results: 'Calibration Results',
  remarks: 'Remarks',
  conclusion: 'Conclusion',
  general: 'General',
}

function formatHours(hours: number): string {
  if (hours === 0) return '0h'
  if (hours < 1) {
    const minutes = Math.round(hours * 60)
    return `${minutes}m`
  }
  return `${Math.round(hours * 10) / 10}h`
}

function getPeriodLabel(days: string): string {
  switch (days) {
    case '7': return 'vs prev 7d'
    case '30': return 'vs prev 30d'
    case '90': return 'vs prev 90d'
    case '365': return 'vs prev year'
    default: return `vs prev ${days}d`
  }
}

function calcChangePercent(current: number, prev: number): number {
  if (prev === 0) return current > 0 ? 100 : 0
  return Math.round(((current - prev) / prev) * 100)
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function TrendBadge({ percent, inverted = false, noPrevData = false }: { percent: number; inverted?: boolean; noPrevData?: boolean }) {
  if (noPrevData) return <span className="text-[11px] text-[#94a3b8] italic">No prev data</span>
  if (percent === 0) return <span className="text-[11px] text-[#94a3b8]">No change</span>

  const isPositive = percent > 0
  const isGood = inverted ? isPositive : !isPositive

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md',
        isGood ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#fef2f2] text-[#dc2626]'
      )}
    >
      {isPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {Math.abs(percent)}%
    </span>
  )
}

function ChangeBadge({ current, prev, inverted = false }: { current: number; prev: number; inverted?: boolean }) {
  const percent = calcChangePercent(current, prev)
  if (percent === 0) return null

  const isPositive = percent > 0
  const isGood = inverted ? isPositive : !isPositive

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md',
        isGood ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#fef2f2] text-[#dc2626]'
      )}
    >
      {isPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {Math.abs(percent)}%
    </span>
  )
}

function SectionBar({ section, count, max }: { section: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-24 text-[12px] text-[#64748b] truncate">
        {SECTION_LABELS[section] || section}
      </div>
      <div className="flex-1 h-[18px] bg-[#f1f5f9] rounded-full overflow-hidden">
        <div className="h-full bg-[#7c3aed] rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-7 text-right text-[12px] font-semibold text-[#0f172a]">{count}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [timePeriod, setTimePeriod] = useState('30')
  const [customer, setCustomer] = useState('all')
  const [engineer, setEngineer] = useState('all')

  const [searchQuery, setSearchQuery] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([])

  const fetchFilterOptions = async () => {
    try {
      const [customersRes, engineersRes] = await Promise.all([
        apiFetch('/api/admin/customers?limit=100'),
        apiFetch('/api/admin/users?role=ENGINEER&limit=100'),
      ])
      if (customersRes.ok) {
        const d = await customersRes.json()
        setCustomers(d.customers || [])
      }
      if (engineersRes.ok) {
        const d = await engineersRes.json()
        setEngineers(d.users || [])
      }
    } catch { /* silent */ }
  }

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        days: timePeriod,
        ...(customer !== 'all' && { customerId: customer }),
        ...(engineer !== 'all' && { engineerId: engineer }),
      })
      const response = await apiFetch(`/api/admin/analytics?${params}`)
      if (!response.ok) throw new Error('Failed to fetch analytics')
      setData(await response.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [timePeriod, customer, engineer])

  useEffect(() => {
    fetchAnalytics()
    fetchFilterOptions()
  }, [fetchAnalytics])

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const filteredCertificates =
    data?.certificates.filter(
      (cert) =>
        cert.certificateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cert.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cert.engineer.toLowerCase().includes(searchQuery.toLowerCase())
    ) || []

  const paginatedCertificates = filteredCertificates.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )
  const totalPages = Math.ceil(filteredCertificates.length / pageSize)

  /* ---- Loading state ---- */
  if (loading && !data) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  /* ---- Stage config ---- */
  const stages = data
    ? [
        { key: 'createdToSubmitted' as const, label: 'Drafting', sub: 'Created → Submitted', metrics: data.stageTAT.createdToSubmitted, isBottleneck: data.bottleneck === 'drafting' },
        { key: 'submittedToReviewed' as const, label: 'Review', sub: 'Submitted → Reviewed', metrics: data.stageTAT.submittedToReviewed, isBottleneck: data.bottleneck === 'review' },
        { key: 'reviewedToCustomer' as const, label: 'Customer', sub: 'Reviewed → Customer', metrics: data.stageTAT.reviewedToCustomer, isBottleneck: data.bottleneck === 'customer' },
        { key: 'customerToAuthorized' as const, label: 'Authorization', sub: 'Customer → Authorized', metrics: data.stageTAT.customerToAuthorized, isBottleneck: data.bottleneck === 'authorization' },
      ]
    : []

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* ── Header ── */}
        <div className="mb-6">
          <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
            <BarChart3 className="size-[22px] text-[#94a3b8]" />
            Performance Analytics
          </h1>
          <p className="text-[13px] text-[#94a3b8] mt-1">Certificate workflow metrics</p>
        </div>

        {/* ── Filters ── */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-4 mb-7">
          <div className="flex flex-wrap items-end gap-5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Timeframe</label>
              <select
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value)}
                className="block px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="365">Last year</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Customer</label>
              <select
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                className="block px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              >
                <option value="all">All Customers</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Engineer</label>
              <select
                value={engineer}
                onChange={(e) => setEngineer(e.target.value)}
                className="block px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              >
                <option value="all">All Engineers</option>
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            {loading && <Loader2 className="size-4 animate-spin text-[#94a3b8] mb-2" />}
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-2.5 p-4 bg-[#fef2f2] border border-[#fecaca] rounded-[14px] mb-7">
            <AlertTriangle className="size-4 text-[#dc2626] shrink-0" />
            <p className="text-[13px] text-[#dc2626]">{error}</p>
          </div>
        )}

        {data && (
          <div className="space-y-7">
            {/* ================================================================ */}
            {/*  STAGE TURNAROUND TIME                                           */}
            {/* ================================================================ */}
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-3">
                Stage Turnaround Time
              </p>
              <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-5">
                {/* Pipeline tiles */}
                <div className="grid grid-cols-4 gap-3">
                  {stages.map((stage, idx) => (
                    <div key={stage.key} className="flex items-center gap-2">
                      <div
                        className={cn(
                          'flex-1 rounded-xl p-4 border',
                          stage.isBottleneck
                            ? 'bg-[#fffbeb] border-[#fde68a]'
                            : 'bg-[#f8fafc] border-[#e2e8f0]'
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-3">
                          <p className="text-[13px] font-semibold text-[#0f172a]">{stage.label}</p>
                          {stage.isBottleneck && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#fef3c7] text-[#b45309] rounded-md">
                              Bottleneck
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#94a3b8] mb-1">{stage.sub}</p>
                        <div className="space-y-1.5 mt-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[#94a3b8]">Avg</span>
                            <span className="text-[15px] font-bold text-[#0f172a]">{formatHours(stage.metrics.avgHours)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[#94a3b8]">Median</span>
                            <span className="text-[13px] font-medium text-[#64748b]">{formatHours(stage.metrics.medianHours)}</span>
                          </div>
                          <div className="flex justify-end pt-1">
                            <TrendBadge percent={stage.metrics.changePercent} />
                          </div>
                        </div>
                      </div>
                      {idx < stages.length - 1 && (
                        <ChevronRight className="size-4 text-[#cbd5e1] shrink-0" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Total row */}
                <div className="mt-4 pt-4 border-t border-[#f1f5f9] flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-[#0f172a]">Total: Created → Authorized</p>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-[11px] text-[#94a3b8] mr-2">Avg</span>
                      <span className="text-[15px] font-bold text-[#0f172a]">{formatHours(data.stageTAT.total.avgHours)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-[#94a3b8] mr-2">Median</span>
                      <span className="text-[13px] font-medium text-[#64748b]">{formatHours(data.stageTAT.total.medianHours)}</span>
                    </div>
                    <TrendBadge percent={data.stageTAT.total.changePercent} />
                  </div>
                </div>
              </div>
            </div>

            {/* ================================================================ */}
            {/*  SECTION UNLOCKS  +  REVISIONS OVERVIEW (2-col)                  */}
            {/* ================================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* -- Section Unlocks -- */}
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-3">
                  Section Unlocks
                </p>
                <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-5 h-[calc(100%-30px)]">
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="rounded-xl bg-[#eff6ff] p-3.5 text-center">
                      <p className="text-[22px] font-bold text-[#0f172a]">{data.unlockMetrics.total}</p>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5">Total Requests</p>
                    </div>
                    <div className="rounded-xl bg-[#f0fdf4] p-3.5 text-center">
                      <p className="text-[22px] font-bold text-[#0f172a]">{formatHours(data.unlockMetrics.avgTATHours)}</p>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5">Avg TAT to Resolve</p>
                    </div>
                    <div className="rounded-xl bg-[#f0fdf4] p-3.5 text-center">
                      <p className="text-[22px] font-bold text-[#16a34a]">{data.unlockMetrics.approvedPercent}%</p>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5">Approved</p>
                    </div>
                    <div className="rounded-xl bg-[#fef2f2] p-3.5 text-center">
                      <p className="text-[22px] font-bold text-[#dc2626]">{data.unlockMetrics.rejectedPercent}%</p>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5">Rejected</p>
                    </div>
                  </div>

                  <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2.5">By Section</p>
                  {data.unlockMetrics.bySections.length > 0 ? (
                    <div className="space-y-2">
                      {data.unlockMetrics.bySections.slice(0, 5).map((item) => {
                        const maxCount = Math.max(...data.unlockMetrics.bySections.map((s) => s.count))
                        return <SectionBar key={item.section} section={item.section} count={item.count} max={maxCount} />
                      })}
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-[#94a3b8] text-center py-4">No unlock requests in this period</p>
                  )}
                </div>
              </div>

              {/* -- Revisions Overview -- */}
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-3">
                  Revisions Overview
                </p>
                <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-5 h-[calc(100%-30px)]">
                  {/* Total */}
                  <div className="flex items-center gap-3 mb-5">
                    <p className="text-[28px] font-bold text-[#0f172a]">
                      {data.reviewerRevisions.total + data.customerRevisions.total}
                    </p>
                    <p className="text-[13px] text-[#94a3b8]">total revisions</p>
                  </div>

                  {/* Split bar */}
                  <div className="mb-5">
                    <div className="h-3 rounded-full overflow-hidden flex bg-[#f1f5f9]">
                      <div
                        className="bg-[#3b82f6] rounded-l-full"
                        style={{
                          width: `${(data.reviewerRevisions.total / (data.reviewerRevisions.total + data.customerRevisions.total || 1)) * 100}%`,
                        }}
                      />
                      <div className="bg-[#7c3aed] flex-1 rounded-r-full" />
                    </div>
                    <div className="flex justify-between mt-2">
                      <div className="flex items-center gap-1.5">
                        <div className="size-2.5 rounded-full bg-[#3b82f6]" />
                        <span className="text-[12px] text-[#64748b]">Reviewer</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="size-2.5 rounded-full bg-[#7c3aed]" />
                        <span className="text-[12px] text-[#64748b]">Customer</span>
                      </div>
                    </div>
                  </div>

                  {/* Reviewer summary row */}
                  <div className="flex items-center justify-between py-3.5 border-t border-[#f1f5f9]">
                    <div className="flex items-center gap-2">
                      <div className="size-2 rounded-full bg-[#3b82f6]" />
                      <span className="text-[13px] font-semibold text-[#0f172a]">Reviewer</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[15px] font-bold text-[#0f172a]">{data.reviewerRevisions.total}</span>
                      {data.reviewerRevisions.hasPrevData && (
                        <ChangeBadge current={data.reviewerRevisions.total} prev={data.reviewerRevisions.prevTotal} />
                      )}
                      <span className="text-[12px] text-[#94a3b8]">FPR</span>
                      <span className="text-[13px] font-semibold text-[#0f172a]">{data.reviewerRevisions.firstPassRate}%</span>
                      {data.reviewerRevisions.hasPrevData && (
                        <ChangeBadge current={data.reviewerRevisions.firstPassRate} prev={data.reviewerRevisions.prevFirstPassRate} inverted />
                      )}
                    </div>
                  </div>

                  {/* Customer summary row */}
                  <div className="flex items-center justify-between py-3.5 border-t border-[#f1f5f9]">
                    <div className="flex items-center gap-2">
                      <div className="size-2 rounded-full bg-[#7c3aed]" />
                      <span className="text-[13px] font-semibold text-[#0f172a]">Customer</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[15px] font-bold text-[#0f172a]">{data.customerRevisions.total}</span>
                      {data.customerRevisions.hasPrevData && (
                        <ChangeBadge current={data.customerRevisions.total} prev={data.customerRevisions.prevTotal} />
                      )}
                      <span className="text-[12px] text-[#94a3b8]">FPR</span>
                      <span className="text-[13px] font-semibold text-[#0f172a]">{data.customerRevisions.firstPassRate}%</span>
                      {data.customerRevisions.hasPrevData && (
                        <ChangeBadge current={data.customerRevisions.firstPassRate} prev={data.customerRevisions.prevFirstPassRate} inverted />
                      )}
                    </div>
                  </div>

                  {/* Footnote */}
                  <p className="text-[10px] text-[#94a3b8] pt-3 border-t border-[#f1f5f9] mt-1">
                    FPR (First-Pass Rate) — percentage of certificates approved without any revision requests.
                  </p>
                </div>
              </div>
            </div>

            {/* ================================================================ */}
            {/*  REVISION DETAIL                                                 */}
            {/* ================================================================ */}
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-3">
                Revision Detail
              </p>
              <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-5 space-y-6">
                {/* ---- Reviewer ---- */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="size-2 rounded-full bg-[#3b82f6]" />
                    <h3 className="text-[14px] font-semibold text-[#0f172a]">Reviewer Revisions</h3>
                  </div>

                  <div className="flex gap-5">
                    {/* Stats */}
                    <div className="flex-1">
                      <div className="grid grid-cols-4 gap-3">
                        <div className="rounded-xl bg-[#eff6ff] p-3 text-center">
                          <p className="text-[18px] font-bold text-[#0f172a]">{data.reviewerRevisions.total}</p>
                          <p className="text-[11px] text-[#94a3b8] mt-0.5">Total</p>
                        </div>
                        <div className="rounded-xl bg-[#eff6ff] p-3 text-center">
                          <p className="text-[18px] font-bold text-[#0f172a]">{data.reviewerRevisions.avgPerCert}</p>
                          <p className="text-[11px] text-[#94a3b8] mt-0.5">Avg / Cert</p>
                        </div>
                        <div className="rounded-xl bg-[#eff6ff] p-3 text-center">
                          <p className="text-[18px] font-bold text-[#0f172a]">{formatHours(data.reviewerRevisions.avgTATHours)}</p>
                          <p className="text-[11px] text-[#94a3b8] mt-0.5">Avg TAT</p>
                        </div>
                        <div className="rounded-xl bg-[#eff6ff] p-3 text-center">
                          <p className="text-[18px] font-bold text-[#0f172a]">{data.reviewerRevisions.firstPassRate}%</p>
                          <p className="text-[11px] text-[#94a3b8] mt-0.5">First-Pass Rate*</p>
                        </div>
                      </div>

                      {/* Prev period inline */}
                      {data.reviewerRevisions.hasPrevData ? (
                        <div className="flex items-center gap-4 mt-2.5 text-[12px] text-[#94a3b8]">
                          <span>{getPeriodLabel(timePeriod)}:</span>
                          <span>{data.reviewerRevisions.prevTotal} <ChangeBadge current={data.reviewerRevisions.total} prev={data.reviewerRevisions.prevTotal} /></span>
                          <span>{data.reviewerRevisions.prevAvgPerCert} <ChangeBadge current={data.reviewerRevisions.avgPerCert} prev={data.reviewerRevisions.prevAvgPerCert} /></span>
                          <span>{formatHours(data.reviewerRevisions.prevAvgTATHours)} <ChangeBadge current={data.reviewerRevisions.avgTATHours} prev={data.reviewerRevisions.prevAvgTATHours} /></span>
                          <span>{data.reviewerRevisions.prevFirstPassRate}% <ChangeBadge current={data.reviewerRevisions.firstPassRate} prev={data.reviewerRevisions.prevFirstPassRate} inverted /></span>
                        </div>
                      ) : (
                        <p className="mt-2.5 text-[12px] text-[#94a3b8] italic">No previous period data</p>
                      )}
                    </div>

                    {/* By Section */}
                    <div className="w-[280px] shrink-0 pl-5 border-l border-[#f1f5f9]">
                      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2">By Section</p>
                      {data.reviewerRevisions.bySections.length > 0 ? (
                        <div className="space-y-1.5">
                          {data.reviewerRevisions.bySections.map((item) => {
                            const maxCount = Math.max(...data.reviewerRevisions.bySections.map((s) => s.count), 1)
                            return <SectionBar key={item.section} section={item.section} count={item.count} max={maxCount} />
                          })}
                        </div>
                      ) : (
                        <p className="text-[12px] text-[#94a3b8] py-2">No revisions</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#f1f5f9]" />

                {/* ---- Customer ---- */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="size-2 rounded-full bg-[#7c3aed]" />
                    <h3 className="text-[14px] font-semibold text-[#0f172a]">Customer Revisions</h3>
                  </div>

                  <div className="flex gap-5">
                    {/* Stats */}
                    <div className="flex-1">
                      <div className="grid grid-cols-4 gap-3">
                        <div className="rounded-xl bg-[#faf5ff] p-3 text-center">
                          <p className="text-[18px] font-bold text-[#0f172a]">{data.customerRevisions.total}</p>
                          <p className="text-[11px] text-[#94a3b8] mt-0.5">Total</p>
                        </div>
                        <div className="rounded-xl bg-[#faf5ff] p-3 text-center">
                          <p className="text-[18px] font-bold text-[#0f172a]">{data.customerRevisions.avgPerCert}</p>
                          <p className="text-[11px] text-[#94a3b8] mt-0.5">Avg / Cert</p>
                        </div>
                        <div className="rounded-xl bg-[#faf5ff] p-3 text-center">
                          <p className="text-[18px] font-bold text-[#0f172a]">{formatHours(data.customerRevisions.avgTATHours)}</p>
                          <p className="text-[11px] text-[#94a3b8] mt-0.5">Avg TAT</p>
                        </div>
                        <div className="rounded-xl bg-[#faf5ff] p-3 text-center">
                          <p className="text-[18px] font-bold text-[#0f172a]">{data.customerRevisions.firstPassRate}%</p>
                          <p className="text-[11px] text-[#94a3b8] mt-0.5">First-Pass Rate*</p>
                        </div>
                      </div>

                      {data.customerRevisions.hasPrevData ? (
                        <div className="flex items-center gap-4 mt-2.5 text-[12px] text-[#94a3b8]">
                          <span>{getPeriodLabel(timePeriod)}:</span>
                          <span>{data.customerRevisions.prevTotal} <ChangeBadge current={data.customerRevisions.total} prev={data.customerRevisions.prevTotal} /></span>
                          <span>{data.customerRevisions.prevAvgPerCert} <ChangeBadge current={data.customerRevisions.avgPerCert} prev={data.customerRevisions.prevAvgPerCert} /></span>
                          <span>{formatHours(data.customerRevisions.prevAvgTATHours)} <ChangeBadge current={data.customerRevisions.avgTATHours} prev={data.customerRevisions.prevAvgTATHours} /></span>
                          <span>{data.customerRevisions.prevFirstPassRate}% <ChangeBadge current={data.customerRevisions.firstPassRate} prev={data.customerRevisions.prevFirstPassRate} inverted /></span>
                        </div>
                      ) : (
                        <p className="mt-2.5 text-[12px] text-[#94a3b8] italic">No previous period data</p>
                      )}
                    </div>

                    {/* By Section */}
                    <div className="w-[280px] shrink-0 pl-5 border-l border-[#f1f5f9]">
                      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2">By Section</p>
                      {data.customerRevisions.bySections.length > 0 ? (
                        <div className="space-y-1.5">
                          {data.customerRevisions.bySections.map((item) => {
                            const maxCount = Math.max(...data.customerRevisions.bySections.map((s) => s.count), 1)
                            return <SectionBar key={item.section} section={item.section} count={item.count} max={maxCount} />
                          })}
                        </div>
                      ) : (
                        <p className="text-[12px] text-[#94a3b8] py-2">No revisions</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ================================================================ */}
            {/*  CERTIFICATE DETAIL TABLE                                        */}
            {/* ================================================================ */}
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-3">
                Certificate Detail
              </p>
              <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f5f9]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#94a3b8]" />
                    <input
                      type="text"
                      placeholder="Search certificates..."
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                      className="pl-9 pr-4 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] w-72 placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                    />
                  </div>
                  <button className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors">
                    <Download className="size-3.5" />
                    Export CSV
                  </button>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                        <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Cert #</th>
                        <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Customer</th>
                        <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Engineer</th>
                        <th className="text-right py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Total TAT</th>
                        <th className="text-right py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Rev (R)</th>
                        <th className="text-right py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Rev (C)</th>
                        <th className="text-right py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Unlocks</th>
                        <th className="text-center py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCertificates.map((cert) => (
                        <Fragment key={cert.id}>
                          <tr
                            className={cn(
                              'border-b border-[#f1f5f9] cursor-pointer transition-colors',
                              expandedRows.has(cert.id) ? 'bg-[#f8fafc]' : 'hover:bg-[#f8fafc]'
                            )}
                            onClick={() => toggleRow(cert.id)}
                          >
                            <td className="py-2.5 px-4 font-medium text-[#0f172a]">
                              <span className="inline-flex items-center gap-1">
                                {expandedRows.has(cert.id)
                                  ? <ChevronUp className="size-3.5 text-[#94a3b8]" />
                                  : <ChevronDown className="size-3.5 text-[#94a3b8]" />
                                }
                                {cert.certificateNumber}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-[#64748b]">{cert.customer}</td>
                            <td className="py-2.5 px-4 text-[#64748b]">{cert.engineer}</td>
                            <td className="py-2.5 px-4 text-right">
                              <span className={cn('font-medium', cert.totalTATHours > 48 ? 'text-[#dc2626]' : 'text-[#0f172a]')}>
                                {formatHours(cert.totalTATHours)}
                              </span>
                              {cert.totalTATHours > 48 && <AlertTriangle className="size-3 text-[#d97706] inline ml-1" />}
                            </td>
                            <td className="py-2.5 px-4 text-right text-[#64748b]">{cert.reviewerRevisions}</td>
                            <td className="py-2.5 px-4 text-right text-[#64748b]">{cert.customerRevisions}</td>
                            <td className="py-2.5 px-4 text-right text-[#64748b]">{cert.unlocks}</td>
                            <td className="py-2.5 px-4 text-center">
                              {cert.status === 'AUTHORIZED' ? (
                                <CheckCircle2 className="size-4 text-[#16a34a] inline" />
                              ) : cert.totalTATHours > 48 ? (
                                <AlertTriangle className="size-4 text-[#d97706] inline" />
                              ) : (
                                <Clock className="size-4 text-[#3b82f6] inline" />
                              )}
                            </td>
                          </tr>

                          {/* Expanded row */}
                          {expandedRows.has(cert.id) && (
                            <tr>
                              <td colSpan={8} className="bg-[#f8fafc] px-5 py-4 border-b border-[#e2e8f0]">
                                <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-3">Stage Breakdown</p>
                                <div className="flex items-center gap-2">
                                  {cert.stages.map((stage, idx) => (
                                    <Fragment key={idx}>
                                      <div
                                        className={cn(
                                          'flex-1 flex flex-col items-center justify-center p-3 rounded-xl border',
                                          stage.status === 'stuck'
                                            ? 'bg-[#fef2f2] border-[#fecaca]'
                                            : stage.status === 'slow'
                                            ? 'bg-[#fffbeb] border-[#fde68a]'
                                            : 'bg-[#f0fdf4] border-[#bbf7d0]'
                                        )}
                                      >
                                        <span className="text-[11px] font-medium text-[#64748b]">{stage.name}</span>
                                        <span
                                          className={cn(
                                            'text-[16px] font-bold mt-1',
                                            stage.status === 'stuck' ? 'text-[#dc2626]'
                                              : stage.status === 'slow' ? 'text-[#d97706]'
                                              : 'text-[#16a34a]'
                                          )}
                                        >
                                          {formatHours(stage.hours)}
                                        </span>
                                      </div>
                                      {idx < cert.stages.length - 1 && (
                                        <ChevronRight className="size-4 text-[#cbd5e1] shrink-0" />
                                      )}
                                    </Fragment>
                                  ))}
                                </div>
                                <div className="mt-3 pt-3 border-t border-[#e2e8f0] flex items-center gap-6 text-[12px] text-[#64748b]">
                                  <span><span className="font-semibold text-[#0f172a]">Reviewer Revisions:</span> {cert.reviewerRevisions}</span>
                                  <span><span className="font-semibold text-[#0f172a]">Customer Revisions:</span> {cert.customerRevisions}</span>
                                  <span><span className="font-semibold text-[#0f172a]">Section Unlocks:</span> {cert.unlocks}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {filteredCertificates.length > 0 && (
                  <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#f1f5f9]">
                    <p className="text-[12.5px] text-[#94a3b8]">
                      Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredCertificates.length)} of {filteredCertificates.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1.5 text-[12px] border border-[#e2e8f0] rounded-[7px] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        &larr;
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const page = i + 1
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={cn(
                              'px-2.5 py-1.5 text-[12px] rounded-[7px] border transition-colors',
                              currentPage === page
                                ? 'bg-[#0f172a] text-white border-[#0f172a]'
                                : 'border-[#e2e8f0] hover:bg-[#f8fafc]'
                            )}
                          >
                            {page}
                          </button>
                        )
                      })}
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-2.5 py-1.5 text-[12px] border border-[#e2e8f0] rounded-[7px] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
