-- Cached images from server certificates (for offline viewing)
CREATE TABLE IF NOT EXISTS cached_images (
  id TEXT PRIMARY KEY,
  certificate_id TEXT NOT NULL,
  image_type TEXT NOT NULL,
  local_path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER DEFAULT 0,
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (certificate_id) REFERENCES cached_certificates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cached_images_cert ON cached_images(certificate_id);
