-- Section 05 dynamic results table: persist the column schema and the values of the
-- columns beyond the fixed three on CalibrationResult.
--
-- Additive only. Every column is nullable with no default and no backfill, so existing
-- rows are untouched and a parameter written before this migration simply reads NULL,
-- which the loader treats as "derive the default Master/UUC columns from the results".
-- IF NOT EXISTS keeps the migration idempotent.

ALTER TABLE "Parameter" ADD COLUMN IF NOT EXISTS "fieldSchema" JSONB;
ALTER TABLE "Parameter" ADD COLUMN IF NOT EXISTS "tableName" TEXT;
ALTER TABLE "CalibrationResult" ADD COLUMN IF NOT EXISTS "values" JSONB;
