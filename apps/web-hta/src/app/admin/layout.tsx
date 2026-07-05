import { redirect } from 'next/navigation'
import { auth, canAccessAdmin, isMasterAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminLayoutWrapper } from '@/components/admin/AdminLayoutWrapper'
import { cached, CacheTTL } from '@/lib/cache'

// Render at runtime, not build time (needs database)
export const dynamic = 'force-dynamic'

async function getSidebarBadges(isMaster: boolean) {
  return cached(`admin:sidebar-badges:${isMaster ? 'master' : 'worker'}`, async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const thirtyDaysFromNow = new Date(today)
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

    // Keep these sequential to avoid opening several Cloud SQL connections for every admin page render.
    const pendingCustomerRequests = isMaster
      ? await prisma.customerRequest.count({ where: { status: 'PENDING' } })
      : 0
    const pendingInternalRequests = isMaster
      ? await prisma.internalRequest.count({ where: { status: 'PENDING' } })
      : 0
    const expiredInstruments = await prisma.masterInstrument.count({
      where: {
        isActive: true,
        calibrationDueDate: { lt: today },
      },
    })
    const expiringInstruments = await prisma.masterInstrument.count({
      where: {
        isActive: true,
        calibrationDueDate: { gte: today, lte: thirtyDaysFromNow },
      },
    })
    const pendingAuthorizations = await prisma.certificate.count({ where: { status: 'PENDING_ADMIN_AUTHORIZATION' } })

    return {
      pendingRequests: pendingCustomerRequests + pendingInternalRequests,
      instrumentAlerts: expiredInstruments + expiringInstruments,
      pendingAuthorizations,
    }
  }, { ttl: CacheTTL.SHORT })
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
