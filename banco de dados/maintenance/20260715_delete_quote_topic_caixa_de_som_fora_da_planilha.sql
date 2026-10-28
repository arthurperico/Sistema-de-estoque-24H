-- Exclui definitivamente o topico temporario criado para equipamentos
-- que nao constavam na planilha de CAIXA DE SOM.
-- Backups do D1 e do SQLite devem existir antes da execucao.

DELETE FROM event_saida_hidden_items
WHERE item_type = 'equipment'
  AND item_id IN (
      SELECT id
      FROM equipments
      WHERE category = 'CAIXA DE SOM - FORA DA PLANILHA'
  );

DELETE FROM quote_hidden_equipments
WHERE equipment_id IN (
    SELECT id
    FROM equipments
    WHERE category = 'CAIXA DE SOM - FORA DA PLANILHA'
);

DELETE FROM event_reserved_equipments
WHERE equipment_id IN (
    SELECT id
    FROM equipments
    WHERE category = 'CAIXA DE SOM - FORA DA PLANILHA'
);

DELETE FROM maintenances
WHERE equipment_id IN (
    SELECT id
    FROM equipments
    WHERE category = 'CAIXA DE SOM - FORA DA PLANILHA'
);

UPDATE quote_items
SET equipment_id = NULL
WHERE equipment_id IN (
    SELECT id
    FROM equipments
    WHERE category = 'CAIXA DE SOM - FORA DA PLANILHA'
);

DELETE FROM equipment_events
WHERE equipment_id IN (
    SELECT id
    FROM equipments
    WHERE category = 'CAIXA DE SOM - FORA DA PLANILHA'
);

DELETE FROM equipments
WHERE category = 'CAIXA DE SOM - FORA DA PLANILHA';

DELETE FROM equipment_categories
WHERE name = 'CAIXA DE SOM - FORA DA PLANILHA';
