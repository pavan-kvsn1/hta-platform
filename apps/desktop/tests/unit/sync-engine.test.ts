import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock electron ──────────────────────────────────────────────────────────
let mockOnline = true

vi.mock('electron', () => ({
  net: {
    isOnline: () => mockOnline,
  },
}))

// ─── Mock device ────────────────────────────────────────────────────────────
vi.mock('../../src/main/device', () => ({
  checkDeviceStatus: vi.fn().mockResolvedValue({ status: 'ACTIVE' }),
  sendHeartbeat: vi.fn().mockResolvedValue(undefined),
}))

// ─── Mock audit ─────────────────────────────────────────────────────────────
vi.mock('../../src/main/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
  getUnsyncedAuditLogs: vi.fn().mockResolvedValue([]),
  markAuditLogsSynced: vi.fn().mockResolvedValue(undefined),
}))

// ─── Mock file-store ────────────────────────────────────────────────────────
vi.mock('../../src/main/file-store', () => ({
  readImageDecrypted: vi.fn().mockReturnValue(Buffer.from('fake-image')),
}))

// ─── Mock fetch globally ────────────────────────────────────────────────────
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { SyncEngine, type SyncResult } from '../../src/main/sync-engine'
import { checkDeviceStatus, sendHeartbeat } from '../../src/main/device'
import { auditLog, getUnsyncedAuditLogs, markAuditLogsSynced } from '../../src/main/audit'
import { readImageDecrypted } from '../../src/main/file-store'

// ─── Mock DB builder ────────────────────────────────────────────────────────

function createMockDb() {
  return {
    run: vi.fn().mockResolvedValue({ lastID: 0, changes: 0 }),
    get: vi.fn().mockResolvedValue(undefined),
    all: vi.fn().mockResolvedValue([]),
    exec: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    raw: {} as any,
  }
}

const API_BASE = 'https://api.test.com'
const DEVICE_ID = 'device-123'
const USER_ID = 'user-456'
const AUTH_TOKEN = 'test-token'
const getAuthToken = vi.fn().mockResolvedValue(AUTH_TOKEN)

let db: ReturnType<typeof createMockDb>

beforeEach(() => {
  vi.clearAllMocks()
  mockOnline = true
  db = createMockDb()
  getAuthToken.mockResolvedValue(AUTH_TOKEN)
})

// ─── Offline behavior ───────────────────────────────────────────────────────

describe('SyncEngine.run() — offline', () => {
  it('returns empty result when offline', async () => {
    mockOnline = false
    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)

    const result = await engine.run()

    expect(result).toEqual({
      drafts: { synced: 0, failed: 0 },
      images: { synced: 0, failed: 0 },
      auditLogs: { synced: 0 },
    })
    // Should not have called getAuthToken
    expect(getAuthToken).not.toHaveBeenCalled()
  })
})

// ─── Syncing flag prevents concurrent runs ──────────────────────────────────

describe('SyncEngine.run() — concurrency guard', () => {
  it('returns empty result when a sync is already in progress', async () => {
    // Use a deferred promise to control when the first sync completes
    let resolveSync!: () => void
    const syncBlocker = new Promise<void>(resolve => { resolveSync = resolve })

    vi.mocked(checkDeviceStatus).mockImplementation(async () => {
      await syncBlocker
      return { status: 'ACTIVE' as const }
    })

    // db.all returns empty arrays for pending items
    db.all.mockResolvedValue([])
    // db.get for code replenishment count
    db.get.mockResolvedValue({ cnt: 50 })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)

    // Start first sync (will block on checkDeviceStatus)
    const firstRun = engine.run()

    // Second run should return immediately with empty result
    const secondResult = await engine.run()
    expect(secondResult).toEqual({
      drafts: { synced: 0, failed: 0 },
      images: { synced: 0, failed: 0 },
      auditLogs: { synced: 0 },
    })

    // Unblock first run
    resolveSync()
    await firstRun
  })
})

// ─── Successful sync with pending drafts ────────────────────────────────────

