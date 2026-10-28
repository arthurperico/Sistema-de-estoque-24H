ALTER TABLE cables ADD COLUMN category TEXT NOT NULL DEFAULT 'Outros';

UPDATE cables
SET category = 'Outros'
WHERE category IS NULL OR TRIM(category) = '';

ALTER TABLE test_snapshot_cables ADD COLUMN category TEXT NOT NULL DEFAULT 'Outros';

UPDATE test_snapshot_cables
SET category = 'Outros'
WHERE category IS NULL OR TRIM(category) = '';
