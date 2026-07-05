-- Compatibility mirror. Canonical migrations live under packages/database.
ALTER TABLE "Certificate" ADD COLUMN "calibrationStartTime" TEXT;
ALTER TABLE "Certificate" ADD COLUMN "calibrationEndTime" TEXT;