describe('SyncEngine.run() — draft sync', () => {
  it('syncs pending CREATE drafts successfully', async () => {
    const pendingDraft = {
      id: 'queue-1',
      draft_id: 'draft-1',
      action: 'CREATE',
      payload: JSON.stringify({ title: 'Test Certificate' }),
      retries: 0,
    }

    // sync_queue query returns one pending CREATE
    db.all.mockResolvedValueOnce([pendingDraft])
    // unsynced images query returns empty
    db.all.mockResolvedValueOnce([])

    // code count for replenishment check (>= 10 so it won't replenish)
    db.get.mockResolvedValue({ cnt: 20 })

    // Mock fetch: CREATE returns 201 with server id
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'server-cert-1' }),
    })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    const result = await engine.run()

    expect(result.drafts.synced).toBe(1)
    expect(result.drafts.failed).toBe(0)

    // Verify the fetch call
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/certificates`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${AUTH_TOKEN}`,
        }),
      }),
    )

    // Verify queue entry marked as SYNCED
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'SYNCED'"),
      expect.anything(),
    )

    // Verify draft updated with server_id
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts SET status = 'SYNCED'"),
      'server-cert-1',
      'draft-1',
    )
  })

  it('handles 409 conflict on UPDATE', async () => {
    const pendingUpdate = {
      id: 'queue-2',
      draft_id: 'draft-2',
      action: 'UPDATE',
      payload: JSON.stringify({ title: 'Updated Cert' }),
      retries: 0,
    }

    // sync_queue query returns one pending UPDATE
    db.all.mockResolvedValueOnce([pendingUpdate])
    // unsynced images returns empty
    db.all.mockResolvedValueOnce([])

    // DB lookup for server_id
    db.get
      .mockResolvedValueOnce({ server_id: 'server-cert-2' }) // drafts lookup for UPDATE
      .mockResolvedValue({ cnt: 20 }) // code count

    // Fetch returns 409 conflict
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ serverVersion: { title: 'Server Version' } }),
    })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    const result = await engine.run()

    expect(result.drafts.failed).toBe(1)
    expect(result.drafts.synced).toBe(0)

    // Draft should be marked as CONFLICT
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts SET status = 'CONFLICT'"),
      expect.any(String), // conflict_server_data JSON
      'draft-2',
    )

    // Sync queue entry should be marked as CONFLICT
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'CONFLICT'"),
      expect.anything(),
    )

    // Audit log should record the conflict
    expect(auditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'SYNC_CONFLICT',
        entityType: 'draft',
        entityId: 'draft-2',
      }),
    )
  })
})

// ─── Audit log sync ─────────────────────────────────────────────────────────

describe('SyncEngine.run() — audit log sync', () => {
  it('uploads unsynced audit logs and marks them synced', async () => {
    // No pending drafts or images
    db.all.mockResolvedValue([])
    db.get.mockResolvedValue({ cnt: 20 })

    const unsyncedLogs = [
      { id: 'log-1', action: 'DRAFT_CREATED' },
      { id: 'log-2', action: 'DRAFT_UPDATED' },
    ]
    vi.mocked(getUnsyncedAuditLogs).mockResolvedValueOnce(unsyncedLogs)

    // Audit log upload succeeds
    mockFetch.mockResolvedValueOnce({ ok: true })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    const result = await engine.run()

    expect(result.auditLogs.synced).toBe(2)

    // Verify audit logs were pushed to the correct endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/devices/${DEVICE_ID}/audit-logs`,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('log-1'),
      }),
    )

    // Verify markAuditLogsSynced was called with the correct IDs
    expect(markAuditLogsSynced).toHaveBeenCalledWith(
      expect.anything(),
      ['log-1', 'log-2'],
    )
  })
})

// ─── Code replenishment ─────────────────────────────────────────────────────

describe('SyncEngine.run() — code replenishment', () => {
  it('replenishes codes when fewer than 10 remain', async () => {
    // No pending drafts or images
    db.all.mockResolvedValue([])

    // Fewer than 10 codes remaining
    db.get.mockResolvedValue({ cnt: 5 })

    // Code generation API response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        batchId: 'batch-1',
        pairs: [
          { key: 'A1', value: 'CODE-A1', sequence: 1 },
          { key: 'A2', value: 'CODE-A2', sequence: 2 },
        ],
      }),
    })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    await engine.run()

    // Should have called the code generation endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/offline-codes/generate`,
      expect.objectContaining({ method: 'POST' }),
    )

    // Old codes should be deleted
    expect(db.run).toHaveBeenCalledWith('DELETE FROM offline_codes')

    // New codes should be inserted
    expect(db.run).toHaveBeenCalledWith(
      'INSERT INTO offline_codes (id, code_hash, key, sequence, batch_id) VALUES (?, ?, ?, ?, ?)',
      expect.any(String), // UUID
      expect.any(String), // hash
      'A1',
      1,
      'batch-1',
    )
  })

  it('does not replenish codes when 10 or more remain', async () => {
    db.all.mockResolvedValue([])
    db.get.mockResolvedValue({ cnt: 15 })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    await engine.run()

    // Should NOT call the code generation endpoint
    expect(mockFetch).not.toHaveBeenCalledWith(
      `${API_BASE}/api/offline-codes/generate`,
      expect.anything(),
    )
  })
})

// ─── Device status check ────────────────────────────────────────────────────

describe('SyncEngine.run() — device status', () => {
  it('returns early without syncing when device is not ACTIVE', async () => {
    vi.mocked(checkDeviceStatus).mockResolvedValueOnce({ status: 'REVOKED' as any })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    const result = await engine.run()

    expect(result.drafts.synced).toBe(0)
    // sync_queue should not have been queried
    expect(db.all).not.toHaveBeenCalled()
  })
})

// ─── Heartbeat ──────────────────────────────────────────────────────────────

describe('SyncEngine.run() — heartbeat', () => {
  it('sends heartbeat after successful sync', async () => {
    db.all.mockResolvedValue([])
    db.get.mockResolvedValue({ cnt: 20 })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    await engine.run()

    expect(sendHeartbeat).toHaveBeenCalledWith(API_BASE, AUTH_TOKEN)
  })
})
