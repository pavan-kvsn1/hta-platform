# Certificate Email Delivery Tracking Implementation Plan

> **For implementation:** Use `superpowers:executing-plans` to implement this plan inline, task by task. Do not delegate work to subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give authorized internal staff a durable, certificate-linked view of whether each new certificate workflow email was queued, accepted by Resend, delivered, delayed, bounced, failed, suppressed, or complained about.

**Architecture:** Persist one `EmailDelivery` row before queue dispatch, carry its immutable ID and idempotency key through BullMQ, update it when the worker receives a Resend email ID, and reconcile signed Resend webhooks into append-only `EmailDeliveryEvent` rows plus a current normalized status. Expose the resulting history through a staff-only certificate endpoint and one reusable web panel; do not add delivery data to customer certificate responses.

**Tech Stack:** TypeScript, Prisma/PostgreSQL, Fastify 5, BullMQ, Resend, Svix, Next.js 15, React 19, Vitest

**Spec:** `docs/superpowers/specs/2026-09-01-certificate-email-delivery-tracking-design.md`

## Global Constraints

- Execute inline without subagents, per the user's standing instruction.
- Track only certificate workflow emails in this release; keep password resets, activation, request-decision, chat, and offline-code-expiry emails unchanged.
- Create the durable delivery row before attempting BullMQ enqueue.
- Reuse one idempotency key for every BullMQ retry of one attempt; a deliberate resend must create a new delivery ID and key.
- Never store rendered HTML, email bodies, complete webhook payloads, secrets, download tokens, or approval tokens.
- Verify the untouched webhook body before any database access.
- Keep delivery details staff-only and tenant-scoped. Do not extend customer API payloads.
- Store duplicate and out-of-order provider events safely without allowing current status to regress.
- Preserve certificate workflow state when email dispatch fails; surface the existing warning behavior and record `FAILED`.
- Historical certificates without delivery rows must display `Delivery tracking unavailable.`
- Do not infer inbox placement or message reads from `DELIVERED`.
- Preserve unrelated user changes in the dirty worktree and stage only files named by each task.
- After every code-changing task, run `python -m graphify update .` and stage the resulting `graphify-out/` changes with that task only when they reflect the edited code.

---

### Task 1: Add the durable delivery schema and repair integration cleanup order

**Files:**
- Modify: `packages/database/prisma/schema.prisma:15-45,448-525`
- Create: `packages/database/prisma/migrations/20260901090000_add_certificate_email_delivery_tracking/migration.sql`
- Create: `apps/api/tests/integration/email-delivery-database.test.ts`
- Modify: `apps/api/tests/integration/setup/test-db.ts:43-120`

**Interfaces:**
- Produces: Prisma `EmailDeliveryStatus`, `EmailDelivery`, and `EmailDeliveryEvent`
- Adds: `Tenant.emailDeliveries` and `Certificate.emailDeliveries`
- Preserves: certificate deletion cascade behavior and tenant isolation

- [ ] **Step 1: Write the failing database test**

Create an API integration test using the existing PostgreSQL test setup. It creates a tenant, users, certificate, delivery, and event, then asserts uniqueness and cascade behavior. The initial test should reference the not-yet-generated Prisma models so RED is an expected type/runtime failure.

```ts
const delivery = await prisma.emailDelivery.create({
  data: {
    tenantId: tenant.id,
    certificateId: certificate.id,
    emailType: 'CERTIFICATE_SUBMITTED',
    recipientEmail: 'reviewer@example.com',
    recipientName: 'Reviewer',
    idempotencyKey: 'email-delivery/attempt-1',
  },
})

await prisma.emailDeliveryEvent.create({
  data: {
    deliveryId: delivery.id,
    providerEventId: 'evt-1',
    eventType: 'email.sent',
    occurredAt: new Date('2026-09-01T10:00:00Z'),
  },
})

await expect(prisma.emailDelivery.create({
  data: { ...baseDelivery, idempotencyKey: delivery.idempotencyKey },
})).rejects.toMatchObject({ code: 'P2002' })
```

Also assert duplicate `providerEmailId` and `providerEventId` rejection, and that deleting the certificate deletes both delivery and event rows.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --dir apps/api test:integration -- tests/integration/email-delivery-database.test.ts`

Expected: FAIL because `emailDelivery` and `emailDeliveryEvent` do not exist in the Prisma client.

- [ ] **Step 3: Add the Prisma enum and models**

```prisma
enum EmailDeliveryStatus {
  QUEUED
  SENT
  DELIVERED
  DELAYED
  BOUNCED
  FAILED
  SUPPRESSED
  COMPLAINED
}

