-- =============================================================
-- Local certificate drafts
-- Mirrors server Certificate model for draft-phase fields
-- =============================================================
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  server_id TEXT,
  tenant_id TEXT NOT NULL,
  engineer_id TEXT NOT NULL,

  certificate_number TEXT,
  customer_name TEXT,
  customer_address TEXT,
  customer_contact_name TEXT,
  customer_contact_email TEXT,
  customer_account_id TEXT,
  uuc_description TEXT,
  uuc_make TEXT,
  uuc_model TEXT,
  uuc_serial_number TEXT,
  uuc_instrument_id TEXT,
  uuc_location_name TEXT,
  uuc_machine_name TEXT,
  date_of_calibration TEXT,
  calibration_due_date TEXT,
  calibration_tenure INTEGER DEFAULT 12,
  due_date_adjustment INTEGER DEFAULT 0,
  due_date_not_applicable INTEGER DEFAULT 0,
  ambient_temperature TEXT,
  relative_humidity TEXT,
  srf_number TEXT,
  srf_date TEXT,
  calibration_status JSON,
  sticker_old_removed TEXT,
  sticker_new_affixed TEXT,
  status_notes TEXT,
  selected_conclusion_statements JSON,
  additional_conclusion_statement TEXT,

  status TEXT NOT NULL DEFAULT 'LOCAL_DRAFT',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_drafts_engineer ON drafts(engineer_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

-- =============================================================
-- Measurement parameters
-- =============================================================
CREATE TABLE IF NOT EXISTS draft_parameters (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  parameter_name TEXT NOT NULL,
  parameter_unit TEXT NOT NULL,
  range_min TEXT,
  range_max TEXT,
  range_unit TEXT,
  operating_min TEXT,
  operating_max TEXT,
  operating_unit TEXT,
  least_count_value TEXT,
  least_count_unit TEXT,
  accuracy_value TEXT,
  accuracy_unit TEXT,
  accuracy_type TEXT DEFAULT 'ABSOLUTE',
  error_formula TEXT DEFAULT 'A-B',
  show_after_adjustment INTEGER DEFAULT 0,
  requires_binning INTEGER DEFAULT 0,
  bins JSON,
  sop_reference TEXT,
  master_instrument_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_params_draft ON draft_parameters(draft_id);

-- =============================================================
-- Calibration results
-- =============================================================
CREATE TABLE IF NOT EXISTS draft_calibration_results (
  id TEXT PRIMARY KEY,
  parameter_id TEXT NOT NULL REFERENCES draft_parameters(id) ON DELETE CASCADE,
  point_number INTEGER NOT NULL,
  standard_reading TEXT,
  before_adjustment TEXT,
  after_adjustment TEXT,
  error_observed REAL,
  is_out_of_limit INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_results_param ON draft_calibration_results(parameter_id);

-- =============================================================
-- Master instruments used in draft
-- =============================================================
CREATE TABLE IF NOT EXISTS draft_master_instruments (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  parameter_id TEXT,
  master_instrument_id TEXT NOT NULL,
  category TEXT,
  description TEXT,
  make TEXT,
  model TEXT,
  asset_no TEXT,
  serial_number TEXT,
  calibrated_at TEXT,
  report_no TEXT,
  calibration_due_date TEXT,
  sop_reference TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_draft_masters_draft ON draft_master_instruments(draft_id);

-- =============================================================
-- Local image files (metadata; actual files encrypted on disk)
-- =============================================================
CREATE TABLE IF NOT EXISTS draft_images (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  image_type TEXT NOT NULL,
  master_instrument_index INTEGER,
  parameter_index INTEGER,
  point_number INTEGER,
  local_path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  caption TEXT,
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_images_draft ON draft_images(draft_id);
CREATE INDEX IF NOT EXISTS idx_images_type ON draft_images(draft_id, image_type);

-- =============================================================
-- Sync queue (FIFO with retry)
-- =============================================================
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  action TEXT NOT NULL,
  payload JSON NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  retries INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status);

-- =============================================================
-- Cached reference data (for offline dropdowns)
-- =============================================================
CREATE TABLE IF NOT EXISTS ref_master_instruments (
  id TEXT PRIMARY KEY,
  data JSON NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ref_customers (
  id TEXT PRIMARY KEY,
  data JSON NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================
-- Audit log (append-only)
-- =============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSON,
  synced INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_audit_synced ON audit_log(synced);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);

-- Append-only enforcement
CREATE TRIGGER IF NOT EXISTS prevent_audit_update
  BEFORE UPDATE OF user_id, device_id, action, entity_type, entity_id, metadata, timestamp
  ON audit_log
  BEGIN SELECT RAISE(ABORT, 'Audit log records are immutable'); END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
  BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'Audit log records cannot be deleted'); END;

-- =============================================================
-- One-time codes for offline 2FA
-- =============================================================
CREATE TABLE IF NOT EXISTS offline_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  batch_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_codes_available ON offline_codes(used, sequence);
CREATE INDEX IF NOT EXISTS idx_codes_batch ON offline_codes(batch_id);

-- =============================================================
-- Session tracking (24h re-auth cadence)
-- =============================================================
CREATE TABLE IF NOT EXISTS session_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- =============================================================
-- Device metadata
-- =============================================================
CREATE TABLE IF NOT EXISTS device_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- =============================================================
-- Migrations tracker
-- =============================================================
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
