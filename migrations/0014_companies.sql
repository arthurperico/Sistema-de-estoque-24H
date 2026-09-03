-- Companies table (all fields in English)
CREATE TABLE IF NOT EXISTS companies (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    cnpj                   TEXT NOT NULL UNIQUE,
    name                   TEXT NOT NULL,
    legal_name             TEXT,
    trade_name             TEXT,
    state_registration     TEXT,
    municipal_registration TEXT,
    phone                  TEXT,
    phone2                 TEXT,
    email                  TEXT,
    website                TEXT,
    zip_code               TEXT,
    address                TEXT,
    address_number         TEXT,
    address_complement     TEXT,
    neighborhood           TEXT,
    city                   TEXT,
    state                  TEXT,
    country                TEXT NOT NULL DEFAULT 'Brasil',
    legal_representative   TEXT,
    accounting_email       TEXT,
    system_admin_email     TEXT,
    company_admin_email    TEXT,
    is_owner               INTEGER NOT NULL DEFAULT 0,
    plan                   TEXT NOT NULL DEFAULT 'pro',
    created_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add company_id to users
ALTER TABLE users ADD COLUMN company_id INTEGER REFERENCES companies(id);