model EmailDelivery {
  id               String              @id @default(uuid())
  tenantId         String
  certificateId    String
  emailType        String
  recipientEmail   String
  recipientName    String?
  status           EmailDeliveryStatus @default(QUEUED)
  bullJobId        String?
  idempotencyKey   String              @unique
  providerEmailId  String?             @unique
  queuedAt         DateTime            @default(now())
  sentAt           DateTime?
  deliveredAt      DateTime?
  lastEventAt      DateTime?
  failureReason    String?
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt
  tenant           Tenant              @relation(fields: [tenantId], references: [id])
  certificate      Certificate         @relation(fields: [certificateId], references: [id], onDelete: Cascade)
  events           EmailDeliveryEvent[]

  @@index([tenantId, certificateId, createdAt])
  @@index([certificateId, emailType, createdAt])
  @@index([status])
}

model EmailDeliveryEvent {
  id              String        @id @default(uuid())
  deliveryId      String
  providerEventId String        @unique
  eventType       String
  occurredAt      DateTime
  details         Json?
  createdAt       DateTime      @default(now())
  delivery        EmailDelivery @relation(fields: [deliveryId], references: [id], onDelete: Cascade)

  @@index([deliveryId, occurredAt])
}
```

Add the two parent relations and write matching PostgreSQL enum, tables, foreign keys, unique indexes, and lookup indexes in the migration SQL.

- [ ] **Step 4: Fix test cleanup dependency order**

In both the transaction path and fallback path of `cleanTestDatabase`, delete these dependants before their parents:

```ts
await tx.emailDeliveryEvent.deleteMany()
await tx.emailDelivery.deleteMany()
await tx.customerRequest.deleteMany()
```

Place email delivery cleanup before `certificate.deleteMany()` and customer request cleanup before `customerUser.deleteMany()` / `customerAccount.deleteMany()`. This resolves the existing `CustomerRequest_customerAccountId_fkey` teardown failure needed for route integration tests.

- [ ] **Step 5: Generate Prisma and run focused verification**

Run:

```bash
pnpm --dir packages/database db:generate
pnpm --dir packages/database typecheck
pnpm --dir apps/api test:integration -- tests/integration/email-delivery-database.test.ts
pnpm --dir apps/api test:integration -- tests/integration/certificates.test.ts
python -m graphify update .
```

Expected: the new database test passes; the existing certificate integration suite no longer fails during cleanup on `CustomerRequest_customerAccountId_fkey`.

- [ ] **Step 6: Commit the schema foundation**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260901090000_add_certificate_email_delivery_tracking/migration.sql apps/api/tests/integration/email-delivery-database.test.ts apps/api/tests/integration/setup/test-db.ts graphify-out
git commit -m "feat: add certificate email delivery records"
```

---

### Task 2: Define shared delivery contracts and deterministic status ordering

**Files:**
- Create: `packages/shared/src/email-delivery/index.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/services/email-delivery-events.ts`
- Create: `apps/api/tests/unit/email-delivery-events.test.ts`

**Interfaces:**
- Produces: `CertificateEmailType`, `TrackedEmailJobFields`, `EmailDeliverySummary`, `ResendDeliveryEventType`
- Produces: `mapResendEventStatus`, `shouldApplyDeliveryEvent`, and `sanitizeDeliveryFailure`

- [ ] **Step 1: Write table-driven failing reducer tests**

Cover all seven subscribed events, older events, newer events, and equal-time precedence:

```ts
it.each([
  ['email.sent', 'SENT'],
  ['email.delivered', 'DELIVERED'],
  ['email.delivery_delayed', 'DELAYED'],
  ['email.bounced', 'BOUNCED'],
  ['email.failed', 'FAILED'],
  ['email.suppressed', 'SUPPRESSED'],
  ['email.complained', 'COMPLAINED'],
] as const)('maps %s to %s', (eventType, expected) => {
  expect(mapResendEventStatus(eventType)).toBe(expected)
})

expect(shouldApplyDeliveryEvent({
  currentStatus: 'DELIVERED',
  currentEventAt: sameTime,
  incomingStatus: 'BOUNCED',
  incomingEventAt: sameTime,
})).toBe(true)

expect(shouldApplyDeliveryEvent({
  currentStatus: 'BOUNCED',
  currentEventAt: sameTime,
  incomingStatus: 'DELIVERED',
  incomingEventAt: sameTime,
})).toBe(false)
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --dir apps/api test:unit -- tests/unit/email-delivery-events.test.ts`

Expected: FAIL because the event service does not exist.

- [ ] **Step 3: Add the shared contracts**

Define the certificate purposes exactly once:

