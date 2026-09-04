'use client'

import { apiFetch, isSignedOut } from '@/lib/api-client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  threadId: string
  senderId: string
  senderName: string | null
  senderRole: string
  content: string
  createdAt: string
  readAt: string | null
  attachments: {
    id: string
    fileName: string
    fileType: string
    fileSize: number
    url: string
  }[]
}

interface ChatContainerProps {
  threadId: string
  certificateId: string
  threadType: 'ASSIGNEE_REVIEWER' | 'REVIEWER_CUSTOMER'
  className?: string
}

/**
 * Turn a failed response into an error that says what actually happened.
 *
 * "Failed to fetch messages" discards the status and the server's own message, so a
 * 401, a 403 and a 500 are indistinguishable in the console - there is nothing to act
 * on. The API answers errors as { error: string }, so surface that when it is there.
 */
async function describeFailure(res: Response, action: string): Promise<Error> {
  let detail = ''
  try {
    const body = await res.clone().json()
    if (body && typeof body.error === 'string') detail = body.error
  } catch {
    // Not JSON - the status alone still says more than nothing.
  }
  return new Error(
    `${action} failed: ${res.status} ${res.statusText}${detail ? ` - ${detail}` : ''}`,
  )
}

/** What to tell the reader, as opposed to what to log. */
function readableFailure(res: Response): string {
  // A 401 has two causes with different remedies: there is no session to act on, or a
  // token could not be minted for one that exists. Only the first is fixed by signing
  // in, and telling someone to sign in when they already are wastes their time.
  if (res.status === 401) {
    return isSignedOut()
      ? 'Your session has expired. Please sign in again.'
      : 'Could not authenticate this request. Try again in a moment.'
  }
  if (res.status === 403) return 'You do not have access to this conversation.'
  if (res.status === 404) return 'This conversation no longer exists.'
  return 'Failed to load messages'
}

export function ChatContainer({
  threadId,
  certificateId: _certificateId,
  threadType: _threadType,
  className,
}: ChatContainerProps) {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentUserId = session?.user?.id

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!threadId) return

    let readable: string | null = null
    try {
      const res = await apiFetch(`/api/chat/threads/${threadId}/messages`)
      if (!res.ok) {
        readable = readableFailure(res)
        throw await describeFailure(res, 'Fetch messages')
      }

      const data = await res.json()
      setMessages(data.messages.reverse()) // API returns newest first
      setHasMore(data.hasMore)
      setError(null)
    } catch (err) {
      // Specific when the server answered, generic when the request never landed.
      setError(readable ?? 'Failed to load messages')
      console.error('Fetch messages error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [threadId])

  // Initial fetch
  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // Mark messages as read when viewing
  useEffect(() => {
    if (!threadId || !currentUserId) return

    const markAsRead = async () => {
      try {
        await apiFetch(`/api/chat/threads/${threadId}/read`, { method: 'POST' })
      } catch (err) {
        console.error('Mark as read error:', err)
      }
    }

    markAsRead()
  }, [threadId, currentUserId, messages.length])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  // Polling for new messages (simple realtime)
  useEffect(() => {
    if (!threadId) return

    const interval = setInterval(fetchMessages, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [threadId, fetchMessages])

  // Send message
  const handleSend = async (content: string, attachments?: { fileName: string; fileSize: number; mimeType: string; storagePath: string }[]) => {
    if (!threadId || !currentUserId) return

    try {
      const res = await apiFetch(`/api/chat/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, attachments }),
      })

      if (!res.ok) throw await describeFailure(res, 'Send message')

      const data = await res.json()

      // Add new message to list
      setMessages((prev) => [...prev, data.message])
    } catch (err) {
      console.error('Send message error:', err)
      throw err // Re-throw so ChatInput shows error state
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-background rounded-xl border',
        className
      )}
    >
      {/* Messages area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col"
      >
        {isLoading ? (
          <div className="flex items-center justify-center flex-1">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={fetchMessages}
              className="text-sm text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center flex-1">
            <p className="text-xs text-muted-foreground text-center font-medium">
              No messages yet. Start the conversation!
            </p>
          </div>
        ) : (
          <>
            {/* Spacer to push messages to bottom when few messages */}
            <div className="flex-1" />
            {hasMore && (
              <button
                onClick={() => {/* TODO: Load more */}}
                className="text-sm text-primary hover:underline mx-auto block mb-4"
              >
                Load earlier messages
              </button>
            )}
            <div className="space-y-4">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  id={message.id}
                  content={message.content}
                  senderName={message.senderName}
                  senderRole={message.senderRole}
                  createdAt={message.createdAt}
                  isOwn={message.senderId === currentUserId}
                  attachments={message.attachments}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} threadId={threadId} disabled={isLoading || !!error} />
    </div>
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
