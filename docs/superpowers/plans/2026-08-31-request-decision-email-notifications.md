# Request Decision Email Notifications Implementation Plan

> **For implementation:** Use `superpowers:executing-plans` to implement this plan inline, task by task. Do not delegate work to subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send branded, retryable approval and rejection emails for all four internal and four customer request types to the approved recipient sets.

**Architecture:** Add two typed decision templates to `@hta/emails`, backed by one shared presentation component and request-specific content adapters. Extend the API-to-BullMQ contract and production worker so decisions are queued with three retry attempts, then wire the existing admin review endpoints to resolve and deduplicate recipients after successful state changes.

**Tech Stack:** TypeScript, React Email, Fastify, BullMQ, Resend, Vitest, Prisma

**Spec:** `docs/wireframes/request-decision-email-notifications.md`

## Global Constraints

- Execute inline without subagents, per the user's standing instruction.
- Preserve existing in-app notifications.
- Use “HTA Instrumentation Pvt. Ltd.” in the default email header and footer.
- Never include offline codes, VPN provisioning tokens, private keys, password tokens, or export data in email or logs.
- Send decision emails only after the decision and type-specific action succeed.
- Queue jobs use three attempts and exponential backoff through the existing `enqueueEmail` path.
- A queue failure must not roll back an approved or rejected request; return an `emailWarning` and log the failure.
- Repeated review attempts must not enqueue duplicates.
- Internal rejections require a non-empty administrator reason.
- Treat the existing `CustomerActivation` template as a prerequisite and keep it separate from decision emails.
- Do not fix the unrelated existing `CustomerAuthorizedToken` “30 days” assertion as part of this work.

---

### Task 1: Shared branded email header

**Files:**
- Modify: `packages/emails/src/components/Layout.tsx:15-110`
- Modify: `packages/emails/tests/components.test.tsx:80-132`
- Modify: `apps/web-hta/src/emails/components/Layout.tsx:31-108`
- Create: `apps/web-hta/tests/unit/email-layout.test.tsx`

**Interfaces:**
- Consumes: `TenantBranding { name, logoUrl?, websiteUrl? }`
- Produces: an email-safe logo-and-title row used by every shared email layout

- [ ] **Step 1: Write failing branding tests**

```tsx
it('renders the default HTA logo beside the full company name', async () => {
  const html = await render(<Layout preview="Test"><p>Body</p></Layout>)
  expect(html).toContain('/logo.png')
  expect(html).toContain('HTA Instrumentation Pvt. Ltd.')
  expect(html).toContain('width="32"')
  expect(html).toContain('height="32"')
})

it('renders a custom tenant logo beside its tenant name', async () => {
  const html = await render(
    <Layout preview="Test" tenant={{ name: 'Lab One', logoUrl: 'https://lab.test/logo.png' }}>
      <p>Body</p>
    </Layout>,
  )
  expect(html).toContain('https://lab.test/logo.png')
  expect(html).toContain('Lab One')
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --dir packages/emails test -- tests/components.test.tsx && pnpm --dir apps/web-hta test -- tests/unit/email-layout.test.tsx`

Expected: FAIL because the package currently renders either a logo or a title, and the web layout renders a distorted logo without the title.

- [ ] **Step 3: Implement the email-safe header row**

Use React Email `Row` and `Column`; do not use flexbox for email layout.

```tsx
const defaultBranding: TenantBranding = {
  name: 'HTA Instrumentation Pvt. Ltd.',
  primaryColor: '#1e40af',
  supportEmail: 'support@htainstrumentation.com',
  websiteUrl: process.env.FRONTEND_URL || 'https://hta-calibration.com',
}

const logoUrl = branding.logoUrl || `${baseUrl}/logo.png`

<Row style={{ width: 'auto', margin: '0 auto' }}>
  <Column style={{ width: '32px', verticalAlign: 'middle' }}>
    <Img src={logoUrl} width="32" height="32" alt={`${branding.name} logo`} />
  </Column>
  <Column style={{ paddingLeft: '10px', verticalAlign: 'middle' }}>
    <Text style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: colors.primary }}>
      {branding.name}
    </Text>
  </Column>
</Row>
```

