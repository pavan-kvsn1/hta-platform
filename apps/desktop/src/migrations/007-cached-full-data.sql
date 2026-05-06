-- Store full certificate JSON for offline editing
ALTER TABLE cached_certificates ADD COLUMN full_data TEXT;
