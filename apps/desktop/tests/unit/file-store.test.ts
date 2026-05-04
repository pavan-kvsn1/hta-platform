import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted shared state (available before vi.mock factories) ──────────────
const { fsStore, fsMockFns, safeStorageMock } = vi.hoisted(() => {
  const fsStore = new Map<string, Buffer | string>()

  const fsMockFns = {
    existsSync: vi.fn((p: string) => {
      if (fsStore.has(p)) return true
      // Also return true if p is a directory prefix of any stored path
      for (const key of fsStore.keys()) {
        if (key.startsWith(p + '/') || key.startsWith(p + '\\')) return true
      }
      return false
    }),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((p: string, data: Buffer | string) => {
      fsStore.set(p, data instanceof Buffer ? data : Buffer.from(data))
    }),
    readFileSync: vi.fn((p: string) => {
      if (!fsStore.has(p)) throw new Error(`ENOENT: ${p}`)
      return fsStore.get(p)!
    }),
    unlinkSync: vi.fn((p: string) => { fsStore.delete(p) }),
    statSync: vi.fn((p: string) => ({
      size: fsStore.has(p) ? (fsStore.get(p) as Buffer).length : 0,
    })),
    readdirSync: vi.fn((dir: string) => {
      const files: string[] = []
      for (const key of fsStore.keys()) {
        if (key.startsWith(dir + '/') || key.startsWith(dir + '\\')) {
          const remainder = key.slice(dir.length + 1)
          // Only direct children (no nested separators)
          if (!remainder.includes('/') && !remainder.includes('\\')) {
            files.push(remainder)
          }
        }
      }
      return files
    }),
    rmdirSync: vi.fn(),
  }

  const safeStorageMock = {
    encryptString: vi.fn((value: string) => Buffer.from(`ENC:${value}`)),
    decryptString: vi.fn((buf: Buffer) => {
      const str = buf.toString()
      if (!str.startsWith('ENC:')) throw new Error('Decryption failed')
      return str.slice(4)
    }),
  }

  return { fsStore, fsMockFns, safeStorageMock }
})

// ─── Mock electron ──────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
  safeStorage: safeStorageMock,
}))

// ─── Mock fs ────────────────────────────────────────────────────────────────
vi.mock('fs', () => ({
  default: { ...fsMockFns },
  ...fsMockFns,
}))

import {
  saveImageEncrypted,
  readImageDecrypted,
  deleteImagesForDraft,
} from '../../src/main/file-store'

beforeEach(() => {
  vi.clearAllMocks()
  fsStore.clear()

  // Restore fs mock implementations cleared by vi.clearAllMocks()
  fsMockFns.existsSync.mockImplementation((p: string) => {
    if (fsStore.has(p)) return true
    for (const key of fsStore.keys()) {
      if (key.startsWith(p + '/') || key.startsWith(p + '\\')) return true
    }
    return false
  })
  fsMockFns.writeFileSync.mockImplementation((p: string, data: Buffer | string) => {
    fsStore.set(p, data instanceof Buffer ? data : Buffer.from(data))
  })
  fsMockFns.readFileSync.mockImplementation((p: string) => {
    if (!fsStore.has(p)) throw new Error(`ENOENT: ${p}`)
    return fsStore.get(p)!
  })
  fsMockFns.unlinkSync.mockImplementation((p: string) => { fsStore.delete(p) })
  fsMockFns.statSync.mockImplementation((p: string) => ({
    size: fsStore.has(p) ? (fsStore.get(p) as Buffer).length : 0,
  }))
  fsMockFns.readdirSync.mockImplementation((dir: string) => {
    const files: string[] = []
    for (const key of fsStore.keys()) {
      if (key.startsWith(dir + '/') || key.startsWith(dir + '\\')) {
        const remainder = key.slice(dir.length + 1)
        if (!remainder.includes('/') && !remainder.includes('\\')) {
          files.push(remainder)
        }
      }
    }
    return files
  })

  // Restore safeStorage mock implementations
  safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(`ENC:${value}`))
  safeStorageMock.decryptString.mockImplementation((buf: Buffer) => {
    const str = buf.toString()
    if (!str.startsWith('ENC:')) throw new Error('Decryption failed')
    return str.slice(4)
  })
})

// ─── saveImageEncrypted ─────────────────────────────────────────────────────

