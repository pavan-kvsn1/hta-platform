'use client'

import { apiFetch } from '@/lib/api-client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { NotificationItem } from '@/components/notifications/NotificationItem'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import {
  isToday,
  isYesterday,
  differenceInCalendarDays,
} from 'date-fns'

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

interface DateGroup {
  label: string
  notifications: Notification[]
}

function groupByDate(notifications: Notification[]): DateGroup[] {
  const groups: Record<string, Notification[]> = {}
  const order: string[] = []

  for (const n of notifications) {
    const date = new Date(n.createdAt)
    let label: string

    if (isToday(date)) {
      label = 'Today'
    } else if (isYesterday(date)) {
      label = 'Yesterday'
    } else if (differenceInCalendarDays(new Date(), date) <= 7) {
      label = 'This Week'
    } else {
      label = 'Earlier'
    }

    if (!groups[label]) {
      groups[label] = []
      order.push(label)
    }
    groups[label].push(n)
  }

  return order.map((label) => ({ label, notifications: groups[label] }))
}

type Tab = 'unread' | 'read'

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [activeTab, setActiveTab] = useState<Tab>('unread')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isMarkingRead, setIsMarkingRead] = useState(false)
  const [totalUnread, setTotalUnread] = useState(0)
  const limit = 50

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await apiFetch('/api/notifications/unread-count')
      if (res.ok) {
        const data = await res.json()
        setTotalUnread(data.count)
      }
    } catch { /* ignore */ }
  }, [])

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

      const data = await response.json()

      if (reset) {
        setNotifications(data.notifications)
        setOffset(limit)
      } else {
        setNotifications((prev) => [...prev, ...data.notifications])
        setOffset((prev) => prev + limit)
      }
      setTotal(data.total)
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [offset])

  useEffect(() => {
    fetchNotifications(true)
    fetchUnreadCount()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkAsRead = async (id: string) => {
    try {
      const wasUnread = notifications.find((n) => n.id === id && !n.read)
      await apiFetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: [id] }),
      })

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )
      if (wasUnread) {
        setTotalUnread((prev) => Math.max(0, prev - 1))
        window.dispatchEvent(new CustomEvent('notifications-changed'))
      }
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
        body: JSON.stringify({ notificationIds: 'all' }),
      })

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setSelectedIds(new Set())
      setTotalUnread(0)
      window.dispatchEvent(new CustomEvent('notifications-changed'))
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
    }
  }

  const handleMarkSelectedAsRead = async () => {
    if (selectedIds.size === 0) return
    setIsMarkingRead(true)
    try {
      const ids = Array.from(selectedIds)
      const markedCount = notifications.filter((n) => selectedIds.has(n.id) && !n.read).length
      await apiFetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: ids }),
      })

      setNotifications((prev) =>
        prev.map((n) => (selectedIds.has(n.id) ? { ...n, read: true } : n))
      )
      setSelectedIds(new Set())
      setTotalUnread((prev) => Math.max(0, prev - markedCount))
      window.dispatchEvent(new CustomEvent('notifications-changed'))
    } catch (error) {
      console.error('Error marking selected as read:', error)
    } finally {
      setIsMarkingRead(false)
    }
  }

  const unreadNotifications = useMemo(() => notifications.filter((n) => !n.read), [notifications])
  const readNotifications = useMemo(() => notifications.filter((n) => n.read), [notifications])

  const activeNotifications = activeTab === 'unread' ? unreadNotifications : readNotifications
  const dateGroups = useMemo(() => groupByDate(activeNotifications), [activeNotifications])
  const hasMore = notifications.length < total

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === unreadNotifications.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(unreadNotifications.map((n) => n.id)))
    }
  }

  const allSelected = unreadNotifications.length > 0 && selectedIds.size === unreadNotifications.length

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setSelectedIds(new Set())
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <Bell className="size-[22px] text-[#94a3b8]" />
            <div>
              <h1 className="text-[22px] font-bold text-[#0f172a]">Notifications</h1>
              <p className="text-[13px] text-[#94a3b8]">
                {totalUnread > 0 ? `${totalUnread} unread` : 'All caught up!'}
              </p>
            </div>
          </div>

          {totalUnread > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] border border-[#e2e8f0] text-[12.5px] font-semibold text-[#475569] hover:bg-[#f8fafc] transition-colors"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 mb-4 border-b border-[#e2e8f0]">
          <button
            onClick={() => handleTabChange('unread')}
            className={`px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === 'unread'
                ? 'border-[#0f172a] text-[#0f172a]'
                : 'border-transparent text-[#94a3b8] hover:text-[#64748b]'
            }`}
          >
            Unread
            {totalUnread > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-[#ef4444] text-white">
                {totalUnread}
              </span>
            )}
          </button>
          <button
            onClick={() => handleTabChange('read')}
            className={`px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === 'read'
                ? 'border-[#0f172a] text-[#0f172a]'
                : 'border-transparent text-[#94a3b8] hover:text-[#64748b]'
            }`}
          >
            Read
          </button>
        </div>

        {/* Selection action bar (unread tab only) */}
        {activeTab === 'unread' && unreadNotifications.length > 0 && (
          <div className="flex items-center justify-between mb-3 px-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="size-4 rounded border-[#cbd5e1] text-[#2563eb] focus:ring-[#2563eb]/20"
              />
              <span className="text-[12px] text-[#64748b]">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
              </span>
            </label>
            {selectedIds.size > 0 && (
              <button
                onClick={handleMarkSelectedAsRead}
                disabled={isMarkingRead}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] disabled:opacity-50 transition-colors"
              >
                {isMarkingRead ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Marking...
                  </>
                ) : (
                  <>
                    <CheckCheck className="size-3.5" />
                    Mark as read
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Notifications List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
          </div>
        ) : activeNotifications.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-16 text-center">
            <Bell className="size-10 text-[#cbd5e1] mx-auto mb-3" />
            <h3 className="text-[15px] font-semibold text-[#0f172a] mb-1">
              {activeTab === 'unread' ? 'No unread notifications' : 'No read notifications'}
            </h3>
            <p className="text-[13px] text-[#94a3b8]">
              {activeTab === 'unread'
                ? 'You\u2019re all caught up!'
                : 'Notifications you\u2019ve read will appear here.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            {dateGroups.map((group, groupIndex) => (
              <div key={group.label}>
                {/* Date group header */}
                <div className={`px-4 py-2 bg-[#f8fafc] ${groupIndex > 0 ? 'border-t border-[#e2e8f0]' : ''}`}>
                  <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                    {group.label}
                  </span>
                </div>

                {/* Notification rows */}
                {group.notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    userRole="ADMIN"
                    onMarkAsRead={handleMarkAsRead}
                    selectable={activeTab === 'unread'}
                    selected={selectedIds.has(notification.id)}
                    onSelect={toggleSelect}
                  />
                ))}
              </div>
            ))}

            {/* Load More */}
            {hasMore && (
              <div className="py-3 text-center border-t border-[#f1f5f9]">
                <button
                  onClick={() => fetchNotifications(false)}
                  disabled={isLoadingMore}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[12.5px] font-semibold text-[#64748b] hover:text-[#0f172a] disabled:opacity-50 transition-colors"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
