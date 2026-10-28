CREATE TABLE IF NOT EXISTS cable_event_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cable_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('saida', 'entrada')),
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cable_event_movements_event_cable
ON cable_event_movements(event_id, cable_id, created_at);

CREATE TABLE IF NOT EXISTS test_snapshot_cable_event_movements (
    snapshot_id TEXT NOT NULL,
    id INTEGER NOT NULL,
    cable_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, id)
);

CREATE INDEX IF NOT EXISTS idx_test_snapshot_cable_event_movements_snapshot
ON test_snapshot_cable_event_movements(snapshot_id);
