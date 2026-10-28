-- Substituicao integral e pontual do inventario de cabos.
-- Fonte: CABOS 24HLOCACOES atualizado - Google Planilhas.pdf (09/09/2026).
-- A coluna quantity representa a quantidade inicial. available_quantity representa
-- a quantidade atual. As 18 unidades listadas em manutencao entram na quantidade
-- inicial e ficam indisponiveis na quantidade atual.
--
-- Escopo intencional: somente cabos e seus vinculos de saida/manutencao. Eventos,
-- equipamentos, outros itens e seus respectivos movimentos nao sao alterados.

-- As saidas de cabos anteriores a esta troca nao devem influenciar o novo saldo.
DELETE FROM event_saida_hidden_items WHERE item_type = 'cable';
DELETE FROM cable_event_movements;
DELETE FROM cable_maintenances;
DELETE FROM cables;

-- quantity = quantidade inicial; available_quantity = quantidade atual.
INSERT INTO cables (name, quantity, available_quantity, category, unit_price, updated_at) VALUES
    ('EXTENSAO PEQUENA Y', 16, 16, 'EXTENSAO', 1, CURRENT_TIMESTAMP),
    ('EXTENSAO PEQUENA', 26, 26, 'EXTENSAO', 1, CURRENT_TIMESTAMP),
    ('EXTENSAO 5M', 34, 32, 'EXTENSAO', 1, CURRENT_TIMESTAMP),
    ('EXTENSAO 10M', 34, 33, 'EXTENSAO', 1, CURRENT_TIMESTAMP),
    ('EXTENSAO 15M', 2, 2, 'EXTENSAO', 1, CURRENT_TIMESTAMP),
    ('EXTENSAO 20M', 20, 20, 'EXTENSAO', 1, CURRENT_TIMESTAMP),
    ('EXTENSAO 30M', 1, 1, 'EXTENSAO', 1, CURRENT_TIMESTAMP),
    ('EXTENSAO COM REGUA 5M', 11, 11, 'EXTENSAO COM REGUA', 1, CURRENT_TIMESTAMP),
    ('EXTENSAO COM REGUA 10M', 12, 12, 'EXTENSAO COM REGUA', 1, CURRENT_TIMESTAMP),
    ('EXTENSAO COM REGUA 20M', 7, 7, 'EXTENSAO COM REGUA', 1, CURRENT_TIMESTAMP),
    ('CABO DE 2 VIAS', 2, 2, 'CABO DE VIA', 1, CURRENT_TIMESTAMP),
    ('CABO DE 3 VIAS', 2, 2, 'CABO DE VIA', 1, CURRENT_TIMESTAMP),
    ('CABO DE 4 VIAS', 3, 3, 'CABO DE VIA', 1, CURRENT_TIMESTAMP),
    ('CABO DE 6 VIAS', 1, 1, 'CABO DE VIA', 1, CURRENT_TIMESTAMP),
    ('XLR PEQUENO', 51, 49, 'XLR', 1, CURRENT_TIMESTAMP),
    ('XLR 5M', 34, 34, 'XLR', 1, CURRENT_TIMESTAMP),
    ('XLR 10M', 49, 48, 'XLR', 1, CURRENT_TIMESTAMP),
    ('XLR 15M', 1, 1, 'XLR', 1, CURRENT_TIMESTAMP),
    ('XLR 20M', 34, 34, 'XLR', 1, CURRENT_TIMESTAMP),
    ('XLR 25M', 5, 5, 'XLR', 1, CURRENT_TIMESTAMP),
    ('XLR 30M', 10, 10, 'XLR', 1, CURRENT_TIMESTAMP),
    ('XLR 40M', 1, 1, 'XLR', 1, CURRENT_TIMESTAMP),
    ('P10 XLR FEMEA PEQUENO', 12, 11, 'XLR', 1, CURRENT_TIMESTAMP),
    ('P10 XLR MACHO PEQUENO', 19, 18, 'XLR', 1, CURRENT_TIMESTAMP),
    ('P10 XLR MACHO 15M', 1, 1, 'XLR', 1, CURRENT_TIMESTAMP),
    ('P2 P10 PEQUENO', 7, 7, 'P10', 1, CURRENT_TIMESTAMP),
    ('P10', 18, 18, 'P10', 1, CURRENT_TIMESTAMP),
    ('P10 5M', 12, 12, 'P10', 1, CURRENT_TIMESTAMP),
    ('P2 P10 Y', 2, 2, 'P10', 1, CURRENT_TIMESTAMP),
    ('P10 Y XLR MACHO', 1, 1, 'P10', 1, CURRENT_TIMESTAMP),
    ('P2 RCA Y', 2, 2, 'P10', 1, CURRENT_TIMESTAMP),
    ('P10 Y RCA Y', 5, 5, 'P10', 1, CURRENT_TIMESTAMP),
    ('RCA P10', 2, 2, 'P10', 1, CURRENT_TIMESTAMP),
    ('RCA Y RCA Y', 1, 1, 'P10', 1, CURRENT_TIMESTAMP),
    ('P2 XLR FEMEA Y', 2, 2, 'P10', 1, CURRENT_TIMESTAMP),
    ('XLR FEMEA Y FEMEA', 2, 2, 'P10', 1, CURRENT_TIMESTAMP),
    ('XLR MACHO Y FEMEA', 2, 2, 'P10', 1, CURRENT_TIMESTAMP),
    ('XLR FEMEA Y MACHO', 5, 5, 'P10', 1, CURRENT_TIMESTAMP),
    ('P10 Y MACHO', 5, 5, 'P10', 1, CURRENT_TIMESTAMP),
    ('XLR FEMEA RCA Y', 1, 1, 'P10', 1, CURRENT_TIMESTAMP),
    ('SDI PEQUENO', 25, 25, 'SDI', 1, CURRENT_TIMESTAMP),
    ('SDI 5M', 1, 1, 'SDI', 1, CURRENT_TIMESTAMP),
    ('SDI 10M', 8, 8, 'SDI', 1, CURRENT_TIMESTAMP),
    ('SDI 20M', 2, 2, 'SDI', 1, CURRENT_TIMESTAMP),
    ('SDI 30M', 2, 2, 'SDI', 1, CURRENT_TIMESTAMP),
    ('SDI 50M', 10, 10, 'SDI', 1, CURRENT_TIMESTAMP),
    ('SDI 55M', 2, 2, 'SDI', 1, CURRENT_TIMESTAMP),
    ('SDI 90M', 2, 2, 'SDI', 1, CURRENT_TIMESTAMP),
    ('SDI 100M', 1, 1, 'SDI', 1, CURRENT_TIMESTAMP),
    ('REDE PEQUENO', 77, 77, 'REDE', 1, CURRENT_TIMESTAMP),
    ('CAT 8 PEQUENO', 3, 3, 'REDE', 1, CURRENT_TIMESTAMP),
    ('CAT 7 PEQUENO', 1, 1, 'REDE', 1, CURRENT_TIMESTAMP),
    ('CAT 7 5M', 2, 1, 'REDE', 1, CURRENT_TIMESTAMP),
    ('REDE 5M', 6, 5, 'REDE', 1, CURRENT_TIMESTAMP),
    ('REDE 10M', 14, 13, 'REDE', 1, CURRENT_TIMESTAMP),
    ('REDE 15M', 4, 4, 'REDE', 1, CURRENT_TIMESTAMP),
    ('REDE 20M', 8, 8, 'REDE', 1, CURRENT_TIMESTAMP),
    ('REDE 25M', 4, 4, 'REDE', 1, CURRENT_TIMESTAMP),
    ('REDE 30M', 6, 6, 'REDE', 1, CURRENT_TIMESTAMP),
    ('REDE 40M', 1, 1, 'REDE', 1, CURRENT_TIMESTAMP),
    ('REDE 50M', 8, 6, 'REDE', 1, CURRENT_TIMESTAMP),
    ('REDE 100M', 3, 3, 'REDE', 1, CURRENT_TIMESTAMP),
    ('HDMI PEQUENO', 60, 59, 'HDMI', 1, CURRENT_TIMESTAMP),
    ('HDMI 5M', 4, 4, 'HDMI', 1, CURRENT_TIMESTAMP),
    ('HDMI 10M', 13, 12, 'HDMI', 1, CURRENT_TIMESTAMP),
    ('HDMI 15M', 23, 22, 'HDMI', 1, CURRENT_TIMESTAMP),
    ('HDMI 20M', 6, 6, 'HDMI', 1, CURRENT_TIMESTAMP),
    ('HDMI FIBRA 20M', 3, 2, 'HDMI', 1, CURRENT_TIMESTAMP),
    ('HDMI FIBRA 30M', 5, 5, 'HDMI', 1, CURRENT_TIMESTAMP),
    ('HDMI FIBRA 40M', 1, 1, 'HDMI', 1, CURRENT_TIMESTAMP),
    ('HDMI FIBRA 50M', 8, 8, 'HDMI', 1, CURRENT_TIMESTAMP),
    ('POWERCOM 10M', 1, 1, 'POWERCOM', 1, CURRENT_TIMESTAMP),
    ('REGUA GRANDE', 8, 8, 'REGUA', 1, CURRENT_TIMESTAMP),
    ('REGUA PEQUENA', 4, 4, 'REGUA', 1, CURRENT_TIMESTAMP),
    ('REGUA POWERCOM', 8, 8, 'REGUA', 1, CURRENT_TIMESTAMP),
    ('REGUA PENTACUSTICA', 3, 3, 'REGUA', 1, CURRENT_TIMESTAMP),
    ('REGUA CLAMPER', 1, 1, 'REGUA', 1, CURRENT_TIMESTAMP),
    ('XLR LUZ PEQUENO', 12, 12, 'XLR LUZ', 1, CURRENT_TIMESTAMP),
    ('XLR LUZ 5M', 13, 12, 'XLR LUZ', 1, CURRENT_TIMESTAMP),
    ('XLR LUZ 10M', 1, 1, 'XLR LUZ', 1, CURRENT_TIMESTAMP),
    ('XLR LUZ 20M', 4, 4, 'XLR LUZ', 1, CURRENT_TIMESTAMP),
    ('XLR LUZ 50M', 2, 2, 'XLR LUZ', 1, CURRENT_TIMESTAMP),
    ('SPICOM PEQUENO', 1, 1, 'SPICON', 1, CURRENT_TIMESTAMP),
    ('SPICON 20M', 1, 1, 'SPICON', 1, CURRENT_TIMESTAMP),
    ('SPICON 15M', 2, 2, 'SPICON', 1, CURRENT_TIMESTAMP),
    ('FIBRA GRANDE', 4, 4, 'FIBRA OPTICA', 1, CURRENT_TIMESTAMP);

