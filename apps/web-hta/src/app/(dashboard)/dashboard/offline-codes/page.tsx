import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { OfflineCodesClient } from './OfflineCodesClient'

export const dynamic = 'force-dynamic'

export default async function OfflineCodesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Only engineers and admins can access
  if (session.user.role !== 'ENGINEER' && session.user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  return <OfflineCodesClient />
}
