'use client'

import { apiFetch } from '@/lib/api-client'

import { useEffect, useState, useCallback } from 'react'
import { NotificationItem } from '@/components/notifications/NotificationItem'
import { Button } from '@/components/ui/button'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'

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

interface NotificationsResponse {
  notifications: Notification[]
  total: number
  unreadCount: number
}

export default function CustomerNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const limit = 50

  const fetchNotifications = useCallback(async (reset = false) => {
    try {
      const currentOffset = reset ? 0 : offset
      if (reset) {
        setIsLoading(true)
      } else {
        setIsLoadingMore(true)
      }

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: currentOffset.toString(),
      })

      const response = await apiFetch(`/api/notifications?${params}`)
      if (!response.ok) throw new Error('Failed to fetch')

      const data: NotificationsResponse = await response.json()

      if (reset) {
        setNotifications(data.notifications)
        setOffset(limit)
      } else {
        setNotifications((prev) => [...prev, ...data.notifications])
        setOffset((prev) => prev + limit)
      }
      setTotal(data.total)
      setUnreadCount(data.unreadCount)
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [offset])

  // Fetch notifications on mount
  useEffect(() => {
    fetchNotifications(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiFetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: [id] }),
      })

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
      if (unreadIds.length === 0) return

      await apiFetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: unreadIds }),
      })

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
    }
  }

  // Split notifications into unread and read
  const unreadNotifications = notifications.filter((n) => !n.read)
  const readNotifications = notifications.filter((n) => n.read)

  const hasMore = notifications.length < total

  return (
    <div className="p-3 h-full">
      {/* Master Bounding Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Bell className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
                <p className="text-sm text-slate-500">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
                </p>
              </div>
            </div>

            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllAsRead}
                className="flex items-center gap-2"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all as read
              </Button>
            )}
          </div>

          {/* Notifications List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-12 text-center">
              <div className="text-5xl mb-4">🔔</div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">No notifications yet</h3>
              <p className="text-sm text-slate-500">
                You&apos;ll see notifications here when there&apos;s activity on your certificates.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Unread Section */}
              {unreadNotifications.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    Unread ({unreadNotifications.length})
                  </h2>
                  <div className="space-y-3">
                    {unreadNotifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        userRole="CUSTOMER"
                        onMarkAsRead={handleMarkAsRead}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Read Section */}
              {readNotifications.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    Earlier ({readNotifications.length})
                  </h2>
                  <div className="space-y-3">
                    {readNotifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        userRole="CUSTOMER"
                        onMarkAsRead={handleMarkAsRead}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Load More */}
              {hasMore && (
                <div className="pt-4 text-center">
                  <Button
                    variant="outline"
                    onClick={() => fetchNotifications(false)}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
