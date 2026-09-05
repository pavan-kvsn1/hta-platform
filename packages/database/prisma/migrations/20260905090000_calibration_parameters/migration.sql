-- What a lab can calibrate, in two layers.
--
-- CalibrationParameterStandard is one shared list seeded from the master instrument
-- registry: it is what master capabilities are recorded against, so it is not a
-- tenant's to rename. CalibrationParameter is a tenant's own row per standard, holding
-- the name its engineers use and any units it prefers.
--
-- Purely additive: two new tables and their indexes. Nothing existing is altered, and
-- no data is read or moved, so a certificate written before this is untouched and the
-- tables are simply empty until the seed runs. IF NOT EXISTS keeps it idempotent.

CREATE TABLE IF NOT EXISTS "CalibrationParameterStandard" (
  "id"           TEXT NOT NULL,
  "standardName" TEXT NOT NULL,
  "category"     TEXT NOT NULL,
  "units"        TEXT[],
  "defaultUnit"  TEXT,
  "subtypes"     TEXT[],
  "aliases"      TEXT[],
  "source"       TEXT NOT NULL,
  "seedVersion"  TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalibrationParameterStandard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CalibrationParameterStandard_standardName_key"
  ON "CalibrationParameterStandard" ("standardName");
CREATE INDEX IF NOT EXISTS "CalibrationParameterStandard_category_idx"
  ON "CalibrationParameterStandard" ("category");

CREATE TABLE IF NOT EXISTS "CalibrationParameter" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "standardId"  TEXT NOT NULL,
  "customName"  TEXT NOT NULL,
  "units"       TEXT[],
  "defaultUnit" TEXT,
  "subtypes"    TEXT[],
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalibrationParameter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CalibrationParameter_tenantId_standardId_key"
  ON "CalibrationParameter" ("tenantId", "standardId");
CREATE INDEX IF NOT EXISTS "CalibrationParameter_tenantId_active_idx"
  ON "CalibrationParameter" ("tenantId", "active");

DO $$
BEGIN
  ALTER TABLE "CalibrationParameter"
    ADD CONSTRAINT "CalibrationParameter_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CalibrationParameter"
    ADD CONSTRAINT "CalibrationParameter_standardId_fkey"
    FOREIGN KEY ("standardId") REFERENCES "CalibrationParameterStandard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
