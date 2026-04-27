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
  Clock,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { LiveFeedCard } from '@/components/admin/LiveFeedCard'

export const dynamic = 'force-dynamic'

async function getAdminStats() {
  return cached(
    CacheKeys.adminDashboard(),
    async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const thirtyDaysFromNow = new Date(today)
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

      const fortyEightHoursAgo = new Date()
      fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48)

      const twentyFourHoursAgo = new Date()
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

      const [
        pendingUserRequests,
        pendingSectionUnlocks,
        pendingReviewCerts,
        pendingAuthorizationCerts,
        expiredInstruments,
        expiringInstruments,
        draftCerts,
        inReviewCerts,
        inReviewSlowCerts,
        inReviewStuckCerts,
        inCustomerCerts,
        inCustomerSlowCerts,
        inCustomerStuckCerts,
        pendingAuthCerts,
        completedThisWeek,
        recentCertificates,
      ] = await Promise.all([
        prisma.customerRequest.count({ where: { status: 'PENDING' } }),
        prisma.internalRequest.count({ where: { type: 'SECTION_UNLOCK', status: 'PENDING' } }),
        prisma.certificate.count({ where: { status: 'PENDING_REVIEW' } }),
        prisma.certificate.count({ where: { status: 'PENDING_AUTHORIZATION' } }),
        prisma.masterInstrument.count({
          where: { isActive: true, calibrationDueDate: { lt: today } },
        }),
        prisma.masterInstrument.count({
          where: { isActive: true, calibrationDueDate: { gte: today, lte: thirtyDaysFromNow } },
        }),
        prisma.certificate.count({ where: { status: 'DRAFT' } }),
        prisma.certificate.count({ where: { status: 'PENDING_REVIEW' } }),
        prisma.certificate.count({
          where: {
            status: 'PENDING_REVIEW',
            updatedAt: { lt: twentyFourHoursAgo, gte: fortyEightHoursAgo },
          },
        }),
        prisma.certificate.count({
          where: { status: 'PENDING_REVIEW', updatedAt: { lt: fortyEightHoursAgo } },
        }),
        prisma.certificate.count({ where: { status: 'PENDING_CUSTOMER_APPROVAL' } }),
        prisma.certificate.count({
          where: {
            status: 'PENDING_CUSTOMER_APPROVAL',
            updatedAt: { lt: twentyFourHoursAgo, gte: fortyEightHoursAgo },
          },
        }),
        prisma.certificate.count({
          where: { status: 'PENDING_CUSTOMER_APPROVAL', updatedAt: { lt: fortyEightHoursAgo } },
        }),
        prisma.certificate.count({ where: { status: 'PENDING_AUTHORIZATION' } }),
        prisma.certificate.count({
          where: {
            status: 'AUTHORIZED',
            updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        }),
        prisma.certificate.findMany({
          where: { updatedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
          orderBy: { updatedAt: 'desc' },
          take: 6,
          select: {
            id: true,
            certificateNumber: true,
            customerName: true,
            status: true,
            events: {
              where: {
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
                    'SECTION_UNLOCK_REQUESTED',
                    'SECTION_UNLOCK_APPROVED',
                  ],
                },
              },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                eventType: true,
                createdAt: true,
                userRole: true,
                user: { select: { name: true } },
                customer: { select: { name: true } },
              },
            },
          },
        }),
      ])

      return {
        requests: {
          userApprovals: pendingUserRequests,
          sectionUnlocks: pendingSectionUnlocks,
        },
        certificates: {
          pendingReview: pendingReviewCerts,
          pendingAuthorization: pendingAuthorizationCerts,
        },
        instruments: {
          expired: expiredInstruments,
          expiringSoon: expiringInstruments,
        },
        pipeline: {
          draft: draftCerts,
          review: {
            total: inReviewCerts,
            slow: inReviewSlowCerts,
            stuck: inReviewStuckCerts,
          },
          customer: {
            total: inCustomerCerts,
            slow: inCustomerSlowCerts,
            stuck: inCustomerStuckCerts,
          },
          authorization: pendingAuthCerts,
          completedThisWeek,
        },
        recentCertificates: recentCertificates.map((cert) => ({
          id: cert.id,
          certificateNumber: cert.certificateNumber,
          customerName: cert.customerName,
          status: cert.status,
          events: cert.events.map((e) => ({
            id: e.id,
            eventType: e.eventType,
            createdAt: e.createdAt.toISOString(),
            userName: e.user?.name || e.customer?.name || null,
            userRole: e.userRole,
          })),
        })),
      }
    },
    { ttl: CacheTTL.SHORT }
  )
}

