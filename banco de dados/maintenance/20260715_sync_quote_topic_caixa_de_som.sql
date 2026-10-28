-- Sincroniza o tópico CAIXA DE SOM com C:\Users\Arthur S\Desktop\planilha 1.pdf.
-- Colunas do PDF: nome, patrimônio, número de série.
-- O conteúdo entre parênteses foi removido do nome e salvo em observation.
-- Status, preço, ID e vínculos dos patrimônios existentes são preservados.

INSERT INTO equipments (
    name,
    barcode,
    current_status,
    category,
    unit_price,
    serial_number,
    observation
)
VALUES
    ('CAIXA DE SOM STANER TWS-410', '0787', 'Disponivel', 'CAIXA DE SOM', 400, '001091', '01 AC 3 PINOS'),
    ('ALTA CAIXA DE SOM STANER TWS-410', '0783', 'Disponivel', 'CAIXA DE SOM', 1, '001091', NULL),
    ('CAIXA DE SOM STANER TWS-410', '0782', 'Disponivel', 'CAIXA DE SOM', 400, '001043', '01 AC 3 PINOS'),
    ('ALTA CAIXA DE SOM STANER TWS-410', '0778', 'Disponivel', 'CAIXA DE SOM', 1, '001043', NULL),
    ('CAIXA DE SOM STANER TWS-410', '0792', 'Disponivel', 'CAIXA DE SOM', 400, '001037', '01 AC 3 PINOS'),
    ('ALTA CAIXA DE SOM STANER TWS-410', '0788', 'Disponivel', 'CAIXA DE SOM', 1, '001037', NULL),
    ('CAIXA DE SOM STANER TWS-410', '0767', 'Disponivel', 'CAIXA DE SOM', 400, '001073', '01 AC 3 PINOS'),
    ('ALTA CAIXA DE SOM STANER TWS-410', '0763', 'Disponivel', 'CAIXA DE SOM', 1, '001073', NULL),
    ('CAIXA DE SOM STANER TWS-410', '0757', 'Disponivel', 'CAIXA DE SOM', 400, '001039', '01 AC 3 PINOS'),
    ('ALTA CAIXA DE SOM STANER TWS-410', '0753', 'Disponivel', 'CAIXA DE SOM', 1, '001039', NULL),
    ('CAIXA DE SOM STANER TWS-410', '0762', 'Disponivel', 'CAIXA DE SOM', 400, '001035', '01 AC 3 PINOS'),
    ('ALTA CAIXA DE SOM STANER TWS-410', '0758', 'Disponivel', 'CAIXA DE SOM', 1, '001035', NULL),
    ('CAIXA DE SOM STANER TWS-410', '0777', 'Disponivel', 'CAIXA DE SOM', 400, '001048', '01 AC 3 PINOS'),
    ('ALTA CAIXA DE SOM STANER TWS-410', '0768', 'Disponivel', 'CAIXA DE SOM', 1, '001048', NULL),
    ('CAIXA DE SOM STANER TWS-410', '0772', 'Disponivel', 'CAIXA DE SOM', 400, '001083', '01 AC 3 PINOS'),
    ('ALTA CAIXA DE SOM STANER TWS-410', '0774', 'Disponivel', 'CAIXA DE SOM', 1, '001083', NULL),
    ('CAIXA DE SOM STANER TWS-410', '0051', 'Disponivel', 'CAIXA DE SOM', 400, 'NAO ENCONTRADO', '01 AC 3 PINOS'),
    ('CAIXA DE SOM STD HPA08L', '0044', 'Disponivel', 'CAIXA DE SOM', 300, 'NAO ENCONTRADO', NULL),
    ('CAIXA DE SOM STANER TWS-410', '0047', 'Disponivel', 'CAIXA DE SOM', 400, 'NAO ENCONTRADO', '01 AC 3 PINOS'),
    ('CAIXA DE SOM STD HPA08L', '0048', 'Disponivel', 'CAIXA DE SOM', 300, 'NAO ENCONTRADO', NULL),
    ('CAIXA DE SOM SOUNDBOX OMNE 600 ACTIVE ATIVA', '0017', 'Disponivel', 'CAIXA DE SOM', 0, '003558', '03 BARRAS, 01 ALTA, 01 SPICON'),
    ('CAIXA DE SOM SOUNDBOX OMNE 600 ACTIVE ATIVA', '0019', 'Disponivel', 'CAIXA DE SOM', 0, '003556', '03 BARRAS, 01 ALTA, 01 SPICON'),
    ('CAIXA DE SOM SOUNDBOX OMNE 600 PASSIVE PASSIVA', '0013', 'Disponivel', 'CAIXA DE SOM', 0, '002747', '03 BARRAS, 01 ALTA, 01 SPICON'),
    ('CAIXA DE SOM SOUNDBOX OMNE 600 PASSIVE PASSIVA', '0015', 'Disponivel', 'CAIXA DE SOM', 0, '002715', '03 BARRAS, 01 ALTA, 01 SPICON'),
    ('CAIXA DE SOM RCF ART 710-A', '0020', 'Disponivel', 'CAIXA DE SOM', 350, 'RKQQ00127', '01 AC 3 PINOS'),
    ('CAIXA DE SOM RCF ART 710-A', '0021', 'Disponivel', 'CAIXA DE SOM', 350, 'RKQA00126', '01 AC 3 PINOS'),
    ('CAIXA DE SOM RCF ART 710-A', '0022', 'Disponivel', 'CAIXA DE SOM', 350, 'RKQU00207', '01 AC 3 PINOS'),
    ('CAIXA DE SOM RCF ART 710-A', '0023', 'Disponivel', 'CAIXA DE SOM', 350, 'RKQG00159', '01 AC 3 PINOS'),
    ('CAIXA DE SOM RCF ART 910-A', '0027', 'Disponivel', 'CAIXA DE SOM', 350, 'NAO ENCONTRADO', '01 AC 3 PINOS'),
    ('CAIXA DE SOM RCF ART 910-A', '0024', 'Disponivel', 'CAIXA DE SOM', 350, 'NAO ENCONTRADO', '01 AC 3 PINOS'),
    ('CAIXA DE SOM RCF ART 910-A', '0878', 'Disponivel', 'CAIXA DE SOM', 350, 'NAO ENCONTRADO', '01 AC 3 PINOS'),
    ('CAIXA DE SOM RCF ART 910-A', '0026', 'Disponivel', 'CAIXA DE SOM', 350, 'NAO ENCONTRADO', '01 AC 3 PINOS'),
    ('CAIXA DE SOM SUB SONDBOX SW18-ACTIVE', '0786', 'Disponivel', 'CAIXA DE SOM', 1, '017086', NULL),
    ('CAIXA DE SOM SUB SONDBOX SW18-ACTIVE', '0053', 'Disponivel', 'CAIXA DE SOM', 1, '017152', NULL),
    ('CAIXA DE SOM SUB SONDBOX SW18-ACTIVE', '0055', 'Disponivel', 'CAIXA DE SOM', 1, '017161', NULL),
    ('CAIXA DE SOM SUB SONDBOX SW18-ACTIVE', '0049', 'Disponivel', 'CAIXA DE SOM', 1, '019793', NULL),
    ('ALTA CAIXA DE SOM SONDBOX MODELO SB2.6 VERTICAL -A', '0798', 'Disponivel', 'CAIXA DE SOM', 600, '004547', NULL),
    ('ALTA CAIXA DE SOM SONDBOX MODELO SB2.6 VERTICAL -A', '0054', 'Disponivel', 'CAIXA DE SOM', 600, '004546', NULL),
    ('ALTA CAIXA DE SOM SONDBOX MODELO SB2.6 VERTICAL -A', '0052', 'Disponivel', 'CAIXA DE SOM', 600, '004557', NULL),
    ('ALTA CAIXA DE SOM SONDBOX MODELO SB2.6 VERTICAL -A', '0797', 'Disponivel', 'CAIXA DE SOM', 600, '026081', NULL),
    ('CAIXA DE SOM BOSE SUB GRANDE', '0042', 'Disponivel', 'CAIXA DE SOM', 0, 'NAO ENCONTRADO', NULL),
    ('CAIXA DE SOM BOSE SUB GRANDE', '0038', 'Disponivel', 'CAIXA DE SOM', 0, 'NAO ENCONTRADO', NULL),
    ('CAIXA DE SOM BOSE SUB', '0030', 'Disponivel', 'CAIXA DE SOM', 0, '032494Z41590199AC', NULL),
    ('CAIXA DE SOM BOSE SUB', '0034', 'Disponivel', 'CAIXA DE SOM', 0, '057275Z41190038AE', NULL),
    ('BASE CAIXA DE SOM BOSE L2', '0043', 'Disponivel', 'CAIXA DE SOM', 0, 'NAO ENCONTRADO', '01 P10/XLR FEMEA, 01 SPICON, 01 AC 3 PINOS'),
    ('ALTA CAIXA DE SOM BOSE', '0040', 'Disponivel', 'CAIXA DE SOM', 600, 'NAO ENCONTRADO', NULL),
    ('BAIXA CAIXA DE SOM BOSE', '0041', 'Disponivel', 'CAIXA DE SOM', 600, 'NAO ENCONTRADO', NULL),
    ('BASE CAIXA DE SOM BOSE L1', '0031', 'Disponivel', 'CAIXA DE SOM', 0, 'NAO ENCONTRADO', '01 P10/XLR FEMEA, 01 SPICON, 01 AC 3 PINOS'),
    ('ALTA CAIXA DE SOM BOSE', '0029', 'Disponivel', 'CAIXA DE SOM', 600, '05728Z40780585AE', NULL),
    ('BAIXA CAIXA DE SOM BOSE', '0028', 'Disponivel', 'CAIXA DE SOM', 600, '057278Z40780598AE', NULL),
    ('CAIXA DE SOM JBL 510', '1190', 'Disponivel', 'CAIXA DE SOM', 1, 'VTP088614136', NULL),
    ('CAIXA DE SOM JBL 510', '1191', 'Disponivel', 'CAIXA DE SOM', 1, 'VTP088614131', NULL)
