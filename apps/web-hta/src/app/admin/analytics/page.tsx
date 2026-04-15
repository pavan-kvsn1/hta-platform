'use client'

import { useState, useEffect, Fragment, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
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
} from 'lucide-react'

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
  // Previous period data
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
    case '7':
      return 'vs prev 7d'
    case '30':
      return 'vs prev 30d'
    case '90':
      return 'vs prev 90d'
    case '365':
      return 'vs prev year'
    default:
      return `vs prev ${days}d`
  }
}

function TrendBadge({ percent, inverted = false, noPrevData = false }: { percent: number; inverted?: boolean; noPrevData?: boolean }) {
  if (noPrevData) return <span className="text-xs text-slate-400 italic">No prev data</span>
  if (percent === 0) return <span className="text-xs text-slate-400">No change</span>

  const isPositive = percent > 0
  const isGood = inverted ? isPositive : !isPositive

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${
        isGood ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(percent)}%
    </span>
  )
}

function calcChangePercent(current: number, prev: number): number {
  if (prev === 0) return current > 0 ? 100 : 0
  return Math.round(((current - prev) / prev) * 100)
}

function ChangeBadge({ current, prev, inverted = false }: { current: number; prev: number; inverted?: boolean }) {
  const percent = calcChangePercent(current, prev)
  if (percent === 0) return null

  const isPositive = percent > 0
  const isGood = inverted ? isPositive : !isPositive

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${
        isGood ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(percent)}%
    </span>
  )
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const percent = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
      <div className={`h-full ${color} rounded`} style={{ width: `${percent}%` }} />
    </div>
  )
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [timePeriod, setTimePeriod] = useState('30')
  const [customer, setCustomer] = useState('all')
  const [engineer, setEngineer] = useState('all')

  // Table state
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Customer and engineer options
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([])

  const fetchFilterOptions = async () => {
    try {
      const [customersRes, engineersRes] = await Promise.all([
        fetch('/api/admin/customers?limit=100'),
        fetch('/api/admin/users?role=ENGINEER&limit=100'),
      ])

      if (customersRes.ok) {
        const customersData = await customersRes.json()
        setCustomers(customersData.customers || [])
      }

      if (engineersRes.ok) {
        const engineersData = await engineersRes.json()
        setEngineers(engineersData.users || [])
      }
    } catch {
      // Silently fail - filters will just show "All"
    }
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

      const response = await fetch(`/api/admin/analytics?${params}`)

      if (!response.ok) {
        throw new Error('Failed to fetch analytics')
      }

      const result = await response.json()
      setData(result)
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
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
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

  if (loading && !data) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-slate-100">
      <div className="h-full flex flex-col bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-300 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Performance Analytics</h1>
              <p className="text-sm text-slate-500 mt-0.5">Certificate workflow metrics</p>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                Track certificate processing efficiency across your workflow. Monitor turnaround times at each stage, identify bottlenecks, and analyze revision patterns to improve operational performance.
              </p>
            </div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex-shrink-0 border-b border-slate-300 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 uppercase tracking-wider p-1">
                By Timeframe
              </label>
              <select
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="365">Last year</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 uppercase tracking-wider p-1">
                By Customer Name
              </label>
              <select
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Customers</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 uppercase tracking-wider p-1">
                Created By Engineer
              </label>
              <select
                value={engineer}
                onChange={(e) => setEngineer(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Engineers</option>
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>

            {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 mb-2" />}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          ) : data ? (
            <>
              {/* Stage TAT */}
              <div className="rounded-lg border border-slate-300 overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-primary">
                  <h2 className="font-semibold text-primary-foreground text-sm">
                    Stage Turnaround Time (TAT)
                  </h2>
                </div>
                <div className="p-4 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left py-2 px-3 font-semibold text-slate-600">
                            Stage Transition
                          </th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-600">
                            Avg TAT
                          </th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-600">
                            Median
                          </th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-600">
                            {getPeriodLabel(timePeriod)}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        <tr>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                                Created
                              </span>
                              <span className="text-slate-400">→</span>
                              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                                Submitted
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Engineer drafting time</p>
                          </td>
                          <td className="text-right py-3 px-3 font-medium">
                            {formatHours(data.stageTAT.createdToSubmitted.avgHours)}
                          </td>
                          <td className="text-right py-3 px-3 text-slate-600">
                            {formatHours(data.stageTAT.createdToSubmitted.medianHours)}
                          </td>
                          <td className="text-right py-3 px-3">
                            <TrendBadge percent={data.stageTAT.createdToSubmitted.changePercent} />
                          </td>
                        </tr>

                        <tr>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                                Submitted
                              </span>
                              <span className="text-slate-400">→</span>
                              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
                                Reviewed
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Peer review time</p>
                          </td>
                          <td className="text-right py-3 px-3 font-medium">
                            {formatHours(data.stageTAT.submittedToReviewed.avgHours)}
                          </td>
                          <td className="text-right py-3 px-3 text-slate-600">
                            {formatHours(data.stageTAT.submittedToReviewed.medianHours)}
                          </td>
                          <td className="text-right py-3 px-3">
                            <TrendBadge percent={data.stageTAT.submittedToReviewed.changePercent} />
                          </td>
                        </tr>

                        <tr className={data.bottleneck === 'customer' ? 'bg-amber-50' : ''}>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
                                Reviewed
                              </span>
                              <span className="text-slate-400">→</span>
                              <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                                Customer
                              </span>
                              {data.bottleneck === 'customer' && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded uppercase">
                                  Bottleneck
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Customer review time</p>
                          </td>
                          <td className="text-right py-3 px-3 font-medium">
                            {formatHours(data.stageTAT.reviewedToCustomer.avgHours)}
                          </td>
                          <td className="text-right py-3 px-3 text-slate-600">
                            {formatHours(data.stageTAT.reviewedToCustomer.medianHours)}
                          </td>
                          <td className="text-right py-3 px-3">
                            <TrendBadge percent={data.stageTAT.reviewedToCustomer.changePercent} />
                          </td>
                        </tr>

                        <tr>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                                Customer
                              </span>
                              <span className="text-slate-400">→</span>
                              <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded">
                                Authorized
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Admin authorization time</p>
                          </td>
                          <td className="text-right py-3 px-3 font-medium">
                            {formatHours(data.stageTAT.customerToAuthorized.avgHours)}
                          </td>
                          <td className="text-right py-3 px-3 text-slate-600">
                            {formatHours(data.stageTAT.customerToAuthorized.medianHours)}
                          </td>
                          <td className="text-right py-3 px-3">
                            <TrendBadge percent={data.stageTAT.customerToAuthorized.changePercent} />
                          </td>
                        </tr>
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50">
                          <td className="py-3 px-3 font-semibold text-slate-900">
                            Total: Created → Authorized
                          </td>
                          <td className="text-right py-3 px-3 font-bold text-slate-900">
                            {formatHours(data.stageTAT.total.avgHours)}
                          </td>
                          <td className="text-right py-3 px-3 font-medium text-slate-700">
                            {formatHours(data.stageTAT.total.medianHours)}
                          </td>
                          <td className="text-right py-3 px-3">
                            <TrendBadge percent={data.stageTAT.total.changePercent} />
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* Section Unlock Metrics */}
              <div className="rounded-lg border border-slate-300 overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-primary">
                  <h2 className="font-semibold text-primary-foreground text-sm">
                    Section Unlock Metrics
                  </h2>
                </div>
                <div className="p-4 bg-white">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-blue-50 rounded-lg p-4 text-center border border-slate-300">
                      <div className="text-2xl font-bold text-blue-900">
                        {data.unlockMetrics.total}
                      </div>
                      <div className="text-xs text-blue-700 mt-0.5">Requests Total</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center border border-slate-300">
                      <div className="text-2xl font-bold text-green-900">
                        {formatHours(data.unlockMetrics.avgTATHours)}
                      </div>
                      <div className="text-xs text-green-700 mt-0.5">Avg TAT to Resolve</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center border border-slate-300">
                      <div className="text-2xl font-bold text-green-900">
                        {data.unlockMetrics.approvedPercent}%
                      </div>
                      <div className="text-xs text-green-700 mt-0.5">Approved</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 text-center border border-slate-300">
                      <div className="text-2xl font-bold text-red-900">
                        {data.unlockMetrics.rejectedPercent}%
                      </div>
                      <div className="text-xs text-red-700 mt-0.5">Rejected</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                      By Section Requested
                    </h3>
                    {data.unlockMetrics.bySections.length > 0 ? (
                      <div className="space-y-2">
                        {data.unlockMetrics.bySections.slice(0, 5).map((item) => {
                          const maxCount = Math.max(...data.unlockMetrics.bySections.map((s) => s.count))
                          return (
                            <div key={item.section} className="flex items-center gap-3">
                              <div className="w-28 text-sm text-slate-700 truncate">
                                {SECTION_LABELS[item.section] || item.section}
                              </div>
                              <ProgressBar value={item.count} max={maxCount} color="bg-indigo-400" />
                              <div className="w-8 text-right text-sm font-medium text-slate-600">
                                {item.count}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400 text-center py-4">
                        No unlock requests in this period
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Revision Metrics */}
              <div className="rounded-lg border border-slate-300 overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-primary">
                  <h2 className="font-semibold text-primary-foreground text-sm">Revision Metrics</h2>
                </div>
                <div className="p-4 bg-white space-y-4">
                  {/* Reviewer Revisions */}
                  <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50/50 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Reviewer Revisions</h3>

                    {/* Current Period */}
                    <div className="mb-3">
                      <p className="text-xs font-medium text-slate-500 mb-2">Last {timePeriod} days</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white rounded-lg p-3 text-center border border-blue-100">
                          <div className="text-xl font-bold text-slate-900">
                            {data.reviewerRevisions.total}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">Total Requests</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center border border-blue-100">
                          <div className="text-xl font-bold text-slate-900">
                            {data.reviewerRevisions.avgPerCert}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">Avg per Cert</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center border border-blue-100">
                          <div className="text-xl font-bold text-slate-900">
                            {formatHours(data.reviewerRevisions.avgTATHours)}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">Avg TAT to Resolve</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center border border-blue-100">
                          <div className="text-xl font-bold text-slate-900">
                            {data.reviewerRevisions.firstPassRate}%
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">First-Pass Rate</div>
                        </div>
                      </div>
                    </div>

                    {/* Previous Period */}
                    <div className="mb-4">
                      <p className="text-xs font-medium text-slate-500 mb-2">Prev {timePeriod} days</p>
                      {data.reviewerRevisions.hasPrevData ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-300">
                            <div className="text-lg font-semibold text-slate-700">
                              {data.reviewerRevisions.prevTotal}
                            </div>
                            <div className="mt-1">
                              <ChangeBadge current={data.reviewerRevisions.total} prev={data.reviewerRevisions.prevTotal} />
                            </div>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-300">
                            <div className="text-lg font-semibold text-slate-700">
                              {data.reviewerRevisions.prevAvgPerCert}
                            </div>
                            <div className="mt-1">
                              <ChangeBadge current={data.reviewerRevisions.avgPerCert} prev={data.reviewerRevisions.prevAvgPerCert} />
                            </div>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-300">
                            <div className="text-lg font-semibold text-slate-700">
                              {formatHours(data.reviewerRevisions.prevAvgTATHours)}
                            </div>
                            <div className="mt-1">
                              <ChangeBadge current={data.reviewerRevisions.avgTATHours} prev={data.reviewerRevisions.prevAvgTATHours} />
                            </div>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-300">
                            <div className="text-lg font-semibold text-slate-700">
                              {data.reviewerRevisions.prevFirstPassRate}%
                            </div>
                            <div className="mt-1">
                              <ChangeBadge current={data.reviewerRevisions.firstPassRate} prev={data.reviewerRevisions.prevFirstPassRate} inverted />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-lg p-6 text-center border border-slate-300">
                          <p className="text-sm text-slate-400">No data for previous period</p>
                        </div>
                      )}
                    </div>

                    {/* By Section */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
                        By Section
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        {data.reviewerRevisions.bySections.length > 0 ? (
                          data.reviewerRevisions.bySections.map((item) => {
                            const maxCount = Math.max(
                              ...data.reviewerRevisions.bySections.map((s) => s.count),
                              1
                            )
                            return (
                              <div key={item.section} className="flex items-center gap-2">
                                <div className="w-20 text-xs text-slate-600 truncate">
                                  {SECTION_LABELS[item.section] || item.section}
                                </div>
                                <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                                  <div
                                    className="h-full bg-blue-400 rounded"
                                    style={{ width: `${(item.count / maxCount) * 100}%` }}
                                  />
                                </div>
                                <div className="w-6 text-right text-xs font-medium text-slate-600">
                                  {item.count}
                                </div>
                              </div>
                            )
                          })
                        ) : (
                          <div className="col-span-2 text-sm text-slate-400 text-center py-2">
                            No revisions in this period
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Customer Revisions */}
                  <div className="rounded-lg border-l-4 border-purple-500 bg-purple-50/50 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Customer Revisions</h3>

                    {/* Current Period */}
                    <div className="mb-3">
                      <p className="text-xs font-medium text-slate-500 mb-2">Last {timePeriod} days</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white rounded-lg p-3 text-center border border-purple-100">
                          <div className="text-xl font-bold text-slate-900">
                            {data.customerRevisions.total}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">Total Requests</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center border border-purple-100">
                          <div className="text-xl font-bold text-slate-900">
                            {data.customerRevisions.avgPerCert}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">Avg per Cert</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center border border-purple-100">
                          <div className="text-xl font-bold text-slate-900">
                            {formatHours(data.customerRevisions.avgTATHours)}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">Avg TAT to Resolve</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center border border-purple-100">
                          <div className="text-xl font-bold text-slate-900">
                            {data.customerRevisions.firstPassRate}%
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">First-Pass Rate</div>
                        </div>
                      </div>
                    </div>

                    {/* Previous Period */}
                    <div className="mb-4">
                      <p className="text-xs font-medium text-slate-500 mb-2">Prev {timePeriod} days</p>
                      {data.customerRevisions.hasPrevData ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-300">
                            <div className="text-lg font-semibold text-slate-700">
                              {data.customerRevisions.prevTotal}
                            </div>
                            <div className="mt-1">
                              <ChangeBadge current={data.customerRevisions.total} prev={data.customerRevisions.prevTotal} />
                            </div>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-300">
                            <div className="text-lg font-semibold text-slate-700">
                              {data.customerRevisions.prevAvgPerCert}
                            </div>
                            <div className="mt-1">
                              <ChangeBadge current={data.customerRevisions.avgPerCert} prev={data.customerRevisions.prevAvgPerCert} />
                            </div>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-300">
                            <div className="text-lg font-semibold text-slate-700">
                              {formatHours(data.customerRevisions.prevAvgTATHours)}
                            </div>
                            <div className="mt-1">
                              <ChangeBadge current={data.customerRevisions.avgTATHours} prev={data.customerRevisions.prevAvgTATHours} />
                            </div>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-300">
                            <div className="text-lg font-semibold text-slate-700">
                              {data.customerRevisions.prevFirstPassRate}%
                            </div>
                            <div className="mt-1">
                              <ChangeBadge current={data.customerRevisions.firstPassRate} prev={data.customerRevisions.prevFirstPassRate} inverted />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-lg p-6 text-center border border-slate-300">
                          <p className="text-sm text-slate-400">No data for previous period</p>
                        </div>
                      )}
                    </div>

                    {/* By Section */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
                        By Section
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        {data.customerRevisions.bySections.length > 0 ? (
                          data.customerRevisions.bySections.map((item) => {
                            const maxCount = Math.max(
                              ...data.customerRevisions.bySections.map((s) => s.count),
                              1
                            )
                            return (
                              <div key={item.section} className="flex items-center gap-2">
                                <div className="w-20 text-xs text-slate-600 truncate">
                                  {SECTION_LABELS[item.section] || item.section}
                                </div>
                                <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                                  <div
                                    className="h-full bg-purple-400 rounded"
                                    style={{ width: `${(item.count / maxCount) * 100}%` }}
                                  />
                                </div>
                                <div className="w-6 text-right text-xs font-medium text-slate-600">
                                  {item.count}
                                </div>
                              </div>
                            )
                          })
                        ) : (
                          <div className="col-span-2 text-sm text-slate-400 text-center py-2">
                            No revisions in this period
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Overall Summary */}
                  <div className="bg-slate-50 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-700">Total:</span>
                      <span className="text-lg font-bold text-slate-900">
                        {data.reviewerRevisions.total + data.customerRevisions.total}
                      </span>
                      <span className="text-sm text-slate-500">revisions</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-blue-400" />
                        <span className="text-sm text-slate-600">Reviewer</span>
                      </div>
                      <div className="w-40 h-4 rounded overflow-hidden flex bg-slate-200">
                        <div
                          className="bg-blue-400"
                          style={{
                            width: `${
                              (data.reviewerRevisions.total /
                                (data.reviewerRevisions.total + data.customerRevisions.total || 1)) *
                              100
                            }%`,
                          }}
                        />
                        <div className="bg-purple-400 flex-1" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-purple-400" />
                        <span className="text-sm text-slate-600">Customer</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Certificate Detail Table */}
              <div className="rounded-lg border border-slate-300 overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-primary flex items-center justify-between">
                  <h2 className="font-semibold text-primary-foreground text-sm">
                    Certificate Detail Table
                  </h2>
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/20 hover:bg-white/30 text-primary-foreground rounded transition-colors">
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                </div>
                <div className="p-4 bg-white">
                  {/* Search */}
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search certificates..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        setCurrentPage(1)
                      }}
                      className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-300 bg-slate-50">
                          <th className="text-left py-2 px-3 font-semibold text-slate-600">Cert #</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-600">Customer</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-600">Engineer</th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-600">Total TAT</th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-600">Rev (R)</th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-600">Rev (C)</th>
                          <th className="text-right py-2 px-3 font-semibold text-slate-600">Unlocks</th>
                          <th className="text-center py-2 px-3 font-semibold text-slate-600">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedCertificates.map((cert) => (
                          <Fragment key={cert.id}>
                            <tr
                              className={`hover:bg-slate-50 cursor-pointer ${
                                expandedRows.has(cert.id) ? 'bg-slate-50' : ''
                              }`}
                              onClick={() => toggleRow(cert.id)}
                            >
                              <td className="py-2.5 px-3 font-medium text-slate-900 flex items-center gap-1">
                                {expandedRows.has(cert.id) ? (
                                  <ChevronUp className="w-4 h-4 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                )}
                                {cert.certificateNumber}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">{cert.customer}</td>
                              <td className="py-2.5 px-3 text-slate-600">{cert.engineer}</td>
                              <td className="py-2.5 px-3 text-right">
                                <span
                                  className={`font-medium ${
                                    cert.totalTATHours > 48 ? 'text-red-600' : 'text-slate-900'
                                  }`}
                                >
                                  {formatHours(cert.totalTATHours)}
                                </span>
                                {cert.totalTATHours > 48 && (
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline ml-1" />
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-600">
                                {cert.reviewerRevisions}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-600">
                                {cert.customerRevisions}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-600">{cert.unlocks}</td>
                              <td className="py-2.5 px-3 text-center">
                                {cert.status === 'AUTHORIZED' ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500 inline" />
                                ) : cert.totalTATHours > 48 ? (
                                  <AlertTriangle className="w-4 h-4 text-amber-500 inline" />
                                ) : (
                                  <Clock className="w-4 h-4 text-blue-500 inline" />
                                )}
                              </td>
                            </tr>
                            {expandedRows.has(cert.id) && (
                              <tr>
                                <td colSpan={8} className="bg-slate-50 p-4">
                                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
                                    Stage Breakdown
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {cert.stages.map((stage, idx) => (
                                      <Fragment key={idx}>
                                        <div
                                          className={`flex-1 flex flex-col items-center justify-center p-3 rounded-lg border ${
                                            stage.status === 'stuck'
                                              ? 'bg-red-50 border-red-200'
                                              : stage.status === 'slow'
                                              ? 'bg-amber-50 border-amber-200'
                                              : 'bg-green-50 border-green-200'
                                          }`}
                                        >
                                          <span className="text-xs font-medium text-slate-600">
                                            {stage.name}
                                          </span>
                                          <span
                                            className={`text-lg font-bold mt-1 ${
                                              stage.status === 'stuck'
                                                ? 'text-red-700'
                                                : stage.status === 'slow'
                                                ? 'text-amber-700'
                                                : 'text-green-700'
                                            }`}
                                          >
                                            {formatHours(stage.hours)}
                                          </span>
                                          <span className="text-sm mt-0.5">
                                            {stage.status === 'stuck' && (
                                              <span className="text-red-600">✗</span>
                                            )}
                                            {stage.status === 'slow' && (
                                              <span className="text-amber-600">⚠</span>
                                            )}
                                            {stage.status === 'ok' && (
                                              <span className="text-green-600">✓</span>
                                            )}
                                          </span>
                                        </div>
                                        {idx < cert.stages.length - 1 && (
                                          <span className="text-slate-400 text-xl flex-shrink-0">→</span>
                                        )}
                                      </Fragment>
                                    ))}
                                  </div>
                                  <div className="mt-4 pt-3 border-t border-slate-300 flex items-center gap-6 text-sm text-slate-600">
                                    <span>
                                      <span className="font-medium">Reviewer Revisions:</span> {cert.reviewerRevisions}
                                    </span>
                                    <span>
                                      <span className="font-medium">Customer Revisions:</span> {cert.customerRevisions}
                                    </span>
                                    <span>
                                      <span className="font-medium">Section Unlocks:</span> {cert.unlocks}
                                    </span>
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
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <p className="text-sm text-slate-500">
                      Showing {(currentPage - 1) * pageSize + 1}-
                      {Math.min(currentPage * pageSize, filteredCertificates.length)} of{' '}
                      {filteredCertificates.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ←
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const page = i + 1
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-3 py-1.5 text-sm border rounded ${
                              currentPage === page
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {page}
                          </button>
                        )
                      })}
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
