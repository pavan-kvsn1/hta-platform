# Certificate Email Delivery Tracking Design

**Date:** 2026-09-01
**Status:** Approved

## Objective

Give internal staff a durable, certificate-linked view of whether certificate workflow emails were queued, accepted by Resend, delivered, delayed, bounced, failed, suppressed, or marked as spam. Preserve an auditable history without exposing transport details to customers.

## Scope

The first release covers certificate workflow emails only:

- Certificate submitted to a reviewer
- Reviewer outcome sent to the certificate assignee
- Certificate sent to a customer for approval
- Customer approval or revision response
- Customer authorization or download notification
- Customer-review expiry notification

The persistence model remains general enough to support other transactional email types later without another schema redesign. Password resets, activations, request-decision emails, chat notifications, and unrelated emails are outside this release.

Delivery status is visible only to authenticated internal staff with access to the certificate. Customer-facing pages and APIs do not expose it.

## User Experience

Delivery status appears in the certificate workflow panel beside the recipient who currently needs to act. The same reusable presentation is used on:

- Engineer certificate view and edit pages
- Reviewer certificate page
- Administrator authorization page
- Certificate history or timeline

Example:

```text
Peer Reviewer
Anil Kumar · anil@htaipl.com
Email status: ● Delivered   10:42 AM
```

Clicking the status opens delivery details containing the recipient, email purpose, queued time, Resend acceptance time, delivery time, and a safe failure reason when applicable.

Display mapping:

| Status | Presentation |
| --- | --- |
| `QUEUED` | Grey |
| `SENT` | Blue |
| `DELIVERED` | Green |
| `DELAYED` | Amber |
| `BOUNCED` | Red |
| `FAILED` | Red |
| `SUPPRESSED` | Red |
| `COMPLAINED` | Red |

Historical emails sent before tracking is deployed display “Delivery tracking unavailable.” The system does not infer a status for them.

The first release does not add a global email-monitoring dashboard. A manual resend creates a new delivery attempt and retains earlier attempts in certificate history.

## Architecture

```text
Certificate workflow action
        ↓
Create EmailDelivery with QUEUED status
        ↓
Enqueue BullMQ job with delivery ID and idempotency key
        ↓
Worker sends through Resend using the idempotency key
        ↓
Store Resend email ID and SENT status
        ↓
Signed Resend webhook receives provider events
        ↓
Deduplicate and store EmailDeliveryEvent
        ↓
Update the delivery's current status using provider event time
        ↓
Internal certificate pages display the current status and history
```

The database is the durable source of truth. BullMQ provides dispatch and retry behavior; Resend provides provider acceptance and delivery events. Logs remain diagnostic only.

## Data Model

### `EmailDelivery`

One row represents one email attempt.

| Field | Purpose |
| --- | --- |
| `id` | Internal delivery identifier |
| `tenantId` | Tenant isolation |
| `certificateId` | Certificate relationship |
| `emailType` | Stable certificate email purpose |
| `recipientEmail` | Actual recipient |
| `recipientName` | Optional display name |
| `status` | Current normalized delivery status |
| `bullJobId` | Optional BullMQ correlation identifier |
| `idempotencyKey` | Unique Resend send key |
| `providerEmailId` | Unique Resend email identifier after acceptance |
| `queuedAt` | Delivery record creation time |
| `sentAt` | Resend acceptance time |
| `deliveredAt` | Recipient mail-server delivery time |
| `lastEventAt` | Latest provider event time applied to current state |
| `failureReason` | Sanitized latest delivery failure detail |
| `createdAt` / `updatedAt` | Record timestamps |

Required indexes support tenant-and-certificate lookup, provider email lookup, status lookup, and idempotency enforcement. Deleting a certificate follows the established certificate retention behavior and cascades to its delivery records only when the certificate itself is deleted.

### `EmailDeliveryEvent`

One row represents one verified provider event.

| Field | Purpose |
| --- | --- |
| `id` | Internal event identifier |
| `deliveryId` | Parent delivery |
| `providerEventId` | Unique `svix-id` used for deduplication |
| `eventType` | Resend event name |
| `occurredAt` | Provider event time |
| `details` | Minimal safe diagnostic JSON, such as bounce category and message |
| `createdAt` | Ingestion time |

Rendered email HTML and complete webhook payloads are not stored. This minimizes unnecessary personal and message-content retention.

## Status Semantics

- `QUEUED`: the durable delivery record exists and dispatch was requested.
- `SENT`: Resend accepted the send request and returned a provider email ID.
- `DELIVERED`: the recipient's mail server accepted the message. This does not guarantee inbox placement or that the recipient read it.
- `DELAYED`: Resend reported a temporary delivery delay.
- `BOUNCED`: the recipient mail server permanently rejected the message.
- `FAILED`: dispatch or provider sending failed.
- `SUPPRESSED`: Resend intentionally did not send the message.
- `COMPLAINED`: the recipient marked the delivered message as spam.

