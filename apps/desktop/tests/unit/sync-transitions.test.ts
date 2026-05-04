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

import { SyncEngine } from '../../src/main/sync-engine'
import { checkDeviceStatus } from '../../src/main/device'
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

// ─── Token expiry recovery ──────────────────────────────────────────────────

describe('SyncEngine.run() — token expiry recovery', () => {
  it('catches token expiry error without crashing and returns empty result', async () => {
    getAuthToken.mockRejectedValueOnce(new Error('Token expired'))

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    const result = await engine.run()

    // Should return default empty result (the catch block leaves result at zeros)
    expect(result).toEqual({
      drafts: { synced: 0, failed: 0 },
      images: { synced: 0, failed: 0 },
      auditLogs: { synced: 0 },
    })

    // checkDeviceStatus should NOT have been called (token was never obtained)
    expect(vi.mocked(checkDeviceStatus)).not.toHaveBeenCalled()

    // No fetch calls should have been made
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('resets syncing flag after token expiry so subsequent runs work', async () => {
    // First run: token rejects
    getAuthToken.mockRejectedValueOnce(new Error('Token expired'))

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)

    const firstResult = await engine.run()
    expect(firstResult.drafts.synced).toBe(0)

    // Restore token for second run
    getAuthToken.mockResolvedValueOnce(AUTH_TOKEN)

    // Set up db mocks for a successful second run
    db.all.mockResolvedValueOnce([]) // sync_queue empty
    db.all.mockResolvedValueOnce([]) // unsynced images empty
    db.get.mockResolvedValue({ cnt: 20 }) // code count

    const secondResult = await engine.run()

    // Second run should have proceeded normally (checkDeviceStatus was called)
    expect(vi.mocked(checkDeviceStatus)).toHaveBeenCalledWith(API_BASE, AUTH_TOKEN)

    // It should return a valid result (not the guard early-return)
    expect(secondResult).toEqual({
      drafts: { synced: 0, failed: 0 },
      images: { synced: 0, failed: 0 },
      auditLogs: { synced: 0 },
    })
  })
})

// ─── Conflict → resolve → re-sync ──────────────────────────────────────────

describe('SyncEngine.run() — conflict resolve and re-sync across two runs', () => {
  it('marks draft as CONFLICT on 409, then syncs resolved update on next run', async () => {
    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)

    // ── Run 1: UPDATE triggers 409 conflict ──

    const updateItem = {
      id: 'queue-100',
      draft_id: 'draft-100',
      action: 'UPDATE',
      payload: JSON.stringify({ title: 'Local Version' }),
      retries: 0,
    }

    // sync_queue returns the UPDATE item
    db.all.mockResolvedValueOnce([updateItem])
    // unsynced images empty
    db.all.mockResolvedValueOnce([])

    // db.get: draft lookup returns server_id, then code count
    db.get
      .mockResolvedValueOnce({ server_id: 'srv-100' }) // draft lookup for UPDATE
      .mockResolvedValue({ cnt: 20 }) // code count

    // Fetch returns 409 conflict with server version data
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ serverVersion: { title: 'Server Version' } }),
    })

    const result1 = await engine.run()

    // Run 1 assertions: the UPDATE failed due to conflict
    expect(result1.drafts.synced).toBe(0)
    expect(result1.drafts.failed).toBe(1)

    // Draft should have been marked CONFLICT with server data
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts SET status = 'CONFLICT'"),
      JSON.stringify({ title: 'Server Version' }),
      'draft-100',
    )

    // Sync queue should have been marked CONFLICT
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'CONFLICT'"),
      'queue-100',
    )

    // ── Simulate conflict resolution ──
    // User resolves the conflict, creating a new sync_queue entry with merged data.

    vi.clearAllMocks()
    getAuthToken.mockResolvedValue(AUTH_TOKEN)

    // ── Run 2: resolved UPDATE succeeds ──

    const resolvedUpdate = {
      id: 'queue-101',
      draft_id: 'draft-100', // same draft, new queue entry
      action: 'UPDATE',
      payload: JSON.stringify({ title: 'Merged Version' }),
      retries: 0,
    }

    // sync_queue returns the resolved UPDATE
    db.all.mockResolvedValueOnce([resolvedUpdate])
    // unsynced images empty
    db.all.mockResolvedValueOnce([])

    // db.get: draft lookup returns server_id, then code count
    db.get
      .mockResolvedValueOnce({ server_id: 'srv-100' }) // draft lookup for UPDATE
      .mockResolvedValue({ cnt: 20 }) // code count

    // Fetch succeeds this time
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    })

    const result2 = await engine.run()

    // Run 2 assertions: the resolved UPDATE succeeded
    expect(result2.drafts.synced).toBe(1)
    expect(result2.drafts.failed).toBe(0)

    // Verify the fetch was made to the correct endpoint with merged payload
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/certificates/srv-100`,
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: `Bearer ${AUTH_TOKEN}`,
        }),
        body: JSON.stringify({ title: 'Merged Version' }),
      }),
    )

    // Queue entry should be marked SYNCED
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'SYNCED'"),
      'queue-101',
    )

    // Draft should transition from CONFLICT to SYNCED
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts SET status = 'SYNCED'"),
      'draft-100',
    )
  })
})

// ─── Image orphaning across two runs ────────────────────────────────────────

describe('SyncEngine.run() — image orphaning recovery across two runs', () => {
  it('fails image upload on run 1, succeeds on run 2 after draft has server_id', async () => {
    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)

    // ── Run 1: CREATE succeeds, image upload fails ──

    const createItem = {
      id: 'queue-200',
      draft_id: 'draft-200',
      action: 'CREATE',
      payload: JSON.stringify({ title: 'New Certificate' }),
      retries: 0,
    }

    const unsyncedImage = {
      id: 'img-200',
      local_path: '/data/images/photo.enc',
      mime_type: 'image/jpeg',
      original_name: 'photo.jpg',
      image_type: 'FRONT_PANEL',
      master_instrument_index: 0,
      parameter_index: null,
      point_number: null,
      caption: 'Front panel photo',
      server_id: 'srv-200', // joined from drafts table
    }

    // sync_queue returns the CREATE item
    db.all.mockResolvedValueOnce([createItem])
    // unsynced images query returns the image (it has server_id via the JOIN,
    // because the CREATE just set it — the query runs after syncDrafts)
    db.all.mockResolvedValueOnce([unsyncedImage])

    // code count for replenishment check
    db.get.mockResolvedValue({ cnt: 20 })

    // readImageDecrypted returns valid buffer
    vi.mocked(readImageDecrypted).mockReturnValue(Buffer.from('fake-image'))

    // Fetch for CREATE: succeeds with server_id
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'srv-200' }),
    })
    // Fetch for image upload: rejects with network error
    mockFetch.mockRejectedValueOnce(new Error('Connection reset'))

    const result1 = await engine.run()

    expect(result1.drafts.synced).toBe(1)
    expect(result1.drafts.failed).toBe(0)
    expect(result1.images.synced).toBe(0)
    expect(result1.images.failed).toBe(1)

    // Draft should have been marked SYNCED with server_id
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts SET status = 'SYNCED'"),
      'srv-200',
      'draft-200',
    )

    // Image should NOT have been marked synced
    expect(db.run).not.toHaveBeenCalledWith(
      'UPDATE draft_images SET synced = 1 WHERE id = ?',
      'img-200',
    )

    // ── Run 2: no drafts in queue, image upload succeeds ──

    vi.clearAllMocks()
    getAuthToken.mockResolvedValue(AUTH_TOKEN)
    vi.mocked(readImageDecrypted).mockReturnValue(Buffer.from('fake-image'))

    // sync_queue is empty (no pending drafts)
    db.all.mockResolvedValueOnce([])
    // unsynced images query still finds the orphaned image (synced = 0, server_id present)
    db.all.mockResolvedValueOnce([unsyncedImage])

    // code count for replenishment check
    db.get.mockResolvedValue({ cnt: 20 })

    // Fetch for image upload: succeeds this time
    mockFetch.mockResolvedValueOnce({ ok: true })

    const result2 = await engine.run()

    expect(result2.drafts.synced).toBe(0)
    expect(result2.drafts.failed).toBe(0)
    expect(result2.images.synced).toBe(1)
    expect(result2.images.failed).toBe(0)

    // Image should now be marked as synced
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE draft_images SET synced = 1 WHERE id = ?',
      'img-200',
    )

    // Verify the image was uploaded to the correct certificate endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/certificates/srv-200/images`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${AUTH_TOKEN}`,
        }),
      }),
    )
  })
})

// ─── Connectivity drop mid-sync ─────────────────────────────────────────────

describe('SyncEngine.run() — connectivity drop mid-sync', () => {
  it('handles network error on second item while first and third succeed', async () => {
    const queueItems = [
      {
        id: 'queue-301',
        draft_id: 'draft-301',
        action: 'CREATE',
        payload: JSON.stringify({ title: 'Cert Alpha' }),
        retries: 0,
      },
      {
        id: 'queue-302',
        draft_id: 'draft-302',
        action: 'CREATE',
        payload: JSON.stringify({ title: 'Cert Beta' }),
        retries: 0,
      },
      {
        id: 'queue-303',
        draft_id: 'draft-303',
        action: 'CREATE',
        payload: JSON.stringify({ title: 'Cert Gamma' }),
        retries: 0,
      },
    ]

    // sync_queue returns 3 CREATE items
    db.all.mockResolvedValueOnce(queueItems)
    // unsynced images returns empty
    db.all.mockResolvedValueOnce([])

    // code count for replenishment check
    db.get.mockResolvedValue({ cnt: 20 })

    // 1st fetch: CREATE succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 's1' }),
    })
    // 2nd fetch: network error (connectivity drop)
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    // 3rd fetch: CREATE succeeds (connectivity restored)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 's3' }),
    })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    const result = await engine.run()

    // Two succeeded, one failed
    expect(result.drafts.synced).toBe(2)
    expect(result.drafts.failed).toBe(1)

    // Verify all three were marked IN_PROGRESS
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'IN_PROGRESS'"),
      'queue-301',
    )
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'IN_PROGRESS'"),
      'queue-302',
    )
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'IN_PROGRESS'"),
      'queue-303',
    )

    // First item: SYNCED with server_id
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'SYNCED'"),
      'queue-301',
    )
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts SET status = 'SYNCED'"),
      's1',
      'draft-301',
    )

    // Second item: FAILED with retries incremented
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'FAILED', retries = retries + 1"),
      expect.stringContaining('Network error'),
      'queue-302',
    )

    // Third item: SYNCED with server_id (processing continued after the failure)
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'SYNCED'"),
      'queue-303',
    )
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts SET status = 'SYNCED'"),
      's3',
      'draft-303',
    )

    // Second item should NOT have been marked SYNCED
    expect(db.run).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'SYNCED'"),
      'queue-302',
    )
    expect(db.run).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts SET status = 'SYNCED'"),
      expect.anything(),
      'draft-302',
    )
  })
})
