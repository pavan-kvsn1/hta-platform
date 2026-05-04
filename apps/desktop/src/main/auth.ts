import crypto from 'crypto'
import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { openDb, closeDb, getDb, type WrappedDb } from './sqlite-db'
import { auditLog } from './audit'
import { wipeAllLocalData } from './security'

const PBKDF2_ITERATIONS = 600_000 // OWASP 2024 recommendation for SHA-256
const MAX_ATTEMPTS = 5

// Credentials are stored as DPAPI-encrypted files in userData
const CRED_DIR = () => path.join(app.getPath('userData'), '.credentials')

// ─── Credential Store (safeStorage / DPAPI) ─────────────────────────────────

function ensureCredDir(): void {
  const dir = CRED_DIR()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function setCredential(key: string, value: string): void {
  ensureCredDir()
  const encrypted = safeStorage.encryptString(value)
  fs.writeFileSync(path.join(CRED_DIR(), key), encrypted)
}

function getCredential(key: string): string | null {
  const filePath = path.join(CRED_DIR(), key)
  if (!fs.existsSync(filePath)) return null
  try {
    const encrypted = fs.readFileSync(filePath)
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

function deleteCredential(key: string): void {
  const filePath = path.join(CRED_DIR(), key)
  if (fs.existsSync(filePath)) {
    // Overwrite before delete for secure erasure
    const size = fs.statSync(filePath).size
    if (size > 0) fs.writeFileSync(filePath, crypto.randomBytes(size))
    fs.unlinkSync(filePath)
  }
}

// ─── Key Derivation ─────────────────────────────────────────────────────────

function deriveKey(password: string, deviceId: string, userId: string, salt: Buffer): Buffer {
  const input = `${password}:${deviceId}:${userId}`
  return crypto.pbkdf2Sync(input, salt, PBKDF2_ITERATIONS, 32, 'sha256')
}

// ─── First-Time Setup (Online) ──────────────────────────────────────────────

export async function setupOfflineAuth(
  password: string,
  userId: string,
  refreshToken: string,
  userProfile?: Record<string, unknown>
): Promise<{ deviceId: string }> {
  const deviceId = crypto.randomUUID()
  const salt = crypto.randomBytes(32)
  const key = deriveKey(password, deviceId, userId, salt)

  // Encrypt refresh token with AES-256-GCM
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Store secrets via DPAPI (safeStorage)
  setCredential('device-id', deviceId)
  setCredential('user-id', userId)
  setCredential('salt', salt.toString('base64'))
  setCredential('encrypted-token', JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: authTag.toString('base64'),
  }))
  setCredential('auth-attempts', '0')

  // Store user profile for session restoration after PIN unlock
  if (userProfile) {
    setCredential('user-profile', JSON.stringify(userProfile))
  }

  // Open encrypted DB with the derived key
  const db = await openDb(key.toString('hex'))

  // Store device identity in DB
  await db.run('INSERT OR REPLACE INTO device_meta (key, value) VALUES (?, ?)', 'device_id', deviceId)
  await db.run('INSERT OR REPLACE INTO device_meta (key, value) VALUES (?, ?)', 'user_id', userId)

  await auditLog(db, {
    userId,
    deviceId,
    action: 'AUTH_SETUP',
    entityType: 'auth',
    metadata: { deviceId },
  })

  return { deviceId }
}

// ─── Offline Unlock (Password + Challenge-Response Code 2FA) ────────────────

export interface UnlockResult {
  success: boolean
  refreshToken?: string
  attemptsRemaining?: number
  codesRemaining?: number
  error?: string
}

export async function unlockWithPasswordAndCode(
  password: string,
  challengeKey: string,
  challengeResponse: string
): Promise<UnlockResult> {
  const deviceId = getCredential('device-id')
  const userId = getCredential('user-id')
  const saltB64 = getCredential('salt')
  const tokenData = getCredential('encrypted-token')
  const attempts = parseInt(getCredential('auth-attempts') || '0', 10)

  if (!deviceId || !userId || !saltB64 || !tokenData) {
    return { success: false, error: 'No offline auth configured' }
  }

  // Check lockout
  if (attempts >= MAX_ATTEMPTS) {
    await wipeAllLocalData('Auth lockout exceeded')
    return { success: false, attemptsRemaining: 0, error: 'Device wiped due to too many failed attempts' }
  }

  const salt = Buffer.from(saltB64, 'base64')
  const key = deriveKey(password, deviceId, userId, salt)

  // Try to decrypt refresh token (validates password)
  let refreshToken: string
  try {
    const stored = JSON.parse(tokenData)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(stored.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(stored.tag, 'base64'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(stored.data, 'base64')),
      decipher.final(),
    ])
    refreshToken = decrypted.toString('utf8')
  } catch {
    // Wrong password
    const newAttempts = attempts + 1
    setCredential('auth-attempts', String(newAttempts))

    if (newAttempts >= MAX_ATTEMPTS) {
      await wipeAllLocalData('Auth lockout exceeded')
      return { success: false, attemptsRemaining: 0, error: 'Device wiped due to too many failed attempts' }
    }

    return { success: false, attemptsRemaining: MAX_ATTEMPTS - newAttempts, error: 'Incorrect password' }
  }

  // Password correct — open DB and validate challenge-response code
  let db: WrappedDb
  try {
    db = await openDb(key.toString('hex'))
  } catch {
    return { success: false, error: 'Failed to open database' }
  }

  // Validate challenge-response: find the specific code by key, then verify hash
  const codeRow = await db.get<{ id: string; sequence: number; code_hash: string }>(
    'SELECT id, sequence, code_hash FROM offline_codes WHERE key = ? AND used = 0 LIMIT 1',
    challengeKey.toUpperCase()
  )

  if (!codeRow) {
    await auditLog(db, {
      userId, deviceId,
      action: 'AUTH_CODE_FAILED',
      entityType: 'auth',
      metadata: { reason: 'Invalid challenge key', challengeKey },
    })
    return {
      success: false,
      error: 'Invalid challenge key',
      attemptsRemaining: MAX_ATTEMPTS - attempts,
    }
  }

  const responseHash = crypto.createHash('sha256')
    .update(challengeResponse.toUpperCase().replace(/[-\s]/g, ''))
    .digest('hex')

  if (responseHash !== codeRow.code_hash) {
    await auditLog(db, {
      userId, deviceId,
      action: 'AUTH_CODE_FAILED',
      entityType: 'auth',
      metadata: { reason: 'Incorrect response value', challengeKey },
    })
    return {
      success: false,
      error: 'Incorrect code value',
      attemptsRemaining: MAX_ATTEMPTS - attempts,
    }
  }

  // Mark code as consumed
  await db.run(
    'UPDATE offline_codes SET used = 1, used_at = datetime(?) WHERE id = ?',
    new Date().toISOString(), codeRow.id
  )

  // Check remaining codes
  const remaining = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM offline_codes WHERE used = 0')
  const codesRemaining = remaining?.cnt ?? 0

  // Reset attempts
  setCredential('auth-attempts', '0')

  // Update session timestamp
  await db.run(
    'INSERT OR REPLACE INTO session_meta (key, value) VALUES (?, ?)',
    'last_full_auth', new Date().toISOString()
  )

  await auditLog(db, {
    userId, deviceId,
    action: 'AUTH_UNLOCK',
    entityType: 'auth',
    metadata: { codeSequence: codeRow.sequence, codesRemaining },
  })

  // Store a challenge key for next time (app restart / logout)
  await prepareNextChallenge()

  return { success: true, refreshToken, codesRemaining }
}

