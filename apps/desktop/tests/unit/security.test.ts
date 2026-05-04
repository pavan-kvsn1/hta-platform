import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock electron ──────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
  Session: {},
}))

// ─── Mock fs ────────────────────────────────────────────────────────────────
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
    rmdirSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(),
  rmdirSync: vi.fn(),
}))

// ─── Mock crypto ────────────────────────────────────────────────────────────
vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn().mockReturnValue(Buffer.alloc(64, 0xaa)),
  },
  randomBytes: vi.fn().mockReturnValue(Buffer.alloc(64, 0xaa)),
}))

import fs from 'fs'
import {
  setupTlsPinning,
  wipeAllLocalData,
  enforceRetentionPolicy,
  checkInactivityWipe,
} from '../../src/main/security'

const mockFs = vi.mocked(fs)

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── setupTlsPinning ────────────────────────────────────────────────────────

describe('setupTlsPinning', () => {
  it('does not set verify proc when no pins are configured', () => {
    const mockSession = { setCertificateVerifyProc: vi.fn() }
    setupTlsPinning(mockSession as any)
    // PINNED_HOSTS is empty in source, so it should return early
    expect(mockSession.setCertificateVerifyProc).not.toHaveBeenCalled()
  })
})

// ─── checkInactivityWipe ────────────────────────────────────────────────────

describe('checkInactivityWipe', () => {
  it('returns false and writes timestamp when .last-opened file does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)

    const result = checkInactivityWipe(30)

    expect(result).toBe(false)
    // Should write a new .last-opened file
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.last-opened'),
      expect.any(String),
    )
  })

  it('returns false when last opened is less than maxInactiveDays ago', () => {
    mockFs.existsSync.mockReturnValue(true)
    // 10 days ago
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    mockFs.readFileSync.mockReturnValue(tenDaysAgo)

    const result = checkInactivityWipe(30)

    expect(result).toBe(false)
    // Should update .last-opened
    expect(mockFs.writeFileSync).toHaveBeenCalled()
  })

  it('returns true when last opened is more than maxInactiveDays ago', () => {
    mockFs.existsSync.mockReturnValue(true)
    // 45 days ago
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
    mockFs.readFileSync.mockReturnValue(fortyFiveDaysAgo)

    const result = checkInactivityWipe(30)

    expect(result).toBe(true)
  })

  it('updates the .last-opened file when not stale', () => {
    mockFs.existsSync.mockReturnValue(false)

    checkInactivityWipe()

    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1)
    const [filePath, content] = mockFs.writeFileSync.mock.calls[0] as [string, string]
    expect(filePath).toContain('.last-opened')
    // Content should be a valid ISO date string
    expect(() => new Date(content)).not.toThrow()
    expect(new Date(content).getTime()).toBeGreaterThan(0)
  })
})

// ─── enforceRetentionPolicy ─────────────────────────────────────────────────

describe('enforceRetentionPolicy', () => {
  it('calls prepare().run() with correct SQL for drafts and ref tables', () => {
    const mockRun = vi.fn()
    const mockPrepare = vi.fn().mockReturnValue({ run: mockRun })
    const db = { prepare: mockPrepare }

    enforceRetentionPolicy(db, 30)

    // Should be called 3 times: drafts, ref_master_instruments, ref_customers
    expect(mockPrepare).toHaveBeenCalledTimes(3)

    // Verify first call deletes synced drafts
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM drafts WHERE status = 'SYNCED'"),
    )
    expect(mockRun).toHaveBeenCalledWith('-30')

    // Verify second call deletes stale master instruments
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM ref_master_instruments'),
    )

    // Verify third call deletes stale customers
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM ref_customers'),
    )
  })

  it('uses default 30 days when maxDays is not specified', () => {
    const mockRun = vi.fn()
    const mockPrepare = vi.fn().mockReturnValue({ run: mockRun })
    const db = { prepare: mockPrepare }

    enforceRetentionPolicy(db)

    // All three run calls should receive '-30'
    expect(mockRun).toHaveBeenCalledTimes(3)
    for (const call of mockRun.mock.calls) {
      expect(call[0]).toBe('-30')
    }
  })

  it('passes custom maxDays value correctly', () => {
    const mockRun = vi.fn()
    const mockPrepare = vi.fn().mockReturnValue({ run: mockRun })
    const db = { prepare: mockPrepare }

    enforceRetentionPolicy(db, 90)

    for (const call of mockRun.mock.calls) {
      expect(call[0]).toBe('-90')
    }
  })
})

// ─── wipeAllLocalData ───────────────────────────────────────────────────────

describe('wipeAllLocalData', () => {
  it('deletes the db file, WAL, SHM journals, images dir, and last-opened', async () => {
    // All files exist
    mockFs.existsSync.mockReturnValue(true)
    mockFs.statSync.mockReturnValue({ size: 1024 } as any)
    // images dir has one file
    mockFs.readdirSync.mockReturnValue([
      { name: 'img1.enc', isDirectory: () => false } as any,
    ])

    await wipeAllLocalData('test wipe')

    // Should attempt to secure-delete: db, db-wal, db-shm, .last-opened, and 1 image file
    // That's at least 5 files overwritten + unlinked
    expect(mockFs.writeFileSync).toHaveBeenCalled()
    expect(mockFs.unlinkSync).toHaveBeenCalled()

    // Should attempt to remove the images directory
    expect(mockFs.rmdirSync).toHaveBeenCalled()
  })

  it('handles missing files gracefully', async () => {
    mockFs.existsSync.mockReturnValue(false)

    // Should not throw
    await expect(wipeAllLocalData('no files')).resolves.not.toThrow()

    // No writes or unlinks when files don't exist
    expect(mockFs.unlinkSync).not.toHaveBeenCalled()
  })
})
