# Electron Offline App — Prerequisites

All existing codebase changes required **before** building the `apps/desktop/` Electron app. These changes add device management, offline one-time codes, desktop token support, and Electron-aware hooks to the current HTA Platform.

> **Companion doc:** After completing these prerequisites, see [README.md](./README.md) for the Electron app architecture and implementation phases.

---

## Table of Contents

1. [Prisma Schema](#1-prisma-schema)
2. [Refresh Token Service](#2-refresh-token-service)
3. [Auth Middleware](#3-auth-middleware)
4. [Device API Routes](#4-device-api-routes)
5. [Offline Codes API Routes](#5-offline-codes-api-routes)
6. [Cron Job — 30-Day Code Refresh](#6-cron-job--30-day-code-refresh)
7. [Engineer Offline Codes Page](#7-engineer-offline-codes-page)
8. [Sidebar Navigation](#8-sidebar-navigation)
9. [api-client.ts Offline Hook](#9-api-clientts-offline-hook)
10. [OfflineIndicator Component](#10-offlineindicator-component)
11. [turbo.json](#11-turbojson)
12. [Implementation Order](#implementation-order)
13. [Verification Checklist](#verification-checklist)

---

## 1. Prisma Schema

**File:** `packages/database/prisma/schema.prisma`

Add four new models before the enums section (~line 878). These support device registration, device-level audit logging, and pre-generated one-time offline codes.

### New Models

```prisma
// ── DEVICE MANAGEMENT ────────────────────────────────

model DeviceRegistration {
  id           String    @id @default(cuid())
  tenantId     String
  tenant       Tenant    @relation(fields: [tenantId], references: [id])
  userId       String
  user         User      @relation(fields: [userId], references: [id])
  deviceId     String    @unique
  deviceName   String
  platform     String
  appVersion   String?
  status       String    @default("ACTIVE") // ACTIVE | REVOKED | WIPE_PENDING | WIPED
  lastSyncAt   DateTime?
  registeredAt DateTime  @default(now())
  wipedAt      DateTime?

  @@index([tenantId])
  @@index([userId])
}

model DeviceAuditLog {
  id         String   @id @default(cuid())
  tenantId   String
  deviceId   String
  userId     String
  action     String
  entityType String?
  entityId   String?
  metadata   Json?
  occurredAt DateTime   // Timestamp from device (not server received time)
  receivedAt DateTime @default(now())

  @@index([tenantId, deviceId])
  @@index([tenantId, userId])
  @@index([occurredAt])
}

model OfflineCodeBatch {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  codes     OfflineCode[]
  isActive  Boolean  @default(true)   // false when superseded by new batch
  createdAt DateTime @default(now())
  expiresAt DateTime                   // 30 days from creation

  @@index([tenantId, userId])
  @@index([userId, isActive])
}

model OfflineCode {
  id       String   @id @default(cuid())
  batchId  String
  batch    OfflineCodeBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  codeHash String            // SHA-256 hash of the plaintext code
  sequence Int               // Display order (1-50) on printed sheet
  used     Boolean  @default(false)
  usedAt   DateTime?

  @@index([batchId, used])
  @@unique([batchId, sequence])
}
```

### Relation Fields on Existing Models

Add to the **User** model:

```prisma
devices            DeviceRegistration[]
offlineCodeBatches OfflineCodeBatch[]
```

Add to the **Tenant** model:

```prisma
devices DeviceRegistration[]
```

Add to the **RefreshToken** model:

```prisma
deviceId String?   // Present only for desktop tokens (bound to device)
```

### Migration

```bash
npx prisma migrate dev --name add-device-management-and-offline-codes
```

---

## 2. Refresh Token Service

**File:** `apps/api/src/services/refresh-token.ts`

The current service uses a single 7-day expiry for all tokens. Desktop tokens need a 30-day expiry and device binding.

### Changes

**Config** — split into web vs desktop expiry:

```typescript
export const REFRESH_TOKEN_CONFIG = {
  WEB_EXPIRY:     7 * 24 * 60 * 60 * 1000,   // 7 days (existing)
  DESKTOP_EXPIRY: 30 * 24 * 60 * 60 * 1000,   // 30 days (new)
  accessTokenExpiresInMs: 15 * 60 * 1000,      // 15 minutes (unchanged)
  tokenBytes: 32,                               // 256 bits (unchanged)
}
```

**`RefreshTokenPayload`** — add optional fields:

```typescript
export interface RefreshTokenPayload {
  userId?: string
  customerId?: string
  userType: 'STAFF' | 'CUSTOMER'
  tenantId: string
  userAgent?: string
  ipAddress?: string
  tokenType?: 'web' | 'desktop'   // NEW — defaults to 'web'
  deviceId?: string                // NEW — required when tokenType is 'desktop'
}
```

**`createRefreshToken()`** — use desktop expiry and store `deviceId`:

```typescript
export async function createRefreshToken(
  payload: RefreshTokenPayload
): Promise<RefreshTokenResult> {
  const rawToken = generateToken()
  const hashedToken = hashToken(rawToken)

  const expiresInMs = payload.tokenType === 'desktop'
    ? REFRESH_TOKEN_CONFIG.DESKTOP_EXPIRY
    : REFRESH_TOKEN_CONFIG.WEB_EXPIRY
  const expiresAt = new Date(Date.now() + expiresInMs)

  await prisma.refreshToken.create({
    data: {
      token: hashedToken,
      userId: payload.userId,
      customerId: payload.customerId,
      userType: payload.userType,
      tenantId: payload.tenantId,
      expiresAt,
      userAgent: payload.userAgent,
      ipAddress: payload.ipAddress,
      deviceId: payload.deviceId ?? null,   // Store device binding
    },
  })

  return { refreshToken: rawToken, expiresAt }
}
```

**`validateRefreshToken()`** — add optional `deviceId` verification:

```typescript
export async function validateRefreshToken(
  rawToken: string,
  expectedDeviceId?: string
): Promise<ValidatedToken | null> {
  const hashedToken = hashToken(rawToken)

  const token = await prisma.refreshToken.findFirst({
    where: {
      token: hashedToken,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
  })

  if (!token) return null

  // If token is device-bound, verify the device matches
  if (token.deviceId && expectedDeviceId && token.deviceId !== expectedDeviceId) {
    return null
  }

  return {
    userId: token.userId || undefined,
    customerId: token.customerId || undefined,
    userType: token.userType as 'STAFF' | 'CUSTOMER',
    tenantId: token.tenantId,
    tokenId: token.id,
  }
}
```

---

## 3. Auth Middleware

**File:** `apps/api/src/middleware/auth.ts`

Add optional `deviceId` to the JWT payload interface. No logic changes — existing guards (`requireAuth`, `requireStaff`, `requireAdmin`, `requireMasterAdmin`, `optionalAuth`) continue working unchanged.

```typescript
export interface JWTPayload {
  sub: string
  email: string
  name: string
  role: 'ADMIN' | 'ENGINEER' | 'CUSTOMER'
  userType: 'STAFF' | 'CUSTOMER'
  tenantId: string
  isAdmin?: boolean
  adminType?: 'MASTER' | 'WORKER' | null
  deviceId?: string     // NEW — present only for desktop app tokens
  iat: number
  exp: number
}
```

Device routes read `request.user.deviceId` when needed. This field is omitted for web tokens, so no existing functionality is affected.

---

## 4. Device API Routes

**File:** `apps/api/src/routes/devices/index.ts` — **CREATE**

Follow the existing `FastifyPluginAsync` pattern (same as `admin/index.ts`). Register in the app alongside existing route registrations:

```typescript
fastify.register(deviceRoutes, { prefix: '/api/devices' })
```

### Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/devices/register` | POST | `requireStaff` | Register device, create first code batch, return 30-day desktop token |
| `/api/devices` | GET | `requireAdmin` | List all devices (admin dashboard) |
| `/api/devices/:deviceId/status` | GET | `requireStaff` | Return device status |
| `/api/devices/:deviceId/heartbeat` | POST | `requireStaff` | Update `lastSyncAt` |
| `/api/devices/:deviceId/revoke` | POST | `requireAdmin` | Set status = `REVOKED` |
| `/api/devices/:deviceId/wipe` | POST | `requireAdmin` | Set status = `WIPE_PENDING` |
| `/api/devices/:deviceId/confirm-wipe` | POST | `requireStaff` | Set status = `WIPED`, set `wipedAt` |
| `/api/devices/:deviceId/audit-logs` | POST | `requireStaff` | Bulk insert `DeviceAuditLog` entries |

### Register Endpoint Details

```typescript
// POST /api/devices/register
// Body: { deviceId, deviceName, platform, appVersion }
// Returns: { device: DeviceRegistration, token: { refreshToken, expiresAt } }

// 1. Create DeviceRegistration record
// 2. Generate first offline code batch (50 codes) — see Step 5
// 3. Create desktop refresh token (30-day, device-bound) — see Step 2
// 4. Return device record + token + plaintext codes
```

---

## 5. Offline Codes API Routes

**File:** `apps/api/src/routes/devices/codes.ts` — **CREATE**

Register under the `/api/offline-codes` prefix.

### Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/offline-codes` | GET | `requireStaff` | Get current active batch for the logged-in engineer (used/unused counts, expiry — **no plaintext codes**) |
| `/api/offline-codes/generate` | POST | `requireStaff` | Generate a new batch of 50 codes, deactivate old batch, return plaintext codes (shown **once**) |
| `/api/offline-codes/validate` | POST | `requireStaff` | Validate a code hash (used by Electron app during sync to verify codes haven't been revoked server-side) |

### Code Generation Logic

```
1. Generate 50 random 8-char alphanumeric codes (formatted: XXXX-XXXX, e.g., A3K9-BX7P)
2. SHA-256 hash each code
3. Create OfflineCodeBatch record (expiresAt = now + 30 days)
4. Create 50 OfflineCode records (hashes only — plaintext never stored)
5. Deactivate any previous active batch for this user (isActive = false)
6. Return plaintext codes in response (displayed once on the page, printable)
```

Each engineer can only have **one active batch** at a time. Generating a new batch invalidates the old one.

### GET Response Shape

```json
{
  "batchId": "clx...",
  "isActive": true,
  "createdAt": "2026-04-29T10:00:00Z",
  "expiresAt": "2026-05-29T10:00:00Z",
  "total": 50,
  "used": 12,
  "remaining": 38
}
```

### POST /generate Response Shape

```json
{
  "batchId": "clx...",
  "expiresAt": "2026-05-29T10:00:00Z",
  "codes": [
    { "sequence": 1, "code": "A3K9-BX7P" },
    { "sequence": 2, "code": "D7F2-JK5L" },
    ...
    { "sequence": 50, "code": "Z9Y3-WX1V" }
  ]
}
```

---

## 6. Cron Job — 30-Day Code Refresh

**File:** `apps/worker/src/jobs/cleanup.ts` — **MODIFY**

Add `cleanupExpiredOfflineCodes()` to the existing `Promise.allSettled` array inside `runScheduledCleanup()`:

```typescript
export async function runScheduledCleanup(): Promise<void> {
  console.log('[Cleanup] Running scheduled cleanup...')

  const results = await Promise.allSettled([
    cleanupExpiredTokens(),
    cleanupOldNotifications(90, true),
    cleanupExpiredReviews(),
    cleanupExpiredOfflineCodes(),   // NEW
  ])

  const summary = results.map((r, i) => {
    const tasks = ['tokens', 'notifications', 'expired-reviews', 'offline-codes']
    if (r.status === 'fulfilled') {
      return `${tasks[i]}: ${r.value.deleted} deleted`
    }
    return `${tasks[i]}: failed`
  })

  console.log(`[Cleanup] Scheduled cleanup complete: ${summary.join(', ')}`)
}
```

### `cleanupExpiredOfflineCodes()` Logic

```typescript
async function cleanupExpiredOfflineCodes(): Promise<{ deleted: number }> {
  // 1. Find all OfflineCodeBatch where expiresAt < now AND isActive = true
  const expiredBatches = await prisma.offlineCodeBatch.findMany({
    where: { isActive: true, expiresAt: { lt: new Date() } },
    include: { user: { select: { id: true, email: true, name: true } } },
  })

  let deleted = 0

  for (const batch of expiredBatches) {
    // 2. Deactivate the expired batch
    await prisma.offlineCodeBatch.update({
      where: { id: batch.id },
      data: { isActive: false },
    })
    deleted++

    // 3. Check if user has an active device
    const activeDevice = await prisma.deviceRegistration.findFirst({
      where: { userId: batch.userId, status: 'ACTIVE' },
    })

    if (activeDevice) {
      // 4. Auto-generate a NEW batch (50 codes, 30-day expiry)
      await generateNewCodeBatch(batch.userId, batch.tenantId)

      // 5. Queue notification email to engineer
      // "Your offline codes have expired. Log in to view your new codes."
      await queueOfflineCodesExpiryEmail(batch.user.email, batch.user.name)
    }
  }

  return { deleted }
}
```

This runs on the existing 15-minute cleanup interval. Engineers with active devices automatically get a fresh batch + email notification to print codes before their next onsite visit.

---

## 7. Engineer Offline Codes Page

**File:** `apps/web-hta/src/app/(dashboard)/dashboard/offline-codes/page.tsx` — **CREATE**

Self-service page where each engineer generates, views, and prints their own one-time codes. No code sharing — each batch is exclusive to the authenticated engineer.

### Page Layout

```
+-------------------------------------------------------------+
|  Offline Access Codes                                        |
|  Your personal one-time codes for offline app access         |
|                                                              |
|  +--- Current Batch -----------------------------------------+
|  |                                                           |
|  |  Status: Active                                           |
|  |  Generated: 15 Apr 2026                                   |
|  |  Expires: 15 May 2026                                     |
|  |  Codes remaining: 38 of 50                                |
|  |                                                           |
|  |  Warning: Codes are shown only once when generated.       |
|  |  Print or save them before leaving this page.             |
|  |                                                           |
|  +-----------------------------------------------------------+
|                                                              |
|  [Generate New Codes]    [Print Code Sheet]                  |
|                                                              |
|  +--- Code Sheet (visible after generate) -------------------+
|  |                                                           |
|  |  HTA Calibr8s -- Offline Access Codes                     |
|  |  Engineer: Rajesh Kumar                                   |
|  |  Generated: 29 Apr 2026                                   |
|  |  Expires: 29 May 2026                                     |
|  |                                                           |
|  |   1. A3K9-BX7P    14. M2N8-QR4T    27. ...               |
|  |   2. D7F2-JK5L    15. P6S1-UV8W    28. ...               |
|  |   3. G4H8-MN2P    16. ...          29. ...               |
|  |   ...              ...              ...                   |
|  |  50. Z9Y3-WX1V                                           |
|  |                                                           |
|  |  Warning: Each code can only be used once.                |
|  |  Warning: Keep this sheet secure -- treat like a password.|
|  |                                                           |
|  +-----------------------------------------------------------+
|                                                              |
|  +--- Registered Devices ------------------------------------+
|  |                                                           |
|  |  DESKTOP-RK01   Windows   Last sync: 2h ago   Active     |
|  |                                                           |
|  +-----------------------------------------------------------+
+-------------------------------------------------------------+
```

### Behavior

| Action | API Call | Result |
|--------|----------|--------|
| Page load | `GET /api/offline-codes` | Show batch status (remaining count, expiry) |
| "Generate New Codes" | `POST /api/offline-codes/generate` | Show plaintext codes in printable card format |
| "Print Code Sheet" | `window.print()` | Print-optimized CSS (hides sidebar, just the code grid) |
| Page load (devices) | `GET /api/devices` | Show engineer's own devices (filtered server-side) |

### UI Details

- Codes displayed in a **3-column grid**, formatted as `XXXX-XXXX` for easy reading
- **Warning banner** if <10 codes remaining
- **Warning banner** if batch expires within 7 days
- "Registered Devices" section at bottom: shows only the engineer's own devices
- Confirmation dialog before generating new codes (old batch will be invalidated)

### Access Control

Page only visible to users with role **ENGINEER** or **ADMIN**.

---

## 8. Sidebar Navigation

**File:** `apps/web-hta/src/components/layout/DashboardSidebar.tsx` — **MODIFY**

Add an "Offline Codes" nav item to the existing `navItems` array:

```typescript
const navItems = [
  { label: 'My Certificates', icon: FileText, href: '/dashboard', show: true },
  { label: 'Reviews', icon: ClipboardCheck, href: '/dashboard/reviewer', show: userRole === 'ENGINEER' || userRole === 'ADMIN' },
  { label: 'Offline Codes', icon: KeyRound, href: '/dashboard/offline-codes', show: userRole === 'ENGINEER' || userRole === 'ADMIN' },  // NEW
  { label: 'Notifications', icon: Bell, href: '/notifications', show: true, badge: unreadCount },
  { label: 'Settings', icon: Settings, href: '/settings', show: true },
].filter((item) => item.show)
```

- **Icon:** `KeyRound` from `lucide-react`
- **Visible to:** ENGINEER and ADMIN roles only
- **Position:** After "Reviews", before "Notifications"

---

## 9. api-client.ts Offline Hook

**File:** `apps/web-hta/src/lib/api-client.ts` — **MODIFY**

Add ~60 lines at the top of the file for Electron offline detection and IPC routing. Existing code is untouched — this only adds a 3-line early return in `apiFetch()`.

### Type Declaration (add at top of file)

```typescript
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean
      setup: (password: string, userId: string, refreshToken: string, accessToken: string, userProfile: Record<string, unknown>) => Promise<{ success: boolean; deviceId?: string; error?: string }>
      unlock: (password: string, challengeKey: string, responseValue: string) => Promise<{ success: boolean; refreshToken?: string; codesRemaining?: number; attemptsRemaining?: number; error?: string }>
      unlockPasswordOnly: (password: string) => Promise<{ success: boolean; attemptsRemaining?: number; error?: string }>
      getAuthStatus: () => Promise<{ isSetUp: boolean; isUnlocked: boolean; codesRemaining?: number; needsFullAuth?: boolean; challengeKey?: string }>
      getUserProfile: () => Promise<Record<string, unknown> | null>
      createDraft: (data: unknown) => Promise<unknown>
      saveDraft: (id: string, data: unknown) => Promise<unknown>
      getDraft: (id: string) => Promise<unknown>
      listDrafts: () => Promise<unknown[]>
      deleteDraft: (id: string) => Promise<void>
      saveImage: (draftId: string, meta: unknown, buffer: ArrayBuffer) => Promise<unknown>
      getImagePath: (imageId: string) => Promise<string>
      listImages: (draftId: string) => Promise<unknown[]>
      getSyncStatus: () => Promise<{ pending: number; synced: number; failed: number }>
      triggerSync: () => Promise<void>
      getMasterInstruments: () => Promise<unknown[]>
      getCustomers: () => Promise<unknown[]>
      getOnlineStatus: () => Promise<boolean>
      onConnectivityChange: (cb: (online: boolean) => void) => () => void
      onSyncProgress: (cb: (progress: unknown) => void) => () => void
    }
  }
}
```

### Helper Functions (add before `apiFetch`)

```typescript
function isElectronOffline(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.electronAPI?.isElectron &&
    !navigator.onLine
  )
}

function isDraftRoute(url: string): boolean {
  return (
    url.includes('/api/certificates') &&
    !url.includes('/download') &&
    !url.includes('/send-to-customer') &&
    !url.includes('/approve') &&
    !url.includes('/authorize') &&
    !url.includes('/submit')
  )
}

async function handleOfflineRequest(url: string, options?: RequestInit): Promise<Response> {
  const api = window.electronAPI!
  const method = (options?.method || 'GET').toUpperCase()
  const body = options?.body ? JSON.parse(options.body as string) : undefined

  let result: unknown
  const certMatch = url.match(/\/api\/certificates\/([^/?]+)/)
  const certId = certMatch?.[1]

  if (method === 'POST' && !certId) {
    result = await api.createDraft(body)
  } else if (method === 'PUT' && certId) {
    result = await api.saveDraft(certId, body)
  } else if (method === 'GET' && certId) {
    result = await api.getDraft(certId)
  } else if (method === 'GET' && !certId) {
    result = await api.listDrafts()
  } else if (method === 'DELETE' && certId) {
    await api.deleteDraft(certId)
    result = { success: true }
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

### Early Return in `apiFetch()` (add at top of function body)

```typescript
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Offline Electron interception — route draft CRUD through IPC
  if (typeof input === 'string' && isElectronOffline() && isDraftRoute(input)) {
    return handleOfflineRequest(input, init)
  }

  // ... existing online flow unchanged ...
}
```

The Zustand stores (`certificate-store.ts`, etc.) call `apiFetch()` and are transparently intercepted when offline. No store changes needed.

---

## 10. OfflineIndicator Component

### Component

**File:** `apps/web-hta/src/components/OfflineIndicator.tsx` — **CREATE**

~40-line client component. Shows connectivity + sync status pill in the bottom-right corner. Self-hides when not running inside Electron.

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'

export function OfflineIndicator() {
  const [online, setOnline] = useState(true)
  const [syncStatus, setSyncStatus] = useState<{ pending: number; failed: number } | null>(null)

  useEffect(() => {
    if (!window.electronAPI?.isElectron) return

    setOnline(navigator.onLine)
    const cleanupConn = window.electronAPI.onConnectivityChange(setOnline)
    const cleanupSync = window.electronAPI.onSyncProgress((progress: any) => {
      setSyncStatus(progress)
    })

    return () => { cleanupConn(); cleanupSync() }
  }, [])

  if (typeof window === 'undefined' || !window.electronAPI?.isElectron) return null

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg border ${
      online
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-red-50 text-red-700 border-red-200'
    }`}>
      {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
      <span>{online ? 'Online' : 'Offline'}</span>
      {syncStatus && syncStatus.pending > 0 && (
        <>
          <span className="text-gray-300">|</span>
          <RefreshCw className="size-3 animate-spin" />
          <span>{syncStatus.pending} pending</span>
        </>
      )}
    </div>
  )
}
```

### Layout Mount

**File:** `apps/web-hta/src/app/layout.tsx` — **MODIFY**

Add `<OfflineIndicator />` alongside the existing `<CookieConsent />`:

```typescript
import { OfflineIndicator } from '@/components/OfflineIndicator'

// In the body:
<SessionProvider>{children}</SessionProvider>
<CookieConsent />
<OfflineIndicator />    {/* NEW */}
```

---

## 11. turbo.json

**File:** `turbo.json` — **MODIFY**

Add a `desktop:build` task with dependency on `web-hta#build` (Electron needs the Next.js standalone output):

```json
{
  "tasks": {
    "desktop:build": {
      "dependsOn": ["web-hta#build"],
      "outputs": ["dist/**"]
    }
  }
}
```

`pnpm-workspace.yaml` already has `apps/*` — `apps/desktop` will be auto-included when the Electron package is created.

---

## Implementation Order

| # | What | Files | Dependencies |
|---|------|-------|-------------|
| 1 | Prisma schema + migration | `packages/database/prisma/schema.prisma` | None |
| 2 | Refresh token service (30d desktop variant) | `apps/api/src/services/refresh-token.ts` | Step 1 |
| 3 | Auth middleware (deviceId in JWT) | `apps/api/src/middleware/auth.ts` | None |
| 4 | Device API routes | `apps/api/src/routes/devices/index.ts` (create) | Steps 1-3 |
| 5 | Offline codes API routes | `apps/api/src/routes/devices/codes.ts` (create) | Step 1 |
| 6 | Cron job (30-day code refresh) | `apps/worker/src/jobs/cleanup.ts` | Steps 1, 5 |
| 7 | Engineer "Offline Codes" page | `apps/web-hta/src/app/(dashboard)/dashboard/offline-codes/page.tsx` (create) | Step 5 |
| 8 | Sidebar nav item | `apps/web-hta/src/components/layout/DashboardSidebar.tsx` | Step 7 |
| 9 | api-client.ts offline hook | `apps/web-hta/src/lib/api-client.ts` | None (useful once Electron exists) |
| 10 | OfflineIndicator + layout | `apps/web-hta/src/components/OfflineIndicator.tsx` (create) + `apps/web-hta/src/app/layout.tsx` | None |
| 11 | turbo.json | `turbo.json` | None |

**Steps 1-8** are the core work. **Steps 9-11** are lightweight prep for the Electron app.

---

## Verification Checklist

### Schema & Migration

- [ ] `npx prisma migrate dev` succeeds without errors
- [ ] `npx prisma generate` produces updated client with new models
- [ ] DeviceRegistration, DeviceAuditLog, OfflineCodeBatch, OfflineCode models accessible via Prisma client
- [ ] RefreshToken now has optional `deviceId` field

### Type Checking

- [ ] `npx tsc --noEmit --project apps/api/tsconfig.json` passes
- [ ] `npx tsc --noEmit --project apps/web-hta/tsconfig.json` passes
- [ ] `npx tsc --noEmit --project apps/worker/tsconfig.json` passes

### Device API

- [ ] `POST /api/devices/register` creates device + returns status
- [ ] `GET /api/devices` returns device list (admin only)
- [ ] `GET /api/devices/:deviceId/status` returns ACTIVE/REVOKED/WIPE_PENDING
- [ ] `POST /api/devices/:deviceId/heartbeat` updates `lastSyncAt`
- [ ] `POST /api/devices/:deviceId/revoke` sets status to REVOKED (admin only)
- [ ] `POST /api/devices/:deviceId/wipe` sets status to WIPE_PENDING (admin only)
- [ ] `POST /api/devices/:deviceId/confirm-wipe` sets status to WIPED + sets `wipedAt`
- [ ] `POST /api/devices/:deviceId/audit-logs` bulk inserts DeviceAuditLog entries

### Offline Codes

- [ ] Engineer navigates to `/dashboard/offline-codes`
- [ ] "Generate New Codes" creates 50 codes, displays in printable format
- [ ] "Print Code Sheet" opens clean print layout (no sidebar, just codes)
- [ ] Generating again deactivates old batch, creates new active batch
- [ ] `GET /api/offline-codes` returns batch status with remaining/total count
- [ ] Non-engineer/non-admin users cannot access the page

### Cron Job

- [ ] After 30 days, cron deactivates expired batch
- [ ] Engineers with active devices get a fresh auto-generated batch
- [ ] Email notification sent to engineer about expired codes

### Refresh Tokens

- [ ] Web tokens still use 7-day expiry (no regression)
- [ ] Desktop tokens use 30-day expiry when `tokenType: 'desktop'`
- [ ] Desktop token validation checks `deviceId` binding

### Frontend Hooks

- [ ] `OfflineIndicator` renders nothing in browser (no Electron API)
- [ ] `apiFetch()` online behavior unchanged (no regression)
- [ ] Sidebar shows "Offline Codes" for ENGINEER/ADMIN roles
- [ ] Sidebar hides "Offline Codes" for other roles
