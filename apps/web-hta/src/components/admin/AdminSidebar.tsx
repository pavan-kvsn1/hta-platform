'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard,
  Users,
  Building2,
  Bell,
  Inbox,
  Wrench,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  BarChart3,
  CreditCard,
  Monitor,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-client'

interface AdminSidebarProps {
  userName: string
  userEmail: string
  pendingRequests?: number
  instrumentAlerts?: number
  pendingAuthorizations?: number
  adminType?: 'MASTER' | 'WORKER' | null
}

const STORAGE_KEY = 'admin-sidebar-collapsed'

export function AdminSidebar({
  userName,
  userEmail,
  pendingRequests = 0,
  instrumentAlerts = 0,
  pendingAuthorizations = 0,
  adminType,
}: AdminSidebarProps) {
  const pathname = usePathname()
  const isMaster = adminType === 'MASTER'
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
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('sidebar-toggle'))
      }, 0)
      return next
    })
  }, [])

  const getInitials = (name: string) => {
    if (!name) return 'A'
    const parts = name.split(' ')
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase()
  }

  // Navigation items - some are Master Admin only
  const navigation = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard, badge: 0, masterOnly: false },
    { name: 'Analytics', href: '/admin/analytics', icon: BarChart3, badge: 0, masterOnly: false },
    { name: 'Staff Users', href: '/admin/users', icon: Users, badge: 0, masterOnly: false },
    { name: 'Customer Accounts', href: '/admin/customers', icon: Building2, badge: 0, masterOnly: true },
    { name: 'Requests', href: '/admin/requests', icon: Inbox, badge: pendingRequests, masterOnly: true },
    { name: 'Certificates', href: '/admin/certificates', icon: FileText, badge: 0, masterOnly: false },
    { name: 'Authorization', href: '/admin/authorization', icon: ShieldCheck, badge: pendingAuthorizations, masterOnly: false },
    { name: 'Notifications', href: '/admin/notifications', icon: Bell, badge: unreadNotifications, masterOnly: false },
    { name: 'Master Instruments', href: '/admin/instruments', icon: Wrench, badge: instrumentAlerts, masterOnly: false },
    { name: 'Devices', href: '/admin/devices', icon: Monitor, badge: 0, masterOnly: true },
    { name: 'Subscription', href: '/admin/subscription', icon: CreditCard, badge: 0, masterOnly: true },
    { name: 'Settings', href: '/admin/settings', icon: Settings, badge: 0, masterOnly: true },
  ].filter(item => !item.masterOnly || isMaster)

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 flex flex-col bg-[#1e293b] transition-all duration-200 z-50',
        isCollapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Header - Logo */}
      <div className={cn(
        'flex items-center pt-4 pb-2 px-2',
        isCollapsed ? 'justify-center' : 'px-4'
      )}>
        <Link href="/admin" className="flex items-center gap-2">
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

      {/* Admin Type Badge */}
      {adminType && !isCollapsed && (
        <div className="px-4 py-1.5">
          <span
            className={cn(
              'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.05em]',
              isMaster
                ? 'bg-[#7c3aed]/20 text-[#c4b5fd]'
                : 'bg-[#334155] text-[#94a3b8]'
            )}
          >
            {isMaster ? 'Master Admin' : 'Worker Admin'}
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {/* Collapse Toggle */}
        <button
          onClick={toggleCollapsed}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-[#cbd5e1] hover:bg-[#334155] hover:text-white w-full',
            isCollapsed && 'justify-center px-0'
          )}
        >
          <span className="relative">
            {isCollapsed ? (
              <ChevronRight className="size-5 shrink-0 text-[#94a3b8]" strokeWidth={1.5} />
            ) : (
              <ChevronLeft className="size-5 shrink-0 text-[#94a3b8]" strokeWidth={1.5} />
            )}
          </span>
          {!isCollapsed && <span className="text-sm">Collapse</span>}
        </button>

        {/* Divider */}
        <div className="my-2 border-t border-[#334155]" />

        {/* Nav Items */}
        {navigation.map((item) => {
          const active = isActive(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={item.href}
              title={isCollapsed ? item.name : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors relative',
                active
                  ? 'bg-[#334155] text-white font-medium'
                  : 'text-[#cbd5e1] hover:bg-[#334155] hover:text-white',
                isCollapsed && 'justify-center px-0'
              )}
            >
              <span className="relative">
                <Icon
                  className={cn('size-5 shrink-0', active ? 'text-white' : 'text-[#94a3b8]')}
                  strokeWidth={1.5}
                />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-[#dc2626] text-white text-[10px] font-bold">
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
      <div className="p-2 space-y-1 border-t border-[#334155]">
        {/* User Info */}
        <div
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg',
            isCollapsed && 'justify-center px-0'
          )}
          title={isCollapsed ? userName : undefined}
        >
          <div className="size-8 rounded-full bg-[#7c3aed] text-white flex items-center justify-center font-bold text-xs shrink-0">
            {getInitials(userName)}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              <p className="text-xs text-[#94a3b8] truncate">{userEmail}</p>
            </div>
          )}
        </div>

        {/* Sign Out */}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          title={isCollapsed ? 'Sign out' : undefined}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[#cbd5e1] hover:bg-[#334155] hover:text-white transition-colors',
            isCollapsed && 'justify-center px-0'
          )}
        >
          <span className="relative">
            <LogOut className="size-5 text-[#94a3b8]" strokeWidth={1.5} />
          </span>
          {!isCollapsed && <span className="text-sm">Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
