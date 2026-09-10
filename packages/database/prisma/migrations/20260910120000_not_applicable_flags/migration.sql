-- Fields the unit under test genuinely does not have.
--
-- A bare sensor has no serial number of its own; a fixture built in house has no
-- instrument id; a working standard may declare no operating range. Left blank these
-- read as unfinished, and the section can never be completed - so they are marked
-- instead, and the certificate prints "Not Applicable".
--
-- The operating range's flag carries a rule with it: where a parameter declares no
-- operating range, the measured range stands in for it and at least one calibration
-- point has to fall inside that. Otherwise the certificate covers a span nothing was
-- read at.
--
-- Additive: three booleans defaulting to false, which is what every existing row
-- means today - the field is not marked not-applicable. No backfill, nothing dropped.

ALTER TABLE "Certificate"
  ADD COLUMN IF NOT EXISTS "uucSerialNumberNotApplicable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "uucInstrumentIdNotApplicable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Parameter"
  ADD COLUMN IF NOT EXISTS "operatingRangeNotApplicable" BOOLEAN NOT NULL DEFAULT false;