```ts
export type CertificateEmailType =
  | 'CERTIFICATE_SUBMITTED'
  | 'CERTIFICATE_REVIEWED'
  | 'CUSTOMER_REVIEW'
  | 'CUSTOMER_REVIEW_REGISTERED'
  | 'CUSTOMER_AUTHORIZED_REGISTERED'
  | 'CUSTOMER_AUTHORIZED_TOKEN'
  | 'CUSTOMER_APPROVAL'
  | 'CUSTOMER_REVIEW_EXPIRED'

export interface TrackedEmailJobFields {
  deliveryId: string
  certificateId: string
  idempotencyKey: string
}
```

Define `EmailDeliverySummary` with ID, purpose, recipient, normalized status, queued/sent/delivered/last-event timestamps, safe failure reason, and chronological event summaries. Keep wire timestamps as ISO strings.

- [ ] **Step 4: Implement deterministic event ordering**

Use event time first. At equal time, rank terminal negative states above `DELIVERED`, then `DELAYED`, then `SENT`; do not allow equal-time lower-ranked events to replace higher-ranked state. `sanitizeDeliveryFailure` must cap text length and return only provider diagnostic category/message fields, never serialize the whole payload.

- [ ] **Step 5: Run focused verification**

Run:

```bash
pnpm --dir apps/api test:unit -- tests/unit/email-delivery-events.test.ts
pnpm --dir packages/shared typecheck
pnpm --dir apps/api typecheck
python -m graphify update .
```

Expected: PASS.

- [ ] **Step 6: Commit the shared contract**

```bash
git add packages/shared/src/email-delivery/index.ts packages/shared/src/index.ts apps/api/src/services/email-delivery-events.ts apps/api/tests/unit/email-delivery-events.test.ts graphify-out
git commit -m "feat: define email delivery status semantics"
```

---

### Task 3: Persist certificate attempts at the API queue boundary

**Files:**
- Modify: `apps/api/src/services/queue.ts:1-470`
- Create: `apps/api/src/services/tracked-email.ts`
- Modify: `apps/api/tests/unit/queue.test.ts`
- Create: `apps/api/tests/unit/tracked-email.test.ts`
- Modify: `apps/api/src/routes/certificates/index.ts:1410,1662,1685,1692,1812,1872,2001,2156,2163`
- Modify: `apps/api/src/routes/admin/index.ts:3353,4957,4975`
- Modify: `apps/api/src/routes/customer/index.ts:1298,1436,1610,1724`

**Interfaces:**
- Changes: `enqueueEmail(...)` returns `Promise<string | null>` where the string is the BullMQ job ID and `null` means optional dispatch was skipped because Redis is absent
- Produces: `enqueueTrackedCertificateEmail(...)`
- Requires: every covered helper receives `tenantId` and `certificateId`

- [ ] **Step 1: Extend failing queue tests**

Assert that `enqueueEmail` returns `job.id`, and that the tracked wrapper:

- creates `QUEUED` before `Queue.add`;
- sends `deliveryId`, `certificateId`, and `email-delivery/<deliveryId>` in job data;
- records `bullJobId` after enqueue;
- marks `FAILED` with a safe reason when Redis is missing or `Queue.add` rejects;
- rethrows for required workflow emails without undoing the delivery row.

Mock `@hta/database` in the unit test and use call-order assertions so persistence-before-enqueue is explicit.

- [ ] **Step 2: Run the queue tests and verify RED**

Run:

```bash
pnpm --dir apps/api test:unit -- tests/unit/queue.test.ts tests/unit/tracked-email.test.ts
```

Expected: FAIL because enqueue returns no job ID and no delivery row is created.

- [ ] **Step 3: Implement the tracked enqueue boundary**

```ts
export async function enqueueTrackedCertificateEmail(options: {
  tenantId: string
  certificateId: string
  emailType: CertificateEmailType
  recipientEmail: string
  recipientName?: string
  data: EmailJobData
  required?: boolean
}): Promise<string | null> {
  const delivery = await prisma.emailDelivery.create({ /* QUEUED fields */ })
  const idempotencyKey = `email-delivery/${delivery.id}`
  await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { idempotencyKey } })

  try {
    const jobId = await enqueueEmail({
      ...options.data,
      deliveryId: delivery.id,
      certificateId: options.certificateId,
      idempotencyKey,
    }, { required: options.required })
    if (!jobId) throw new Error('Email queue unavailable')
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { bullJobId: jobId } })
    return delivery.id
  } catch (error) {
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', failureReason: safeErrorMessage(error) },
    })
    throw error
  }
}
```

Avoid a two-write idempotency race in the actual implementation by generating the UUID in application code and creating the row once with both `id` and `idempotencyKey`.

