import sqlcipher from '@journeyapps/sqlcipher'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const DB_PATH = path.join(app.getPath('userData'), 'hta-offline.db')

let db: sqlcipher.Database | null = null

// ─── Promise wrappers over callback API ─────────────────────────────────────

/** Promisified wrapper around sqlcipher's callback-based Database */
export interface WrappedDb {
  run(sql: string, ...params: unknown[]): Promise<{ lastID: number; changes: number }>
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined>
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>
  exec(sql: string): Promise<void>
  close(): Promise<void>
  /** Access the raw sqlcipher.Database for advanced usage */
  raw: sqlcipher.Database
}

function wrapRun(db: sqlcipher.Database, sql: string, ...params: unknown[]): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, ...params, function (this: sqlcipher.RunResult, err: Error | null) {
      if (err) reject(err)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

function wrapGet<T>(db: sqlcipher.Database, sql: string, ...params: unknown[]): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, ...params, (err: Error | null, row: T) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

function wrapAll<T>(db: sqlcipher.Database, sql: string, ...params: unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, ...params, (err: Error | null, rows: T[]) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })
}

function wrapExec(db: sqlcipher.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err: Error | null) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function wrapClose(db: sqlcipher.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((err: Error | null) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function wrap(raw: sqlcipher.Database): WrappedDb {
  return {
    run: (sql, ...params) => wrapRun(raw, sql, ...params),
    get: <T = Record<string, unknown>>(sql: string, ...params: unknown[]) => wrapGet<T>(raw, sql, ...params),
    all: <T = Record<string, unknown>>(sql: string, ...params: unknown[]) => wrapAll<T>(raw, sql, ...params),
    exec: (sql) => wrapExec(raw, sql),
    close: () => wrapClose(raw),
    raw,
  }
}

// ─── Open / Close / Access ──────────────────────────────────────────────────

let wrappedDb: WrappedDb | null = null

/**
 * Open (or create) the encrypted SQLCipher database.
 * @param encryptionKey Hex-encoded 256-bit key derived from user PIN + deviceId
 */
export function openDb(encryptionKey: string): Promise<WrappedDb> {
  return new Promise((resolve, reject) => {
    if (wrappedDb) {
      resolve(wrappedDb)
      return
    }

    const raw = new sqlcipher.Database(DB_PATH, (err) => {
      if (err) {
        reject(err)
        return
      }

      db = raw

      // Set encryption key (PRAGMA key must be the first statement)
      raw.run(`PRAGMA key = "x'${encryptionKey}'"`, (keyErr) => {
        if (keyErr) {
          reject(keyErr)
          return
        }

        // Enable WAL mode and foreign keys
        raw.run('PRAGMA journal_mode = WAL', () => {
          raw.run('PRAGMA foreign_keys = ON', async () => {
            wrappedDb = wrap(raw)
            try {
              await runMigrations(wrappedDb)
              resolve(wrappedDb)
            } catch (migErr) {
              reject(migErr)
            }
          })
        })
      })
    })
  })
}

/**
 * Get the currently open database. Throws if not yet unlocked.
 */
export function getDb(): WrappedDb {
  if (!wrappedDb) throw new Error('Database not unlocked. Call openDb() first.')
  return wrappedDb
}

/**
 * Close the database connection.
 */
export async function closeDb(): Promise<void> {
  if (wrappedDb) {
    await wrappedDb.close()
    db = null
    wrappedDb = null
  }
}

/**
 * Check if the database file exists on disk.
 */
export function dbExists(): boolean {
  return fs.existsSync(DB_PATH)
}

/**
 * Get the path to the database file.
 */
export function getDbPath(): string {
  return DB_PATH
}

// ─── Migrations ─────────────────────────────────────────────────────────────

async function runMigrations(db: WrappedDb): Promise<void> {
  // Try packaged resources path first, then fall back to dev path
  let migrationDir = process.resourcesPath
    ? path.join(process.resourcesPath, 'migrations')
    : path.join(__dirname, '../migrations')

  // In packaged builds with asarUnpack, migrations are extracted alongside the asar
  const unpackedDir = migrationDir.replace('app.asar', 'app.asar.unpacked')
  if (fs.existsSync(unpackedDir)) {
    migrationDir = unpackedDir
  }
  if (!fs.existsSync(migrationDir)) return

  // Ensure _migrations table exists (it's in 001-init.sql but we need it to track)
  await db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  const files = fs.readdirSync(migrationDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const applied = new Set(
    (await db.all<{ name: string }>('SELECT name FROM _migrations'))
      .map(r => r.name)
  )

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf-8')
    await db.exec(sql)
    await db.run('INSERT INTO _migrations (name) VALUES (?)', file)
    console.log(`[sqlite] Applied migration: ${file}`)
  }
}
