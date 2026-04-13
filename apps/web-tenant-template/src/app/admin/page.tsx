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
  // Cache admin dashboard stats for 1 minute - data changes frequently
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
    // Requests
    pendingUserRequests,
    pendingSectionUnlocks,

    // Certificates
    pendingReviewCerts,
    pendingAuthorizationCerts,

    // Instruments
    expiredInstruments,
    expiringInstruments,

    // Pipeline counts
    draftCerts,
    inReviewCerts,
    inReviewSlowCerts,
    inReviewStuckCerts,
    inCustomerCerts,
    inCustomerSlowCerts,
    inCustomerStuckCerts,
    pendingAuthCerts,
    completedThisWeek,

    // Recent certificates with activity
    recentCertificates,
  ] = await Promise.all([
    // Pending user/customer requests
    prisma.customerRequest.count({ where: { status: 'PENDING' } }),

    // Pending section unlock requests
    prisma.internalRequest.count({ where: { type: 'SECTION_UNLOCK', status: 'PENDING' } }),

    // Certificates pending review
    prisma.certificate.count({
      where: { status: 'PENDING_REVIEW' },
    }),

    // Certificates pending authorization
    prisma.certificate.count({
      where: { status: 'PENDING_AUTHORIZATION' },
    }),

    // Expired instruments
    prisma.masterInstrument.count({
      where: {
        isActive: true,
        calibrationDueDate: { lt: today },
      },
    }),

    // Expiring within 30 days
    prisma.masterInstrument.count({
      where: {
        isActive: true,
        calibrationDueDate: { gte: today, lte: thirtyDaysFromNow },
      },
    }),

    // Pipeline: Draft
    prisma.certificate.count({
      where: { status: 'DRAFT' },
    }),

    // Pipeline: In Review (total)
    prisma.certificate.count({
      where: { status: 'PENDING_REVIEW' },
    }),

    // Pipeline: In Review > 24h
    prisma.certificate.count({
      where: {
        status: 'PENDING_REVIEW',
        updatedAt: { lt: twentyFourHoursAgo, gte: fortyEightHoursAgo },
      },
    }),

    // Pipeline: In Review > 48h (stuck)
    prisma.certificate.count({
      where: {
        status: 'PENDING_REVIEW',
        updatedAt: { lt: fortyEightHoursAgo },
      },
    }),

    // Pipeline: Customer stage (total)
    prisma.certificate.count({
      where: { status: 'PENDING_CUSTOMER_APPROVAL' },
    }),

    // Pipeline: Customer > 24h
    prisma.certificate.count({
      where: {
        status: 'PENDING_CUSTOMER_APPROVAL',
        updatedAt: { lt: twentyFourHoursAgo, gte: fortyEightHoursAgo },
      },
    }),

    // Pipeline: Customer > 48h (stuck)
    prisma.certificate.count({
      where: {
        status: 'PENDING_CUSTOMER_APPROVAL',
        updatedAt: { lt: fortyEightHoursAgo },
      },
    }),

    // Pipeline: Pending Authorization
    prisma.certificate.count({
      where: { status: 'PENDING_AUTHORIZATION' },
    }),

    // Completed this week
    prisma.certificate.count({
      where: {
        status: 'AUTHORIZED',
        updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),

    // Recent certificates with events for live feed
    prisma.certificate.findMany({
      where: {
        updatedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }, // Last 48 hours
      },
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
            user: {
              select: { name: true },
            },
            customer: {
              select: { name: true },
            },
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
    { ttl: CacheTTL.SHORT } // 1 minute - dashboard data changes frequently
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
    <div className="h-full bg-slate-100">
      <div className="h-full flex flex-col bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-300 px-3 py-3">
          <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">System overview</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-3 space-y-4 bg-section-inner">
          {/* Needs Your Attention */}
          {hasAttentionItems && (
            <div className="rounded-lg border border-slate-300 overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-red-500">
                <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Needs Your Attention
                </h2>
              </div>
              <div className="p-4 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                  {/* Requests Card */}
                  <div className="rounded-lg border border-amber-700 bg-amber-50/50 shadow-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Requests</h3>
                    <div className="flex gap-3">
                      <div className="flex-1 bg-amber-100 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-amber-900">
                          {stats.requests.userApprovals}
                        </div>
                        <div className="text-xs text-amber-700 mt-0.5">User Approve</div>
                      </div>
                      <div className="flex-1 bg-indigo-100 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-indigo-900">
                          {stats.requests.sectionUnlocks}
                        </div>
                        <div className="text-xs text-indigo-700 mt-0.5">Section Unlock</div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-3">Internal requests</p>
                    <Link
                      href="/admin/requests"
                      className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 mt-2"
                    >
                      View All <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>

                  {/* Certificates Card */}
                  <div className="rounded-lg border border-blue-700 bg-blue-50/50 shadow-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Certificates</h3>
                    <div className="flex gap-3">
                      <div className="flex-1 bg-blue-100 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-blue-900">
                          {stats.certificates.pendingReview}
                        </div>
                        <div className="text-xs text-blue-700 mt-0.5">Review Pending</div>
                      </div>
                      <div className="flex-1 bg-green-100 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-green-900">
                          {stats.certificates.pendingAuthorization}
                        </div>
                        <div className="text-xs text-green-700 mt-0.5">Auth Pending</div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-3">Certificate workflow</p>
                    <Link
                      href="/admin/certificates"
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 mt-2"
                    >
                      View All <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>

                  {/* Instruments Card */}
                  <div className="rounded-lg border border-purple-700 bg-purple-50/50 shadow-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Instruments</h3>
                    <div className="flex gap-3">
                      <div className="flex-1 bg-red-100 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-red-900">
                          {stats.instruments.expired}
                        </div>
                        <div className="text-xs text-red-700 mt-0.5">Expired</div>
                      </div>
                      <div className="flex-1 bg-amber-100 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-amber-900">
                          {stats.instruments.expiringSoon}
                        </div>
                        <div className="text-xs text-amber-700 mt-0.5">Expiring Soon</div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-3">Calibration status</p>
                    <Link
                      href="/admin/instruments"
                      className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-700 mt-2"
                    >
                      View All <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>

                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>&gt;24h = slow</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                    <span>&gt;48h = stuck</span>
                </div>
              </div>
              </div>
            </div>
          )}

          {/* Certificate Pipeline */}
          <div className="rounded-lg border border-slate-300 overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-primary">
              <h2 className="font-semibold text-primary-foreground text-sm">Certificate Pipeline</h2>
            </div>
            <div className="p-4 bg-white">
              <div className="flex items-center justify-between gap-2">
                {/* Draft */}
                <div className="flex-1 text-center border border-slate-300 overflow-hidden shadow-sm rounded-sm">
                  <div className="text-xs font-medium text-slate-500 mb-2 pt-5">Draft</div>
                  <div className="bg-slate-100 rounded-lg p-2">
                    <div className="text-3xl font-bold text-slate-700 pb-5">{stats.pipeline.draft}</div>
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />

                {/* Review */}
                <div className="flex-1 text-center border border-slate-300 overflow-hidden shadow-sm rounded-sm">
                  <div className="text-xs font-medium text-slate-500 mb-2 pt-5">Review</div>
                  <div
                    className={`rounded-lg p-2 border ${
                      stats.pipeline.review.stuck > 0
                        ? 'bg-red-50 border-red-200'
                        : stats.pipeline.review.slow > 0
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-slate-100'
                    }`}
                  >
                    <div className="text-3xl font-bold text-slate-700 pb-5">
                      {stats.pipeline.review.total}
                    </div>
                    {stats.pipeline.review.stuck > 0 && (
                      <div className="text-xs text-red-600 mt-1 flex items-center justify-center gap-1">
                        <XCircle className="w-3 h-3" />
                        {stats.pipeline.review.stuck} stuck
                      </div>
                    )}
                    {stats.pipeline.review.slow > 0 && stats.pipeline.review.stuck === 0 && (
                      <div className="text-xs text-amber-600 mt-1 flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" />
                        {stats.pipeline.review.slow} slow
                      </div>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />

                {/* Customer */}
                <div className="flex-1 text-center border border-slate-300 overflow-hidden shadow-sm rounded-sm">
                  <div className="text-xs font-medium text-slate-500 mb-2 pt-5">Customer</div>
                  <div
                    className={`rounded-lg p-2 border ${
                      stats.pipeline.customer.stuck > 0
                        ? 'bg-red-50 border-red-200'
                        : stats.pipeline.customer.slow > 0
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-slate-100'
                    }`}
                  >
                    <div className="text-3xl font-bold text-slate-700 pb-5">
                      {stats.pipeline.customer.total}
                    </div>
                    {stats.pipeline.customer.stuck > 0 && (
                      <div className="text-xs text-red-600 mt-1 flex items-center justify-center gap-1">
                        <XCircle className="w-3 h-3" />
                        {stats.pipeline.customer.stuck} stuck
                      </div>
                    )}
                    {stats.pipeline.customer.slow > 0 && stats.pipeline.customer.stuck === 0 && (
                      <div className="text-xs text-amber-600 mt-1 flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" />
                        {stats.pipeline.customer.slow} slow
                      </div>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />

                {/* Authorization */}
                <div className="flex-1 text-center border border-slate-300 overflow-hidden shadow-sm rounded-sm">
                  <div className="text-xs font-medium text-slate-500 mb-2 pt-5">Authorization</div>
                  <div className="bg-blue-50 border rounded-lg p-2">
                    <div className="text-3xl font-bold text-blue-700 pb-5">
                      {stats.pipeline.authorization}
                    </div>
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />

                {/* Done */}
                <div className="flex-1 text-center border border-slate-300 overflow-hidden shadow-sm rounded-sm">
                  <div className="text-xs font-medium text-slate-500 mb-2 pt-2">Done</div>
                  <div className="bg-green-50 border rounded-lg p-2">
                    <div className="text-3xl font-bold text-green-700 pb-2">
                      {stats.pipeline.completedThisWeek}
                    </div>
                    <div className="text-xs text-green-600 mt-1">this week</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Feed + Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Live Feed */}
            <div className="rounded-lg border border-slate-300 overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-primary flex items-center justify-between">
                <h2 className="font-semibold text-primary-foreground text-sm">Live Feed</h2>
                <span className="text-xs text-primary-foreground/70">Last 48h</span>
              </div>
              <div className="bg-white max-h-[400px] overflow-y-auto">
                <LiveFeedCard certificates={stats.recentCertificates} />
              </div>
            </div>

            {/* Quick Actions */}
            <div className="rounded-lg border border-slate-300 overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-primary">
                <h2 className="font-semibold text-primary-foreground text-sm">Quick Actions</h2>
              </div>
              <div className="p-4 bg-white">
                <div className="grid grid-cols-2 gap-3">
                  <Link
                    href="/admin/users/new"
                    className="flex items-center justify-center gap-3 px-4 py-6 bg-blue-50 hover:bg-blue-100 rounded-lg text-sm font-semibold text-blue-700 transition-colors border border-blue-200"
                  >
                    <UserPlus className="w-6 h-6" />
                    + User
                  </Link>
                  <Link
                    href="/admin/customers/new"
                    className="flex items-center justify-center gap-3 px-4 py-6 bg-green-50 hover:bg-green-100 rounded-lg text-sm font-semibold text-green-700 transition-colors border border-green-200"
                  >
                    <Building2 className="w-6 h-6" />
                    + Customer
                  </Link>
                  <Link
                    href="/admin/authorization"
                    className="flex items-center justify-center gap-3 px-4 py-6 bg-amber-50 hover:bg-amber-100 rounded-lg text-sm font-semibold text-amber-700 transition-colors border border-amber-200"
                  >
                    <ShieldCheck className="w-6 h-6" />
                    Authorize
                  </Link>
                  <Link
                    href="/admin/analytics"
                    className="flex items-center justify-center gap-3 px-4 py-6 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-sm font-semibold text-indigo-700 transition-colors border border-indigo-200"
                  >
                    <BarChart3 className="w-6 h-6" />
                    Analytics
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
