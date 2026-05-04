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

// ─── Image sync ─────────────────────────────────────────────────────────────

describe('SyncEngine.run() — image sync', () => {
  it('uploads unsynced images and marks them synced', async () => {
    const unsyncedImage = {
      id: 'img-1',
      local_path: '/data/images/photo.enc',
      mime_type: 'image/jpeg',
      original_name: 'photo.jpg',
      image_type: 'FRONT_PANEL',
      master_instrument_index: 0,
      parameter_index: null,
      point_number: null,
      caption: 'Front panel photo',
      server_id: 'srv-cert-1',
    }

    // First db.all call: sync_queue returns empty (no drafts to sync)
    db.all.mockResolvedValueOnce([])
    // Second db.all call: unsynced images returns one image
    db.all.mockResolvedValueOnce([unsyncedImage])

    // code count for replenishment check
    db.get.mockResolvedValue({ cnt: 20 })

    // readImageDecrypted returns a Buffer
    vi.mocked(readImageDecrypted).mockReturnValue(Buffer.from('fake-image'))

    // Image upload succeeds
    mockFetch.mockResolvedValueOnce({ ok: true })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    const result = await engine.run()

    expect(result.images.synced).toBe(1)
    expect(result.images.failed).toBe(0)

    // Verify fetch called with correct endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/certificates/srv-cert-1/images`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${AUTH_TOKEN}`,
        }),
      }),
    )

    // Verify image marked as synced in DB
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE draft_images SET synced = 1 WHERE id = ?',
      'img-1',
    )
  })

  it('increments failed count when readImageDecrypted returns null', async () => {
    const unsyncedImage = {
      id: 'img-2',
      local_path: '/data/images/missing.enc',
      mime_type: 'image/png',
      original_name: 'missing.png',
      image_type: 'REAR_PANEL',
      master_instrument_index: null,
      parameter_index: null,
      point_number: null,
      caption: null,
      server_id: 'srv-cert-2',
    }

    // First db.all call: sync_queue returns empty
    db.all.mockResolvedValueOnce([])
    // Second db.all call: unsynced images returns one image
    db.all.mockResolvedValueOnce([unsyncedImage])

    // code count for replenishment check
    db.get.mockResolvedValue({ cnt: 20 })

    // readImageDecrypted returns null (file missing / decryption failure)
    vi.mocked(readImageDecrypted).mockReturnValue(null as any)

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    const result = await engine.run()

    expect(result.images.failed).toBe(1)
    expect(result.images.synced).toBe(0)

    // Fetch should NOT have been called for image upload
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/images'),
      expect.anything(),
    )

    // Image should NOT be marked as synced
    expect(db.run).not.toHaveBeenCalledWith(
      'UPDATE draft_images SET synced = 1 WHERE id = ?',
      expect.anything(),
    )
  })
})

// ─── SUBMIT action ──────────────────────────────────────────────────────────

describe('SyncEngine.run() — SUBMIT action', () => {
  it('submits a draft via POST to /submit and marks it SYNCED', async () => {
    const pendingSubmit = {
      id: 'queue-10',
      draft_id: 'draft-10',
      action: 'SUBMIT',
      payload: JSON.stringify({}),
      retries: 0,
    }

    // sync_queue returns one SUBMIT item
    db.all.mockResolvedValueOnce([pendingSubmit])
    // unsynced images returns empty
    db.all.mockResolvedValueOnce([])

    // db.get: first call for draft lookup (server_id), then code count
    db.get
      .mockResolvedValueOnce({ server_id: 'srv-1' }) // draft lookup for SUBMIT
      .mockResolvedValue({ cnt: 20 }) // code count

    // Submit succeeds
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    const result = await engine.run()

    expect(result.drafts.synced).toBe(1)
    expect(result.drafts.failed).toBe(0)

    // Verify fetch called with POST to /submit endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/api/certificates/srv-1/submit`,
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
      'queue-10',
    )

    // Verify draft marked as SYNCED (without server_id since SUBMIT doesn't set one)
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts SET status = 'SYNCED'"),
      'draft-10',
    )
  })
})

// ─── Retry logic ────────────────────────────────────────────────────────────

