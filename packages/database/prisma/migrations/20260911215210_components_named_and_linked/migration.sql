-- A component is a named part, and a capability can belong to one.
--
-- Two changes, both to structures added earlier today, so nothing long-standing moves.
--
-- 1. MasterInstrumentComponent.role was an enum of INDICATOR and SENSOR. Those are the
--    only two the master registry happens to record; an instrument can just as well have
--    a transducer, a readout or a bath, and an enum made those unrecordable. It becomes
--    a free name. The 66 existing rows keep their meaning, in title case.
--
-- 2. MasterCapabilityProfile gains a nullable componentId. Null means the capability
--    belongs to the instrument as a whole, which is every row today. It matters for a
--    composite: 188 HTAIPL/L is one indicator with three transducers, and its 0-700 bar
--    profile belongs to the high pressure one. Without this there is no honest answer to
--    which capability a certificate covers.

ALTER TABLE "MasterInstrumentComponent" ADD COLUMN "name" TEXT;

UPDATE "MasterInstrumentComponent"
   SET "name" = CASE "role"::TEXT
                  WHEN 'INDICATOR' THEN 'Indicator'
                  WHEN 'SENSOR'    THEN 'Sensor'
                  ELSE 'Component'
                END;

ALTER TABLE "MasterInstrumentComponent" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "MasterInstrumentComponent" DROP COLUMN "role";
DROP TYPE "ComponentRole";

ALTER TABLE "MasterCapabilityProfile" ADD COLUMN "componentId" TEXT;

ALTER TABLE "MasterCapabilityProfile"
  ADD CONSTRAINT "MasterCapabilityProfile_componentId_fkey"
  FOREIGN KEY ("componentId") REFERENCES "MasterInstrumentComponent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MasterCapabilityProfile_componentId_idx"
  ON "MasterCapabilityProfile" ("componentId");
