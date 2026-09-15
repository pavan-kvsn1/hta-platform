-- Which components an engineer is signed off on.
--
-- Additive and defaulted, so every existing row keeps working and reads as
-- "the whole instrument" — which is what a record that never said otherwise
-- honestly means. Nothing is rewritten and nothing is dropped.
ALTER TABLE "MasterInstrumentTraining"
  ADD COLUMN IF NOT EXISTS "scopeComponentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
