ALTER TABLE quote_items ADD COLUMN service_width REAL;
ALTER TABLE quote_items ADD COLUMN service_height REAL;

CREATE TABLE IF NOT EXISTS quote_service_prices (
    service_id TEXT PRIMARY KEY,
    unit_price REAL NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
