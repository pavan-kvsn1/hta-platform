# Desktop App — Remaining Fixes

**Status:** VPN provisioning, login, and session all work individually. But the app is unstable as a whole — port conflicts, token lifecycle issues, bundled server reliability.

**What works:**
- VPN provisioning (gateway → nginx → API → peer sync) ✓
- WireGuard tunnel installed as Windows service ✓
- Desktop login → session cookie set correctly (`__Secure-` prefix) ✓
- TokenRefreshProvider disabled in Electron ✓
- IPC token bridge (`api-client.ts` → `getAccessToken` IPC → main process) ✓ (code in bundle verified)
- Web app rewrites active in desktop build (`HTA_DESKTOP=1`) ✓
- 2 server-component pages converted to client components ✓

**What's broken:**

---

## Issue 1: Port 3000 conflicts

**Problem:** The bundled Next.js server binds to port 3000. If anything else is on 3000 (dev server, previous instance, zombie process), the app fails with "Cannot reach API server."

**Fix:** In `apps/desktop/src/main/index.ts`, make the bundled server use a dynamic port:
- Try port 3000, if EADDRINUSE try 3001, 3002, etc.
- Update `APP_URL` to reflect the actual port
- Or use port 0 (OS assigns a free port) and read back the assigned port

**Files:** `apps/desktop/src/main/index.ts` (server startup section)

---

## Issue 2: Access token expires after 4 hours

**Problem:** Access token has a 4-hour lifetime. `TokenRefreshProvider` is disabled in Electron (it uses Prisma-dependent routes). After 4 hours, all API calls return 401 and the dashboard goes empty.

**Approach:** 401-retry in `apiFetch` (Electron only). Does NOT touch the web app's `TokenRefreshProvider` or any web auth routes.

**Flow:**
```
apiFetch → API returns 401
  → is Electron? → call window.electronAPI.refreshAccessToken()
    → main process calls Fastify POST /api/auth/refresh via VPN gateway
    → new token cached + persisted to safeStorage
  → retry original request with new token
  → if still 401 → redirect to /desktop/login (re-auth)
```

**Risk mitigations:**
- Retry exactly ONCE to prevent infinite loop
- Single refresh lock to prevent race conditions (multiple 401s triggering concurrent refreshes)
- VPN timeout caught gracefully (don't crash, show offline state)
- Refresh token expired (>7 days) → redirect to login

**Status:** DONE

**Files changed:**
- `apps/web-hta/src/lib/api-client.ts` — 401 retry logic in `apiFetch` for Electron
- `apps/desktop/src/main/index.ts` — `auth:refresh-access-token` IPC handler
- `apps/desktop/src/preload/index.ts` — expose `refreshAccessToken` IPC

---

## Issue 3: Stale VPN peer from test cycles

**Problem:** Each provisioning test creates a VPN peer. The API returns 409 "already provisioned" on subsequent attempts. Clearing app data resets the provisioning flag but the peer still exists in the database.

**Fix:**
1. Add a "Re-provision" button in the desktop app settings (calls DELETE then re-provisions)
2. Or add admin UI to revoke/delete VPN peers (partially exists in admin user edit page)
3. For testing: script to clean up test peers

**Files:**
- `apps/api/src/routes/admin/index.ts` — `DELETE /users/:id/vpn` (already exists)
- Desktop app — needs a settings/reset flow

---

## Issue 4: `issue-refresh-token` Prisma errors in console

**Problem:** The desktop login flow calls `POST /api/auth/issue-refresh-token` which uses Prisma → fails → spams console. Non-fatal but noisy and confusing.

**Status:** Fix 3 (skip in Electron mode in `api-client.ts`) is done. Fix 6 (skip in desktop login page) — the call doesn't exist in the desktop login page (it's in the web login page). Console noise remains from the `api-client.ts` fallback path on first load before Electron IPC is available.

**Fix:** In `api-client.ts`, the Electron IPC check already returns early. Any remaining calls come from server-side rendering where `window` is undefined. These should be suppressed by not calling `getAccessToken()` server-side.

