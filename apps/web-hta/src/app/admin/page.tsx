import { prisma } from '@/lib/prisma'
import { cached, CacheKeys, CacheTTL } from '@/lib/cache'
import {
  Building2,
  UserPlus,
  ArrowRight,
  ShieldCheck,
  BarChart3,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import { LiveFeedCard } from '@/components/admin/LiveFeedCard'

export const dynamic = 'force-dynamic'

const PIPELINE_STAGES = [
  { key: 'draft', label: 'Draft', bg: 'bg-[#f8fafc]', border: 'border-[#e2e8f0]', numColor: 'text-[#64748b]', labelColor: 'text-[#94a3b8]' },
  { key: 'review', label: 'Review', bg: 'bg-[#eff6ff]', border: 'border-[#bfdbfe]', numColor: 'text-[#1e40af]', labelColor: 'text-[#2563eb]' },
  { key: 'revision', label: 'Revision', bg: 'bg-[#fff7ed]', border: 'border-[#fed7aa]', numColor: 'text-[#9a3412]', labelColor: 'text-[#ea580c]' },
  { key: 'customer', label: 'Customer', bg: 'bg-[#faf5ff]', border: 'border-[#e9d5ff]', numColor: 'text-[#6b21a8]', labelColor: 'text-[#9333ea]' },
  { key: 'customerRevision', label: 'Cust. Revis', bg: 'bg-[#fdf2f8]', border: 'border-[#fbcfe8]', numColor: 'text-[#9d174d]', labelColor: 'text-[#db2777]' },
  { key: 'authorization', label: 'Auth', bg: 'bg-[#eef2ff]', border: 'border-[#c7d2fe]', numColor: 'text-[#3730a3]', labelColor: 'text-[#4f46e5]' },
] as const

async function getAdminStats() {
  return cached(
    CacheKeys.adminDashboard(),
    async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const thirtyDaysFromNow = new Date(today)
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

      const eightHoursAgo = new Date()
      eightHoursAgo.setHours(eightHoursAgo.getHours() - 8)

      const twelveHoursAgo = new Date()
      twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12)

      const fortyFourHoursAgo = new Date()
      fortyFourHoursAgo.setHours(fortyFourHoursAgo.getHours() - 44)

      const fortyEightHoursAgo = new Date()
      fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48)

      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      const activeStatuses = [
        'DRAFT',
        'PENDING_REVIEW',
        'REVISION_REQUIRED',
        'PENDING_CUSTOMER_APPROVAL',
        'CUSTOMER_REVISION_REQUIRED',
        'PENDING_ADMIN_AUTHORIZATION',
        'CUSTOMER_REVIEW_EXPIRED',
      ]

      const [
        pendingSectionUnlocks,
        pendingFieldChanges,
        pendingUserAdditions,
        pendingPocChanges,
        pendingAccountDeletions,
        pendingDataExports,
        internalOverdue,
        internalApproaching,
        customerOverdue,
        customerApproaching,
        pipelineCounts,
        tatExceededCounts,
        tatApproachingCounts,
        expiredInstruments,
        expiringInstruments,
        completedThisWeek,
        recentCertificates,
      ] = await Promise.all([
        // Internal requests
        prisma.internalRequest.count({ where: { type: 'SECTION_UNLOCK', status: 'PENDING' } }),
        prisma.internalRequest.count({ where: { type: 'FIELD_CHANGE' as never, status: 'PENDING' } }),
        // Customer requests
        prisma.customerRequest.count({ where: { type: 'USER_ADDITION', status: 'PENDING' } }),
        prisma.customerRequest.count({ where: { type: 'POC_CHANGE', status: 'PENDING' } }),
        prisma.customerRequest.count({ where: { type: 'ACCOUNT_DELETION' as never, status: 'PENDING' } }),
        prisma.customerRequest.count({ where: { type: 'DATA_EXPORT' as never, status: 'PENDING' } }),
        // Internal requests: overdue (>12h) and approaching (8-12h)
        prisma.internalRequest.count({ where: { status: 'PENDING', createdAt: { lt: twelveHoursAgo } } }),
        prisma.internalRequest.count({ where: { status: 'PENDING', createdAt: { lt: eightHoursAgo, gte: twelveHoursAgo } } }),
        // Customer requests: overdue (>12h) and approaching (8-12h)
        prisma.customerRequest.count({ where: { status: 'PENDING', createdAt: { lt: twelveHoursAgo } } }),
        prisma.customerRequest.count({ where: { status: 'PENDING', createdAt: { lt: eightHoursAgo, gte: twelveHoursAgo } } }),
        // Pipeline: active certificate counts grouped by status
        prisma.certificate.groupBy({
          by: ['status'],
          where: { status: { in: activeStatuses } },
          _count: true,
        }),
        // Pipeline: TAT-exceeded counts (phase >12h OR total >48h)
        prisma.certificate.groupBy({
          by: ['status'],
          where: {
            status: { in: activeStatuses },
            OR: [
              { updatedAt: { lt: twelveHoursAgo } },
              { createdAt: { lt: fortyEightHoursAgo } },
            ],
          },
          _count: true,
        }),
        // Pipeline: approaching TAT (phase 8-12h OR total 44-48h, but not yet exceeded)
        prisma.certificate.groupBy({
          by: ['status'],
          where: {
            status: { in: activeStatuses },
            // Not yet exceeded: phase ≤12h AND total ≤48h
            updatedAt: { gte: twelveHoursAgo },
            createdAt: { gte: fortyEightHoursAgo },
            // But approaching: phase >8h OR total >44h
            OR: [
              { updatedAt: { lt: eightHoursAgo } },
              { createdAt: { lt: fortyFourHoursAgo } },
            ],
          },
          _count: true,
        }),
        // Instruments
        prisma.masterInstrument.count({
          where: { isActive: true, calibrationDueDate: { lt: today } },
        }),
        prisma.masterInstrument.count({
          where: { isActive: true, calibrationDueDate: { gte: today, lte: thirtyDaysFromNow } },
        }),
        // Completed this week
        prisma.certificate.count({
          where: { status: 'AUTHORIZED', updatedAt: { gte: oneWeekAgo } },
        }),
        // Live feed — flat event list with cert context + owner
        prisma.certificateEvent.findMany({
          where: {
            createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
            eventType: {
              in: [
                'CERTIFICATE_CREATED',
                'SUBMITTED_FOR_REVIEW',
                'REVIEWER_APPROVED',
                'REVIEWER_APPROVED_SENT_TO_CUSTOMER',
                'CUSTOMER_APPROVED',
                'ADMIN_AUTHORIZED',
                'REVISION_REQUESTED',
                'CUSTOMER_REVISION_REQUESTED',
                'CUSTOMER_REVISION_FORWARDED',
                'SECTION_UNLOCK_REQUESTED',
                'SECTION_UNLOCK_APPROVED',
                'SUBMITTED_FOR_AUTHORIZATION',
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            eventType: true,
            createdAt: true,
            userRole: true,
            certificate: {
              select: {
                id: true,
                certificateNumber: true,
                customerName: true,
                customerContactName: true,
                status: true,
                createdBy: { select: { name: true } },
                reviewer: { select: { name: true } },
              },
            },
          },
        }),
      ])

      // Helper to extract count from groupBy results
      const getStatusCount = (
        results: { status: string; _count: number }[],
        status: string
      ): number => {
        return results.find((r) => r.status === status)?._count || 0
      }

      const buildPipelineCounts = (results: { status: string; _count: number }[]) => ({
        draft: getStatusCount(results, 'DRAFT'),
        review: getStatusCount(results, 'PENDING_REVIEW'),
        revision: getStatusCount(results, 'REVISION_REQUIRED'),
        customer: getStatusCount(results, 'PENDING_CUSTOMER_APPROVAL'),
        customerRevision: getStatusCount(results, 'CUSTOMER_REVISION_REQUIRED'),
        authorization: getStatusCount(results, 'PENDING_ADMIN_AUTHORIZATION'),
      })

      const totalInternal = pendingSectionUnlocks + pendingFieldChanges
      const totalCustomer = pendingUserAdditions + pendingPocChanges + pendingAccountDeletions + pendingDataExports

      return {
        requests: {
          internal: {
            total: totalInternal,
            overdue: internalOverdue,
            approaching: internalApproaching,
          },
          customer: {
            total: totalCustomer,
            overdue: customerOverdue,
            approaching: customerApproaching,
          },
        },
        certificates: {
          pendingReview: {
            total: getStatusCount(pipelineCounts, 'PENDING_REVIEW'),
            overdue: getStatusCount(tatExceededCounts, 'PENDING_REVIEW'),
            approaching: getStatusCount(tatApproachingCounts, 'PENDING_REVIEW'),
          },
          pendingAuthorization: {
            total: getStatusCount(pipelineCounts, 'PENDING_ADMIN_AUTHORIZATION'),
            overdue: getStatusCount(tatExceededCounts, 'PENDING_ADMIN_AUTHORIZATION'),
            approaching: getStatusCount(tatApproachingCounts, 'PENDING_ADMIN_AUTHORIZATION'),
          },
        },
        instruments: {
          expired: expiredInstruments,
          expiringSoon: expiringInstruments,
        },
        pipeline: {
          current: buildPipelineCounts(pipelineCounts),
          exceeded: buildPipelineCounts(tatExceededCounts),
          approaching: buildPipelineCounts(tatApproachingCounts),
          completedThisWeek,
        },
        recentEvents: recentCertificates.map((evt) => {
          const cert = evt.certificate
          // Determine current owner based on status
          const STATUS_OWNER: Record<string, string> = {
            DRAFT: cert.createdBy?.name || 'Engineer',
            REVISION_REQUIRED: cert.createdBy?.name || 'Engineer',
            PENDING_REVIEW: cert.reviewer?.name || 'Reviewer',
            PENDING_CUSTOMER_APPROVAL: cert.customerContactName || 'Customer',
            CUSTOMER_REVISION_REQUIRED: cert.customerContactName || 'Customer',
            PENDING_ADMIN_AUTHORIZATION: 'Admin',
            AUTHORIZED: 'Admin',
            CUSTOMER_REVIEW_EXPIRED: 'Reviewer',
          }
          return {
            id: evt.id,
            eventType: evt.eventType,
            createdAt: evt.createdAt.toISOString(),
            certificateId: cert.id,
            certificateNumber: cert.certificateNumber,
            customerName: cert.customerName,
            status: cert.status,
            ownerName: STATUS_OWNER[cert.status] || 'Unknown',
          }
        }),
      }
    },
    { ttl: CacheTTL.SHORT }
  )
}

