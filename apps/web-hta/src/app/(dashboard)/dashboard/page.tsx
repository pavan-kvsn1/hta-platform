import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
// Render at runtime, not build time (needs auth)
export const dynamic = 'force-dynamic'
import { EngineerDashboardClient } from './EngineerDashboardClient'

export default async function EngineerDashboard() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Redirect Admin users to admin dashboard
  if (session.user.role === 'ADMIN') {
    redirect('/admin')
  }

  // Redirect Customer users to customer dashboard
  if (session.user.role === 'CUSTOMER') {
    redirect('/customer/dashboard')
  }

  return <EngineerDashboardClient />
}
