/**
 * Offline Codes Service
 *
 * Challenge-response pairs for offline 2FA.
 * Pairs are visible for the full 30-day batch lifetime.
 * Each pair is single-use — struck off after validation.
 */

import { prisma } from '@hta/database'
import { generateChallengeResponsePairs, hashCode } from '@hta/shared'

const PAIR_COUNT = 50
const BATCH_EXPIRY_DAYS = 30

/**
 * Generate a new batch of challenge-response pairs.
 * Deactivates any existing active batch first.
 */
export async function generateCodeBatch(opts: {
  tenantId: string
  userId: string
}): Promise<{
  batchId: string
  pairs: Array<{ sequence: number; key: string; value: string; used: boolean }>
  expiresAt: Date
  total: number
}> {
  const { tenantId, userId } = opts

  // Deactivate existing active batches
  await prisma.offlineCodeBatch.updateMany({
    where: { tenantId, userId, isActive: true },
    data: { isActive: false },
  })

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + BATCH_EXPIRY_DAYS)

  const generated = generateChallengeResponsePairs(PAIR_COUNT)

  const batch = await prisma.offlineCodeBatch.create({
    data: {
      tenantId,
      userId,
      expiresAt,
      codes: {
        create: generated.map((p) => ({
          key: p.key,
          value: p.value,
          valueHash: p.valueHash,
          sequence: p.sequence,
        })),
      },
    },
  })

  return {
    batchId: batch.id,
    pairs: generated.map((p) => ({ sequence: p.sequence, key: p.key, value: p.value, used: false })),
    expiresAt,
    total: PAIR_COUNT,
  }
}

/**
 * Get the active batch with all pairs (values always visible).
 */
export async function getBatchStatus(opts: {
  tenantId: string
  userId: string
}): Promise<{
  hasBatch: boolean
  batchId?: string
  total?: number
  remaining?: number
  pairs?: Array<{ sequence: number; key: string; value: string; used: boolean }>
  expiresAt?: Date
  isExpired?: boolean
}> {
  const batch = await prisma.offlineCodeBatch.findFirst({
    where: { tenantId: opts.tenantId, userId: opts.userId, isActive: true },
    include: {
      codes: {
        select: { key: true, value: true, sequence: true, used: true },
        orderBy: { sequence: 'asc' },
      },
    },
  })

  if (!batch) {
    return { hasBatch: false }
  }

  const usedCount = batch.codes.filter((c) => c.used).length

  return {
    hasBatch: true,
    batchId: batch.id,
    total: batch.codes.length,
    remaining: batch.codes.length - usedCount,
    pairs: batch.codes.map((c) => ({
      sequence: c.sequence,
      key: c.key,
      value: c.value,
      used: c.used,
    })),
    expiresAt: batch.expiresAt,
    isExpired: batch.expiresAt < new Date(),
  }
}

/**
 * Validate a challenge-response and mark the pair as used.
 */
export async function validateCode(opts: {
  tenantId: string
  userId: string
  key: string
  value: string
}): Promise<{ valid: boolean; reason?: string }> {
  const hash = hashCode(opts.value)

  const batch = await prisma.offlineCodeBatch.findFirst({
    where: { tenantId: opts.tenantId, userId: opts.userId, isActive: true },
    include: {
      codes: {
        where: { key: opts.key.toUpperCase() },
        take: 1,
      },
    },
  })

  if (!batch) {
    return { valid: false, reason: 'No active batch' }
  }

  if (batch.expiresAt < new Date()) {
    return { valid: false, reason: 'Batch expired' }
  }

  const code = batch.codes[0]
  if (!code) {
    return { valid: false, reason: 'Invalid key' }
  }

  if (code.used) {
    return { valid: false, reason: 'Code already used' }
  }

  if (code.valueHash !== hash) {
    return { valid: false, reason: 'Incorrect value' }
  }

  // Strike it off
  await prisma.offlineCode.update({
    where: { id: code.id },
    data: { used: true, usedAt: new Date() },
  })

  return { valid: true }
}
