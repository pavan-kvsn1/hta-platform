# Resend certificate email delivery tracking

This runbook enables internal delivery status for certificate workflow emails.
It reports provider acceptance and delivery events; `DELIVERED` means the
recipient's mail server accepted the message, not that a person read it.

## Rollout

1. Deploy the database migration, API, worker, and web application from the
   same release.
2. In Resend, create a webhook pointing to
   `https://hta-calibration.com/api/webhooks/resend`.
3. Subscribe only to these events:
   `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`,
   `email.failed`, `email.suppressed`, and `email.complained`.
4. Copy the generated signing secret into the existing Kubernetes
   `api-secrets` Secret as `RESEND_WEBHOOK_SECRET`. Do not place it in source,
   logs, screenshots, or GitHub repository secrets.
5. Restart or roll out the API pods so `envFrom` loads the new value.

Use the team's secret-management workflow to update the existing Secret while
preserving all of its other keys. Then restart the API with
`kubectl -n hta-platform rollout restart deployment/hta-api`.

## Controlled verification

1. Submit a test certificate and confirm the staff UI progresses from `QUEUED`
   to `SENT` and then `DELIVERED`.
2. Send a controlled Resend bounce test and confirm the relevant terminal state
   appears in red with a safe failure reason.
3. Replay one signed webhook from Resend. Confirm the endpoint returns success
   and only one delivery-event row exists for its `svix-id`.
4. Alter a signed request body and confirm the endpoint returns HTTP 400 without
   creating an event.
5. Confirm engineer, reviewer, and administrator certificate pages show the
   same attempt history.
6. Authenticate as a customer and confirm the staff status endpoint returns
   HTTP 403 and ordinary certificate responses contain no delivery fields.

## Troubleshooting

- HTTP 503 means `RESEND_WEBHOOK_SECRET` is missing from the API process.
- HTTP 400 means signature headers, raw bytes, event schema, or timestamp are
  invalid. Do not disable verification.
- A verified event for an unknown provider email ID is acknowledged and logged;
  check that the worker stored the Resend message ID after sending.
- Persistence failures return a server error so Resend can retry. Replays are
  idempotent by `svix-id`, while BullMQ retries reuse the delivery attempt's
  Resend idempotency key.
