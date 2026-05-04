-- Add conflict support to drafts table
-- Stores the full server certificate JSON when a 409 conflict occurs during sync
ALTER TABLE drafts ADD COLUMN conflict_server_data JSON;
