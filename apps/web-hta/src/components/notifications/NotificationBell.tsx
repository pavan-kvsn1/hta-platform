'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell } from 'lucide-react'
import { NotificationDropdown } from './NotificationDropdown'

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

interface NotificationBellProps {
  userRole: string
}

const POLL_INTERVAL = 30000 // 30 seconds

export function NotificationBell({ userRole }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [hasNewNotification, setHasNewNotification] = useState(false)

  // Track previous count for animation (using ref to avoid re-renders)
  const prevCountRef = useRef(0)

  // Fetch unread count (lightweight polling)
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await apiFetch('/api/notifications/unread-count')
      if (res.ok) {
        const data = await res.json()
        // Animate if count increased
        if (data.count > prevCountRef.current) {
          setHasNewNotification(true)
          setTimeout(() => setHasNewNotification(false), 1000)
        }
        prevCountRef.current = data.count
        setUnreadCount(data.count)
      }
    } catch (error) {
      console.error('Error fetching unread count:', error)
    }
  }, []) // No dependencies - stable callback

  // Fetch full notifications list
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiFetch('/api/notifications?limit=10')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Mark single notification as read
  const handleMarkAsRead = useCallback(async (id: string) => {
    try {
      await apiFetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: [id] }),
      })
      // Update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }, [])

  // Mark all as read
  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await apiFetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: 'all' }),
      })
      // Update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
    }
  }, [])

  // Initial fetch and polling
  useEffect(() => {
    fetchUnreadCount()

    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // Fetch full notifications when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications()
    }
  }, [isOpen, fetchNotifications])

  const handleToggle = () => {
    setIsOpen(!isOpen)
  }

  const handleClose = () => {
    setIsOpen(false)
  }

  const containerRef = useRef<HTMLDivElement>(null)

  // Handle click outside - at parent level to include both button and dropdown
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    // Use setTimeout to avoid the current click from triggering close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={handleToggle}
        type="button"
        className={`relative p-2 rounded-lg hover:bg-gray-100 transition-colors ${
          hasNewNotification ? 'animate-bounce' : ''
        }`}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-5 w-5 flex items-center justify-center">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-700 text-[10px] font-bold text-white items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationDropdown
          notifications={notifications}
          unreadCount={unreadCount}
          userRole={userRole}
          isLoading={isLoading}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllAsRead={handleMarkAllAsRead}
          onClose={handleClose}
        />
      )}
    </div>
  )
}
