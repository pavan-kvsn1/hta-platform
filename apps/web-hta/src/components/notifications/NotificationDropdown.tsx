'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { NotificationItem } from './NotificationItem'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
  certificate: {
    id: string
    certificateNumber: string
    status: string
  } | null
}

interface NotificationDropdownProps {
  notifications: Notification[]
  unreadCount: number
  userRole: string
  isLoading?: boolean
  onMarkAsRead: (id: string) => void
  onMarkAllAsRead: () => void
  onClose: () => void
}

export function NotificationDropdown({
  notifications,
  unreadCount,
  userRole,
  isLoading = false,
  onMarkAsRead,
  onMarkAllAsRead,
  onClose,
}: NotificationDropdownProps) {
  const router = useRouter()

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleViewAll = () => {
    onClose()
    router.push('/notifications')
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-[#e2e8f0] z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
        <h3 className="text-[13px] font-semibold text-[#0f172a]">Notifications</h3>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllAsRead}
            className="text-[11px] font-semibold text-[#2563eb] hover:text-[#1d4ed8] transition-colors"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full size-6 border-b-2 border-[#2563eb]" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 px-4 text-center">
            <div className="text-3xl mb-2">🔔</div>
            <p className="text-[13px] text-[#94a3b8]">No notifications yet</p>
          </div>
        ) : (
          <div className="flex flex-col w-full">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                userRole={userRole}
                onMarkAsRead={onMarkAsRead}
                compact
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="border-t border-[#e2e8f0] px-4 py-2 bg-[#f8fafc]">
          <button
            onClick={handleViewAll}
            className="w-full text-center text-[12.5px] font-semibold text-[#2563eb] hover:text-[#1d4ed8] py-1 transition-colors"
          >
            View All Notifications
          </button>
        </div>
      )}
    </div>
  )
}
