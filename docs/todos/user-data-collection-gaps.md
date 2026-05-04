# User Data Collection — Compliance Gaps

> **Priority:** High
> **Discovered:** 2026-05-04 (during compliance test audit)
> **Status:** Not started

## Context

The platform collects user activity data across multiple layers (audit logs, refresh tokens, Sentry, GCP Cloud Logging). Privacy policy and data processing inventory are comprehensive, but several implementation gaps exist between what's documented and what's enforced.

---

## Gap 1: No Pre-Collection Consent for Auth Logs

**Severity:** High (GDPR Article 6)

**Problem:** IP address and User-Agent are captured at every login attempt (`apps/api/src/routes/auth/index.ts`) and stored in `AuditLog` + `RefreshToken`. The legal basis is "legitimate interests" per the data processing inventory, but there's no consent check or notice at the point of collection.

**Fix:**
- Add a consent banner/notice on login pages before credentials are submitted
- Or document "legitimate interests" assessment (DPIA) to justify collection without explicit consent
- The latter is likely sufficient for auth security logs, but needs formal documentation

---

## Gap 2: No IP Logging on Certificate Downloads

**Severity:** Medium

**Problem:** `DownloadToken` model tracks `downloadedAt` and `downloadCount` but not the IP address or User-Agent of the downloader. For calibration certificates (regulated documents), there's no way to trace who accessed a download.

**File:** `packages/database/prisma/schema.prisma` (DownloadToken model)

**Fix:**
- Add `ipAddress String?` and `userAgent String?` fields to `DownloadToken`
- Capture on download access in the download route handler
- Include in audit log event

---

## Gap 3: No IP Anonymization

**Severity:** Medium

**Problem:** Full IP addresses stored as-is in `AuditLog` and `RefreshToken`. GDPR considers IP addresses personal data. No hashing, truncation, or anonymization applied.

**Fix options:**
- Truncate IPv4 to /24 (e.g., `192.168.1.0`) and IPv6 to /48 for non-security logs
- Keep full IP only for security-critical events (failed logins, account lockouts) with shorter retention
- Or hash IPs with a rotating salt for audit purposes (can still detect patterns without storing raw IPs)

---

## Gap 4: Orphaned File Cleanup Not Implemented

**Severity:** Medium

**Problem:** `apps/worker/src/jobs/cleanup.ts` has a `cleanupOrphanedFiles()` function but it's dry-run only — files in GCS are never actually cleaned up. Old certificate images and documents may accumulate indefinitely.

**Fix:**
- Implement actual GCS file deletion for files not referenced by any active certificate
- Add a safety buffer (e.g., files must be orphaned for 30+ days before deletion)
- Log all deletions to audit trail
- Run as a scheduled job (weekly)

---

## Gap 5: Refresh Token Creation Not Audit-Logged

**Severity:** Low

**Problem:** `RefreshToken` records capture IP and User-Agent, but no corresponding `AuditLog` event is created when a token is issued or rotated. Token revocation is logged, but creation is not.

**File:** `apps/api/src/routes/auth/index.ts`

**Fix:**
- Add `auditLog` call with action `TOKEN_CREATED` when issuing refresh tokens
- Add `auditLog` call with action `TOKEN_ROTATED` when rotating tokens
- Include deviceId for desktop tokens

---

## Gap 6: Sentry User Context Not Automatically Set

**Severity:** Low

**Problem:** Sentry user context (`setUser({ id, email, role })`) is only set when explicitly called. Not all requests automatically include user identity, so some error reports lack user attribution.

**File:** `packages/shared/src/sentry/index.ts`

**Fix:**
- Add Fastify `onRequest` hook that calls `Sentry.setUser()` from the JWT payload
- Clear user context in `onResponse` to prevent leaking between requests
- Ensure Next.js middleware also sets Sentry user context for SSR errors
