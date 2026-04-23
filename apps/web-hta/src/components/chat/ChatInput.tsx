'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useRef, KeyboardEvent, ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface UploadedFile {
  fileName: string
  fileSize: number
  mimeType: string
  storagePath: string
}

interface ChatInputProps {
  onSend: (content: string, attachments?: UploadedFile[]) => Promise<void>
  threadId?: string
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  onSend,
  threadId,
  disabled = false,
  placeholder = 'Type a message...',
}: ChatInputProps) {
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Limit to 5 files
    const newFiles = [...selectedFiles, ...files].slice(0, 5)
    setSelectedFiles(newFiles)

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const uploadFiles = async (): Promise<UploadedFile[]> => {
    if (!threadId || selectedFiles.length === 0) return []

    setIsUploading(true)
    try {
      const formData = new FormData()
      selectedFiles.forEach((file) => {
        formData.append('files', file)
      })

      const res = await apiFetch(`/api/chat/threads/${threadId}/attachments`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to upload files')
      }

      const data = await res.json()
      return data.files
    } finally {
      setIsUploading(false)
    }
  }

  const handleSend = async () => {
    const trimmedContent = content.trim()
    const hasContent = trimmedContent.length > 0
    const hasFiles = selectedFiles.length > 0

    if ((!hasContent && !hasFiles) || isSending) return

    setIsSending(true)
    try {
      // Upload files first if any
      let attachments: UploadedFile[] = []
      if (hasFiles) {
        attachments = await uploadFiles()
      }

      // Send message
      await onSend(trimmedContent || '📎 Attachment', attachments.length > 0 ? attachments : undefined)

      // Clear state
      setContent('')
      setSelectedFiles([])
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter only (no modifier keys)
    // Shift+Enter, Alt+Enter, Ctrl+Enter = new line
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }

  const isDisabled = disabled || isSending || isUploading
  const canSend = (content.trim().length > 0 || selectedFiles.length > 0) && !isDisabled

  return (
    <div className="border-t bg-background">
      {/* Selected files preview */}
      {selectedFiles.length > 0 && (
        <div className="px-3 pt-2 flex flex-wrap gap-1.5">
          {selectedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-xs"
            >
              <FileIcon mimeType={file.type} />
              <span className="max-w-[100px] truncate">{file.name}</span>
              <button
                onClick={() => removeFile(index)}
                className="text-muted-foreground hover:text-foreground"
                disabled={isDisabled}
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-3">
        {/* File picker button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 h-[34px] w-[34px] rounded-lg"
          onClick={() => fileInputRef.current?.click()}
          disabled={isDisabled || selectedFiles.length >= 5}
        >
          <PaperclipIcon className="w-4 h-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={isDisabled}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-lg border px-3 py-2 text-sm leading-5',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            'placeholder:text-muted-foreground',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'max-h-[100px]'
          )}
        />

        <Button
          onClick={handleSend}
          disabled={!canSend}
          size="icon"
          className="shrink-0 rounded-lg h-[34px] w-[34px]"
        >
          {isSending || isUploading ? (
            <LoadingSpinner className="w-4 h-4" />
          ) : (
            <SendIcon className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  )
}

function PaperclipIcon({ className }: { className?: string }) {
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
        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
      />
    </svg>
  )
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) {
    return (
      <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )
  }
  return (
    <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  )
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}
