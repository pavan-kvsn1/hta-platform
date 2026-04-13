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
    <div
      className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-900">Notifications</h3>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllAsRead}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 px-4 text-center">
            <div className="text-3xl mb-2">🔔</div>
            <p className="text-sm text-gray-500">No notifications yet</p>
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
        <div className="border-t border-gray-200 px-4 py-2 bg-gray-50">
          <button
            onClick={handleViewAll}
            className="w-full text-center text-sm text-blue-600 hover:text-blue-800 font-medium py-1"
          >
            View All Notifications
          </button>
        </div>
      )}
    </div>
  )
}
