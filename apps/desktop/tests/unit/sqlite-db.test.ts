import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Hoisted shared state (available before vi.mock factories) ──────────────

const { mockRawDb, fsMockFns, mockResourcesPath } = vi.hoisted(() => {
  /** Fake callback-based raw database matching sqlcipher.Database */
  const mockRawDb = {
    run: vi.fn((...args: unknown[]) => {
      const cb = args[args.length - 1] as Function
      queueMicrotask(() => cb.call({ lastID: 1, changes: 0 }, null))
    }),
    get: vi.fn((...args: unknown[]) => {
      const cb = args[args.length - 1] as Function
      queueMicrotask(() => cb(null, undefined))
    }),
    all: vi.fn((...args: unknown[]) => {
      const cb = args[args.length - 1] as Function
      queueMicrotask(() => cb(null, []))
    }),
    exec: vi.fn((_sql: string, cb: Function) => {
      queueMicrotask(() => cb(null))
    }),
    close: vi.fn((cb: Function) => {
      queueMicrotask(() => cb(null))
    }),
  }

  const fsMockFns = {
    existsSync: vi.fn((_p: string) => false),
    readdirSync: vi.fn((_dir: string) => []),
    readFileSync: vi.fn((_p: string, _enc: string) => ''),
  }

  // Track resourcesPath override for migration directory resolution
  const mockResourcesPath = { value: undefined as string | undefined }

  return { mockRawDb, fsMockFns, mockResourcesPath }
})

// ─── Mock @journeyapps/sqlcipher ───────────────────────────────────────────

vi.mock('@journeyapps/sqlcipher', () => ({
  default: {
    Database: vi.fn((_path: string, cb: (err: Error | null) => void) => {
      // CRITICAL: callback must fire asynchronously so `raw` is assigned first
      queueMicrotask(() => cb(null))
      return mockRawDb
    }),
  },
}))

// ─── Mock electron ─────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
}))

// ─── Mock fs ───────────────────────────────────────────────────────────────

vi.mock('fs', () => ({
  default: { ...fsMockFns },
  ...fsMockFns,
}))

// ─── Import the module under test ──────────────────────────────────────────

import { openDb, getDb, closeDb, dbExists, getDbPath } from '../../src/main/sqlite-db'
import sqlcipher from '@journeyapps/sqlcipher'
import path from 'path'

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Restore all mock implementations after vi.clearAllMocks() wipes them. */
function restoreMocks() {
  // Restore Database constructor
  vi.mocked(sqlcipher.Database).mockImplementation(
    (_path: string, cb: (err: Error | null) => void) => {
      queueMicrotask(() => cb(null))
      return mockRawDb as unknown as sqlcipher.Database
    },
  )

  // Restore raw DB callbacks
  mockRawDb.run.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as Function
    queueMicrotask(() => cb.call({ lastID: 1, changes: 0 }, null))
  })
  mockRawDb.get.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as Function
    queueMicrotask(() => cb(null, undefined))
  })
  mockRawDb.all.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as Function
    queueMicrotask(() => cb(null, []))
  })
  mockRawDb.exec.mockImplementation((_sql: string, cb: Function) => {
    queueMicrotask(() => cb(null))
  })
  mockRawDb.close.mockImplementation((cb: Function) => {
    queueMicrotask(() => cb(null))
  })

  // Restore fs mocks — default: no migration dir exists
  fsMockFns.existsSync.mockImplementation((_p: string) => false)
  fsMockFns.readdirSync.mockImplementation((_dir: string) => [])
  fsMockFns.readFileSync.mockImplementation((_p: string, _enc: string) => '')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockResourcesPath.value = undefined
  restoreMocks()
})

afterEach(async () => {
  // Ensure close mock is functional before resetting module state
  mockRawDb.close.mockImplementation((cb: Function) => {
    queueMicrotask(() => cb(null))
  })
  try { await closeDb() } catch { /* already closed or never opened */ }
})

// ─── openDb ────────────────────────────────────────────────────────────────

