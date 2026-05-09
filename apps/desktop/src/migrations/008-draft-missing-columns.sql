-- Add missing form fields to drafts table
ALTER TABLE drafts ADD COLUMN calibrated_at TEXT DEFAULT 'LAB';
ALTER TABLE drafts ADD COLUMN engineer_notes TEXT;
ALTER TABLE drafts ADD COLUMN reviewer_id TEXT;

-- Cached reviewers for offline dropdown
CREATE TABLE IF NOT EXISTS ref_reviewers (
  id TEXT PRIMARY KEY,
  data JSON NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
