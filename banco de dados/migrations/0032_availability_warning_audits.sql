-- Auditoria aditiva para saídas confirmadas apesar de alerta de disponibilidade futura.
-- Não altera nem remove registros existentes.
CREATE TABLE IF NOT EXISTS availability_warning_audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    space_id INTEGER,
    movement_request_id TEXT,
    confirmed_by_username TEXT,
    warning_code TEXT NOT NULL DEFAULT 'FUTURE_AVAILABILITY_WARNING',
    warning_details TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_availability_warning_audits_event_created
ON availability_warning_audits(event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_availability_warning_audits_equipment_created
ON availability_warning_audits(equipment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS test_snapshot_availability_warning_audits (
    snapshot_id TEXT NOT NULL,
    id INTEGER NOT NULL,
    equipment_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    space_id INTEGER,
    movement_request_id TEXT,
    confirmed_by_username TEXT,
    warning_code TEXT NOT NULL,
    warning_details TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, id)
);

CREATE INDEX IF NOT EXISTS idx_test_snapshot_availability_warning_audits_snapshot
ON test_snapshot_availability_warning_audits(snapshot_id);
