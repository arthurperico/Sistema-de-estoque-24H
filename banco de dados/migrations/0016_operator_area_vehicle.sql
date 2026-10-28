-- As colunas passaram a fazer parte da criação da tabela na migração 0015.
-- Esta migração permanece como etapa de normalização para bancos existentes
-- que já foram reconciliados pelo Worker antes de adotar a cadeia completa.
UPDATE operators SET area = '' WHERE area IS NULL;
UPDATE operators SET has_vehicle = 0 WHERE has_vehicle IS NULL;
UPDATE test_snapshot_operators SET area = '' WHERE area IS NULL;
UPDATE test_snapshot_operators SET has_vehicle = 0 WHERE has_vehicle IS NULL;
