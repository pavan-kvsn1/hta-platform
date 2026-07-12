-- Apply the ten-download policy to new and existing customer download links.
ALTER TABLE "DownloadToken"
  ALTER COLUMN "maxDownloads" SET DEFAULT 10;

UPDATE "DownloadToken"
SET "maxDownloads" = 10
WHERE "maxDownloads" <> 10;