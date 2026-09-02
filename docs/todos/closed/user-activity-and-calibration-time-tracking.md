# User Activity And Calibration Time Tracking

Status: in progress

This document scopes four related but separate requirements. Each problem should be implemented independently enough that it can be tested and shipped without forcing the other three to be complete.

## Database Migration Ownership

Before implementing the new database-backed activity tables, Prisma migration ownership was normalized in a non-breaking way.

Current decision:

- `packages/database/prisma/schema.prisma` is the canonical schema for the shared `@hta/database` package.
- `packages/database/prisma/migrations/` is the canonical migration history for future migrations.
- `apps/web-hta/prisma/schema.prisma` remains as a compatibility mirror for now.
- `apps/web-hta/prisma/migrations/` remains as a compatibility copy of the old migration location for now.
- `pnpm db:schema:check` verifies both schema copies are still identical.

New migrations for this work should be created from the root/package database scripts, not from `apps/web-hta/prisma`.

## Problem 1: Auth Activity

Status: closed

### Requirement

Track who logged in and logged out, when it happened, and where it came from.

Required data:

- Tenant
- Staff user or customer user
- User type
- Event type: login success, login failure, logout, logout all, device provisioning lifecycle
- Timestamp
- IP address
- User agent
- Desktop device id when available

### Graphify And Codebase Review

Graphify query used:

```powershell
python -m graphify query "auth activity login logout refresh token audit user agent ip device id" --graph graphify-out\graph.json --budget 3000
python -m graphify query "device provisioning reprovisioning vpn provision confirm desktop device audit auth activity device id" --graph graphify-out\graph.json --budget 3500
```

Codebase review:

- `apps/api/src/routes/auth/index.ts`
  - Login creates refresh tokens and captures `ipAddress` and `userAgent`.
  - Logout revokes the refresh token with `revokedReason = LOGOUT`.
  - Logout-all revokes all user tokens with `revokedReason = LOGOUT_ALL`.
  - Password change creates an `AuditLog`, but normal login/logout does not create a clean auth event.
- `packages/database/prisma/schema.prisma`
  - `RefreshToken` has `createdAt`, `revokedAt`, `revokedReason`, `ipAddress`, `userAgent`, `deviceId`.
  - `AuditLog` is generic and has no first-class auth/session fields.
- `apps/api/src/routes/vpn/index.ts`
  - `/api/vpn/provision` accepts either admin one-time provisioning tokens (`HTA-...`) or re-provision tokens (`RPT-...`).
  - It creates/updates `VpnPeer`, rotates re-provision tokens, and returns WireGuard config.
  - `/api/vpn/confirm` clears the one-time provisioning token after the desktop has installed and verified the local tunnel.
  - This route currently has user/tenant context through the token, but does not know the desktop `deviceId`.
- `apps/api/src/routes/devices/index.ts`
  - `/api/devices/register` registers the desktop device after authenticated desktop setup.
  - It creates/updates `DeviceRegistration` and issues a desktop refresh token bound to `deviceId`.
  - `/api/devices/:deviceId/audit-logs` ingests detailed device/offline operational logs into `DeviceAuditLog`.
- `apps/desktop/src/main/vpn.ts`
  - `vpnProvision` generates/reuses the WireGuard keypair, calls `/api/vpn/provision`, installs/verifies the tunnel, then calls `/api/vpn/confirm`.
  - The VPN provisioning flow runs before normal authenticated device registration, so it does not naturally pass `deviceId` today.
- `apps/desktop/src/main/auth.ts`
  - `setupOfflineAuth` creates or reuses the desktop `deviceId`.
  - It writes local `AUTH_SETUP` entries to the desktop audit log.

### Current Coverage

Partially covered through `RefreshToken`.

We can infer:

- Login/session creation from refresh token creation.
- Logout from token revocation and `revokedReason`.
- IP/user agent from refresh token metadata.
- VPN peer provisioning from `VpnPeer.provisionedAt`.
- Device registration from `DeviceRegistration.registeredAt`.
- Detailed desktop operations from `DeviceAuditLog` after the desktop app is authenticated and syncing.

