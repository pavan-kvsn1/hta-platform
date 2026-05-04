/**
 * Offline Codes Service Unit Tests
 *
 * Tests for challenge-response pair generation, batch status,
 * and code validation. Mocks Prisma and shared utilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@hta/database', () => ({
  prisma: {
    offlineCodeBatch: { updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    offlineCode: { update: vi.fn() },
  },
}))

vi.mock('@hta/shared', () => ({
  generateChallengeResponsePairs: vi.fn(),
  hashCode: vi.fn(),
}))

import { prisma } from '@hta/database'
import { generateChallengeResponsePairs, hashCode } from '@hta/shared'
import { generateCodeBatch, getBatchStatus, validateCode } from '../../src/services/offline-codes'

const mockedPrisma = vi.mocked(prisma)
const mockedGeneratePairs = vi.mocked(generateChallengeResponsePairs)
const mockedHashCode = vi.mocked(hashCode)

const TENANT_ID = 'tenant-1'
const USER_ID = 'user-1'

function makePairs(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    sequence: i + 1,
    key: `K${String(i + 1).padStart(3, '0')}`,
    value: `val-${i + 1}`,
    valueHash: `hash-${i + 1}`,
  }))
}

describe('offline-codes service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-04T00:00:00.000Z'))
  })

  // ── generateCodeBatch ──────────────────────────────────────────────

  describe('generateCodeBatch', () => {
    const pairs50 = makePairs(50)

    beforeEach(() => {
      mockedGeneratePairs.mockReturnValue(pairs50 as any)
      mockedPrisma.offlineCodeBatch.updateMany.mockResolvedValue({ count: 1 } as any)
      mockedPrisma.offlineCodeBatch.create.mockResolvedValue({ id: 'batch-1' } as any)
    })

    it('deactivates existing batches before creating new one', async () => {
      await generateCodeBatch({ tenantId: TENANT_ID, userId: USER_ID })

      expect(mockedPrisma.offlineCodeBatch.updateMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, userId: USER_ID, isActive: true },
        data: { isActive: false },
      })

      // updateMany must be called before create
      const updateOrder = mockedPrisma.offlineCodeBatch.updateMany.mock.invocationCallOrder[0]
      const createOrder = mockedPrisma.offlineCodeBatch.create.mock.invocationCallOrder[0]
      expect(updateOrder).toBeLessThan(createOrder)
    })

    it('creates batch with 50 pairs and 30-day expiry', async () => {
      await generateCodeBatch({ tenantId: TENANT_ID, userId: USER_ID })

      expect(mockedGeneratePairs).toHaveBeenCalledWith(50)

      const createCall = mockedPrisma.offlineCodeBatch.create.mock.calls[0][0]
      expect(createCall.data.tenantId).toBe(TENANT_ID)
      expect(createCall.data.userId).toBe(USER_ID)

      const expectedExpiry = new Date('2026-06-03T00:00:00.000Z')
      expect(createCall.data.expiresAt).toEqual(expectedExpiry)

      expect(createCall.data.codes.create).toHaveLength(50)
      expect(createCall.data.codes.create[0]).toEqual({
        key: 'K001',
        value: 'val-1',
        valueHash: 'hash-1',
        sequence: 1,
      })
    })

    it('returns batchId, pairs, expiresAt, total', async () => {
      const result = await generateCodeBatch({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result.batchId).toBe('batch-1')
      expect(result.total).toBe(50)
      expect(result.expiresAt).toEqual(new Date('2026-06-03T00:00:00.000Z'))
      expect(result.pairs).toHaveLength(50)
      expect(result.pairs[0]).toEqual({
        sequence: 1,
        key: 'K001',
        value: 'val-1',
        used: false,
      })
    })
  })

  // ── getBatchStatus ─────────────────────────────────────────────────

  describe('getBatchStatus', () => {
    it('returns hasBatch:false when no active batch', async () => {
      mockedPrisma.offlineCodeBatch.findFirst.mockResolvedValue(null)

      const result = await getBatchStatus({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result).toEqual({ hasBatch: false })
    })

    it('returns batch data with remaining count', async () => {
      const codes = [
        { key: 'K001', value: 'val-1', sequence: 1, used: false },
        { key: 'K002', value: 'val-2', sequence: 2, used: true },
        { key: 'K003', value: 'val-3', sequence: 3, used: false },
      ]

      mockedPrisma.offlineCodeBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        expiresAt: new Date('2026-06-03T00:00:00.000Z'),
        codes,
      } as any)

      const result = await getBatchStatus({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result.hasBatch).toBe(true)
      expect(result.batchId).toBe('batch-1')
      expect(result.total).toBe(3)
      expect(result.remaining).toBe(2)
      expect(result.pairs).toEqual([
        { sequence: 1, key: 'K001', value: 'val-1', used: false },
        { sequence: 2, key: 'K002', value: 'val-2', used: true },
        { sequence: 3, key: 'K003', value: 'val-3', used: false },
      ])
      expect(result.isExpired).toBe(false)
    })

    it('marks batch as expired when past expiresAt', async () => {
      mockedPrisma.offlineCodeBatch.findFirst.mockResolvedValue({
        id: 'batch-old',
        expiresAt: new Date('2026-04-01T00:00:00.000Z'), // in the past
        codes: [{ key: 'K001', value: 'val-1', sequence: 1, used: false }],
      } as any)

      const result = await getBatchStatus({ tenantId: TENANT_ID, userId: USER_ID })

      expect(result.hasBatch).toBe(true)
      expect(result.isExpired).toBe(true)
    })
  })

  // ── validateCode ───────────────────────────────────────────────────

  describe('validateCode', () => {
    const baseOpts = { tenantId: TENANT_ID, userId: USER_ID, key: 'K001', value: 'val-1' }

    it('returns valid:true for correct code', async () => {
      mockedHashCode.mockReturnValue('hash-1')
      mockedPrisma.offlineCodeBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        expiresAt: new Date('2026-06-03T00:00:00.000Z'),
        codes: [{ id: 'code-1', key: 'K001', valueHash: 'hash-1', used: false }],
      } as any)
      mockedPrisma.offlineCode.update.mockResolvedValue({} as any)

      const result = await validateCode(baseOpts)

      expect(result).toEqual({ valid: true })
    })

    it("returns valid:false with 'No active batch' when no batch", async () => {
      mockedHashCode.mockReturnValue('hash-1')
      mockedPrisma.offlineCodeBatch.findFirst.mockResolvedValue(null)

      const result = await validateCode(baseOpts)

      expect(result).toEqual({ valid: false, reason: 'No active batch' })
    })

    it("returns valid:false with 'Batch expired' when expired", async () => {
      mockedHashCode.mockReturnValue('hash-1')
      mockedPrisma.offlineCodeBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        expiresAt: new Date('2026-04-01T00:00:00.000Z'), // in the past
        codes: [{ id: 'code-1', key: 'K001', valueHash: 'hash-1', used: false }],
      } as any)

      const result = await validateCode(baseOpts)

      expect(result).toEqual({ valid: false, reason: 'Batch expired' })
    })

    it("returns valid:false with 'Code already used' for used code", async () => {
      mockedHashCode.mockReturnValue('hash-1')
      mockedPrisma.offlineCodeBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        expiresAt: new Date('2026-06-03T00:00:00.000Z'),
        codes: [{ id: 'code-1', key: 'K001', valueHash: 'hash-1', used: true }],
      } as any)

      const result = await validateCode(baseOpts)

      expect(result).toEqual({ valid: false, reason: 'Code already used' })
    })

    it("returns valid:false with 'Incorrect value' for wrong hash", async () => {
      mockedHashCode.mockReturnValue('wrong-hash')
      mockedPrisma.offlineCodeBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        expiresAt: new Date('2026-06-03T00:00:00.000Z'),
        codes: [{ id: 'code-1', key: 'K001', valueHash: 'hash-1', used: false }],
      } as any)

      const result = await validateCode(baseOpts)

      expect(result).toEqual({ valid: false, reason: 'Incorrect value' })
    })

    it('marks code as used after successful validation', async () => {
      mockedHashCode.mockReturnValue('hash-1')
      mockedPrisma.offlineCodeBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        expiresAt: new Date('2026-06-03T00:00:00.000Z'),
        codes: [{ id: 'code-1', key: 'K001', valueHash: 'hash-1', used: false }],
      } as any)
      mockedPrisma.offlineCode.update.mockResolvedValue({} as any)

      await validateCode(baseOpts)

      expect(mockedPrisma.offlineCode.update).toHaveBeenCalledWith({
        where: { id: 'code-1' },
        data: { used: true, usedAt: expect.any(Date) },
      })
    })
  })
})
