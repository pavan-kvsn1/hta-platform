-- How many pages a certificate PDF has.
--
-- Additive and nullable: every existing row stays valid and reads as "not counted yet".
-- It is filled in the first time a certificate is opened, by counting the pages in the
-- stored file, so nothing has to be backfilled.

ALTER TABLE "MasterInstrumentCertificate" ADD COLUMN "pageCount" INTEGER;
