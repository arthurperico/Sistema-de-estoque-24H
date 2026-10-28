CREATE TABLE IF NOT EXISTS operators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    cpf TEXT NOT NULL UNIQUE,
    birth_date TEXT NOT NULL,
    address TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    area TEXT NOT NULL DEFAULT '',
    has_vehicle INTEGER NOT NULL DEFAULT 0,
    pix TEXT,
    agency TEXT,
    photo TEXT NOT NULL,
    cache_value REAL NOT NULL DEFAULT 0,
    created_by_username TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operators_name ON operators(full_name);
CREATE INDEX IF NOT EXISTS idx_operators_cpf ON operators(cpf);

CREATE TABLE IF NOT EXISTS test_snapshot_operators (
    snapshot_id TEXT NOT NULL,
    id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    cpf TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    address TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    area TEXT NOT NULL DEFAULT '',
    has_vehicle INTEGER NOT NULL DEFAULT 0,
    pix TEXT,
    agency TEXT,
    photo TEXT NOT NULL,
    cache_value REAL NOT NULL DEFAULT 0,
    created_by_username TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_test_snapshot_operators_snapshot
ON test_snapshot_operators(snapshot_id);
