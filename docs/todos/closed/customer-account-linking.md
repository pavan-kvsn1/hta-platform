# Customer Account Linking — Spec

**Problem:** Certificates store customer info as free text (`customerName`, `customerAddress`, `customerContactEmail`). There's no foreign key to `CustomerAccount`. This causes:
- Inconsistent naming ("Wipro" vs "Wipro Ltd" vs "WIPRO")
- Duplicate data entry (address/email repeated on every certificate)
- No structured link between certificates and customer portal accounts
- Admin must manually match certificates to customers for review/reporting

Additionally, the admin customer creation form (`admin/customers/new`) always requires a POC and sends a portal invitation. There's no way to create a token-only customer (company record without portal access).

**Goal:** 
1. Link certificates to `CustomerAccount` records via FK
2. Support two customer types: token-only (no portal) and portal (with users)
3. Engineers must select from existing customers (admin creates first)

---

## Part 1: Schema Changes

### Add FK to Certificate

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

- `customerAccountId` is **nullable** — legacy certs without a linked account still work
- Free-text fields kept for backward compatibility
- When `customerAccountId` is set, free-text fields auto-populated from the account

### Customer types (no schema change needed)

The distinction is implicit:
- **Token-only:** `CustomerAccount` with zero `CustomerUser` records → reviews via token links
- **Portal:** `CustomerAccount` with one or more `CustomerUser` records → portal login + dashboard

### Backfill existing certificates

```sql
UPDATE certificates c
SET customer_account_id = ca.id
FROM customer_accounts ca
WHERE c.tenant_id = ca.tenant_id
  AND LOWER(TRIM(c.customer_name)) = LOWER(TRIM(ca.company_name))
  AND c.customer_account_id IS NULL;
```

---

## Part 2: Admin Customer Pages

### 2A: `admin/customers` (list page)

**Current:** Shows all customers as one flat list. No distinction between portal and token-only.

**New:**
- Add **access type badge** per customer:
  - Green "Portal" badge → has `CustomerUser` records
  - Gray "Token-only" badge → zero `CustomerUser` records
