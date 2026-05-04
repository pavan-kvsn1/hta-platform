/**
 * Chat Service Unit Tests
 *
 * Tests for thread management, messaging, read tracking,
 * access control, and unread count functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Prisma ───────────────────────────────────────────────────────────────
vi.mock('@hta/database', () => ({
  prisma: {
    chatThread: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    chatMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    customerUser: { findUnique: vi.fn() },
  },
}))

import { prisma } from '@hta/database'
import {
  getOrCreateThread,
  sendMessage,
  getMessages,
  markMessagesAsRead,
  getUnreadMessageCount,
  getUnreadCountsByThread,
  canAccessChatThread,
} from '../../src/services/chat.js'

const mp = vi.mocked(prisma)

// ── Shared test data ──────────────────────────────────────────────────────────

const BASE_THREAD = {
  id: 'thread-1',
  certificateId: 'cert-1',
  threadType: 'ASSIGNEE_REVIEWER',
  createdAt: new Date('2025-01-01T10:00:00Z'),
  messages: [],
  certificate: {
    createdBy: { id: 'user-a', name: 'Alice', role: 'ENGINEER' },
    reviewer: { id: 'user-b', name: 'Bob', role: 'REVIEWER' },
  },
}

// ── getOrCreateThread ─────────────────────────────────────────────────────────

describe('getOrCreateThread', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns existing thread when one is found', async () => {
    mp.chatThread.findUnique.mockResolvedValue(BASE_THREAD as any)

    const result = await getOrCreateThread({
      certificateId: 'cert-1',
      threadType: 'ASSIGNEE_REVIEWER',
    })

    expect(mp.chatThread.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { certificateId_threadType: { certificateId: 'cert-1', threadType: 'ASSIGNEE_REVIEWER' } },
      })
    )
    expect(mp.chatThread.create).not.toHaveBeenCalled()
    expect(result.id).toBe('thread-1')
    expect(result.certificateId).toBe('cert-1')
  })

  it('creates a new thread when none exists', async () => {
    mp.chatThread.findUnique.mockResolvedValue(null)
    mp.chatThread.create.mockResolvedValue(BASE_THREAD as any)

    const result = await getOrCreateThread({
      certificateId: 'cert-1',
      threadType: 'ASSIGNEE_REVIEWER',
    })

    expect(mp.chatThread.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { certificateId: 'cert-1', threadType: 'ASSIGNEE_REVIEWER' },
      })
    )
    expect(result.id).toBe('thread-1')
  })

  it('sets correct threadType on returned info', async () => {
    const reviewerCustomerThread = {
      ...BASE_THREAD,
      threadType: 'REVIEWER_CUSTOMER',
    }
    mp.chatThread.findUnique.mockResolvedValue(reviewerCustomerThread as any)

    const result = await getOrCreateThread({
      certificateId: 'cert-1',
      threadType: 'REVIEWER_CUSTOMER',
    })

    expect(result.threadType).toBe('REVIEWER_CUSTOMER')
  })

  it('sets lastMessageAt from the most recent message', async () => {
    const lastMsg = new Date('2025-03-15T12:00:00Z')
    const threadWithMsg = {
      ...BASE_THREAD,
      messages: [{ createdAt: lastMsg }],
    }
    mp.chatThread.findUnique.mockResolvedValue(threadWithMsg as any)

    const result = await getOrCreateThread({
      certificateId: 'cert-1',
      threadType: 'ASSIGNEE_REVIEWER',
    })

    expect(result.lastMessageAt).toEqual(lastMsg)
  })

  it('sets lastMessageAt to null when no messages exist', async () => {
    mp.chatThread.findUnique.mockResolvedValue(BASE_THREAD as any)

    const result = await getOrCreateThread({
      certificateId: 'cert-1',
      threadType: 'ASSIGNEE_REVIEWER',
    })

    expect(result.lastMessageAt).toBeNull()
  })

  it('includes participants (creator and reviewer)', async () => {
    mp.chatThread.findUnique.mockResolvedValue(BASE_THREAD as any)

    const result = await getOrCreateThread({
      certificateId: 'cert-1',
      threadType: 'ASSIGNEE_REVIEWER',
    })

    expect(result.participants).toHaveLength(2)
    expect(result.participants[0]).toMatchObject({ id: 'user-a', name: 'Alice', role: 'ENGINEER' })
    expect(result.participants[1]).toMatchObject({ id: 'user-b', name: 'Bob', role: 'REVIEWER' })
  })

  it('includes only creator when reviewer is null', async () => {
    const threadNoReviewer = {
      ...BASE_THREAD,
      certificate: {
        createdBy: { id: 'user-a', name: 'Alice', role: 'ENGINEER' },
        reviewer: null,
      },
    }
    mp.chatThread.findUnique.mockResolvedValue(threadNoReviewer as any)

    const result = await getOrCreateThread({
      certificateId: 'cert-1',
      threadType: 'ASSIGNEE_REVIEWER',
    })

    expect(result.participants).toHaveLength(1)
  })
})

// ── sendMessage ───────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  beforeEach(() => vi.clearAllMocks())

  const THREAD_WITH_CERT = {
    id: 'thread-1',
    certificate: {
      id: 'cert-1',
      certificateNumber: 'HTA/CAL/001',
      createdById: 'user-a',
      reviewerId: 'user-b',
    },
  }

  const CREATED_MESSAGE = {
    id: 'msg-1',
    threadId: 'thread-1',
    senderId: 'user-a',
    customerId: null,
    senderType: 'ASSIGNEE',
    content: 'Hello reviewer',
    createdAt: new Date('2025-01-01T11:00:00Z'),
    readAt: null,
    sender: { id: 'user-a', name: 'Alice', role: 'ENGINEER' },
    customer: null,
    attachments: [],
  }

  it('creates a message with correct sender and content', async () => {
    mp.chatThread.findUnique.mockResolvedValue(THREAD_WITH_CERT as any)
    mp.user.findUnique.mockResolvedValue({ name: 'Alice' } as any)
    mp.chatMessage.create.mockResolvedValue(CREATED_MESSAGE as any)

    const result = await sendMessage({
      threadId: 'thread-1',
      senderId: 'user-a',
      content: 'Hello reviewer',
    })

    expect(mp.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          threadId: 'thread-1',
          senderId: 'user-a',
          content: 'Hello reviewer',
          senderType: 'ASSIGNEE',
        }),
      })
    )
    expect(result.content).toBe('Hello reviewer')
    expect(result.threadId).toBe('thread-1')
  })

  it('assigns senderType REVIEWER for reviewer sender', async () => {
    mp.chatThread.findUnique.mockResolvedValue(THREAD_WITH_CERT as any)
    mp.user.findUnique.mockResolvedValue({ name: 'Bob' } as any)
    mp.chatMessage.create.mockResolvedValue({
      ...CREATED_MESSAGE,
      senderId: 'user-b',
      senderType: 'REVIEWER',
      sender: { id: 'user-b', name: 'Bob', role: 'REVIEWER' },
    } as any)

    await sendMessage({
      threadId: 'thread-1',
      senderId: 'user-b',
      content: 'Looks good',
    })

    expect(mp.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderType: 'REVIEWER' }),
      })
    )
  })

  it('assigns senderType ADMIN for non-assigned staff senders', async () => {
    mp.chatThread.findUnique.mockResolvedValue(THREAD_WITH_CERT as any)
    mp.user.findUnique.mockResolvedValue({ name: 'Admin' } as any)
    mp.chatMessage.create.mockResolvedValue({
      ...CREATED_MESSAGE,
      senderId: 'user-admin',
      senderType: 'ADMIN',
      sender: { id: 'user-admin', name: 'Admin', role: 'ADMIN' },
    } as any)

    await sendMessage({
      threadId: 'thread-1',
      senderId: 'user-admin',
      content: 'Admin note',
    })

    expect(mp.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderType: 'ADMIN' }),
      })
    )
  })

  it('handles customer sender using customerId', async () => {
    mp.chatThread.findUnique.mockResolvedValue(THREAD_WITH_CERT as any)
    mp.customerUser.findUnique.mockResolvedValue({ name: 'Cust A' } as any)
    mp.chatMessage.create.mockResolvedValue({
      ...CREATED_MESSAGE,
      senderId: null,
      customerId: 'cust-1',
      senderType: 'CUSTOMER',
      sender: null,
      customer: { id: 'cust-1', name: 'Cust A' },
    } as any)

    const result = await sendMessage({
      threadId: 'thread-1',
      senderId: 'cust-1',
      senderRole: 'CUSTOMER',
      content: 'Please revise',
    })

    expect(mp.customerUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cust-1' } })
    )
    expect(mp.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          senderId: undefined,
          customerId: 'cust-1',
          senderType: 'CUSTOMER',
        }),
      })
    )
    expect(result.senderRole).toBe('CUSTOMER')
  })

  it('throws when thread is not found', async () => {
    mp.chatThread.findUnique.mockResolvedValue(null)

    await expect(
      sendMessage({ threadId: 'missing', senderId: 'user-a', content: 'Hi' })
    ).rejects.toThrow('Thread not found')
  })

  it('throws when user sender is not found', async () => {
    mp.chatThread.findUnique.mockResolvedValue(THREAD_WITH_CERT as any)
    mp.user.findUnique.mockResolvedValue(null)

    await expect(
      sendMessage({ threadId: 'thread-1', senderId: 'user-ghost', content: 'Hi' })
    ).rejects.toThrow('Sender not found')
  })

  it('includes createdAt timestamp in result', async () => {
    mp.chatThread.findUnique.mockResolvedValue(THREAD_WITH_CERT as any)
    mp.user.findUnique.mockResolvedValue({ name: 'Alice' } as any)
    mp.chatMessage.create.mockResolvedValue(CREATED_MESSAGE as any)

    const result = await sendMessage({
      threadId: 'thread-1',
      senderId: 'user-a',
      content: 'Test',
    })

    expect(result.createdAt).toBeInstanceOf(Date)
  })
})

// ── getMessages ───────────────────────────────────────────────────────────────

describe('getMessages', () => {
  beforeEach(() => vi.clearAllMocks())

  const makeMsg = (id: string, createdAt: Date) => ({
    id,
    threadId: 'thread-1',
    senderId: 'user-a',
    customerId: null,
    content: `Message ${id}`,
    createdAt,
    readAt: null,
    sender: { id: 'user-a', name: 'Alice', role: 'ENGINEER' },
    customer: null,
    attachments: [],
  })

  it('returns messages in chronological order (newest first)', async () => {
    const msgs = [
      makeMsg('msg-3', new Date('2025-01-03')),
      makeMsg('msg-2', new Date('2025-01-02')),
      makeMsg('msg-1', new Date('2025-01-01')),
    ]
    mp.chatMessage.findMany.mockResolvedValue(msgs as any)

    const result = await getMessages('thread-1')

    expect(result.messages).toHaveLength(3)
    expect(result.messages[0].id).toBe('msg-3')
    expect(result.messages[2].id).toBe('msg-1')
  })

  it('sets hasMore to true when more messages exist beyond limit', async () => {
    // Return limit+1 messages
    const msgs = Array.from({ length: 51 }, (_, i) =>
      makeMsg(`msg-${i}`, new Date(`2025-01-${String(i + 1).padStart(2, '0')}`))
    )
    mp.chatMessage.findMany.mockResolvedValue(msgs as any)

    const result = await getMessages('thread-1', { limit: 50 })

    expect(result.hasMore).toBe(true)
    expect(result.messages).toHaveLength(50)
  })

  it('sets hasMore to false when within limit', async () => {
    const msgs = [makeMsg('msg-1', new Date('2025-01-01'))]
    mp.chatMessage.findMany.mockResolvedValue(msgs as any)

    const result = await getMessages('thread-1', { limit: 50 })

    expect(result.hasMore).toBe(false)
  })

  it('uses cursor to filter messages before cursor message', async () => {
    const cursorMsg = makeMsg('cursor-msg', new Date('2025-01-05'))
    mp.chatMessage.findUnique.mockResolvedValue(cursorMsg as any)
    mp.chatMessage.findMany.mockResolvedValue([] as any)

    await getMessages('thread-1', { cursor: 'cursor-msg' })

    expect(mp.chatMessage.findUnique).toHaveBeenCalledWith({ where: { id: 'cursor-msg' } })
    expect(mp.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lt: cursorMsg.createdAt },
        }),
      })
    )
  })

  it('returns empty messages array when no messages exist', async () => {
    mp.chatMessage.findMany.mockResolvedValue([] as any)

    const result = await getMessages('thread-1')

    expect(result.messages).toHaveLength(0)
    expect(result.hasMore).toBe(false)
  })

  it('maps attachment fields correctly', async () => {
    const msgWithAttachment = {
      ...makeMsg('msg-1', new Date()),
      attachments: [
        {
          id: 'att-1',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
        },
      ],
    }
    mp.chatMessage.findMany.mockResolvedValue([msgWithAttachment] as any)

    const result = await getMessages('thread-1')

    expect(result.messages[0].attachments[0]).toMatchObject({
      id: 'att-1',
      fileName: 'report.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
      url: '/api/chat/attachments/att-1',
    })
  })
})

// ── markMessagesAsRead ────────────────────────────────────────────────────────

describe('markMessagesAsRead', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marks unread messages sent by others as read', async () => {
    mp.chatMessage.updateMany.mockResolvedValue({ count: 3 } as any)

    const count = await markMessagesAsRead('thread-1', 'user-a')

    expect(mp.chatMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          threadId: 'thread-1',
          senderId: { not: 'user-a' },
          readAt: null,
        },
        data: expect.objectContaining({ readAt: expect.any(Date) }),
      })
    )
    expect(count).toBe(3)
  })

  it('does not affect messages sent by the current user', async () => {
    mp.chatMessage.updateMany.mockResolvedValue({ count: 0 } as any)

    await markMessagesAsRead('thread-1', 'user-a')

    const call = mp.chatMessage.updateMany.mock.calls[0][0]
    expect(call.where.senderId).toEqual({ not: 'user-a' })
  })

  it('returns 0 when all messages are already read', async () => {
    mp.chatMessage.updateMany.mockResolvedValue({ count: 0 } as any)

    const count = await markMessagesAsRead('thread-1', 'user-a')
    expect(count).toBe(0)
  })
})

// ── canAccessChatThread ───────────────────────────────────────────────────────

describe('canAccessChatThread', () => {
  const cert = { createdById: 'user-a', reviewerId: 'user-b' }

  it('allows ADMIN access to ASSIGNEE_REVIEWER thread', () => {
    expect(canAccessChatThread({ id: 'admin-1', role: 'ADMIN' }, cert, 'ASSIGNEE_REVIEWER')).toBe(true)
  })

  it('allows ADMIN access to REVIEWER_CUSTOMER thread', () => {
    expect(canAccessChatThread({ id: 'admin-1', role: 'ADMIN' }, cert, 'REVIEWER_CUSTOMER')).toBe(true)
  })

  it('allows assignee access to ASSIGNEE_REVIEWER thread', () => {
    expect(canAccessChatThread({ id: 'user-a', role: 'ENGINEER' }, cert, 'ASSIGNEE_REVIEWER')).toBe(true)
  })

  it('allows reviewer access to ASSIGNEE_REVIEWER thread', () => {
    expect(canAccessChatThread({ id: 'user-b', role: 'REVIEWER' }, cert, 'ASSIGNEE_REVIEWER')).toBe(true)
  })

  it('denies non-participant access to ASSIGNEE_REVIEWER thread', () => {
    expect(canAccessChatThread({ id: 'other-user', role: 'ENGINEER' }, cert, 'ASSIGNEE_REVIEWER')).toBe(false)
  })

  it('allows reviewer access to REVIEWER_CUSTOMER thread', () => {
    expect(canAccessChatThread({ id: 'user-b', role: 'REVIEWER' }, cert, 'REVIEWER_CUSTOMER')).toBe(true)
  })

  it('allows CUSTOMER role to access REVIEWER_CUSTOMER thread', () => {
    expect(canAccessChatThread({ id: 'cust-1', role: 'CUSTOMER' }, cert, 'REVIEWER_CUSTOMER')).toBe(true)
  })

  it('denies assignee access to REVIEWER_CUSTOMER thread', () => {
    expect(canAccessChatThread({ id: 'user-a', role: 'ENGINEER' }, cert, 'REVIEWER_CUSTOMER')).toBe(false)
  })

  it('handles null reviewerId in certificate', () => {
    const certNoReviewer = { createdById: 'user-a', reviewerId: null }
    // Assignee can still access
    expect(canAccessChatThread({ id: 'user-a', role: 'ENGINEER' }, certNoReviewer, 'ASSIGNEE_REVIEWER')).toBe(true)
    // Random user cannot
    expect(canAccessChatThread({ id: 'other', role: 'ENGINEER' }, certNoReviewer, 'ASSIGNEE_REVIEWER')).toBe(false)
  })
})

// ── getUnreadMessageCount ─────────────────────────────────────────────────────

describe('getUnreadMessageCount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns total unread count for the user', async () => {
    mp.chatMessage.count.mockResolvedValue(7 as any)

    const count = await getUnreadMessageCount('user-a', 'tenant-1')

    expect(mp.chatMessage.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          senderId: { not: 'user-a' },
          readAt: null,
        }),
      })
    )
    expect(count).toBe(7)
  })

  it('returns 0 when no unread messages exist', async () => {
    mp.chatMessage.count.mockResolvedValue(0 as any)

    const count = await getUnreadMessageCount('user-a', 'tenant-1')
    expect(count).toBe(0)
  })
})

// ── getUnreadCountsByThread ───────────────────────────────────────────────────

describe('getUnreadCountsByThread', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a map of threadId to unread count', async () => {
    mp.chatThread.findMany.mockResolvedValue([
      { id: 'thread-1' },
      { id: 'thread-2' },
    ] as any)
    mp.chatMessage.count
      .mockResolvedValueOnce(3 as any)  // thread-1 unread
      .mockResolvedValueOnce(0 as any)  // thread-2 all read

    const result = await getUnreadCountsByThread('user-a', 'tenant-1')

    expect(result).toEqual({ 'thread-1': 3 })
    expect(result['thread-2']).toBeUndefined()
  })

  it('returns empty object when user has no threads', async () => {
    mp.chatThread.findMany.mockResolvedValue([] as any)

    const result = await getUnreadCountsByThread('user-a', 'tenant-1')

    expect(result).toEqual({})
    expect(mp.chatMessage.count).not.toHaveBeenCalled()
  })

  it('only includes threads with unread count > 0', async () => {
    mp.chatThread.findMany.mockResolvedValue([
      { id: 'thread-1' },
      { id: 'thread-2' },
      { id: 'thread-3' },
    ] as any)
    mp.chatMessage.count
      .mockResolvedValueOnce(0 as any)
      .mockResolvedValueOnce(5 as any)
      .mockResolvedValueOnce(0 as any)

    const result = await getUnreadCountsByThread('user-a', 'tenant-1')

    expect(Object.keys(result)).toHaveLength(1)
    expect(result['thread-2']).toBe(5)
  })
})
