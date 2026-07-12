-- UUC and master-instrument images support multiple evidence photos. Earlier
-- upload logic incorrectly marked prior photos as superseded, even though only
-- reading-point images are replacement/versioned records.
UPDATE "CertificateImage"
SET
  "isLatest" = true,
  "archivedAt" = NULL,
  "supersededById" = NULL
WHERE "imageType" IN ('UUC', 'MASTER_INSTRUMENT')
  AND "isLatest" = false
  AND "supersededById" IS NOT NULL;