- Add **filter tabs**: All / Portal / Token-only
- Add **certificate count** column → number of certificates linked to this account
- Add **"incomplete" indicator** → account missing address or contact email
- Existing columns stay: company name, contact email, assigned admin, created date

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Customers                                    [+ New Customer]   │
│                                                                 │
│ [All (12)]  [Portal (3)]  [Token-only (9)]      🔍 Search...   │
│                                                                 │
│ Company          Access      Certs   Contact         Admin      │
│ ────────────────────────────────────────────────────────────────│
│ Wipro Ltd        Portal ●     8     info@wipro.com   Kiran K   │
│ Bosch India      Token  ○     3     —                —         │
│ Infosys          Portal ●     12    qa@infosys.com   Priya S   │
│ TCS Mumbai       Token  ○     1     ⚠ incomplete     —         │
│ Siemens          Token  ○     5     eng@siemens.com  —         │
└─────────────────────────────────────────────────────────────────┘
```

### 2B: `admin/customers/new` (create page)

**Current:** Single form, POC name + email required, always creates `CustomerUser` + sends invitation.

**New:** Two-step flow with portal toggle.

**Step 1 — Company info (always required):**
- Company name *
- Address (optional)
- Contact email (optional)
- Contact phone (optional)
- Assigned admin (optional)

**Step 2 — Portal access toggle:**
- Default: OFF (token-only)
- Toggle label: "Enable customer portal access"
- When OFF:
  - Creates `CustomerAccount` only
  - No `CustomerUser`, no invitation
  - Button: "Create Customer"
  - "What Happens Next" panel: "Token-only — certificates will be reviewed via email links"
- When ON:
  - POC fields appear (name *, email *)
  - Creates `CustomerAccount` + `CustomerUser` + sends invitation
  - Button: "Create & Send Invitation"
  - "What Happens Next" panel: current flow (invitation → activation → portal)

**Wireframe (toggle OFF):**
```
┌──────────────────────────────────────────┐  ┌─────────────────────┐
│ Create Customer Account                  │  │ Preview             │
│                                          │  │                     │
│ COMPANY INFORMATION                      │  │ ┌─────────────────┐ │
│ Company Name *  [___________________]    │  │ │ 🏢 Acme Corp    │ │
│ Address         [___________________]    │  │ │ Token-only      │ │
│ Email           [________] Phone [____]  │  │ │                 │ │
│ Assigned Admin  [Select...]              │  │ │ 📧 info@acme... │ │
│                                          │  │ └─────────────────┘ │
│ PORTAL ACCESS                            │  │                     │
│ Enable customer portal  [ OFF ]          │  │ What Happens Next   │
│                                          │  │                     │
│ Portal is off. This customer will        │  │ ✓ Account created   │
│ review certificates via email links.     │  │ 📧 Reviews via      │
│                                          │  │   token links       │
│        [Cancel]  [Create Customer]       │  │ 🔄 Upgrade to       │
│                                          │  │   portal anytime    │
└──────────────────────────────────────────┘  └─────────────────────┘
```

**Wireframe (toggle ON):**
```
┌──────────────────────────────────────────┐  ┌─────────────────────┐
│ Create Customer Account                  │  │ Preview             │
│                                          │  │                     │
│ COMPANY INFORMATION                      │  │ ┌─────────────────┐ │
│ Company Name *  [___________________]    │  │ │ 🏢 Acme Corp    │ │
│ Address         [___________________]    │  │ │ Portal ●        │ │
│ Email           [________] Phone [____]  │  │ │                 │ │
│ Assigned Admin  [Select...]              │  │ │ 👤 John Smith   │ │
│                                          │  │ │ john@acme.com   │ │
│ PORTAL ACCESS                            │  │ └─────────────────┘ │
│ Enable customer portal  [ ON  ]          │  │                     │
│                                          │  │ What Happens Next   │
│ PRIMARY POINT OF CONTACT                 │  │                     │
│ POC Name *      [___________________]    │  │ ✓ Account created   │
│ POC Email *     [___________________]    │  │ 📧 Invitation sent  │
│                                          │  │ ⏳ Awaiting activation│
│ POC is the main contact who can manage   │  │ 🟢 Ready to use     │
│ users and approve certificates.          │  │                     │
│                                          │  │                     │
│     [Cancel]  [Create & Send Invitation] │  │                     │
└──────────────────────────────────────────┘  └─────────────────────┘
```

### 2C: `admin/customers/[id]` (detail/edit page)

**Current:** Shows customer account details + list of users.

**New additions:**

1. **Access type badge** in header: "Portal ●" or "Token-only ○"

2. **"Upgrade to Portal" button** (only for token-only customers):
   - Opens a modal/section to add POC (name + email)
   - Creates `CustomerUser` + sends invitation
   - Badge changes from "Token-only" to "Portal"

3. **Linked Certificates section:**
   - Table of all certificates where `customerAccountId` matches
   - Columns: certificate number, status, engineer, date
   - Link to each certificate

4. **Review History section:**
   - Token links sent for this customer's certificates
   - Shows: certificate number, sent to, sent date, status (pending/reviewed/expired)

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to Customers                                             │
│                                                                 │
│ 🏢 Wipro Ltd                              Token-only ○          │
│ info@wipro.com · +91 9876543210          [Upgrade to Portal]    │
│ 123 Industrial Area, Bangalore                                  │
│ Assigned to: Kiran Kumar                                        │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ LINKED CERTIFICATES                                    (8) │ │
│ │                                                             │ │
│ │ Certificate #    Status          Engineer     Date          │ │
│ │ HTA-CAL-0042    APPROVED        Ravi K      May 1, 2026   │ │
│ │ HTA-CAL-0038    PENDING         Priya S     Apr 28, 2026  │ │
│ │ HTA-CAL-0035    DRAFT           Amit T      Apr 25, 2026  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ REVIEW HISTORY                                              │ │
│ │                                                             │ │
│ │ Certificate     Sent to              Date       Status      │ │
│ │ HTA-CAL-0042   info@wipro.com       May 2      ✓ Reviewed  │ │
│ │ HTA-CAL-0038   info@wipro.com       Apr 30     ⏳ Pending   │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Engineer Certificate Form

### Workflow (Option A: admin creates first, engineer selects)

1. Engineer opens certificate form → customer name field is a **combobox** (dropdown autocomplete)
2. Types to search → matches against `CustomerAccount.companyName`
3. **Must select from existing accounts** — no free text allowed
4. On selection → `customerAccountId` set, `customerName`/`customerAddress`/`customerContactEmail` auto-filled
5. If customer not in list → field shows: "Customer not found. Ask your admin to create the account."
6. Engineer can still save the certificate as DRAFT without a customer (optional field)

### Sending for review

1. Reviewer clicks "Send to Customer" on a certificate
2. System uses `customerAccountId` to find the `CustomerAccount`
3. If account has `CustomerUser` records (portal) → notify via portal + email
4. If no users (token-only) → generate token link → send to `customerContactEmail` or `customerContactEmail` from account
5. Customer reviews via token link or portal — both paths work

### Desktop app (offline)

- Autocomplete from `ref_customers` cache in SQLCipher
- If customer not in cache → "Customer not found. Go online to refresh customer list."
- Certificate can be saved as draft without customer selected

---

## Part 4: API Changes

### Modified endpoints

| Endpoint | Change |
|---|---|
| `POST /api/certificates` | Accept `customerAccountId`. Auto-fill `customerName`/`customerAddress` from account. |
| `PUT /api/certificates/:id` | Same as above. |
| `GET /api/certificates/:id` | Include `customerAccount` in response. |
| `GET /api/certificates/engineer` | Include `customerAccount.companyName`. |
| `POST /api/admin/customers` | Make POC fields optional (only required when portal enabled). |
| `GET /api/admin/customers` | Include `_count.users` for portal/token-only classification. Include `_count.certificates` for cert count. |

### New endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/customers/all` | List all active customers (already added). |
| `POST /api/admin/customers/:id/upgrade` | Add POC to a token-only customer → creates `CustomerUser` + sends invitation. |
| `GET /api/admin/customers/:id/certificates` | List certificates linked to this account. |
| `GET /api/admin/customers/:id/reviews` | List token review history for this account's certificates. |

