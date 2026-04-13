'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  UserCheck,
  Wrench,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Loader2,
  Clock,
  Building,
  FileText,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Inbox,
  Users,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReviewerInternalMetrics {
  avgResponseTimeHours: number
  avgRevisionCycles: number
  totalReviewed: number
  approvedFirstPass: number
  approvedAfterRevision: number
  sentForRevision: number
  avgTimeToFirstResponse: number
}

interface ReviewerCustomerMetrics {
  sentToCustomer: number
  customerApproved: number
  customerRevisions: number
  avgCustomerResponseTimeHours: number
  avgCustRevisionHandlingHours: number
}

interface ReviewerMetrics {
  internal: ReviewerInternalMetrics
  customer: ReviewerCustomerMetrics
  changes: {
    responseTime: { hours: number; percent: number }
    revisionCycles: { count: number; percent: number }
  }
}

interface EngineerInternalMetrics {
  avgRevisionTimeHours: number
  avgRevisionCycles: number
  totalCreated: number
  approvedFirstPass: number
  needed1Revision: number
  needed2PlusRevisions: number
  avgTimeInRevision: number
}

interface EngineerCustomerMetrics {
  customerRevisionRequests: number
  resolvedQuickly: number
  neededEscalation: number
  avgResolutionTimeHours: number
}

interface EngineerMetrics {
  internal: EngineerInternalMetrics
  customer: EngineerCustomerMetrics
  changes: {
    revisionTime: { hours: number; percent: number }
    revisionCycles: { count: number; percent: number }
  }
}

interface AuthorizerMetrics {
  avgAuthorizationTimeHours: number
  totalAuthorized: number
  authorizedThisPeriod: number
  changes: {
    authorizationTime: { hours: number; percent: number }
    count: { count: number; percent: number }
  }
}

interface RequestHandlingMetrics {
  internal: {
    totalHandled: number
    handledThisPeriod: number
    approved: number
    rejected: number
    avgHandlingTimeHours: number
  }
  customer: {
    totalHandled: number
    handledThisPeriod: number
    approved: number
    rejected: number
    avgHandlingTimeHours: number
  } | null
  changes: {
    internalTime: { hours: number; percent: number }
    customerTime: { hours: number; percent: number } | null
  }
}

interface UserTATMetricsData {
  asReviewer: ReviewerMetrics | null
  asEngineer: EngineerMetrics | null
  asAuthorizer: AuthorizerMetrics | null
  requestHandling: RequestHandlingMetrics | null
  periodDays: number
}

interface UserTATMetricsProps {
  userId: string
  userRole: string
  adminType?: string | null  // 'MASTER' | 'WORKER' for admins
  periodDays?: number
}

// Format hours - show minutes if hours < 1, seconds if minutes < 1
function formatHours(hours: number): string {
  if (hours === 0) return '0h'
  if (hours < 1) {
    const minutes = Math.round(hours * 60)
    if (minutes === 0) {
      const seconds = Math.round(hours * 3600)
      return `${Math.max(1, seconds)}s`
    }
    return `${minutes}m`
  }
  return `${Math.round(hours)}h`
}