Apply the same structure to the web-local layout, using `${baseUrl}/logo.png` and the exact HTA company name.

- [ ] **Step 4: Run focused tests and type-check both consumers**

Run:

```bash
pnpm --dir packages/emails test -- tests/components.test.tsx
pnpm --dir packages/emails typecheck
pnpm --dir apps/web-hta test -- tests/unit/email-layout.test.tsx
pnpm --dir apps/web-hta typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the branding change**

```bash
git add packages/emails/src/components/Layout.tsx packages/emails/tests/components.test.tsx apps/web-hta/src/emails/components/Layout.tsx apps/web-hta/tests/unit/email-layout.test.tsx
git commit -m "feat: standardize notification email branding"
```

---

### Task 2: Typed request-decision email components

**Files:**
- Create: `packages/emails/src/templates/RequestDecisionEmail.tsx`
- Create: `packages/emails/src/templates/InternalRequestDecision.tsx`
- Create: `packages/emails/src/templates/CustomerRequestDecision.tsx`
- Modify: `packages/emails/src/templates/index.ts`
- Create: `packages/emails/tests/request-decision-templates.test.tsx`

**Interfaces:**
- Produces: exported `RequestDecision`, `InternalRequestType`, `CustomerRequestType`, `PocAudience`, `InternalRequestDecisionProps`, `CustomerRequestDecisionProps`, and two React Email templates
- Consumes: the approved copy and CTA matrix in spec sections 4 and 5

- [ ] **Step 1: Write table-driven failing template tests**

```tsx
const internalCases = [
  ['SECTION_UNLOCK', 'APPROVED', 'Section Unlock Approved', 'Edit Certificate'],
  ['SECTION_UNLOCK', 'REJECTED', 'Section Unlock Rejected', 'Not approved'],
  ['FIELD_CHANGE', 'APPROVED', 'Field Change Request Approved', 'Review Certificate'],
  ['FIELD_CHANGE', 'REJECTED', 'Field Change Request Rejected', 'Not approved'],
  ['OFFLINE_CODE_REQUEST', 'APPROVED', 'Offline Code Card Approved', 'View Offline Codes'],
  ['OFFLINE_CODE_REQUEST', 'REJECTED', 'Offline Code Card Request Rejected', 'Not approved'],
  ['DESKTOP_VPN_REQUEST', 'APPROVED', 'Desktop VPN Access Approved', 'View VPN Setup Details'],
  ['DESKTOP_VPN_REQUEST', 'REJECTED', 'Desktop VPN Access Request Rejected', 'Not approved'],
] as const

it.each(internalCases)('renders %s %s', async (requestType, decision, heading, marker) => {
  const html = await render(<InternalRequestDecision
    recipientName="Engineer One"
    requestType={requestType}
    decision={decision}
    requestDate="31 Aug 2026"
    certificateId="cert-1"
    certificateNumber="HTA/C00001/26/08"
    requestedItems={['Results', 'Conclusion']}
    originalReason="Correction required"
    adminNote={decision === 'REJECTED' ? 'Insufficient evidence' : 'Reviewed'}
    portalUrl="https://hta-calibration.com"
  />)
  expect(html).toContain(heading)
  expect(html).toContain(marker)
})
```

Add customer cases for `USER_ADDITION`, `POC_CHANGE` with all three approved audiences, `ACCOUNT_DELETION`, and `DATA_EXPORT`, for both outcomes. Assert that account-deletion approval has no portal CTA and data-export approval contains “approved for preparation” but not “ready” or “attached.”

- [ ] **Step 2: Run the template test and verify RED**

Run: `pnpm --dir packages/emails test -- tests/request-decision-templates.test.tsx`

Expected: FAIL because the template modules do not exist.

- [ ] **Step 3: Define strict template props**

```ts
export type RequestDecision = 'APPROVED' | 'REJECTED'
export type InternalRequestType =
  | 'SECTION_UNLOCK'
  | 'FIELD_CHANGE'
  | 'OFFLINE_CODE_REQUEST'
  | 'DESKTOP_VPN_REQUEST'

export type CustomerRequestType =
  | 'USER_ADDITION'
  | 'POC_CHANGE'
  | 'ACCOUNT_DELETION'
  | 'DATA_EXPORT'

