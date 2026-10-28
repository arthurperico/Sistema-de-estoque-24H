-- Guarda a escolha feita pelo comercial quando o orçamento é aprovado.
-- A tabela separada permite aplicar esta migration com segurança mesmo quando
-- migrations anteriores ainda não foram publicadas no D1 remoto.
CREATE TABLE IF NOT EXISTS quote_operational_destinations (
    quote_id INTEGER PRIMARY KEY,
    destination_type TEXT NOT NULL CHECK(destination_type IN ('event', 'rental')),
    selected_by_username TEXT,
    selected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quote_operational_destinations_type
ON quote_operational_destinations(destination_type, quote_id);
