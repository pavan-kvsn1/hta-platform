-- A certificate covers however many capabilities it covers.
--
-- Additive and defaulted. capabilityProfileId stays and is still written, so
-- every reader of it keeps working; an empty array means "read that column".
ALTER TABLE "MasterInstrumentCertificate"
  ADD COLUMN IF NOT EXISTS "capabilityProfileIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Existing rows start out saying exactly what they already said.
UPDATE "MasterInstrumentCertificate"
   SET "capabilityProfileIds" = ARRAY["capabilityProfileId"]
 WHERE "capabilityProfileId" IS NOT NULL
   AND cardinality("capabilityProfileIds") = 0;