export type PocAudience = 'REQUESTER' | 'PREVIOUS_POC' | 'NEW_POC'
export interface DecisionDetail { label: string; value: string }
```

Make rejected props a discriminated union requiring `adminNote`/`rejectionReason`; approved props may carry an optional note. Re-export every public type and both templates from `packages/emails/src/templates/index.ts`, which is already re-exported by the package root.

- [ ] **Step 4: Implement `RequestDecisionEmail` presentation**

```tsx
export interface RequestDecisionEmailProps {
  preview: string
  heading: string
  decision: RequestDecision
  recipientName: string
  summary: React.ReactNode
  details: DecisionDetail[]
  cta?: { label: string; href: string }
  tenantName?: string
}
```

Render the shared `Layout`, green/red decision badge, greeting, summary, escaped detail rows, optional CTA, and footer. Do not accept arbitrary HTML.

- [ ] **Step 5: Implement both content adapters**

Use exhaustive `switch (requestType)` blocks. Build subjects, previews, headings, summaries, detail lists, and CTAs exactly from spec sections 4 and 5. Throw on unsupported request type, decision, or POC audience combinations. Never add `provisioningToken`, offline-code values, private keys, or export payload fields to either props interface.

- [ ] **Step 6: Run template tests and package type-check**

Run: `pnpm --dir packages/emails test -- tests/request-decision-templates.test.tsx && pnpm --dir packages/emails typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the template components**

```bash
git add packages/emails/src/templates/RequestDecisionEmail.tsx packages/emails/src/templates/InternalRequestDecision.tsx packages/emails/src/templates/CustomerRequestDecision.tsx packages/emails/src/templates/index.ts packages/emails/tests/request-decision-templates.test.tsx
git commit -m "feat: add request decision email templates"
```

---

### Task 3: Register templates in the shared renderer

**Files:**
- Modify: `packages/emails/src/render.ts:8-165`
- Modify: `packages/emails/tests/render.test.ts`
- Modify: `packages/emails/tests/index.test.ts`

**Interfaces:**
- Produces: `EmailTemplate` values `internal-request-decision` and `customer-request-decision`
- Consumes: components and prop types from Task 2

- [ ] **Step 1: Add failing renderer and public-export tests**

```ts
expect(getEmailSubject('internal-request-decision', {
  requestType: 'SECTION_UNLOCK', decision: 'APPROVED', certificateNumber: 'CERT-1',
})).toBe('Section Unlock Request Approved — CERT-1')

expect(getEmailSubject('customer-request-decision', {
  requestType: 'POC_CHANGE', decision: 'REJECTED', companyName: 'Acme',
})).toBe('POC Change Request Rejected — Acme')

expect(emails.InternalRequestDecision).toBeDefined()
expect(emails.CustomerRequestDecision).toBeDefined()
```

- [ ] **Step 2: Run renderer tests and verify RED**

Run: `pnpm --dir packages/emails test -- tests/render.test.ts tests/index.test.ts`

Expected: FAIL because the renderer does not recognize the new identifiers.

- [ ] **Step 3: Add exhaustive render and subject cases**

Extend `EmailTemplate`, `renderEmail`, and `getEmailSubject`. Centralize subject builders in the corresponding template module so rendered and queried subjects cannot diverge.

- [ ] **Step 4: Run renderer tests and build the package**

Run: `pnpm --dir packages/emails test -- tests/render.test.ts tests/index.test.ts && pnpm --dir packages/emails build`

Expected: PASS.

- [ ] **Step 5: Commit renderer registration**

```bash
git add packages/emails/src/render.ts packages/emails/tests/render.test.ts packages/emails/tests/index.test.ts
git commit -m "feat: register request decision email rendering"
```

---

### Task 4: Extend API and worker queue contracts

**Files:**
- Modify: `apps/api/src/services/queue.ts:10-180,190-455`
- Modify: `apps/api/tests/unit/queue.test.ts`
- Modify: `apps/worker/src/types.ts:7-135`
- Modify: `apps/worker/src/jobs/email.ts:48-182`
- Modify: `apps/worker/tests/unit/email.test.ts`

