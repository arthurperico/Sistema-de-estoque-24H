CREATE TABLE IF NOT EXISTS other_item_event_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('saida', 'entrada')),
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_other_item_event_movements_event_item
ON other_item_event_movements(event_id, item_id, created_at);
