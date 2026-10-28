ALTER TABLE equipments ADD COLUMN serial_number TEXT;
ALTER TABLE equipments ADD COLUMN observation TEXT;

CREATE TABLE IF NOT EXISTS equipment_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_categories_name
ON equipment_categories(name);
