-- A least count becomes a number.
--
-- It is the size of one division, so it is a quantity: 0.05, 0.025, 5, 100. Held as
-- free text it accepted things that are not quantities at all - "NA" on five
-- parameters, and on one, "0.1,  0.01, 0.001", which is three least counts typed into a
-- field that can hold one. Nothing could check a reading against those, and nothing
-- stopped more of them arriving.
--
-- The master registry's own least count has been DECIMAL(20,9) since it was built. This
-- brings the certificate's two into line with it.
--
-- Nothing is lost. Every value that is a quantity converts, trailing spaces included.
-- Values meaning "not recorded" - NULL, blank, "NA" - become NULL, which is what they
-- already meant. Anything else is copied verbatim into "leastCountValueLegacy" before
-- the column changes type, so the original text is still there to read.
--
-- Each step checks whether it has already run. A migration is most likely to be run a
-- second time when the first attempt failed part way through, which is the moment it
-- must not fall over on work it already did.

-- ---------------------------------------------------------------------------------
-- Parameter.leastCountValue
-- ---------------------------------------------------------------------------------

ALTER TABLE "Parameter" ADD COLUMN IF NOT EXISTS "leastCountValueLegacy" TEXT;

COMMENT ON COLUMN "Parameter"."leastCountValueLegacy" IS
  'What was typed where it was not a quantity and the conversion could not keep it. Null on every row whose least count converted cleanly, which is all but one of them.';

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_name = 'Parameter' AND column_name = 'leastCountValue') <> 'text' THEN
    RAISE NOTICE 'Parameter.leastCountValue is already a number; nothing to convert.';
    RETURN;
  END IF;

  -- Only what would otherwise be lost. A blank or "NA" already meant "not recorded" and
  -- NULL says the same thing, so copying those would preserve nothing.
  UPDATE "Parameter"
     SET "leastCountValueLegacy" = "leastCountValue"
   WHERE "leastCountValueLegacy" IS NULL
     AND "leastCountValue" IS NOT NULL
     AND btrim("leastCountValue") <> ''
     AND upper(btrim("leastCountValue")) <> 'NA'
     AND btrim("leastCountValue") !~ '^[0-9]*\.?[0-9]+$';

  EXECUTE $sql$
    ALTER TABLE "Parameter"
      ALTER COLUMN "leastCountValue" TYPE DECIMAL(20,9)
      USING (
        CASE
          WHEN btrim(coalesce("leastCountValue", '')) ~ '^[0-9]*\.?[0-9]+$'
           AND btrim("leastCountValue")::numeric > 0
          THEN btrim("leastCountValue")::numeric(20,9)
          ELSE NULL
        END
      )
  $sql$;
END $$;

-- A step is a size, so nought and below are not steps. Stated here as well as in the
-- form, because the form is not the only thing that writes this column.
ALTER TABLE "Parameter"
  DROP CONSTRAINT IF EXISTS "Parameter_leastCountValue_positive";
ALTER TABLE "Parameter"
  ADD CONSTRAINT "Parameter_leastCountValue_positive"
  CHECK ("leastCountValue" IS NULL OR "leastCountValue" > 0);

-- ---------------------------------------------------------------------------------
-- CertificateMasterInstrument.masterLeastCount
-- ---------------------------------------------------------------------------------
--
-- Every one of the 47 rows is NULL: the column records what the master's own
-- certificate said, snapshotted when it was chosen, and no certificate has been written
-- since that snapshot started being taken. So there is nothing here to preserve and no
-- salvage column is worth carrying.
--
-- If that has changed by the time this runs, it stops rather than discarding the value.
-- A migration that refuses is a deploy to look at; one that quietly nulls a column is a
-- number gone with nothing left to say it was ever there.

DO $$
DECLARE unconvertible INT;
BEGIN
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_name = 'CertificateMasterInstrument'
         AND column_name = 'masterLeastCount') <> 'text' THEN
    RAISE NOTICE 'CertificateMasterInstrument.masterLeastCount is already a number; nothing to convert.';
    RETURN;
  END IF;

  SELECT count(*) INTO unconvertible
    FROM "CertificateMasterInstrument"
   WHERE "masterLeastCount" IS NOT NULL
     AND btrim("masterLeastCount") <> ''
     AND upper(btrim("masterLeastCount")) <> 'NA'
     AND btrim("masterLeastCount") !~ '^[0-9]*\.?[0-9]+$';

  IF unconvertible > 0 THEN
    RAISE EXCEPTION
      'masterLeastCount holds % value(s) that are not quantities. Read them before running this, because converting the column would discard them.',
      unconvertible;
  END IF;

  EXECUTE $sql$
    ALTER TABLE "CertificateMasterInstrument"
      ALTER COLUMN "masterLeastCount" TYPE DECIMAL(20,9)
      USING (
        CASE
          WHEN btrim(coalesce("masterLeastCount", '')) ~ '^[0-9]*\.?[0-9]+$'
           AND btrim("masterLeastCount")::numeric > 0
          THEN btrim("masterLeastCount")::numeric(20,9)
          ELSE NULL
        END
      )
  $sql$;
END $$;

ALTER TABLE "CertificateMasterInstrument"
  DROP CONSTRAINT IF EXISTS "CertificateMasterInstrument_masterLeastCount_positive";
ALTER TABLE "CertificateMasterInstrument"
  ADD CONSTRAINT "CertificateMasterInstrument_masterLeastCount_positive"
  CHECK ("masterLeastCount" IS NULL OR "masterLeastCount" > 0);