**Files:** `apps/web-hta/src/lib/api-client.ts`

---

## Issue 5: Build process complexity

**Problem:** The desktop build requires 4 steps in exact order. Missing any step (especially web rebuild + prepackage) results in stale bundles. Easy to forget during development.

**Fix:** Add a single build script to `apps/desktop/package.json`:
```json
"build:full": "cd ../web-hta && cp .env.desktop .env.local && rm -rf .next && npm run build && cp .env.local.bak .env.local && cd ../desktop && npm run prepackage && npm run build"
```

**Files:** `apps/desktop/package.json`

---

## Issue 6: app-update.yml warning

**Status:** Fixed — auto-updater check wrapped with `existsSync`. Only runs when the config file exists (NSIS installer builds).

---

## Issue 7: Stale cookies

**Status:** Fixed — `desktop-login` and `desktop-session` routes delete old `authjs.session-token` cookie after setting `__Secure-authjs.session-token`.

---

## Architecture Notes

- The desktop app bundles a Next.js standalone server for UI rendering
- ALL data comes from the Fastify API via: `apiFetch` → Next.js rewrite → VPN gateway nginx (10.100.0.1) → NodePort (30080) → API pod
- The bundled server has `DATABASE_URL=postgresql://localhost:5432/placeholder` — any Prisma call fails
- Engineer pages are client components using `apiFetch` — they work when the token is available
- Admin pages use server-side Prisma — they don't work in desktop (not needed for engineers)
- Offline mode uses SQLCipher via Electron IPC — independent of the web server
- The access token flows: login → `auth:setup` IPC stores it → `api-client.ts` gets it via `auth:get-access-token` IPC → adds `Authorization: Bearer` header

## Infrastructure

- WireGuard gateway: `35.200.149.46` (e2-micro, `production-wireguard-gateway`)
- nginx on gateway:
  - Public (0.0.0.0:80): only `/api/vpn/provision`
  - VPN (10.100.0.1:80): `/api/*` → API NodePort (30080), `/*` → Web NodePort (30081)
- Firewall: UDP 51820, TCP 80, TCP 22 (IAP), TCP 30080+30081 (gateway → GKE)
- GKE services: `hta-api-vpn` (NodePort 30080), `hta-web-vpn` (NodePort 30081)
- Peer sync: cron every 30s → `gs://hta-platform-prod-wireguard/peers.conf` → `wg syncconf`

## Issue 8: Offline codes not stored during first login

**Problem:** `registerDevice()` during first login calls the API at `http://10.100.0.1` (VPN gateway) to get offline code hashes. If the VPN is broken or not yet connected when first login happens, `registerDevice` fails silently → no codes stored in SQLCipher → offline unlock falls back to password-only (no 2FA challenge) → reduced security.

**Impact:** The challenge-response screen never appears offline. User only gets password-only unlock.

**Fix (does not touch VPN):**
1. In `apps/desktop/src/main/index.ts` `auth:setup` handler: if `registerDevice` fails, store a flag `needs-code-sync: true` in credentials
2. On every subsequent online launch (VPN connected), check the flag and retry `registerDevice` to fetch codes
3. Also retry code fetch during the sync loop (`startSyncLoop`) — if codes are empty, fetch them as part of sync
4. The offline codes endpoint `GET /api/devices/codes` already returns the code pairs. The desktop just needs to call it and store the hashes.

**Files:**
- `apps/desktop/src/main/index.ts` — retry logic in `auth:setup` and `startSyncLoop`
- `apps/desktop/src/main/sync.ts` — add code sync to the periodic sync

---

## Issue 9: VPN-down not detected as offline

**Problem:** `isElectronOffline()` in `api-client.ts` calls `window.electronAPI.isOffline()` which uses Electron's `net.isOnline()`. This checks internet connectivity, NOT VPN status. When VPN is down but internet is up, the app thinks it's online → tries API calls through VPN → times out → dashboard stuck.

**Impact:** Dashboard hangs instead of showing cached data when VPN is down.

