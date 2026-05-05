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

## Issue 2: Refresh token invalidation

**Problem:** Refresh tokens get rotated (old one invalidated) on each use. During development/testing, multiple provision cycles burn through tokens. On app restart, the stored refresh token is often already invalid → `refreshAccessToken()` returns 401 → `cachedAccessToken` stays null → all API calls fail with 401.

**Fix:** 
1. During first login (`handleLogin` → `auth:setup`), the fresh access token is stored. This works.
2. On app restart, the unlock flow decrypts the stored refresh token and calls `refreshAccessToken()`. If the token is expired/rotated, this fails silently.
3. When refresh fails, fall back to re-authentication: prompt the user to log in again (online) rather than showing an empty dashboard.
4. Consider storing the access token in safeStorage (persists across restarts) alongside the refresh token. Only refresh when the access token expires.

**Files:** 
- `apps/desktop/src/main/index.ts` — `refreshAccessToken()`, `auth:get-access-token` handler
- `apps/desktop/src/main/auth.ts` — `unlockWithPasswordAndCode()`, `unlockWithPasswordOnly()`

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

- [ ] First login: provision → login → dashboard shows data
- [ ] Close and reopen: unlock → dashboard shows data
- [ ] Minimize and restore: dashboard still has data
- [ ] Port 3000 occupied: app still starts on fallback port
- [ ] Offline: unlock with password + code → cached data available
- [ ] Back online: sync pushes local changes
