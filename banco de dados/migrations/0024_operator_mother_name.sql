ALTER TABLE operators
ADD COLUMN mother_name TEXT NOT NULL DEFAULT '';

ALTER TABLE test_snapshot_operators
ADD COLUMN mother_name TEXT NOT NULL DEFAULT '';
