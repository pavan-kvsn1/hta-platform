# HTA Platform Security Architecture

## Overview

This document describes the security architecture for the HTA Platform, including Content Security Policy (CSP), XSS detection, security alerting, and defense-in-depth measures for protecting calibration certificate data.

## Table of Contents

1. [Content Security Policy](#content-security-policy)
2. [XSS Detection Pipeline](#xss-detection-pipeline)
3. [Security Alerting System](#security-alerting-system)
4. [Backend Authorization](#backend-authorization)
5. [Audit Trail](#audit-trail)
6. [Future CSP Improvements](#future-csp-improvements)

---

## Content Security Policy

### Current Implementation

**Location:** `apps/web-hta/src/middleware.ts`

```typescript
'script-src': [
  "'self'",
  "'unsafe-inline'",  // Required: Next.js App Router doesn't support nonces
],
```

### Why `'unsafe-inline'`?

Next.js App Router generates scripts at build time and runtime that don't support nonce injection:
- Hydration scripts (`__NEXT_DATA__`, inline event handlers)
- Prefetch and chunk loading scripts
- Client component initialization

These scripts are auto-generated without nonce attributes, causing CSP violations when strict nonce-only policies are applied.

### CSP Directives

| Directive | Value | Purpose |
|-----------|-------|---------|
| `default-src` | `'self'` | Default to same-origin only |
| `script-src` | `'self' 'unsafe-inline'` | Scripts from same origin |
| `style-src` | `'self' 'unsafe-inline'` | Styles (Tailwind requires inline) |
| `img-src` | `'self' data: blob: https://storage.googleapis.com` | Images from GCS |
| `connect-src` | `'self' https://*.sentry.io wss://*.pusher.com` | API and websocket connections |
| `frame-ancestors` | `'none'` | Prevent clickjacking |
| `object-src` | `'none'` | Block plugins |
| `report-uri` | `/api/csp-report` | Violation reporting (production) |

### Security Headers

All responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (production)

---

## XSS Detection Pipeline

### 1. Static Analysis (Build Time)

**Tool:** `eslint-plugin-security`

**Location:** `apps/api/eslint.config.mjs`, `apps/web-hta/eslint.config.mjs`

**Rules enabled:**
- `security/detect-unsafe-regex` - Prevents ReDoS attacks
- `security/detect-eval-with-expression` - Blocks dynamic eval
- `security/detect-object-injection` - Warns on bracket notation
- `security/detect-non-literal-regexp` - Flags dynamic regex

**CI Integration:** `.github/workflows/ci.yml` - `security-scan` job

### 2. Dependency Scanning (CI)

```yaml
# .github/workflows/ci.yml
security-scan:
  - pnpm audit --audit-level=high
  - Reports to GitHub Actions summary
```

### 3. Runtime Detection (Production)

**Flow:**
```
Browser CSP Violation
        │
        ▼
┌───────────────────────────────────┐
│ /api/csp-report (Next.js)         │
│ Location: apps/web-hta/src/app/   │
│           api/csp-report/route.ts │
│                                   │
│ - Rate limits: 10/min per URI     │
│ - Classifies severity (HIGH/LOW)  │
│ - Logs all violations             │
└───────────────────────────────────┘
        │
        │ HIGH severity only
        │ (external script-src)
        ▼
┌───────────────────────────────────┐
│ /api/security/csp-alert (API)     │
│ Location: apps/api/src/routes/    │
│           security/index.ts       │
│                                   │
│ - Logs to audit trail             │
│ - Sends email alerts via Resend   │
│ - Creates in-app notifications    │
└───────────────────────────────────┘
```

**HIGH Severity Triggers:**
- `script-src` violations from external URIs
- Indicates potential XSS attack or malicious script injection

---

## Security Alerting System

### Alert Flow

```
Security Event Detected
        │
        ▼
┌───────────────────────────────────┐
│ Email Alert (Primary)             │
│ Template: SecurityAlert.tsx       │
│ Recipients: All Master Admins     │
│                                   │
│ Subject: [HIGH] Security Alert:   │
│          CSP VIOLATION            │
│                                   │
│ Contains:                         │
│ - Blocked URI                     │
│ - Document location               │
│ - Source file & line number       │
│ - Recommended actions             │
│ - Dashboard link                  │
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│ In-App Notification (Backup)      │
│ Type: SECURITY_ALERT              │
│ Visible in admin dashboard        │
└───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────┐
│ Audit Log (Tamper-Evident)        │
│ External logging via pino         │
│ Fields: audit=true, security=true │
└───────────────────────────────────┘
```

### Configuration

**Environment Variables:**
```bash
RESEND_API_KEY=re_xxxxxxxxxxxx          # Email delivery
EMAIL_FROM=HTA Calibration <noreply@hta-calibration.com>
APP_URL=https://app.hta-calibration.com  # Dashboard links
```

### Master Instrument Change Alerts

**Location:** `apps/api/src/routes/admin/index.ts`

When any admin creates, modifies, or deletes a master instrument:
1. All other Master Admins receive in-app notification
2. Event logged to audit trail with `security: true` flag
3. Email alerts queued (when email service configured)

**Rationale:** Master instruments affect all calibration certificates. Unauthorized changes could compromise calibration accuracy and compliance.

---

## Backend Authorization

Even if XSS bypassed CSP, the backend enforces multiple layers:

### API Authentication

| Layer | Implementation | Location |
|-------|----------------|----------|
| JWT Validation | `@fastify/jwt` | `apps/api/src/server.ts` |
| Tenant Isolation | `tenantMiddleware` | `apps/api/src/middleware/tenant.ts` |
| Role Checks | `requireAdmin`, `requireMasterAdmin` | `apps/api/src/middleware/auth.ts` |

### Certificate Protection

| Protection | What it Prevents |
|------------|------------------|
| JWT Authentication | No anonymous edits |
| Role-based access | Engineers edit own drafts only |
| Section locking | Submitted sections need unlock approval |
| Revision workflow | Approved cert changes need review |
| Admin authorization | Final sign-off requires signature |
| Tenant isolation | Cross-tenant access blocked |

### Data Flow Authorization

```
User Request
     │
     ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ JWT Valid?  │--->│ Tenant      │--->│ Role        │
│             │ No │ Matches?    │ No │ Allowed?    │
│   401       │    │   403       │    │   403       │
└─────────────┘    └─────────────┘    └─────────────┘
     │ Yes              │ Yes              │ Yes
     └──────────────────┴──────────────────┘
                        │
                        ▼
                 ┌─────────────┐
                 │ Process     │
                 │ Request     │
                 └─────────────┘
```

---

## Audit Trail

### What's Logged

| Event | Fields | Location |
|-------|--------|----------|
| CSP Violations | `audit`, `security`, `blockedUri`, `documentUri` | `/api/csp-report` |
| Master Instrument Changes | `audit`, `security`, `action`, `actorId`, `instrument` | Admin routes |
| Certificate Events | `eventType`, `userId`, `certificateId`, `revision` | Certificate routes |
| Authentication | `userId`, `tenantId`, `action` | Auth routes |

### Log Format

```json
{
  "level": "warn",
  "time": 1714003200000,
  "audit": true,
  "security": true,
  "event": "CSP_VIOLATION_HIGH",
  "blockedUri": "https://evil.com/malicious.js",
  "documentUri": "https://app.hta-calibration.com/dashboard",
  "violatedDirective": "script-src",
  "notifiedAdmins": ["admin1@company.com", "admin2@company.com"]
}
```

### External Log Shipping

Logs with `audit: true` should be shipped to external SIEM for:
- Tamper-evidence (can't be modified by attackers with server access)
- Long-term retention for compliance
- Correlation with other security events

---

## Future CSP Improvements

### Phase 1: Current (Active)

Using `'unsafe-inline'` with compensating controls:
- `'self'` restriction blocks external scripts
- CSP violation reporting with email alerts
- ESLint security rules in CI
- Dependency auditing

### Phase 2: Strict CSP (When Needed)

Implement server-side HTML rewriting to inject nonces:

**Option A: Edge Middleware**
```typescript
// Transform HTML, inject nonces
const nonce = crypto.randomUUID()
html.replace(/<script>/g, `<script nonce="${nonce}">`)
```

**Option B: CDN-Level (Cloudflare Workers)**
```typescript
new HTMLRewriter()
  .on('script', { element(el) { el.setAttribute('nonce', nonce) }})
  .transform(response)
```

**Triggers for Phase 2:**
- Compliance audit requires strict CSP
- Penetration test identifies XSS vector
- Industry regulation mandates nonce-based CSP

### Phase 3: Advanced Monitoring

- Integrate with SIEM (Splunk, Datadog, etc.)
- Automated incident response
- Threat intelligence feeds
- Rate limiting per user/IP

---

## Compliance Mapping

| Standard | Requirement | Implementation | Status |
|----------|-------------|----------------|--------|
| ISO 27001 | Risk assessment | This document | Active |
| ISO 27001 | Security monitoring | CSP reporting + email alerts | Active |
| SOC 2 | Access controls | JWT + RBAC + tenant isolation | Active |
| SOC 2 | Audit logging | Tamper-evident external logs | Active |
| OWASP | XSS prevention | CSP + ESLint + input validation | Active |
| OWASP | Security headers | All OWASP recommended headers | Active |

---

## Related Files

| File | Purpose |
|------|---------|
| `apps/web-hta/src/middleware.ts` | CSP headers, security headers |
| `apps/web-hta/src/app/api/csp-report/route.ts` | CSP violation receiver |
| `apps/api/src/routes/security/index.ts` | Security alerts API |
| `apps/api/src/services/email.ts` | Email sending via Resend |
| `apps/api/src/routes/admin/index.ts` | Master instrument alerts |
| `packages/emails/src/templates/SecurityAlert.tsx` | Alert email template |
| `.github/workflows/ci.yml` | Security scan job |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-22 | Use `'unsafe-inline'` with compensating controls | Next.js App Router incompatibility with nonces |
| 2026-04-23 | Add CSP violation email alerts | Immediate notification for security events |
| 2026-04-23 | Add ESLint security plugin | Catch XSS patterns at build time |
| 2026-04-23 | Add master instrument change alerts | Detect unauthorized changes to critical data |

---

## References

- [Next.js CSP Discussion](https://github.com/vercel/next.js/discussions/17445)
- [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [MDN Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy)
- [Resend Email API](https://resend.com/docs)
