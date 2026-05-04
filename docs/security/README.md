# Security Documentation

This directory contains security documentation for the HTA Platform.

## Documents

| Document | Description |
|----------|-------------|
| [security-architecture.md](./security-architecture.md) | Comprehensive security architecture including CSP, XSS detection, alerting, and compliance |
| [soc2_posture.md](../soc2_posture.md) | SOC2/ISO 27001 posture assessment with gap analysis and remediation roadmap |

## Quick Links

- **CSP Implementation:** `apps/web-hta/src/middleware.ts`
- **Security Alerts API:** `apps/api/src/routes/security/index.ts`
- **Email Templates:** `packages/emails/src/templates/SecurityAlert.tsx`
- **CI Security Scan:** `.github/workflows/ci.yml` (security-scan job)

## Environment Variables

```bash
# Required for email alerts
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=HTA Calibration <noreply@hta-calibration.com>
APP_URL=https://app.hta-calibration.com
```

## Security Contacts

For security issues, contact the platform administrators or file a confidential issue.
