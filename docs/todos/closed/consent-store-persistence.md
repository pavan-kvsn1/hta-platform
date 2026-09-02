# Consent Store — Migrate from In-Memory to Database

> **Priority:** Medium
> **Discovered:** 2026-05-04 (during P3-2 compliance test wiring)
> **Status:** Not started

## Problem

`packages/shared/src/compliance/consent.ts` uses a module-scoped `Map<string, ConsentRecord>` for all consent operations. Data is lost on process restart. This is not production-viable — GDPR Article 7 requires demonstrable proof of consent, which means persistent, auditable records.

## Current State

- `recordConsent()`, `checkConsent()`, `getUserConsents()`, `revokeAllConsents()`, `getConsentStatus()` — all read/write an in-memory Map
- `_resetConsentStore()` exists for test isolation only
- `logConsentChange()` from `audit-logger.ts` does write to the database (audit log), but the consent record itself is ephemeral
- Compliance tests (37 passing) validate the logic but don't test database persistence because there is none

## What Needs to Be Done

### 1. Prisma Schema — `ConsentRecord` model

**File:** `packages/database/prisma/schema.prisma`

```prisma
model ConsentRecord {
  id        String      @id @default(cuid())
  userId    String
  userType  String      // 'staff' | 'customer'
  type      String      // 'essential_cookies' | 'analytics' | 'marketing_email' | 'data_processing' | 'third_party_sharing'
  granted   Boolean
  version   String      // consent policy version at time of grant
  ipAddress String?
  grantedAt DateTime?
  revokedAt DateTime?
  createdAt DateTime    @default(now())
  tenantId  String
  tenant    Tenant      @relation(fields: [tenantId], references: [id])

  @@index([userId, type])
  @@index([tenantId])
}
```

### 2. Consent Service Rewrite

**File:** `packages/shared/src/compliance/consent.ts`

Replace the in-memory `Map` with Prisma queries:
- `recordConsent()` → `prisma.consentRecord.upsert()` (keyed on userId + type)
- `checkConsent()` → `prisma.consentRecord.findFirst()` where granted = true and version matches current
- `getUserConsents()` → `prisma.consentRecord.findMany()` where userId matches
- `revokeAllConsents()` → `prisma.consentRecord.updateMany()` set granted = false, revokedAt = now
- `getConsentStatus()` → query all consent types, compare versions to `CONSENT_VERSIONS`

### 3. API Routes

**New file:** `apps/api/src/routes/consent/index.ts`

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/consent` | GET | Any authenticated user | Get current user's consent status |
| `/api/consent` | POST | Any authenticated user | Record consent decision |
| `/api/consent/revoke-all` | POST | Any authenticated user | Revoke all consents (account deletion flow) |
| `/api/admin/consent/:userId` | GET | Admin only | View a user's consent records (DSR compliance) |

### 4. Customer Portal UI

- **Consent banner** — shown on first customer login if any consent type needs granting or renewal
- **Consent preferences page** — `/customer/settings/privacy` — toggle each consent type, view current versions
- **Staff consent** — minimal, only essential cookies + data processing (no marketing)

### 5. Update Compliance Tests

After database persistence:
- Update `tests/compliance/gdpr.test.ts` consent tests to mock Prisma instead of relying on in-memory store
- Remove `_resetConsentStore()` (no longer needed — test isolation via mock reset)
- Add integration test: consent grant → database record exists → consent revoke → record updated
