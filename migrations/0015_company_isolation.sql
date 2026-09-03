-- Add company_id to all main data tables for multi-tenant isolation
-- Existing data will have company_id = NULL (visible only to gestor_admin)

ALTER TABLE equipments ADD COLUMN company_id INTEGER REFERENCES companies(id);
ALTER TABLE cables ADD COLUMN company_id INTEGER REFERENCES companies(id);
ALTER TABLE other_items ADD COLUMN company_id INTEGER REFERENCES companies(id);
ALTER TABLE events ADD COLUMN company_id INTEGER REFERENCES companies(id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_equipments_company ON equipments(company_id);
CREATE INDEX IF NOT EXISTS idx_cables_company ON cables(company_id);
CREATE INDEX IF NOT EXISTS idx_other_items_company ON other_items(company_id);
CREATE INDEX IF NOT EXISTS idx_events_company ON events(company_id);