describe('saveImageEncrypted', () => {
  const draftId = 'draft-abc-123'
  const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG header bytes
  const extension = 'png'

  it('creates directory with mkdirSync recursive', () => {
    saveImageEncrypted(draftId, imageBuffer, extension)

    expect(fsMockFns.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(draftId),
      { recursive: true },
    )
  })

  it('encrypts buffer via safeStorage.encryptString', () => {
    saveImageEncrypted(draftId, imageBuffer, extension)

    const expectedBase64 = imageBuffer.toString('base64')
    expect(safeStorageMock.encryptString).toHaveBeenCalledWith(expectedBase64)
  })

  it('returns correct { localPath, id, sizeBytes }', () => {
    const result = saveImageEncrypted(draftId, imageBuffer, extension)

    expect(result).toHaveProperty('localPath')
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('sizeBytes')

    // id should be a UUID
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('localPath includes draft ID and .enc extension', () => {
    const result = saveImageEncrypted(draftId, imageBuffer, extension)

    expect(result.localPath).toContain(draftId)
    expect(result.localPath).toMatch(/\.png\.enc$/)
  })

  it('sizeBytes matches original buffer length (not encrypted size)', () => {
    const result = saveImageEncrypted(draftId, imageBuffer, extension)

    expect(result.sizeBytes).toBe(imageBuffer.length)

    // Verify it differs from what was actually written (encrypted is larger due to ENC: prefix + base64)
    const written = fsStore.get(result.localPath)
    expect(written).toBeDefined()
    expect((written as Buffer).length).not.toBe(imageBuffer.length)
  })
})

// ─── readImageDecrypted ─────────────────────────────────────────────────────

describe('readImageDecrypted', () => {
  it('returns null for nonexistent path', () => {
    const result = readImageDecrypted('/mock/userData/images/draft-xyz/nonexistent.png.enc')

    expect(result).toBeNull()
  })

  it('reads file, decrypts via safeStorage.decryptString, returns Buffer', () => {
    const originalData = Buffer.from('hello world image data')
    const base64 = originalData.toString('base64')
    const encrypted = Buffer.from(`ENC:${base64}`)
    const fakePath = '/mock/userData/images/draft-1/image.png.enc'

    fsStore.set(fakePath, encrypted)

    const result = readImageDecrypted(fakePath)

    expect(safeStorageMock.decryptString).toHaveBeenCalledWith(encrypted)
    expect(result).toBeInstanceOf(Buffer)
    expect(result!.equals(originalData)).toBe(true)
  })

  it('round-trip: save then read returns original buffer content', () => {
    const originalBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) // JPEG header bytes
    const draftId = 'draft-roundtrip'

    const { localPath } = saveImageEncrypted(draftId, originalBuffer, 'jpg')

    const decrypted = readImageDecrypted(localPath)

    expect(decrypted).not.toBeNull()
    expect(decrypted!.equals(originalBuffer)).toBe(true)
  })
})

// ─── deleteImagesForDraft ───────────────────────────────────────────────────

describe('deleteImagesForDraft', () => {
  it('overwrites each file with random bytes BEFORE unlinking (secure delete)', () => {
    const draftId = 'draft-secure-delete'

    // Save two images into the draft directory
    const buf1 = Buffer.from('image-one-data')
    const buf2 = Buffer.from('image-two-data')
    const { localPath: path1 } = saveImageEncrypted(draftId, buf1, 'png')
    const { localPath: path2 } = saveImageEncrypted(draftId, buf2, 'jpg')

    // Clear call history so we can inspect delete-related calls only
    fsMockFns.writeFileSync.mockClear()
    fsMockFns.unlinkSync.mockClear()

    // Re-attach implementations after clearing
    fsMockFns.writeFileSync.mockImplementation((p: string, data: Buffer | string) => {
      fsStore.set(p, data instanceof Buffer ? data : Buffer.from(data))
    })
    fsMockFns.unlinkSync.mockImplementation((p: string) => { fsStore.delete(p) })

    deleteImagesForDraft(draftId)

    // writeFileSync should have been called for each file (overwrite with random bytes)
    expect(fsMockFns.writeFileSync).toHaveBeenCalledTimes(2)
    // unlinkSync should have been called for each file
    expect(fsMockFns.unlinkSync).toHaveBeenCalledTimes(2)

    // Verify that for each file, writeFileSync was called BEFORE unlinkSync
    // by checking the overall call order across mocks
    const writeFileCalls = fsMockFns.writeFileSync.mock.invocationCallOrder
    const unlinkCalls = fsMockFns.unlinkSync.mock.invocationCallOrder

    // Each write should precede its corresponding unlink
    for (let i = 0; i < writeFileCalls.length; i++) {
      expect(writeFileCalls[i]).toBeLessThan(unlinkCalls[i])
    }
  })

  it('removes directory after all files deleted', () => {
    const draftId = 'draft-rmdir'
    saveImageEncrypted(draftId, Buffer.from('data'), 'png')

    deleteImagesForDraft(draftId)

    expect(fsMockFns.rmdirSync).toHaveBeenCalledWith(
      expect.stringContaining(draftId),
    )

    // rmdirSync should be called AFTER all unlinkSync calls
    const rmdirOrder = fsMockFns.rmdirSync.mock.invocationCallOrder[0]
    const unlinkOrders = fsMockFns.unlinkSync.mock.invocationCallOrder
    for (const order of unlinkOrders) {
      expect(order).toBeLessThan(rmdirOrder)
    }
  })

  it('handles missing directory gracefully (no throw)', () => {
    // Draft directory does not exist in fsStore, so existsSync returns false
    expect(() => deleteImagesForDraft('nonexistent-draft')).not.toThrow()

    // Should not attempt to read or remove anything
    expect(fsMockFns.readdirSync).not.toHaveBeenCalled()
    expect(fsMockFns.unlinkSync).not.toHaveBeenCalled()
    expect(fsMockFns.rmdirSync).not.toHaveBeenCalled()
  })
})
