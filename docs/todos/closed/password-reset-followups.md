# Password Reset Follow-Ups

## Context

Forgot-password is currently available from both internal and customer login pages. The flow sends reset links by email through Resend, but reset links have been reported as showing "invalid reset link" when opened.

The reset token should be valid immediately after the request. There is no expected activation delay after email delivery.

## TODO

- [ ] Verify internal reset link generation and validation route alignment.
  - Likely mismatch to check: internal reset page calls `GET /api/auth/reset-password?token=...`, while the API may only implement `POST /api/auth/reset-password`.
- [ ] Verify customer reset link generation and validation route alignment.
  - Customer flow appears to have both `GET /api/customer/reset-password?token=...` and `POST /api/customer/reset-password`, but confirm against production behavior.
- [ ] Update forgot-password responses to explicitly tell users when an email is not registered, for both internal and customer login pages.
  - Note: this trades privacy/email-enumeration protection for clearer operational feedback.
- [ ] Add API tests for:
  - registered internal email
  - unregistered internal email
  - registered customer email
  - unregistered customer email
  - expired reset token
  - used reset token
  - customer token used on internal reset path
  - internal token used on customer reset path
- [ ] Add web tests for:
  - internal forgot-password error/success messaging
  - customer forgot-password error/success messaging
  - valid reset link loading
  - invalid reset link loading