**Interfaces:**
- Produces: `InternalRequestDecisionEmailJob`, `CustomerRequestDecisionEmailJob`, `queueInternalRequestDecisionEmail`, and `queueCustomerRequestDecisionEmail`
- Consumes: renderer identifiers from Task 3 and the exported request/decision types from Task 2

- [ ] **Step 1: Write failing API queue tests**

```ts
await queueInternalRequestDecisionEmail({
  to: 'engineer@example.com', recipientName: 'Engineer', requestType: 'SECTION_UNLOCK',
  decision: 'REJECTED', certificateId: 'cert-1', certificateNumber: 'CERT-1',
  requestedItems: ['Results'], originalReason: 'Correction', adminNote: 'Not justified',
  requestDate: '31 Aug 2026',
})
expect(mockQueueAdd).toHaveBeenCalledWith('internal-request-decision',
  expect.objectContaining({ type: 'internal-request-decision', adminNote: 'Not justified' }),
  expect.objectContaining({ attempts: 3 }),
)
```

Add the corresponding customer job assertion.

- [ ] **Step 2: Write failing worker mapping tests**

Assert that each new job calls `renderEmail` with its matching template identifier and all typed props, excluding `to`.

- [ ] **Step 3: Run API and worker focused tests and verify RED**

Run: `pnpm --dir apps/api test -- tests/unit/queue.test.ts && pnpm --dir apps/worker test -- tests/unit/email.test.ts`

Expected: FAIL because the new job types and switch cases are absent.

- [ ] **Step 4: Add mirrored discriminated job types and queue helpers**

Import the shared request, decision, and POC-audience types from `@hta/emails` in both the API and worker contracts. Keep only delivery fields (`to` and the job `type`) local to the queue layer so request identifiers cannot drift from the renderer.

```ts
import type { InternalRequestType, RequestDecision } from '@hta/emails'

export interface InternalRequestDecisionEmailJob extends BaseEmailJob {
  type: 'internal-request-decision'
  recipientName: string
  requestType: InternalRequestType
  decision: RequestDecision
  requestDate: string
  certificateId?: string
  certificateNumber?: string
  requestedItems?: string[]
  originalReason?: string
  adminNote?: string
  portalUrl: string
}
```

Define the customer job with `audience`, company and POC/user fields, rejection reason, `wasPoc`, and `portalUrl`. Add both unions to API and worker types. Queue helpers call `enqueueEmail(job, { required: true })` so callers can surface a warning.

- [ ] **Step 5: Add worker render switch cases**

Map jobs to `renderEmail({ template, props })`; do not log full job data. Preserve the existing rethrow so BullMQ retries.

- [ ] **Step 6: Run focused tests and type-check API and worker**

Run:

```bash
pnpm --dir apps/api test -- tests/unit/queue.test.ts
pnpm --dir apps/worker test -- tests/unit/email.test.ts
pnpm --dir apps/api typecheck
pnpm --dir apps/worker typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the queue contract**

```bash
git add apps/api/src/services/queue.ts apps/api/tests/unit/queue.test.ts apps/worker/src/types.ts apps/worker/src/jobs/email.ts apps/worker/tests/unit/email.test.ts
git commit -m "feat: queue request decision emails"
```

---

### Task 5: Recipient resolution and warning helpers

**Files:**
- Create: `apps/api/src/services/request-decision-emails.ts`
- Create: `apps/api/tests/unit/request-decision-emails.test.ts`
- Modify: `apps/api/src/services/index.ts`

**Interfaces:**
- Produces: `dedupeDecisionRecipients`, `sendInternalDecisionEmail`, `sendCustomerDecisionEmails`
- Consumes: queue helpers from Task 4

- [ ] **Step 1: Write failing recipient-priority tests**

```ts
expect(dedupeDecisionRecipients([
  { email: 'same@example.com', audience: 'REQUESTER', priority: 1 },
  { email: 'SAME@example.com', audience: 'NEW_POC', priority: 3 },
])).toEqual([{ email: 'SAME@example.com', audience: 'NEW_POC', priority: 3 }])
```

Test requester-only internal delivery, requester-only customer rejection, three-party POC approval, account-deletion original address, and queue failure returning one warning without throwing.

- [ ] **Step 2: Run the helper test and verify RED**

Run: `pnpm --dir apps/api test -- tests/unit/request-decision-emails.test.ts`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement deterministic deduplication and dispatch**

```ts
export type DecisionRecipient = {
  email: string
  recipientName: string
  audience: 'REQUESTER' | 'PREVIOUS_POC' | 'NEW_POC'
  priority: 1 | 2 | 3
}

