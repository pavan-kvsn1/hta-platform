-- How the master instrument was used for a parameter: which capability profile, and
-- where that profile records curves, which curve.
--
-- Declared by the engineer rather than inferred - the readings cannot tell a source
-- from a measuring device, nor a Pt-100 from a Cu-53 - so the answer has to be stored.
--
-- Additive only. Both columns are nullable with no default and no backfill, so existing
-- rows are untouched and a parameter written before this migration reads NULL, which
-- the UI treats as "not yet declared" and falls back to the best fit.
-- IF NOT EXISTS keeps the migration idempotent.

ALTER TABLE "Parameter" ADD COLUMN IF NOT EXISTS "masterProfileId" TEXT;
ALTER TABLE "Parameter" ADD COLUMN IF NOT EXISTS "masterSubtype" TEXT;