export default async function AdminDashboard() {
  const stats = await getAdminStats()

  const hasAttentionItems =
    stats.requests.userApprovals > 0 ||
    stats.requests.sectionUnlocks > 0 ||
    stats.certificates.pendingReview > 0 ||
    stats.certificates.pendingAuthorization > 0 ||
    stats.instruments.expired > 0 ||
    stats.instruments.expiringSoon > 0

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
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="size-4 text-[#dc2626]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#dc2626]">
                Needs Your Attention
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Requests */}
              <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-4">
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
                <div className="flex gap-3">
                  <div className="flex-1 bg-[#fffbeb] border border-[#fde68a] rounded-xl p-3 text-center">
                    <div className="text-[22px] font-bold text-[#92400e]">
                      {stats.requests.userApprovals}
                    </div>
                    <div className="text-[10px] font-medium text-[#d97706] mt-0.5">
                      User Approvals
                    </div>
                  </div>
                  <div className="flex-1 bg-[#eef2ff] border border-[#c7d2fe] rounded-xl p-3 text-center">
                    <div className="text-[22px] font-bold text-[#3730a3]">
                      {stats.requests.sectionUnlocks}
                    </div>
                    <div className="text-[10px] font-medium text-[#4f46e5] mt-0.5">
                      Section Unlocks
                    </div>
                  </div>
                </div>
              </div>

              {/* Certificates */}
              <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-4">
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
                <div className="flex gap-3">
                  <div className="flex-1 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-3 text-center">
                    <div className="text-[22px] font-bold text-[#1e40af]">
                      {stats.certificates.pendingReview}
                    </div>
                    <div className="text-[10px] font-medium text-[#2563eb] mt-0.5">
                      Review Pending
                    </div>
                  </div>
                  <div className="flex-1 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-3 text-center">
                    <div className="text-[22px] font-bold text-[#166534]">
                      {stats.certificates.pendingAuthorization}
                    </div>
                    <div className="text-[10px] font-medium text-[#16a34a] mt-0.5">
                      Auth Pending
                    </div>
                  </div>
                </div>
              </div>

              {/* Instruments */}
              <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-4">
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
                <div className="flex gap-3">
                  <div className="flex-1 bg-[#fef2f2] border border-[#fecaca] rounded-xl p-3 text-center">
                    <div className="text-[22px] font-bold text-[#991b1b]">
                      {stats.instruments.expired}
                    </div>
                    <div className="text-[10px] font-medium text-[#dc2626] mt-0.5">Expired</div>
                  </div>
                  <div className="flex-1 bg-[#fffbeb] border border-[#fde68a] rounded-xl p-3 text-center">
                    <div className="text-[22px] font-bold text-[#92400e]">
                      {stats.instruments.expiringSoon}
                    </div>
                    <div className="text-[10px] font-medium text-[#d97706] mt-0.5">
                      Expiring Soon
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Certificate Pipeline */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden mb-6">
          <div className="px-5 py-3.5 border-b border-[#f1f5f9]">
            <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
              Certificate Pipeline
            </span>
          </div>
          <div className="p-5">
            <div className="flex items-stretch gap-2">
              {/* Draft */}
              <div className="flex-1 text-center">
                <div className="bg-[#f8fafc] border border-[#f1f5f9] rounded-xl p-3 h-full flex flex-col justify-center">
                  <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">
                    Draft
                  </div>
                  <div className="text-[28px] font-bold text-[#64748b]">
                    {stats.pipeline.draft}
                  </div>
                </div>
              </div>

              <div className="flex items-center">
                <ChevronRight className="size-4 text-[#e2e8f0]" />
              </div>

              {/* Review */}
              <div className="flex-1 text-center">
                <div
                  className={`rounded-xl p-3 border h-full flex flex-col justify-center ${
                    stats.pipeline.review.stuck > 0
                      ? 'bg-[#fef2f2] border-[#fecaca]'
                      : stats.pipeline.review.slow > 0
                      ? 'bg-[#fffbeb] border-[#fde68a]'
                      : 'bg-[#eff6ff] border-[#bfdbfe]'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">
                    Review
                  </div>
                  <div className="text-[28px] font-bold text-[#0f172a]">
                    {stats.pipeline.review.total}
                  </div>
                  {stats.pipeline.review.stuck > 0 && (
                    <div className="text-[10px] font-medium text-[#dc2626] mt-1 flex items-center justify-center gap-1">
                      <XCircle className="size-3" />
                      {stats.pipeline.review.stuck} stuck
                    </div>
                  )}
                  {stats.pipeline.review.slow > 0 && stats.pipeline.review.stuck === 0 && (
                    <div className="text-[10px] font-medium text-[#d97706] mt-1 flex items-center justify-center gap-1">
                      <Clock className="size-3" />
                      {stats.pipeline.review.slow} slow
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center">
                <ChevronRight className="size-4 text-[#e2e8f0]" />
              </div>

              {/* Customer */}
              <div className="flex-1 text-center">
                <div
                  className={`rounded-xl p-3 border h-full flex flex-col justify-center ${
                    stats.pipeline.customer.stuck > 0
                      ? 'bg-[#fef2f2] border-[#fecaca]'
                      : stats.pipeline.customer.slow > 0
                      ? 'bg-[#fffbeb] border-[#fde68a]'
                      : 'bg-[#faf5ff] border-[#e9d5ff]'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">
                    Customer
                  </div>
                  <div className="text-[28px] font-bold text-[#0f172a]">
                    {stats.pipeline.customer.total}
                  </div>
                  {stats.pipeline.customer.stuck > 0 && (
                    <div className="text-[10px] font-medium text-[#dc2626] mt-1 flex items-center justify-center gap-1">
                      <XCircle className="size-3" />
                      {stats.pipeline.customer.stuck} stuck
                    </div>
                  )}
                  {stats.pipeline.customer.slow > 0 && stats.pipeline.customer.stuck === 0 && (
                    <div className="text-[10px] font-medium text-[#d97706] mt-1 flex items-center justify-center gap-1">
                      <Clock className="size-3" />
                      {stats.pipeline.customer.slow} slow
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center">
                <ChevronRight className="size-4 text-[#e2e8f0]" />
              </div>

              {/* Authorization */}
              <div className="flex-1 text-center">
                <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-3 h-full flex flex-col justify-center">
                  <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">
                    Authorization
                  </div>
                  <div className="text-[28px] font-bold text-[#1e40af]">
                    {stats.pipeline.authorization}
                  </div>
                </div>
              </div>

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
                <Clock className="size-3 text-[#d97706]" />
                <span>&gt;24h = slow</span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle className="size-3 text-[#dc2626]" />
                <span>&gt;48h = stuck</span>
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
              <LiveFeedCard certificates={stats.recentCertificates} />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#f1f5f9]">
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                Quick Actions
              </span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/admin/users/new"
                  className="flex items-center justify-center gap-2.5 px-4 py-5 bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#bfdbfe] rounded-xl text-[13px] font-semibold text-[#1e40af] transition-colors"
                >
                  <UserPlus className="size-5" />
                  + User
                </Link>
                <Link
                  href="/admin/customers/new"
                  className="flex items-center justify-center gap-2.5 px-4 py-5 bg-[#f0fdf4] hover:bg-[#dcfce7] border border-[#bbf7d0] rounded-xl text-[13px] font-semibold text-[#166534] transition-colors"
                >
                  <Building2 className="size-5" />
                  + Customer
                </Link>
                <Link
                  href="/admin/authorization"
                  className="flex items-center justify-center gap-2.5 px-4 py-5 bg-[#fffbeb] hover:bg-[#fef3c7] border border-[#fde68a] rounded-xl text-[13px] font-semibold text-[#92400e] transition-colors"
                >
                  <ShieldCheck className="size-5" />
                  Authorize
                </Link>
                <Link
                  href="/admin/analytics"
                  className="flex items-center justify-center gap-2.5 px-4 py-5 bg-[#eef2ff] hover:bg-[#e0e7ff] border border-[#c7d2fe] rounded-xl text-[13px] font-semibold text-[#3730a3] transition-colors"
                >
                  <BarChart3 className="size-5" />
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