- [ ] **Step 4: Route every in-scope API helper through tracking**

Add `tenantId` and `certificateId` to these helper option types and call sites:

| Helper | Stored purpose |
| --- | --- |
| `queueCertificateSubmittedEmail` | `CERTIFICATE_SUBMITTED` |
| `queueCertificateReviewedEmail` | `CERTIFICATE_REVIEWED` |
| `queueCustomerReviewEmail` | `CUSTOMER_REVIEW` |
| `queueCustomerReviewRegisteredEmail` | `CUSTOMER_REVIEW_REGISTERED` |
| `queueCustomerAuthorizedRegisteredEmail` | `CUSTOMER_AUTHORIZED_REGISTERED` |
| `queueCustomerAuthorizedTokenEmail` | `CUSTOMER_AUTHORIZED_TOKEN` |
| `queueCustomerApprovalNotificationEmail` | `CUSTOMER_APPROVAL` |

Preserve each helper's current required/optional behavior. Do not convert unrelated helpers to tracking.

- [ ] **Step 5: Run focused API tests**

Run:

```bash
pnpm --dir apps/api test:unit -- tests/unit/queue.test.ts tests/unit/tracked-email.test.ts
pnpm --dir apps/api test:integration -- tests/integration/certificates.test.ts
pnpm --dir apps/api typecheck
python -m graphify update .
```

Expected: PASS. Existing route response semantics remain unchanged apart from existing email warnings.

- [ ] **Step 6: Commit the tracked queue integration**

```bash
git add apps/api/src/services/queue.ts apps/api/src/services/tracked-email.ts apps/api/tests/unit/queue.test.ts apps/api/tests/unit/tracked-email.test.ts apps/api/src/routes/certificates/index.ts apps/api/src/routes/admin/index.ts apps/api/src/routes/customer/index.ts graphify-out
git commit -m "feat: track certificate email queue attempts"
```

---

### Task 4: Make worker sends idempotent and persist provider acceptance/final failure

**Files:**
- Modify: `apps/worker/src/types.ts:1-160`
- Modify: `apps/worker/src/jobs/email.ts:1-190`
- Modify: `apps/worker/tests/unit/email.test.ts`
- Modify: `apps/worker/src/jobs/cleanup.ts:180-270`
- Modify: `apps/worker/tests/unit/cleanup.test.ts` (or the existing cleanup test file that covers customer review expiry)

**Interfaces:**
- Consumes: optional `TrackedEmailJobFields` on `EmailJobData`
- Calls: `resend.emails.send(payload, { idempotencyKey })`
- Updates: `providerEmailId`, `SENT`, `sentAt`, and final `FAILED`

- [ ] **Step 1: Write failing worker tests**

Add tests that assert:

```ts
expect(mockSend).toHaveBeenCalledWith(
  expect.objectContaining({ to: 'reviewer@example.com' }),
  { idempotencyKey: 'email-delivery/delivery-1' },
)
expect(prisma.emailDelivery.update).toHaveBeenCalledWith({
  where: { id: 'delivery-1' },
  data: expect.objectContaining({
    providerEmailId: 'resend-email-1',
    status: 'SENT',
    sentAt: expect.any(Date),
  }),
})
```

For failures, construct jobs with `opts.attempts = 3`. Assert attempt one stores only a sanitized `failureReason` and rethrows, while the third/final attempt also stores `status: 'FAILED'`. Assert untracked password-reset jobs still send without database writes or an idempotency option.

- [ ] **Step 2: Run the worker tests and verify RED**

Run: `pnpm --dir apps/worker test:unit -- tests/unit/email.test.ts`

Expected: FAIL because the worker does not pass idempotency metadata or persist results.

- [ ] **Step 3: Implement tracked worker transitions**

Before send, if `deliveryId` exists, verify the row matches the job's `certificateId` and `idempotencyKey`. Send with the Resend idempotency option. After provider acceptance, update only that delivery:

```ts
const acceptedAt = new Date()
await prisma.emailDelivery.update({
  where: { id: data.deliveryId },
  data: {
    providerEmailId: result.data!.id,
    status: 'SENT',
    sentAt: acceptedAt,
    failureReason: null,
  },
})
```

In the catch path calculate final exhaustion using BullMQ's completed-attempt semantics:

```ts
const configuredAttempts = Number(job.opts.attempts ?? 1)
const isFinalAttempt = job.attemptsMade + 1 >= configuredAttempts
```

Always retain a safe failure reason; set `FAILED` only on the final attempt; rethrow every send error so BullMQ owns retry timing.

- [ ] **Step 4: Track the cleanup-generated expiry email**

