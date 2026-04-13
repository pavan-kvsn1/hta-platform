'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { MessageSquare, Send, Loader2, RefreshCw } from 'lucide-react'

interface ChatMessage {
  id: string
  content: string
  senderType: 'CUSTOMER' | 'REVIEWER' | 'ADMIN'
  senderName?: string
  isOwnMessage: boolean
  createdAt: string
  attachments: {
    id: string
    fileName: string
    fileSize: number
    mimeType: string
  }[]
}

interface CustomerChatPanelProps {
  token: string
  isCompleted?: boolean
  className?: string
}

export function CustomerChatPanel({
  token,
  isCompleted = false,
  className,
}: CustomerChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const fetchMessages = useCallback(async () => {
    try {
      setError(null)
      const encodedToken = encodeURIComponent(token)
      const res = await fetch(`/api/customer/review/${encodedToken}/chat`)

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to load messages')
      }

      const data = await res.json()
      setMessages(data.messages || [])
      setTimeout(scrollToBottom, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chat')
      console.error('Fetch messages error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [token, scrollToBottom])

  useEffect(() => {
    fetchMessages()

    // Poll for new messages every 10 seconds
    const interval = setInterval(fetchMessages, 10000)

    return () => clearInterval(interval)
  }, [fetchMessages])

  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return

    setIsSending(true)
    setError(null)

    try {
      const encodedToken = encodeURIComponent(token)
      const res = await fetch(`/api/customer/review/${encodedToken}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send message')
      }

      const data = await res.json()
      setMessages((prev) => [...prev, data.message])
      setNewMessage('')
      setTimeout(scrollToBottom, 100)

      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
      }
    } catch (err) {
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

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getSenderColor = (senderType: string, isOwn: boolean) => {
    if (isOwn) return 'bg-purple-50 border-purple-200'
    if (senderType === 'REVIEWER') return 'bg-blue-50 border-blue-200'
    if (senderType === 'ADMIN') return 'bg-orange-50 border-orange-200'
    return 'bg-gray-50 border-gray-200'
  }

  const getSenderLabel = (senderType: string, senderName?: string) => {
    if (senderType === 'REVIEWER') return `Reviewer${senderName ? ` - ${senderName}` : ''}`
    if (senderType === 'ADMIN') return `Admin${senderName ? ` - ${senderName}` : ''}`
    return 'HTA'
  }

  return (
    <div className={`bg-white rounded-lg border shadow-sm flex flex-col overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900 text-[13px]">Conversation</h2>
            {messages.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
                {messages.length}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchMessages}
            disabled={isLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-3 overflow-y-auto bg-gray-50 min-h-0">
        {isLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-[12px] text-gray-500 text-center py-4">
            <p>No messages yet.</p>
            <p className="text-[11px] mt-1">Send a message below if you have questions.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`relative max-w-[85%] px-3 py-2 rounded-lg text-[12px] border ${getSenderColor(msg.senderType, msg.isOwnMessage)} ${
                    msg.isOwnMessage ? 'rounded-br-none' : 'rounded-bl-none'
                  }`}
                >
                  {/* Sender label for non-self messages */}
                  {!msg.isOwnMessage && (
                    <p className={`text-[10px] font-semibold mb-0.5 ${
                      msg.senderType === 'ADMIN' ? 'text-orange-600' : 'text-blue-600'
                    }`}>
                      {getSenderLabel(msg.senderType, msg.senderName)}
                    </p>
                  )}

                  {/* Message content */}
                  <p className="text-gray-700 whitespace-pre-wrap">{msg.content}</p>

                  {/* Attachments */}
                  {msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="text-[10px] text-gray-500 bg-white/50 px-2 py-1 rounded"
                        >
                          {att.fileName}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Timestamp */}
                  <p className={`text-[9px] mt-1 ${
                    msg.isOwnMessage ? 'text-purple-400 text-right' : 'text-gray-400'
                  }`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      {isCompleted ? (
        <div className="p-3 border-t bg-green-50 flex-shrink-0">
          <p className="text-[12px] text-green-700 text-center">
            Certificate approved - chat is now read-only
          </p>
        </div>
      ) : (
        <div className="p-2 border-t bg-gray-50 flex-shrink-0">
          {error && (
            <p className="text-[11px] text-red-600 mb-2 px-2">{error}</p>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1 p-2 border border-gray-200 rounded-lg text-xs resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 max-h-20 bg-white"
              rows={1}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = Math.min(target.scrollHeight, 80) + 'px'
              }}
            />
            <Button
              onClick={handleSend}
              disabled={!newMessage.trim() || isSending}
              size="sm"
              className="h-8 w-8 rounded-full p-0 flex-shrink-0"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
