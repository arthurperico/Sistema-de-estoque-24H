-- Per-company appearance: theme colors, custom logo, and custom favicon.
-- Each company's admin can set their own branding, stored here and applied
-- to all users of that company when they log in.
CREATE TABLE IF NOT EXISTS company_appearance (
    company_id   INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    theme_json   TEXT,
    logo_data    TEXT,
    favicon_data TEXT,
    updated_by   TEXT,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