export default async function AdminDashboard() {
  const stats = await getAdminStats()

  const hasAttentionItems =
    stats.requests.internal.total > 0 ||
    stats.requests.customer.total > 0 ||
    stats.certificates.pendingReview.total > 0 ||
    stats.certificates.pendingAuthorization.total > 0 ||
    stats.instruments.expired > 0 ||
    stats.instruments.expiringSoon > 0

  const hasExceededTAT = Object.values(stats.pipeline.exceeded).some((v) => v > 0)

  return (
    <div className="h-full overflow-auto">
      <div className="px-6 sm:px-9 py-8">
        {/* Header */}
        <div className="mb-7">
          <h1 className="text-[26px] font-extrabold tracking-tight text-[#0f172a]">
            Admin Dashboard
          </h1>
          <p className="text-[13px] text-[#94a3b8] mt-1">System overview and management</p>
        </div>

        {/* Needs Your Attention */}
        {hasAttentionItems && (
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden mb-6">
            {/* Section header inside card */}
            <div className="px-5 py-3 border-b border-[#fecaca] bg-[#fef2f2] flex items-center gap-2">
              <AlertCircle className="size-4 text-[#dc2626]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#dc2626]">
                Needs Your Attention
              </span>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Requests */}
                <div className="border border-[#e2e8f0] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                      Requests
                    </span>
                    <Link
                      href="/admin/requests"
                      className="text-[11px] font-semibold text-[#d97706] hover:text-[#b45309] flex items-center gap-0.5"
                    >
                      View <ArrowRight className="size-3" />
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { data: stats.requests.internal, label: 'Internal', href: '/admin/requests?tab=internal', numColor: 'text-[#3730a3]', labelColor: 'text-[#4f46e5]', bg: 'bg-[#eef2ff]', border: 'border-[#c7d2fe]', hoverBorder: 'hover:border-[#a5b4fc]' },
                      { data: stats.requests.customer, label: 'Customer', href: '/admin/requests?tab=customer', numColor: 'text-[#6b21a8]', labelColor: 'text-[#9333ea]', bg: 'bg-[#faf5ff]', border: 'border-[#e9d5ff]', hoverBorder: 'hover:border-[#d8b4fe]' },
                    ].map((item) => {
                      const { total, overdue, approaching } = item.data
                      const onTime = total - overdue - approaching
                      const pO = total > 0 ? Math.round((overdue / total) * 100) : 0
                      const pA = total > 0 ? Math.round((approaching / total) * 100) : 0
                      const pG = total > 0 ? 100 - pO - pA : 0
                      return (
                        <Link key={item.label} href={item.href} className={`${item.bg} border ${item.border} rounded-xl p-3.5 text-center ${item.hoverBorder} transition-colors`}>
                          <div className={`text-[25px] font-bold ${item.numColor}`}>{total}</div>
                          <div className={`text-[11.5px] font-medium ${item.labelColor} mt-0.5`}>{item.label}</div>
                          <div className="mt-2.5 h-[7px] rounded-full bg-white/60 overflow-hidden">
                            {total > 0 && (
                              <div className="h-full flex">
                                {overdue > 0 && <div className="bg-[#ef4444] h-full" style={{ width: `${pO}%` }} />}
                                {approaching > 0 && <div className="bg-[#f59e0b] h-full" style={{ width: `${pA}%` }} />}
                                {onTime > 0 && <div className="bg-[#22c55e] h-full" style={{ width: `${pG}%` }} />}
                              </div>
                            )}
                          </div>
                          {(overdue > 0 || approaching > 0) && (
                            <div className="flex items-center justify-center gap-2 mt-2">
                              {overdue > 0 && <span className="text-[11.5px] font-semibold text-[#dc2626]">{overdue} overdue</span>}
                              {approaching > 0 && <span className="text-[11.5px] font-semibold text-[#d97706]">{approaching} soon</span>}
                            </div>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </div>

                {/* Certificates */}
                <div className="border border-[#e2e8f0] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                      Certificates
                    </span>
                    <Link
                      href="/admin/certificates"
                      className="text-[11px] font-semibold text-[#2563eb] hover:text-[#1d4ed8] flex items-center gap-0.5"
                    >
                      View <ArrowRight className="size-3" />
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { data: stats.certificates.pendingReview, label: 'Review Pending', numColor: 'text-[#1e40af]', labelColor: 'text-[#2563eb]', bg: 'bg-[#eff6ff]', border: 'border-[#bfdbfe]' },
                      { data: stats.certificates.pendingAuthorization, label: 'Auth Pending', numColor: 'text-[#166534]', labelColor: 'text-[#16a34a]', bg: 'bg-[#f0fdf4]', border: 'border-[#bbf7d0]' },
                    ].map((item) => {
                      const { total, overdue, approaching } = item.data
                      const onTime = total - overdue - approaching
                      const pO = total > 0 ? Math.round((overdue / total) * 100) : 0
                      const pA = total > 0 ? Math.round((approaching / total) * 100) : 0
                      const pG = total > 0 ? 100 - pO - pA : 0
                      return (
                        <div key={item.label} className={`${item.bg} border ${item.border} rounded-xl p-3.5 text-center`}>
                          <div className={`text-[25px] font-bold ${item.numColor}`}>{total}</div>
                          <div className={`text-[11.5px] font-medium ${item.labelColor} mt-0.5`}>{item.label}</div>
                          <div className="mt-2.5 h-[7px] rounded-full bg-white/60 overflow-hidden">
                            {total > 0 && (
                              <div className="h-full flex">
                                {overdue > 0 && <div className="bg-[#ef4444] h-full" style={{ width: `${pO}%` }} />}
                                {approaching > 0 && <div className="bg-[#f59e0b] h-full" style={{ width: `${pA}%` }} />}
                                {onTime > 0 && <div className="bg-[#22c55e] h-full" style={{ width: `${pG}%` }} />}
                              </div>
                            )}
                          </div>
                          {(overdue > 0 || approaching > 0) && (
                            <div className="flex items-center justify-center gap-2 mt-2">
                              {overdue > 0 && <span className="text-[11.5px] font-semibold text-[#dc2626]">{overdue} overdue</span>}
                              {approaching > 0 && <span className="text-[11.5px] font-semibold text-[#d97706]">{approaching} soon</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Instruments */}
                <div className="border border-[#e2e8f0] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                      Instruments
                    </span>
                    <Link
                      href="/admin/instruments"
                      className="text-[11px] font-semibold text-[#7c3aed] hover:text-[#6d28d9] flex items-center gap-0.5"
                    >
                      View <ArrowRight className="size-3" />
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#fef2f2] border border-[#fecaca] rounded-xl p-3.5 text-center">
                      <div className="text-[25px] font-bold text-[#991b1b]">
                        {stats.instruments.expired}
                      </div>
                      <div className="text-[11.5px] font-medium text-[#dc2626] mt-0.5">Expired</div>
                      <div className="mt-2.5 h-[7px] rounded-full bg-white/60 overflow-hidden">
                        {stats.instruments.expired > 0 && <div className="bg-[#ef4444] h-full w-full rounded-full" />}
                      </div>
                    </div>
                    <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl p-3.5 text-center">
                      <div className="text-[25px] font-bold text-[#92400e]">
                        {stats.instruments.expiringSoon}
                      </div>
                      <div className="text-[11.5px] font-medium text-[#d97706] mt-0.5">Expiring Soon</div>
                      <div className="mt-2.5 h-[7px] rounded-full bg-white/60 overflow-hidden">
                        {stats.instruments.expiringSoon > 0 && <div className="bg-[#f59e0b] h-full w-full rounded-full" />}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Certificate Pipeline */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden mb-6">
          <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between">
            <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
              Certificate Pipeline
            </span>
            {(() => {
              const totalOverdue = Object.values(stats.pipeline.exceeded).reduce((a, b) => a + b, 0)
              return totalOverdue > 0 ? (
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#dc2626]">
                  <AlertTriangle className="size-3.5" />
                  {totalOverdue} overdue
                </div>
              ) : null
            })()}
          </div>
          <div className="p-5">
            <div className="flex items-stretch gap-2">
              {PIPELINE_STAGES.map((stage, i) => {
                const total = stats.pipeline.current[stage.key]
                const overdue = stats.pipeline.exceeded[stage.key]
                const approaching = stats.pipeline.approaching[stage.key]
                const onTime = total - overdue - approaching
                const pctOverdue = total > 0 ? Math.round((overdue / total) * 100) : 0
                const pctApproaching = total > 0 ? Math.round((approaching / total) * 100) : 0
                const pctOnTime = total > 0 ? 100 - pctOverdue - pctApproaching : 0

                return (
                  <div key={stage.key} className="contents">
                    <div className="flex-1 text-center">
                      <div className={`${stage.bg} border ${stage.border} rounded-xl p-3 h-full flex flex-col justify-center`}>
                        <div className={`text-[11px] font-bold uppercase tracking-[0.07em] ${stage.labelColor} mb-1`}>
                          {stage.label}
                        </div>
                        <div className={`text-[28px] font-bold ${stage.numColor}`}>
                          {total}
                        </div>
                        {/* Stacked bar: red (overdue) | orange (approaching) | green (on time) */}
                        <div className="mt-2 h-[6px] rounded-full bg-white/60 overflow-hidden">
                          {total > 0 && (
                            <div className="h-full flex">
                              {overdue > 0 && (
                                <div
                                  className="bg-[#ef4444] h-full"
                                  style={{ width: `${pctOverdue}%` }}
                                />
                              )}
                              {approaching > 0 && (
                                <div
                                  className="bg-[#f59e0b] h-full"
                                  style={{ width: `${pctApproaching}%` }}
                                />
                              )}
                              {onTime > 0 && (
                                <div
                                  className="bg-[#22c55e] h-full"
                                  style={{ width: `${pctOnTime}%` }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                        {(overdue > 0 || approaching > 0) && (
                          <div className="flex items-center justify-center gap-2 mt-1.5">
                            {overdue > 0 && (
                              <span className="text-[10px] font-semibold text-[#dc2626]">
                                {overdue} overdue
                              </span>
                            )}
                            {approaching > 0 && (
                              <span className="text-[10px] font-semibold text-[#d97706]">
                                {approaching} soon
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {i < PIPELINE_STAGES.length - 1 && (
                      <div className="flex items-center">
                        <ChevronRight className="size-4 text-[#e2e8f0]" />
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="flex items-center">
                <ChevronRight className="size-4 text-[#e2e8f0]" />
              </div>

              {/* Done */}
              <div className="flex-1 text-center">
                <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-3 h-full flex flex-col justify-center">
                  <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">
                    Done
                  </div>
                  <div className="text-[28px] font-bold text-[#16a34a]">
                    {stats.pipeline.completedThisWeek}
                  </div>
                  <div className="text-[10px] font-medium text-[#16a34a] mt-0.5">this week</div>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 pt-3 border-t border-[#f1f5f9] flex items-center gap-4 text-[11px] text-[#94a3b8]">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-[6px] rounded-full bg-[#ef4444]" />
                <span>Overdue (&gt;12h phase or &gt;48h total)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-[6px] rounded-full bg-[#f59e0b]" />
                <span>Approaching (&lt;4h left)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-[6px] rounded-full bg-[#22c55e]" />
                <span>On time</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Feed + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Live Feed */}
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                Live Feed
              </span>
              <span className="text-[11px] text-[#94a3b8]">Last 48h</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              <LiveFeedCard events={stats.recentEvents} />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#f1f5f9]">
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                Quick Actions
              </span>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-3.5">
                <Link
                  href="/admin/users/new"
                  className="flex items-center justify-center gap-3 px-5 py-6 bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#bfdbfe] rounded-xl text-[15px] font-semibold text-[#1e40af] transition-colors"
                >
                  <UserPlus className="size-6" />
                  + User
                </Link>
                <Link
                  href="/admin/customers/new"
                  className="flex items-center justify-center gap-3 px-5 py-6 bg-[#f0fdf4] hover:bg-[#dcfce7] border border-[#bbf7d0] rounded-xl text-[15px] font-semibold text-[#166534] transition-colors"
                >
                  <Building2 className="size-6" />
                  + Customer
                </Link>
                <Link
                  href="/admin/authorization"
                  className="flex items-center justify-center gap-3 px-5 py-6 bg-[#fffbeb] hover:bg-[#fef3c7] border border-[#fde68a] rounded-xl text-[15px] font-semibold text-[#92400e] transition-colors"
                >
                  <ShieldCheck className="size-6" />
                  Authorize
                </Link>
                <Link
                  href="/admin/analytics"
                  className="flex items-center justify-center gap-3 px-5 py-6 bg-[#eef2ff] hover:bg-[#e0e7ff] border border-[#c7d2fe] rounded-xl text-[15px] font-semibold text-[#3730a3] transition-colors"
                >
                  <BarChart3 className="size-6" />
                  Analytics
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
