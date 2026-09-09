-- Which curve or type the unit under test is: Pt-100, Type K.
--
-- The counterpart of masterSubtype, which already records the same about the master
-- that measured it. Until now the curve of the instrument being calibrated - the thing
-- the certificate is actually about - had nowhere to live.
--
-- Additive: one nullable column, no default and no backfill, so existing rows are
-- untouched and anything written before this reads NULL, which the UI treats as
-- "not stated".

ALTER TABLE "Parameter" ADD COLUMN IF NOT EXISTS "parameterSubtype" TEXT;
