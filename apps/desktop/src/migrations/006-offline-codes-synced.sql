-- Track which used offline codes have been synced back to the server
ALTER TABLE offline_codes ADD COLUMN synced_to_server INTEGER NOT NULL DEFAULT 0;
