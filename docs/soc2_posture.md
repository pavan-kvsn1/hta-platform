# SOC2 / ISO 27001 Posture Assessment

**Last assessed:** 2026-04-29
**Scope:** HTA Platform monorepo (`hta-platform`)
**Status:** Partial compliance — strong architectural foundations, critical encryption and audit gaps remain

---

## 1. Current Strengths

### 1.1 Authentication & Session Management

| Control | Implementation |
|---------|---------------|
| Password hashing | Bcrypt with 12 salt rounds |
| Access tokens | JWT, 15-minute expiry |
| Refresh tokens | 7-day (web) / 30-day (desktop), SHA-256 hashed, device-bound, rotated on use |
| Multi-factor auth | TOTP (RFC 6238) with hashed backup codes; WebAuthn stub present |
| Account lockout | 5 failed attempts triggers 15-minute lockout |
| Rate limiting | 250 req/min per user (global), 5/15min (login), 3/hr (password reset) |
| Session revocation | On password change, logout, admin deactivation; `revokedReason` tracked |
| Cookie security | HTTPOnly, SameSite=Lax, Secure + `__Host-` prefix in production |

**Key files:**
- `apps/api/src/middleware/auth.ts` — JWT verification, role guards
- `apps/api/src/routes/auth/` — login, refresh, 2FA setup/verify
- `apps/api/src/services/auth.ts` — token generation, lockout logic

### 1.2 Role-Based Access Control (RBAC)

Three-tier role hierarchy enforced via Fastify `preHandler` middleware:

| Guard | Access Level |
|-------|-------------|
| `requireStaff` | ENGINEER, ADMIN, MASTER_ADMIN |
| `requireAdmin` | ADMIN, MASTER_ADMIN |
| `requireMasterAdmin` | MASTER_ADMIN only |

Multi-tenant isolation enforced at the query level (`tenantId` scoping on all data access).

### 1.3 Audit Logging

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `AuditLog` | Entity-level change tracking | entityType, entityId, action, actorId, changes (JSON) |
| `CertificateEvent` | Immutable certificate lifecycle events | sequenceNumber, revision, eventType, eventData, userId, userRole |
| `SigningEvidence` | Tamper-evident hash chain | previousHash, recordHash, evidenceData |
| `DeviceAuditLog` | Desktop app events | deviceId, userId, action, metadata |
| `TokenAccessLog` | Download token usage | tokenId, ipAddress, userAgent, accessedAt |

**Key files:**
- `apps/api/src/lib/signing-evidence.ts` — hash chain construction
- `apps/api/src/routes/admin/index.ts` — admin action audit logging

### 1.4 Data Protection

| Control | Implementation |
|---------|---------------|
| SQL injection prevention | Prisma ORM with parameterized queries throughout |
| Secrets management | Google Secret Manager with 1-hour refresh via ExternalSecrets |
| CORS | Allowlist-based (`process.env.CORS_ORIGINS`) |
| Security headers | Helmet.js (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) |
| Offline code validation | SHA-256 hashed challenge-response pairs |
| Download tokens | Signed, expiring, max-download-limited |

**Key files:**
- `apps/api/src/server.ts` — CORS, Helmet configuration
- `packages/shared/src/offline-codes/index.ts` — code generation and hashing
- `.gitignore` — excludes `.env`, `.env.local`, `.env.cloud`

### 1.5 Privacy & Data Subject Rights

| Control | Implementation |
|---------|---------------|
| Account deletion | `ACCOUNT_DELETION` customer request type with admin approval workflow |
| Data export | `DATA_EXPORT` customer request type with admin approval workflow |
| Data minimization | Role-scoped `select` clauses on queries |

### 1.6 Infrastructure & CI/CD

| Control | Implementation |
|---------|---------------|
| CI pipeline | GitHub Actions — lint, typecheck, unit tests, integration tests, E2E (Playwright), security lint |
| Security linting | `eslint-plugin-security`, `@microsoft/eslint-plugin-sdl` |
| Container security | Alpine base images, non-root user (`uid 1001`), multi-stage builds, no secrets in layers |
| Kubernetes | `securityContext` (runAsNonRoot, readOnlyRootFilesystem), resource limits, pod anti-affinity |
| Database connectivity | Cloud SQL Auth Proxy with mTLS |
| Dependency lockfile | `pnpm-lock.yaml` frozen in CI |
| Testing | Unit, integration (real Postgres/Redis), E2E (sharded Playwright), API integration |

**Key files:**
- `.github/workflows/ci.yml` — CI pipeline
- `apps/api/Dockerfile` — container build
- `k8s/` — Kubernetes manifests

