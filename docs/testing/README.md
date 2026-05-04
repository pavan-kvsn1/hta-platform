# Testing Infrastructure — Audit & Remediation Plan

> **Audit date:** 2026-05-04
> **Status:** Pre-CD — must be resolved before Argo CD deployment pipeline is enabled.

This document captures every known gap in the test infrastructure and provides actionable items to close each one. Items are grouped by priority tier.

## Current State

| Layer | Runner | Files | CI Job | Passing? |
|-------|--------|-------|--------|----------|
| Unit | Vitest 2.1 | 56 across 8 packages | `unit-tests` | Partial — 4 packages silently skip |
| Integration | Vitest 2.1 | 21 across 4 apps | `integration-tests` | Runs, but setup is inconsistent |
| E2E | Playwright | 5 specs + auth setup | `e2e-tests` (3 shards) | Happy-path only |
| Build | Docker Buildx | 3 Dockerfiles | `build` (matrix) | Good |
| Compliance | Vitest 2.1 | 2 files | **None** | Never runs |

---

## Priority Tiers

- **P0** — Blocks CI correctness. Existing tests silently don't run, or configs are broken.
- **P1** — Coverage for recently shipped features. No tests exist at all. (14 items)
- **P2** — E2E depth. Tests exist but only verify navigation, not actions.
- **P3** — Hardening. Coverage thresholds, desktop app, compliance wiring.

---

## P0 — CI Correctness

### P0-1: Fix stale `"test"` scripts in 4 packages

**Problem:** Four packages have `"test": "echo 'No tests yet'"` even though unit tests exist. When turbo runs the `test` task, these packages short-circuit and **never execute their real tests**.

| Package | Current `"test"` | Has Tests? | Fix |
|---------|-----------------|------------|-----|
| `apps/worker/package.json` | `echo 'No tests yet'` | 3 unit + 2 integration | `vitest run tests/unit` |
| `packages/database/package.json` | `echo 'No tests yet'` | 2 unit | `vitest run` |
| `packages/emails/package.json` | `echo 'No tests yet'` | 2 unit | `vitest run` |
| `packages/ui/package.json` | `echo 'No tests yet'` | 2 unit | `vitest run` |

**Files to edit:**
- `apps/worker/package.json` — change `"test"` to `"vitest run tests/unit"`
- `packages/database/package.json` — change `"test"` to `"vitest run"`
- `packages/emails/package.json` — change `"test"` to `"vitest run"`
- `packages/ui/package.json` — change `"test"` to `"vitest run"`

**Verification:** `pnpm turbo run test` should show test results from all 4 packages instead of "No tests yet".

---

### P0-2: Wire setupFiles in API integration config

**Problem:** `apps/api/vitest.integration.config.ts` has **no `setupFiles`** property. Database lifecycle is managed manually inside each test file via explicit `setupTestDatabase()` calls. This is fragile and inconsistent with the worker and web-hta patterns.

**Current config** (`apps/api/vitest.integration.config.ts`):
```typescript
// No setupFiles — database setup is ad-hoc in each test
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
```

**Fix:** Create `apps/api/tests/integration/setup/vitest-setup.ts` following the worker pattern, and add `setupFiles` to the config:

```typescript
// apps/api/vitest.integration.config.ts
export default defineConfig({
  test: {
    setupFiles: ['./tests/integration/setup/vitest-setup.ts'],  // ADD THIS
    // ... rest unchanged
  },
})
```

The setup file should call `setupTestDatabase()` from the existing `test-db.ts` in `beforeAll` and `teardownTestDatabase()` in `afterAll`.

**Reference:** `apps/worker/tests/integration/setup/vitest-setup.ts` follows this exact pattern.

---

### P0-3: Verify worker integration setupFiles is actually wired

**Problem:** The worker integration config **does** have `setupFiles` (confirmed in current file), but the earlier audit flagged a potential mismatch. Verify the file reference resolves correctly.

**Current config** (`apps/worker/vitest.integration.config.ts`):
```typescript
setupFiles: ['./tests/integration/setup/vitest-setup.ts'],
```

