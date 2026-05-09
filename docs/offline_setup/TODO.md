# Offline Desktop App — TODO Tracker

Status of every deliverable across prerequisites, Electron phases, and production readiness.

Last updated: 2026-04-30

---

## Prerequisites (Server + Web Changes)

All 11 prerequisites from [PREREQUISITES.md](./PREREQUISITES.md) are **complete**.

| # | Item | Status |
|---|------|--------|
| 1 | Prisma schema — DeviceRegistration, DeviceAuditLog, OfflineCodeBatch, OfflineCode models | Done |
| 2 | Refresh token service — WEB (7d) vs DESKTOP (30d) expiry with device binding | Done |
| 3 | Auth middleware — optional `deviceId` in JWT payload | Done |
| 4 | Device API routes — register, list, status, heartbeat, revoke, wipe, confirm-wipe, audit-logs | Done |
| 5 | Offline codes API — GET batch status, POST validate | Done |
| 6 | Cron job — 30-day code refresh + cleanup of expired batches | Done |
| 7 | Engineer offline codes page — `/dashboard/offline-codes` with batch status + print | Done |
| 8 | Sidebar navigation — "Offline Codes" with KeyRound icon (ENGINEER/ADMIN) | Done |
| 9 | api-client.ts offline hook — `electronAPI` detection, offline draft route interception | Done |
| 10 | OfflineIndicator component — connectivity pill in layout | Done |
| 11 | turbo.json — `desktop:build` task depending on `web-hta#build` | Done |

---

## Admin-Controlled Offline Code Card Generation

Request-approval flow for offline code cards (replaces engineer self-generation).

| Item | Status |
|------|--------|
| Add `OFFLINE_CODE_REQUEST` to `InternalRequestType` enum in Prisma schema | Done |
| Accept `OFFLINE_CODE_REQUEST` in `POST /api/internal-requests` | Done |
| Handle approve/reject in `POST /api/admin/internal-requests/:id/review` | Done |
| Remove `POST /generate` from offline codes route (engineers can no longer self-generate) | Done |
| Return latest request status in `GET /api/offline-codes` | Done |
| OfflineCodesClient — "Request New Card" button + status banners | Done |
| Admin requests page — `OFFLINE_CODE_REQUEST` type config, summary card, filter | Done |
| Admin request detail — `OfflineCodeRequestClient` component for review | Done |
| Notification routing — `OFFLINE_CODE_APPROVED`, `OFFLINE_CODE_REJECTED`, `OFFLINE_CODE_REQUESTED` | Done |

---

## Phase 1 — Electron Shell

| File | Status |
|------|--------|
| `apps/desktop/package.json` — project config, scripts, dependencies, electron-builder config | Done |
| `apps/desktop/tsconfig.json` — CommonJS target, outDir: dist | Done |
| `scripts/copy-standalone.js` — dereference pnpm symlinks, hoist packages for packaging | Done |
| `scripts/after-pack.js` — copy Next.js standalone into packaged app resources | Done |
| `src/main/index.ts` — BrowserWindow, contextIsolation, sandbox, navigation guards, menu hidden | Done |
| `src/main/security.ts` — TLS pinning, secure wipe, retention policy, inactivity check | Done |
| `src/preload/index.ts` — IPC channel allowlisting, `window.electronAPI` bridge | Done |

---

## Phase 2 — Encrypted Local Database + Offline Auth

| File | Status |
|------|--------|
| `src/migrations/001-init.sql` — full schema (drafts, parameters, results, images, sync queue, audit log, offline codes, session/device meta) | Done |
| `src/migrations/002-codes-add-key.sql` — add `key` column to offline_codes for challenge-response lookup | Done |
| `src/main/sqlite-db.ts` — WrappedDb promise wrappers, openDb with SQLCipher PRAGMA key, WAL mode, migrations | Done |
| `src/main/audit.ts` — append-only audit log (INSERT, getUnsynced, markSynced) | Done |
| `src/main/auth.ts` — DPAPI credential store, PBKDF2 key derivation (600K iterations), AES-256-GCM token encryption, password unlock, challenge-response 2FA | Done |
| `src/main/device.ts` — registerDevice, checkDeviceStatus, sendHeartbeat | Done |
| IPC wiring in index.ts — auth:setup, auth:unlock, auth:unlock-password-only, auth:status, auth:logout | Done |

---

## Phase 3 — Offline Draft Flow

| File | Status |
|------|--------|
| `src/main/file-store.ts` — DPAPI-encrypted image storage, secure delete | Done |
| `src/main/ipc-handlers.ts` — draft:create, draft:save, draft:get, draft:list, draft:delete, image:save, image:get-path, image:list | Done |
| IPC wiring in index.ts — registerDraftHandlers(), registerImageHandlers() | Done |

