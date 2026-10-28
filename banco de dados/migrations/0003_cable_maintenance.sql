CREATE TABLE IF NOT EXISTS cable_maintenances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cable_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cable_maintenances_cable_resolved
ON cable_maintenances(cable_id, resolved_at, created_at);

CREATE TABLE IF NOT EXISTS test_snapshot_cable_maintenances (
    snapshot_id TEXT NOT NULL,
    id INTEGER NOT NULL,
    cable_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, id)
);

CREATE INDEX IF NOT EXISTS idx_test_snapshot_cable_maintenances_snapshot
ON test_snapshot_cable_maintenances(snapshot_id);
