-- What the master's own certificate said, snapshotted when it was chosen.
-- Additive and nullable: existing rows stay as they are and the PDF reads their
-- absence as "Not recorded" rather than inventing a number from today's registry.
ALTER TABLE "CertificateMasterInstrument"
  ADD COLUMN IF NOT EXISTS "capabilityParameter" TEXT,
  ADD COLUMN IF NOT EXISTS "masterLeastCount" TEXT,
  ADD COLUMN IF NOT EXISTS "masterLeastCountUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "masterAccuracy" TEXT,
  ADD COLUMN IF NOT EXISTS "masterAccuracyUnit" TEXT;
