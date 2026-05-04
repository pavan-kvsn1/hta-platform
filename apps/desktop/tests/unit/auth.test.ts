import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// ─── Hoisted shared state (available before vi.mock factories) ──────────────
const { fsStore, fsMockFns, safeStorageMock } = vi.hoisted(() => {
  const fsStore = new Map<string, Buffer | string>()

  const fsMockFns = {
    existsSync: vi.fn((p: string) => fsStore.has(p)),
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

// ─── Mock fs ──────────��─────────────────────────────────────────���───────────
vi.mock('fs', () => ({
  default: { ...fsMockFns },
  ...fsMockFns,
}))

// ─── Mock sqlite-db ──────────��──────────────────────────────────────────────
const mockDb = {
  run: vi.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
  get: vi.fn().mockResolvedValue(undefined),
  all: vi.fn().mockResolvedValue([]),
  exec: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  raw: {},
}

vi.mock('../../src/main/sqlite-db', () => ({
  openDb: vi.fn().mockImplementation(async () => mockDb),
  getDb: vi.fn().mockImplementation(() => mockDb),
  closeDb: vi.fn().mockResolvedValue(undefined),
}))

// ─── Mock audit ────────────────────────────────────���────────────────────────
vi.mock('../../src/main/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}))

// ─── Mock security ───────────────────────────────────────��──────────────────
vi.mock('../../src/main/security', () => ({
  wipeAllLocalData: vi.fn().mockResolvedValue(undefined),
}))

import {
  setupOfflineAuth,
  unlockWithPasswordAndCode,
  unlockWithPasswordOnly,
  getAuthStatus,
  clearCredentials,
  prepareNextChallenge,
  getUserProfile,
} from '../../src/main/auth'
import { openDb, getDb } from '../../src/main/sqlite-db'
import { auditLog } from '../../src/main/audit'
import { wipeAllLocalData } from '../../src/main/security'

beforeEach(() => {
  vi.clearAllMocks()
  fsStore.clear()

  // Restore fs mock implementations cleared by vi.clearAllMocks()
  fsMockFns.existsSync.mockImplementation((p: string) => fsStore.has(p))
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

  // Restore safeStorage mock implementations
  safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(`ENC:${value}`))
  safeStorageMock.decryptString.mockImplementation((buf: Buffer) => {
    const str = buf.toString()
    if (!str.startsWith('ENC:')) throw new Error('Decryption failed')
    return str.slice(4)
  })

  // Restore sqlite-db mocks
  vi.mocked(openDb).mockImplementation(async () => mockDb as any)
  vi.mocked(getDb).mockImplementation(() => mockDb as any)
  mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 })
  mockDb.get.mockResolvedValue(undefined)
  mockDb.all.mockResolvedValue([])
})

// ─── setupOfflineAuth ────────────────���──────────────────────────────────────

describe('setupOfflineAuth', () => {
  it('generates a deviceId, derives key, encrypts refresh token, stores credentials, and opens DB', async () => {
    const result = await setupOfflineAuth(
      'myPassword123',
      'user-42',
      'refresh-token-abc',
      { name: 'Test User' },
    )

    // Returns a UUID-format deviceId
    expect(result.deviceId).toBeDefined()
    expect(result.deviceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )

    // openDb should have been called with a hex key (64 hex chars = 32 bytes)
    expect(openDb).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/))

    // Credential files should exist in the mock FS store
    const keys = Array.from(fsStore.keys())
    expect(keys.some(k => k.includes('device-id'))).toBe(true)
    expect(keys.some(k => k.includes('user-id'))).toBe(true)
    expect(keys.some(k => k.includes('salt'))).toBe(true)
    expect(keys.some(k => k.includes('encrypted-token'))).toBe(true)

    // auditLog should have been called for AUTH_SETUP
    expect(auditLog).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        userId: 'user-42',
        action: 'AUTH_SETUP',
        entityType: 'auth',
      }),
    )

    // DB should have device_meta entries written
    expect(mockDb.run).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO device_meta (key, value) VALUES (?, ?)',
      'device_id',
      expect.any(String),
    )
    expect(mockDb.run).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO device_meta (key, value) VALUES (?, ?)',
      'user_id',
      'user-42',
    )
  })
})

// ─── unlockWithPasswordAndCode ───────────��──────────────────────────────────