describe('SyncEngine.run() — retry logic', () => {
  it('increments retries and sets FAILED status when fetch throws an error', async () => {
    const pendingCreate = {
      id: 'queue-20',
      draft_id: 'draft-20',
      action: 'CREATE',
      payload: JSON.stringify({ title: 'Retry Test' }),
      retries: 0,
    }

    // sync_queue returns one item
    db.all.mockResolvedValueOnce([pendingCreate])
    // unsynced images returns empty
    db.all.mockResolvedValueOnce([])

    // code count for replenishment check
    db.get.mockResolvedValue({ cnt: 20 })

    // Fetch throws a network error
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'))

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    const result = await engine.run()

    expect(result.drafts.failed).toBe(1)
    expect(result.drafts.synced).toBe(0)

    // Verify queue entry updated: status FAILED with retries incremented
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'FAILED', retries = retries + 1"),
      expect.stringContaining('Network timeout'),
      'queue-20',
    )
  })
})

// ─── Non-409 server error on UPDATE ─────────────────────────────────────────

describe('SyncEngine.run() — UPDATE server error (non-409)', () => {
  it('marks queue as FAILED and increments retries on 500 error', async () => {
    const pendingUpdate = {
      id: 'queue-30',
      draft_id: 'draft-30',
      action: 'UPDATE',
      payload: JSON.stringify({ title: 'Server Error Test' }),
      retries: 0,
    }

    // sync_queue returns one UPDATE item
    db.all.mockResolvedValueOnce([pendingUpdate])
    // unsynced images returns empty
    db.all.mockResolvedValueOnce([])

    // db.get: first call for draft lookup (server_id), then code count
    db.get
      .mockResolvedValueOnce({ server_id: 'srv-30' }) // draft lookup for UPDATE
      .mockResolvedValue({ cnt: 20 }) // code count

    // Fetch returns 500 Internal Server Error
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    const result = await engine.run()

    expect(result.drafts.failed).toBe(1)
    expect(result.drafts.synced).toBe(0)

    // Verify queue entry marked as FAILED with retries incremented
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'FAILED', retries = retries + 1"),
      expect.stringContaining('Update failed: 500'),
      'queue-30',
    )

    // Draft should NOT be marked as CONFLICT (that's only for 409)
    expect(db.run).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts SET status = 'CONFLICT'"),
      expect.anything(),
      expect.anything(),
    )
  })
})

// ─── Multi-item queue ───────────────────────────────────────────────────────

describe('SyncEngine.run() — multi-item queue', () => {
  it('processes all items; failure on one does not block subsequent items', async () => {
    const queueItems = [
      {
        id: 'queue-41',
        draft_id: 'draft-41',
        action: 'CREATE',
        payload: JSON.stringify({ title: 'Cert A' }),
        retries: 0,
      },
      {
        id: 'queue-42',
        draft_id: 'draft-42',
        action: 'UPDATE',
        payload: JSON.stringify({ title: 'Cert B Updated' }),
        retries: 0,
      },
      {
        id: 'queue-43',
        draft_id: 'draft-43',
        action: 'CREATE',
        payload: JSON.stringify({ title: 'Cert C' }),
        retries: 0,
      },
    ]

    // sync_queue returns 3 items
    db.all.mockResolvedValueOnce(queueItems)
    // unsynced images returns empty
    db.all.mockResolvedValueOnce([])

    // db.get calls:
    // - Item 2 (UPDATE) needs draft lookup for server_id
    // - Code count for replenishment
    db.get
      .mockResolvedValueOnce({ server_id: 'srv-42' }) // draft lookup for UPDATE item
      .mockResolvedValue({ cnt: 20 }) // code count

    // Fetch responses in order:
    // 1st: CREATE succeeds (201)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'server-41' }),
    })
    // 2nd: UPDATE fails (500)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })
    // 3rd: CREATE succeeds (201)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'server-43' }),
    })

    const engine = new SyncEngine(db as any, API_BASE, getAuthToken, DEVICE_ID, USER_ID)
    const result = await engine.run()

    expect(result.drafts.synced).toBe(2)
    expect(result.drafts.failed).toBe(1)

    // All 3 items should have been set to IN_PROGRESS
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'IN_PROGRESS'"),
      'queue-41',
    )
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'IN_PROGRESS'"),
      'queue-42',
    )
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'IN_PROGRESS'"),
      'queue-43',
    )

    // First CREATE: queue SYNCED, draft SYNCED with server_id
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'SYNCED'"),
      'queue-41',
    )
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts SET status = 'SYNCED'"),
      'server-41',
      'draft-41',
    )

    // Second UPDATE: queue FAILED with retries incremented
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'FAILED', retries = retries + 1"),
      expect.stringContaining('Update failed: 500'),
      'queue-42',
    )

    // Third CREATE: queue SYNCED, draft SYNCED with server_id
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'SYNCED'"),
      'queue-43',
    )
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE drafts SET status = 'SYNCED'"),
      'server-43',
      'draft-43',
    )
  })
})
