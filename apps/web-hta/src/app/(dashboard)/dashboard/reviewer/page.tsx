import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
// Render at runtime, not build time (needs auth)
export const dynamic = 'force-dynamic'
import { ReviewerDashboardClient } from './ReviewerDashboardClient'

export default async function ReviewerDashboard() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Only engineers and admins can be reviewers
  if (session.user.role !== 'ENGINEER' && session.user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  return <ReviewerDashboardClient />
}