// Calculate percentage
function percentage(value: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

export function UserTATMetrics({ userId, userRole, adminType, periodDays = 30 }: UserTATMetricsProps) {
  const [metrics, setMetrics] = useState<UserTATMetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/users/${userId}/tat-metrics?periodDays=${periodDays}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch metrics')
        return res.json()
      })
      .then(data => {
        setMetrics(data)
        setError(null)
      })
      .catch(err => {
        console.error('Error fetching TAT metrics:', err)
        setError('Failed to load performance metrics')
      })
      .finally(() => setLoading(false))
  }, [userId, periodDays])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-12 flex items-center justify-center gap-2 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{error}</span>
        </CardContent>
      </Card>
    )
  }

  // Determine which cards to show based on role
  // ENGINEER: Assignee (creates certs) + Reviewer (reviews certs, coordinates with customer)
  // ADMIN: Reviewer + Authorizer + Internal Requests + Customer Requests (Master only)
  const showReviewer = true  // Both ENGINEER and ADMIN can review
  const showEngineer = userRole === 'ENGINEER'
  const showAuthorizer = userRole === 'ADMIN'
  const showInternalRequests = userRole === 'ADMIN'
  const showCustomerRequests = userRole === 'ADMIN' && adminType === 'MASTER'

  // Count how many cards we'll show (for certificate metrics row)
  const certCardCount = (showReviewer ? 1 : 0) + (showEngineer ? 1 : 0) + (showAuthorizer ? 1 : 0)

  // Count request handling cards
  const requestCardCount = (showInternalRequests ? 1 : 0) + (showCustomerRequests ? 1 : 0)

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-500" />
            Performance Metrics
          </CardTitle>
          <span className="text-sm text-slate-500 bg-slate-100 px-2 py-1 rounded">Last {periodDays} days</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Certificate Metrics Row */}
        <div className={cn(
          'grid gap-6',
          certCardCount === 1 && 'grid-cols-1',
          certCardCount === 2 && 'grid-cols-1 lg:grid-cols-2',
          certCardCount === 3 && 'grid-cols-1 lg:grid-cols-3'
        )}>
          {/* As Reviewer Section */}
          {showReviewer && (
            <ReviewerCard metrics={metrics?.asReviewer ?? null} />
          )}

          {/* As Engineer Section */}
          {showEngineer && (
            <EngineerCard metrics={metrics?.asEngineer ?? null} />
          )}

          {/* As Authorizer Section (Admin only) */}
          {showAuthorizer && (
            <AuthorizerCard metrics={metrics?.asAuthorizer ?? null} />
          )}
        </div>

        {/* Request Handling Section (Admin only) */}
        {(showInternalRequests || showCustomerRequests) && (
          <div className={cn(
            'grid gap-6',
            requestCardCount === 1 && 'grid-cols-1',
            requestCardCount === 2 && 'grid-cols-1 lg:grid-cols-2'
          )}>
            {/* Internal Requests Card */}
            {showInternalRequests && (
              <InternalRequestsCard metrics={metrics?.requestHandling?.internal ?? null} changes={metrics?.requestHandling?.changes.internalTime ?? null} />
            )}

            {/* Customer Requests Card (Master Admin only) */}
            {showCustomerRequests && (
              <CustomerRequestsCard metrics={metrics?.requestHandling?.customer ?? null} changes={metrics?.requestHandling?.changes.customerTime ?? null} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Empty state component
function EmptyState({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
      <Icon className="h-10 w-10 mb-3 opacity-50" />
      <p className="text-sm font-medium">No data available</p>
      <p className="text-xs mt-1">{label}</p>
    </div>
  )
}

// Stat card component for key metrics
function StatCard({
  value,
  label,
  icon: Icon,
  change,
  inverseColors = false,
  colorClass = 'text-slate-900',
}: {
  value: string
  label: string
  icon: typeof Clock
  change?: { hours?: number; count?: number; percent: number }
  inverseColors?: boolean
  colorClass?: string
}) {
  const changeValue = change?.hours ?? change?.count ?? 0
  const hasChange = change && changeValue !== 0
  const isImproved = inverseColors ? changeValue < 0 : changeValue > 0
  const isWorse = inverseColors ? changeValue > 0 : changeValue < 0

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl p-4 border border-slate-100">
      <div className="flex items-start justify-between mb-2">
        <Icon className="h-5 w-5 text-slate-400" />
        {hasChange && (
          <div className={cn(
            'flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full',
            isImproved && 'bg-green-100 text-green-700',
            isWorse && 'bg-red-100 text-red-700',
          )}>
            {isImproved ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
            {Math.abs(change.percent)}%
          </div>
        )}
      </div>
      <div className={cn('text-3xl font-bold', colorClass)}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  )
}

// Progress bar component
function ProgressBar({ value, total, color }: { value: number; total: number; color: string }) {
  const percent = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', color)}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

function ReviewerCard({ metrics }: { metrics: ReviewerMetrics | null }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-b from-amber-50/50 to-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-amber-100/80 to-amber-50/50 border-b border-amber-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500 shadow-sm">
            <UserCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-amber-900">As Reviewer</h3>
            <p className="text-xs text-amber-700/80">Certificates reviewed by this user</p>
          </div>
        </div>
      </div>

      {!metrics ? (
        <EmptyState icon={UserCheck} label="No certificates reviewed yet" />
      ) : (
        <div className="p-5 space-y-5">
          {/* Key Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              value={formatHours(metrics.internal.avgResponseTimeHours)}
              label="Avg Response Time"
              icon={Clock}
              change={metrics.changes.responseTime}
              inverseColors
            />
            <StatCard
              value={metrics.internal.avgRevisionCycles.toFixed(1)}
              label="Avg Revision Cycles"
              icon={RotateCcw}
              change={metrics.changes.revisionCycles}
              inverseColors
            />
          </div>

          {/* Internal Review */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <FileText className="h-3.5 w-3.5" />
              Internal Review
            </div>
            <div className="bg-white rounded-lg border border-slate-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total Reviewed</span>
                <span className="text-lg font-bold text-slate-900">{metrics.internal.totalReviewed}</span>
              </div>
              <ProgressBar
                value={metrics.internal.approvedFirstPass}
                total={metrics.internal.totalReviewed}
                color="bg-green-500"
              />
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-green-50 rounded-lg p-2">
                  <div className="font-bold text-green-700">{metrics.internal.approvedFirstPass}</div>
                  <div className="text-green-600">1st Pass</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-2">
                  <div className="font-bold text-amber-700">{metrics.internal.approvedAfterRevision}</div>
                  <div className="text-amber-600">After Rev</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <div className="font-bold text-slate-700">{metrics.internal.sentForRevision}</div>
                  <div className="text-slate-600">Revisions</div>
                </div>
              </div>
            </div>
          </div>

          {/* Customer Review */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <Building className="h-3.5 w-3.5" />
              Customer Review
            </div>
            <div className="bg-white rounded-lg border border-slate-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Sent to Customer</span>
                <span className="text-lg font-bold text-slate-900">{metrics.customer.sentToCustomer}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                  <span className="text-slate-600">Approved</span>
                  <span className="font-semibold text-green-600">{metrics.customer.customerApproved}</span>
                </div>
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                  <span className="text-slate-600">Revisions</span>
                  <span className="font-semibold text-amber-600">{metrics.customer.customerRevisions}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div>Response: <span className="font-medium text-slate-700">{formatHours(metrics.customer.avgCustomerResponseTimeHours)}</span></div>
                <div>Handling: <span className="font-medium text-slate-700">{formatHours(metrics.customer.avgCustRevisionHandlingHours)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EngineerCard({ metrics }: { metrics: EngineerMetrics | null }) {
  return (
    <div className="rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50/50 to-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-blue-100/80 to-blue-50/50 border-b border-blue-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500 shadow-sm">
            <Wrench className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-blue-900">As Engineer</h3>
            <p className="text-xs text-blue-700/80">Certificates created by this user</p>
          </div>
        </div>
      </div>

      {!metrics ? (
        <EmptyState icon={Wrench} label="No certificates created yet" />
      ) : (
        <div className="p-5 space-y-5">
          {/* Key Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              value={formatHours(metrics.internal.avgRevisionTimeHours)}
              label="Avg Revision Time"
              icon={Clock}
              change={metrics.changes.revisionTime}
              inverseColors
            />
            <StatCard
              value={metrics.internal.avgRevisionCycles.toFixed(1)}
              label="Avg Revision Cycles"
              icon={RotateCcw}
              change={metrics.changes.revisionCycles}
              inverseColors
            />
          </div>

          {/* Internal Review */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <FileText className="h-3.5 w-3.5" />
              Internal Review
            </div>
            <div className="bg-white rounded-lg border border-slate-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total Created</span>
                <span className="text-lg font-bold text-slate-900">{metrics.internal.totalCreated}</span>
              </div>
              <ProgressBar
                value={metrics.internal.approvedFirstPass}
                total={metrics.internal.totalCreated}
                color="bg-blue-500"
              />
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-green-50 rounded-lg p-2">
                  <div className="font-bold text-green-700">{metrics.internal.approvedFirstPass}</div>
                  <div className="text-green-600">1st Pass</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-2">
                  <div className="font-bold text-amber-700">{metrics.internal.needed1Revision}</div>
                  <div className="text-amber-600">1 Revision</div>
                </div>
                <div className="bg-red-50 rounded-lg p-2">
                  <div className="font-bold text-red-700">{metrics.internal.needed2PlusRevisions}</div>
                  <div className="text-red-600">2+ Rev</div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-xs text-slate-500">
                Avg time in revision: <span className="font-medium text-slate-700">{formatHours(metrics.internal.avgTimeInRevision)}</span>
              </div>
            </div>
          </div>

          {/* Customer Revisions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <Building className="h-3.5 w-3.5" />
              Customer Revisions
            </div>
            <div className="bg-white rounded-lg border border-slate-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Revision Requests</span>
                <span className="text-lg font-bold text-slate-900">{metrics.customer.customerRevisionRequests}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                  <span className="text-green-600">Quick (&lt;4h)</span>
                  <span className="font-semibold text-green-700">{metrics.customer.resolvedQuickly}</span>
                </div>
                <div className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2">
                  <span className="text-amber-600">Longer</span>
                  <span className="font-semibold text-amber-700">{metrics.customer.neededEscalation}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-xs text-slate-500">
                Avg resolution: <span className="font-medium text-slate-700">{formatHours(metrics.customer.avgResolutionTimeHours)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AuthorizerCard({ metrics }: { metrics: AuthorizerMetrics | null }) {
  return (
    <div className="rounded-xl border border-green-200 bg-gradient-to-b from-green-50/50 to-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-green-100/80 to-green-50/50 border-b border-green-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500 shadow-sm">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-green-900">As Authorizer</h3>
            <p className="text-xs text-green-700/80">Certificates authorized by this admin</p>
          </div>
        </div>
      </div>

      {!metrics ? (
        <EmptyState icon={ShieldCheck} label="No certificates authorized yet" />
      ) : (
        <div className="p-5 space-y-5">
          {/* Key Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              value={formatHours(metrics.avgAuthorizationTimeHours)}
              label="Avg Authorization Time"
              icon={Clock}
              change={metrics.changes.authorizationTime}
              inverseColors
            />
            <StatCard
              value={metrics.authorizedThisPeriod.toString()}
              label="Authorized (Period)"
              icon={CheckCircle2}
              change={metrics.changes.count}
              colorClass="text-green-600"
            />
          </div>

          {/* Authorization Summary */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <ShieldCheck className="h-3.5 w-3.5" />
              Authorization Activity
            </div>
            <div className="bg-white rounded-lg border border-slate-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total Authorized</span>
                <span className="text-lg font-bold text-green-600">{metrics.totalAuthorized}</span>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-600">{metrics.authorizedThisPeriod}</div>
                <div className="text-xs text-green-700 mt-1">Certificates this period</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface InternalRequestMetrics {
  totalHandled: number
  handledThisPeriod: number
  approved: number
  rejected: number
  avgHandlingTimeHours: number
}

function InternalRequestsCard({ metrics, changes }: { metrics: InternalRequestMetrics | null; changes: { hours: number; percent: number } | null }) {
  return (
    <div className="rounded-xl border border-purple-200 bg-gradient-to-b from-purple-50/50 to-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-purple-100/80 to-purple-50/50 border-b border-purple-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500 shadow-sm">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-purple-900">Internal Requests</h3>
            <p className="text-xs text-purple-700/80">Section unlock requests from engineers</p>
          </div>
        </div>
      </div>

      {!metrics ? (
        <EmptyState icon={FileText} label="No internal requests handled yet" />
      ) : (
        <div className="p-5 space-y-5">
          {/* Key Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              value={formatHours(metrics.avgHandlingTimeHours)}
              label="Avg Response Time"
              icon={Clock}
              change={changes ?? undefined}
              inverseColors
            />
            <StatCard
              value={metrics.handledThisPeriod.toString()}
              label="Handled (Period)"
              icon={CheckCircle2}
              colorClass="text-purple-600"
            />
          </div>

          {/* Request Summary */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <Inbox className="h-3.5 w-3.5" />
              Request Activity
            </div>
            <div className="bg-white rounded-lg border border-slate-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total Handled</span>
                <span className="text-lg font-bold text-purple-600">{metrics.totalHandled}</span>
              </div>
              <ProgressBar
                value={metrics.approved}
                total={metrics.totalHandled}
                color="bg-purple-500"
              />
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="bg-green-50 rounded-lg p-2">
                  <div className="font-bold text-green-700">{metrics.approved}</div>
                  <div className="text-green-600">Approved</div>
                </div>
                <div className="bg-red-50 rounded-lg p-2">
                  <div className="font-bold text-red-700">{metrics.rejected}</div>
                  <div className="text-red-600">Rejected</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface CustomerRequestMetrics {
  totalHandled: number
  handledThisPeriod: number
  approved: number
  rejected: number
  avgHandlingTimeHours: number
}

function CustomerRequestsCard({ metrics, changes }: { metrics: CustomerRequestMetrics | null; changes: { hours: number; percent: number } | null }) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-b from-indigo-50/50 to-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-indigo-100/80 to-indigo-50/50 border-b border-indigo-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500 shadow-sm">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-indigo-900">Customer Requests</h3>
            <p className="text-xs text-indigo-700/80">User additions & POC changes</p>
          </div>
        </div>
      </div>

      {!metrics ? (
        <EmptyState icon={Users} label="No customer requests handled yet" />
      ) : (
        <div className="p-5 space-y-5">
          {/* Key Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              value={formatHours(metrics.avgHandlingTimeHours)}
              label="Avg Response Time"
              icon={Clock}
              change={changes ?? undefined}
              inverseColors
            />
            <StatCard
              value={metrics.handledThisPeriod.toString()}
              label="Handled (Period)"
              icon={CheckCircle2}
              colorClass="text-indigo-600"
            />
          </div>

          {/* Request Summary */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <Building className="h-3.5 w-3.5" />
              Request Activity
            </div>
            <div className="bg-white rounded-lg border border-slate-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total Handled</span>
                <span className="text-lg font-bold text-indigo-600">{metrics.totalHandled}</span>
              </div>
              <ProgressBar
                value={metrics.approved}
                total={metrics.totalHandled}
                color="bg-indigo-500"
              />
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="bg-green-50 rounded-lg p-2">
                  <div className="font-bold text-green-700">{metrics.approved}</div>
                  <div className="text-green-600">Approved</div>
                </div>
                <div className="bg-red-50 rounded-lg p-2">
                  <div className="font-bold text-red-700">{metrics.rejected}</div>
                  <div className="text-red-600">Rejected</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
