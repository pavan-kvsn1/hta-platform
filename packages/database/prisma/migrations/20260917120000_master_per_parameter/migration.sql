-- A parameter can be served by more than one master.
--
-- Sometimes both cover the whole of it - an RTD thermometer reading while a calibrator
-- sources the signal - and sometimes they divide it, one pressure gauge to 20 bar and
-- another beyond. Gaps between them are allowed; the lab decides what it covered.
--
-- The join row already allowed several masters against one parameter. What did not was
-- the declaration - which capability, which curve, why a thin ratio was accepted - which
-- lived on the parameter and had room for one master's answers. It belongs to the
-- pairing, so it moves here, beside the snapshot of the master's figures already held.
--
-- `rangeFrom`/`rangeTo` are the stretch this master was used over, and what it was
-- judged against. Null means the parameter's whole range, which is what every row
-- written before this meant.
--
-- The parameter keeps its own copy of the first master's declaration. Certificates
-- written before this carry it, and it is what anything not yet moved across reads.
--
-- Additive and idempotent. Nothing existing is touched.
ALTER TABLE "CertificateMasterInstrument" ADD COLUMN IF NOT EXISTS "rangeFrom" TEXT;
ALTER TABLE "CertificateMasterInstrument" ADD COLUMN IF NOT EXISTS "rangeTo" TEXT;
ALTER TABLE "CertificateMasterInstrument" ADD COLUMN IF NOT EXISTS "masterProfileId" TEXT;
ALTER TABLE "CertificateMasterInstrument" ADD COLUMN IF NOT EXISTS "masterSubtype" TEXT;
ALTER TABLE "CertificateMasterInstrument" ADD COLUMN IF NOT EXISTS "masterAcceptanceReason" TEXT;
CREATE INDEX IF NOT EXISTS "CertificateMasterInstrument_parameterId_idx"
  ON "CertificateMasterInstrument" ("parameterId");