export function dedupeDecisionRecipients(recipients: DecisionRecipient[]): DecisionRecipient[] {
  const byEmail = new Map<string, DecisionRecipient>()
  for (const candidate of recipients) {
    const key = candidate.email.trim().toLowerCase()
    const current = byEmail.get(key)
    if (key && (!current || candidate.priority > current.priority)) byEmail.set(key, candidate)
  }
  return [...byEmail.values()]
}
```

Dispatch with `Promise.allSettled`; return `{ emailWarning?: string }` if any required queue call rejects. Log request ID, type, decision, and failed recipient address only—never payload secrets.

- [ ] **Step 4: Run helper tests and API type-check**

Run: `pnpm --dir apps/api test -- tests/unit/request-decision-emails.test.ts && pnpm --dir apps/api typecheck`

Expected: PASS.

- [ ] **Step 5: Commit recipient services**

```bash
git add apps/api/src/services/request-decision-emails.ts apps/api/tests/unit/request-decision-emails.test.ts apps/api/src/services/index.ts
git commit -m "feat: resolve request decision recipients"
```

---

### Task 6: Wire all internal request decisions

**Files:**
- Modify: `apps/api/src/routes/admin/index.ts:2814-3065`
- Modify: `apps/api/tests/unit/admin-routes.test.ts`

**Interfaces:**
- Consumes: `sendInternalDecisionEmail` from Task 5
- Produces: one queued decision email per successful internal review and optional `emailWarning`

- [ ] **Step 1: Add failing route tests for all eight internal outcomes**

Mock `../../src/services/request-decision-emails.js` at the route boundary. Table-drive four types × two decisions. Assert the dispatch helper receives the persisted requester email/name, certificate context, requested items, original reason, administrator note, request date, and correct decision. Assert a rejection without `adminNote.trim()` returns HTTP 400 and does not update or dispatch.

- [ ] **Step 2: Run the focused route tests and verify RED**

Run: `pnpm --dir apps/api test -- tests/unit/admin-routes.test.ts`

Expected: FAIL because review results are in-app only.

- [ ] **Step 3: Validate internal rejection reasons before mutation**

```ts
if (body.action === 'reject' && !body.adminNote?.trim()) {
  return reply.status(400).send({ error: 'Rejection reason is required' })
}
```

- [ ] **Step 4: Queue after every successful type-specific action**

Call `sendInternalDecisionEmail` once after section unlock, field change, offline-code generation, or VPN-token generation/rejection completes. Pass no token or offline-code data. Merge returned `emailWarning` into the success response.

- [ ] **Step 5: Run route tests and API type-check**

Run: `pnpm --dir apps/api test -- tests/unit/admin-routes.test.ts && pnpm --dir apps/api typecheck`

Expected: PASS.

- [ ] **Step 6: Commit internal decision wiring**

```bash
git add apps/api/src/routes/admin/index.ts apps/api/tests/unit/admin-routes.test.ts
git commit -m "feat: email internal request decisions"
```

---

### Task 7: Wire all customer request decisions

**Files:**
- Modify: `apps/api/src/routes/admin/index.ts:5315-5565`
- Modify: `apps/api/tests/unit/admin-routes.test.ts`

**Interfaces:**
- Consumes: `sendCustomerDecisionEmails` from Task 5 and existing `customer-activation`
- Produces: approved/rejected requester emails, tailored POC emails, and optional `emailWarning`

- [ ] **Step 1: Add failing customer recipient tests**

Use the same mocked request-decision dispatch service as Task 6, while preserving the existing activation-email mock for the invited user.

Cover:

```text
USER_ADDITION approved: requester decision + invited-user activation
USER_ADDITION rejected: requester only
POC_CHANGE approved: requester + previous POC + new POC, deduplicated by priority
POC_CHANGE rejected: requester only
ACCOUNT_DELETION approved: original requester email captured before anonymization, no CTA
ACCOUNT_DELETION rejected: requester only
DATA_EXPORT approved: requester; “approved for preparation,” no file-ready claim
DATA_EXPORT rejected: requester only
```

Also assert a repeated decision returns 400 and queues nothing.

- [ ] **Step 2: Run customer route tests and verify RED**

Run: `pnpm --dir apps/api test -- tests/unit/admin-routes.test.ts`

Expected: FAIL because decision emails are not wired.

- [ ] **Step 3: Load persisted recipient identities**

Extend the customer request query to select `customerAccount.primaryPoc { id, name, email }`. For POC approval, retain the old POC before the transaction and load the new POC from the existing validated lookup. Never trust recipient addresses supplied by the review request body.

- [ ] **Step 4: Queue decision emails after each successful branch**

For user addition, keep the existing activation send and add requester confirmation. For POC approval, pass all three role candidates to the deduplication helper. For account deletion, copy the original requester email/name before anonymization. For data export, queue only the approved-for-preparation wording.

- [ ] **Step 5: Queue every rejection after the status update**

Pass request type, persisted requester, company, parsed request data, and required rejection reason. Do not contact a proposed new user or POC on rejection.

- [ ] **Step 6: Return delivery warnings without reversing decisions**

Each success response includes `emailWarning` only when one or more queue writes fail. Keep the primary `success: true` result because the database decision is complete.

- [ ] **Step 7: Run customer route tests and API type-check**

Run: `pnpm --dir apps/api test -- tests/unit/admin-routes.test.ts && pnpm --dir apps/api typecheck`

Expected: PASS.

- [ ] **Step 8: Commit customer decision wiring**

```bash
git add apps/api/src/routes/admin/index.ts apps/api/tests/unit/admin-routes.test.ts
git commit -m "feat: email customer request decisions"
```

---

### Task 8: Cross-package verification and documentation sync

**Files:**
- Modify if behavior differs: `docs/wireframes/request-decision-email-notifications.md`
- Update: `graphify-out/`

**Interfaces:**
- Consumes: all prior tasks
- Produces: verified end-to-end source, synchronized graph, and an accurate handoff report

- [ ] **Step 1: Run package-level tests**

```bash
pnpm --dir packages/emails test -- tests/components.test.tsx tests/request-decision-templates.test.tsx tests/render.test.ts tests/index.test.ts
pnpm --dir apps/worker test -- tests/unit/email.test.ts
pnpm --dir apps/api test -- tests/unit/queue.test.ts tests/unit/request-decision-emails.test.ts tests/unit/admin-routes.test.ts
pnpm --dir apps/web-hta test -- tests/unit/email-layout.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run builds and type-checks**