**Verification:** Run `pnpm --filter @hta/worker test:integration` locally and confirm the setup file executes (look for database connection logs).

---

### P0-4: Remove credentials from tracked file

**Problem:** `packages/database/.env` contains hardcoded local database credentials and is tracked by git.

**Fix:**
1. Add `packages/database/.env` to `.gitignore`
2. Rename to `packages/database/.env.example` with placeholder values
3. Update the database package README or add a comment in the example file

---

## P1 — Coverage for New Features

These features were shipped with zero tests. Each item below specifies what to test and where the test file should live.

### P1-1: Offline codes API routes

**Routes:** `apps/api/src/routes/devices/codes.ts`
**Service:** `apps/api/src/services/offline-codes.ts`

Tests to add:
- **Unit** (`apps/api/tests/unit/offline-codes.test.ts`):
  - `generateCodeBatch()` returns correct number of codes
  - Challenge-response validation logic (valid/invalid/expired)
  - Batch expiry logic
- **Integration** (`apps/api/tests/integration/offline-codes.test.ts`):
  - `POST /api/devices/:id/codes/generate` — creates batch for registered device
  - `GET /api/devices/:id/codes` — returns active batch with status
  - `POST /api/devices/:id/codes/verify` — validates challenge-response pair
  - Auth guard: engineer can only access their own device's codes
  - Batch lifecycle: generate → use codes → expiry

---

### P1-2: Device management API routes

**Routes:** `apps/api/src/routes/devices/index.ts`

Tests to add:
- **Integration** (`apps/api/tests/integration/devices.test.ts`):
  - `POST /api/devices/register` — registers new device with fingerprint
  - `GET /api/devices` — lists devices for tenant
  - `DELETE /api/devices/:id` — admin-only device removal
  - Duplicate fingerprint rejection
  - Auth: engineer sees own devices, admin sees all

---

### P1-3: Internal request — OFFLINE_CODE_REQUEST flow

**Route:** `apps/api/src/routes/internal-requests/index.ts` (updated)

Tests to add:
- **Integration** (extend existing `apps/api/tests/integration/` or new file):
  - `POST /api/internal-requests` with `type: 'OFFLINE_CODE_REQUEST'` — creates request
  - Duplicate prevention: second request while PENDING returns error
  - Admin approval triggers code generation
  - Admin rejection stores adminNote
  - Notifications sent to admin on request, engineer on review

---

### P1-4: Frontend — OfflineCodesClient

**Component:** `apps/web-hta/src/app/(dashboard)/dashboard/offline-codes/OfflineCodesClient.tsx`

Tests to add:
- **Unit** (`apps/web-hta/tests/unit/offline-codes-client.test.tsx`):
  - Renders "Request New Card" button when no active batch
  - Shows pending request banner when request is PENDING
  - Shows rejection note when request is REJECTED
  - Renders code grid when active batch exists
  - Calls correct API endpoint on request

---

### P1-5: Frontend — DeviceListClient

**Component:** `apps/web-hta/src/app/admin/devices/DeviceListClient.tsx`

Tests to add:
- **Unit** (`apps/web-hta/tests/unit/device-list-client.test.tsx`):
  - Renders device table with columns
  - Shows empty state when no devices
  - Delete button calls API and refreshes list

---

### P1-6: Frontend — OfflineCodeRequestClient

**Component:** `apps/web-hta/src/app/admin/requests/[id]/OfflineCodeRequestClient.tsx`

Tests to add:
- **Unit** (`apps/web-hta/tests/unit/offline-code-request-client.test.tsx`):
  - Renders requester info and reason
  - Approve button calls review endpoint
  - Reject button with note calls review endpoint
  - Success state after approval

---

### P1-7: Email templates

**Templates:** 5 new templates in `packages/emails/src/templates/`

Tests to add:
- **Unit** (extend `packages/emails/tests/render.test.ts`):
  - `CustomerAuthorizedRegistered` renders with all props
  - `CustomerAuthorizedToken` renders with token URL
  - `CustomerReviewRegistered` renders with review link
  - `OfflineCodesExpiry` renders with expiry date
  - `ReviewerCustomerExpired` renders with customer/cert info

