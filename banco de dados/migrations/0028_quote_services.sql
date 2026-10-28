ALTER TABLE quote_items ADD COLUMN is_service INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quote_items ADD COLUMN service_id TEXT;

CREATE INDEX IF NOT EXISTS idx_quote_items_service
ON quote_items(service_id, quote_id)
WHERE is_service = 1;
