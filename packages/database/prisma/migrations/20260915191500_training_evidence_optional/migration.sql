-- A training record can exist without a document.
--
-- The four evidence columns were NOT NULL, which meant the only way to detach a
-- file that had been attached in error was to delete the record - losing the
-- dates, the scope and the engineer with it, so a wrong filename cost a whole
-- sign-off. Dropping NOT NULL is additive: every existing row already has a
-- value and keeps it, and nothing that reads these columns has to change.
ALTER TABLE "MasterInstrumentTraining" ALTER COLUMN "certificateFileName" DROP NOT NULL;
ALTER TABLE "MasterInstrumentTraining" ALTER COLUMN "certificateFileSize" DROP NOT NULL;
ALTER TABLE "MasterInstrumentTraining" ALTER COLUMN "certificateMimeType" DROP NOT NULL;
ALTER TABLE "MasterInstrumentTraining" ALTER COLUMN "certificatePath"     DROP NOT NULL;