The cleanup job bypasses the API queue service. For `reviewer-customer-expired`, create an `EmailDelivery` with the certificate's `tenantId`, add the same metadata to the BullMQ payload, store the returned job ID, and mark the row `FAILED` if enqueue rejects. Preserve the certificate's `CUSTOMER_REVIEW_EXPIRED` transition even if email queueing fails.

- [ ] **Step 5: Run worker verification**

Run:

```bash
pnpm --dir apps/worker test:unit -- tests/unit/email.test.ts
pnpm --dir apps/worker test:unit -- tests/unit/cleanup.test.ts
pnpm --dir apps/worker typecheck
python -m graphify update .
```

Expected: PASS, including untracked email regression cases.

- [ ] **Step 6: Commit worker delivery persistence**

```bash
git add apps/worker/src/types.ts apps/worker/src/jobs/email.ts apps/worker/tests/unit/email.test.ts apps/worker/src/jobs/cleanup.ts apps/worker/tests/unit/cleanup.test.ts graphify-out
git commit -m "feat: persist certificate email provider status"
```

---

### Task 5: Add the signed raw-body Resend webhook

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/api/src/routes/webhooks/resend.ts`
- Create: `apps/api/src/services/resend-webhook.ts`
- Modify: `apps/api/src/server.ts:1-150`
- Create: `apps/api/tests/unit/resend-webhook.test.ts`
- Create: `apps/api/tests/integration/resend-webhook-route.test.ts`

**Interfaces:**
- Adds: public `POST /api/webhooks/resend`
- Requires: `RESEND_WEBHOOK_SECRET`
- Verifies: `svix-id`, `svix-timestamp`, `svix-signature` against untouched bytes
- Returns: `200` for applied, duplicate, or verified-unknown delivery; `400` for invalid signature/schema; `5xx` for persistence failure

- [ ] **Step 1: Install the official signature verifier**

Run: `pnpm --dir apps/api add svix`

Expected: `apps/api/package.json` and `pnpm-lock.yaml` add `svix`; do not upgrade the Resend SDK as part of this task.

- [ ] **Step 2: Write failing service and route tests**

Use Svix's test signing support (or construct headers with the package) so the integration test sends real signed bytes. Cover:

- valid `email.delivered` updates the matched provider email;
- tampered bytes and missing signature headers return `400` before Prisma is called;
- duplicate `svix-id` returns `200` and creates one event;
- older events are stored but do not regress current status;
- equal-time `BOUNCED` wins over `DELIVERED`;
- unknown provider email ID logs a structured warning and returns `200`;
- transaction failure returns `5xx` so Resend retries.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
pnpm --dir apps/api test:unit -- tests/unit/resend-webhook.test.ts
pnpm --dir apps/api test:integration -- tests/integration/resend-webhook-route.test.ts
```

Expected: FAIL because the endpoint and service do not exist.

- [ ] **Step 4: Implement scoped raw JSON parsing and verification**

Register an encapsulated Fastify plugin at `/api/webhooks/resend`. Inside that plugin only:

```ts
fastify.removeContentTypeParser('application/json')
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (_request, body, done) => done(null, body),
)
```

Verify before parsing or calling Prisma:

```ts
const event = new Webhook(secret).verify(rawBody.toString('utf8'), {
  'svix-id': request.headers['svix-id'] as string,
  'svix-timestamp': request.headers['svix-timestamp'] as string,
  'svix-signature': request.headers['svix-signature'] as string,
})
```

Validate the verified object with Zod and accept only the seven approved event types.

- [ ] **Step 5: Persist each verified event transactionally**

Within one transaction:

1. Find delivery by `providerEmailId = event.data.email_id`.
2. If absent, return `unknown` without creating an unlinked row.
3. Insert `EmailDeliveryEvent` using `providerEventId = svix-id`; treat Prisma `P2002` as `duplicate`.
4. Apply normalized status only if `shouldApplyDeliveryEvent` permits it.
5. Set `deliveredAt` for `DELIVERED`, `lastEventAt` for applied events, and safe failure details for negative states.

Do not persist the complete verified payload.

- [ ] **Step 6: Exempt only the webhook from tenant middleware**

In `apps/api/src/server.ts`, skip `tenantMiddleware` only when `request.url` starts with `/api/webhooks/resend`. Register the plugin at that exact prefix. Do not exempt other `/api/webhooks/*` paths.

- [ ] **Step 7: Run webhook verification**

Run:

```bash
pnpm --dir apps/api test:unit -- tests/unit/resend-webhook.test.ts
pnpm --dir apps/api test:integration -- tests/integration/resend-webhook-route.test.ts
pnpm --dir apps/api typecheck
pnpm --dir apps/api lint
python -m graphify update .
```