**Fix (does not touch VPN):**
1. In `apps/desktop/src/main/index.ts`: add an `app:is-api-reachable` IPC handler that pings `http://10.100.0.1/api/health` with a 3-second timeout
2. In `api-client.ts`: `isElectronOffline()` checks BOTH `net.isOnline()` AND the API reachability check
3. Cache the reachability result for 30 seconds to avoid pinging on every API call
4. When unreachable: the existing offline intercept routes requests to `window.electronAPI.handleOfflineRequest()` → SQLCipher

**Files:**
- `apps/desktop/src/main/index.ts` — `app:is-api-reachable` IPC handler
- `apps/desktop/src/preload/index.ts` — expose new IPC
- `apps/web-hta/src/lib/api-client.ts` — update `isElectronOffline()` to check API reachability

---

## Issue 10: Dashboard has no offline fallback UI

**Problem:** When API calls fail (offline or VPN down), the engineer dashboard shows empty/blank with no indication of what's wrong. The `EngineerDashboardClient` doesn't handle fetch failures gracefully.

**Impact:** User sees an empty screen and doesn't know if the app is broken or just offline.

**Fix (does not touch VPN):**
1. In `EngineerDashboardClient`: catch `apiFetch` errors and show an offline banner: "You're offline. Showing cached data." or "Cannot reach server. Check your VPN connection."
2. When offline: show locally cached certificate drafts from SQLCipher instead of an empty dashboard
3. Add a "Retry" button that re-fetches when the user reconnects

**Files:**
- `apps/web-hta/src/app/(dashboard)/dashboard/EngineerDashboardClient.tsx` — error handling + offline UI

---

## Issue 11: Unlock succeeds with dead refresh token

**Problem:** `unlockWithPasswordOnly()` validates the password locally (decrypts AES-256-GCM). It returns `{ success: true, refreshToken }` even when the refresh token is expired/rotated. The app navigates to the dashboard, which fails with 401 on every API call.

**Root cause:** The unlock function only checks the password — not whether the decrypted refresh token is still valid with the API.

**Fix:** After unlock, the IPC handler calls `refreshAccessToken()`. If it returns 401, return `{ success: true, needsReauth: true }` to the renderer. The desktop login page checks this flag and shows the email+password form instead of navigating to the dashboard.

**Status:** DONE

**Files:**
- `apps/desktop/src/main/index.ts` — `auth:unlock` and `auth:unlock-password-only` handlers check refresh result
- `apps/web-hta/src/app/desktop/login/page.tsx` — handles `needsReauth` from unlock result

---

## Issue 12: Refresh token not persisted back to SQLCipher after rotation

**Problem:** The API rotates refresh tokens on each use (old invalidated, new issued). But the new token is only stored in `cachedRefreshToken` (memory). When the app closes, the new token is lost. On next launch, the SQLCipher DB still has the old (dead) token.

**Root cause:** `refreshAccessToken()` updates `cachedRefreshToken` and `cachedAccessToken` in memory but never writes the new refresh token back to the encrypted store in SQLCipher.

**Fix:** When `refreshAccessToken()` gets a new refresh token from the API, re-encrypt it with the user's key and store it back in SQLCipher via the auth module.

**Status:** DONE

**Files:**
- `apps/desktop/src/main/index.ts` — `refreshAccessToken()` stores new refresh token via `updateStoredRefreshToken()`
- `apps/desktop/src/main/auth.ts` — new `updateStoredRefreshToken()` function that re-encrypts and stores

---

## Issue 13: SQLCipher native module fails in packaged app

**Problem:** `openDb()` fails with `SQLITE_NOTADB: file is not a database` even when the DB file doesn't exist (should create a fresh one). The `@journeyapps/sqlcipher` native binding isn't working correctly in the packaged Electron app.

**Impact:** Non-blocking. Auth, API calls, and dashboard all work. Only offline draft caching is broken (local SQLCipher reads/writes fail).

