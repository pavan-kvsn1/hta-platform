-- Whether the tenure was entered in months or in years.
--
-- The tenure is stored in months whatever was chosen, so the due date stays one sum and
-- every certificate already written still adds up. This remembers only how the engineer
-- wrote it: a two-year tenure reads as two years rather than twenty-four months.
--
-- Additive: one column defaulting to months, which is what every existing row is.

ALTER TABLE "Certificate"
  ADD COLUMN IF NOT EXISTS "calibrationTenureUnit" TEXT NOT NULL DEFAULT 'months';