---

## Part 5: Implementation Order

### Phase 1: Schema + API (non-breaking)
1. Prisma migration: add `customerAccountId` to Certificate
2. Update `POST/PUT /api/certificates` to accept `customerAccountId`
3. Update `GET /api/certificates/:id` to include `customerAccount`
4. Make POC optional in `POST /api/admin/customers`
5. Add `POST /api/admin/customers/:id/upgrade`
6. Run backfill script for existing certificates

### Phase 2: Admin UI
7. `admin/customers` list: add access type badge, filter tabs, cert count
8. `admin/customers/new`: add portal toggle, make POC conditional
9. `admin/customers/[id]`: add upgrade button, linked certs, review history

### Phase 3: Engineer form
10. Certificate form: replace free text with combobox (select from existing only)
11. Show "not found" message with admin prompt

### Phase 4: Desktop app
12. Update `ref_customers` cache sync
13. Certificate form offline: combobox from local cache

---

## Files to Modify

### Schema
- `packages/database/prisma/schema.prisma` — add `customerAccountId` FK
- New Prisma migration

### API
- `apps/api/src/routes/certificates/index.ts` — accept `customerAccountId` in POST/PUT
- `apps/api/src/routes/admin/index.ts` — make POC optional, add upgrade endpoint, add cert/review list
- `apps/api/src/routes/customers/index.ts` — `GET /all` already done

### Web app
- `apps/web-hta/src/app/admin/customers/page.tsx` — access badge, filter, cert count
- `apps/web-hta/src/app/admin/customers/new/page.tsx` — portal toggle, conditional POC
- `apps/web-hta/src/app/admin/customers/[id]/page.tsx` — upgrade button, linked certs, review history
- Certificate form component — combobox for customer selection

### Desktop app
- `apps/desktop/src/main/ref-cache.ts` — already syncing via `/api/customers/all`
- Draft sync — include `customerAccountId` in draft data
