ALTER TABLE events ADD COLUMN created_by_username TEXT;

ALTER TABLE test_snapshot_events ADD COLUMN created_by_username TEXT;
