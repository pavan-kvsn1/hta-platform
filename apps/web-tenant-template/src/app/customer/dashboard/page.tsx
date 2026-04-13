import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { DashboardClient } from './components/DashboardClient'

export default async function CustomerDashboard() {
  const session = await auth()

  if (!session?.user || session.user.role !== 'CUSTOMER') {
    redirect('/customer/login')
  }

  return <DashboardClient />
}
