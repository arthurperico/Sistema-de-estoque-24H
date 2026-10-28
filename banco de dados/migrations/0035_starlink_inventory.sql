CREATE TABLE IF NOT EXISTS local_starlink_inventory (
    equipment_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    model TEXT NOT NULL CHECK(model IN ('v2', 'mini', 'other')),
    stock_number TEXT NOT NULL,
    is_on INTEGER NOT NULL DEFAULT 0 CHECK(is_on IN (0, 1)),
    source_checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    selected_plan TEXT NOT NULL DEFAULT 'Modo espera',
    activated_at TEXT
);

INSERT INTO local_starlink_inventory (
    equipment_id,
    name,
    model,
    stock_number,
    is_on,
    source_checked_at,
    selected_plan,
    activated_at
)
SELECT
    id,
    name,
    CASE
        WHEN UPPER(name) LIKE 'STARLINK V2%' THEN 'v2'
        WHEN UPPER(name) LIKE 'STARLINK MINI%' THEN 'mini'
        ELSE 'other'
    END,
    printf(
        '%02d',
        CAST(TRIM(SUBSTR(observation, INSTR(UPPER(observation), 'NUMERO:') + 7, 3)) AS INTEGER)
    ),
    0,
    CURRENT_TIMESTAMP,
    'Modo espera',
    NULL
FROM equipments
WHERE UPPER(TRIM(name)) LIKE 'STARLINK %'
  AND INSTR(UPPER(COALESCE(observation, '')), 'NUMERO:') > 0
ON CONFLICT(equipment_id) DO UPDATE SET
    name = excluded.name,
    model = excluded.model,
    stock_number = excluded.stock_number,
    source_checked_at = excluded.source_checked_at;
