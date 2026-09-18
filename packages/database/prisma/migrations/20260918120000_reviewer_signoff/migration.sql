-- A reviewer signs off a section at a time, and decides the masters the app could not.
--
-- Two things were missing and they are the same shape. A reviewer could already be
-- precise about what is wrong - Request Revision files a comment against a named
-- section - but saying something is right had one setting: one Approve covering all
-- seven sections and recording nothing about which of them anyone read. And where the
-- engineer was stopped and made to justify a master the app could not rate, nobody was
-- ever asked to agree: approving the certificate accepted that justification silently.
--
-- CertificateSectionSignoff is one row per section a reviewer has read, against the
-- revision they read. A revision bumps and the sign-offs no longer apply - a tick
-- cannot vouch for a section the reviewer never saw - so they are recorded with the
-- revision rather than cleared, and the screen compares.
--
-- The master decision sits on the pairing it is about, beside the engineer's reason.
-- ACCEPTED or REJECTED, who, when, and for a rejection why - which is the text that
-- pre-fills Request Revision, so the reviewer writes it once where they saw it.
--
-- Additive and idempotent. Nothing existing is touched.

CREATE TABLE IF NOT EXISTS "CertificateSectionSignoff" (
  "id"            TEXT NOT NULL,
  "certificateId" TEXT NOT NULL,
  "section"       TEXT NOT NULL,
  "revision"      INTEGER NOT NULL,
  "userId"        TEXT,
  "userRole"      TEXT NOT NULL,
  "checkedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CertificateSectionSignoff_pkey" PRIMARY KEY ("id")
);

-- One sign-off per section per revision. A reviewer who unticks and ticks again is
-- replacing their answer, not adding to it.
CREATE UNIQUE INDEX IF NOT EXISTS "CertificateSectionSignoff_cert_section_revision_key"
  ON "CertificateSectionSignoff" ("certificateId", "section", "revision");
CREATE INDEX IF NOT EXISTS "CertificateSectionSignoff_certificateId_idx"
  ON "CertificateSectionSignoff" ("certificateId");

DO $$ BEGIN
  ALTER TABLE "CertificateSectionSignoff"
    ADD CONSTRAINT "CertificateSectionSignoff_certificateId_fkey"
    FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CertificateSectionSignoff"
    ADD CONSTRAINT "CertificateSectionSignoff_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "CertificateMasterInstrument"
  ADD COLUMN IF NOT EXISTS "reviewerDecision" TEXT;
ALTER TABLE "CertificateMasterInstrument"
  ADD COLUMN IF NOT EXISTS "reviewerDecisionReason" TEXT;
ALTER TABLE "CertificateMasterInstrument"
  ADD COLUMN IF NOT EXISTS "reviewerDecisionById" TEXT;
ALTER TABLE "CertificateMasterInstrument"
  ADD COLUMN IF NOT EXISTS "reviewerDecisionAt" TIMESTAMP(3);
ALTER TABLE "CertificateMasterInstrument"
  ADD COLUMN IF NOT EXISTS "reviewerDecisionRevision" INTEGER;