// ─── Password-Only Re-entry (idle timeout, no code consumed) ────────────────

export async function unlockWithPasswordOnly(password: string): Promise<{
  success: boolean
  attemptsRemaining?: number
  error?: string
}> {
  const deviceId = getCredential('device-id')
  const userId = getCredential('user-id')
  const saltB64 = getCredential('salt')
  const tokenData = getCredential('encrypted-token')
  const attempts = parseInt(getCredential('auth-attempts') || '0', 10)

  if (!deviceId || !userId || !saltB64 || !tokenData) {
    return { success: false, error: 'No offline auth configured' }
  }

  if (attempts >= MAX_ATTEMPTS) {
    await wipeAllLocalData('Auth lockout exceeded')
    return { success: false, attemptsRemaining: 0 }
  }

  const salt = Buffer.from(saltB64, 'base64')
  const key = deriveKey(password, deviceId, userId, salt)

  // Validate password by attempting decryption
  try {
    const stored = JSON.parse(tokenData)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(stored.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(stored.tag, 'base64'))
    decipher.update(Buffer.from(stored.data, 'base64'))
    decipher.final() // Throws if wrong password
  } catch {
    // Wrong password
    const newAttempts = attempts + 1
    setCredential('auth-attempts', String(newAttempts))

    if (newAttempts >= MAX_ATTEMPTS) {
      await wipeAllLocalData('Auth lockout exceeded')
      return { success: false, attemptsRemaining: 0 }
    }

    return { success: false, attemptsRemaining: MAX_ATTEMPTS - newAttempts, error: 'Incorrect password' }
  }

  // Password correct — reset attempts and open DB if needed
  setCredential('auth-attempts', '0')

  try {
    const db = await openDb(key.toString('hex'))
    await db.run(
      'INSERT OR REPLACE INTO session_meta (key, value) VALUES (?, ?)',
      'last_activity', new Date().toISOString()
    )
    // Store a challenge key for next time (app restart / logout)
    await prepareNextChallenge()
  } catch (err) {
    console.error('[auth] unlockWithPasswordOnly post-unlock DB error:', err)
  }

  return { success: true }
}