describe('openDb', () => {
  it('sets PRAGMA key with the provided encryption key', async () => {
    const key = 'deadbeef1234567890abcdef'
    await openDb(key)

    const runCalls = mockRawDb.run.mock.calls
    expect(runCalls[0][0]).toBe(`PRAGMA key = "x'${key}'"`)
  })

  it('enables WAL journal mode', async () => {
    await openDb('testkey')

    const runCalls = mockRawDb.run.mock.calls
    const walCall = runCalls.find((c: unknown[]) => c[0] === 'PRAGMA journal_mode = WAL')
    expect(walCall).toBeDefined()
  })

  it('enables foreign keys', async () => {
    await openDb('testkey')

    const runCalls = mockRawDb.run.mock.calls
    const fkCall = runCalls.find((c: unknown[]) => c[0] === 'PRAGMA foreign_keys = ON')
    expect(fkCall).toBeDefined()
  })

  it('runs migrations and returns a WrappedDb', async () => {
    const wrappedDb = await openDb('testkey')

    expect(wrappedDb).toBeDefined()
    expect(typeof wrappedDb.run).toBe('function')
    expect(typeof wrappedDb.get).toBe('function')
    expect(typeof wrappedDb.all).toBe('function')
    expect(typeof wrappedDb.exec).toBe('function')
    expect(typeof wrappedDb.close).toBe('function')
    expect(wrappedDb.raw).toBe(mockRawDb)
  })

  it('sets PRAGMAs in correct order: key first, then WAL, then foreign_keys', async () => {
    await openDb('testkey')

    const runCalls = mockRawDb.run.mock.calls.map((c: unknown[]) => c[0])
    const keyIdx = runCalls.indexOf(`PRAGMA key = "x'testkey'"`)
    const walIdx = runCalls.indexOf('PRAGMA journal_mode = WAL')
    const fkIdx = runCalls.indexOf('PRAGMA foreign_keys = ON')

    expect(keyIdx).toBeLessThan(walIdx)
    expect(walIdx).toBeLessThan(fkIdx)
  })
})

// ─── openDb (already open) ─────────────────────────────────────────────────

describe('openDb (already open)', () => {
  it('returns existing instance without re-opening the database', async () => {
    const first = await openDb('testkey')
    const second = await openDb('testkey')

    expect(first).toBe(second)
    // Database constructor should only have been called once
    expect(sqlcipher.Database).toHaveBeenCalledTimes(1)
  })
})

// ─── getDb ─────────────────────────────────────────────────────────────────

describe('getDb', () => {
  it('returns WrappedDb when database is open', async () => {
    const opened = await openDb('testkey')
    const got = getDb()

    expect(got).toBe(opened)
  })

  it('throws "Database not unlocked. Call openDb() first." when not open', () => {
    expect(() => getDb()).toThrow('Database not unlocked. Call openDb() first.')
  })
})

// ─── closeDb ───────────────────────────────────────────────────────────────

describe('closeDb', () => {
  it('calls close() on the raw database', async () => {
    await openDb('testkey')
    await closeDb()

    expect(mockRawDb.close).toHaveBeenCalledTimes(1)
  })

  it('sets internal state to null so subsequent getDb() throws', async () => {
    await openDb('testkey')
    await closeDb()

    expect(() => getDb()).toThrow('Database not unlocked. Call openDb() first.')
  })

  it('allows re-opening after close', async () => {
    await openDb('testkey')
    await closeDb()

    restoreMocks()
    vi.mocked(sqlcipher.Database).mockClear()
    const reopened = await openDb('newkey')
    expect(reopened).toBeDefined()
    expect(typeof reopened.run).toBe('function')
    // Constructor called again for the new open
    expect(sqlcipher.Database).toHaveBeenCalledTimes(1)
  })
})

// ─── closeDb (not open) ───────────────────────────────────────────────────

describe('closeDb (not open)', () => {
  it('is a no-op and does not throw', async () => {
    await expect(closeDb()).resolves.toBeUndefined()
    expect(mockRawDb.close).not.toHaveBeenCalled()
  })
})

// ─── dbExists ──────────────────────────────────────────────────────────────

describe('dbExists', () => {
  it('returns true when database file exists on disk', () => {
    fsMockFns.existsSync.mockImplementation((p: string) =>
      p.includes('hta-offline.db'),
    )

    expect(dbExists()).toBe(true)
    expect(fsMockFns.existsSync).toHaveBeenCalledWith(
      expect.stringContaining('hta-offline.db'),
    )
  })

  it('returns false when database file does not exist', () => {
    fsMockFns.existsSync.mockReturnValue(false)

    expect(dbExists()).toBe(false)
  })
})

// ─── getDbPath ─────────────────────────────────────────────────────────────

describe('getDbPath', () => {
  it('returns a path containing hta-offline.db', () => {
    const dbPath = getDbPath()

    expect(dbPath).toContain('hta-offline.db')
  })

  it('includes the userData directory in the path', () => {
    const dbPath = getDbPath()

    // path.join normalizes separators per platform (backslash on Windows)
    expect(dbPath).toContain(path.join('/mock/userData'))
  })
})

