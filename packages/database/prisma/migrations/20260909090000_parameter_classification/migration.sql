-- What each parameter measures, and which kind of it.
--
-- The fact that decides whether a master can serve a parameter, which until now lived
-- inside the registry's parameter name where nothing could read it. Matching on the
-- name under-reached - "Vacuum" never appeared for a Pressure parameter - and matching
-- on the unit over-reached, offering an AC source for a DC parameter because both are
-- volts.
--
-- Additive: two columns with defaults, so existing rows are valid immediately and the
-- seed fills them in on its next run.

ALTER TABLE "CalibrationParameterStandard" ADD COLUMN IF NOT EXISTS "measures" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CalibrationParameterStandard" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'any';