---

## 2. Critical & High Gaps

### 2.1 Critical

| # | Gap | Impact | Remediation |
|---|-----|--------|-------------|
| C1 | **Account lockout in cache only** — Redis restart clears lockout counters; no persistent DB fields | Brute-force attacks survive cache restarts (affects both web and desktop online login) | Add `failedAttempts`, `lockedUntil` columns to User model |

**References:**
- C1: `apps/api/src/services/auth.ts` — lockout logic uses in-memory/Redis cache

### 2.2 High

| # | Gap | Scope | Impact | Remediation |
|---|-----|-------|--------|-------------|
| H1 | **TOTP secrets stored in plaintext** — code comment says "encrypt in production" but not implemented | Web only (not Electron — offline auth uses PIN + challenge-response cards, already SHA-256 hashed) | Compromised DB exposes web 2FA secrets | Encrypt with AES-256-GCM using key from Secret Manager |
| H2 | **No field-level encryption at rest** — PII (customer names, emails, addresses, phone numbers) stored as plaintext | Platform-wide | DB backup exposure violates data-at-rest requirements | Encrypt sensitive columns (contactEmail, phone, address) with application-level AES |
| H3 | **Login events not in AuditLog** — successful and failed logins not recorded in the audit trail | Platform-wide | Cannot reconstruct access history for forensics | Add `LOGIN_SUCCESS` and `FAILED_LOGIN` audit events to all auth routes |
| H4 | **AuditLog not write-protected** — no DB constraint preventing UPDATE/DELETE on audit records | Platform-wide | Audit trail can be tampered with | Add DB trigger or Prisma middleware to block UPDATE/DELETE on AuditLog |
| H5 | **Compliance audit logger exists but unused** — `logPiiAccess()` / `logPiiModification()` in `@hta/shared/compliance` never called | Platform-wide | PII access not tracked per ISO 27001 A.8.11 | Wire up compliance logger calls in certificate and user data routes |
| H6 | **No password reuse prevention** — no password history table | Web only | Users can cycle back to compromised passwords | Add `PasswordHistory` model, check last N passwords on change |
| H7 | **No continuous vulnerability scanning** — `pnpm audit` runs with `continue-on-error: true`, no Snyk/Dependabot | Platform-wide | Known vulnerabilities can ship to production | Enable Dependabot or Snyk; fail CI on high/critical findings |
| H8 | **No container image signing/attestation** — no SLSA provenance or Docker Content Trust | Infra | Supply chain integrity unverified | Add `cosign` signing to CI/CD pipeline |
| H9 | **No API input schema validation** — routes use `request.body as { ... }` casts without runtime validation | Platform-wide | Malformed input may cause unexpected behavior | Add Fastify JSON Schema validation (native support) to all routes |

**References:**
- H1: `apps/web-hta/src/app/api/auth/2fa/setup/route.ts` (line ~59)

---

## 3. Medium Gaps

| # | Gap | Remediation |
|---|-----|-------------|
| M1 | No idle session timeout (relies on JWT expiry only) | Add sliding-window idle timeout tracked server-side |
| M2 | Redis has no password/TLS in docker-compose | Add `requirepass` and TLS to Redis config |
| M3 | CSP not enforced in production (Helmet CSP dev-only) | Enable CSP in production with violation reporting endpoint |
| M4 | No Kubernetes NetworkPolicy | Add ingress/egress NetworkPolicy per namespace |
| M5 | No staging environment in deploy workflow | Add staging environment with separate CORS origins |
| M6 | No XSS sanitization on user-generated content (chat, feedback) | Add DOMPurify or server-side sanitization |
| M7 | Anomaly detection stubs unused (SUSPICIOUS_LOGIN, BRUTE_FORCE defined but never triggered) | Implement detection logic and wire to alert pipeline |
| M8 | Notification cleanup deletes without audit trail | Log deletions before purging |
| M9 | Token revocation not in AuditLog (only in RefreshToken.revokedReason) | Mirror revocation events to AuditLog |
| M10 | No SECURITY.md or incident response playbook | Create public security policy and internal IRP |
| M11 | WebAuthn implementation incomplete (CBOR parsing stub) | Complete or remove to avoid false sense of security |
| M12 | No IP allowlisting or geolocation-based login alerts | Add per-tenant IP restrictions and geo-anomaly detection |

---

## 4. Remediation Roadmap

### Phase 1 — Critical + Quick Wins (Week 1)

- [ ] **C1** — Persist lockout state to DB (`failedAttempts`, `lockedUntil` on User model)
- [ ] **H3** — Add `LOGIN_SUCCESS` and `FAILED_LOGIN` events to AuditLog in all auth routes
- [ ] **H4** — Add PostgreSQL trigger to make AuditLog append-only (`BEFORE UPDATE OR DELETE` → raise exception)

