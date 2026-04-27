'use client'

import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import {
  CheckCircle,
  RotateCcw,
  FileUp,
  Send,
  Mail,
  MessageSquare,
  XCircle,
  UserPlus,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Icon config per notification type
const NOTIFICATION_ICONS: Record<string, { icon: typeof Bell; bg: string; color: string }> = {
  // Green — approvals / success
  CERTIFICATE_APPROVED: { icon: CheckCircle, bg: 'bg-[#dcfce7]', color: 'text-[#16a34a]' },
  CERTIFICATE_FINALIZED: { icon: CheckCircle, bg: 'bg-[#dcfce7]', color: 'text-[#16a34a]' },
  CUSTOMER_APPROVED: { icon: CheckCircle, bg: 'bg-[#dcfce7]', color: 'text-[#16a34a]' },
  REGISTRATION_APPROVED: { icon: CheckCircle, bg: 'bg-[#dcfce7]', color: 'text-[#16a34a]' },
  // Amber — revisions
  REVISION_REQUESTED: { icon: RotateCcw, bg: 'bg-[#fef3c7]', color: 'text-[#d97706]' },
  CUSTOMER_REVISION_REQUEST: { icon: RotateCcw, bg: 'bg-[#fef3c7]', color: 'text-[#d97706]' },
  // Blue — submissions / sends
  SUBMITTED_FOR_REVIEW: { icon: FileUp, bg: 'bg-[#dbeafe]', color: 'text-[#2563eb]' },
  SENT_TO_CUSTOMER: { icon: Send, bg: 'bg-[#dbeafe]', color: 'text-[#2563eb]' },
  CERTIFICATE_READY: { icon: Mail, bg: 'bg-[#dbeafe]', color: 'text-[#2563eb]' },
  REGISTRATION_SUBMITTED: { icon: UserPlus, bg: 'bg-[#dbeafe]', color: 'text-[#2563eb]' },
  // Gray — chat
  NEW_CHAT_MESSAGE: { icon: MessageSquare, bg: 'bg-[#f1f5f9]', color: 'text-[#64748b]' },
  ENGINEER_RESPONDED: { icon: MessageSquare, bg: 'bg-[#f1f5f9]', color: 'text-[#64748b]' },
  REVIEWER_REPLIED: { icon: MessageSquare, bg: 'bg-[#f1f5f9]', color: 'text-[#64748b]' },
  // Red — rejections
  REGISTRATION_REJECTED: { icon: XCircle, bg: 'bg-[#fee2e2]', color: 'text-[#dc2626]' },
}

const DEFAULT_ICON = { icon: Bell, bg: 'bg-[#f1f5f9]', color: 'text-[#94a3b8]' }

// Notification types received when engineer is acting as REVIEWER
const REVIEWER_NOTIFICATION_TYPES = [
  'SUBMITTED_FOR_REVIEW',
  'ENGINEER_RESPONDED',
  'CUSTOMER_REVISION_REQUEST',
  'CUSTOMER_APPROVED',
]

// Certificate statuses where the creator can edit
const EDITABLE_STATUSES = ['DRAFT', 'REVISION_REQUIRED', 'CUSTOMER_REVISION_REQUIRED']

function getNavigationPath(
  notificationType: string,
  certificateId: string | null,
  certificateStatus: string | null,
  userRole: string
): string | null {
  if (!certificateId) return null

  if (userRole === 'CUSTOMER') return `/customer/certificates/${certificateId}`
  if (userRole === 'ADMIN') return `/admin/certificates/${certificateId}`

  if (userRole === 'ENGINEER') {
    // Engineer acting as reviewer for this cert
    if (REVIEWER_NOTIFICATION_TYPES.includes(notificationType)) {
      return `/dashboard/reviewer/${certificateId}`
    }

    // Engineer is the creator — route based on current cert status
    if (certificateStatus && EDITABLE_STATUSES.includes(certificateStatus)) {
      return `/dashboard/certificates/${certificateId}/edit`
    }
    return `/dashboard/certificates/${certificateId}/view`
  }

  return `/dashboard/certificates/${certificateId}/view`
}

interface NotificationItemProps {
  notification: {
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
  userRole: string
  onMarkAsRead?: (id: string) => void
  compact?: boolean
  selectable?: boolean
  selected?: boolean
  onSelect?: (id: string) => void
}

export function NotificationItem({
  notification,
  userRole,
  onMarkAsRead,
  compact = false,
  selectable = false,
  selected = false,
  onSelect,
}: NotificationItemProps) {
  const router = useRouter()
  const iconConfig = NOTIFICATION_ICONS[notification.type] || DEFAULT_ICON
  const IconComponent = iconConfig.icon
  const navigationPath = getNavigationPath(
    notification.type,
    notification.certificate?.id || null,
    notification.certificate?.status || null,
    userRole
  )
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })

  const handleClick = () => {
    if (onMarkAsRead && !notification.read) {
      onMarkAsRead(notification.id)
    }
    if (navigationPath) {
      router.push(navigationPath)
    }
  }

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect?.(notification.id)
  }

  // Compact mode for dropdown bell
  if (compact) {
    return (
      <button
        onClick={handleClick}
        className={cn(
          'w-full text-left px-3.5 py-2.5 hover:bg-[#f8fafc] transition-colors border-b border-[#f1f5f9] last:border-b-0',
          !notification.read && 'bg-[#f0f7ff]'
        )}
      >
        <div className="flex items-start gap-2.5">
          <div className={cn('size-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', iconConfig.bg)}>
            <IconComponent className={cn('size-3', iconConfig.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {!notification.read && (
                <span className="size-1.5 bg-[#2563eb] rounded-full flex-shrink-0" />
              )}
              <span className={cn('text-[12.5px] truncate', !notification.read ? 'font-semibold text-[#0f172a]' : 'text-[#475569]')}>
                {notification.title}
              </span>
            </div>
            <p className="text-[11px] text-[#94a3b8] truncate mt-0.5">{notification.message}</p>
            <p className="text-[10px] text-[#cbd5e1] mt-0.5">{timeAgo}</p>
          </div>
        </div>
      </button>
    )
  }

  // Full row mode for notifications page
  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors border-b border-[#f1f5f9] last:border-b-0',
        !notification.read ? 'bg-[#f0f7ff] hover:bg-[#e8f1fd]' : 'bg-white hover:bg-[#f8fafc]'
      )}
    >
      {/* Checkbox or unread dot */}
      {selectable ? (
        <div className="w-5 flex-shrink-0 pt-1.5" onClick={handleCheckboxClick}>
          <input
            type="checkbox"
            checked={selected}
            readOnly
            className="size-4 rounded border-[#cbd5e1] text-[#2563eb] focus:ring-[#2563eb]/20 cursor-pointer"
          />
        </div>
      ) : (
        <div className="w-2 flex-shrink-0 pt-2.5">
          {!notification.read && (
            <span className="block size-2 bg-[#2563eb] rounded-full" />
          )}
        </div>
      )}

      {/* Icon */}
      <div className={cn('size-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', iconConfig.bg)}>
        <IconComponent className={cn('size-3.5', iconConfig.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {notification.certificate && (
            <span className="text-[10px] font-bold text-[#94a3b8] px-1.5 py-[2px] bg-[#f1f5f9] rounded-[4px] flex-shrink-0">
              {notification.certificate.certificateNumber}
            </span>
          )}
          <span className={cn('text-[13px]', !notification.read ? 'font-semibold text-[#0f172a]' : 'font-medium text-[#0f172a]')}>
            {notification.title}
          </span>
        </div>
        <p className="text-[12px] text-[#64748b] mt-0.5 line-clamp-1">{notification.message}</p>
      </div>

      {/* Time */}
      <span className="text-[11px] text-[#94a3b8] whitespace-nowrap flex-shrink-0 pt-0.5">{timeAgo}</span>
    </div>
  )
}