---

### P1-8: Desktop auth API routes

**Routes:**
- `apps/web-hta/src/app/api/auth/desktop-login/route.ts` (~100 lines, new)
- `apps/web-hta/src/app/api/auth/desktop-session/route.ts` (~59 lines, new)

`desktop-login` proxies email/password to the Fastify API and encodes a NextAuth session cookie with device binding. `desktop-session` restores a session from a stored user profile (PIN unlock flow).

Tests to add:
- **Unit** (`apps/web-hta/tests/unit/desktop-auth-routes.test.ts`):
  - `desktop-login`: successful credential proxy returns session cookie
  - `desktop-login`: invalid credentials returns 401
  - `desktop-login`: network-unreachable error handling (API down)
  - `desktop-login`: deviceId is included in JWT payload
  - `desktop-session`: restores session from stored profile
  - `desktop-session`: rejects missing/invalid profile data
  - Cookie security settings (httpOnly, sameSite)

---

### P1-9: Desktop login page

**Component:** `apps/web-hta/src/app/desktop/login/page.tsx` (~426 lines, new)

Multi-view auth page with three states: login (first-time setup), unlock (password + challenge code), and password-only (re-entry). Integrates with ElectronAPI for device status, auth state, and offline unlock.

Tests to add:
- **Unit** (`apps/web-hta/tests/unit/desktop-login-page.test.tsx`):
  - Renders login view when no stored credentials
  - Renders unlock view when credentials exist and codes available
  - Renders password-only view when no challenge codes remain
  - Challenge-response validation (4-char code matching)
  - Disables login button when offline on first-time setup
  - Tracks failed unlock attempts, shows remaining count
  - Success navigates to dashboard

---

### P1-10: Offline codes shared utility

**Module:** `packages/shared/src/offline-codes/index.ts` (~77 lines, new)

Pure crypto logic: `generateChallengeResponsePairs()` creates a 50-pair grid (A1–E10) with 4-char alphanumeric values. `hashCode()` normalizes and SHA-256 hashes codes.

Tests to add:
- **Unit** (`packages/shared/tests/offline-codes.test.ts`):
  - Grid generation produces correct count (default 50)
  - Key format matches pattern (A1, B5, E10, etc.)
  - Values are 4 chars from restricted charset (no ambiguous 0/O, 1/I)
  - All values unique within a batch
  - `hashCode()` normalizes uppercase and strips whitespace
  - `hashCode()` produces consistent SHA-256 output
  - Custom count parameter works

---

### P1-11: Conflict resolution page

**Component:** `apps/web-hta/src/app/(dashboard)/dashboard/certificates/[id]/resolve/page.tsx` (~809 lines, new)

Desktop-only sync conflict UI. Shows side-by-side diff of local vs. server versions, lets engineer pick resolution per field, supports bulk select, handles parameter-level conflicts.

Tests to add:
- **Unit** (`apps/web-hta/tests/unit/conflict-resolution.test.tsx`):
  - Loads local + server versions from electronAPI
  - Detects field-level and parameter-level conflicts
  - Conflict counter updates as picks are made
  - Bulk "use all local" / "use all server" selects all conflicts
  - Save button disabled until all conflicts resolved
  - Builds correct merged data structure on submit
  - Calls `electronAPI.resolveConflict()` with merged data

---

### P1-12: My Requests page

**Component:** `apps/web-hta/src/app/(dashboard)/dashboard/requests/page.tsx` (~302 lines, new)

Lists user's internal requests with status filtering (ALL/PENDING/APPROVED/REJECTED), search, and pagination.

Tests to add:
- **Unit** (`apps/web-hta/tests/unit/my-requests-page.test.tsx`):
  - Fetches and renders request list
  - Status filter changes API query
  - Search filters by title/details
  - Pagination controls (prev/next, page count)
  - Status badge colors match status
  - Type icons map correctly (OFFLINE_CODE_REQUEST → KeyRound)
  - Admin note displays on rejected requests
  - Empty state when no requests

---

### P1-13: Refresh token service (desktop support)