### Phase 2 — High Priority (Weeks 2-3)

- [ ] **H1** — Encrypt TOTP secrets at rest with AES-256-GCM (web 2FA — key from GCP Secret Manager)
- [ ] **H2** — Implement application-level field encryption for PII columns
- [ ] **H5** — Wire up `logPiiAccess()` / `logPiiModification()` in certificate and user routes
- [ ] **H6** — Add PasswordHistory model; enforce last-5 check on password change
- [ ] **H7** — Enable Dependabot; set `pnpm audit` to fail on high/critical
- [ ] **H9** — Add Fastify JSON Schema validation to all API routes
- [ ] **M2** — Add Redis AUTH + TLS configuration
- [ ] **M3** — Enable CSP in production; add `/api/security/csp-report` endpoint

### Phase 3 — Hardening (Week 4)

- [ ] **H8** — Add `cosign` container image signing to CI/CD
- [ ] **M1** — Server-side idle session timeout
- [ ] **M4** — Kubernetes NetworkPolicy definitions
- [ ] **M5** — Staging environment with separate config
- [ ] **M6** — DOMPurify on user-generated content (chat, feedback)
- [ ] **M7** — Implement anomaly detection (geo, brute-force triggers)
- [ ] **M9** — Mirror token revocation events to AuditLog
- [ ] **M10** — Create SECURITY.md and incident response playbook

### Phase 4 — Continuous Compliance

- [ ] **M8** — Audit trail for notification/log cleanup jobs
- [ ] **M11** — Complete or remove WebAuthn stub
- [ ] **M12** — IP allowlisting and geolocation alerting
- [ ] Schedule quarterly posture re-assessment
- [ ] SOC2 Type II audit engagement (after Phase 1-3 complete)

---

## 5. Control Mapping Reference

### SOC2 Trust Service Criteria

| TSC | Control Area | Status |
|-----|-------------|--------|
| CC6.1 | Logical access security | Partial — auth strong, lockout persistence gap |
| CC6.2 | Authentication mechanisms | Partial — MFA present, TOTP encryption missing |
| CC6.3 | Authorization (RBAC) | Strong |
| CC6.6 | System boundaries (encryption in transit) | Strong — HTTPS, secure cookies, mTLS to DB |
| CC6.7 | Data transmission restrictions | Partial — CORS configured, no egress controls |
| CC7.1 | Vulnerability management | Weak — no continuous scanning |
| CC7.2 | Monitoring and detection | Partial — Sentry present, anomaly detection stubs unused |
| CC7.3 | Incident response | Weak — no playbook documented |
| CC8.1 | Change management | Strong — CI/CD, PR reviews, automated tests |
| A1.2 | Recovery procedures | Weak — no documented backup/DR strategy |
| PI1.1 | Privacy — PII protection | Partial — data subject rights present, encryption absent |

### ISO 27001:2022 Annex A

| Control | Area | Status |
|---------|------|--------|
| A.5.1 | Information security policies | Weak — no SECURITY.md |
| A.8.3 | Access restriction | Strong — RBAC middleware |
| A.8.5 | Authentication | Strong — MFA, lockout, rate limiting |
| A.8.9 | Configuration management | Strong — IaC, container security |
| A.8.11 | Data masking/protection | Weak — no encryption at rest for PII |
| A.8.15 | Logging | Partial — models exist, login events missing |
| A.8.16 | Monitoring | Partial — Sentry, no anomaly detection |
| A.8.24 | Cryptography | Partial — transit strong, at-rest gaps |
| A.8.25 | Development lifecycle | Strong — CI/CD, security linting, testing |
| A.8.28 | Secure coding | Partial — Prisma ORM, but no input validation schemas |

---

## 6. Files & References

| Area | Key Files |
|------|-----------|
| Auth middleware | `apps/api/src/middleware/auth.ts` |
| Auth service | `apps/api/src/services/auth.ts` |
| 2FA setup | `apps/web-hta/src/app/api/auth/2fa/setup/route.ts` |
| Audit logging | `apps/api/src/lib/signing-evidence.ts` |
| Security headers | `apps/api/src/server.ts`, `apps/web-hta/src/middleware.ts` |
| CI pipeline | `.github/workflows/ci.yml` |
| K8s manifests | `k8s/` |
| Compliance logger | `packages/shared/src/compliance/` |
| Security alerts | `apps/api/src/routes/security/index.ts` |
| Security docs | `docs/security/security-architecture.md` |
