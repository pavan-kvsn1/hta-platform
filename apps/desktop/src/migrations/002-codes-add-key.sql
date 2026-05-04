-- Add challenge key column to offline_codes for challenge-response grid
ALTER TABLE offline_codes ADD COLUMN key TEXT;

-- Backfill existing rows with sequence-based keys (A1-E10 pattern)
-- This handles any codes already stored without keys
UPDATE offline_codes SET key =
  CASE
    WHEN sequence <= 10 THEN 'A' || sequence
    WHEN sequence <= 20 THEN 'B' || (sequence - 10)
    WHEN sequence <= 30 THEN 'C' || (sequence - 20)
    WHEN sequence <= 40 THEN 'D' || (sequence - 30)
    ELSE 'E' || (sequence - 40)
  END
WHERE key IS NULL;
