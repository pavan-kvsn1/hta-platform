# Customer Account Linking — Spec

**Problem:** Certificates store customer info as free text (`customerName`, `customerAddress`, `customerContactEmail`). There's no foreign key to `CustomerAccount`. This causes:
- Inconsistent naming ("Wipro" vs "Wipro Ltd" vs "WIPRO")
- Duplicate data entry (address/email repeated on every certificate)
- No structured link between certificates and customer portal accounts
- Admin must manually match certificates to customers for review/reporting

**Goal:** Link certificates to `CustomerAccount` records while keeping the workflow simple for engineers. No portal account required — just the company record.

---

## Current State

### Schema

```
CustomerAccount
  id, tenantId, companyName, address, contactEmail, contactPhone
  assignedAdminId, primaryPocId, isActive
  @@unique([tenantId, companyName])

Certificate
  customerName: String?          ← free text
  customerAddress: String?       ← free text, duplicated from account
  customerContactName: String?   ← free text
  customerContactEmail: String?  ← free text
  (no customerAccountId)
```

### Two customer access paths (unchanged)

1. **Token link** — `/customer/review/[token]` — no login, 7-day link, anyone can review
2. **Portal login** — `/customer/login` — registered `CustomerUser` with email/password

Both work independently of this change.

---

## Proposed Change

### Schema migration

Add `customerAccountId` to `Certificate`:

```prisma
model Certificate {
  // ... existing fields ...
  customerAccountId String?
  customerAccount   CustomerAccount? @relation(fields: [customerAccountId], references: [id])

  // Keep existing free-text fields as display/legacy
  customerName         String?
  customerAddress      String?
  customerContactName  String?
  customerContactEmail String?
}
```

- `customerAccountId` is **optional** (nullable) — legacy certs without a linked account still work
- Free-text fields kept for display and backward compatibility
- When `customerAccountId` is set, `customerName`/`customerAddress` are auto-populated from the account

### Engineer workflow (certificate creation/editing)

1. Engineer types in the customer name field
2. **Autocomplete** searches `CustomerAccount` by `companyName` (existing `/api/customers/search` endpoint)
3. **If match found** → engineer selects it → `customerAccountId` set, `customerName`/`customerAddress`/`customerContactEmail` auto-filled from account
4. **If no match** → engineer finishes typing → on save:
   - Auto-create a `CustomerAccount` with just `companyName` (address/email/phone empty)
   - Set `customerAccountId` on the certificate
   - Admin can enrich the account later (add address, email, assign POC)
5. **Offline (desktop)**: same flow but uses `ref_customers` cache for autocomplete. New accounts created locally, synced when online.

### What happens to the auto-created account

- Created with: `companyName` only, `isActive: true`, no `assignedAdminId`, no `primaryPocId`
- Shows up in the admin customer management page as "incomplete" (no contact info)
- Admin can later:
  - Add address, email, phone
  - Assign an admin owner
  - Invite a customer portal user (optional)
- Future certificates for the same customer auto-link to the same account

### Sending for customer review

Current flow (unchanged):
1. Reviewer clicks "Send to Customer" on a certificate
2. System finds the `CustomerAccount` by `customerAccountId` (new) or `customerName` string match (legacy fallback)
3. If account has a `CustomerUser` with portal access → notifies them in the portal
4. If no portal user → generates a token link and sends via email to `customerContactEmail`
5. Customer reviews via token link — no portal needed

### Backfill existing certificates

Migration script to link existing certificates to `CustomerAccount`:
```sql
UPDATE certificates c
SET customer_account_id = ca.id
FROM customer_accounts ca
WHERE c.tenant_id = ca.tenant_id
  AND LOWER(TRIM(c.customer_name)) = LOWER(TRIM(ca.company_name))
  AND c.customer_account_id IS NULL;
```

Certificates with no matching account remain unlinked (`customerAccountId = NULL`).

---

## Desktop app impact

### Online
- Autocomplete searches `ref_customers` cache first, then API
- New accounts synced to server via draft sync

### Offline
- Autocomplete from `ref_customers` cache only
- New account names stored on draft in SQLCipher
- On sync: server creates `CustomerAccount` if it doesn't exist, links it

---

## API changes

### Modified endpoints

| Endpoint | Change |
|---|---|
| `POST /api/certificates` | Accept `customerAccountId` in body. If not provided but `customerName` given, auto-create account. |
| `PUT /api/certificates/:id` | Same — accept `customerAccountId`, auto-create if new name. |
| `GET /api/certificates/:id` | Include `customerAccount` in response. |
| `GET /api/certificates/engineer` | Include `customerAccount.companyName` for display. |

### New endpoint

| Endpoint | Purpose |
|---|---|
| `POST /api/customers/quick-create` | Create a `CustomerAccount` with just `companyName`. Returns `{ id, companyName }`. Called by the certificate form when engineer enters a new customer. |

---

## Web app changes

### Certificate form component
- Customer name field becomes a **combobox** (autocomplete + free text)
- On selection from dropdown → set `customerAccountId`, auto-fill address/email
- On new entry (not in dropdown) → call `POST /api/customers/quick-create` on save
- Show indicator: "New customer — will be created" vs "Linked to existing account ✓"

### Admin customer management
- Show "incomplete" badge on accounts with no address/email
- Quick-edit inline to add missing info
- View all certificates linked to an account

---

## Migration plan

1. Add `customerAccountId` column to `Certificate` (nullable, no breaking change)
2. Add `quick-create` API endpoint
3. Update certificate create/update APIs to handle `customerAccountId`
4. Update certificate form with combobox
5. Run backfill script for existing certificates
6. Update desktop app `ref_customers` cache to include new accounts
7. Update admin UI to show linked certificates per account

---

## Files to modify

### Schema + migration
- `packages/database/prisma/schema.prisma` — add `customerAccountId` to Certificate
- New Prisma migration

### API
- `apps/api/src/routes/certificates/index.ts` — accept + auto-create in POST/PUT
- `apps/api/src/routes/customers/index.ts` — add `POST /quick-create`

### Web app
- Certificate form component (combobox for customer name)
- Admin customer management page (linked certs, incomplete badge)

### Desktop app
- `apps/desktop/src/main/ref-cache.ts` — include newly created accounts in sync
- Draft sync — handle `customerAccountId` in draft data