**Service:** `apps/api/src/services/refresh-token.ts` (~200 lines, updated)

New `tokenType: 'web' | 'desktop'` field with different expiry (7d vs 30d). Desktop tokens are device-bound via `deviceId`.

Tests to add:
- **Unit** (`apps/api/tests/unit/refresh-token.test.ts`):
  - Creates web token with 7-day expiry
  - Creates desktop token with 30-day expiry and deviceId
  - Validates token hasn't expired
  - Validates device binding — rejects if deviceId mismatch
  - Rotation revokes old token, creates new one
  - Revocation stores reason

---

### P1-14: Worker cleanup jobs

**Module:** `apps/worker/src/jobs/cleanup.ts` (~346 lines, updated)

New functions: `cleanupExpiredOfflineCodes()` deactivates expired batches and queues expiry emails. `cleanupExpiredReviews()` transitions timed-out customer reviews (48h window) to CUSTOMER_REVIEW_EXPIRED status.

Tests to add:
- **Unit** (extend `apps/worker/tests/unit/cleanup.test.ts`):
  - `cleanupExpiredOfflineCodes()`: finds active batches past expiresAt, sets isActive=false, queues email
  - `cleanupExpiredReviews()`: finds PENDING_CUSTOMER_APPROVAL certs past 48h, transitions status, creates certificateEvent, notifies reviewer/engineer
  - Error handling: individual failures don't block other cleanups

---

## P2 — E2E Depth

### P2-1: E2E tests verify navigation only, not actions

**Problem:** All 4 journey specs navigate to pages and check for button visibility but never actually complete the workflow action. Tests use defensive patterns like `.isVisible().catch(() => false)` that silently pass when elements are missing.

**Current state — what each spec does vs. should do:**

| Spec | Current | Should Also |
|------|---------|-------------|
| `certificate-flow.spec.ts` | Fills form, saves draft | Submit for review, verify status changes to PENDING_REVIEW |
| `reviewer-flow.spec.ts` | Views pending list | Click approve, verify status changes to APPROVED |
| `admin-authorization.spec.ts` | Checks authorize button exists | Click authorize, verify AUTHORIZED status |
| `customer-flow.spec.ts` | Opens signature modal | Draw signature, confirm, verify APPROVED status |

**Fix approach:**
1. Remove all `.catch(() => false)` defensive patterns — if an element is expected, the test should fail when it's missing
2. Add action-completion steps to each journey
3. Chain journeys: engineer creates → reviewer approves → admin authorizes → customer reviews

---

### P2-2: Add E2E journey for offline code request flow

**New spec:** `apps/web-hta/e2e/journeys/offline-codes-flow.spec.ts`

Steps:
1. Engineer navigates to `/dashboard/offline-codes`
2. Engineer clicks "Request New Card"
3. Verify pending banner appears
4. Switch to admin role → navigate to `/admin/requests`
5. Admin approves the offline code request
6. Switch back to engineer → verify code grid appears

---

### P2-3: Add public page tests

**Problem:** `apps/web-hta/e2e/pages/` directory is empty. No tests for:
- Homepage (mobile and desktop)
- Support page (`/support`)
- Privacy and Terms pages
- Customer login page
- Staff login page error handling

**New specs:**
- `apps/web-hta/e2e/pages/homepage.spec.ts`
- `apps/web-hta/e2e/pages/public-pages.spec.ts`

---

### P2-4: Seed script must create offline code test data

**File:** `apps/web-hta/prisma/seed.ts`

The seed script needs to create:
- A registered device for the test engineer
- An active offline code batch (so E2E tests have data to verify)
- A PENDING offline code request (for admin review E2E test)

---

## P3 — Hardening

### P3-1: Add coverage thresholds to all vitest configs

**Problem:** Only `apps/web-hta/vitest.config.ts` defines coverage thresholds. All other apps and packages have coverage reporters but no enforcement.

**Recommended thresholds (start conservative, ratchet up):**