// ─── Auth Status ────────────────────────────────────────────────────────────

export interface AuthStatus {
  isSetUp: boolean
  isUnlocked: boolean
  codesRemaining?: number
  needsFullAuth?: boolean // true if >24h since last full auth or app restart
  challengeKey?: string   // random unused code key for challenge-response (e.g. "B4") — row+col from grid
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const deviceId = getCredential('device-id')
  if (!deviceId) return { isSetUp: false, isUnlocked: false }

  let isUnlocked = false
  let codesRemaining: number | undefined
  let needsFullAuth = true
  let challengeKey: string | undefined

  try {
    const db = getDb()
    isUnlocked = true

    const remaining = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM offline_codes WHERE used = 0')
    codesRemaining = remaining?.cnt ?? 0

    // Pick a random unused code to use as the challenge
    const randomCode = await db.get<{ key: string }>(
      'SELECT key FROM offline_codes WHERE used = 0 ORDER BY RANDOM() LIMIT 1'
    )
    challengeKey = randomCode?.key

    const lastAuth = await db.get<{ value: string }>('SELECT value FROM session_meta WHERE key = ?', 'last_full_auth')
    if (lastAuth) {
      const hoursSinceAuth = (Date.now() - new Date(lastAuth.value).getTime()) / (1000 * 60 * 60)
      needsFullAuth = hoursSinceAuth >= 24
    }
  } catch {
    // DB not open — read stored challenge key from DPAPI (set during logout)
    challengeKey = getCredential('next-challenge-key') ?? undefined
  }

  return { isSetUp: true, isUnlocked, codesRemaining, needsFullAuth, challengeKey }
}

// ─── Pre-Logout Challenge Prep ─────────────────────────────────────────────

/**
 * Pick a random unused challenge key from DB and store it in DPAPI.
 * Must be called BEFORE closeDb() during logout so the unlock screen
 * can display the challenge key without needing the DB open.
 */
export async function prepareNextChallenge(): Promise<void> {
  const db = getDb()
  const randomCode = await db.get<{ key: string }>(
    'SELECT key FROM offline_codes WHERE used = 0 ORDER BY RANDOM() LIMIT 1'
  )
  if (randomCode?.key) {
    setCredential('next-challenge-key', randomCode.key)
  } else {
    deleteCredential('next-challenge-key')
  }
}

// ─── Credential Cleanup ────────────────────────────────────────────────────

export function clearCredentials(): void {
  for (const key of ['device-id', 'user-id', 'salt', 'encrypted-token', 'auth-attempts', 'user-profile', 'next-challenge-key']) {
    deleteCredential(key)
  }
  // Remove the credentials directory
  const dir = CRED_DIR()
  if (fs.existsSync(dir)) {
    try { fs.rmdirSync(dir) } catch { /* not empty or already gone */ }
  }
}

export function getDeviceId(): string | null {
  return getCredential('device-id')
}

export function getUserId(): string | null {
  return getCredential('user-id')
}

export function getUserProfile(): Record<string, unknown> | null {
  const raw = getCredential('user-profile')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
