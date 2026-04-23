'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  content: string
  senderType: string
  senderName: string | null
  isOwnMessage: boolean
  createdAt: string
  attachments: {
    id: string
    fileName: string
    fileSize: number
    mimeType: string
  }[]
}

interface CustomerChatContainerProps {
  token: string
  className?: string
}

export function CustomerChatContainer({
  token,
  className,
}: CustomerChatContainerProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch messages using token-based API
  const fetchMessages = useCallback(async () => {
    if (!token) return

    try {
      const encodedToken = encodeURIComponent(token)
      const res = await apiFetch(`/api/customer/review/${encodedToken}/chat`)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch messages')
      }

      const data = await res.json()
      setMessages(data.messages || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages')
      console.error('Fetch messages error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [token])

  // Initial fetch
  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  // Polling for new messages
  useEffect(() => {
    if (!token) return

    const interval = setInterval(fetchMessages, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [token, fetchMessages])

  // Send message
  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return

    setIsSending(true)

    try {
      const encodedToken = encodeURIComponent(token)
      const res = await apiFetch(`/api/customer/review/${encodedToken}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send message')
      }

      const data = await res.json()

      // Add new message to list
      setMessages((prev) => [...prev, data.message])
      setNewMessage('')
    } catch (err) {
      console.error('Send message error:', err)
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-background',
        className
      )}
    >
      {/* Messages area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 flex flex-col"
      >
        {isLoading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2">
            <p className="text-xs text-destructive">{error}</p>
            <button
              onClick={fetchMessages}
              className="text-xs text-primary hover:underline"
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
            <div className="space-y-3">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  content={message.content}
                  senderName={message.senderName}
                  senderType={message.senderType}
                  isOwn={message.isOwnMessage}
                  createdAt={message.createdAt}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t p-3 bg-white">
        <div className="flex gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="min-h-[36px] max-h-[100px] resize-none text-xs"
            rows={1}
            disabled={isLoading || !!error}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!newMessage.trim() || isSending || isLoading || !!error}
            className="h-9 w-9 p-0 flex-shrink-0"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  content,
  senderName,
  senderType,
  isOwn,
  createdAt,
}: {
  content: string
  senderName: string | null
  senderType: string
  isOwn: boolean
  createdAt: string
}) {
  const time = new Date(createdAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={cn('flex flex-col gap-0.5', isOwn ? 'items-end' : 'items-start')}>
      {!isOwn && (
        <span className="text-[10px] text-muted-foreground px-2">
          {senderName || (senderType === 'CUSTOMER' ? 'Customer' : 'HTA Team')}
        </span>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3 py-2 text-xs',
          isOwn
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-slate-100 text-slate-900 rounded-bl-sm'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{content}</p>
      </div>
      <span className="text-[10px] text-muted-foreground px-2">{time}</span>
    </div>
  )
}
