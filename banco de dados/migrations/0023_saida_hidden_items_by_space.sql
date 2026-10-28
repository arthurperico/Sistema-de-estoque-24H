DROP INDEX IF EXISTS idx_event_saida_hidden_items_event_item_space;
DROP INDEX IF EXISTS idx_event_saida_hidden_items_event_item;

CREATE TABLE event_saida_hidden_items_by_space (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    item_type TEXT NOT NULL CHECK(item_type IN ('equipment', 'cable', 'other')),
    item_id INTEGER NOT NULL,
    space_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO event_saida_hidden_items_by_space (
    id,
    event_id,
    item_type,
    item_id,
    space_id,
    created_at
)
SELECT
    id,
    event_id,
    item_type,
    item_id,
    space_id,
    created_at
FROM event_saida_hidden_items;

DROP TABLE event_saida_hidden_items;
ALTER TABLE event_saida_hidden_items_by_space RENAME TO event_saida_hidden_items;

CREATE INDEX idx_event_saida_hidden_items_event_item_space
ON event_saida_hidden_items(event_id, item_type, item_id, space_id);

CREATE UNIQUE INDEX idx_event_saida_hidden_items_unique_space
ON event_saida_hidden_items(event_id, item_type, item_id, COALESCE(space_id, 0));
