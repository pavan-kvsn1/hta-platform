import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted shared state (available before vi.mock factories) ────────────────
const {
  handlers,
  mockDb,
  mockGetUserId,
  mockGetDeviceId,
  mockAuditLog,
  mockSaveImageEncrypted,
  mockReadImageDecrypted,
  mockDeleteImagesForDraft,
} = vi.hoisted(() => {
  const handlers = new Map<string, Function>()

  const mockDb = {
    run: vi.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
    get: vi.fn().mockResolvedValue(undefined),
    all: vi.fn().mockResolvedValue([]),
    exec: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    raw: {} as any,
  }

  const mockGetUserId = vi.fn(() => 'user-1')
  const mockGetDeviceId = vi.fn(() => 'device-1')
  const mockAuditLog = vi.fn().mockResolvedValue(undefined)

  const mockSaveImageEncrypted = vi.fn(() => ({
    localPath: '/mock/path/img.enc',
    id: 'img-1',
    sizeBytes: 1024,
  }))
  const mockReadImageDecrypted = vi.fn((): Buffer | null => Buffer.from('fake-image-data'))
  const mockDeleteImagesForDraft = vi.fn()

  return {
    handlers,
    mockDb,
    mockGetUserId,
    mockGetDeviceId,
    mockAuditLog,
    mockSaveImageEncrypted,
    mockReadImageDecrypted,
    mockDeleteImagesForDraft,
  }
})

// ─── Mock electron ────────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers.set(channel, handler)
    }),
  },
}))

// ─── Mock sqlite-db ───────────────────────────────────────────────────────────
vi.mock('../../src/main/sqlite-db', () => ({
  getDb: vi.fn(() => mockDb),
}))

// ─── Mock auth ────────────────────────────────────────────────────────────────
vi.mock('../../src/main/auth', () => ({
  getUserId: mockGetUserId,
  getDeviceId: mockGetDeviceId,
}))

// ─── Mock audit ───────────────────────────────────────────────────────────────
vi.mock('../../src/main/audit', () => ({
  auditLog: mockAuditLog,
}))

// ─── Mock file-store ──────────────────────────────────────────────────────────
vi.mock('../../src/main/file-store', () => ({
  saveImageEncrypted: mockSaveImageEncrypted,
  readImageDecrypted: mockReadImageDecrypted,
  deleteImagesForDraft: mockDeleteImagesForDraft,
}))

// ─── Import and register handlers ONCE ────────────────────────────────────────
import {
  registerDraftHandlers,
  registerConflictHandlers,
  registerImageHandlers,
} from '../../src/main/ipc-handlers'

registerDraftHandlers()
registerConflictHandlers()
registerImageHandlers()

