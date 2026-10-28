CREATE INDEX IF NOT EXISTS idx_equipment_events_equipment_event_action_datetime_id
ON equipment_events(equipment_id, event_id, action_type, datetime(created_at), id);

CREATE INDEX IF NOT EXISTS idx_equipment_events_equipment_action_datetime_id_event
ON equipment_events(equipment_id, action_type, datetime(created_at) DESC, id DESC, event_id);

CREATE INDEX IF NOT EXISTS idx_equipment_events_equipment_event_space_datetime_id
ON equipment_events(equipment_id, event_id, COALESCE(space_id, 0), datetime(created_at) DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_maintenances_equipment_resolved_datetime_id
ON maintenances(equipment_id, resolved_at, datetime(created_at) DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_cable_maintenances_cable_resolved_datetime_id
ON cable_maintenances(cable_id, resolved_at, datetime(created_at) DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_cable_event_movements_event_cable_space
ON cable_event_movements(event_id, cable_id, COALESCE(space_id, 0));

CREATE INDEX IF NOT EXISTS idx_other_item_movements_event_item_space
ON other_item_event_movements(event_id, item_id, COALESCE(space_id, 0));

CREATE INDEX IF NOT EXISTS idx_equipments_category_name
ON equipments(category, name);

CREATE INDEX IF NOT EXISTS idx_equipments_name
ON equipments(name);

CREATE INDEX IF NOT EXISTS idx_cables_category_name
ON cables(category, name);

CREATE INDEX IF NOT EXISTS idx_other_items_category_name
ON other_items(category, name);

DROP INDEX IF EXISTS idx_equipment_events_equipment_event;
DROP INDEX IF EXISTS idx_maintenances_equipment_resolved;
DROP INDEX IF EXISTS idx_cable_maintenances_cable_resolved;
DROP INDEX IF EXISTS idx_cable_event_movements_event_cable;
DROP INDEX IF EXISTS idx_cable_event_movements_event_space_cable;
DROP INDEX IF EXISTS idx_other_item_event_movements_event_item;
DROP INDEX IF EXISTS idx_other_item_event_movements_event_space_item;
