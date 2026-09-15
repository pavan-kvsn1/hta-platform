-- Superseding a certificate, recorded as the one act it is.
--
-- All three are additive and nullable, so every row that exists today keeps
-- working. A null archivedReason reads as "archived before we started asking",
-- which is true, rather than as a reason of "".
ALTER TABLE "MasterInstrumentCertificate"
  ADD COLUMN IF NOT EXISTS "supersededById" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedAt"     TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MasterInstrumentCertificate_supersededById_fkey'
  ) THEN
    ALTER TABLE "MasterInstrumentCertificate"
      ADD CONSTRAINT "MasterInstrumentCertificate_supersededById_fkey"
      FOREIGN KEY ("supersededById") REFERENCES "MasterInstrumentCertificate"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MasterInstrumentCertificate_supersededById_idx"
  ON "MasterInstrumentCertificate"("supersededById");