-- "REDE 1OM" da fonte corresponde a REDE 10M (a letra O e um erro visual).
-- Cada lancamento aberto aparece no setor de manutencao e ja esta descontado
-- da quantidade atual acima.
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 2, CURRENT_TIMESTAMP FROM cables WHERE name = 'REDE 50M';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 1, CURRENT_TIMESTAMP FROM cables WHERE name = 'HDMI FIBRA 20M';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 1, CURRENT_TIMESTAMP FROM cables WHERE name = 'REDE 10M';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 1, CURRENT_TIMESTAMP FROM cables WHERE name = 'REDE 5M';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 1, CURRENT_TIMESTAMP FROM cables WHERE name = 'HDMI 15M';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 1, CURRENT_TIMESTAMP FROM cables WHERE name = 'EXTENSAO 10M';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 1, CURRENT_TIMESTAMP FROM cables WHERE name = 'XLR 10M';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 1, CURRENT_TIMESTAMP FROM cables WHERE name = 'XLR LUZ 5M';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 2, CURRENT_TIMESTAMP FROM cables WHERE name = 'XLR PEQUENO';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 1, CURRENT_TIMESTAMP FROM cables WHERE name = 'HDMI 10M';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 1, CURRENT_TIMESTAMP FROM cables WHERE name = 'HDMI PEQUENO';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 1, CURRENT_TIMESTAMP FROM cables WHERE name = 'CAT 7 5M';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 2, CURRENT_TIMESTAMP FROM cables WHERE name = 'EXTENSAO 5M';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 1, CURRENT_TIMESTAMP FROM cables WHERE name = 'P10 XLR MACHO PEQUENO';
INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
SELECT id, 'IMPORTADO DA PLANILHA - EM MANUTENCAO', 1, CURRENT_TIMESTAMP FROM cables WHERE name = 'P10 XLR FEMEA PEQUENO';
