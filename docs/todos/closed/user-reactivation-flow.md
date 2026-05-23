# User Reactivation Flow

## Problem

When an admin reactivates a deactivated user, the current flow simply sets `isActive = true` and lets them log in with their existing credentials. This is wrong because:

1. The user may have never activated (never set a password)
2. The user may have forgotten their password after being inactive
3. Security risk: old credentials may be compromised
4. No audit trail of re-verification

Additionally, the "Create User" page returns "A user with this email already exists" when the user exists but is inactive, with no way to reactivate from that screen.

## Current Flow

```
Admin clicks "Reactivate" 
  → PUT /api/admin/users/:id/reactivate
  → Sets isActive = true
  → User logs in immediately with old password
```

## Correct Flow

```
Admin clicks "Reactivate"
  → PUT /api/admin/users/:id/reactivate
  → Sets isActive = true
  → Invalidates password (passwordHash = null)
  → Generates new activationToken (24hr expiry)
  → Sends activation email (same template as initial creation)
  → User receives email → clicks link → sets new password → logs in
```

---

## Scope of Changes

### Phase 1: API — Reactivate Endpoint

**File:** `apps/api/src/routes/` (wherever `PUT /reactivate` handler lives)

Current behavior:
- Sets `isActive = true` on the User record

New behavior:
- Set `isActive = true`
- Set `passwordHash = null` (forces password setup on activation)
- Generate new `activationToken` (crypto.randomBytes) + `activationTokenExpiresAt` (now + 24 hours)
- Send activation email using the existing email template from user creation
- Return `{ success: true, message: 'Activation email sent' }`

### Phase 2: Frontend — Reactivate Dialog

**File:** `apps/web-hta/src/app/admin/users/[id]/edit/page.tsx`

Current dialog text (line ~644):
```
"This will allow {user.name} to log in again with their existing credentials."
```

New dialog text:
```
"This will send a new activation email to {user.email}. 
They will need to set a new password before logging in."
```

- Update dialog title: "Reactivate User?" → "Reactivate & Send Activation Email?"
- Update button text: "Reactivate" → "Reactivate & Send Email"
- On success: show green banner "Activation email sent to {email}. The link expires in 24 hours."

### Phase 3: Frontend — Create User Page (Inactive User Handling)

**File:** `apps/web-hta/src/app/admin/users/new/page.tsx`

When `POST /api/admin/users` returns error "A user with this email already exists":

- API should include `isActive` status in the error response: `{ error: '...', isActive: false, userId: '...' }`
- If `isActive === false`, show a different UI:
  ```
  "A user with this email exists but is currently inactive."
  [Reactivate & Send Activation Email]  [Cancel]
  ```
- Clicking "Reactivate" calls `PUT /api/admin/users/:userId/reactivate`
- On success: show the same success screen as user creation ("Activation email sent...")

### Phase 4: API — Enhanced Error Response for Duplicate Email

**File:** Same API route that handles `POST /api/admin/users`

When a user with the email already exists:
- If `isActive === true`: return `{ error: 'A user with this email already exists' }` (current behavior)
- If `isActive === false`: return `{ error: 'A user with this email exists but is inactive', isActive: false, userId: user.id }` (new)

---

## Verification

1. Create a new user → receives activation email → activates → works
2. Deactivate the user → cannot log in
3. Reactivate the user → receives NEW activation email → must set new password → works
4. Old password no longer works after reactivation
5. Try to create a user with the same email as an inactive user → shows reactivation option instead of error
6. Activation link expires after 24 hours

## Notes

- Reuse the existing activation email template — no new email design needed
- The activation token generation and email sending logic already exists in the user creation flow — extract into a shared helper if not already
- Consider: should reactivation also revoke any existing VPN peers / desktop device registrations? (Probably yes for security, but can be a follow-up)
