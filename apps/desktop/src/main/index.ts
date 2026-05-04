import { app, BrowserWindow, session, net, ipcMain, Menu } from 'electron'
import path from 'path'
import { setupTlsPinning, checkInactivityWipe, wipeAllLocalData } from './security'
import { setupOfflineAuth, unlockWithPasswordAndCode, unlockWithPasswordOnly, getAuthStatus, getDeviceId, getUserId, getUserProfile, clearCredentials } from './auth'
import { closeDb, dbExists, getDb } from './sqlite-db'
import { registerDevice, checkDeviceStatus, sendHeartbeat } from './device'
import { registerDraftHandlers, registerImageHandlers, registerConflictHandlers } from './ipc-handlers'
import { SyncEngine } from './sync-engine'
import { preCacheReferenceData, getCachedMasterInstruments, getCachedCustomers } from './ref-cache'
import { autoUpdater } from 'electron-updater'

// In packaged builds, app.isPackaged is true and resourcesPath points to bundled Next.js.
// During dev, app.isPackaged is false — we load from the external Next.js dev server.
const IS_DEV = !app.isPackaged
const APP_URL = 'http://localhost:3000'
const API_BASE = process.env.HTA_API_URL || 'http://localhost:4000'

// Hide default menu bar (File, Edit, View, Window, Help)
Menu.setApplicationMenu(null)

let mainWindow: BrowserWindow | null = null
let syncEngine: SyncEngine | null = null
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

  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

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

  process.env.PORT = '3000'
  process.env.HOSTNAME = 'localhost'
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || require('crypto').randomBytes(32).toString('base64')
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
  process.env.HTA_DESKTOP = '1'
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

// Auth: first-time setup (called after online login — password used as encryption key)
ipcMain.handle('auth:setup', async (_event, password: string, userId: string, refreshToken: string, accessToken: string, userProfile?: Record<string, unknown>) => {
  try {
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
      }
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

  // Start sync loop on successful full auth
  if (result.success && result.refreshToken) {
    const deviceId = getDeviceId()
    const userId = getUserId()
    if (deviceId && userId) {
      startSyncLoop(result.refreshToken, deviceId, userId)
    }
  }

  return result
})

// Auth: password-only re-entry (idle timeout)
ipcMain.handle('auth:unlock-password-only', async (_event, password: string) => {
  return unlockWithPasswordOnly(password)
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

  // Auto-updates (production only — skipped in dev)
  if (!IS_DEV) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[updater] Update check failed:', err)
    })
    // Re-check every 6 hours
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