**Symptoms:**
- `[auth] unlockWithPasswordOnly post-unlock DB error: SQLITE_NOTADB`
- `Error occurred in handler for 'draft:list': SQLITE_NOTADB`
- DB file at `%APPDATA%\HTA Calibr8s\hta-offline.db` doesn't exist (can't even create one)

**Likely causes:**
1. Native `.node` binding not properly extracted from ASAR — `electron-builder.yml` has `asarUnpack` for `node_modules/@journeyapps/sqlcipher/lib/binding/**/*.node` but the actual path in the packaged app might differ
2. `electron-rebuild` compiled the binding for a different Electron ABI version
3. The PRAGMA key format passed to SQLCipher is invalid in this context

**Investigation steps:**
1. Check if the `.node` file exists in the unpacked location: `release\win-unpacked\resources\app.asar.unpacked\node_modules\@journeyapps\sqlcipher\lib\binding\`
2. Verify the Electron version matches the compiled native binding: `npx electron --version` vs what electron-rebuild targeted
3. Test `openDb` in isolation: add a debug IPC handler that just tries to create a fresh DB at a temp path
4. Check if the issue is the key format: try opening without encryption first to isolate SQLCipher vs key issue

**Status:** Open — non-blocking, deferred to next session

**Files:**
- `apps/desktop/src/main/sqlite-db.ts` — `openDb()` function
- `apps/desktop/electron-builder.yml` — `asarUnpack` config
- `apps/desktop/package.json` — `build.asarUnpack` config (duplicate, may conflict)

---

## Issue 14: Offline dashboard shows error instead of cached certificates

**Problem:** When offline/VPN down, the dashboard shows "Failed to load data from server" (red error banner) instead of "Offline Mode" (amber banner) with locally cached certificates.

**Root causes:**
1. **Wrong offline detection:** The API returns a response (502 from nginx gateway) rather than throwing a network error. The `EngineerDashboardClient` catch block only handles thrown errors (network failures). A 502 response goes through the `else` branch → "Failed to load" error, not "Offline Mode."
2. **No certificate data from SQLCipher:** Even when offline IS detected, the dashboard only shows draft counts from `electronAPI.listDrafts()`. The actual certificate table (`CertificateTable` component) fetches from the API — it has no SQLCipher fallback.
3. **Sync engine caches data but dashboard doesn't read it:** The sync engine stores certificates, instruments, and other data in SQLCipher. But the dashboard components don't have a path to read from SQLCipher when the API is unavailable.

**What should happen offline:**
- Amber "Offline Mode" banner: "Cannot reach the server. Showing locally cached data. Your drafts are safe and will sync when reconnected."
- Certificate table populated from SQLCipher (synced certificates + local drafts)
- Stat cards show counts from local data
- Create/edit drafts works (already supported via Electron IPC)
- "Retry" button to re-check connectivity

**Fix plan:**

### Step 1: Fix offline detection
In `EngineerDashboardClient.tsx`, treat 502 and 504 responses as offline (not just thrown errors):
```typescript
if (response.ok) { ... }
else if (response.status === 401) { setFetchError('Session expired') }
else if (response.status === 502 || response.status === 504) { setIsOffline(true) }
else { setFetchError('Failed to load') }
```

### Step 2: Add IPC handler for cached certificates
In `apps/desktop/src/main/index.ts`, add `certificates:list-cached` IPC handler that reads from SQLCipher:
```typescript
ipcMain.handle('certificates:list-cached', async () => {
  const db = getDb()
  return db.all('SELECT * FROM drafts ORDER BY updated_at DESC')
})
```
Expose in preload. Add to `electron.d.ts`.

### Step 3: Dashboard reads from SQLCipher when offline
In `EngineerDashboardClient.tsx`, when offline:
1. Call `window.electronAPI.listCachedCertificates()` 
2. Build stats from the local data
3. Pass to `CertificateTable` (may need adapter for local data shape)

### Step 4: CertificateTable accepts local data
The `CertificateTable` component currently fetches its own data from the API. Add a `localData` prop that bypasses the API fetch and renders from the provided data.

**Files:**
- `apps/web-hta/src/app/(dashboard)/dashboard/EngineerDashboardClient.tsx` — offline detection + local data rendering
- `apps/web-hta/src/components/dashboard/CertificateTable.tsx` — accept local data prop
- `apps/desktop/src/main/index.ts` — `certificates:list-cached` IPC handler
- `apps/desktop/src/preload/index.ts` — expose new IPC
- `apps/web-hta/src/types/electron.d.ts` — type declaration

**Status:** Open

---

## Issue 15: Sync interval too aggressive + no sync status indicator

**Problem:** The sync loop runs every 30 seconds, fetching certificates, offline codes, reference data, and running the draft sync engine. This is excessive for the data volume and wastes bandwidth/battery. Also, the user has no visibility into whether the app is online/offline or when data was last synced.

**Fix plan:**

### Part A: Adjust sync intervals
| What | Current | Proposed |
|---|---|---|
| Draft sync (push local changes) | 30s | 2 min |
| Certificate cache (pull from server) | 30s | 10 min |
| Offline code sync retry | 30s | 10 min (stop after success) |
| Reference data (instruments, customers) | 4 hours | 4 hours (keep) |

- Draft sync stays more frequent (2 min) because local changes need to reach the server relatively quickly
- Certificate cache and offline codes are less urgent — 10 min is fine
- All syncs skip when `net.isOnline()` is false

### Part B: Sync status indicator in UI
Add a status bar/badge in the dashboard sidebar or header showing:
- **Online:** green dot + "Synced 2 minutes ago"
- **Offline:** amber dot + "Offline — last synced May 4, 2026 at 3:42 PM"
- **Syncing:** spinning icon + "Syncing..."
- **Error:** red dot + "Sync failed — retry in 2 min"

**Implementation:**
1. In `apps/desktop/src/main/index.ts`: track `lastSyncedAt` timestamp, broadcast via IPC `sync:status` event
2. Store `lastSyncedAt` in SQLCipher `session_meta` table (persists across restarts)
3. In the web app: add `SyncStatusBadge` component that listens for `sync:status` events via `window.electronAPI.onSyncStatus(callback)`
4. Add to `DashboardSidebar` or dashboard header (only renders when `window.electronAPI` exists)

**Files:**
- `apps/desktop/src/main/index.ts` — adjust intervals, track + broadcast sync status
- `apps/desktop/src/preload/index.ts` — expose `onSyncStatus` listener
- `apps/web-hta/src/components/layout/DashboardSidebar.tsx` — render `SyncStatusBadge`
- `apps/web-hta/src/components/SyncStatusBadge.tsx` — new component

**Status:** Open

---

## Build Sequence

```powershell
# Full desktop build (all 4 steps)
cd apps/web-hta
Copy-Item .env.desktop .env.local -Force
cmd /c "rmdir /s /q .next"
npm run build
Copy-Item .env.local.bak .env.local -Force
cd ../desktop
npm run prepackage
npm run build
cmd /c "rmdir /s /q release/win-unpacked"
npm run package:dir
```

## Test Checklist

**Online (VPN connected):**
- [ ] First login: provision → login → dashboard shows data
- [ ] Close and reopen: unlock → dashboard shows data
- [ ] Minimize and restore after 4+ hours: 401 retry refreshes token → data loads
- [ ] Port 3000 occupied: app still starts on fallback port

**Offline codes:**
- [ ] First login stores offline code hashes in SQLCipher
- [ ] If first login fails to get codes, retry on next online launch (Issue 8)
- [ ] Offline unlock shows challenge key (e.g., "B4") from printed card
- [ ] Correct code + password → unlocks → shows cached data

**Offline / VPN down:**
- [ ] VPN down detected as offline (Issue 9) → offline intercept fires
- [ ] Dashboard shows offline banner + cached drafts (Issue 10)
- [ ] Back online: sync pushes local changes
- [ ] Retry button re-fetches dashboard data

**Security:**
- [ ] 5 failed unlock attempts → device wipe
- [ ] Offline code consumed on each full unlock (not password-only)
- [ ] Challenge key rotated after each unlock
