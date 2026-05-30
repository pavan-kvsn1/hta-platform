# Artifact Storage Split Plan

## Context

Production currently has ambiguous artifact storage configuration. The live API ConfigMap has:

```text
GCS_BUCKET=hta-certificates-prod
```

Terraform, however, creates the production uploads bucket as:

```text
hta-platform-prod-production-uploads
```

The API also uses broad storage helpers such as `getStorageProvider()` and `getImageStorageProvider()`, which means signed customer certificate PDFs, certificate images, master instrument PDFs, training evidence PDFs, and chat attachments can end up coupled to the same bucket configuration. This is a poor boundary for IAM, retention, audit, lifecycle rules, migration, and incident blast radius.

## Target Model

Use separate buckets by artifact class:

```text
GCS_SIGNED_CERTIFICATES_BUCKET
GCS_CERTIFICATE_IMAGES_BUCKET
GCS_MASTER_INSTRUMENT_CERTIFICATES_BUCKET
GCS_TRAINING_EVIDENCE_BUCKET
GCS_CHAT_ATTACHMENTS_BUCKET
```

Recommended bucket names:

```text
hta-platform-prod-signed-certificates
hta-platform-prod-certificate-images
hta-platform-prod-master-instruments
hta-platform-prod-training-evidence
hta-platform-prod-chat-attachments
```

## Object Layout

Signed customer certificate PDFs:

```text
signed/{certificateId}/signed.pdf
```

Certificate evidence images:

```text
certificates/{certificateId}/uuc/...
certificates/{certificateId}/master/{masterInstrumentIndex}/...
certificates/{certificateId}/readings/param-{parameterIndex}/point-{pointNumber}/uuc/...
certificates/{certificateId}/readings/param-{parameterIndex}/point-{pointNumber}/master/...
```

Master instrument calibration PDFs:

```text
master-instruments/...
```

Training evidence PDFs:

```text
master-instrument-training/{instrumentId}/{engineerId}/...
```

Chat attachments:

```text
threads/{threadId}/...
```

## Implementation Plan

1. Revert any broad ConfigMap change that repoints generic `GCS_BUCKET` to the uploads bucket.

2. Fix the current master instrument PDF issue narrowly:

```text
GCS_MASTER_INSTRUMENT_CERTIFICATES_BUCKET=hta-platform-prod-production-uploads
```

Master instrument routes should use a dedicated master instrument storage provider. Signed customer certificates, certificate images, training evidence, and chat attachments should stay on their current storage provider until explicitly migrated.

3. Add Terraform-managed buckets for each artifact class.

4. Add Terraform outputs for the bucket names.

5. Update Kubernetes ConfigMap generation/application to inject explicit storage env vars.

6. Add named API storage providers:

```ts
getSignedCertificateStorage()
getCertificateImageStorage()
getMasterInstrumentCertificateStorage()
getTrainingEvidenceStorage()
getChatAttachmentStorage()
```

7. Keep migration fallbacks temporarily:

```text
dedicated bucket env -> legacy GCS_BUCKET / GCS_CERTIFICATES_BUCKET
```

8. Migrate data category by category:

```text
master instrument PDFs
certificate images
signed customer certificate PDFs
training evidence PDFs
chat attachments
```

9. Verify each category after migration:

```text
DB path exists
object exists in new bucket
API download/view endpoint succeeds
old bucket path no longer required
```

10. Remove legacy fallbacks only after production verification is complete.

## Current Priority

Do master instrument PDFs first. That fixes the active issue without risking customer signed certificate downloads or certificate image uploads.

## Known Related Issue

The public customer download-token route reads `Certificate.signedPdfPath` from local filesystem using `fs.readFile`. Production signed certificate downloads should instead use the signed certificate storage provider. This should be fixed as part of the signed certificate bucket migration.
