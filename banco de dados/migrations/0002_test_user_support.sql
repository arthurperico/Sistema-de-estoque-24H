CREATE TABLE IF NOT EXISTS test_snapshot_equipments (
    snapshot_id TEXT NOT NULL,
    id INTEGER NOT NULL,
    name TEXT NOT NULL,
    barcode TEXT NOT NULL,
    current_status TEXT NOT NULL,
    category TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, id)
);

CREATE TABLE IF NOT EXISTS test_snapshot_events (
    snapshot_id TEXT NOT NULL,
    id INTEGER NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, id)
);

CREATE TABLE IF NOT EXISTS test_snapshot_equipment_events (
    snapshot_id TEXT NOT NULL,
    id INTEGER NOT NULL,
    equipment_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, id)
);

CREATE TABLE IF NOT EXISTS test_snapshot_maintenances (
    snapshot_id TEXT NOT NULL,
    id INTEGER NOT NULL,
    equipment_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, id)
);

CREATE TABLE IF NOT EXISTS test_snapshot_cables (
    snapshot_id TEXT NOT NULL,
    id INTEGER NOT NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, id)
);

CREATE INDEX IF NOT EXISTS idx_test_snapshot_equipments_snapshot ON test_snapshot_equipments(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_test_snapshot_events_snapshot ON test_snapshot_events(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_test_snapshot_equipment_events_snapshot ON test_snapshot_equipment_events(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_test_snapshot_maintenances_snapshot ON test_snapshot_maintenances(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_test_snapshot_cables_snapshot ON test_snapshot_cables(snapshot_id);
