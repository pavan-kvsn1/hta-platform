'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { AppFooter } from '@/components/layout/AppFooter'
import { Menu, WifiOff } from 'lucide-react'

const DESKTOP_ONLINE_ONLY_PATHS = [
  '/dashboard/requests',
  '/dashboard/offline-codes',
  '/notifications',
  '/settings',
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [checkingDesktopSession, setCheckingDesktopSession] = useState(false)
  const [desktopRestoreAttempted, setDesktopRestoreAttempted] = useState(false)
  const [checkingOnlineOnlyAccess, setCheckingOnlineOnlyAccess] = useState(false)
  const [onlineOnlyBlocked, setOnlineOnlyBlocked] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle authentication. In desktop, first-time setup can complete before
  // NextAuth observes the local session cookie, so restore it from Electron.
  useEffect(() => {
    if (status !== 'unauthenticated') return

    const electronAPI = window.electronAPI
    if (!electronAPI || desktopRestoreAttempted) {
      router.push('/login')
      return
    }

    let cancelled = false
    const desktopAPI = electronAPI
    setCheckingDesktopSession(true)

    async function restoreDesktopSession() {
      try {
        const authStatus = await desktopAPI.getAuthStatus()
        if (!authStatus.isUnlocked) {
          router.push('/login')
          return
        }

        const profile = await desktopAPI.getUserProfile()
        if (!profile) {
          router.push('/login')
          return
        }

        const res = await fetch('/api/auth/desktop-session', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userProfile: profile }),
        })

        if (!res.ok) {
          router.push('/login')
          return
        }

        if (!cancelled) {
          setDesktopRestoreAttempted(true)
          router.refresh()
        }
      } catch {
        if (!cancelled) router.push('/login')
      } finally {
        if (!cancelled) setCheckingDesktopSession(false)
      }
    }

    restoreDesktopSession()

    return () => {
      cancelled = true
    }
  }, [status, router, desktopRestoreAttempted])

  useEffect(() => {
    const electronAPI = window.electronAPI
    const isOnlineOnlyPath = DESKTOP_ONLINE_ONLY_PATHS.some((path) =>
      pathname === path || pathname.startsWith(`${path}/`)
    )

    if (!electronAPI || !isOnlineOnlyPath) {
      setCheckingOnlineOnlyAccess(false)
      setOnlineOnlyBlocked(false)
      return
    }

    let cancelled = false
    const checkAccess = async () => {
      setCheckingOnlineOnlyAccess(true)
      try {
        const reachable = await electronAPI.isApiReachable()
        if (!cancelled) setOnlineOnlyBlocked(!reachable)
      } catch {
        if (!cancelled) setOnlineOnlyBlocked(true)
      } finally {
        if (!cancelled) setCheckingOnlineOnlyAccess(false)
      }
    }

    checkAccess()
    const removeConnectivityListener = electronAPI.onConnectivityChange?.(() => {
      checkAccess()
    })

    return () => {
      cancelled = true
      removeConnectivityListener?.()
    }
  }, [pathname])

  const handleMobileMenuToggle = () => {
    setMobileMenuOpen((prev) => !prev)
  }

  const handleMobileMenuClose = () => {
    setMobileMenuOpen(false)
  }

  // Show nothing while loading auth
  if (status === 'loading' || !mounted || checkingDesktopSession || checkingOnlineOnlyAccess) {
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
        {/* Mobile menu button */}
        <button
          onClick={handleMobileMenuToggle}
          className="lg:hidden fixed top-3 left-3 z-[55] p-2 rounded-lg bg-white border border-[#e2e8f0] text-[#64748b] shadow-sm"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Main Content */}
        <main className="flex-1 h-full min-h-0 overflow-auto flex flex-col">
          <div className="flex-1">
            {onlineOnlyBlocked ? (
              <div className="flex min-h-full items-center justify-center p-6">
                <div className="max-w-md text-center">
                  <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                    <WifiOff className="size-6" />
                  </div>
                  <h1 className="text-lg font-semibold text-slate-900">Online Connection Required</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    This page needs the HTA platform connection. Offline mode only supports local certificate work.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard')}
                    className="mt-5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            ) : children}
          </div>
          <AppFooter />
        </main>
      </div>
    </div>
  )
}