// ─── Helper to invoke a captured handler ──────────────────────────────────────
async function invoke(channel: string, ...args: unknown[]) {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`)
  return handler({}, ...args) // first arg is the IpcMainInvokeEvent stub
}

// ─── Reset mocks before each test ─────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()

  // Restore default mock implementations after clearAllMocks wipes them
  mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 })
  mockDb.get.mockResolvedValue(undefined)
  mockDb.all.mockResolvedValue([])
  mockDb.exec.mockResolvedValue(undefined)
  mockDb.close.mockResolvedValue(undefined)

  mockGetUserId.mockReturnValue('user-1')
  mockGetDeviceId.mockReturnValue('device-1')

  mockAuditLog.mockResolvedValue(undefined)

  mockSaveImageEncrypted.mockReturnValue({
    localPath: '/mock/path/img.enc',
    id: 'img-1',
    sizeBytes: 1024,
  })
  mockReadImageDecrypted.mockReturnValue(Buffer.from('fake-image-data'))
  mockDeleteImagesForDraft.mockReturnValue(undefined)
})

// ═══════════════════════════════════════════════════════════════════════════════
// P3-3b: Draft CRUD
// ═══════════════════════════════════════════════════════════════════════════════

describe('Draft CRUD', () => {
  // ─── ids() helper ─────────────────────────────────────────────────────────
  describe('ids() authentication guard', () => {
    it('throws "Not authenticated" when getUserId returns null', async () => {
      mockGetUserId.mockReturnValue(null as any)

      await expect(invoke('draft:create', { tenantId: 'tenant-1' })).rejects.toThrow(
        'Not authenticated',
      )
    })

    it('throws "Not authenticated" when getDeviceId returns null', async () => {
      mockGetDeviceId.mockReturnValue(null as any)

      await expect(invoke('draft:create', { tenantId: 'tenant-1' })).rejects.toThrow(
        'Not authenticated',
      )
    })
  })

  // ─── draft:create ─────────────────────────────────────────────────────────
  describe('draft:create', () => {
    it('creates a draft and returns { success: true, id }', async () => {
      const result = await invoke('draft:create', {
        tenantId: 'tenant-1',
        customerName: 'Acme Corp',
        certificateNumber: 'CERT-001',
      })

      expect(result.success).toBe(true)
      expect(result.id).toBeDefined()
      // UUID format
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )

      // Should INSERT into drafts table with correct leading args
      const insertCall = mockDb.run.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO drafts'),
      )
      expect(insertCall).toBeDefined()
      expect(insertCall![1]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      ) // id (UUID)
      expect(insertCall![2]).toBe('tenant-1')   // tenant_id
      expect(insertCall![3]).toBe('user-1')     // engineer_id
      expect(insertCall![4]).toBe('CERT-001')   // certificate_number
      expect(insertCall![5]).toBe('Acme Corp')  // customer_name
    })

    it('inserts parameters when provided', async () => {
      const result = await invoke('draft:create', {
        tenantId: 'tenant-1',
        parameters: [
          {
            sortOrder: 1,
            parameterName: 'Temperature',
            parameterUnit: 'C',
            results: [
              { pointNumber: 1, standardReading: '100.0', beforeAdjustment: '100.1' },
            ],
          },
        ],
      })

      expect(result.success).toBe(true)

      // Should have called db.run for the draft INSERT, parameter INSERT, and result INSERT
      const runCalls = mockDb.run.mock.calls
      const paramInsert = runCalls.find(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO draft_parameters'),
      )
      expect(paramInsert).toBeDefined()
      expect(paramInsert![3]).toBe(1)            // sort_order
      expect(paramInsert![4]).toBe('Temperature') // parameter_name
      expect(paramInsert![5]).toBe('C')           // parameter_unit

      const resultInsert = runCalls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('INSERT INTO draft_calibration_results'),
      )
      expect(resultInsert).toBeDefined()
      expect(resultInsert![3]).toBe(1)       // point_number
      expect(resultInsert![4]).toBe('100.0') // standard_reading
    })

    it('calls auditLog with DRAFT_CREATED', async () => {
      await invoke('draft:create', {
        tenantId: 'tenant-1',
        certificateNumber: 'CERT-002',
      })

      expect(mockAuditLog).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          userId: 'user-1',
          deviceId: 'device-1',
          action: 'DRAFT_CREATED',
          entityType: 'draft',
          entityId: expect.any(String),
          metadata: { certificateNumber: 'CERT-002' },
        }),
      )
    })
  })

  // ─── draft:save ───────────────────────────────────────────────────────────
  describe('draft:save', () => {
    it('updates an existing draft and returns { success: true }', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 'draft-1', engineer_id: 'user-1' })

      const result = await invoke('draft:save', 'draft-1', {
        customerName: 'Updated Corp',
        certificateNumber: 'CERT-UPD',
      })

      expect(result).toEqual({ success: true })

      // Verify UPDATE was called
      const updateCall = mockDb.run.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('UPDATE drafts SET'),
      )
      expect(updateCall).toBeDefined()
    })

    it('returns error when draft is not found', async () => {
      mockDb.get.mockResolvedValueOnce(undefined) // no draft row

      const result = await invoke('draft:save', 'nonexistent-id', { customerName: 'X' })

      expect(result).toEqual({ success: false, error: 'Draft not found' })
    })

    it('returns "Access denied" when engineer_id does not match', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 'draft-1', engineer_id: 'other-user' })

      const result = await invoke('draft:save', 'draft-1', { customerName: 'X' })

      expect(result).toEqual({ success: false, error: 'Access denied' })
    })

    it('replaces parameters (DELETE then INSERT) when parameters provided', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 'draft-1', engineer_id: 'user-1' })

      await invoke('draft:save', 'draft-1', {
        customerName: 'Corp',
        parameters: [
          { sortOrder: 1, parameterName: 'Pressure', parameterUnit: 'Pa' },
        ],
      })

      const runCalls = mockDb.run.mock.calls

      // Should DELETE old parameters
      const deleteCall = runCalls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('DELETE FROM draft_parameters'),
      )
      expect(deleteCall).toBeDefined()
      expect(deleteCall![1]).toBe('draft-1')

      // Should INSERT new parameters
      const insertCall = runCalls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('INSERT INTO draft_parameters'),
      )
      expect(insertCall).toBeDefined()
    })

    it('calls auditLog with DRAFT_UPDATED', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 'draft-1', engineer_id: 'user-1' })

      await invoke('draft:save', 'draft-1', { customerName: 'X' })

      expect(mockAuditLog).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          userId: 'user-1',
          deviceId: 'device-1',
          action: 'DRAFT_UPDATED',
          entityType: 'draft',
          entityId: 'draft-1',
        }),
      )
    })
  })

  // ─── draft:get ────────────────────────────────────────────────────────────
  describe('draft:get', () => {
    it('returns draft with parameters, results, images, and masterInstruments', async () => {
      const draftRow = {
        id: 'draft-1',
        engineer_id: 'user-1',
        customer_name: 'Acme',
        status: 'LOCAL_DRAFT',
      }
      const paramRow = { id: 'param-1', draft_id: 'draft-1', sort_order: 1 }
      const resultRow = { id: 'res-1', parameter_id: 'param-1', point_number: 1 }
      const imageRow = { id: 'img-1', draft_id: 'draft-1', image_type: 'FRONT' }
      const masterRow = { id: 'mi-1', draft_id: 'draft-1' }

      // SELECT * FROM drafts WHERE id=? AND engineer_id=?
      mockDb.get.mockResolvedValueOnce(draftRow)
      // SELECT * FROM draft_parameters
      mockDb.all.mockResolvedValueOnce([paramRow])
      // SELECT * FROM draft_calibration_results
      mockDb.all.mockResolvedValueOnce([resultRow])
      // SELECT FROM draft_images
      mockDb.all.mockResolvedValueOnce([imageRow])
      // SELECT * FROM draft_master_instruments
      mockDb.all.mockResolvedValueOnce([masterRow])

      const result = await invoke('draft:get', 'draft-1')

      expect(result).toEqual({
        ...draftRow,
        parameters: [{ ...paramRow, results: [resultRow] }],
        images: [imageRow],
        masterInstruments: [masterRow],
      })
    })

    it('returns null when draft belongs to a different engineer', async () => {
      // SELECT returns nothing because engineer_id is part of WHERE clause
      mockDb.get.mockResolvedValueOnce(undefined)

      const result = await invoke('draft:get', 'draft-1')

      expect(result).toBeNull()
    })

    it('returns null for a nonexistent id', async () => {
      mockDb.get.mockResolvedValueOnce(undefined)

      const result = await invoke('draft:get', 'nonexistent-id')

      expect(result).toBeNull()
    })
  })

  // ─── draft:list ───────────────────────────────────────────────────────────
  describe('draft:list', () => {
    it('returns only the current user drafts ordered by updated_at DESC', async () => {
      const drafts = [
        { id: 'd-1', updated_at: '2026-05-04T10:00:00Z' },
        { id: 'd-2', updated_at: '2026-05-03T10:00:00Z' },
      ]
      mockDb.all.mockResolvedValueOnce(drafts)

      const result = await invoke('draft:list')

      expect(result).toEqual(drafts)
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY updated_at DESC'),
        'user-1',
      )
    })
  })

  // ─── draft:delete ─────────────────────────────────────────────────────────
  describe('draft:delete', () => {
    it('deletes an owned draft, cleans up images, and audits', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 'draft-1', engineer_id: 'user-1' })

      const result = await invoke('draft:delete', 'draft-1')

      expect(result).toEqual({ success: true })
      expect(mockDeleteImagesForDraft).toHaveBeenCalledWith('draft-1')

      // Verify DELETE FROM drafts was called
      const deleteCall = mockDb.run.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('DELETE FROM drafts'),
      )
      expect(deleteCall).toBeDefined()
      expect(deleteCall![1]).toBe('draft-1')

      expect(mockAuditLog).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          action: 'DRAFT_DELETED',
          entityType: 'draft',
          entityId: 'draft-1',
        }),
      )
    })

    it('returns error when draft not found', async () => {
      mockDb.get.mockResolvedValueOnce(undefined)

      const result = await invoke('draft:delete', 'nonexistent')

      expect(result).toEqual({ success: false, error: 'Draft not found' })
      expect(mockDeleteImagesForDraft).not.toHaveBeenCalled()
    })

    it('returns "Access denied" when engineer_id does not match', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 'draft-1', engineer_id: 'other-user' })

      const result = await invoke('draft:delete', 'draft-1')

      expect(result).toEqual({ success: false, error: 'Access denied' })
      expect(mockDeleteImagesForDraft).not.toHaveBeenCalled()
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// P3-3c: Conflict Resolution
// ═══════════════════════════════════════════════════════════════════════════════

describe('Conflict Resolution', () => {
  // ─── draft:get-conflict ───────────────────────────────────────────────────
  describe('draft:get-conflict', () => {
    it('returns { local, server } for a CONFLICT draft', async () => {
      const serverData = {
        customerName: 'Server Corp',
        certificateNumber: 'CERT-SERVER',
      }
      const draftRow = {
        id: 'draft-c1',
        engineer_id: 'user-1',
        status: 'CONFLICT',
        customer_name: 'Local Corp',
        conflict_server_data: JSON.stringify(serverData),
      }
      const paramRow = { id: 'p-1', draft_id: 'draft-c1', sort_order: 1 }
      const resultRow = { id: 'r-1', parameter_id: 'p-1', point_number: 1 }
      const masterRow = { id: 'mi-1', draft_id: 'draft-c1' }

      // SELECT * FROM drafts WHERE id=? AND engineer_id=? AND status='CONFLICT'
      mockDb.get.mockResolvedValueOnce(draftRow)
      // Parameters
      mockDb.all.mockResolvedValueOnce([paramRow])
      // Results for param
      mockDb.all.mockResolvedValueOnce([resultRow])
      // Master instruments
      mockDb.all.mockResolvedValueOnce([masterRow])

      const result = await invoke('draft:get-conflict', 'draft-c1')

      expect(result).not.toBeNull()
      expect(result.local).toEqual({
        ...draftRow,
        parameters: [{ ...paramRow, results: [resultRow] }],
        masterInstruments: [masterRow],
      })
      expect(result.server).toEqual(serverData)
    })

    it('returns null when the draft is not in CONFLICT status', async () => {
      // The query includes status='CONFLICT' in the WHERE clause, so a non-conflict
      // draft returns nothing from the DB
      mockDb.get.mockResolvedValueOnce(undefined)

      const result = await invoke('draft:get-conflict', 'draft-normal')

      expect(result).toBeNull()
    })

    it('handles corrupt conflict_server_data JSON gracefully (server=null)', async () => {
      const draftRow = {
        id: 'draft-c2',
        engineer_id: 'user-1',
        status: 'CONFLICT',
        conflict_server_data: '{corrupt-json!!!',
      }

      mockDb.get.mockResolvedValueOnce(draftRow)
      mockDb.all.mockResolvedValueOnce([]) // parameters
      mockDb.all.mockResolvedValueOnce([]) // master instruments

      const result = await invoke('draft:get-conflict', 'draft-c2')

      expect(result).not.toBeNull()
      expect(result.server).toBeNull()
      expect(result.local).toEqual({
        ...draftRow,
        parameters: [],
        masterInstruments: [],
      })
    })

    it('returns { local, server: null } when conflict_server_data is absent', async () => {
      const draftRow = {
        id: 'draft-c3',
        engineer_id: 'user-1',
        status: 'CONFLICT',
        conflict_server_data: null,
      }

      mockDb.get.mockResolvedValueOnce(draftRow)
      mockDb.all.mockResolvedValueOnce([]) // parameters
      mockDb.all.mockResolvedValueOnce([]) // master instruments

      const result = await invoke('draft:get-conflict', 'draft-c3')

      expect(result).not.toBeNull()
      expect(result.server).toBeNull()
      expect(result.local).toBeDefined()
    })
  })

  // ─── draft:resolve-conflict ───────────────────────────────────────────────
  describe('draft:resolve-conflict', () => {
    it('resolves a conflict: sets status to LOCAL_DRAFT, clears server data, increments revision', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 'draft-c1',
        engineer_id: 'user-1',
        server_id: 'server-id-1',
        status: 'CONFLICT',
      })

      const resolvedData = {
        customerName: 'Resolved Corp',
        certificateNumber: 'CERT-RESOLVED',
      }

      const result = await invoke('draft:resolve-conflict', 'draft-c1', resolvedData)

      expect(result).toEqual({ success: true })

      // Verify UPDATE sets status='LOCAL_DRAFT' and conflict_server_data=NULL
      const updateCall = mockDb.run.mock.calls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' &&
          c[0].includes("status = 'LOCAL_DRAFT'") &&
          c[0].includes('conflict_server_data = NULL'),
      )
      expect(updateCall).toBeDefined()
    })

    it('inserts a sync_queue entry with action UPDATE', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 'draft-c1',
        engineer_id: 'user-1',
        server_id: 'server-id-1',
        status: 'CONFLICT',
      })

      await invoke('draft:resolve-conflict', 'draft-c1', { customerName: 'X' })

      const syncInsert = mockDb.run.mock.calls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('INSERT INTO sync_queue'),
      )
      expect(syncInsert).toBeDefined()
      // The action should be 'UPDATE' (embedded in the SQL string)
      expect(syncInsert![0]).toContain("'UPDATE'")
      // The payload (4th positional arg, index 3) should be valid JSON
      const payload = JSON.parse(syncInsert![3] as string)
      expect(payload.clientUpdatedAt).toBeDefined()
    })

    it('replaces parameters when provided in resolved data', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 'draft-c1',
        engineer_id: 'user-1',
        server_id: 'srv-1',
        status: 'CONFLICT',
      })

      await invoke('draft:resolve-conflict', 'draft-c1', {
        customerName: 'X',
        parameters: [
          { sortOrder: 1, parameterName: 'Voltage', parameterUnit: 'V' },
        ],
      })

      const runCalls = mockDb.run.mock.calls

      const deleteParams = runCalls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('DELETE FROM draft_parameters'),
      )
      expect(deleteParams).toBeDefined()

      const insertParams = runCalls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('INSERT INTO draft_parameters'),
      )
      expect(insertParams).toBeDefined()
    })

    it('rejects when draft is not in CONFLICT status', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 'draft-c1',
        engineer_id: 'user-1',
        server_id: 'srv-1',
        status: 'LOCAL_DRAFT', // not CONFLICT
      })

      const result = await invoke('draft:resolve-conflict', 'draft-c1', { customerName: 'X' })

      expect(result).toEqual({ success: false, error: 'Draft is not in conflict' })
    })

    it('rejects when engineer_id does not match', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 'draft-c1',
        engineer_id: 'other-user',
        server_id: 'srv-1',
        status: 'CONFLICT',
      })

      const result = await invoke('draft:resolve-conflict', 'draft-c1', { customerName: 'X' })

      expect(result).toEqual({ success: false, error: 'Access denied' })
    })

    it('returns error when draft not found', async () => {
      mockDb.get.mockResolvedValueOnce(undefined)

      const result = await invoke('draft:resolve-conflict', 'nonexistent', { customerName: 'X' })

      expect(result).toEqual({ success: false, error: 'Draft not found' })
    })

    it('calls auditLog with CONFLICT_RESOLVED', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 'draft-c1',
        engineer_id: 'user-1',
        server_id: 'srv-1',
        status: 'CONFLICT',
      })

      await invoke('draft:resolve-conflict', 'draft-c1', { customerName: 'X' })

      expect(mockAuditLog).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          userId: 'user-1',
          deviceId: 'device-1',
          action: 'CONFLICT_RESOLVED',
          entityType: 'draft',
          entityId: 'draft-c1',
        }),
      )
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// P3-3d: Image Operations
// ═══════════════════════════════════════════════════════════════════════════════

describe('Image Operations', () => {
  // ─── image:save ───────────────────────────────────────────────────────────
  describe('image:save', () => {
    it('saves an encrypted image, inserts metadata, and returns { success, id, sizeBytes }', async () => {
      mockDb.get.mockResolvedValueOnce({ engineer_id: 'user-1' }) // draft ownership check

      const meta = {
        imageType: 'FRONT',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        caption: 'Front view',
      }
      const arrayBuffer = new ArrayBuffer(16)

      const result = await invoke('image:save', 'draft-1', meta, arrayBuffer)

      expect(result).toEqual({ success: true, id: 'img-1', sizeBytes: 1024 })
      expect(mockSaveImageEncrypted).toHaveBeenCalledWith(
        'draft-1',
        expect.any(Buffer),
        'jpg', // 'jpeg' should be replaced with 'jpg'
      )

      // Verify INSERT into draft_images
      const insertCall = mockDb.run.mock.calls.find(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('INSERT INTO draft_images'),
      )
      expect(insertCall).toBeDefined()
      expect(insertCall![1]).toBe('img-1')    // id
      expect(insertCall![2]).toBe('draft-1')  // draft_id
      expect(insertCall![3]).toBe('FRONT')    // image_type
    })

    it('calls auditLog with IMAGE_ATTACHED', async () => {
      mockDb.get.mockResolvedValueOnce({ engineer_id: 'user-1' })

      await invoke('image:save', 'draft-1', {
        imageType: 'LABEL',
        mimeType: 'image/png',
      }, new ArrayBuffer(8))

      expect(mockAuditLog).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          userId: 'user-1',
          deviceId: 'device-1',
          action: 'IMAGE_ATTACHED',
          entityType: 'image',
          entityId: 'img-1',
          metadata: expect.objectContaining({
            draftId: 'draft-1',
            imageType: 'LABEL',
            sizeBytes: 1024,
          }),
        }),
      )
    })

    it('rejects when engineer does not own the draft', async () => {
      mockDb.get.mockResolvedValueOnce({ engineer_id: 'other-user' })

      const result = await invoke('image:save', 'draft-1', {
        imageType: 'FRONT',
        mimeType: 'image/jpeg',
      }, new ArrayBuffer(4))

      expect(result).toEqual({ success: false, error: 'Draft not found or access denied' })
      expect(mockSaveImageEncrypted).not.toHaveBeenCalled()
    })

    it('rejects when draft does not exist', async () => {
      mockDb.get.mockResolvedValueOnce(undefined)

      const result = await invoke('image:save', 'nonexistent', {
        imageType: 'FRONT',
        mimeType: 'image/jpeg',
      }, new ArrayBuffer(4))

      expect(result).toEqual({ success: false, error: 'Draft not found or access denied' })
    })
  })

  // ─── image:get-path ───────────────────────────────────────────────────────
  describe('image:get-path', () => {
    it('returns a data URL for an owned image', async () => {
      // First get: image row
      mockDb.get.mockResolvedValueOnce({
        local_path: '/mock/path/img.enc',
        draft_id: 'draft-1',
        mime_type: 'image/png',
      })
      // Second get: draft ownership check
      mockDb.get.mockResolvedValueOnce({ engineer_id: 'user-1' })

      const result = await invoke('image:get-path', 'img-1')

      expect(result).toBe(
        `data:image/png;base64,${Buffer.from('fake-image-data').toString('base64')}`,
      )
      expect(mockReadImageDecrypted).toHaveBeenCalledWith('/mock/path/img.enc')
    })

    it('defaults to image/jpeg when mime_type is missing', async () => {
      mockDb.get.mockResolvedValueOnce({
        local_path: '/mock/path/img.enc',
        draft_id: 'draft-1',
        mime_type: null,
      })
      mockDb.get.mockResolvedValueOnce({ engineer_id: 'user-1' })

      const result = await invoke('image:get-path', 'img-1')

      expect(result).toContain('data:image/jpeg;base64,')
    })

    it('returns null when image row is not found', async () => {
      mockDb.get.mockResolvedValueOnce(undefined)

      const result = await invoke('image:get-path', 'nonexistent')

      expect(result).toBeNull()
    })

    it('returns null when draft belongs to another engineer', async () => {
      mockDb.get.mockResolvedValueOnce({
        local_path: '/mock/path/img.enc',
        draft_id: 'draft-1',
        mime_type: 'image/jpeg',
      })
      mockDb.get.mockResolvedValueOnce({ engineer_id: 'other-user' })

      const result = await invoke('image:get-path', 'img-1')

      expect(result).toBeNull()
      expect(mockReadImageDecrypted).not.toHaveBeenCalled()
    })

    it('returns null when readImageDecrypted returns null', async () => {
      mockDb.get.mockResolvedValueOnce({
        local_path: '/mock/path/missing.enc',
        draft_id: 'draft-1',
        mime_type: 'image/jpeg',
      })
      mockDb.get.mockResolvedValueOnce({ engineer_id: 'user-1' })
      mockReadImageDecrypted.mockReturnValueOnce(null)

      const result = await invoke('image:get-path', 'img-1')

      expect(result).toBeNull()
    })
  })

  // ─── image:list ───────────────────────────────────────────────────────────
  describe('image:list', () => {
    it('returns images for an owned draft ordered by created_at', async () => {
      const images = [
        { id: 'img-1', image_type: 'FRONT', created_at: '2026-05-03T10:00:00Z' },
        { id: 'img-2', image_type: 'BACK', created_at: '2026-05-04T10:00:00Z' },
      ]

      // Draft ownership check
      mockDb.get.mockResolvedValueOnce({ engineer_id: 'user-1' })
      // Image list query
      mockDb.all.mockResolvedValueOnce(images)

      const result = await invoke('image:list', 'draft-1')

      expect(result).toEqual(images)
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at'),
        'draft-1',
      )
    })

    it('returns empty array when draft belongs to another engineer', async () => {
      mockDb.get.mockResolvedValueOnce({ engineer_id: 'other-user' })

      const result = await invoke('image:list', 'draft-1')

      expect(result).toEqual([])
    })

    it('returns empty array when draft does not exist', async () => {
      mockDb.get.mockResolvedValueOnce(undefined)

      const result = await invoke('image:list', 'nonexistent')

      expect(result).toEqual([])
    })
  })
})
