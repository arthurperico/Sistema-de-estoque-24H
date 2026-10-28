-- Restaura somente os preços unitários alterados por agrupamentos de nome.
-- Origem: backup remoto de 2026-08-17T16-46-28-881Z.
-- Segurança: a atualização inteira só ocorre se os 28 patrimônios ainda estiverem
-- com o mesmo ID, código e preço incorreto observados no backup de 2026-08-19.
WITH expected(id, barcode, current_price, restored_price) AS (
    VALUES
        (111,  '0159', 1,    0),
        (112,  '0160', 1,    0),
        (223,  '0485', 600,  300),
        (224,  '0483', 600,  300),
        (225,  '0481', 600,  300),
        (226,  '0484', 600,  300),
        (228,  '0482', 600,  300),
        (229,  '0487', 600,  300),
        (230,  '0489', 600,  500),
        (231,  '0488', 600,  400),
        (232,  '0490', 600,  300),
        (261,  '0562', 200,  100),
        (264,  '0560', 200,  100),
        (976,  '0166', 1,    0),
        (979,  '0167', 1,    0),
        (980,  '1178', 1,    0),
        (981,  '1177', 1,    0),
        (1022, '0176', 350,  1400),
        (1023, '0177', 350,  1400),
        (1024, '0178', 350,  1400),
        (1025, '0179', 350,  1400),
        (1026, '0119', 350,  2100),
        (1027, '0120', 350,  2100),
        (1028, '0121', 350,  2100),
        (1029, '0122', 350,  2100),
        (1030, '0185', 350,  1400),
        (1031, '0186', 350,  1400),
        (1098, '0651', 200,  1)
)
UPDATE equipments
SET unit_price = (
    SELECT expected.restored_price
    FROM expected
    WHERE expected.id = equipments.id
)
WHERE EXISTS (
    SELECT 1
    FROM expected
    WHERE expected.id = equipments.id
      AND expected.barcode = equipments.barcode
      AND expected.current_price = equipments.unit_price
)
AND (
    SELECT COUNT(*)
    FROM equipments AS current_equipment
    INNER JOIN expected
        ON expected.id = current_equipment.id
       AND expected.barcode = current_equipment.barcode
       AND expected.current_price = current_equipment.unit_price
) = (SELECT COUNT(*) FROM expected);
