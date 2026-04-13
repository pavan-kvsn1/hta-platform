'use client'

import { cn } from '@/lib/utils'
import { format, isToday, isYesterday } from 'date-fns'

interface ChatMessageProps {
  id: string
  content: string
  senderName: string | null
  senderRole: string
  createdAt: Date | string
  isOwn: boolean
  attachments?: {
    id: string
    fileName: string
    fileType: string
    url: string
  }[]
}

// Format timestamp in WhatsApp style
function formatMessageTime(date: Date): string {
  if (isToday(date)) {
    return format(date, 'h:mm a') // "9:00 AM"
  } else if (isYesterday(date)) {
    return `Yesterday ${format(date, 'h:mm a')}` // "Yesterday 9:00 AM"
  } else {
    return format(date, 'MMM d, h:mm a') // "Mar 5, 9:00 AM"
  }
}

export function ChatMessage({
  content,
  createdAt,
  isOwn,
  attachments,
}: ChatMessageProps) {
  const timestamp = typeof createdAt === 'string' ? new Date(createdAt) : createdAt

  return (
    <div
      className={cn(
        'flex flex-col gap-1 max-w-[80%]',
        isOwn ? 'ml-auto items-end' : 'mr-auto items-start'
      )}
    >
      {/* Message bubble - WhatsApp style */}
      <div
        className={cn(
          'px-3 py-2 text-sm',
          isOwn
            ? 'bg-blue-500 text-white rounded-2xl rounded-tr-sm'
            : 'bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{content}</p>
      </div>

      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          {attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2 text-xs px-3 py-2 rounded-lg',
                'bg-muted/50 hover:bg-muted transition-colors',
                'max-w-[200px] truncate'
              )}
            >
              <AttachmentIcon fileType={attachment.fileType} />
              <span className="truncate">{attachment.fileName}</span>
            </a>
          ))}
        </div>
      )}

      {/* Timestamp - WhatsApp style */}
      <span className={cn(
        'text-[10px]',
        isOwn ? 'text-slate-400' : 'text-slate-500'
      )}>
        {formatMessageTime(timestamp)}
      </span>
    </div>
  )
}

function AttachmentIcon({ fileType }: { fileType: string }) {
  if (fileType.startsWith('image/')) {
    return (
      <svg
        className="w-4 h-4 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    )
  }

  if (fileType === 'application/pdf') {
    return (
      <svg
        className="w-4 h-4 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    )
  }

  return (
    <svg
      className="w-4 h-4 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
      />
    </svg>
  )
}
