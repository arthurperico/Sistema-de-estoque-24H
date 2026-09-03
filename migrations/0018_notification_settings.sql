CREATE TABLE IF NOT EXISTS notification_settings (
    company_id            INTEGER PRIMARY KEY,
    settings_json         TEXT NOT NULL,
    updated_by_username   TEXT,
    updated_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_dismissals (
    company_id             INTEGER NOT NULL,
    notification_id        TEXT NOT NULL,
    dismissed_by_username  TEXT,
    dismissed_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, notification_id)
);
