ALTER TABLE events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'event';
ALTER TABLE events ADD COLUMN withdrawal_date TEXT;
ALTER TABLE events ADD COLUMN return_date TEXT;

CREATE INDEX IF NOT EXISTS idx_events_event_type_date
ON events(event_type, date);

ALTER TABLE test_snapshot_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'event';
ALTER TABLE test_snapshot_events ADD COLUMN withdrawal_date TEXT;
ALTER TABLE test_snapshot_events ADD COLUMN return_date TEXT;
