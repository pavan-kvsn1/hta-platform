-- Master instrument capabilities, components and audit.
--
-- Additive throughout. No existing column is altered or dropped, and no existing row is
-- touched. The flat columns on MasterInstrument (rangeData, parameterCapabilities,
-- parameterRoles, parameterGroup, sopReferences) stay exactly as they are.
--
-- Design: docs/scope/master-capability-schema.md

-- CreateEnum
CREATE TYPE "CapabilityKind" AS ENUM ('RANGE', 'ARTIFACT');

-- CreateEnum
CREATE TYPE "CapabilityRole" AS ENUM ('MEASURING', 'SOURCE');

-- CreateEnum
CREATE TYPE "AccuracyKind" AS ENUM ('SYMMETRIC', 'FORMULA', 'CLASS');

-- CreateEnum
CREATE TYPE "ComponentRole" AS ENUM ('INDICATOR', 'SENSOR');

-- AlterTable
ALTER TABLE "MasterInstrumentCertificate" ADD COLUMN     "capabilityProfileId" TEXT;

-- CreateTable
CREATE TABLE "MasterCapabilityProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "profileKey" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "role" "CapabilityRole" NOT NULL,
    "unit" TEXT NOT NULL,
    "kind" "CapabilityKind" NOT NULL DEFAULT 'RANGE',
    "minValue" DECIMAL(20,9),
    "maxValue" DECIMAL(20,9),
    "minInclusive" BOOLEAN NOT NULL DEFAULT true,
    "maxInclusive" BOOLEAN NOT NULL DEFAULT true,
    "subtypeKind" TEXT,
    "sopReferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'registry',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "MasterCapabilityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterCapabilitySubtype" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "subtypeKey" TEXT NOT NULL,
    "minValue" DECIMAL(20,9),
    "maxValue" DECIMAL(20,9),
    "minInclusive" BOOLEAN NOT NULL DEFAULT true,
    "maxInclusive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MasterCapabilitySubtype_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterCapabilityBucket" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "subtypeId" TEXT,
    "bucketKey" TEXT NOT NULL,
    "minValue" DECIMAL(20,9),
    "maxValue" DECIMAL(20,9),
    "minInclusive" BOOLEAN NOT NULL DEFAULT true,
    "maxInclusive" BOOLEAN NOT NULL DEFAULT true,
    "leastCountValue" DECIMAL(20,9),
    "leastCountUnit" TEXT,
    "accuracyKind" "AccuracyKind",
    "accuracyValue" DECIMAL(20,9),
    "accuracyUnit" TEXT,
    "accuracyPolarity" TEXT,
    "accuracyFormula" TEXT,
    "accuracyClass" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MasterCapabilityBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterInstrumentComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "role" "ComponentRole" NOT NULL,
    "componentKey" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterInstrumentComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterCapabilityAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "profileKey" TEXT,
    "subtypeKey" TEXT,
    "bucketKey" TEXT,
    "field" TEXT,
    "beforeValue" TEXT,
    "afterValue" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterCapabilityAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasterCapabilityProfile_tenantId_instrumentId_idx" ON "MasterCapabilityProfile"("tenantId", "instrumentId");

-- CreateIndex
CREATE INDEX "MasterCapabilityProfile_parameter_idx" ON "MasterCapabilityProfile"("parameter");

-- CreateIndex
CREATE UNIQUE INDEX "MasterCapabilityProfile_tenantId_instrumentId_profileKey_key" ON "MasterCapabilityProfile"("tenantId", "instrumentId", "profileKey");

-- CreateIndex
CREATE INDEX "MasterCapabilitySubtype_profileId_idx" ON "MasterCapabilitySubtype"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterCapabilitySubtype_profileId_subtypeKey_key" ON "MasterCapabilitySubtype"("profileId", "subtypeKey");

-- CreateIndex
CREATE INDEX "MasterCapabilityBucket_profileId_idx" ON "MasterCapabilityBucket"("profileId");

-- CreateIndex
CREATE INDEX "MasterCapabilityBucket_subtypeId_idx" ON "MasterCapabilityBucket"("subtypeId");

-- CreateIndex
CREATE INDEX "MasterInstrumentComponent_tenantId_instrumentId_idx" ON "MasterInstrumentComponent"("tenantId", "instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterInstrumentComponent_tenantId_instrumentId_componentKe_key" ON "MasterInstrumentComponent"("tenantId", "instrumentId", "componentKey");

-- CreateIndex
CREATE INDEX "MasterCapabilityAudit_tenantId_instrumentId_createdAt_idx" ON "MasterCapabilityAudit"("tenantId", "instrumentId", "createdAt");

-- CreateIndex
CREATE INDEX "MasterInstrumentCertificate_capabilityProfileId_idx" ON "MasterInstrumentCertificate"("capabilityProfileId");

-- AddForeignKey
ALTER TABLE "MasterInstrumentCertificate" ADD CONSTRAINT "MasterInstrumentCertificate_capabilityProfileId_fkey" FOREIGN KEY ("capabilityProfileId") REFERENCES "MasterCapabilityProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "MasterCapabilityProfile" ADD CONSTRAINT "MasterCapabilityProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCapabilitySubtype" ADD CONSTRAINT "MasterCapabilitySubtype_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MasterCapabilityProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCapabilityBucket" ADD CONSTRAINT "MasterCapabilityBucket_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MasterCapabilityProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCapabilityBucket" ADD CONSTRAINT "MasterCapabilityBucket_subtypeId_fkey" FOREIGN KEY ("subtypeId") REFERENCES "MasterCapabilitySubtype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterInstrumentComponent" ADD CONSTRAINT "MasterInstrumentComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCapabilityAudit" ADD CONSTRAINT "MasterCapabilityAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterCapabilityAudit" ADD CONSTRAINT "MasterCapabilityAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The bucket key must be unique per profile, and per subtype where there is one.
-- A plain UNIQUE (profileId, subtypeId, bucketKey) does not hold: Postgres treats nulls
-- as distinct, so a profile with no subtypes could take B1 twice. NULLS NOT DISTINCT
-- closes that, and Prisma cannot emit it - hence by hand here.
CREATE UNIQUE INDEX "MasterCapabilityBucket_profileId_subtypeId_bucketKey_key"
  ON "MasterCapabilityBucket" ("profileId", "subtypeId", "bucketKey")
  NULLS NOT DISTINCT;
