-- Orçamentos passam a proteger quantidades por nome, sem pré-vincular patrimônios.
-- Vínculos que já correspondem a uma saída real são preservados como alocações
-- do evento; os demais vínculos antecipados são liberados.
UPDATE event_reserved_equipments
SET quote_item_id = NULL
WHERE quote_item_id IS NOT NULL
  AND EXISTS (
      SELECT 1
      FROM equipment_events
      WHERE equipment_events.event_id = event_reserved_equipments.event_id
        AND equipment_events.equipment_id = event_reserved_equipments.equipment_id
        AND equipment_events.action_type = 'saida'
  );

DELETE FROM event_reserved_equipments
WHERE quote_item_id IS NOT NULL;