// ─── Migration runner ──────────────────────────────────────────────────────

describe('Migration runner', () => {
  it('applies .sql files in sorted order', async () => {
    const migrationFiles = ['002-add-table.sql', '001-init.sql', '003-alter.sql']
    const migrationSql: Record<string, string> = {
      '001-init.sql': 'CREATE TABLE foo (id INTEGER);',
      '002-add-table.sql': 'CREATE TABLE bar (id INTEGER);',
      '003-alter.sql': 'ALTER TABLE foo ADD COLUMN name TEXT;',
    }

    // Migration dir exists
    fsMockFns.existsSync.mockImplementation((_p: string) => true)
    fsMockFns.readdirSync.mockReturnValue(migrationFiles as any)
    fsMockFns.readFileSync.mockImplementation((p: string, _enc: string) => {
      const filename = path.basename(p)
      return migrationSql[filename] || ''
    })

    // No previously applied migrations
    mockRawDb.all.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as Function
      queueMicrotask(() => cb(null, []))
    })

    // Track exec calls to verify order
    const execSqlCalls: string[] = []
    mockRawDb.exec.mockImplementation((sql: string, cb: Function) => {
      execSqlCalls.push(sql)
      queueMicrotask(() => cb(null))
    })

    await openDb('testkey')

    // exec is called: CREATE TABLE _migrations, then each migration sql
    // The _migrations table creation is the first exec call
    expect(execSqlCalls[0]).toContain('CREATE TABLE IF NOT EXISTS _migrations')

    // Migration files are applied in sorted order
    const appliedSql = execSqlCalls.slice(1) // skip _migrations table creation
    expect(appliedSql[0]).toBe('CREATE TABLE foo (id INTEGER);')
    expect(appliedSql[1]).toBe('CREATE TABLE bar (id INTEGER);')
    expect(appliedSql[2]).toBe('ALTER TABLE foo ADD COLUMN name TEXT;')

    // Each migration is also recorded via INSERT into _migrations
    const runCalls = mockRawDb.run.mock.calls
    const insertCalls = runCalls.filter((c: unknown[]) =>
      (c[0] as string).includes('INSERT INTO _migrations'),
    )
    expect(insertCalls).toHaveLength(3)
    expect(insertCalls[0][1]).toBe('001-init.sql')
    expect(insertCalls[1][1]).toBe('002-add-table.sql')
    expect(insertCalls[2][1]).toBe('003-alter.sql')
  })

  it('skips already-applied migrations', async () => {
    const migrationFiles = ['001-init.sql', '002-add-table.sql']
    const migrationSql: Record<string, string> = {
      '001-init.sql': 'CREATE TABLE foo (id INTEGER);',
      '002-add-table.sql': 'CREATE TABLE bar (id INTEGER);',
    }

    fsMockFns.existsSync.mockImplementation((_p: string) => true)
    fsMockFns.readdirSync.mockReturnValue(migrationFiles as any)
    fsMockFns.readFileSync.mockImplementation((p: string, _enc: string) => {
      const filename = path.basename(p)
      return migrationSql[filename] || ''
    })

    // 001-init.sql already applied
    mockRawDb.all.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as Function
      queueMicrotask(() => cb(null, [{ name: '001-init.sql' }]))
    })

    const execSqlCalls: string[] = []
    mockRawDb.exec.mockImplementation((sql: string, cb: Function) => {
      execSqlCalls.push(sql)
      queueMicrotask(() => cb(null))
    })

    await openDb('testkey')

    // Only _migrations table creation + one new migration (002)
    const migrationExecs = execSqlCalls.filter(
      (sql) => !sql.includes('_migrations'),
    )
    expect(migrationExecs).toHaveLength(1)
    expect(migrationExecs[0]).toBe('CREATE TABLE bar (id INTEGER);')

    // Only one INSERT for 002
    const runCalls = mockRawDb.run.mock.calls
    const insertCalls = runCalls.filter((c: unknown[]) =>
      (c[0] as string).includes('INSERT INTO _migrations'),
    )
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0][1]).toBe('002-add-table.sql')
  })

  it('handles non-existent migration directory gracefully', async () => {
    // No migration directory exists
    fsMockFns.existsSync.mockReturnValue(false)

    // Should not throw — just skip migrations
    const wrappedDb = await openDb('testkey')
    expect(wrappedDb).toBeDefined()

    // readdirSync should never be called since the dir doesn't exist
    expect(fsMockFns.readdirSync).not.toHaveBeenCalled()
  })
})
