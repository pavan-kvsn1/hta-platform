-- The numbers behind a formula accuracy, not just the sentence.
--
-- A bucket whose accuracy reads "+/-0.02% of reading +/-2 count" stored only that
-- text. The app cannot compute with a sentence: to rate a master at a 12 V reading
-- it needs 0.0002 x 12, plus 2 counts of the least count. Those four facts were
-- parsed once when the registry was built and then dropped on import, so 120
-- buckets across 85 instruments had nothing to rate by and would read as unknown.
--
-- Additive: four nullable columns beside the accuracyFormula they belong to, the
-- same way accuracyUpper/accuracyLower sit with ASYMMETRIC. Nothing is dropped and
-- no existing row is rewritten.
--
-- IF NOT EXISTS so the fix script can be run twice without the second run
-- failing on columns the first one added - which is what happens when a deploy
-- is retried, and a retry should not need a human to work out how far it got.
--
-- digits is Decimal rather than Int because the data holds 0.01 and 0.1, which an
-- integer column would silently round to nothing.
ALTER TABLE "MasterCapabilityBucket" ADD COLUMN IF NOT EXISTS "accuracyPercentOf"    TEXT;
ALTER TABLE "MasterCapabilityBucket" ADD COLUMN IF NOT EXISTS "accuracyPercentValue" DECIMAL(20,9);
ALTER TABLE "MasterCapabilityBucket" ADD COLUMN IF NOT EXISTS "accuracyDigits"       DECIMAL(20,9);
ALTER TABLE "MasterCapabilityBucket" ADD COLUMN IF NOT EXISTS "accuracyDigitsUnit"   TEXT;