---

## Phase 4 — Sync Engine

| File | Status |
|------|--------|
| `src/main/sync-engine.ts` — SyncEngine class (syncDrafts, syncImages, syncAuditLogs, replenishCodesIfNeeded) | Done |
| IPC wiring in index.ts — sync:status, sync:trigger, startSyncLoop (30s), stopSyncLoop | Done |

---

## Phase 5 — Reference Data Pre-Cache

| File | Status |
|------|--------|
| `src/main/ref-cache.ts` — preCacheReferenceData, getCachedMasterInstruments, getCachedCustomers | Done |
| IPC wiring in index.ts — ref:master-instruments, ref:customers, 4-hour refresh interval | Done |

---

## Build, Signing & Distribution

| Item | Status | Notes |
|------|--------|-------|
| `output: 'standalone'` in web-hta next.config.ts | Done | Already configured |
| Next.js standalone build (`next build`) | Done | Produces `.next/standalone/` |
| Placeholder icon (`resources/icon.ico`, 256x256) | Done | Replace with branded icon before release |
| Auto-updater in index.ts (`electron-updater`, 6-hour check interval) | Done | |
| NSIS installer build (`electron-builder --win`) | Done | `release/HTA Calibr8s Setup 0.1.0.exe` (149 MB) |
| `latest.yml` auto-update manifest | Done | Generated with sha512 hash |
| Windows Developer Mode enabled | Done | Required for symlinks in standalone build |

---

## Production Readiness — TODO

Items that must be completed before shipping to engineers.

### Must Have (P0)

| Item | Status | Notes |
|------|--------|-------|
| EV Code Signing Certificate | Deferred | DigiCert/Sectigo/GlobalSign (~$300-500/yr). Eliminates SmartScreen "Unknown Publisher" warning. Required for SOC 2 CC8.1. Not needed for internal rollout |
| Custom signing script (`sign.js`) for electron-builder | Deferred | Needed for EV cert integration with `signingHashAlgorithms: ['sha256']`. Blocked on EV cert |
| GCS bucket `hta-platform-prod-desktop-releases` | Done | Already defined in `terraform/environments/production/main.tf`. Public read, versioned, keep last 5. `electron-builder.yml` already points to it |
| Production API URL | Done | Already env-var driven: `process.env.HTA_API_URL \|\| 'http://localhost:4000'` in `index.ts:16`. Set via CI/CD secret at build time |
| TLS certificate pinning fingerprints | Blocked | API has no public endpoint yet. Unblocked after WireGuard gateway is provisioned — pin the gateway VM's cert instead |
| Branded app icon | Done | Converted `packages/assets/logos/hta-logo.jpg` → `resources/icon.ico` (multi-resolution: 16–256px) |
| WireGuard VPN gateway — full scope | Pending | See `docs/todos/wireguard-vpn-integration.md`. Engineers reach private API via WireGuard tunnel. Replaces need for public API endpoint |
| End-to-end testing — offline draft flow | Pending | Create draft offline, attach images, reconnect, verify sync to server |
| End-to-end testing — auth flow | Pending | Password setup, password + challenge code unlock, password-only re-entry, lockout wipe after 5 attempts |

### Should Have (P1)

| Item | Status | Notes |
|------|--------|-------|
| Admin device management dashboard | Done | `/admin/devices` — device table with search, status filter, summary cards, revoke/wipe with confirmation |
| Device status API — `POST /api/devices/:id/revoke` | Done | In device API routes |
| Device status API — `POST /api/devices/:id/wipe` | Done | In device API routes |
| Admin wipe confirmation UI | Done | Confirmation dialog with warning text for both revoke and wipe actions |
| Sync conflict resolution strategy | Done | Server returns 409 with serverVersion on conflict; sync engine stores conflict data in SQLite; per-field ConflictResolver UI with L/S toggles for every value across all sections |
| CI/CD pipeline for desktop builds | Pending | Elevated from P2 — WireGuard MSI bundling makes manual builds unreliable. See expanded scope below |
| Error reporting/telemetry | Pending | Collect crash reports and sync failures for debugging |

#### CI/CD Pipeline — Expanded Scope (elevated from P2)

Previously: "build + sign + upload on tag push."  
Now additionally required by WireGuard integration:

| Step | Details |
|------|---------|
| **Trigger** | Git tag push matching `desktop-v*` (e.g. `desktop-v0.2.0`) |
| **Runner** | `windows-latest` — NSIS packaging requires Windows |
| **Build web-hta** | `pnpm --filter @hta/web-hta build` → produces `.next/standalone/` |
| **Download WireGuard MSI** | Fetch pinned version from `https://download.wireguard.com/windows-client/` → `apps/desktop/resources/wireguard-amd64.msi` |
| **Compile desktop TS** | `pnpm --filter @hta/desktop build` → `dist/` |
| **Package with electron-builder** | `electron-builder --win` — bundles WireGuard MSI + Next.js standalone into NSIS installer |
| **Upload release artifacts** | Upload `*.exe`, `*.blockmap`, `latest.yml` to `gs://hta-platform-prod-desktop-releases/` |
| **GCP auth** | Use existing `github_actions` service account from terraform. Needs `storage.objects.create` on desktop-releases bucket AND `storage.objects.create` on wireguard bucket |
| **Secrets required** | `GCP_SA_KEY`, `HTA_API_URL` (injected as env var at build time) |
| **Code signing** | Deferred — add `WINDOWS_CERTIFICATE` + `WINDOWS_CERTIFICATE_PASSWORD` secrets when EV cert procured |

**New files needed:**
- `.github/workflows/desktop-release.yml` — the pipeline
- `apps/desktop/scripts/download-wireguard.js` — downloads + verifies WireGuard MSI checksum
- Update `electron-builder.yml` — include `resources/wireguard-amd64.msi` in files list
- Update NSIS config — silent WireGuard install before app

### Nice to Have (P2)

| Item | Status | Notes |
|------|--------|-------|
| Delta updates (blockmap) | Done | `electron-builder` generates `.blockmap` automatically |
| macOS build support | Pending | Add `mac` target to `electron-builder.yml` if needed in future |
| Offline draft PDF preview | Pending | Generate certificate PDF preview locally without server |
| Bandwidth-aware sync | Pending | Throttle image uploads on metered/slow connections |

---

## Compliance Items (from SOC 2 Posture Assessment)

Items specific to the desktop app's compliance posture. Full assessment in [../soc2_posture.md](../soc2_posture.md).

| Control | Item | Status | Notes |
|---------|------|--------|-------|
| CC6.1 | Account lockout persistence | Done | Desktop uses DPAPI-stored `auth-attempts` — persistent across restarts |
| CC8.1 | Code signing | Deferred | Requires EV certificate (see P0 above). Not blocking internal rollout |
| A.8.11 | Encryption at rest | Done | SQLCipher AES-256 + DPAPI for credentials and images |
| A.10.1.1 | Key management | Done | PBKDF2 600K iterations, AES-256-GCM, keys never stored in plaintext |
| A.12.2.1 | Audit logging | Done | Append-only audit log with tamper-prevention triggers |
| A.14.2.6 | Software integrity | Deferred | Requires code signing + HMAC validation on sync. Blocked on EV cert |
| A.14.3.1 | Cryptography | Done | AES-256 (offline), TLS 1.3 (network), DPAPI (OS-level) |

---

## File Inventory

All files in `apps/desktop/`:

```
apps/desktop/
├── package.json                    (project config, scripts, electron-builder config)
├── tsconfig.json                   (CommonJS target, outDir: dist)
├── scripts/
│   ├── copy-standalone.js          (copy Next.js standalone, dereference pnpm symlinks, hoist packages)
│   └── after-pack.js               (copy standalone into packaged app resources)
├── src/
│   ├── main/
│   │   ├── index.ts                (main process entry, IPC, lifecycle, auto-updater, menu hidden)
│   │   ├── security.ts             (TLS pinning, secure wipe, retention, inactivity)
│   │   ├── sqlite-db.ts            (SQLCipher open/close, WrappedDb, migrations)
│   │   ├── auth.ts                 (DPAPI credentials, PBKDF2, password unlock, challenge-response 2FA)
│   │   ├── audit.ts                (append-only audit log)
│   │   ├── device.ts               (device registration, status check, heartbeat)
│   │   ├── file-store.ts           (DPAPI-encrypted image storage)
│   │   ├── ipc-handlers.ts         (draft CRUD + image IPC handlers)
│   │   ├── sync-engine.ts          (SyncEngine class — drafts, images, audit, codes)
│   │   └── ref-cache.ts            (reference data pre-caching)
│   ├── preload/
│   │   └── index.ts                (IPC channel allowlist, electronAPI bridge)
│   └── migrations/
│       ├── 001-init.sql            (full SQLCipher schema)
│       ├── 002-codes-add-key.sql   (add key column to offline_codes)
│       └── 003-conflict-support.sql (add conflict_server_data to drafts)
├── dist/                           (compiled JS output)
├── .next-standalone/               (prepared Next.js standalone for packaging)
└── release/                        (electron-builder output)
    ├── HTA Calibr8s Setup 0.1.0.exe
    ├── HTA Calibr8s Setup 0.1.0.exe.blockmap
    ├── latest.yml
    └── win-unpacked/
```