```bash
pnpm --dir packages/emails build
pnpm --dir apps/worker typecheck
pnpm --dir apps/api typecheck
pnpm --dir apps/web-hta typecheck
```

Expected: all commands exit 0.

- [ ] **Step 3: Run lint for modified production files**

```bash
pnpm --dir apps/worker lint
pnpm --dir apps/api lint
pnpm --dir apps/web-hta exec eslint src/emails/components/Layout.tsx
```

Expected: 0 errors; report pre-existing warnings separately.

- [ ] **Step 4: Run the full email suite and record the known baseline**

Run: `pnpm --dir packages/emails test`

Expected baseline before this feature: 161 passing and one unrelated failure in `CustomerAuthorizedToken template > shows 30-day expiry notice`. Confirm no new failure appears; do not alter that unrelated assertion in this task.

- [ ] **Step 5: Verify content and security requirements**

Search rendered test fixtures and job types to confirm no fields named `vpnProvisioningToken`, `privateKey`, `offlineCodes`, or export payload are accepted or rendered. Confirm all rejection variants include a reason and account-deletion approval has no CTA.

- [ ] **Step 6: Update Graphify and inspect the final diff**

```bash
python -m graphify update .
git diff --check
git status --short
```

Expected: Graphify completes, `git diff --check` reports no whitespace errors, and only scoped files plus pre-existing user changes are present.

- [ ] **Step 7: Commit verification/documentation changes**

```bash
git add docs/wireframes/request-decision-email-notifications.md graphify-out
git commit -m "docs: finalize request decision email notifications"
```
