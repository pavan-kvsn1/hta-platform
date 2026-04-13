import { redirect } from 'next/navigation'
import { auth, isMasterAdmin } from '@/lib/auth'

/**
 * Layout for /admin/registrations/* routes
 * Requires Master Admin access
 */
export default async function RegistrationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Parent layout handles basic admin check
  // This layout adds Master Admin requirement
  if (!session?.user || !isMasterAdmin(session.user)) {
    redirect('/admin')
  }

  return <>{children}</>
}
