import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CustomerSidebar } from '@/components/customer/CustomerSidebar'
import { CustomerLayoutWrapper } from '@/components/customer/CustomerLayoutWrapper'

// Render at runtime, not build time (needs database)
export const dynamic = 'force-dynamic'

async function getCustomerData(email: string) {
  const customer = await prisma.customerUser.findFirst({
    where: { email },
    include: {
      customerAccount: {
        include: {
          _count: {
            select: { users: true }
          }
        }
      }
    }
  })

  if (!customer) return null

  const isPrimaryPoc = customer.customerAccount?.primaryPocId === customer.id
  const companyName = customer.customerAccount?.companyName || customer.companyName || 'Company'
  const userCount = customer.customerAccount?._count?.users || 0

  return {
    isPrimaryPoc,
    companyName,
    userCount,
  }
}

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Redirect non-customers to appropriate login
  if (!session?.user) {
    redirect('/customer/login')
  }

  if (session.user.role !== 'CUSTOMER') {
    // Staff users should go to staff dashboard
    redirect('/dashboard')
  }

  const customerData = await getCustomerData(session.user.email!)

  if (!customerData) {
    redirect('/customer/login')
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Grey Sidebar */}
      <CustomerSidebar
        userName={session.user.name || 'Customer'}
        userEmail={session.user.email || ''}
        isPrimaryPoc={customerData.isPrimaryPoc}
        userCount={customerData.userCount}
      />

      {/* Main Content with Header Banner */}
      <CustomerLayoutWrapper
        companyName={customerData.companyName}
        isPrimaryPoc={customerData.isPrimaryPoc}
      >
        {children}
      </CustomerLayoutWrapper>
    </div>
  )
}
