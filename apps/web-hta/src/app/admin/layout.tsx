import { redirect } from 'next/navigation'
import { auth, canAccessAdmin, isMasterAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminLayoutWrapper } from '@/components/admin/AdminLayoutWrapper'

// Render at runtime, not build time (needs database)
export const dynamic = 'force-dynamic'

async function getSidebarBadges(isMaster: boolean) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const thirtyDaysFromNow = new Date(today)
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

  // Worker admins don't need request count (can't access that page)
  const [pendingCustomerRequests, pendingInternalRequests, expiredInstruments, expiringInstruments, pendingAuthorizations] = await Promise.all([
    isMaster ? prisma.customerRequest.count({ where: { status: 'PENDING' } }) : Promise.resolve(0),
    isMaster ? prisma.internalRequest.count({ where: { status: 'PENDING' } }) : Promise.resolve(0),
    prisma.masterInstrument.count({
      where: {
        isActive: true,
        calibrationDueDate: { lt: today },
      },
    }),
    prisma.masterInstrument.count({
      where: {
        isActive: true,
        calibrationDueDate: { gte: today, lte: thirtyDaysFromNow },
      },
    }),
    prisma.certificate.count({ where: { status: 'PENDING_ADMIN_AUTHORIZATION' } }),
  ])

  return {
    pendingRequests: pendingCustomerRequests + pendingInternalRequests,
    instrumentAlerts: expiredInstruments + expiringInstruments,
    pendingAuthorizations,
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Redirect non-authenticated users to login
  if (!session?.user) {
    redirect('/login')
  }

  // Check if user can access admin (ADMIN role OR user with isAdmin flag for legacy)
  if (!canAccessAdmin(session.user)) {
    redirect('/dashboard')
  }

  // Determine admin type
  const isMaster = isMasterAdmin(session.user)
  const adminType = session.user.adminType as 'MASTER' | 'WORKER' | null

  const badges = await getSidebarBadges(isMaster)

  return (
    <div className="h-screen bg-slate-100 overflow-hidden">
      {/* Sidebar */}
      <AdminSidebar
        userName={session.user.name}
        userEmail={session.user.email}
        pendingRequests={badges.pendingRequests}
        instrumentAlerts={badges.instrumentAlerts}
        pendingAuthorizations={badges.pendingAuthorizations}
        adminType={adminType}
      />

      {/* Main Content - margin adjusts based on sidebar state */}
      <AdminLayoutWrapper>
        {children}
      </AdminLayoutWrapper>
    </div>
  )
}