ON CONFLICT(barcode) DO UPDATE SET
    name = excluded.name,
    category = excluded.category,
    serial_number = excluded.serial_number,
    observation = excluded.observation;

-- Os registros antigos que não aparecem no PDF são preservados fora do tópico
-- principal, pois alguns possuem histórico de movimentação.
UPDATE equipments
SET category = 'CAIXA DE SOM - FORA DA PLANILHA'
WHERE upper(trim(category)) = 'CAIXA DE SOM'
  AND barcode NOT IN (
      '0787','0783','0782','0778','0792','0788','0767','0763','0757','0753',
      '0762','0758','0777','0768','0772','0774','0051','0044','0047','0048',
      '0017','0019','0013','0015','0020','0021','0022','0023','0027','0024',
      '0878','0026','0786','0053','0055','0049','0798','0054','0052','0797',
      '0042','0038','0030','0034','0043','0040','0041','0031','0029','0028',
      '1190','1191'
  );

-- Os itens fora da planilha ficam indisponíveis para o usuário comercial.
INSERT INTO quote_hidden_equipments (equipment_id, hidden_by_username)
SELECT id, 'SINCRONIZACAO PLANILHA 1'
FROM equipments
WHERE category = 'CAIXA DE SOM - FORA DA PLANILHA'
ON CONFLICT(equipment_id) DO UPDATE SET
    hidden_by_username = excluded.hidden_by_username,
    hidden_at = CURRENT_TIMESTAMP;
