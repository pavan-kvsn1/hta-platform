-- The range an audit entry is about, as it read at the time.
--
-- Ranges are numbered by position in the table now, and positions shift when one is
-- deleted, so an entry recorded against "range 2" would come to mean a different range.
-- The range itself never gets reassigned.
--
-- Additive and nullable: entries written before this read as having no label.

ALTER TABLE "MasterCapabilityAudit" ADD COLUMN "bucketLabel" TEXT;
