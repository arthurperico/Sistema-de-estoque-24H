CREATE TABLE IF NOT EXISTS event_spaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_saida_hidden_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    item_type TEXT NOT NULL CHECK(item_type IN ('equipment', 'cable', 'other')),
    item_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE equipment_events ADD COLUMN space_id INTEGER;
ALTER TABLE cable_event_movements ADD COLUMN space_id INTEGER;
ALTER TABLE other_item_event_movements ADD COLUMN space_id INTEGER;
ALTER TABLE event_saida_hidden_items ADD COLUMN space_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_event_spaces_event ON event_spaces(event_id);
CREATE INDEX IF NOT EXISTS idx_equipment_events_event_space_equipment ON equipment_events(event_id, space_id, equipment_id);
CREATE INDEX IF NOT EXISTS idx_cable_event_movements_event_space_cable ON cable_event_movements(event_id, space_id, cable_id);
CREATE INDEX IF NOT EXISTS idx_other_item_event_movements_event_space_item ON other_item_event_movements(event_id, space_id, item_id);
CREATE INDEX IF NOT EXISTS idx_event_saida_hidden_items_event_item_space ON event_saida_hidden_items(event_id, item_type, item_id, space_id);
