ALTER TABLE cables ADD COLUMN available_quantity INTEGER NOT NULL DEFAULT 0;

UPDATE cables
SET available_quantity = quantity
WHERE available_quantity IS NULL OR available_quantity = 0;

ALTER TABLE test_snapshot_cables ADD COLUMN available_quantity INTEGER NOT NULL DEFAULT 0;

UPDATE test_snapshot_cables
SET available_quantity = quantity
WHERE available_quantity IS NULL OR available_quantity = 0;