Expected: PASS. Invalid signatures produce no database calls.

- [ ] **Step 8: Commit the webhook**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/routes/webhooks/resend.ts apps/api/src/services/resend-webhook.ts apps/api/src/server.ts apps/api/tests/unit/resend-webhook.test.ts apps/api/tests/integration/resend-webhook-route.test.ts graphify-out
git commit -m "feat: ingest signed Resend delivery events"
```

---

### Task 6: Add a tenant-scoped staff certificate delivery endpoint

**Files:**
- Modify: `apps/api/src/routes/certificates/index.ts:1-930`
- Create: `apps/api/tests/integration/certificate-email-deliveries.test.ts`

**Interfaces:**
- Adds: `GET /api/certificates/:id/email-deliveries`
- Auth: `requireStaff`
- Response: `{ deliveries: EmailDeliverySummary[] }`

- [ ] **Step 1: Write failing authorization and response tests**

Cover:

- certificate creator can read their tenant's delivery history;
- assigned reviewer can read it;
- administrator in the tenant can read it;
- unrelated non-admin staff receive `403` unless existing certificate access rules grant access;
- staff from another tenant receive `404` or the route's established non-disclosing response;
- customer JWT receives `403`;
- events are ordered chronologically within attempts and attempts newest-first;
- failure reasons are safe strings and no provider/raw payload fields leak beyond the approved summary.

- [ ] **Step 2: Run the route test and verify RED**

Run: `pnpm --dir apps/api test:integration -- tests/integration/certificate-email-deliveries.test.ts`

Expected: FAIL with `404` because the endpoint does not exist.

- [ ] **Step 3: Implement the staff-only endpoint**

Reuse the certificate route's existing access policy rather than creating a broader one. The lookup must include `tenantId: request.tenantId`. Query deliveries separately so the general certificate detail handler—and therefore customer responses—never includes the relation.

```ts
const deliveries = await prisma.emailDelivery.findMany({
  where: { tenantId: request.tenantId, certificateId: params.id },
  orderBy: { createdAt: 'desc' },
  include: { events: { orderBy: { occurredAt: 'asc' } } },
})
```

Map Prisma dates to ISO strings and return only `EmailDeliverySummary` fields.

- [ ] **Step 4: Run API verification**

Run:

```bash
pnpm --dir apps/api test:integration -- tests/integration/certificate-email-deliveries.test.ts
pnpm --dir apps/api test:integration -- tests/integration/certificates.test.ts
pnpm --dir apps/api typecheck
python -m graphify update .
```

Expected: PASS; customer certificate tests confirm no new delivery field appears.

- [ ] **Step 5: Commit the internal read API**

```bash
git add apps/api/src/routes/certificates/index.ts apps/api/tests/integration/certificate-email-deliveries.test.ts graphify-out
git commit -m "feat: expose certificate delivery history to staff"
```

---

### Task 7: Build the reusable internal delivery status panel

**Files:**
- Create: `apps/web-hta/src/components/email-delivery/EmailDeliveryStatus.tsx`
- Create: `apps/web-hta/src/components/email-delivery/EmailDeliveryPanel.tsx`
- Create: `apps/web-hta/src/lib/email-deliveries.ts`
- Create: `apps/web-hta/tests/unit/email-delivery-status.test.tsx`
- Create: `apps/web-hta/tests/unit/email-delivery-panel.test.tsx`

**Interfaces:**
- Consumes: `GET /api/certificates/:id/email-deliveries`
- Renders: approved status label/color, latest attempt, recipient, purpose, timestamps, safe failure reason, and prior attempts

- [ ] **Step 1: Write failing presentation tests**

Table-test all eight status mappings:

| Status | Label | Style token |
| --- | --- | --- |
| `QUEUED` | Queued | grey |
| `SENT` | Sent | blue |
| `DELIVERED` | Delivered | green |
| `DELAYED` | Delayed | amber |
| `BOUNCED` | Bounced | red |
| `FAILED` | Failed | red |
| `SUPPRESSED` | Suppressed | red |
| `COMPLAINED` | Complained | red |

Because Tailwind scans static strings, use a literal status-to-class map; do not construct class names dynamically. Assert the accessible visible label rather than only CSS classes.

Also test:

- no rows shows `Delivery tracking unavailable.`;
- loading and safe retryable error states;
- latest attempt appears first;
- the details control shows recipient, purpose, queued/sent/delivered times, and safe failure reason;
- `DELIVERED` copy says mail server accepted the message, not that it was read.

- [ ] **Step 2: Run component tests and verify RED**

Run:

```bash
pnpm --dir apps/web-hta test:unit -- tests/unit/email-delivery-status.test.tsx tests/unit/email-delivery-panel.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the typed fetch adapter and components**

