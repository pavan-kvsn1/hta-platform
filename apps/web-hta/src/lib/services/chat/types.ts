/**
 * Chat Service Types
 *
 * Type definitions for the chat system.
 */

export type ThreadType = 'ASSIGNEE_REVIEWER' | 'REVIEWER_CUSTOMER'

export interface ChatThreadInfo {
  id: string
  certificateId: string
  threadType: ThreadType
  createdAt: Date
  lastMessageAt: Date | null
  unreadCount: number
  participants: {
    id: string
    name: string | null
    role: string
  }[]
}

export interface ChatMessageInfo {
  id: string
  threadId: string
  senderId: string
  senderName: string | null
  senderRole: string
  content: string
  createdAt: Date
  readAt: Date | null
  attachments: ChatAttachmentInfo[]
}

export interface ChatAttachmentInfo {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  url: string
}

export interface SendMessageInput {
  threadId: string
  senderId: string
  content: string
  attachments?: {
    fileName: string
    mimeType: string
    fileSize: number
    storagePath: string
  }[]
}

export interface CreateThreadInput {
  certificateId: string
  threadType: ThreadType
}

export interface GetMessagesOptions {
  limit?: number
  cursor?: string // For pagination - message ID to start after
}
