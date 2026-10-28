# Relatório de Importação de Categorias de Equipamentos

Gerado em: 09/07/2026, 11:03:14
PDF analisado: C:\Users\Arthur S\Desktop\EQUIPAMENTOS 24HLOCACOES - Google Planilhas.pdf
Banco SQLite local: C:\Users\Arthur S\Documents\GitHub\Sistema de estoque 24H\banco de dados\database.db
Backup criado: não criado (modo simulação)
SQL para D1: C:\Users\Arthur S\Documents\GitHub\Sistema de estoque 24H\banco de dados\import-equipment-categories-from-pdf.sql
Modo: simulação, sem alterar banco

## Resumo

- Categorias/tópicos detectados: 39
- Linhas de equipamentos identificadas no PDF: 1
- Patrimônios existentes atualizados: 0
- Patrimônios existentes com alguma mudança de valor: 0
- Patrimônios novos não importados: 1
- Patrimônios duplicados no PDF ignorados: 0

## Categorias Detectadas

- ALTA CAIA DE SOM SONDBO MODEO SB ERICA A
- ALTA CAIXA DE SOM STANER TS
- AMIFICADOR DE ANENA SENNEISER RACK
- ANENA RF MGA PROADIO A CABO MGA RF
- ANENA RF MGA PROADIO A CABO RF
- ANENNA DISRIBIION SSEM DIERSI F MGA PROADIO S
- ANENNA DISRIBIION SSEM DIERSI F RACK
- ANTENAS RF
- BASE ANENA MGA RO ADIO S RACK
- BASE MICROFONE SENNEISER E BODPACK ANTENAS FONTE
- CAIA DE SOM SB SONDBO SACIE
- CAIXA DE SOM
- CAIXA DE SOM SONDBOX OMNE ACTIE ATIA BARRAS ALTA SPICON
- CAIXA DE SOM SONDBOX OMNE PASSIE PASSIA BARRAS ALTA SPICON
- CAIXA DE SOM STANER TS AC INOS
- DIREC BO IRECONE DI
- DIREC TBOX
- GRAADOR SON MEMOR RECORDIN NI RMRC
- MESA DE SOM
- MESA DE SOM ATRIM
- MESA DE SOM SONDCRAF I I
- MESA DE SOM SONDOICE
- MICROFONE CABEADO
- MICROFONE DE MESA
- MICROFONE DE PODCAST
- MICROFONE SEM FIO
- MICROFONE SEM FIO RACK
- MICROFONE SEM FIO SENNEISER SKM G RACK
- MICROFONE SEM FIO SENNEISER SKM S G RACK
- MICROFONE SENNEISER E BASE FONTE
- MICROFONE SENNEISER RARCK
- MICROFONE SENNEISER S
- MICROFONE SRE P BASE FONTE
- PEDESTAL DE MESA
- PERIFERICOS SOM
- PONO SEM FIO IN EAR IEM ANTENA FONTE FONE BODPACK
- SIER XLR FIBRA CF
- TRIPÈ GIRAFA
- TRIPÉ PARA CAIXA DE SOM

## Patrimônios Atualizados

| Patrimônio | Nome no banco antes | Nome da planilha | Categoria anterior | Categoria nova | Número de série | Observação |
|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - |

## Patrimônios Novos Não Importados

Esses itens existem na planilha, mas o patrimônio não foi encontrado no banco local. Eles não foram cadastrados automaticamente.

| Patrimônio | Nome da planilha | Categoria | Número de série | Observação |
|---|---|---|---|---|
| NAO ENCONTRADO | Caia de som Rcf ART A ac inos | CAIXA DE SOM SONDBOX OMNE PASSIE PASSIA BARRAS ALTA SPICON | NAO ENCONTRADO | - |

## Duplicados Ignorados

| Patrimônio | Primeira ocorrência | Ocorrência ignorada | Categoria |
|---|---|---|---|
| - | - | - | - |

## Campos Preservados

- O script atualizou somente nome, número de série, observação e categoria dos patrimônios já existentes.
- O script não altera preço, status, disponibilidade, quantidade, eventos, manutenções, reservas ou histórico.
- Patrimônios ausentes no banco foram apenas relatados; nenhum equipamento novo foi criado.

## Revisão Manual Antes de D1/Deploy

- Conferir os patrimônios novos não importados e decidir se algum deve ser cadastrado manualmente.
- Conferir nomes com dados entre parênteses, pois o conteúdo entre parênteses foi salvo como observação.
- Antes de aplicar no Cloudflare D1, aplicar a migration `0018_equipment_metadata_categories.sql` se ela ainda não estiver aplicada.
- Aplicar o SQL `import-equipment-categories-from-pdf.sql` no D1 somente depois da revisão.