Use the repository's existing authenticated `apiFetch` mechanism so the tenant and bearer headers remain centralized. `EmailDeliveryPanel` receives only `certificateId` and an optional purpose/recipient filter; it fetches the staff endpoint and owns loading, empty, and retry states.

Keep the status chip compact. Put full attempt history behind an accessible `button` with `aria-expanded` or the existing dialog/popover primitive. Render provider event names as friendly labels; never show provider IDs or BullMQ IDs in the default UI.

- [ ] **Step 4: Run component verification**

Run:

```bash
pnpm --dir apps/web-hta test:unit -- tests/unit/email-delivery-status.test.tsx tests/unit/email-delivery-panel.test.tsx
pnpm --dir apps/web-hta typecheck
pnpm --dir apps/web-hta lint
python -m graphify update .
```

Expected: PASS.

- [ ] **Step 5: Commit the reusable panel**

```bash
git add apps/web-hta/src/components/email-delivery/EmailDeliveryStatus.tsx apps/web-hta/src/components/email-delivery/EmailDeliveryPanel.tsx apps/web-hta/src/lib/email-deliveries.ts apps/web-hta/tests/unit/email-delivery-status.test.tsx apps/web-hta/tests/unit/email-delivery-panel.test.tsx graphify-out
git commit -m "feat: add certificate email delivery panel"
```

---

### Task 8: Place delivery status on every approved internal certificate surface

**Files:**
- Modify: `apps/web-hta/src/components/forms/FinalizeSection.tsx`
- Modify: `apps/web-hta/src/app/(dashboard)/dashboard/certificates/[id]/edit/page.tsx`
- Modify: `apps/web-hta/src/app/(dashboard)/dashboard/certificates/[id]/view/page.tsx`
- Modify: `apps/web-hta/src/app/(dashboard)/dashboard/reviewer/[id]/ReviewerPageClient.tsx`
- Modify: `apps/web-hta/src/app/admin/authorization/[id]/AdminAuthorizationClient.tsx`
- Modify: `apps/web-hta/src/app/admin/certificates/[id]/AdminHistorySection.tsx`
- Create: `apps/web-hta/tests/unit/certificate-email-delivery-placements.test.tsx`

**Interfaces:**
- Places: latest purpose/recipient status beside the relevant workflow actor
- Places: complete attempt history in administrator certificate history
- Preserves: all customer review/download pages without delivery UI

- [ ] **Step 1: Write failing placement tests**

Mock `EmailDeliveryPanel` and assert it receives the current certificate ID on engineer edit/view, reviewer, authorization, and admin history surfaces. Assert the engineer finalize area requests the relevant reviewer/customer purpose rather than rendering an unrelated latest attempt.

- [ ] **Step 2: Run the placement tests and verify RED**

Run: `pnpm --dir apps/web-hta test:unit -- tests/unit/certificate-email-delivery-placements.test.tsx`

Expected: FAIL because none of the pages renders the panel.

- [ ] **Step 3: Add the panel to internal workflow surfaces**

Use one panel implementation everywhere:

- engineer edit and view: near the Finalize/workflow actor block;
- reviewer: beside the engineer/customer handoff status;
- admin authorization: beside customer authorization recipient/action;
- admin history: show all attempts chronologically alongside certificate events.

Do not add a global dashboard or any customer-facing placement. Avoid duplicate fetches when both a page and nested `FinalizeSection` render; pass the panel once at the page's workflow container boundary.

- [ ] **Step 4: Run web verification**

Run:

```bash
pnpm --dir apps/web-hta test:unit -- tests/unit/certificate-email-delivery-placements.test.tsx
pnpm --dir apps/web-hta test:unit -- tests/unit/email-delivery-status.test.tsx tests/unit/email-delivery-panel.test.tsx
pnpm --dir apps/web-hta typecheck
pnpm --dir apps/web-hta lint
python -m graphify update .
```

Expected: PASS.

- [ ] **Step 5: Commit all internal placements**

```bash
git add apps/web-hta/src/components/forms/FinalizeSection.tsx apps/web-hta/src/app/\(dashboard\)/dashboard/certificates/\[id\]/edit/page.tsx apps/web-hta/src/app/\(dashboard\)/dashboard/certificates/\[id\]/view/page.tsx apps/web-hta/src/app/\(dashboard\)/dashboard/reviewer/\[id\]/ReviewerPageClient.tsx apps/web-hta/src/app/admin/authorization/\[id\]/AdminAuthorizationClient.tsx apps/web-hta/src/app/admin/certificates/\[id\]/AdminHistorySection.tsx apps/web-hta/tests/unit/certificate-email-delivery-placements.test.tsx graphify-out
git commit -m "feat: show delivery status in certificate workflows"
```

