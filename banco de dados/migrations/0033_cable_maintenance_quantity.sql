ALTER TABLE cable_maintenances
ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;

UPDATE cable_maintenances
SET quantity = 1
WHERE quantity IS NULL OR quantity <= 0;

ALTER TABLE test_snapshot_cable_maintenances
ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;

UPDATE test_snapshot_cable_maintenances
SET quantity = 1
WHERE quantity IS NULL OR quantity <= 0;
