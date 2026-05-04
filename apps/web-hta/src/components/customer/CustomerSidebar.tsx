'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  FileText,
  Bell,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-client'

interface CustomerSidebarProps {
  userName: string
  userEmail: string
  isPrimaryPoc: boolean
  counts?: {
    pending: number
    awaiting: number
    completed: number
    authorized: number
  }
  userCount?: number
}

const STORAGE_KEY = 'customer-sidebar-collapsed'

export function CustomerSidebar({
  userName,
  userEmail,
  isPrimaryPoc,
  counts,
  userCount = 0,
}: CustomerSidebarProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)

  // Load state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'true') setIsCollapsed(true)
  }, [])

  // Fetch unread notification count
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await apiFetch('/api/notifications/unread-count')
        const data = await res.json()
        if (data.count !== undefined) setUnreadNotifications(data.count)
      } catch { /* ignore */ }
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    window.addEventListener('notifications-changed', fetchUnread)
    return () => {
      clearInterval(interval)
      window.removeEventListener('notifications-changed', fetchUnread)
    }
  }, [])

  // Toggle and persist
  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      // Defer event dispatch to avoid state update during render
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('customer-sidebar-toggle'))
      }, 0)
      return next
    })
  }, [])

  const getInitials = (name: string) => {
    if (!name) return 'C'
    const parts = name.split(' ')
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase()
  }

  // Calculate total certificates needing attention
  const totalPending = counts ? counts.pending + counts.awaiting : 0

  // Navigation items
  const navigation = [
    {
      name: 'Dashboard',
      href: '/customer/dashboard',
      icon: LayoutDashboard,
      badge: 0,
      pocOnly: false,
    },
    {
      name: 'Certificates',
      href: '/customer/dashboard',
      icon: FileText,
      badge: totalPending,
      pocOnly: false,
      isActive: (path: string) => path === '/customer/dashboard',
    },
    {
      name: 'Notifications',
      href: '/customer/notifications',
      icon: Bell,
      badge: unreadNotifications,
      pocOnly: false,
    },
    {
      name: 'Instruments',
      href: '/customer/instruments',
      icon: Wrench,
      badge: 0,
      pocOnly: false,
    },
    {
      name: 'Users',
      href: '/customer/users',
      icon: Users,
      badge: 0,
      pocOnly: true,
    },
    {
      name: 'Settings',
      href: '/customer/settings',
      icon: Settings,
      badge: 0,
      pocOnly: true,
    },
  ].filter(item => !item.pocOnly || isPrimaryPoc)

  const isActive = (item: typeof navigation[number]) => {
    if (item.isActive) return item.isActive(pathname)
    if (item.href === '/customer/dashboard') {
      return pathname === '/customer/dashboard'
    }
    return pathname.startsWith(item.href)
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 flex flex-col bg-slate-800 transition-all duration-200 z-50',
        isCollapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Header - Logo */}
      <div className={cn(
        'flex items-center pt-4 pb-2 px-2',
        isCollapsed ? 'justify-center' : 'px-4'
      )}>
        <Link href="/customer/dashboard" className="flex items-center gap-2">
          <Image
            src="/hta-logo.jpg"
            alt="HTA Logo"
            width={isCollapsed ? 36 : 40}
            height={isCollapsed ? 18 : 20}
            className="object-contain transition-all duration-200"
          />
          {!isCollapsed && (
            <span className="text-lg font-semibold text-white">HTA Calibration</span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {/* Collapse Toggle */}
        <button
          onClick={toggleCollapsed}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-slate-300 hover:bg-slate-700 hover:text-white w-full',
            isCollapsed && 'justify-center px-0'
          )}
        >
          <span className="relative">
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.5} />
            ) : (
              <ChevronLeft className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.5} />
            )}
          </span>
          {!isCollapsed && <span className="text-sm">Collapse</span>}
        </button>

        {/* Divider */}
        <div className="my-2 border-t border-slate-700" />

        {/* Nav Items */}
        {navigation.map((item) => {
          const active = isActive(item)
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={item.href}
              title={isCollapsed ? item.name : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors relative',
                active
                  ? 'bg-slate-700 text-white font-medium'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                isCollapsed && 'justify-center px-0'
              )}
            >
              <span className="relative">
                <Icon
                  className={cn('h-5 w-5 shrink-0', active ? 'text-white' : 'text-slate-400')}
                  strokeWidth={1.5}
                />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-700 text-white text-[10px] font-bold">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </span>
              {!isCollapsed && <span className="text-sm truncate">{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User Section */}
      <div className="p-2 space-y-1 border-t border-slate-700">
        {/* User Info */}
        <div
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg',
            isCollapsed && 'justify-center px-0'
          )}
          title={isCollapsed ? userName : undefined}
        >
          <div className="size-8 rounded-full bg-green-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
            {getInitials(userName)}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              <p className="text-xs text-slate-400 truncate">{userEmail}</p>
            </div>
          )}
        </div>

        {/* Sign Out */}
        <button
          onClick={() => signOut({ callbackUrl: '/customer/login' })}
          title={isCollapsed ? 'Sign out' : undefined}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-700 hover:text-white transition-colors',
            isCollapsed && 'justify-center px-0'
          )}
        >
          <span className="relative">
            <LogOut className="h-5 w-5 text-slate-400" strokeWidth={1.5} />
          </span>
          {!isCollapsed && <span className="text-sm">Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