---

### Task 9: Document webhook secrets, provider setup, and rollout verification

**Files:**
- Modify: `infra/k8s/base/secrets.yaml`
- Modify: `infra/README.md`
- Modify: `.github/SECRETS.md`
- Create: `docs/runbooks/resend-webhook-delivery-tracking.md`

**Interfaces:**
- Requires API environment variable: `RESEND_WEBHOOK_SECRET`
- Provider endpoint: `https://hta-calibration.com/api/webhooks/resend`
- Provider subscriptions: the seven approved delivery events only

- [ ] **Step 1: Write configuration assertions**

Add a small documentation/config test only if the repository already has infrastructure manifest tests. Otherwise use explicit search verification in Step 3; do not introduce a new test framework solely for Markdown.

- [ ] **Step 2: Update secret templates and operator documentation**

Add a placeholder webhook signing secret to the non-production template and document that production's existing `api-secrets` must expose `RESEND_WEBHOOK_SECRET` to the API deployment via its current `envFrom` mechanism. Do not commit a real secret.

The runbook must specify:

1. Deploy the migration, API, worker, and web.
2. Register `https://hta-calibration.com/api/webhooks/resend` in Resend.
3. Subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.failed`, `email.suppressed`, and `email.complained` only.
4. Store the generated signing secret as `RESEND_WEBHOOK_SECRET` in `api-secrets` and restart/roll out the API.
5. Send controlled delivered and bounce tests.
6. Replay a webhook and confirm one event row.
7. Confirm invalid signatures are rejected and do not create rows.
8. Confirm staff UI updates and customer APIs remain unchanged.

- [ ] **Step 3: Verify configuration references**

Run:

```bash
rg -n "RESEND_WEBHOOK_SECRET|api/webhooks/resend|email\.delivery_delayed|email\.complained" infra .github docs/runbooks apps/api/src
```

Expected: every required variable, endpoint, and event is documented; no secret value is present.

- [ ] **Step 4: Run complete repository verification**

Run:

```bash
pnpm --dir packages/database test
pnpm --dir packages/database typecheck
pnpm --dir packages/shared typecheck
pnpm --dir apps/api test:unit
pnpm --dir apps/api test:integration
pnpm --dir apps/api typecheck
pnpm --dir apps/api lint
pnpm --dir apps/worker test:unit
pnpm --dir apps/worker typecheck
pnpm --dir apps/worker lint
pnpm --dir apps/web-hta test:unit
pnpm --dir apps/web-hta typecheck
pnpm --dir apps/web-hta lint
python -m graphify update .
git diff --check
```

Expected: all commands pass. If an unrelated pre-existing test fails, record the exact command and evidence; do not weaken or delete the test.

- [ ] **Step 5: Perform the controlled post-deploy smoke test**

After production deployment and webhook registration:

- submit a test certificate and confirm `QUEUED -> SENT -> DELIVERED`;
- use a Resend test/bounce address and confirm the appropriate terminal red state;
- replay the same signed webhook and confirm no duplicate event;
- confirm the engineer/reviewer/admin pages show the same attempt;
- authenticate as a customer and confirm the status endpoint returns `403` and certificate payloads omit delivery data.

This step changes external provider configuration and sends test mail, so obtain the normal production deployment approval before executing it.

- [ ] **Step 6: Commit documentation and final graph update**

```bash
git add infra/k8s/base/secrets.yaml infra/README.md .github/SECRETS.md docs/runbooks/resend-webhook-delivery-tracking.md graphify-out
git commit -m "docs: add Resend delivery tracking runbook"
```

---

## Completion Checklist

- [ ] Every newly queued certificate workflow email has exactly one durable attempt row.
- [ ] BullMQ retries reuse the same Resend idempotency key.
- [ ] Provider acceptance stores the Resend email ID and `SENT`.
- [ ] Signed webhooks advance delivery state and preserve an event history.
- [ ] Duplicate and out-of-order webhooks cannot corrupt current status.
- [ ] Final queue/provider failures become `FAILED` without undoing certificate workflow state.
- [ ] Internal engineer, reviewer, and administrator surfaces show the approved status presentation.
- [ ] Historical untracked certificates say `Delivery tracking unavailable.`
- [ ] Customer tokens, pages, and API payloads expose no delivery information.
- [ ] Production secret and Resend webhook setup are documented and smoke-tested.
- [ ] Graphify is current and the final diff contains no unrelated user changes.
