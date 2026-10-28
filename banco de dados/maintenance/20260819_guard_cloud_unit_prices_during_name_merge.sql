-- Proteção temporária para o Worker publicado em 2026-08-17.
-- Ao mudar o nome, memoriza por cinco minutos o preço de cada patrimônio que
-- passou a integrar o grupo. A propagação automática de preço executada logo
-- depois pelo Worker é ignorada uma única vez para cada unidade.
CREATE TABLE IF NOT EXISTS equipment_name_price_guards (
    equipment_id INTEGER PRIMARY KEY,
    original_unit_price REAL NOT NULL,
    expected_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS equipments_remember_prices_before_name_merge
AFTER UPDATE OF name ON equipments
WHEN OLD.name IS NOT NEW.name
BEGIN
    DELETE FROM equipment_name_price_guards
    WHERE created_at < datetime('now', '-5 minutes');

    INSERT OR REPLACE INTO equipment_name_price_guards (
        equipment_id,
        original_unit_price,
        expected_name,
        created_at
    )
    SELECT
        id,
        unit_price,
        name,
        CURRENT_TIMESTAMP
    FROM equipments
    WHERE lower(trim(name)) = lower(trim(NEW.name));
END;

CREATE TRIGGER IF NOT EXISTS equipments_keep_unit_price_after_name_merge
BEFORE UPDATE OF unit_price ON equipments
WHEN EXISTS (
    SELECT 1
    FROM equipment_name_price_guards
    WHERE equipment_id = OLD.id
      AND lower(trim(expected_name)) = lower(trim(OLD.name))
      AND created_at >= datetime('now', '-5 minutes')
)
BEGIN
    DELETE FROM equipment_name_price_guards
    WHERE equipment_id = OLD.id;

    SELECT RAISE(IGNORE);
END;
