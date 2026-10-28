CREATE TABLE IF NOT EXISTS quote_technicians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL,
    operator_id INTEGER,
    operator_name TEXT NOT NULL,
    daily_units INTEGER NOT NULL DEFAULT 1,
    cache_value REAL NOT NULL DEFAULT 0,
    paid_at TEXT,
    paid_by_username TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quote_technicians_quote
ON quote_technicians(quote_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_quote_technicians_operator
ON quote_technicians(operator_id);
