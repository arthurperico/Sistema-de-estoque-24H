-- Mantém o patrimônio físico como fonte operacional e guarda somente os
-- rótulos da visualização comercial nestes campos opcionais.
ALTER TABLE equipments ADD COLUMN quote_name TEXT;
ALTER TABLE equipments ADD COLUMN quote_category TEXT;

CREATE INDEX IF NOT EXISTS idx_equipments_quote_name
ON equipments(quote_name);

CREATE INDEX IF NOT EXISTS idx_equipments_quote_category
ON equipments(quote_category);