| Package | Lines | Branches | Functions | Statements |
|---------|-------|----------|-----------|------------|
| `apps/api` | 40% | 30% | 50% | 40% |
| `apps/worker` | 40% | 30% | 50% | 40% |
| `apps/web-hta` | 60% | 50% | 80% | 60% (already set) |
| `packages/shared` | 50% | 40% | 60% | 50% |
| `packages/database` | 30% | 20% | 40% | 30% |
| `packages/emails` | 40% | 30% | 50% | 40% |

Add to each `vitest.config.ts`:
```typescript
coverage: {
  thresholds: {
    lines: XX,
    branches: XX,
    functions: XX,
    statements: XX,
  },
},
```

---

### P3-2: Wire compliance tests into turbo pipeline

**Problem:** Two compliance test files exist but are never executed:
- `tests/compliance/data-inventory.test.ts`
- `tests/compliance/gdpr.test.ts`

**Fix:**
1. Add a vitest config at `tests/compliance/vitest.config.ts`
2. Add a `test:compliance` script to root `package.json`
3. Add `test:compliance` task to `turbo.json`
4. Add `test:compliance` step to `ci.yml` (can run in parallel with unit tests)

---

### P3-3: Desktop app basic tests

**Problem:** `apps/desktop/` has no test scripts, no test files, and no vitest config. Core modules (sync-engine, sqlite-db, security, auth) are untested.

**Recommended first tests:**
- `apps/desktop/tests/unit/sqlite-db.test.ts` — table creation, migration ordering
- `apps/desktop/tests/unit/sync-engine.test.ts` — conflict detection, queue management
- `apps/desktop/tests/unit/security.test.ts` — CSP headers, allowed origins

**Setup needed:**
1. Add vitest as devDependency to `apps/desktop/package.json`
2. Create `apps/desktop/vitest.config.ts`
3. Add `test`, `test:unit` scripts to `apps/desktop/package.json`

---

### P3-4: Standardize integration test database port

**Problem:** CI uses port 5432 (standard). Worker postgres-setup.ts uses 5433 as fallback. Web-hta uses the `DATABASE_URL` environment variable. This inconsistency can cause port conflicts when running multiple test suites locally.

**Fix:** All integration setup files should read `DATABASE_URL` from environment and default to a consistent local URL:
```typescript
const DATABASE_URL = process.env.DATABASE_URL
  ?? 'postgresql://hta_test:hta_test_password@localhost:5432/hta_calibration_test'
```

---

## Checklist

Copy this checklist into a tracking issue:

```markdown
## P0 — CI Correctness
- [ ] P0-1: Fix stale `"test"` scripts in worker, database, emails, ui
- [ ] P0-2: Wire setupFiles in API integration config
- [ ] P0-3: Verify worker integration setupFiles resolves
- [ ] P0-4: Remove packages/database/.env from git, add .env.example

## P1 — New Feature Coverage
- [ ] P1-1: Offline codes API unit + integration tests
- [ ] P1-2: Device management API integration tests
- [ ] P1-3: Internal request OFFLINE_CODE_REQUEST integration tests
- [ ] P1-4: OfflineCodesClient unit tests
- [ ] P1-5: DeviceListClient unit tests
- [ ] P1-6: OfflineCodeRequestClient unit tests
- [ ] P1-7: Email template render tests
- [ ] P1-8: Desktop auth API routes unit tests
- [ ] P1-9: Desktop login page unit tests
- [ ] P1-10: Offline codes shared utility unit tests
- [ ] P1-11: Conflict resolution page unit tests
- [ ] P1-12: My Requests page unit tests
- [ ] P1-13: Refresh token service unit tests
- [ ] P1-14: Worker cleanup jobs unit tests

## P2 — E2E Depth
- [ ] P2-1: Make existing E2E specs complete actions, remove defensive patterns
- [ ] P2-2: Add offline codes E2E journey
- [ ] P2-3: Add public page E2E specs
- [ ] P2-4: Update seed script with offline code test data

## P3 — Hardening
- [ ] P3-1: Add coverage thresholds to all vitest configs
- [ ] P3-2: Wire compliance tests into turbo pipeline
- [ ] P3-3: Add basic desktop app unit tests
- [ ] P3-4: Standardize integration test database port
```
