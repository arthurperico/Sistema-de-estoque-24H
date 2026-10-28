ALTER TABLE events ADD COLUMN end_date TEXT;
ALTER TABLE events ADD COLUMN orcamento_id INTEGER;
ALTER TABLE events ADD COLUMN auto_created_at TEXT;

CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_city TEXT NOT NULL DEFAULT 'Belo Horizonte',
    proposal_date TEXT NOT NULL,
    client_name TEXT NOT NULL,
    event_name TEXT NOT NULL,
    event_location TEXT NOT NULL,
    event_datetime TEXT NOT NULL,
    assembly_datetime TEXT NOT NULL,
    disassembly_datetime TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    payment_deadline TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    final_total REAL NOT NULL DEFAULT 0,
    show_item_prices INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approved_at TEXT,
    created_by_username TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quote_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL,
    equipment_id INTEGER,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    daily_units INTEGER NOT NULL DEFAULT 1,
    internal_unit_price REAL NOT NULL DEFAULT 0,
    internal_total REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS event_reserved_equipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    equipment_id INTEGER NOT NULL,
    quote_item_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, equipment_id)
);

CREATE TABLE IF NOT EXISTS quote_hidden_equipments (
    equipment_id INTEGER PRIMARY KEY,
    hidden_by_username TEXT,
    hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quotes_created_at
ON quotes(created_at);

CREATE INDEX IF NOT EXISTS idx_quotes_status
ON quotes(status, approved_at, created_at);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote
ON quote_items(quote_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_quote_items_equipment
ON quote_items(equipment_id, quote_id);

CREATE INDEX IF NOT EXISTS idx_event_reserved_equipments_event
ON event_reserved_equipments(event_id, equipment_id);

CREATE INDEX IF NOT EXISTS idx_event_reserved_equipments_equipment
ON event_reserved_equipments(equipment_id, event_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_orcamento
ON events(orcamento_id)
WHERE orcamento_id IS NOT NULL;
