-- Asymmetric accuracy, and what a certificate was read as.
--
-- Both additive and nullable. ASYMMETRIC joins the enum rather than replacing
-- anything, so every bucket already on file keeps the kind it has.
--
-- An accuracy that is +0.5 on one side and −0.3 on the other is not a ±
-- anything. Until now it could only be stored by rounding to the larger of the
-- two, which overstates the instrument.
ALTER TYPE "AccuracyKind" ADD VALUE IF NOT EXISTS 'ASYMMETRIC';

ALTER TABLE "MasterCapabilityBucket"
  ADD COLUMN IF NOT EXISTS "accuracyUpper" DECIMAL(20,9),
  ADD COLUMN IF NOT EXISTS "accuracyLower" DECIMAL(20,9);

-- The capability as it stood when the certificate was read. Null on every row
-- that exists today, which honestly means "we did not keep it".
ALTER TABLE "MasterInstrumentCertificate"
  ADD COLUMN IF NOT EXISTS "capabilitySnapshot" JSONB;
