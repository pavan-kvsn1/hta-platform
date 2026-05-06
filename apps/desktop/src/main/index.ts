import { app, BrowserWindow, session, net, ipcMain, Menu, safeStorage } from 'electron'
import path from 'path'
import { setupTlsPinning, checkInactivityWipe, wipeAllLocalData } from './security'
import { setupOfflineAuth, unlockWithPasswordAndCode, unlockWithPasswordOnly, getAuthStatus, getDeviceId, getUserId, getUserProfile, clearCredentials, setCredential, getCredential, getLatestRefreshToken } from './auth'
import { closeDb, dbExists, getDb } from './sqlite-db'
import { registerDevice, checkDeviceStatus, sendHeartbeat } from './device'
import { registerDraftHandlers, registerImageHandlers, registerConflictHandlers } from './ipc-handlers'
import { SyncEngine } from './sync-engine'
import { preCacheReferenceData, getCachedMasterInstruments, getCachedCustomers } from './ref-cache'
import { vpnProvision, vpnStatus } from './vpn'
import { autoUpdater } from 'electron-updater'

// In packaged builds, app.isPackaged is true and resourcesPath points to bundled Next.js.
// During dev, app.isPackaged is false — we load from the external Next.js dev server.
const IS_DEV = !app.isPackaged
let APP_URL = 'http://localhost:3000'
// Lazy getter — HTA_API_URL is set later in startNextServer
function getApiBase(): string { return process.env.HTA_API_URL || 'http://10.100.0.1' }
const API_BASE = 'http://10.100.0.1' // Default for early references
// Public provisioning endpoint — reachable before VPN is up
const PROVISION_URL = process.env.HTA_PROVISION_URL || 'http://35.200.149.46'
// Production web app — accessed through VPN after provisioning
const PRODUCTION_APP_URL = process.env.HTA_PRODUCTION_URL || 'http://10.0.0.17:30081'

// Hide default menu bar (File, Edit, View, Window, Help)
Menu.setApplicationMenu(null)

/** Find a free TCP port starting from the given port */
function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve) => {
    const net = require('net') as typeof import('net')
    const server = net.createServer()
    server.listen(startPort, 'localhost', () => {
      server.close(() => resolve(startPort))
    })
    server.on('error', () => {
      resolve(findFreePort(startPort + 1))
    })
  })
}

let mainWindow: BrowserWindow | null = null
let syncEngine: SyncEngine | null = null
let cachedAccessToken: string | null = null
let cachedRefreshToken: string | null = null
const ACCESS_TOKEN_FILE = path.join(app.getPath('userData'), '.access-token')

/** Persist access token to disk via safeStorage (survives restarts) */
function persistAccessToken(token: string): void {
  try {
    const encrypted = safeStorage.encryptString(token)
    require('fs').writeFileSync(ACCESS_TOKEN_FILE, encrypted)
  } catch { /* ignore */ }
}

