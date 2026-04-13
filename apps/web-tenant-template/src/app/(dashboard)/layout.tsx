'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { DashboardHeader } from '@/components/layout/DashboardHeader'
import { AppFooter } from '@/components/layout/AppFooter'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle authentication
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  const handleMobileMenuToggle = () => {
    setMobileMenuOpen((prev) => !prev)
  }

  const handleMobileMenuClose = () => {
    setMobileMenuOpen(false)
  }

  // Show nothing while loading auth
  if (status === 'loading' || !mounted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  // Don't render if not authenticated
  if (!session?.user) {
    return null
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar (includes its own header with logo) */}
      <DashboardSidebar
        userRole={session.user.role || 'ENGINEER'}
        userName={session.user.name || 'User'}
        isMobileOpen={mobileMenuOpen}
        onMobileClose={handleMobileMenuClose}
      />

      {/* Main Area */}
      <div className="flex-1 h-full flex flex-col min-w-0">
        {/* Header */}
        <DashboardHeader
          onMobileMenuToggle={handleMobileMenuToggle}
        />

        {/* Main Content */}
        <main className="flex-1 h-full min-h-0 overflow-auto flex flex-col">
          <div className="flex-1">{children}</div>
          <AppFooter />
        </main>
      </div>
    </div>
  )
}