### Gaps

- No explicit auth event stream.
- Failed logins are not captured as durable events.
- Logout is only inferred from token revocation.
- Reporting from `RefreshToken` will be awkward, especially once token rotation creates multiple rows per user session.
- No high-level provisioning event stream.
- VPN provisioning start/success/failure is not stored as explicit activity.
- VPN provisioning currently does not include `deviceId` because it happens before `setupOfflineAuth` creates/registers the desktop device identity.
- Device audit logs should not be overloaded for high-level auth/provisioning reporting; they are better kept for detailed offline/device operations.

### Proposed Scope

Add a dedicated `AuthActivityLog` table instead of overloading `AuditLog`.

Suggested model:

```prisma
model AuthActivityLog {
  id          String   @id @default(uuid())
  tenantId    String
  userId      String?
  customerId  String?
  userType    String
  eventType   String
  ipAddress   String?
  userAgent   String?
  deviceId    String?
  success     Boolean
  reason      String?
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([tenantId, userId])
  @@index([tenantId, customerId])
  @@index([eventType, createdAt])
}
```

API changes:

- In `apps/api/src/routes/auth/index.ts`:
  - Write `LOGIN_SUCCESS` after successful login.
  - Write `LOGIN_FAILED` for invalid credentials, inactive account, invalid customer account, and tenant mismatch where safe.
  - Write `LOGOUT` on `/logout`.
  - Write `LOGOUT_ALL` on `/logout-all`.
- In `apps/api/src/routes/vpn/index.ts`:
  - Write `DEVICE_PROVISION_STARTED` or equivalent only if a durable server-side start event is introduced. The current endpoint can reliably log success/failure of the API provisioning attempt, not the desktop install start before the request reaches the server.
  - Write `DEVICE_PROVISION_API_SUCCEEDED` when `/provision` creates/updates `VpnPeer`.
  - Write `DEVICE_PROVISION_CONFIRMED` when `/confirm` clears the one-time token after local tunnel install succeeds.
  - Write `DEVICE_REPROVISION_API_SUCCEEDED` for `RPT-...` token flow.
  - Write `DEVICE_PROVISION_FAILED` / `DEVICE_REPROVISION_FAILED` for invalid/expired token and invalid key format where user/tenant can be safely resolved.
- In `apps/api/src/routes/devices/index.ts`:
  - Write `DEVICE_REGISTERED` or `DEVICE_REREGISTERED` after `/api/devices/register`.
  - Include `deviceId`, platform, app version, IP, and user agent.
- In desktop login/provisioning paths:
  - Pass `deviceId` where available.
  - For first-time VPN provisioning, accept that `deviceId` may be unavailable unless device identity is created earlier in the desktop flow.
  - Keep detailed local operations in `DeviceAuditLog`.
- Keep writes best-effort where appropriate so auth does not fail because logging failed.

Correlation guidance:

- Keep `AuthActivityLog` and `DeviceAuditLog` separate.
- Use shared fields to correlate:
  - `tenantId`
  - `userId`
  - `deviceId`
  - optional `correlationId` / `provisioningAttemptId`
  - timestamps
- `AuthActivityLog` answers "who accessed/provisioned from where".
- `DeviceAuditLog` answers "what this installed desktop app did locally/offline".

Tests:

- API unit tests for login success/failure logging.
- API unit tests for logout/logout-all logging.
- Verify IP/user agent extraction from headers.
- API unit tests for VPN provisioning success/failure activity logging.
- API unit tests for device register/reregister activity logging.

### Implementation Update

Implemented in this branch:

- Added `AuthActivityLog`.
- Extended `DeviceAuditLog` with nullable IP/user-agent and nullable user/device fields so VPN provisioning can be logged before desktop device registration.
- Added best-effort API audit helpers in `apps/api/src/lib/activity-audit.ts`.
- Auth logs now capture `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, and `LOGOUT_ALL`.
- Desktop login proxy tags API login as `DESKTOP` via `X-Auth-Surface`.
- Device/VPN logs now capture registration, re-registration, revoke, wipe request/confirmation, VPN provisioning/reprovisioning, provisioning confirmation, token generation/regeneration, and VPN revocation.

Deferred:

- Admin/reporting UI to view and filter these logs.
- Optional device id propagation earlier in first-time provisioning if VPN provisioning logs must always carry a device id.

Verification:

- `pnpm --dir apps\api exec vitest run tests/unit/activity-audit.test.ts`
- `pnpm --dir apps\api typecheck`

## Problem 2: Certificate Edit Session

Status: closed

### Requirement

Track when engineers interact with certificate create/edit workflows at a session level, not section level.

Required data:

- Certificate id
- Tenant
- Engineer user
- Revision
- Mode: create, edit, offline create, offline edit
- When the edit page/session opened
- When draft was saved
- When certificate was submitted
- When session closed or became inactive
- Total active duration if feasible
- Desktop device id when available

### Graphify And Codebase Review

Graphify query used:

```powershell
python -m graphify query "certificate edit session create edit save draft submit offline sync certificate user revision duration" --graph graphify-out\graph.json --budget 3000
```

Codebase review:

- `apps/web-hta/src/app/(dashboard)/dashboard/certificates/[id]/edit/page.tsx`
  - Loads certificate into the edit UI.
  - Uses `saveDraft`.
  - Submit flow is routed through the form/finalize flow.
- `apps/web-hta/src/components/forms/FinalizeSection.tsx`
  - Has explicit save draft and submit paths.
- `apps/web-hta/src/lib/stores/certificate-store.ts`
  - Owns form data, dirty state, `saveDraft`, and draft payload construction.
- `apps/desktop/src/main/ipc-handlers.ts`
  - Handles local draft create/update/delete and audit entries.
- `apps/desktop/src/main/sync-engine.ts`
  - Syncs local drafts, images, conflicts, and audit logs.
- `apps/desktop/src/migrations/001-init.sql`
  - Has local certificate draft storage and append-only audit log.

### Current Coverage

Partially covered by:

- Certificate create/update audit/events in API routes.
- Desktop local audit log for draft actions.
- Sync result metadata.

### Gaps

- No edit-session identity.
- No opened/closed/active duration.
- No save count per session.
- No unified online/offline edit session record.
- No reliable way to answer: "Engineer worked on cert X from 10:05 to 10:45 and saved 3 times."

### Proposed Scope

Add edit session tracking as a coarse-grained workflow metric. Do not track section opens/closes or keystrokes.

Suggested server model:

```prisma
model CertificateEditSession {
  id             String    @id @default(uuid())
  tenantId       String
  certificateId  String?
  userId         String
  revision       Int?
  mode           String
  deviceId       String?
  openedAt       DateTime
  lastActivityAt DateTime?
  closedAt       DateTime?
  submittedAt    DateTime?
  durationMs     Int?
  saveCount      Int       @default(0)
  metadata       Json?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([tenantId, certificateId])
  @@index([tenantId, userId, openedAt])
}
```

API changes:

- Add endpoints under certificate routes:
  - `POST /api/certificates/edit-sessions/start`
  - `POST /api/certificates/edit-sessions/:sessionId/activity`
  - `POST /api/certificates/edit-sessions/:sessionId/close`
- Allow `certificateId` to be null at create-start time, then attach once draft creation returns a certificate id.
- Increment `saveCount` on draft save.
- Mark `submittedAt` when submit succeeds.

Web changes:

- Start session on certificate new/edit page mount.
- Attach session id to save/submit requests or call activity endpoint after save.
- Close session on route leave/unload using best-effort request.
- Avoid frequent heartbeat unless needed. A coarse last-activity update on save/submit is enough for the first version.

Desktop/offline changes:

- Add local `certificate_edit_session` table.
- Create local sessions for offline create/edit.
- Sync sessions to API after VPN/online sync.
- Include `deviceId`.

Tests:

- API endpoint tests for start/activity/close.
- Web tests for session start and save activity wiring where practical.
- Desktop sync test for local edit sessions.

### Implementation Update

Implemented in this branch:

- Added `CertificateEditSessionLog`.
- API create/update/submit routes now write coarse session events: `SAVE_DRAFT` and `SUBMITTED`.
- Added `/api/certificates/edit-sessions` for best-effort UI page events.
- Engineer edit page now records `OPENED` on page mount and `CLOSED` on page hide/unmount with active duration seconds.

Deferred:

- Desktop-local offline edit session persistence before sync.
- Admin/reporting UI to aggregate session duration/save counts.

Verification:

- `pnpm --dir apps\api exec vitest run tests/unit/activity-audit.test.ts`
- `pnpm --dir apps\api typecheck`

## Problem 3: Field Change Audit

Status: closed

### Requirement

Use existing field-level change detection to answer what changed and when. Do not infer time spent per field or section.

Required data:

- Certificate id
- User
- Revision
- Field label
- Section/category
- Previous value
- New value
- Timestamp

### Graphify And Codebase Review

Graphify query used:

```powershell
python -m graphify query "field change audit certificate change detection audit log certificate event revision" --graph graphify-out\graph.json --budget 3000
```

Codebase review:

- `apps/api/src/lib/change-detection.ts`
  - Has field labels and section grouping for certificate changes.
- `apps/web-hta/src/lib/utils/change-detection.ts`
  - Mirrors client-side change detection helpers.
- `apps/api/src/routes/certificates/index.ts`
  - Has create/update/submit/revision event and audit paths.
- `packages/database/prisma/schema.prisma`
  - `AuditLog` stores generic entity/action/changes.
  - `CertificateEvent` stores workflow events and event data.
  - `CertificateRevision` stores revision snapshots.
- Admin history and feedback components already consume revision/audit style records.

### Current Coverage

Partially covered.

The system already tracks many certificate workflow transitions and field-level changes for audit/admin history.

### Gaps

- New fields must be added to field-label maps.
- Offline changes need consistent mapping when synced.
- Some changes may be represented in different structures (`AuditLog`, `CertificateEvent`, revision data), so reporting needs a stable source of truth.

### Proposed Scope

Keep using existing audit/change-detection patterns, but standardize the fields needed for reporting.

Changes:

- Add any new certificate metadata fields to:
  - `apps/api/src/lib/change-detection.ts`
  - `apps/web-hta/src/lib/utils/change-detection.ts`
  - admin/internal request field label maps where relevant
- Confirm certificate update route writes changed fields consistently.
- Confirm desktop conflict resolution records changed fields consistently.
- Do not add clickstream-level tracking.

Tests:

- Change detection tests for new fields.
- Certificate update tests asserting audit changes include new fields.
- Desktop sync/conflict tests where new metadata can change offline.

### Implementation Update

Closed as a non-breaking consistency hardening.

Existing production behavior already had the new calibration time fields in:

- `apps/api/src/lib/change-detection.ts`
- `apps/web-hta/src/lib/utils/change-detection.ts`
- admin/internal request label maps
- desktop draft/preload/sync/conflict mappings

Added focused regression coverage so `calibrationStartTime` and `calibrationEndTime` remain audited as `summary` fields with stable labels.

Deferred:

- Dedicated reporting UI over field-change history.
- Broader route-level certificate update tests for full persisted audit rows.
- Additional desktop sync/conflict tests beyond existing mapping checks.

Verification:

- `pnpm --dir apps\api exec vitest run tests/unit/change-detection.test.ts`
- `pnpm --dir apps\web-hta exec vitest run tests/unit/utils.test.ts`
- `pnpm --dir apps\api typecheck`
- `pnpm --dir apps\web-hta typecheck`

## Problem 4: Calibration Start/End Time And Derived Hours

### Requirement

Instead of manually entering "Hours of Calibration", add start and end time fields. `dateOfCalibration` already exists, so the time fields define the calibration window for that date.

Required data:

- `calibrationStartTime`
- `calibrationEndTime`
- Derived hours of calibration
- Display in headers/PDF/metadata for engineer, reviewer, customer, and admin.

### Graphify And Codebase Review

Graphify query used:

```powershell
python -m graphify query "calibration start time end time date of calibration certificate summary header pdf desktop sync" --graph graphify-out\graph.json --budget 3000
```

Codebase review:

- `packages/database/prisma/schema.prisma`
  - `Certificate` has `dateOfCalibration`, `calibrationTenure`, `calibrationDueDate`, but no start/end time fields.
- `apps/api/src/routes/certificates/index.ts`
  - Create/update schemas and payload mapping include date/due-date fields.
  - PDF-data endpoint maps certificate data for rendering.
- `apps/web-hta/src/lib/stores/certificate-store.ts`
  - `CertificateFormData` includes `dateOfCalibration`, due date, and summary metadata.
  - `saveDraft` builds certificate payloads.
- `apps/web-hta/src/components/forms/SummarySection.tsx`
  - Expected UI location for the start/end time fields.
- Role-specific certificate views/headers consume certificate metadata:
  - Engineer edit/view pages.
  - Reviewer page/header.
  - Customer review pages/header.
  - Admin certificate and authorization headers.
- Desktop paths:
  - `apps/desktop/src/migrations/001-init.sql`
  - `apps/desktop/src/main/ipc-handlers.ts`
  - `apps/desktop/src/preload/index.ts`
  - `apps/desktop/src/main/sync-engine.ts`

### Current Coverage

Not covered.

Only the calibration date exists.

### Gaps

- No database fields.
- No API validation.
- No form fields.
- No derived hours display.
- No desktop local/offline support.
- No PDF/header inclusion.
- No conflict-resolution handling.

### Proposed Scope

Use raw time fields and derive hours in code. Do not store `hoursOfCalibration` separately in v1.

DB changes:

```prisma
model Certificate {
  calibrationStartTime String?
  calibrationEndTime   String?
}
```

Validation:

- Store as `HH:mm` 24-hour string.
- If one time is present, require the other.
- If overnight calibration is not supported, enforce `end > start`.
- If overnight calibration is supported later, add an explicit `calibrationEndsNextDay` flag rather than guessing.

API changes:

- Add fields to create/update schemas.
- Persist fields in create/update/save draft.
- Include fields in:
  - certificate detail response
  - engineer/reviewer list/detail responses where needed
  - customer certificate responses
  - admin certificate/authorization responses
  - PDF-data response
- Add fields to change detection.

Web changes:

- Add to `CertificateFormData`.
- Add defaults in certificate store.
- Add setters/save payload mapping.
- Add two time inputs in Summary section near `Date of Calibration`.
- Show derived hours near those fields.
- Show time window and derived hours in:
  - engineer edit header
  - engineer view header
  - reviewer header
  - customer header
  - admin certificate header
  - admin authorization header

PDF changes:

- Include calibration time window and derived hours in PDF data.
- Place the value near calibration date or certificate summary metadata.

Desktop/offline changes:

- Add SQLite columns:
  - `calibration_start_time`
  - `calibration_end_time`
- Add migration for existing installs.
- Update IPC create/update draft payloads.
- Update preload mapping.
- Update sync upload/download mapping.
- Update conflict resolution mapping.

Tests:

- API validation tests for valid/invalid time pairs.
- Certificate create/update tests for persistence.
- Change detection tests for time fields.
- UI/store tests where practical.
- Desktop sync/conflict tests for local time fields.

## Implementation Notes

- Implement Problem 4 before Problem 2 if the calibration time fields are needed quickly for demos.
- Implement Problem 1 independently; it does not depend on certificate changes.
- Keep Problem 2 coarse-grained. Do not track section open/close events.
- Problem 3 should be treated as a supporting requirement for Problems 2 and 4, not a separate clickstream system.
