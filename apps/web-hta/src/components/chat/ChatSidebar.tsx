'use client'

import { useState, useEffect } from 'react'
import { ChatContainer } from './ChatContainer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ChatSidebarProps {
  certificateId: string
  threadType: 'ASSIGNEE_REVIEWER' | 'REVIEWER_CUSTOMER'
  isOpen: boolean
  onClose: () => void
  embedded?: boolean // When true, renders just the content without the sidebar wrapper
}

export function ChatSidebar({
  certificateId,
  threadType,
  isOpen,
  onClose,
  embedded = false,
}: ChatSidebarProps) {
  const [threadId, setThreadId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create or get thread when opening
  useEffect(() => {
    if (!isOpen || !certificateId) return

    const getOrCreateThread = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/chat/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certificateId, threadType }),
        })

        if (!res.ok) throw new Error('Failed to get thread')

        const data = await res.json()
        setThreadId(data.thread.id)
      } catch (err) {
        setError('Failed to load chat')
        console.error('Get thread error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    getOrCreateThread()
  }, [isOpen, certificateId, threadType])

  // Prevent body scroll when sidebar is open on mobile (only for non-embedded)
  useEffect(() => {
    if (embedded) return

    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, embedded])

  // Embedded mode - just render the content
  if (embedded) {
    return (
      <div className="h-full">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : threadId ? (
          <ChatContainer
            threadId={threadId}
            certificateId={certificateId}
            threadType={threadType}
            className="h-full border-0 rounded-none"
          />
        ) : null}
      </div>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50 z-40 transition-opacity lg:hidden',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Sidebar - starts below header (h-16 = 4rem = 64px) */}
      <aside
        className={cn(
          'fixed right-0 top-16 h-[calc(100vh-4rem)] w-full sm:w-[400px] bg-background z-50',
          'transform transition-transform duration-300 ease-in-out',
          'border-l shadow-xl',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header - matches main header height */}
        <div className="flex items-center justify-between px-4 h-12 border-b bg-white">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm">
              {threadType === 'ASSIGNEE_REVIEWER'
                ? 'Engineer Discussion'
                : 'Customer Chat'}
            </h2>
            <ThreadTypeBadge type={threadType} />
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <CloseIcon className="w-4 h-4" />
          </Button>
        </div>

        {/* Content - subtract sidebar header height (h-12 = 3rem = 48px) */}
        <div className="h-[calc(100%-3rem)]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : threadId ? (
            <ChatContainer
              threadId={threadId}
              certificateId={certificateId}
              threadType={threadType}
              className="h-full border-0 rounded-none"
            />
          ) : null}
        </div>
      </aside>
    </>
  )
}

function ThreadTypeBadge({ type }: { type: 'ASSIGNEE_REVIEWER' | 'REVIEWER_CUSTOMER' }) {
  const isInternal = type === 'ASSIGNEE_REVIEWER'

  return (
    <span
      className={cn(
        'text-xs px-2 py-0.5 rounded-full font-medium',
        isInternal
          ? 'bg-blue-100 text-blue-700'
          : 'bg-green-100 text-green-700'
      )}
    >
      {isInternal ? 'Internal' : 'External'}
    </span>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  )
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-6 w-6 text-muted-foreground"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
