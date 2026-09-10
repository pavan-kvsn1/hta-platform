-- How the due date is written on the certificate.
--
-- 02/09/2026 is September in Bangalore and February in Boston. A certificate that
-- crosses a border has to be read the way its reader reads, so the lab says which way
-- it is written. The stored date does not change - only how it is printed.
--
-- Additive: one column defaulting to the format the PDF has always used, so every
-- certificate already written prints exactly as it did.

ALTER TABLE "Certificate"
  ADD COLUMN IF NOT EXISTS "calibrationDueDateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY';
