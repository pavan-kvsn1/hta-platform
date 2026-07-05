-- Add explicit calibration start/end times.
-- Stored as HH:mm strings; hours are derived at read/render time.
ALTER TABLE "Certificate" ADD COLUMN "calibrationStartTime" TEXT;
ALTER TABLE "Certificate" ADD COLUMN "calibrationEndTime" TEXT;
