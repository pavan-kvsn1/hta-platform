-- Why a master whose accuracy ratio falls below the lab's threshold was accepted.
--
-- The shortfall is a judgement the lab makes and signs for, so the reason belongs on
-- the certificate rather than in someone's memory.
--
-- Additive only: one nullable column, no default and no backfill, so existing rows are
-- untouched and a parameter written before this reads NULL, which the UI treats as
-- "no shortfall recorded". IF NOT EXISTS keeps the migration idempotent.

ALTER TABLE "Parameter" ADD COLUMN IF NOT EXISTS "masterAcceptanceReason" TEXT;
