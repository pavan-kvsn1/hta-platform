# Master Instrument Training Evidence

## Goal

Track which engineers are trained to operate each master instrument and store the engineer's training certificate PDF as evidence. The admin instrument detail page should show a table of trained engineers and allow admins to view each training certificate.

## Current Decisions

- Store training against the stable `MasterInstrument.instrumentId` lineage, not only a single version row.
- Keep `masterInstrumentId` on each training record as the version visible when the evidence was recorded.
- Reuse the existing uploads bucket; no new GCS bucket is needed.
- Use a new object prefix:
  - `master-instrument-training/{instrumentId}/{engineerId}/{timestamp}-{filename}.pdf`
- Stream PDFs through the API instead of using signed GCS URLs.
- Start with admin-managed training evidence only.

## Data Model

- [x] Add `MasterInstrumentTraining` model to `packages/database/prisma/schema.prisma`.
- [x] Mirror the model in `apps/web-hta/prisma/schema.prisma` if the web-local Prisma schema remains in use.
- [x] Add relations:
  - `User.engineerInstrumentTrainings`
  - `User.uploadedTrainingCertificates`
  - `MasterInstrument.trainingRecords`
- [x] Generate a Prisma migration.
- [x] Generate Prisma client.

Proposed fields:

- `id`
- `tenantId`
- `instrumentId`
- `masterInstrumentId`
- `engineerId`
- `certificateFileName`
- `certificateFileSize`
- `certificateMimeType`
- `certificatePath`
- `trainedAt`
- `expiresAt`
- `notes`
- `uploadedById`
- `uploadedAt`
- `isActive`

## API

- [x] Add `GET /api/admin/instruments/:id/trainings`.
- [x] Add `POST /api/admin/instruments/:id/trainings` for multipart PDF upload.
- [x] Add `GET /api/admin/instruments/:id/trainings/:trainingId/pdf` to stream PDF evidence.
- [x] Add `PATCH /api/admin/instruments/:id/trainings/:trainingId` for metadata edits.
- [x] Add `DELETE /api/admin/instruments/:id/trainings/:trainingId` as soft delete.
- [x] Validate:
  - active tenant-scoped instrument
  - active tenant-scoped engineer
  - PDF only
  - reasonable file size limit
  - no duplicate active training for same `tenantId + instrumentId + engineerId`
- [x] Use existing storage provider with the new prefix.

## Frontend

- [x] Add an `Engineer Training` section to `/admin/instruments/[id]`.
- [x] Show table columns:
  - Engineer
  - Email
  - Trained date
  - Expires date
  - Certificate
  - Uploaded by
  - Uploaded at
  - Actions
- [x] Add `Add training` modal:
  - engineer search/select
  - PDF upload
  - trained date
  - expiry date
  - notes
- [x] Add PDF preview/download using authenticated `apiFetch -> Blob -> object URL`.
- [x] Add edit metadata action.
- [x] Add remove training action.
- [x] Add empty, loading, and error states.

## Future Policy Checks

- [ ] Warn during certificate creation when the engineer lacks active training for a selected master instrument.
- [ ] Optionally block certificate submission if training is missing or expired.
- [ ] Add expiry alerts for training certificates.

## Infra

- [x] Reuse current uploads bucket.
- [x] No GCS prefix creation required.
- [x] Apply production lifecycle change from 3 newer versions to 12 newer versions in Terraform.
- [ ] Verify live bucket lifecycle/versioning after Terraform apply.

## Testing

- [ ] API unit/integration tests for listing training records.
- [ ] API tests for upload validation.
- [ ] API tests for PDF streaming auth and tenant boundaries.
- [ ] Frontend tests for table rendering and empty state.
- [ ] Apply DB migration to target environment.
- [ ] Manual test against local API + prod DB using local GCS credentials.

## Rollout Notes

- Start as admin-only visibility and management.
- Do not enforce training requirements in certificate workflows until historical data is backfilled.
- Backfill can be done gradually by uploading training evidence per instrument.
