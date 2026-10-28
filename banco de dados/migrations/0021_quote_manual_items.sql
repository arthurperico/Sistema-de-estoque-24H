ALTER TABLE quote_items ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS quote_manual_item_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_item_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    space_id INTEGER,
    action_type TEXT NOT NULL CHECK(action_type IN ('saida', 'entrada')),
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quote_manual_item_movements_event_item
ON quote_manual_item_movements(event_id, quote_item_id, space_id, created_at);