describe('unlockWithPasswordAndCode', () => {
  async function setupCredentials(password: string = 'correct-password') {
    const { deviceId } = await setupOfflineAuth(password, 'user-1', 'my-refresh-token')
    vi.mocked(openDb).mockClear()
    vi.mocked(auditLog).mockClear()
    mockDb.run.mockClear()
    mockDb.get.mockClear()
    // Restore implementations after clear
    vi.mocked(openDb).mockImplementation(async () => mockDb as any)
    mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 })
    mockDb.get.mockResolvedValue(undefined)
    return deviceId
  }

  it('succeeds with correct password and valid challenge code', async () => {
    await setupCredentials('correct-password')

    const codeHash = crypto.createHash('sha256').update('ABC123').digest('hex')
    mockDb.get
      .mockResolvedValueOnce({ id: 'code-1', sequence: 1, code_hash: codeHash }) // offline_codes lookup
      .mockResolvedValueOnce({ cnt: 15 })  // remaining codes count
      .mockResolvedValueOnce({ key: 'C2' }) // prepareNextChallenge

    const result = await unlockWithPasswordAndCode('correct-password', 'B4', 'ABC123')

    expect(result.success).toBe(true)
    expect(result.refreshToken).toBe('my-refresh-token')
    expect(result.codesRemaining).toBe(15)
  })

  it('increments attempts on wrong password', async () => {
    await setupCredentials('correct-password')

    const result = await unlockWithPasswordAndCode('wrong-password', 'B4', 'ABC123')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Incorrect password')
    expect(result.attemptsRemaining).toBeDefined()
    expect(result.attemptsRemaining!).toBeLessThan(5)
  })

  it('triggers wipe when MAX_ATTEMPTS is reached', async () => {
    await setupCredentials('correct-password')

    // Write attempts=4 directly into the credential store so next failure hits MAX
    const attemptsKey = Array.from(fsStore.keys()).find(k => k.includes('auth-attempts'))
    if (attemptsKey) {
      fsStore.set(attemptsKey, safeStorageMock.encryptString('4'))
    }

    const result = await unlockWithPasswordAndCode('wrong-password', 'B4', 'ABC123')

    expect(result.success).toBe(false)
    expect(result.attemptsRemaining).toBe(0)
    expect(wipeAllLocalData).toHaveBeenCalledWith('Auth lockout exceeded')
  })

  it('fails with invalid challenge key', async () => {
    await setupCredentials('correct-password')

    // DB returns no matching code row
    mockDb.get.mockResolvedValueOnce(undefined)

    const result = await unlockWithPasswordAndCode('correct-password', 'INVALID', 'ABC123')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid challenge key')
  })

  it('fails with wrong code value', async () => {
    await setupCredentials('correct-password')

    const codeHash = crypto.createHash('sha256').update('RIGHTCODE').digest('hex')
    mockDb.get.mockResolvedValueOnce({ id: 'code-1', sequence: 1, code_hash: codeHash })

    const result = await unlockWithPasswordAndCode('correct-password', 'B4', 'WRONGCODE')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Incorrect code value')
  })
})

// ─── unlockWithPasswordOnly ──────────���──────────────────────────��───────────

describe('unlockWithPasswordOnly', () => {
  async function setupCredentials(password: string = 'correct-password') {
    await setupOfflineAuth(password, 'user-1', 'my-refresh-token')
    vi.mocked(openDb).mockClear()
    vi.mocked(auditLog).mockClear()
    mockDb.run.mockClear()
    mockDb.get.mockClear()
    vi.mocked(openDb).mockImplementation(async () => mockDb as any)
    mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 })
    // prepareNextChallenge needs a code
    mockDb.get.mockResolvedValue({ key: 'A1' })
  }

  it('succeeds with correct password', async () => {
    await setupCredentials('correct-password')

    const result = await unlockWithPasswordOnly('correct-password')

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('fails with wrong password', async () => {
    await setupCredentials('correct-password')

    const result = await unlockWithPasswordOnly('wrong-password')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Incorrect password')
    expect(result.attemptsRemaining).toBeDefined()
  })
})

// ─── getAuthStatus ──────��───────────────────────────────��───────────────────

describe('getAuthStatus', () => {
  it('returns isSetUp false when no deviceId credential exists', async () => {
    // fsStore is empty -- no credentials exist
    const status = await getAuthStatus()

    expect(status.isSetUp).toBe(false)
    expect(status.isUnlocked).toBe(false)
  })

  it('returns correct state when DB is open', async () => {
    await setupOfflineAuth('pass', 'user-1', 'token')
    vi.mocked(getDb).mockReturnValue(mockDb as any)

    mockDb.get
      .mockResolvedValueOnce({ cnt: 8 })
      .mockResolvedValueOnce({ key: 'D7' })
      .mockResolvedValueOnce({ value: new Date().toISOString() })

    const status = await getAuthStatus()

    expect(status.isSetUp).toBe(true)
    expect(status.isUnlocked).toBe(true)
    expect(status.codesRemaining).toBe(8)
    expect(status.challengeKey).toBe('D7')
    expect(status.needsFullAuth).toBe(false)
  })
})

// ─── clearCredentials ───────────────────────────────────────────────────────