The webhook subscribes only to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.failed`, `email.suppressed`, and `email.complained`. Open and click tracking are excluded.

Provider events use at-least-once delivery and may arrive out of order. The unique `providerEventId` makes duplicate delivery harmless. An event older than `lastEventAt` is stored for audit history but cannot overwrite the current status. For equal timestamps, terminal negative outcomes take precedence over non-terminal states.

## Dispatch and Idempotency

The API creates the `EmailDelivery` record before enqueuing the email. The BullMQ payload includes `deliveryId`, `certificateId`, and `idempotencyKey`.

The idempotency key uses the immutable delivery ID, for example `email-delivery/<uuid>`. All retries for the same attempt reuse that key. A deliberate resend creates a new `EmailDelivery` ID and therefore a new idempotency key.

The worker:

1. Loads or validates the delivery record.
2. Renders the email.
3. Calls Resend with the delivery idempotency key.
4. Stores the returned Resend email ID and marks the attempt `SENT`.
5. Rethrows transient errors so BullMQ retries them.
6. Records the safe error detail on each failure; the final exhausted attempt becomes `FAILED`.

If Redis enqueueing fails, the certificate workflow remains in its completed business state, the delivery record becomes `FAILED`, and the existing UI warning tells staff to notify the recipient directly.

## Webhook Endpoint

The API exposes a public HTTPS endpoint at `/api/webhooks/resend`.

The endpoint:

1. Reads the untouched raw request body.
2. Verifies `svix-id`, `svix-timestamp`, and `svix-signature` using `RESEND_WEBHOOK_SECRET`.
3. Returns `400` without database access when verification fails.
4. Validates the supported event schema.
5. Locates `EmailDelivery` using the Resend `email_id`.
6. Inserts `EmailDeliveryEvent` idempotently by `svix-id`.
7. Applies the event to the current delivery state only when ordering rules permit.
8. Returns `200` after the event is durably stored.

Database or transient server failures return `5xx` so Resend retries. Verified events whose provider email ID is unknown are recorded in structured logs and acknowledged with `200`; retrying cannot create the missing local correlation.

The project currently resolves Resend SDK 4.8.0, which does not expose the newer webhook verification helper. The endpoint uses the official `svix` package directly rather than coupling this work to a broad Resend SDK upgrade.

## Internal API and Authorization

Certificate detail APIs return delivery summaries only for authenticated staff who already have access to that certificate. Customer authentication paths omit the relationship entirely.

The summary includes current status, recipient, email purpose, relevant timestamps, safe failure reason, and attempt identifier. Event history is available through a staff-protected certificate endpoint or an equivalent authorized include that preserves tenant filtering.

The webhook endpoint does not use tenant authentication because Resend calls it externally. Signature verification is mandatory, and the matched delivery record supplies tenant context.

## UI Components

A reusable `EmailDeliveryStatus` component owns status labels, colours, timestamps, and the details popover or dialog. Pages provide authorized delivery summary data but do not duplicate status rules.

Certificate workflow panels show the latest attempt for each relevant email purpose and recipient. Certificate history shows all attempts chronologically, including superseded failures and deliberate resends.

## Configuration and Rollout

1. Add `RESEND_WEBHOOK_SECRET` to the API secret configuration and production secret store.
2. Deploy the database migration, API, worker, and web changes.
3. Register `https://hta-calibration.com/api/webhooks/resend` in Resend for the selected events.
4. Store the generated signing secret in the production secret store and restart the API deployment if required by the secret mechanism.
5. Send controlled test emails that exercise delivered and failure cases.
6. Confirm signature verification, event persistence, status rendering, and webhook replay handling.

Sending remains operational before webhook registration, but tracked messages stop at `SENT` because no provider delivery events reach HTA.

## Failure Handling

- Missing Redis: mark the delivery `FAILED` and return the existing submission warning.
- Transient Resend failure: BullMQ retries with the same idempotency key.
- Exhausted BullMQ attempts: mark `FAILED` and retain diagnostic details.
- Invalid webhook signature: return `400`, store nothing, and emit a security-safe log.
- Duplicate webhook: return `200` without applying the event twice.
- Out-of-order webhook: store the event but do not regress current status.
- Unknown provider email ID: log and acknowledge; do not create an unlinked delivery record.
- Database failure during webhook handling: return `5xx` for provider retry.
- Missing historical tracking record: show “Delivery tracking unavailable.”

## Testing Strategy

### Database

- Migration applies cleanly and enforces unique provider IDs, idempotency keys, and webhook event IDs.
- Tenant and certificate indexes support authorized queries.
- Certificate retention behavior handles delivery records correctly.

### API and Webhook

- Valid signatures are accepted using raw request bytes.
- Invalid, missing, or stale signatures are rejected.
- Duplicate `svix-id` events are idempotent.
- Out-of-order events do not regress current status.
- Equal-time terminal outcomes take precedence.
- Unknown provider email IDs are safely acknowledged and logged.
- Delivery data is staff-only and tenant-isolated.

### Queue and Worker

- Each covered certificate email creates a delivery record.
- BullMQ receives the delivery ID and stable idempotency key.
- Resend receives the same key on every retry.
- Provider acceptance stores the Resend email ID and `SENT` status.
- Intermediate errors remain retryable; exhausted attempts become `FAILED`.
- Deliberate resends create new attempts without overwriting history.

### Web

- Every normalized status renders the approved label and colour.
- Delivery details show safe recipient, timing, and failure information.
- Legacy certificates show “Delivery tracking unavailable.”
- Customer pages never receive or render transport status.
- Engineer, reviewer, and administrator certificate pages use the shared component.

### End-to-End Rollout

- A controlled delivery reaches `DELIVERED` through a real signed webhook.
- A controlled bounce reaches `BOUNCED` with a safe diagnostic reason.
- A replayed webhook produces no duplicate event.
- Resend and BullMQ retries do not create duplicate emails.

## Acceptance Criteria

- Internal staff can determine the latest delivery state of every newly sent certificate workflow email from the relevant certificate page.
- The status distinguishes queueing, provider acceptance, delivery, delay, bounce, failure, suppression, and complaint.
- Each status is backed by a durable delivery record and verified provider events.
- BullMQ retries are idempotent at Resend.
- Duplicate and out-of-order webhook delivery cannot corrupt status.
- Webhook authenticity is verified from the raw body before database access.
- Customer-facing APIs and pages expose no email transport information.
- Historical untracked emails are labeled honestly rather than inferred.
