-- Cada movimentação recebe uma chave estável enviada pelo navegador.
-- Se a resposta se perder depois do commit, a mesma operação pode ser repetida
-- sem lançar uma segunda saída/entrada nem alterar o saldo duas vezes.

ALTER TABLE equipment_events ADD COLUMN request_id TEXT;
ALTER TABLE cable_event_movements ADD COLUMN request_id TEXT;
ALTER TABLE other_item_event_movements ADD COLUMN request_id TEXT;
ALTER TABLE quote_manual_item_movements ADD COLUMN request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_events_request_id
ON equipment_events(request_id)
WHERE request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cable_event_movements_request_id
ON cable_event_movements(request_id)
WHERE request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_other_item_event_movements_request_id
ON other_item_event_movements(request_id)
WHERE request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_manual_item_movements_request_id
ON quote_manual_item_movements(request_id)
WHERE request_id IS NOT NULL;
