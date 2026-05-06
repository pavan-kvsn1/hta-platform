-- Cached certificates from server (for offline dashboard display)
CREATE TABLE IF NOT EXISTS cached_certificates (
  id TEXT PRIMARY KEY,
  certificate_number TEXT NOT NULL,
  status TEXT NOT NULL,
  customer_name TEXT,
  uuc_description TEXT,
  date_of_calibration TEXT,
  current_revision INTEGER DEFAULT 1,
  reviewer_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