describe('clearCredentials', () => {
  it('removes all credential files', async () => {
    await setupOfflineAuth('pass', 'user-1', 'token')

    // Count credential files before clearing
    const credentialsBefore = Array.from(fsStore.keys()).filter(k => k.includes('.credentials'))
    expect(credentialsBefore.length).toBeGreaterThanOrEqual(5)

    clearCredentials()

    // After clearing, credential files should be removed from the store
    const credentialsAfter = Array.from(fsStore.keys()).filter(k => k.includes('.credentials'))
    expect(credentialsAfter.length).toBeLessThan(credentialsBefore.length)
  })
})

// ─── getAuthStatus — edge cases ─────────────────────────────────────────────

describe('getAuthStatus — edge cases', () => {
  async function setupCreds() {
    await setupOfflineAuth('pass', 'user-1', 'token', { name: 'Test' })
    vi.mocked(openDb).mockClear()
    vi.mocked(auditLog).mockClear()
    mockDb.run.mockClear()
    mockDb.get.mockClear()
    vi.mocked(openDb).mockImplementation(async () => mockDb as any)
    mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 })
  }

  it('returns needsFullAuth: true when last_full_auth is >24h ago', async () => {
    await setupCreds()
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    mockDb.get
      .mockResolvedValueOnce({ cnt: 10 })      // codes count
      .mockResolvedValueOnce({ key: 'A1' })     // challenge key
      .mockResolvedValueOnce({ value: oldDate }) // last_full_auth
    const status = await getAuthStatus()
    expect(status.needsFullAuth).toBe(true)
  })

  it('returns needsFullAuth: false when last_full_auth is <24h ago', async () => {
    await setupCreds()
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    const recentDate = new Date().toISOString()
    mockDb.get
      .mockResolvedValueOnce({ cnt: 10 })
      .mockResolvedValueOnce({ key: 'A1' })
      .mockResolvedValueOnce({ value: recentDate })
    const status = await getAuthStatus()
    expect(status.needsFullAuth).toBe(false)
  })

  it('falls back to isUnlocked: false when DB is not open', async () => {
    await setupCreds()
    vi.mocked(getDb).mockImplementation(() => { throw new Error('Database not unlocked') })
    const status = await getAuthStatus()
    expect(status.isSetUp).toBe(true)
    expect(status.isUnlocked).toBe(false)
  })
})

// ─── prepareNextChallenge ───────────────────────────────────────────────────

describe('prepareNextChallenge', () => {
  it('stores next challenge key from random unused code', async () => {
    await setupOfflineAuth('pass', 'user-1', 'token')
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockDb.get.mockResolvedValueOnce({ key: 'C5' })

    await prepareNextChallenge()

    const challengeKey = Array.from(fsStore.keys()).find(k => k.includes('next-challenge-key'))
    expect(challengeKey).toBeDefined()
  })

  it('deletes challenge key credential when no unused codes remain', async () => {
    await setupOfflineAuth('pass', 'user-1', 'token')
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockDb.get.mockResolvedValueOnce(undefined) // no unused codes

    await prepareNextChallenge()

    const challengeKey = Array.from(fsStore.keys()).find(k => k.includes('next-challenge-key'))
    expect(challengeKey).toBeUndefined()
  })
})

// ─── getUserProfile ─────────────────────────────────────────────────────────

describe('getUserProfile', () => {
  it('returns parsed JSON when profile credential exists', async () => {
    await setupOfflineAuth('pass', 'user-1', 'token', { name: 'Test User', role: 'engineer' })

    const profile = getUserProfile()

    expect(profile).toBeDefined()
    expect(profile?.name).toBe('Test User')
  })

  it('returns null when no profile stored', () => {
    const profile = getUserProfile()
    expect(profile).toBeNull()
  })
})

// ─── unlockWithPasswordAndCode — DB open failure ────────────────────────────

describe('unlockWithPasswordAndCode — DB open failure', () => {
  it('returns error when openDb throws', async () => {
    await setupOfflineAuth('correct-password', 'user-1', 'my-token')
    vi.mocked(openDb).mockRejectedValueOnce(new Error('SQLITE_NOTADB'))

    const codeHash = crypto.createHash('sha256').update('ABC123').digest('hex')
    mockDb.get.mockResolvedValueOnce({ id: 'c-1', sequence: 1, code_hash: codeHash })

    const result = await unlockWithPasswordAndCode('correct-password', 'B4', 'ABC123')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed')
  })
})

// ─── setupOfflineAuth — partial credentials ─────────────────────────────────

describe('setupOfflineAuth — partial credentials', () => {
  it('getAuthStatus returns isSetUp false when salt exists but device-id is missing', async () => {
    const saltPath = '/mock/userData/.credentials/salt'
    fsStore.set(saltPath, safeStorageMock.encryptString('fakesalt'))

    const status = await getAuthStatus()
    expect(status.isSetUp).toBe(false)
  })
})