/** Load persisted access token from disk */
function loadPersistedAccessToken(): string | null {
  try {
    const fs = require('fs') as typeof import('fs')
    if (!fs.existsSync(ACCESS_TOKEN_FILE)) return null
    const encrypted = fs.readFileSync(ACCESS_TOKEN_FILE)
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

/** Fetch a fresh access token from the Fastify API using a refresh token */
async function refreshAccessToken(refreshToken: string): Promise<void> {
  try {
    // Use VPN gateway (10.100.0.1) when VPN is up, fall back to public gateway
    const apiUrl = net.isOnline() ? 'http://10.100.0.1' : PROVISION_URL
    const res = await fetch(`${apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': 'hta-calibration' },
      body: JSON.stringify({ refreshToken }),
    })
    const body = await res.text()
    console.log('[auth] Refresh response:', res.status, body.slice(0, 200))
    if (res.ok) {
      const data = JSON.parse(body) as { accessToken: string; refreshToken?: string }
      cachedAccessToken = data.accessToken
      persistAccessToken(data.accessToken)
      // Persist rotated refresh token so it survives app restarts
      if (data.refreshToken) {
        cachedRefreshToken = data.refreshToken
        const { updateStoredRefreshToken } = require('./auth')
        updateStoredRefreshToken(data.refreshToken)
        console.log('[auth] Refresh token rotated and persisted')
      }
      console.log('[auth] Access token set successfully')
    }
  } catch (err) {
    console.warn('[auth] Failed to refresh access token:', err)
  }
}
let syncInterval: ReturnType<typeof setInterval> | null = null
let refCacheInterval: ReturnType<typeof setInterval> | null = null
let cachedAuthToken: string | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'HTA Calibr8s',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Prevent navigation to external URLs (only allow localhost Next.js server)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost:3000')) {
      event.preventDefault()
    }
  })

  // Block new window creation (prevents window.open attacks)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' as const }))

  mainWindow.loadURL(`${APP_URL}/desktop/login`)

  mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function startNextServer(): Promise<void> {
  if (IS_DEV) return

  const fs = require('fs') as typeof import('fs')
  const serverPath = path.join(process.resourcesPath!, 'next-app', 'apps', 'web-hta', 'server.js')

  if (!fs.existsSync(serverPath)) {
    console.error('[next] server.js not found at:', serverPath)
    throw new Error(`Next.js server not found: ${serverPath}`)
  }

  // Find a free port starting from 3000
  const port = await findFreePort(3000)
  APP_URL = `http://localhost:${port}`
  console.log(`[next] Using port ${port}`)

  process.env.PORT = String(port)
  process.env.HOSTNAME = 'localhost'
  process.env.NODE_ENV = 'development'
  process.env.AUTH_SECRET = 'RCjgdLq8K5ZYHIG5Fkz3ld3MEKmkgI/u9d+Hl8YnMog='
  process.env.NEXTAUTH_URL = `http://localhost:${port}`
  process.env.HTA_DESKTOP = '1'
  process.env.HTA_API_URL = process.env.HTA_API_URL || 'http://10.100.0.1'
  // Prisma needs DATABASE_URL to instantiate without crashing.
  // Desktop doesn't use Prisma directly — auth goes through the remote API.
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/placeholder'

  try {
    require(serverPath)
    console.log('[next] Server module loaded, waiting for startup...')
  } catch (err) {
    console.error('[next] Failed to load server module:', err)
    throw err
  }

  // Wait for server to be ready (health check with retries)
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(r => setTimeout(r, 500))
    try {
      const res = await fetch(APP_URL)
      if (res.ok || res.status === 307 || res.status === 302) {
        console.log(`[next] Server ready after ${(attempt + 1) * 500}ms`)
        return
      }
    } catch {
      // Not ready yet
    }
  }
  console.warn('[next] Server did not respond within 10s, loading anyway')
}

// ─── Connectivity ───────────────────────────────────────────────────────────

let lastOnlineState = true

function pollConnectivity() {
  setInterval(() => {
    const online = net.isOnline()
    if (online !== lastOnlineState) {
      lastOnlineState = online
      mainWindow?.webContents.send('app:connectivity-changed', online)
    }
  }, 5_000)
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

// Connectivity
ipcMain.handle('app:online-status', () => net.isOnline())

// API reachability check (VPN might be down even if internet is up)
let apiReachableCache: { value: boolean; timestamp: number } = { value: false, timestamp: 0 }
const API_REACHABLE_CACHE_MS = 30_000 // Cache for 30 seconds

ipcMain.handle('app:is-api-reachable', async () => {
  // Return cached result if fresh
  if (Date.now() - apiReachableCache.timestamp < API_REACHABLE_CACHE_MS) {
    return apiReachableCache.value
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    // Any HTTP response (even 404) means VPN + nginx gateway is reachable
    await fetch('http://10.100.0.1/', { signal: controller.signal })
    clearTimeout(timeout)
    apiReachableCache = { value: true, timestamp: Date.now() }
    return true
  } catch {
    apiReachableCache = { value: false, timestamp: Date.now() }
    return false
  }
})

// Access token for API calls (used by renderer's apiFetch)
// Auto-refreshes from cached refresh token if access token is null (e.g., after app restart)
ipcMain.handle('auth:get-access-token', async () => {
  // 1. Return cached token if available
  if (cachedAccessToken) return cachedAccessToken

  // 2. Try refreshing from cached refresh token
  if (cachedRefreshToken) {
    await refreshAccessToken(cachedRefreshToken)
    if (cachedAccessToken) return cachedAccessToken
  }

  // 3. Try loading persisted access token from disk (survives restarts)
  const persisted = loadPersistedAccessToken()
  if (persisted) {
    cachedAccessToken = persisted
    return cachedAccessToken
  }

  // 4. All token sources exhausted — renderer should prompt re-login
  console.warn('[auth] No valid access token available — user needs to re-authenticate')
  return null
})

// Refresh access token on demand (called by renderer when API returns 401)
let isRefreshing = false
ipcMain.handle('auth:refresh-access-token', async () => {
  // Lock to prevent concurrent refreshes (multiple 401s at once)
  if (isRefreshing) {
    // Wait for the ongoing refresh to finish, then return whatever we have
    await new Promise(r => setTimeout(r, 2000))
    return cachedAccessToken
  }

  isRefreshing = true
  try {
    if (cachedRefreshToken) {
      await refreshAccessToken(cachedRefreshToken)
    }
    return cachedAccessToken
  } finally {
    isRefreshing = false
  }
})

// Switch to production web app after VPN is established
ipcMain.handle('app:load-production', () => {
  if (mainWindow) {
    mainWindow.loadURL(`${PRODUCTION_APP_URL}/login`)
  }
})

// Auth: first-time setup (called after online login — password used as encryption key)
ipcMain.handle('auth:setup', async (_event, password: string, userId: string, refreshToken: string, accessToken: string, userProfile?: Record<string, unknown>) => {
  try {
    cachedAccessToken = accessToken
    cachedRefreshToken = refreshToken
    persistAccessToken(accessToken)
    const { deviceId } = await setupOfflineAuth(password, userId, refreshToken, userProfile)

    // Register device with server if online
    if (net.isOnline()) {
      try {
        const regResult = await registerDevice(API_BASE, accessToken, deviceId)

        // Store initial offline codes from registration
        if (regResult.codes?.length) {
          const db = getDb()
          const crypto = require('crypto') as typeof import('crypto')
          for (const c of regResult.codes) {
            const hash = crypto.createHash('sha256')
              .update(c.value.toUpperCase().replace(/\s/g, ''))
              .digest('hex')
            await db.run(
              'INSERT OR IGNORE INTO offline_codes (id, code_hash, key, sequence, batch_id) VALUES (?, ?, ?, ?, ?)',
              crypto.randomUUID(), hash, c.key, c.sequence, 'initial'
            )
          }
          console.log(`[auth] Stored ${regResult.codes.length} initial offline codes`)

          // Store a challenge key in DPAPI for next unlock screen
          const { prepareNextChallenge } = await import('./auth')
          await prepareNextChallenge()
        }
      } catch (err) {
        console.error('[auth] Device registration failed (will retry on sync):', err)
        setCredential('needs-code-sync', 'true')
      }
    } else {
      setCredential('needs-code-sync', 'true')
    }

    // Start sync loop after initial setup
    startSyncLoop(refreshToken, deviceId, userId)

    return { success: true, deviceId }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// Auth: offline unlock (password + challenge-response code)
ipcMain.handle('auth:unlock', async (_event, password: string, challengeKey: string, responseValue: string) => {
  const result = await unlockWithPasswordAndCode(password, challengeKey, responseValue)

  // Start sync loop and refresh access token on successful full auth
  if (result.success) {
    // Prefer DPAPI-stored rotated token, fall back to password-decrypted one
    const refreshToken = getLatestRefreshToken() || result.refreshToken
    if (refreshToken) {
      cachedRefreshToken = refreshToken
      await refreshAccessToken(refreshToken)
      if (!cachedAccessToken) {
        return { ...result, needsReauth: true }
      }
      const deviceId = getDeviceId()
      const userId = getUserId()
      if (deviceId && userId) {
        startSyncLoop(refreshToken, deviceId, userId)
      }
    }
  }

  return result
})

// Auth: password-only re-entry (idle timeout)
ipcMain.handle('auth:unlock-password-only', async (_event, password: string) => {
  const result = await unlockWithPasswordOnly(password)
  if (result.success) {
    const refreshToken = getLatestRefreshToken() || result.refreshToken
    if (refreshToken) {
      cachedRefreshToken = refreshToken
      await refreshAccessToken(refreshToken)
      if (!cachedAccessToken) {
        return { ...result, needsReauth: true }
      }
      const deviceId = getDeviceId()
      const userId = getUserId()
      if (deviceId && userId) {
        startSyncLoop(refreshToken, deviceId, userId)
      }
    }
  }
  return result
})

// Auth: check current auth state
ipcMain.handle('auth:status', async () => {
  return getAuthStatus()
})

// Auth: logout (pick next challenge key, then close DB so next access requires re-auth)
ipcMain.handle('auth:logout', async () => {
  try {
    // Before closing DB, pick and store a challenge key for next unlock
    const { prepareNextChallenge } = await import('./auth')
    await prepareNextChallenge()
  } catch { /* DB may already be closed */ }
  stopSyncLoop()
  await closeDb()
  return { success: true }
})

// Auth: get stored user profile (for session restoration after PIN unlock)
ipcMain.handle('auth:get-user-profile', () => {
  return getUserProfile()
})

// ─── Draft & Image IPC ─────────────────────────────────────────────────────
registerDraftHandlers()
registerImageHandlers()
registerConflictHandlers()

// ─── Sync Engine ───────────────────────────────────────────────────────────

function startSyncLoop(refreshToken: string, deviceId: string, userId: string): void {
  if (syncEngine) return // Already running

  cachedAuthToken = refreshToken
  const db = getDb()
  syncEngine = new SyncEngine(
    db,
    API_BASE,
    async () => refreshToken, // TODO: refresh token rotation when server supports it
    deviceId,
    userId,
  )

  // Run sync every 30 seconds when online
  syncInterval = setInterval(async () => {
    if (!net.isOnline() || !syncEngine) return

    // Retry offline code fetch if needed
    if (getCredential('needs-code-sync') === 'true') {
      try {
        const token = cachedAccessToken || loadPersistedAccessToken()
        if (token) {
          // Fetch offline code pairs from the API
          const apiUrl = 'http://10.100.0.1'
          const codesRes = await fetch(`${apiUrl}/api/offline-codes`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Tenant-ID': 'hta-calibration',
            },
          })
          if (codesRes.ok) {
            const codesData = await codesRes.json() as {
              hasBatch: boolean
              pairs?: Array<{ sequence: number; key: string; value: string; used: boolean }>
            }
            if (codesData.hasBatch && codesData.pairs?.length) {
              const crypto = require('crypto') as typeof import('crypto')
              for (const c of codesData.pairs) {
                if (c.used) continue
                const hash = crypto.createHash('sha256')
                  .update(c.value.toUpperCase().replace(/\s/g, ''))
                  .digest('hex')
                await db.run(
                  'INSERT OR IGNORE INTO offline_codes (id, code_hash, key, sequence, batch_id) VALUES (?, ?, ?, ?, ?)',
                  crypto.randomUUID(), hash, c.key, c.sequence, 'sync'
                )
              }
              const { prepareNextChallenge } = await import('./auth')
              await prepareNextChallenge()
              setCredential('needs-code-sync', 'false')
              console.log(`[sync] Stored ${codesData.pairs.filter(c => !c.used).length} offline codes`)
            }
          }
        }
      } catch (err) {
        console.warn('[sync] Code sync retry failed:', err)
      }
    }

    try {
      const result = await syncEngine.run()
      mainWindow?.webContents.send('sync:progress', {
        drafts: result.drafts,
        images: result.images,
        auditLogs: result.auditLogs,
      })
    } catch (err) {
      console.error('[sync] Sync cycle failed:', err)
    }
  }, 30_000)

  // Initial reference data cache (best-effort)
  preCacheReferenceData(db, API_BASE, refreshToken, userId, deviceId).catch((err) => {
    console.error('[ref-cache] Initial cache failed:', err)
  })

  // Refresh reference data every 4 hours
  refCacheInterval = setInterval(() => {
    if (!net.isOnline()) return
    preCacheReferenceData(db, API_BASE, refreshToken, userId, deviceId).catch((err) => {
      console.error('[ref-cache] Periodic refresh failed:', err)
    })
  }, 4 * 60 * 60 * 1000)

  console.log('[sync] Sync loop started (30s interval)')
}

function stopSyncLoop(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  if (refCacheInterval) {
    clearInterval(refCacheInterval)
    refCacheInterval = null
  }
  syncEngine = null
  cachedAuthToken = null
}

// Sync IPC handlers
ipcMain.handle('sync:status', async () => {
  try {
    const db = getDb()
    const pendingDrafts = await db.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM sync_queue WHERE status IN ('PENDING', 'FAILED') AND retries < max_retries`
    )
    const unsyncedImages = await db.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM draft_images WHERE synced = 0`
    )
    return {
      online: net.isOnline(),
      syncRunning: syncEngine !== null,
      pendingDrafts: pendingDrafts?.cnt ?? 0,
      unsyncedImages: unsyncedImages?.cnt ?? 0,
    }
  } catch {
    return { online: net.isOnline(), syncRunning: false, pendingDrafts: 0, unsyncedImages: 0 }
  }
})

ipcMain.handle('sync:trigger', async () => {
  if (!syncEngine || !net.isOnline()) {
    return { success: false, error: 'Sync not available' }
  }
  try {
    const result = await syncEngine.run()
    mainWindow?.webContents.send('sync:progress', {
      drafts: result.drafts,
      images: result.images,
      auditLogs: result.auditLogs,
    })

    // Also refresh reference data on manual sync
    const deviceId = getDeviceId()
    const userId = getUserId()
    if (deviceId && userId && cachedAuthToken) {
      const db = getDb()
      preCacheReferenceData(db, API_BASE, cachedAuthToken, userId, deviceId).catch(() => {})
    }

    return { success: true, result }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ─── Reference Data ────────────────────────────────────────────────────────

ipcMain.handle('ref:master-instruments', async () => {
  try {
    const db = getDb()
    return await getCachedMasterInstruments(db)
  } catch {
    return []
  }
})

ipcMain.handle('ref:customers', async () => {
  try {
    const db = getDb()
    return await getCachedCustomers(db)
  } catch {
    return []
  }
})

// ─── VPN ───────────────────────────────────────────────────────────────────

ipcMain.handle('vpn:provision', async (_event, token: string) => {
  return vpnProvision(token, PROVISION_URL)
})

ipcMain.handle('vpn:status', async () => {
  return vpnStatus()
})

// ─── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // TLS certificate pinning (production only)
  if (!IS_DEV) {
    setupTlsPinning(session.defaultSession)
  }

  // Check for inactivity wipe (30 days without opening)
  if (dbExists() && checkInactivityWipe(30)) {
    console.log('[security] Inactivity threshold exceeded — wiping local data')
    await wipeAllLocalData('Inactivity threshold exceeded (30 days)')
    clearCredentials()
  }

  await startNextServer()
  createWindow()
  pollConnectivity()

  // After window is created, check VPN status and redirect to provisioning if needed
  mainWindow?.webContents.once('did-finish-load', async () => {
    try {
      const vpnState = await vpnStatus()
      if (!vpnState.configured) {
        mainWindow?.loadURL(`${APP_URL}/desktop/vpn-setup`)
      }
    } catch {
      // Non-fatal — proceed without VPN check
    }
  })

  // Auto-updates (production only — skipped in dev and unpacked builds)
  const updateConfigPath = path.join(process.resourcesPath || '', 'app-update.yml')
  if (!IS_DEV && require('fs').existsSync(updateConfigPath)) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[updater] Update check failed:', err)
    })
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {})
    }, 6 * 60 * 60 * 1000)
  }
})

app.on('window-all-closed', async () => {
  stopSyncLoop()
  await closeDb()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
