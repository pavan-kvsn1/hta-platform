-- Which half of a two-part instrument a capability describes, and how it measures.
--
-- Six masters are a readout and a probe, certified separately, each with its own
-- accuracy. The registry records which capability is which; the import had nowhere to
-- put it. Without it the two read as an unexplained pair of Temperature records, and
-- the declaration panel can only tell them apart by their range - which is identical.
--
-- Deliberately a column on the capability rather than a link to the component row.
-- The component row is about identity - this model, this serial - and 580 HTAIPL/L has
-- the part without the identity: it names an indicator and a sensor but prints one
-- model and one serial, so there is no component row for it to point at.
--
-- Named "part" and not "component" because MasterCapabilityProfile already has a
-- relation field of that name, pointing at the component row. The DROP below removes a
-- column added under that name minutes earlier in this same migration and rejected by
-- schema validation before anything could be written to it; it held no rows.
--
-- `mode` is the same shape for a different question: 782 HTAIPL/L is a caliper checker
-- whose two Length capabilities are its height face and its outside face.
--
-- Additive and idempotent. Nothing that has ever held a value is touched.
ALTER TABLE "MasterCapabilityProfile" DROP COLUMN IF EXISTS "component";
ALTER TABLE "MasterCapabilityProfile" ADD COLUMN IF NOT EXISTS "part" TEXT;
ALTER TABLE "MasterCapabilityProfile" ADD COLUMN IF NOT EXISTS "mode" TEXT;
