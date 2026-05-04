/**
 * Data Subject Rights (DSR) Unit Tests
 *
 * Tests for GDPR Articles 15-17 - Rights of the Data Subject
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the logger
vi.mock('../src/logger/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Use vi.hoisted for prisma mock
const { mockPrisma } = vi.hoisted(() => {
  const mockTx = {
    signature: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    chatMessage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    approvalToken: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    notification: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    passwordResetToken: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    customerUser: { delete: vi.fn().mockResolvedValue({}) },
  }

  return {
    mockPrisma: {
      customerUser: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      certificate: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (fn: any) => fn(mockTx)),
      _tx: mockTx,
    },
  }
})

vi.mock('@hta/database', () => ({
  prisma: mockPrisma,
  Prisma: {},
}))

import {
  exportCustomerUserData,
  exportUserData,
  deleteCustomerUserData,
  rectifyCustomerUserData,
  rectifyUserData,
} from '../src/compliance/dsr'

describe('Data Subject Rights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' })
  })

  describe('exportCustomerUserData', () => {
    it('exports customer user data', async () => {
      mockPrisma.customerUser.findUnique
        .mockResolvedValueOnce({
          id: 'cust-1',
          email: 'cust@test.com',
          name: 'Customer User',
          companyName: 'Acme',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-06-01'),
          customerAccountId: 'acc-1',
          isPoc: true,
          activatedAt: new Date(),
        })
        .mockResolvedValueOnce({ email: 'cust@test.com' }) // second call inside promise

      mockPrisma.certificate.findMany.mockResolvedValue([
        {
          id: 'cert-1',
          certificateNumber: 'CERT-001',
          status: 'APPROVED',
          customerName: 'Acme',
          customerAddress: '123 St',
          createdAt: new Date('2024-03-01'),
          updatedAt: new Date('2024-04-01'),
        },
      ])

      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          action: 'LOGIN',
          entityType: 'SESSION',
          createdAt: new Date('2024-05-01'),
        },
      ])

      const result = await exportCustomerUserData('cust-1', 'admin-1', {
        tenantId: 'tenant-1',
      })

      expect(result.user.id).toBe('cust-1')
      expect(result.user.email).toBe('cust@test.com')
      expect(result.certificates).toHaveLength(1)
      expect(result.certificates[0].certificateNumber).toBe('CERT-001')
      expect(result.auditLogs).toHaveLength(1)
      expect(result.format).toBe('json')
      expect(result.exportedAt).toBeInstanceOf(Date)
    })

    it('throws when customer user not found', async () => {
      mockPrisma.customerUser.findUnique.mockResolvedValue(null)
      mockPrisma.certificate.findMany.mockResolvedValue([])
      mockPrisma.auditLog.findMany.mockResolvedValue([])

      await expect(
        exportCustomerUserData('missing-cust', 'admin-1', { tenantId: 'tenant-1' })
      ).rejects.toThrow('Customer user not found')
    })
  })

  describe('exportUserData', () => {
    it('exports internal user data', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        name: 'Test User',
        role: 'ENGINEER',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
        activatedAt: new Date(),
      })

      mockPrisma.certificate.findMany.mockResolvedValue([])
      mockPrisma.auditLog.findMany.mockResolvedValue([])

      const result = await exportUserData('user-1', 'admin-1', {
        tenantId: 'tenant-1',
      })

      expect(result.user.id).toBe('user-1')
      expect(result.user.email).toBe('user@test.com')
      expect(result.user.companyName).toBeNull()
      expect(result.format).toBe('json')
    })

    it('throws when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)
      mockPrisma.certificate.findMany.mockResolvedValue([])
      mockPrisma.auditLog.findMany.mockResolvedValue([])

      await expect(
        exportUserData('missing-user', 'admin-1', { tenantId: 'tenant-1' })
      ).rejects.toThrow('User not found')
    })
  })

  describe('deleteCustomerUserData', () => {
    it('pseudonymizes when certificates exist within retention period', async () => {
      mockPrisma.customerUser.findUnique.mockResolvedValue({
        email: 'cust@test.com',
        tenantId: 'tenant-1',
      })

      mockPrisma.certificate.count.mockResolvedValue(5) // Has certificates within retention
      mockPrisma.customerUser.update.mockResolvedValue({})

      const result = await deleteCustomerUserData('cust-1', 'admin-1', {
        tenantId: 'tenant-1',
      })

      expect(result.success).toBe(true)
      expect(result.pseudonymized).toBe(true)
      expect(result.retainedData).toBeDefined()
      expect(result.retainedData![0]).toContain('5 certificates')

      // Verify pseudonymization was applied
      expect(mockPrisma.customerUser.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: expect.objectContaining({
          name: 'Deleted User',
          isActive: false,
          passwordHash: null,
        }),
      })
    })

    it('fully deletes when no certificates within retention period', async () => {
      mockPrisma.customerUser.findUnique.mockResolvedValue({
        email: 'cust@test.com',
        tenantId: 'tenant-1',
      })

      mockPrisma.certificate.count.mockResolvedValue(0) // No certificates

      const result = await deleteCustomerUserData('cust-1', 'admin-1', {
        tenantId: 'tenant-1',
      })

      expect(result.success).toBe(true)
      expect(result.pseudonymized).toBe(false)
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })

    it('throws when customer user not found', async () => {
      mockPrisma.customerUser.findUnique.mockResolvedValue(null)

      await expect(
        deleteCustomerUserData('missing', 'admin-1', { tenantId: 'tenant-1' })
      ).rejects.toThrow('Customer user not found')
    })

    it('fully deletes when immediate flag is set even with certificates', async () => {
      mockPrisma.customerUser.findUnique.mockResolvedValue({
        email: 'cust@test.com',
        tenantId: 'tenant-1',
      })

      mockPrisma.certificate.count.mockResolvedValue(5)

      const result = await deleteCustomerUserData('cust-1', 'admin-1', {
        tenantId: 'tenant-1',
        immediate: true,
      })

      expect(result.success).toBe(true)
      expect(result.pseudonymized).toBe(false)
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })
  })

  describe('rectifyCustomerUserData', () => {
    it('updates allowed fields', async () => {
      mockPrisma.customerUser.findUnique.mockResolvedValue({
        email: 'old@test.com',
        name: 'Old Name',
        companyName: 'Old Co',
      })
      mockPrisma.customerUser.update.mockResolvedValue({})

      await rectifyCustomerUserData(
        'cust-1',
        { email: 'new@test.com', name: 'New Name' },
        'admin-1',
        { tenantId: 'tenant-1' }
      )

      expect(mockPrisma.customerUser.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { email: 'new@test.com', name: 'New Name' },
      })
    })

    it('does nothing when no updates provided', async () => {
      mockPrisma.customerUser.findUnique.mockResolvedValue({
        email: 'old@test.com',
        name: 'Old Name',
        companyName: 'Old Co',
      })

      await rectifyCustomerUserData(
        'cust-1',
        {},
        'admin-1',
        { tenantId: 'tenant-1' }
      )

      expect(mockPrisma.customerUser.update).not.toHaveBeenCalled()
    })

    it('throws when customer not found', async () => {
      mockPrisma.customerUser.findUnique.mockResolvedValue(null)

      await expect(
        rectifyCustomerUserData(
          'missing',
          { name: 'New' },
          'admin-1',
          { tenantId: 'tenant-1' }
        )
      ).rejects.toThrow('Customer user not found')
    })
  })

  describe('rectifyUserData', () => {
    it('updates allowed fields for internal users', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'old@test.com',
        name: 'Old Name',
      })
      mockPrisma.user.update.mockResolvedValue({})

      await rectifyUserData(
        'user-1',
        { name: 'New Name' },
        'admin-1',
        { tenantId: 'tenant-1' }
      )

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { name: 'New Name' },
      })
    })

    it('does nothing when no updates provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'old@test.com',
        name: 'Old Name',
      })

      await rectifyUserData(
        'user-1',
        {},
        'admin-1',
        { tenantId: 'tenant-1' }
      )

      expect(mockPrisma.user.update).not.toHaveBeenCalled()
    })

    it('throws when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(
        rectifyUserData(
          'missing',
          { email: 'new@test.com' },
          'admin-1',
          { tenantId: 'tenant-1' }
        )
      ).rejects.toThrow('User not found')
    })
  })
})
