# HTA Calibr8s — Electron Offline Desktop App

Engineers perform calibrations onsite at client locations with no internet or phone connectivity. This document describes the architecture, security model, and implementation plan for an Electron desktop app that enables offline certificate draft creation with automatic server synchronization on reconnect.

**Compliance targets:** SOC 2 Type II, ISO 27001

> **Prerequisites:** Before building the Electron app, complete all server-side and web-app changes in [PREREQUISITES.md](./PREREQUISITES.md) (Prisma schema, device API routes, offline codes API, refresh token service, auth middleware, engineer self-service page, api-client.ts hook, OfflineIndicator, turbo.json).

---

## Table of Contents

1. [Architecture](#architecture)
2. [Security Model](#security-model)
3. [Project Structure](#project-structure)
4. [Phase 1 — Electron Shell](#phase-1--electron-shell)
5. [Phase 2 — Encrypted Local Database + Offline Auth](#phase-2--encrypted-local-database--offline-auth)
6. [Phase 3 — Offline Draft Flow](#phase-3--offline-draft-flow)
7. [Phase 4 — Sync Engine](#phase-4--sync-engine)
8. [Phase 5 — Reference Data Pre-Cache](#phase-5--reference-data-pre-cache)
9. [Build, Signing & Distribution](#build-signing--distribution)
10. [Device Lifecycle Management](#device-lifecycle-management)
11. [Compliance Mapping](#compliance-mapping)
12. [Verification Checklist](#verification-checklist)

---

## Architecture

```
+-----------------------------------------------------------------+
|  Electron App (Windows .exe, EV code-signed)                     |
|                                                                  |
|  +------------------+      +----------------------------------+  |
|  |  Main Process    |      |  Renderer (Next.js standalone)   |  |
|  |                  |      |                                  |  |
|  |  SQLCipher DB    |<---->|  Normal app when online          |  |
|  |  (AES-256)       | IPC  |  Offline drafts when offline     |  |
|  |                  |      |  Connectivity indicator          |  |
|  |  Sync engine     |      |                                  |  |
|  |  Encrypted       |      |  contextIsolation: true          |  |
|  |  file store      |      |  nodeIntegration: false          |  |
|  |                  |      |                                  |  |
|  |  Audit logger    |      +----------------------------------+  |
|  |  (append-only)   |                                            |
|  |                  |                                            |
|  |  keytar          |                                            |
|  |  (OS credential  |                                            |
|  |   store)         |                                            |
|  +--------+---------+                                            |
|           |                                                      |
+-----------+------------------------------------------------------+
            |  TLS 1.3 + certificate pinning (when online)
            v
     +--------------+
     |  HTA API     |
     |  (Fastify)   |
     |  JWT auth    |
     +--------------+
```

### Three-Layer Design

| Layer | Component | Role |
|-------|-----------|------|
| **Shell** | Electron + BrowserWindow | Wraps existing Next.js app, adds native OS capabilities |
| **Local storage** | SQLCipher + encrypted filesystem | Stores drafts, parameters, images, audit logs offline |
| **Sync** | Queue-based push engine | Pushes local data to server API on reconnect |

### What Works Offline vs Online

| Feature | Offline | Online |
|---------|---------|--------|
| Create/edit certificate drafts | Yes | Yes |
| Fill measurement parameters | Yes | Yes |
| Capture/attach calibration images | Yes (encrypted local FS) | Yes (GCS) |
| Save drafts | Yes (SQLCipher) | Yes (API) |
| Submit for review | Queued, syncs on reconnect | Yes |
| Review/approve certificates | No | Yes |
| Customer portal | No | Yes |
| Admin dashboard | No | Yes |

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Local DB | **SQLCipher** (AES-256-CBC) | Encrypted at rest, SOC 2 CC6.1 / ISO A.10.1.1 |
| Credential storage | **keytar** (Windows Credential Manager) | OS-managed, DPAPI-encrypted, not in app files |
| Offline auth | **Password + pre-generated one-time code (2FA)** | Something you know + something you have |
| Session token | **30-day device-bound desktop token** | Longer than web (7d) because device-bound + 2FA + remotely revocable |
| Image encryption | **Electron safeStorage API** (DPAPI) | Tied to Windows user account |
| Sync strategy | **Queue-based one-way push** | Local -> server, not bidirectional |
| Conflict resolution | **Server authority** | Each engineer works on own drafts |
| Audit trail | **Append-only SQLite table** with triggers | Mirrors server `AuditLog` + `CertificateEvent` models |
| Code signing | **EV Code Signing Certificate** | Eliminates SmartScreen warnings, proves authenticity |
| Transport security | **TLS 1.3 + certificate pinning** | Prevents MITM on untrusted networks |
| Device management | **Server-side registry + remote wipe** | Admin can revoke/wipe any registered device |

---

## Security Model

### Data at Rest — Full Encryption

All local data is encrypted. An attacker with physical access to the laptop's filesystem sees only ciphertext.

| Data | Encryption | Key Source |
|------|-----------|------------|
| SQLite database | SQLCipher AES-256-CBC | Derived from user password + device ID (PBKDF2) |
| Image files | Electron `safeStorage` (DPAPI) | Windows user account (hardware-bound) |
| Desktop refresh token | AES-256-GCM | Derived from user password + device ID (PBKDF2) |
| One-time codes | SHA-256 hashed in SQLCipher | Only hashes stored; plaintext shown once at setup |
| Password salt, device ID | Windows Credential Manager | OS-managed DPAPI |

### Authentication — Online + Offline (2FA)

**Online login (first use / device setup):**

1. Engineer enters email + password
2. API authenticates credentials (same password used for web login)
3. Server issues a **desktop refresh token** (30-day expiry, bound to `deviceId`)
   - Separate from the web refresh token (7-day) — longer because device-bound + 2FA + remotely revocable
   - See [PREREQUISITES.md - Refresh Token Service](./PREREQUISITES.md#2-refresh-token-service) for server-side changes
4. App encrypts credentials using `PBKDF2(password + deviceId + userId, salt)` — no separate setup step required
5. Server generates **50 one-time codes** (8-character alphanumeric, e.g., `A3K9-BX7P`)
   - Codes displayed to engineer + option to **print as a code sheet** (grid card: 5 rows A-E x 10 cols, keys like "B4", 4-char values) to carry onsite
   - Only SHA-256 hashes stored locally (plaintext never persisted)
   - Engineers manage their own codes via the self-service page — see [PREREQUISITES.md - Offline Codes Page](./PREREQUISITES.md#7-engineer-offline-codes-page)
6. Desktop token encrypted with password-derived key, stored locally
7. Device registered on server: `POST /api/devices/register`
8. Codes stored locally, navigate to dashboard

**Offline unlock (every 24 hours of use, or on app restart):**

1. App prompts for **password + challenge-response code** from printed grid card (two-factor)
   - Factor 1: Password (something you know — same password used for web login)
   - Factor 2: Challenge-response code from printed grid card (something you have)
2. App validates code against stored hashes, marks it as consumed
3. Derives decryption key: `PBKDF2(password + deviceId + userId, salt, 600_000, SHA-256)`
4. Decrypts desktop refresh token — wrong password = decryption failure
5. On success: opens SQLCipher DB, app unlocked for 24 hours
6. On failure: increment attempt counter. **5 consecutive wrong passwords = full data wipe**

**Re-authentication cadence:**

- On every app restart: password + challenge-response code required
- After 24 hours of continuous use: password + challenge-response code required (session lock)
- After 1 hour idle (app open but inactive): password-only re-entry (no code consumed)

**Token lifecycle:**

- Desktop refresh token: 30-day expiry
- If engineer is offline for >30 days, token expires -> must reconnect and re-authenticate
- On reconnect, sync engine rotates the desktop token (extends 30-day window)
- Each sync also replenishes one-time codes if <10 remaining

**One-time code lifecycle:**

- 50 codes generated at setup, stored as SHA-256 hashes in SQLCipher
- Each offline unlock consumes one code (hash marked `used = 1`, cannot reuse)
- When **<10 codes remaining**: app shows warning banner "Connect to internet to get more codes"
- When **0 codes remaining**: app locked, must reconnect to generate new batch
- On reconnect: server generates a fresh batch of 50 codes, old unused codes invalidated
- Server-side cron auto-refreshes expired batches every 30 days — see [PREREQUISITES.md - Cron Job](./PREREQUISITES.md#6-cron-job--30-day-code-refresh)

### Audit Trail — Append-Only

Mirrors the server's `CertificateEvent` (sequenced) and `AuditLog` (entity-level) patterns:

- Every action logged locally: draft CRUD, image attach, password unlock, password failure, sync events, data wipe
- SQLite triggers prevent UPDATE and DELETE on the audit table
- Audit logs synced to server on reconnect via `POST /api/devices/:deviceId/audit-logs`
- Server-side retention: audit logs kept for 7 years (SOC 2 / ISO 27001)

### Device Lifecycle

```
  Register           Active Use          Revoke/Wipe
-----+-------------------+------------------+---------
     |                   |                  |
  POST /api/devices/   Device checks      Admin sets
  register             status on each     status to
  {deviceId,           sync cycle         REVOKED or
   userId,                                WIPE_PENDING
   deviceName,         Status: ACTIVE     -> next sync
   platform}           -> proceed         -> wipe all
                                          local data
                       Status: REVOKED
                       -> wipe + lock out

                       Status: WIPE_PENDING
                       -> wipe + confirm
                         to server
```

### Auto-Wipe Triggers

| Trigger | Action |
|---------|--------|
| 5 consecutive failed password attempts | Full local data wipe |
| 0 one-time codes remaining | Lock app, require online re-auth (no wipe — data preserved for sync) |
| Device status = `REVOKED` or `WIPE_PENDING` | Full local data wipe on next online check |
| App not opened for 30 days | Full local data wipe on next launch |
| Desktop token expired (>30 days offline) | Clear cached credentials, require online re-auth |
| Manual admin action | Remote wipe via device management dashboard |

### Secure Deletion

Wipe is not just `fs.unlinkSync` — data must be unrecoverable:

1. Overwrite SQLite file with `crypto.randomBytes(fileSize)` before unlinking
2. Delete WAL and SHM journal files
3. Recursively overwrite + delete image directory
4. Clear all entries from Windows Credential Manager via keytar
5. Log wipe event to server (if online) before destroying local data

### Transport Security

- All API communication over TLS 1.3
- Certificate pinning via `session.setCertificateVerifyProc()` — pins the API server's TLS certificate fingerprint
- Prevents MITM attacks on untrusted networks (client sites, hotel Wi-Fi)

---

## Project Structure

```
hta-platform/
+-- apps/
|   +-- desktop/                              # Electron app
|   |   +-- src/
|   |   |   +-- main/
|   |   |   |   +-- index.ts                  # App entry, BrowserWindow, lifecycle, connectivity polling
|   |   |   |   +-- ipc-handlers.ts           # IPC endpoints: draft CRUD, images, sync, ref data
|   |   |   |   +-- sqlite-db.ts              # SQLCipher connection, migration runner
|   |   |   |   +-- sync-engine.ts            # Queue processor: push drafts + images + audit logs
|   |   |   |   +-- file-store.ts             # Encrypted image read/write (safeStorage)
|   |   |   |   +-- auth.ts                   # Password-based setup, offline unlock, key derivation, keytar
|   |   |   |   +-- audit.ts                  # Append-only audit logger
|   |   |   |   +-- device.ts                 # Device registration, status check, remote wipe
|   |   |   |   +-- security.ts               # TLS pinning, auto-wipe, retention policy
|   |   |   +-- preload/
|   |   |   |   +-- index.ts                  # contextBridge: expose IPC channels to renderer
|   |   |   +-- migrations/
|   |   |       +-- 001-init.sql              # SQLCipher schema
|   |   +-- resources/
|   |   |   +-- icon.ico                      # App icon
|   |   +-- package.json
|   |   +-- tsconfig.json
|   |   +-- electron-builder.yml              # Build config + code signing
|   +-- web-hta/                              # Existing Next.js app (renderer)
|   +-- api/                                  # Existing Fastify API
|   +-- worker/                               # Existing BullMQ worker
+-- packages/
|   +-- database/                             # Prisma schema (server DB)
|   +-- shared/                               # Shared types/utils
+-- pnpm-workspace.yaml                       # apps/* includes apps/desktop
+-- turbo.json                                # desktop:build task
```

### Dependencies

```json
{
  "dependencies": {
    "@journeyapps/sqlcipher": "^5.7.0",
    "keytar": "^7.9.0",
    "electron-store": "^10.0.0",
    "electron-updater": "^6.0.0"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "concurrently": "^9.0.0",
    "typescript": "^5.7.0"
  }
}
```

---

## Phase 1 — Electron Shell

**Goal:** Existing Next.js web app running inside Electron. No offline capabilities. Validate that every online feature works identically to the browser.

### 1.1 Main process entry (`src/main/index.ts`)

```typescript
import { app, BrowserWindow, session } from 'electron'
import path from 'path'
import { setupTlsPinning } from './security'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,      // Renderer cannot access Node APIs
      nodeIntegration: false,       // No require() in renderer
      sandbox: true,                // Additional process isolation
    },
  })

  // Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost:3000')) {
      event.preventDefault()
    }
  })

  // Block new window creation (prevents window.open attacks)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000')
  } else {
    // Start bundled Next.js standalone server
    const serverPath = path.join(process.resourcesPath, 'next-app', 'server.js')
    require(serverPath)
    mainWindow.loadURL('http://localhost:3000')
  }
}

app.whenReady().then(() => {
  setupTlsPinning(session.defaultSession)
  createWindow()
})

app.on('window-all-closed', () => app.quit())
```

### 1.2 TLS certificate pinning (`src/main/security.ts`)

```typescript
import { Session } from 'electron'

// Pin your API's TLS certificate SHA-256 fingerprint
// Update this when rotating TLS certificates
const PINNED_HOSTS: Record<string, string> = {
  'api.htacalibr8s.com': 'sha256/YOUR_CERT_FINGERPRINT_HERE',
}

export function setupTlsPinning(ses: Session) {
  ses.setCertificateVerifyProc((request, callback) => {
    const pin = PINNED_HOSTS[request.hostname]
    if (pin) {
      callback(request.certificate.fingerprint === pin ? 0 : -2)
    } else {
      callback(-3) // Use default OS verification for other hosts
    }
  })
}
```

### 1.3 Bundle Next.js standalone

`next.config.ts` already uses `output: 'standalone'`. Production build copies the self-contained server:

```yaml
# electron-builder.yml (Phase 1 — no signing yet)
appId: com.htacalibr8s.desktop
productName: HTA Calibr8s
win:
  target: nsis
directories:
  output: dist
extraResources:
  - from: ../web-hta/.next/standalone
    to: next-app
  - from: ../web-hta/.next/static
    to: next-app/.next/static
  - from: ../web-hta/public
    to: next-app/public
```

### 1.4 Dev workflow

```bash
# Terminal 1: Next.js dev server
pnpm --filter web-hta dev

# Terminal 2: Electron shell
pnpm --filter desktop dev
```

### 1.5 Verification

- [ ] Electron window opens, loads web app at localhost:3000
- [ ] Login works (JWT flow via `apiFetch()`)
- [ ] Certificate pages, dashboard, images all functional
- [ ] External URL navigation blocked
- [ ] `window.open()` blocked

---

## Phase 2 — Encrypted Local Database + Offline Auth

**Goal:** SQLCipher database, password-based offline authentication with one-time code 2FA, device registration, append-only audit log.

### 2.1 SQLCipher schema (`migrations/001-init.sql`)

```sql
-- =============================================================
-- Local certificate drafts
-- Mirrors server Certificate model for draft-phase fields
-- =============================================================
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  server_id TEXT,                       -- NULL until synced; server UUID after sync
  tenant_id TEXT NOT NULL,
  engineer_id TEXT NOT NULL,

  -- Certificate core fields (matches Prisma Certificate model)
  certificate_number TEXT,
  customer_name TEXT,
  customer_address TEXT,
  customer_contact_name TEXT,
  customer_contact_email TEXT,
  customer_account_id TEXT,
  uuc_description TEXT,
  uuc_make TEXT,
  uuc_model TEXT,
  uuc_serial_number TEXT,
  uuc_instrument_id TEXT,
  uuc_location_name TEXT,
  uuc_machine_name TEXT,
  date_of_calibration TEXT,
  calibration_due_date TEXT,
  calibration_tenure INTEGER DEFAULT 12,
  due_date_adjustment INTEGER DEFAULT 0,
  due_date_not_applicable INTEGER DEFAULT 0,
  ambient_temperature TEXT,
  relative_humidity TEXT,
  srf_number TEXT,
  srf_date TEXT,
  calibration_status JSON,
  sticker_old_removed TEXT,
  sticker_new_affixed TEXT,
  status_notes TEXT,
  selected_conclusion_statements JSON,
  additional_conclusion_statement TEXT,

  -- Sync metadata
  status TEXT NOT NULL DEFAULT 'LOCAL_DRAFT',
    -- LOCAL_DRAFT | QUEUED | SYNCED | SYNC_FAILED
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_drafts_engineer ON drafts(engineer_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

-- =============================================================
-- Measurement parameters (matches Prisma Parameter model)
-- =============================================================
CREATE TABLE IF NOT EXISTS draft_parameters (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  parameter_name TEXT NOT NULL,
  parameter_unit TEXT NOT NULL,
  range_min TEXT,
  range_max TEXT,
  range_unit TEXT,
  operating_min TEXT,
  operating_max TEXT,
  operating_unit TEXT,
  least_count_value TEXT,
  least_count_unit TEXT,
  accuracy_value TEXT,
  accuracy_unit TEXT,
  accuracy_type TEXT DEFAULT 'ABSOLUTE',
  error_formula TEXT DEFAULT 'A-B',
  show_after_adjustment INTEGER DEFAULT 0,
  requires_binning INTEGER DEFAULT 0,
  bins JSON,
  sop_reference TEXT,
  master_instrument_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_params_draft ON draft_parameters(draft_id);

-- =============================================================
-- Calibration results (matches Prisma CalibrationResult model)
-- =============================================================
CREATE TABLE IF NOT EXISTS draft_calibration_results (
  id TEXT PRIMARY KEY,
  parameter_id TEXT NOT NULL REFERENCES draft_parameters(id) ON DELETE CASCADE,
  point_number INTEGER NOT NULL,
  standard_reading TEXT,
  before_adjustment TEXT,
  after_adjustment TEXT,
  error_observed REAL,
  is_out_of_limit INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_results_param ON draft_calibration_results(parameter_id);

-- =============================================================
-- Master instruments used in draft (matches CertificateMasterInstrument)
-- =============================================================
CREATE TABLE IF NOT EXISTS draft_master_instruments (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  parameter_id TEXT,
  master_instrument_id TEXT NOT NULL,
  category TEXT,
  description TEXT,
  make TEXT,
  model TEXT,
  asset_no TEXT,
  serial_number TEXT,
  calibrated_at TEXT,
  report_no TEXT,
  calibration_due_date TEXT,
  sop_reference TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_draft_masters_draft ON draft_master_instruments(draft_id);

-- =============================================================
-- Local image files (metadata; actual files encrypted on disk)
-- =============================================================
CREATE TABLE IF NOT EXISTS draft_images (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  image_type TEXT NOT NULL,             -- UUC | MASTER_INSTRUMENT | READING_UUC | READING_MASTER
  master_instrument_index INTEGER,
  parameter_index INTEGER,
  point_number INTEGER,
  local_path TEXT NOT NULL,             -- Path to encrypted file in userData
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  caption TEXT,
  synced INTEGER NOT NULL DEFAULT 0,    -- 0 = pending upload, 1 = uploaded to GCS
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_images_draft ON draft_images(draft_id);
CREATE INDEX IF NOT EXISTS idx_images_type ON draft_images(draft_id, image_type);

-- =============================================================
-- Sync queue (FIFO processing with retry)
-- =============================================================
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  action TEXT NOT NULL,                 -- CREATE | UPDATE | SUBMIT
  payload JSON NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING | IN_PROGRESS | SYNCED | FAILED
  retries INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status);

-- =============================================================
-- Cached reference data (for offline dropdowns)
-- =============================================================
CREATE TABLE IF NOT EXISTS ref_master_instruments (
  id TEXT PRIMARY KEY,
  data JSON NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ref_customers (
  id TEXT PRIMARY KEY,
  data JSON NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================
-- Audit log (append-only, mirrors server AuditLog model)
-- =============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  action TEXT NOT NULL,
    -- AUTH_SETUP | AUTH_UNLOCK | AUTH_FAILED | AUTH_LOCKOUT
    -- AUTH_CODE_VALIDATED | AUTH_CODE_FAILED
    -- DRAFT_CREATED | DRAFT_UPDATED | DRAFT_DELETED
    -- IMAGE_ATTACHED | IMAGE_DELETED
    -- SYNC_STARTED | SYNC_COMPLETED | SYNC_FAILED
    -- DEVICE_REGISTERED | DEVICE_WIPE
    -- REF_DATA_CACHED
  entity_type TEXT,                     -- draft | image | auth | device | sync
  entity_id TEXT,
  metadata JSON,
  synced INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_audit_synced ON audit_log(synced);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);

-- Append-only enforcement: prevent modification of audit records
CREATE TRIGGER IF NOT EXISTS prevent_audit_update
  BEFORE UPDATE OF user_id, device_id, action, entity_type, entity_id, metadata, timestamp
  ON audit_log
  BEGIN SELECT RAISE(ABORT, 'Audit log records are immutable'); END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
  BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'Audit log records cannot be deleted'); END;

-- =============================================================
-- One-time codes for offline 2FA (Factor 2: something you have)
-- =============================================================
CREATE TABLE IF NOT EXISTS offline_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,              -- SHA-256 hash (plaintext shown once at setup)
  sequence INTEGER NOT NULL,            -- Display order on printed code sheet
  used INTEGER NOT NULL DEFAULT 0,      -- 0 = available, 1 = consumed
  used_at TEXT,                         -- Timestamp when consumed
  batch_id TEXT NOT NULL,               -- Groups codes from same generation
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_codes_available ON offline_codes(used, sequence);
CREATE INDEX IF NOT EXISTS idx_codes_batch ON offline_codes(batch_id);

-- =============================================================
-- Session tracking (for 24h re-auth cadence)
-- =============================================================
CREATE TABLE IF NOT EXISTS session_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Keys: 'last_full_auth' (timestamp of last password+code unlock)
--        'last_activity' (timestamp of last user interaction)

-- =============================================================
-- Device metadata (stores device identity)
-- =============================================================
CREATE TABLE IF NOT EXISTS device_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- =============================================================
-- Migrations tracker
-- =============================================================
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2.2 SQLCipher connection (`src/main/sqlite-db.ts`)

```typescript
import Database from '@journeyapps/sqlcipher'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const DB_PATH = path.join(app.getPath('userData'), 'hta-offline.db')

let db: Database.Database | null = null

export function openDb(encryptionKey: string): Database.Database {
  if (db) return db

  db = new Database(DB_PATH)
  db.pragma(`key = "${encryptionKey}"`)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not unlocked. Call openDb() with encryption key first.')
  return db
}

export function closeDb() {
  if (db) { db.close(); db = null }
}

function runMigrations(db: Database.Database) {
  const migrationDir = path.join(__dirname, '../migrations')
  if (!fs.existsSync(migrationDir)) return

  const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort()
  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name)
  )

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf-8')
    db.exec(sql)
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file)
  }
}

export function dbExists(): boolean {
  return fs.existsSync(DB_PATH)
}
```

### 2.3 Offline authentication (`src/main/auth.ts`)

Handles both first-time setup (online) and offline unlock with one-time code validation (2FA).

```typescript
import crypto from 'crypto'
import keytar from 'keytar'
import { openDb, closeDb, getDb } from './sqlite-db'
import { auditLog } from './audit'
import { wipeAllLocalData } from './security'

const SERVICE = 'HTA-Calibr8s'
const PBKDF2_ITERATIONS = 600_000  // OWASP 2024 recommendation for SHA-256
const MAX_AUTH_ATTEMPTS = 5

// -- Key Derivation -------------------------------------------------------

function deriveKey(password: string, deviceId: string, userId: string, salt: Buffer): Buffer {
  const input = `${password}:${deviceId}:${userId}`
  return crypto.pbkdf2Sync(input, salt, PBKDF2_ITERATIONS, 32, 'sha256')
}

// -- First-Time Setup (Online) --------------------------------------------

export async function setupOfflineAuth(
  password: string,
  userId: string,
  refreshToken: string
): Promise<void> {
  const deviceId = crypto.randomUUID()
  const salt = crypto.randomBytes(32)
  const key = deriveKey(password, deviceId, userId, salt)

  // Encrypt refresh token with AES-256-GCM
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Store secrets in Windows Credential Manager (DPAPI-encrypted)
  await keytar.setPassword(SERVICE, 'device-id', deviceId)
  await keytar.setPassword(SERVICE, 'user-id', userId)
  await keytar.setPassword(SERVICE, 'salt', salt.toString('base64'))
  await keytar.setPassword(SERVICE, 'encrypted-token', JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: authTag.toString('base64'),
  }))
  await keytar.setPassword(SERVICE, 'auth-attempts', '0')

  // Open encrypted DB with the derived key (hex string for SQLCipher)
  const db = openDb(key.toString('hex'))

  // Store device identity in DB
  const meta = db.prepare('INSERT OR REPLACE INTO device_meta (key, value) VALUES (?, ?)')
  meta.run('device_id', deviceId)
  meta.run('user_id', userId)

  auditLog(db, {
    userId,
    deviceId,
    action: 'AUTH_SETUP',
    entityType: 'auth',
    metadata: { deviceId },
  })
}

// -- Offline Unlock (Password + One-Time Code 2FA) ------------------------

export async function unlockWithPasswordAndCode(
  password: string,
  oneTimeCode: string
): Promise<{
  success: boolean
  refreshToken?: string
  attemptsRemaining?: number
  error?: string
}> {
  const deviceId = await keytar.getPassword(SERVICE, 'device-id')
  const userId = await keytar.getPassword(SERVICE, 'user-id')
  const saltB64 = await keytar.getPassword(SERVICE, 'salt')
  const tokenData = await keytar.getPassword(SERVICE, 'encrypted-token')
  const attempts = parseInt(await keytar.getPassword(SERVICE, 'auth-attempts') || '0', 10)

  if (!deviceId || !userId || !saltB64 || !tokenData) {
    return { success: false, error: 'No offline auth configured' }
  }

  // Check lockout
  if (attempts >= MAX_AUTH_ATTEMPTS) {
    await wipeAllLocalData('Password lockout exceeded')
    return { success: false, attemptsRemaining: 0 }
  }

  const salt = Buffer.from(saltB64, 'base64')
  const key = deriveKey(password, deviceId, userId, salt)

  try {
    // Decrypt refresh token (validates password is correct)
    const stored = JSON.parse(tokenData)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(stored.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(stored.tag, 'base64'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(stored.data, 'base64')),
      decipher.final(),
    ])
    const refreshToken = decrypted.toString('utf8')

    // Password is correct -- now validate one-time code
    const db = openDb(key.toString('hex'))
    const codeHash = crypto.createHash('sha256').update(oneTimeCode.toUpperCase().replace(/-/g, '')).digest('hex')

    const codeRow = db.prepare(
      'SELECT id, sequence FROM offline_codes WHERE code_hash = ? AND used = 0 LIMIT 1'
    ).get(codeHash) as { id: string; sequence: number } | undefined

    if (!codeRow) {
      // Invalid or already-used code
      auditLog(db, {
        userId, deviceId,
        action: 'AUTH_CODE_FAILED',
        entityType: 'auth',
        metadata: { reason: 'Invalid or used code' },
      })
      closeDb()
      return { success: false, error: 'Invalid or already-used code', attemptsRemaining: MAX_AUTH_ATTEMPTS - attempts }
    }

    // Mark code as consumed
    db.prepare('UPDATE offline_codes SET used = 1, used_at = datetime(?) WHERE id = ?')
      .run(new Date().toISOString(), codeRow.id)

    // Check remaining codes
    const remaining = (db.prepare('SELECT COUNT(*) as cnt FROM offline_codes WHERE used = 0').get() as any).cnt

    // Success -- reset attempts
    await keytar.setPassword(SERVICE, 'auth-attempts', '0')

    // Update session timestamp
    db.prepare('INSERT OR REPLACE INTO session_meta (key, value) VALUES (?, ?)')
      .run('last_full_auth', new Date().toISOString())

    auditLog(db, {
      userId, deviceId,
      action: 'AUTH_UNLOCK',
      entityType: 'auth',
      metadata: { codeSequence: codeRow.sequence, codesRemaining: remaining },
    })

    return { success: true, refreshToken }
  } catch {
    // Wrong password -- increment attempts
    const newAttempts = attempts + 1
    await keytar.setPassword(SERVICE, 'auth-attempts', String(newAttempts))

    // Try to log failure (DB may not be open if key is wrong)
    try {
      const db = openDb(key.toString('hex'))
      auditLog(db, {
        userId: userId!, deviceId: deviceId!,
        action: 'AUTH_FAILED',
        entityType: 'auth',
        metadata: { attempt: newAttempts },
      })
    } catch { /* DB key wrong, can't log locally */ }

    if (newAttempts >= MAX_AUTH_ATTEMPTS) {
      await wipeAllLocalData('Password lockout exceeded')
      return { success: false, attemptsRemaining: 0 }
    }

    return { success: false, attemptsRemaining: MAX_AUTH_ATTEMPTS - newAttempts }
  }
}

// -- Password-Only Re-entry (idle timeout, no code consumed) --------------

export async function unlockWithPasswordOnly(password: string): Promise<{
  success: boolean
  attemptsRemaining?: number
}> {
  const deviceId = await keytar.getPassword(SERVICE, 'device-id')
  const userId = await keytar.getPassword(SERVICE, 'user-id')
  const saltB64 = await keytar.getPassword(SERVICE, 'salt')
  const tokenData = await keytar.getPassword(SERVICE, 'encrypted-token')
  const attempts = parseInt(await keytar.getPassword(SERVICE, 'auth-attempts') || '0', 10)

  if (!deviceId || !userId || !saltB64 || !tokenData) {
    return { success: false }
  }

  if (attempts >= MAX_AUTH_ATTEMPTS) {
    await wipeAllLocalData('Password lockout exceeded')
    return { success: false, attemptsRemaining: 0 }
  }

  const salt = Buffer.from(saltB64, 'base64')
  const key = deriveKey(password, deviceId, userId, salt)

  try {
    // Validate password by attempting decryption
    const stored = JSON.parse(tokenData)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(stored.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(stored.tag, 'base64'))
    decipher.update(Buffer.from(stored.data, 'base64'))
    decipher.final() // Throws if wrong password

    await keytar.setPassword(SERVICE, 'auth-attempts', '0')

    // Update activity timestamp (but NOT last_full_auth — no code consumed)
    const db = getDb()
    db.prepare('INSERT OR REPLACE INTO session_meta (key, value) VALUES (?, ?)')
      .run('last_activity', new Date().toISOString())

    return { success: true }
  } catch {
    const newAttempts = attempts + 1
    await keytar.setPassword(SERVICE, 'auth-attempts', String(newAttempts))
    if (newAttempts >= MAX_AUTH_ATTEMPTS) {
      await wipeAllLocalData('Password lockout exceeded')
      return { success: false, attemptsRemaining: 0 }
    }
    return { success: false, attemptsRemaining: MAX_AUTH_ATTEMPTS - newAttempts }
  }
}

// -- Credential Cleanup ---------------------------------------------------

export async function clearCredentials(): Promise<void> {
  for (const key of ['device-id', 'user-id', 'salt', 'encrypted-token', 'auth-attempts']) {
    await keytar.deletePassword(SERVICE, key)
  }
}

export async function getDeviceId(): Promise<string | null> {
  return keytar.getPassword(SERVICE, 'device-id')
}
```

### 2.4 Append-only audit logger (`src/main/audit.ts`)

```typescript
import crypto from 'crypto'
import type Database from '@journeyapps/sqlcipher'

interface AuditEntry {
  userId: string
  deviceId: string
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}

export function auditLog(db: Database.Database, entry: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_log (id, user_id, device_id, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    entry.userId,
    entry.deviceId,
    entry.action,
    entry.entityType || null,
    entry.entityId || null,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
  )
}
```

### 2.5 Secure wipe (`src/main/security.ts` — continued)

```typescript
import { app } from 'electron'
import { closeDb, dbExists } from './sqlite-db'
import { clearCredentials, getDeviceId } from './auth'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export async function wipeAllLocalData(reason: string): Promise<void> {
  const deviceId = await getDeviceId()

  // 1. Close database connection
  closeDb()

  // 2. Overwrite + delete SQLite file (prevents forensic recovery)
  const dbPath = path.join(app.getPath('userData'), 'hta-offline.db')
  for (const suffix of ['', '-wal', '-shm']) {
    const filePath = dbPath + suffix
    if (fs.existsSync(filePath)) {
      const size = fs.statSync(filePath).size
      fs.writeFileSync(filePath, crypto.randomBytes(size))
      fs.unlinkSync(filePath)
    }
  }

  // 3. Wipe encrypted image directory
  const imagesDir = path.join(app.getPath('userData'), 'images')
  if (fs.existsSync(imagesDir)) {
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath)
        } else {
          const size = fs.statSync(fullPath).size
          fs.writeFileSync(fullPath, crypto.randomBytes(size))
          fs.unlinkSync(fullPath)
        }
      }
      fs.rmdirSync(dir)
    }
    walk(imagesDir)
  }

  // 4. Clear credential store
  await clearCredentials()
}

// -- Data Retention Policy ------------------------------------------------

export function enforceRetentionPolicy(db: Database.Database, maxDays: number = 30): void {
  // Delete synced drafts older than retention period
  db.prepare(
    `DELETE FROM drafts WHERE status = 'SYNCED' AND synced_at < datetime('now', ? || ' days')`
  ).run(`-${maxDays}`)

  // Delete stale reference data
  db.prepare(
    `DELETE FROM ref_master_instruments WHERE cached_at < datetime('now', ? || ' days')`
  ).run(`-${maxDays}`)

  db.prepare(
    `DELETE FROM ref_customers WHERE cached_at < datetime('now', ? || ' days')`
  ).run(`-${maxDays}`)
}

// -- Inactivity Check -----------------------------------------------------

export function checkInactivityWipe(maxInactiveDays: number = 30): boolean {
  const lastOpenFile = path.join(app.getPath('userData'), '.last-opened')
  if (fs.existsSync(lastOpenFile)) {
    const lastOpened = new Date(fs.readFileSync(lastOpenFile, 'utf8'))
    const daysSince = (Date.now() - lastOpened.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince > maxInactiveDays) return true // Should wipe
  }
  // Update last opened timestamp
  fs.writeFileSync(lastOpenFile, new Date().toISOString())
  return false
}
```

### 2.6 Preload script (`src/preload/index.ts`)

```typescript
import { contextBridge, ipcRenderer } from 'electron'

// Strict channel allowlist — only these IPC channels are accessible from renderer
const ALLOWED_CHANNELS = [
  'app:online-status', 'app:connectivity-changed',
  'auth:setup', 'auth:unlock', 'auth:unlock-password-only', 'auth:status',
  'draft:create', 'draft:save', 'draft:get', 'draft:list', 'draft:delete',
  'image:save', 'image:get-path', 'image:list',
  'sync:status', 'sync:trigger', 'sync:progress',
  'ref:master-instruments', 'ref:customers',
] as const

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Auth (password + one-time code 2FA)
  setup: (password: string) => ipcRenderer.invoke('auth:setup', password),
  unlock: (password: string, code: string) => ipcRenderer.invoke('auth:unlock', password, code),
  unlockPasswordOnly: (password: string) => ipcRenderer.invoke('auth:unlock-password-only', password),
  getAuthStatus: () => ipcRenderer.invoke('auth:status'),

  // Connectivity
  getOnlineStatus: () => ipcRenderer.invoke('app:online-status'),
  onConnectivityChange: (cb: (online: boolean) => void) => {
    const handler = (_event: unknown, online: boolean) => cb(online)
    ipcRenderer.on('app:connectivity-changed', handler)
    return () => ipcRenderer.removeListener('app:connectivity-changed', handler)
  },

  // Draft CRUD
  createDraft: (data: unknown) => ipcRenderer.invoke('draft:create', data),
  saveDraft: (id: string, data: unknown) => ipcRenderer.invoke('draft:save', id, data),
  getDraft: (id: string) => ipcRenderer.invoke('draft:get', id),
  listDrafts: () => ipcRenderer.invoke('draft:list'),
  deleteDraft: (id: string) => ipcRenderer.invoke('draft:delete', id),

  // Images
  saveImage: (draftId: string, meta: unknown, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('image:save', draftId, meta, buffer),
  getImagePath: (imageId: string) => ipcRenderer.invoke('image:get-path', imageId),
  listImages: (draftId: string) => ipcRenderer.invoke('image:list', draftId),

  // Sync
  getSyncStatus: () => ipcRenderer.invoke('sync:status'),
  triggerSync: () => ipcRenderer.invoke('sync:trigger'),
  onSyncProgress: (cb: (progress: unknown) => void) => {
    const handler = (_event: unknown, progress: unknown) => cb(progress)
    ipcRenderer.on('sync:progress', handler)
    return () => ipcRenderer.removeListener('sync:progress', handler)
  },

  // Reference data
  getMasterInstruments: () => ipcRenderer.invoke('ref:master-instruments'),
  getCustomers: () => ipcRenderer.invoke('ref:customers'),
})
```

### 2.7 Device registration (`src/main/device.ts`)

```typescript
import { net } from 'electron'
import os from 'os'
import { getDeviceId } from './auth'
import { wipeAllLocalData } from './security'

interface DeviceStatus {
  status: 'ACTIVE' | 'REVOKED' | 'WIPE_PENDING'
}

export async function registerDevice(apiBase: string, token: string): Promise<void> {
  const deviceId = await getDeviceId()
  if (!deviceId) return

  await fetch(`${apiBase}/api/devices/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      deviceName: os.hostname(),
      platform: process.platform,
      appVersion: require('../../package.json').version,
    }),
  })
}

export async function checkDeviceStatus(apiBase: string, token: string): Promise<DeviceStatus> {
  const deviceId = await getDeviceId()
  if (!deviceId) return { status: 'REVOKED' }

  try {
    const res = await fetch(`${apiBase}/api/devices/${deviceId}/status`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const data: DeviceStatus = await res.json()

    if (data.status === 'REVOKED' || data.status === 'WIPE_PENDING') {
      await wipeAllLocalData(`Device ${data.status}`)

      // Confirm wipe to server
      if (data.status === 'WIPE_PENDING') {
        await fetch(`${apiBase}/api/devices/${deviceId}/confirm-wipe`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        })
      }
    }

    return data
  } catch {
    return { status: 'ACTIVE' } // Offline — assume active, check next time
  }
}
```

### 2.8 Verification

- [ ] SQLCipher DB created at `%APPDATA%/HTA Calibr8s/hta-offline.db`
- [ ] DB file is unreadable without the correct password-derived key
- [ ] Opening DB with wrong key throws `SQLITE_NOTADB`
- [ ] Password-based setup works on first online login
- [ ] Offline unlock requires both password and challenge-response code from printed grid card
- [ ] Invalid code rejected (password correct, code wrong)
- [ ] Used code cannot be reused
- [ ] Wrong password shows remaining attempts
- [ ] 5 wrong passwords triggers full data wipe
- [ ] Audit log entries created for all auth events (setup, unlock, failed password, failed code)
- [ ] Audit log UPDATE/DELETE triggers fire correctly (reject modification)
- [ ] Device registered on server after first login
- [ ] `window.electronAPI` available in renderer DevTools
- [ ] After 1h idle: password-only re-entry (no code consumed)
- [ ] After 24h or restart: full password + code required

---

## Phase 3 — Offline Draft Flow

**Goal:** When offline in Electron, draft CRUD goes through IPC to SQLCipher. The Zustand store and UI components require zero changes because we intercept at the `apiFetch()` level (see [PREREQUISITES.md - api-client.ts Offline Hook](./PREREQUISITES.md#9-api-clientts-offline-hook)).

### 3.1 IPC handlers (`src/main/ipc-handlers.ts`)

Each handler validates input, reads/writes SQLCipher, logs to audit trail, returns result.

| Channel | Action | Audit Event |
|---------|--------|-------------|
| `draft:create` | INSERT draft + parameters, generate UUID | `DRAFT_CREATED` |
| `draft:save` | UPDATE draft + upsert parameters | `DRAFT_UPDATED` |
| `draft:get` | SELECT with joined parameters, results, images | -- |
| `draft:list` | SELECT all for current engineer | -- |
| `draft:delete` | DELETE CASCADE + delete local images | `DRAFT_DELETED` |
| `image:save` | Encrypt + write to disk, INSERT metadata | `IMAGE_ATTACHED` |
| `image:list` | SELECT from draft_images | -- |
| `image:get-path` | Return decrypted image buffer | -- |

### 3.2 Encrypted image storage (`src/main/file-store.ts`)

```typescript
import { app, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

const IMAGES_DIR = path.join(app.getPath('userData'), 'images')

export function saveImageEncrypted(
  draftId: string,
  buffer: Buffer,
  extension: string
): { localPath: string; id: string; sizeBytes: number } {
  const dir = path.join(IMAGES_DIR, draftId)
  fs.mkdirSync(dir, { recursive: true })

  const id = crypto.randomUUID()
  const filename = `${id}.${extension}.enc`
  const localPath = path.join(dir, filename)

  // Encrypt with DPAPI (Windows) via Electron safeStorage
  const encrypted = safeStorage.encryptString(buffer.toString('base64'))
  fs.writeFileSync(localPath, encrypted)

  return { localPath, id, sizeBytes: buffer.length }
}

export function readImageDecrypted(localPath: string): Buffer | null {
  if (!fs.existsSync(localPath)) return null
  const encrypted = fs.readFileSync(localPath)
  const base64 = safeStorage.decryptString(encrypted)
  return Buffer.from(base64, 'base64')
}

export function deleteImagesForDraft(draftId: string): void {
  const dir = path.join(IMAGES_DIR, draftId)
  if (fs.existsSync(dir)) {
    // Secure delete: overwrite before unlinking
    for (const file of fs.readdirSync(dir)) {
      const filePath = path.join(dir, file)
      const size = fs.statSync(filePath).size
      fs.writeFileSync(filePath, crypto.randomBytes(size))
      fs.unlinkSync(filePath)
    }
    fs.rmdirSync(dir)
  }
}
```

### 3.3 Verification

- [ ] Turn off Wi-Fi -> "Offline" indicator appears (see [PREREQUISITES.md - OfflineIndicator](./PREREQUISITES.md#10-offlineindicator-component))
- [ ] Create draft -> fill parameters -> attach 2 images -> save
- [ ] All data in SQLCipher (verify with `sqlcipher` CLI + correct key)
- [ ] Images encrypted on disk (`.enc` extension, unreadable without DPAPI)
- [ ] Turn on Wi-Fi -> draft still visible
- [ ] Online drafts continue working through the Fastify API
- [ ] Audit log has `DRAFT_CREATED`, `DRAFT_UPDATED`, `IMAGE_ATTACHED` entries

---

## Phase 4 — Sync Engine

**Goal:** Push local drafts, images, and audit logs to the server when connectivity returns. Check device status on every sync cycle.

### 4.1 Sync engine (`src/main/sync-engine.ts`)

```typescript
import type Database from '@journeyapps/sqlcipher'
import { readImageDecrypted } from './file-store'
import { auditLog } from './audit'
import { checkDeviceStatus } from './device'

interface SyncResult {
  drafts: { synced: number; failed: number }
  images: { synced: number; failed: number }
  auditLogs: { synced: number }
}

export class SyncEngine {
  private syncing = false

  constructor(
    private db: Database.Database,
    private apiBase: string,
    private getAuthToken: () => Promise<string>,
    private deviceId: string,
    private userId: string,
  ) {}

  async run(): Promise<SyncResult> {
    if (this.syncing) return { drafts: { synced: 0, failed: 0 }, images: { synced: 0, failed: 0 }, auditLogs: { synced: 0 } }
    this.syncing = true

    const result: SyncResult = {
      drafts: { synced: 0, failed: 0 },
      images: { synced: 0, failed: 0 },
      auditLogs: { synced: 0 },
    }

    try {
      const token = await this.getAuthToken()

      // 1. Check device status (may trigger wipe)
      const status = await checkDeviceStatus(this.apiBase, token)
      if (status.status !== 'ACTIVE') return result

      auditLog(this.db, {
        userId: this.userId, deviceId: this.deviceId,
        action: 'SYNC_STARTED', entityType: 'sync',
      })

      // 2. Process draft sync queue
      result.drafts = await this.syncDrafts(token)

      // 3. Upload unsynced images
      result.images = await this.syncImages(token)

      // 4. Push audit logs to server
      result.auditLogs = await this.syncAuditLogs(token)

      // 5. Update device last-sync timestamp on server
      await fetch(`${this.apiBase}/api/devices/${this.deviceId}/heartbeat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => {})

      // 6. Replenish one-time codes if running low (<10 remaining)
      await this.replenishCodesIfNeeded(token)

      auditLog(this.db, {
        userId: this.userId, deviceId: this.deviceId,
        action: 'SYNC_COMPLETED', entityType: 'sync',
        metadata: result,
      })
    } catch (err) {
      auditLog(this.db, {
        userId: this.userId, deviceId: this.deviceId,
        action: 'SYNC_FAILED', entityType: 'sync',
        metadata: { error: String(err) },
      })
    } finally {
      this.syncing = false
    }

    return result
  }

  private async syncDrafts(token: string): Promise<{ synced: number; failed: number }> {
    let synced = 0, failed = 0

    const pending = this.db.prepare(
      `SELECT * FROM sync_queue WHERE status IN ('PENDING', 'FAILED')
       AND retries < max_retries ORDER BY created_at ASC`
    ).all() as any[]

    for (const item of pending) {
      this.db.prepare(`UPDATE sync_queue SET status = 'IN_PROGRESS' WHERE id = ?`).run(item.id)

      try {
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        const payload = JSON.parse(item.payload)
        let serverId: string | undefined

        switch (item.action) {
          case 'CREATE': {
            const res = await fetch(`${this.apiBase}/api/certificates`, {
              method: 'POST', headers, body: JSON.stringify(payload),
            })
            if (!res.ok) throw new Error(`Create failed: ${res.status} ${await res.text()}`)
            serverId = (await res.json()).id
            break
          }
          case 'UPDATE': {
            const draft = this.db.prepare('SELECT server_id FROM drafts WHERE id = ?').get(item.draft_id) as any
            if (!draft?.server_id) throw new Error('Cannot update: no server_id')
            const res = await fetch(`${this.apiBase}/api/certificates/${draft.server_id}`, {
              method: 'PUT', headers, body: JSON.stringify(payload),
            })
            if (!res.ok) throw new Error(`Update failed: ${res.status}`)
            break
          }
          case 'SUBMIT': {
            const draft = this.db.prepare('SELECT server_id FROM drafts WHERE id = ?').get(item.draft_id) as any
            if (!draft?.server_id) throw new Error('Cannot submit: no server_id')
            const res = await fetch(`${this.apiBase}/api/certificates/${draft.server_id}/submit`, {
              method: 'POST', headers,
            })
            if (!res.ok) throw new Error(`Submit failed: ${res.status}`)
            break
          }
        }

        // Mark synced
        this.db.prepare(`UPDATE sync_queue SET status = 'SYNCED', processed_at = datetime('now') WHERE id = ?`).run(item.id)

        if (serverId) {
          this.db.prepare(`UPDATE drafts SET status = 'SYNCED', synced_at = datetime('now'), server_id = ? WHERE id = ?`)
            .run(serverId, item.draft_id)
        } else {
          this.db.prepare(`UPDATE drafts SET status = 'SYNCED', synced_at = datetime('now') WHERE id = ?`)
            .run(item.draft_id)
        }

        synced++
      } catch (err) {
        this.db.prepare(
          `UPDATE sync_queue SET status = 'FAILED', retries = retries + 1, last_error = ? WHERE id = ?`
        ).run(String(err), item.id)
        failed++
      }
    }

    return { synced, failed }
  }

  private async syncImages(token: string): Promise<{ synced: number; failed: number }> {
    let synced = 0, failed = 0

    // Only sync images for drafts that have a server_id
    const unsyncedImages = this.db.prepare(
      `SELECT di.*, d.server_id FROM draft_images di
       JOIN drafts d ON d.id = di.draft_id
       WHERE di.synced = 0 AND d.server_id IS NOT NULL`
    ).all() as any[]

    for (const img of unsyncedImages) {
      try {
        const buffer = readImageDecrypted(img.local_path)
        if (!buffer) { failed++; continue }

        const formData = new FormData()
        formData.append('file', new Blob([buffer], { type: img.mime_type }), img.original_name)
        formData.append('metadata', JSON.stringify({
          imageType: img.image_type,
          masterInstrumentIndex: img.master_instrument_index,
          parameterIndex: img.parameter_index,
          pointNumber: img.point_number,
          caption: img.caption,
        }))

        const res = await fetch(`${this.apiBase}/api/certificates/${img.server_id}/images`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        })

        if (res.ok) {
          this.db.prepare('UPDATE draft_images SET synced = 1 WHERE id = ?').run(img.id)
          synced++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    return { synced, failed }
  }

  private async syncAuditLogs(token: string): Promise<{ synced: number }> {
    const unsynced = this.db.prepare(
      'SELECT * FROM audit_log WHERE synced = 0 ORDER BY timestamp ASC LIMIT 500'
    ).all() as any[]

    if (unsynced.length === 0) return { synced: 0 }

    try {
      const res = await fetch(`${this.apiBase}/api/devices/${this.deviceId}/audit-logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: unsynced }),
      })

      if (res.ok) {
        // Mark as synced (only the synced flag, audit trigger allows this)
        const stmt = this.db.prepare('UPDATE audit_log SET synced = 1 WHERE id = ?')
        for (const log of unsynced) stmt.run(log.id)
        return { synced: unsynced.length }
      }
    } catch { /* Will retry next cycle */ }

    return { synced: 0 }
  }

  private async replenishCodesIfNeeded(token: string): Promise<void> {
    const remaining = (this.db.prepare(
      'SELECT COUNT(*) as cnt FROM offline_codes WHERE used = 0'
    ).get() as any).cnt

    if (remaining >= 10) return // Enough codes remaining

    try {
      // Request new batch from server
      const res = await fetch(`${this.apiBase}/api/offline-codes/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      })

      if (res.ok) {
        const { batchId, codes } = await res.json()

        // Clear old codes from local DB
        this.db.prepare('DELETE FROM offline_codes').run()

        // Insert new code hashes
        const stmt = this.db.prepare(
          'INSERT INTO offline_codes (id, code_hash, sequence, batch_id) VALUES (?, ?, ?, ?)'
        )
        const crypto = require('crypto')
        const tx = this.db.transaction(() => {
          for (const c of codes) {
            const hash = crypto.createHash('sha256')
              .update(c.code.toUpperCase().replace(/-/g, ''))
              .digest('hex')
            stmt.run(crypto.randomUUID(), hash, c.sequence, batchId)
          }
        })
        tx()

        auditLog(this.db, {
          userId: this.userId, deviceId: this.deviceId,
          action: 'CODES_REPLENISHED', entityType: 'auth',
          metadata: { batchId, count: codes.length },
        })
      }
    } catch { /* Will retry next sync cycle */ }
  }
}
```

### 4.2 Connectivity polling + sync trigger (in `src/main/index.ts`)

```typescript
import { net, BrowserWindow } from 'electron'
import { SyncEngine } from './sync-engine'
import { enforceRetentionPolicy, checkInactivityWipe } from './security'

let syncEngine: SyncEngine

// After successful auth + DB unlock:
function startSyncLoop(mainWindow: BrowserWindow) {
  // Poll every 30 seconds
  setInterval(async () => {
    const online = net.isOnline()
    mainWindow.webContents.send('app:connectivity-changed', online)

    if (online && syncEngine) {
      const result = await syncEngine.run()
      mainWindow.webContents.send('sync:progress', {
        pending: result.drafts.failed,
        synced: result.drafts.synced,
        failed: result.drafts.failed,
        imagesPending: result.images.failed,
      })
    }
  }, 30_000)

  // Enforce retention on startup
  try {
    enforceRetentionPolicy(getDb())
  } catch { /* DB may not be open yet */ }
}
```

### 4.3 Verification

- [ ] Create 3 drafts offline, each with 2 images
- [ ] Reconnect -> sync engine runs within 30 seconds
- [ ] All 3 drafts appear on server (check admin dashboard)
- [ ] All 6 images uploaded to GCS
- [ ] Audit logs synced to `DeviceAuditLog` table on server
- [ ] Device heartbeat updated
- [ ] Kill Wi-Fi mid-sync -> partially synced items resume on reconnect
- [ ] After 5 retries, failed items stop retrying
- [ ] Device status check runs before sync (REVOKED -> wipe)
- [ ] One-time codes replenished when <10 remaining (on sync)

---

## Phase 5 — Reference Data Pre-Cache

**Goal:** Cache master instruments and customers in SQLCipher so offline dropdowns work.

### 5.1 Pre-cache on login

```typescript
export async function preCacheReferenceData(
  db: Database.Database,
  apiBase: string,
  token: string,
  userId: string,
  deviceId: string,
): Promise<void> {
  // Cache master instruments
  const instRes = await fetch(`${apiBase}/api/master-instruments?limit=9999`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (instRes.ok) {
    const { items } = await instRes.json()
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO ref_master_instruments (id, data, cached_at) VALUES (?, ?, datetime('now'))"
    )
    const tx = db.transaction(() => { for (const i of items) stmt.run(i.id, JSON.stringify(i)) })
    tx()
  }

  // Cache customers
  const custRes = await fetch(`${apiBase}/api/customers?limit=9999`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (custRes.ok) {
    const { items } = await custRes.json()
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO ref_customers (id, data, cached_at) VALUES (?, ?, datetime('now'))"
    )
    const tx = db.transaction(() => { for (const c of items) stmt.run(c.id, JSON.stringify(c)) })
    tx()
  }

  auditLog(db, { userId, deviceId, action: 'REF_DATA_CACHED', entityType: 'sync' })
}
```

### 5.2 IPC handlers for cached data

```typescript
// In ipc-handlers.ts
ipcMain.handle('ref:master-instruments', async () => {
  const db = getDb()
  if (net.isOnline()) {
    // Try fresh data, fall back to cache
    try {
      const token = await getAuthToken()
      const res = await fetch(`${apiBase}/api/master-instruments?limit=9999`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (res.ok) {
        const { items } = await res.json()
        // Update cache in background
        const stmt = db.prepare(
          "INSERT OR REPLACE INTO ref_master_instruments (id, data, cached_at) VALUES (?, ?, datetime('now'))"
        )
        db.transaction(() => { for (const i of items) stmt.run(i.id, JSON.stringify(i)) })()
        return items
      }
    } catch { /* Fall through to cache */ }
  }

  // Return cached data
  return db.prepare('SELECT data FROM ref_master_instruments')
    .all()
    .map((r: any) => JSON.parse(r.data))
})
```

### 5.3 Refresh schedule

| Trigger | Action |
|---------|--------|
| App launch (online) | Full refresh |
| Every 4 hours (online) | Background refresh |
| Manual sync button | Full refresh |
| After successful login | Full refresh |

### 5.4 Verification

- [ ] Login online -> `ref_master_instruments` and `ref_customers` populated in SQLCipher
- [ ] Go offline -> create draft -> instrument dropdown works from cache
- [ ] Customer dropdown works from cache
- [ ] Come back online -> reference data refreshes in background

---

## Build, Signing & Distribution

### Code Signing (SOC 2 CC8.1 / ISO A.14.2.6)

You need an **EV Code Signing Certificate** to:
- Eliminate Windows SmartScreen "Unknown Publisher" warnings
- Prove the binary is from HTA Calibr8s (tamper evident)
- Meet compliance requirements for software integrity

Providers: DigiCert, Sectigo, GlobalSign (~$300-500/year for EV)

```yaml
# electron-builder.yml
appId: com.htacalibr8s.desktop
productName: HTA Calibr8s
win:
  target: nsis
  icon: resources/icon.ico
  signingHashAlgorithms: ['sha256']
  sign: ./sign.js                        # Custom signing script for EV cert
  
nsis:
  oneClick: false
  perMachine: true
  allowToChangeInstallationDirectory: false

directories:
  output: dist

extraResources:
  - from: ../web-hta/.next/standalone
    to: next-app
  - from: ../web-hta/.next/static
    to: next-app/.next/static
  - from: ../web-hta/public
    to: next-app/public

publish:
  provider: s3
  bucket: hta-desktop-releases
  region: ap-south-1
```

### Auto-Updates

```typescript
// In main/index.ts
import { autoUpdater } from 'electron-updater'

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify()
  // Check every 6 hours
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 6 * 60 * 60 * 1000)
})
```

### Build command

```bash
# Full production build
pnpm turbo build --filter=web-hta    # Build Next.js standalone
pnpm turbo build --filter=desktop    # Compile TypeScript
cd apps/desktop && npx electron-builder --win   # Package + sign
# Output: apps/desktop/dist/HTA Calibr8s Setup x.x.x.exe
```

---

## Device Lifecycle Management

### Admin Dashboard Additions

Add a "Registered Devices" section to the admin dashboard:

| Column | Source |
|--------|--------|
| Device Name | `DeviceRegistration.deviceName` |
| Engineer | `User.name` via `userId` |
| Last Sync | `DeviceRegistration.lastSyncAt` |
| Status | ACTIVE / REVOKED |
| Actions | Revoke, Wipe |

**Revoke**: Sets status to `REVOKED`. Next sync cycle, device wipes all data and locks out.

**Wipe**: Sets status to `WIPE_PENDING`. Next sync cycle, device wipes and confirms back to server.

> Device API endpoints are defined in [PREREQUISITES.md - Device API Routes](./PREREQUISITES.md#4-device-api-routes).

---

## Compliance Mapping

### SOC 2 Type II

| Criteria | Control | Implementation |
|----------|---------|----------------|
| CC6.1 | Logical access controls | Password + one-time code 2FA + device binding + PBKDF2 key derivation |
| CC6.3 | Authentication | Online JWT (15min/30d desktop) + offline password + one-time code unlock |
| CC6.5 | Data disposal | Secure overwrite + auto-wipe triggers (5 failed passwords, 30d inactivity, remote wipe) |
| CC6.6 | Transmission security | TLS 1.3 + certificate pinning |
| CC7.2 | Monitoring | Append-only audit log synced to server |
| CC7.3 | Incident response | Remote wipe via admin dashboard |
| CC8.1 | Change management | EV code-signed binaries + auto-updater |

### ISO 27001 Annex A

| Control | Name | Implementation |
|---------|------|----------------|
| A.8.3.2 | Disposal of media | Secure wipe (random overwrite + unlink) |
| A.9.1.2 | Access to networks | Device registration + admin revocation |
| A.9.4.2 | Secure log-on | Password + one-time code 2FA + lockout after 5 failures |
| A.10.1.1 | Cryptographic controls | SQLCipher AES-256 + DPAPI + AES-GCM token encryption |
| A.12.4.1 | Event logging | Append-only local audit + server sync (7-year retention) |
| A.14.2.6 | Secure development | Code signing + dependency audit |
| A.16.1.5 | Response to incidents | Remote wipe capability |

---

## Verification Checklist

### Security

- [ ] SQLCipher DB encrypted (open with hex editor -> ciphertext)
- [ ] Wrong password cannot open DB (`SQLITE_NOTADB` error)
- [ ] 5 failed passwords -> full data wipe (DB + images + credentials gone)
- [ ] Offline unlock requires both password and challenge-response code from printed grid card
- [ ] Used one-time codes cannot be reused
- [ ] One-time codes replenished on sync when <10 remaining
- [ ] Images encrypted on disk (`.enc` files unreadable)
- [ ] safeStorage encryption tied to Windows user (different user can't decrypt)
- [ ] Audit log append-only (UPDATE/DELETE rejected by triggers)
- [ ] TLS certificate pinning active (MITM proxy blocked)
- [ ] Code-signed installer (no SmartScreen warning)
- [ ] 30-day inactivity -> auto-wipe on next launch
- [ ] Remote wipe from admin -> device data destroyed on next sync

### Functional

- [ ] Online: all features work identically to browser
- [ ] Offline: create/edit/save drafts with parameters and images
- [ ] Reconnect: sync engine pushes all data to server within 30s
- [ ] Sync: drafts, images, and audit logs all reach server
- [ ] Retry: failed syncs retry up to 5 times, then stop
- [ ] Cache: instrument/customer dropdowns work offline
- [ ] Password + code: setup on first login, full 2FA on subsequent offline launches
- [ ] Password-only: idle timeout re-entry after 1 hour (no code consumed)
- [ ] 24h session: full password + code required after 24 hours of continuous use
