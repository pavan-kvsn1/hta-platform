'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { FileText, ClipboardCheck, Bell, Settings, LogOut, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashboardSidebarProps {
  userRole: string
  userName: string
  isMobileOpen: boolean
  onMobileClose: () => void
}

const STORAGE_KEY = 'sidebar-collapsed'

export function DashboardSidebar({
  userRole,
  userName,
  isMobileOpen,
  onMobileClose,
}: DashboardSidebarProps) {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Load state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'true') setIsCollapsed(true)
  }, [])

  // Toggle and persist
  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  // Fetch unread count
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await apiFetch('/api/notifications/unread-count')
        if (res.ok) {
          const data = await res.json()
          setUnreadCount(data.count)
        }
      } catch { /* intentionally empty */ }
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [])

  const getInitials = (name: string) => {
    if (!name) return 'U'
    const parts = name.split(' ')
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase()
  }

  const navItems = [
    { label: 'My Certificates', icon: FileText, href: '/dashboard', show: true },
    { label: 'Reviews', icon: ClipboardCheck, href: '/dashboard/reviewer', show: userRole === 'ENGINEER' || userRole === 'ADMIN' },
    { label: 'Notifications', icon: Bell, href: '/notifications', show: true, badge: unreadCount },
    { label: 'Settings', icon: Settings, href: '/settings', show: true },
  ].filter((item) => item.show)

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  // Sidebar content (shared between desktop and mobile)
  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {/* Header - Logo */}
      <div className={cn(
        'flex items-center pt-4 pb-2 px-2',
        !mobile && isCollapsed ? 'justify-center' : 'px-4 justify-between'
      )}>
        <Link href="/dashboard" className="flex items-center gap-2" onClick={mobile ? onMobileClose : undefined}>
          <Image
            src="/hta-logo.jpg"
            alt="HTA Instrumentation"
            width={!mobile && isCollapsed ? 36 : 40}
            height={!mobile && isCollapsed ? 18 : 20}
            className="object-contain transition-all duration-200"
          />
          {(mobile || !isCollapsed) && (
            <span className="text-lg font-semibold text-white">HTA Calibr8s</span>
          )}
        </Link>
        {mobile && (
          <button
            onClick={onMobileClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {/* Collapse Toggle (desktop only) */}
        {!mobile && (
          <button
            onClick={toggleCollapsed}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-slate-300 hover:bg-white/5 hover:text-white w-full',
              isCollapsed && 'justify-center px-0'
            )}
          >
            <span className="relative">
              {isCollapsed ? <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.5} /> : <ChevronLeft className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.5} />}
            </span>
            {!isCollapsed && <span className="text-sm">Collapse</span>}
          </button>
        )}
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={mobile ? onMobileClose : undefined}
              title={!mobile && isCollapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-lg transition-colors relative',
                active
                  ? 'bg-white/10 text-white font-medium border-l-2 border-primary'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white',
                !mobile && isCollapsed && 'justify-center px-0'
              )}
            >
              <span className="relative">
                <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-white' : 'text-slate-400')} strokeWidth={1.5} />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-700 text-white text-[10px] font-bold">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </span>

              {(mobile || !isCollapsed) && <span className="text-sm truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User Section */}
      <div className="p-2 space-y-1">
        {/* User Info */}
        <div
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg',
            !mobile && isCollapsed && 'justify-center px-0'
          )}
          title={!mobile && isCollapsed ? userName : undefined}
        >
          <div className="size-8 rounded-full bg-white text-slate-800 flex items-center justify-center font-bold text-xs shrink-0">
            {getInitials(userName)}
          </div>
          {(mobile || !isCollapsed) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              <p className="text-xs text-slate-400 truncate">
                {userRole === 'ENGINEER' ? 'Engineer' : userRole === 'ADMIN' ? 'Admin' : userRole}
              </p>
            </div>
          )}
        </div>

        {/* Sign Out */}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          title={!mobile && isCollapsed ? 'Sign out' : undefined}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-3 rounded-lg text-slate-300 hover:bg-white/5 hover:text-white transition-colors',
            !mobile && isCollapsed && 'justify-center px-0'
          )}
        >
          <span className="relative">
            <LogOut className="h-5 w-5 text-slate-400" strokeWidth={1.5} />
          </span>
          {(mobile || !isCollapsed) && <span className="text-sm">Sign out</span>}
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col bg-[#0f1e2e] shrink-0 transition-all duration-200',
          isCollapsed ? 'w-16' : 'w-56'
        )}
      >
        <SidebarContent mobile={false} />
      </aside>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onMobileClose}
          />
          {/* Mobile Sidebar */}
          <aside className="absolute inset-y-0 left-0 w-64 flex flex-col bg-[#0f1e2e] shadow-xl">
            <SidebarContent mobile={true} />
          </aside>
        </div>
      )}
    </>
  )
}
