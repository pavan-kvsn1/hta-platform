-- How a master measuring something else serves a parameter.
--
-- A temperature indicator can be calibrated with a millivolt source, its readings
-- converted through an expression. Nothing can derive that pairing, so it is declared:
-- which master capability was mapped to this parameter, what that master had to achieve
-- in its own units, and the expression that converts back.
--
-- One column rather than three because the three are only meaningful together - a
-- requirement in millivolts means nothing without saying millivolts of what, and
-- neither means anything without the conversion.
--
-- Additive: one nullable column, no default and no backfill. Null is the ordinary
-- case, where the master measures the same thing and the requirement comes from the
-- unit under test - which is every parameter written before today.

ALTER TABLE "Parameter" ADD COLUMN IF NOT EXISTS "masterMapping" JSONB;
