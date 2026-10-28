const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const sqlite3 = require('sqlite3').verbose();

const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const pdfArg = args.find((arg) => !arg.startsWith('--'));
const pdfPath = pdfArg || path.resolve(process.env.USERPROFILE || '', 'Downloads', 'EQUIPAMENTOS 24HLOCACOES - Google Planilhas.pdf');
const sqliteDbPath = path.join(projectRoot, 'banco de dados', 'database.db');
const sqlOutputPath = path.join(projectRoot, 'banco de dados', 'import-equipment-categories-from-pdf.sql');
const reportPath = path.join(projectRoot, 'RELATORIO_IMPORTACAO_CATEGORIAS_EQUIPAMENTOS.md');
const backupDir = path.join(projectRoot, 'backups', 'sqlite');

const NAME_COLUMN_LIMIT = 600;
const SERIAL_COLUMN_START = 780;

function timestampForFile(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-');
}

function normalizeWhitespace(value) {
    return String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeForLookup(value) {
    return normalizeWhitespace(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
}

function normalizeCategory(value) {
    const withoutTopic = normalizeWhitespace(value)
        .replace(/^T(?:O|\u00d3)PICO\s*[:\-]?\s*/i, '');

    return withoutTopic.toLocaleUpperCase('pt-BR').trim() || 'SEM CATEGORIA';
}

function splitNameAndObservation(rawName) {
    const observations = [];
    const cleanName = normalizeWhitespace(
        normalizeWhitespace(rawName).replace(/\(([^)]*)\)/g, (_, observation) => {
            const normalizedObservation = normalizeWhitespace(observation);
            if (normalizedObservation) observations.push(normalizedObservation);
            return ' ';
        })
    );

    return {
        name: cleanName || normalizeWhitespace(rawName),
        observation: observations.length ? observations.join('; ') : null
    };
}

function inflatePdfStreams(pdfBuffer) {
    const pdfText = pdfBuffer.toString('latin1');
    const streams = [];
    const streamRegex = /(\d+)\s+0\s+obj[\s\S]*?stream\r?\n/g;
    let match;

    while ((match = streamRegex.exec(pdfText))) {
        const objectNumber = Number(match[1]);
        const streamStart = streamRegex.lastIndex;
        const streamEnd = pdfText.indexOf('endstream', streamStart);
        if (streamEnd === -1) continue;

        let dataEnd = streamEnd;
        while (dataEnd > streamStart && (pdfBuffer[dataEnd - 1] === 0x0a || pdfBuffer[dataEnd - 1] === 0x0d)) {
            dataEnd -= 1;
        }

        try {
            streams.push({
                objectNumber,
                text: zlib.inflateSync(pdfBuffer.subarray(streamStart, dataEnd)).toString('latin1')
            });
        } catch (_) {
            // Alguns streams do PDF não são texto comprimido. Eles não interessam para esta importação.
        }
    }

    return streams;
}

function buildCharacterMap(cmapText) {
    const map = new Map();

    for (const block of cmapText.match(/\d+ beginbfchar[\s\S]*?endbfchar/gm) || []) {
        for (const match of block.matchAll(/<([0-9A-F]+)>\s*<([0-9A-F]+)>/g)) {
            map.set(parseInt(match[1], 16), String.fromCodePoint(parseInt(match[2], 16)));
        }
    }

    for (const block of cmapText.match(/\d+ beginbfrange[\s\S]*?endbfrange/gm) || []) {
        for (const line of block.split(/\r?\n/)) {
            const match = line.match(/<([0-9A-F]+)>\s*<([0-9A-F]+)>\s*<([0-9A-F]+)>/);
            if (!match) continue;

            let source = parseInt(match[1], 16);
            const sourceEnd = parseInt(match[2], 16);
            let target = parseInt(match[3], 16);

            while (source <= sourceEnd) {
                map.set(source, String.fromCodePoint(target));
                source += 1;
                target += 1;
            }
        }
    }

    return map;
}

function decodeHexString(hex, charMap) {
    return (hex.match(/.{1,4}/g) || [])
        .map((chunk) => charMap.get(parseInt(chunk, 16)) || '')
        .join('');
}

function isHeaderText(value) {
    const text = normalizeForLookup(value);
    return [
        'EQUIPAMENTO',
        'EQUIPAMENTOS',
        'PATRIMONIO',
        'PATRIMONIO',
        'N SERIE',
        'N. SERIE',
        'N SERIE',
        'NUMERO DE SERIE',
        'SERIE',
        'CODIGO DE BARRAS'
    ].includes(text) || text.startsWith('PAGINA ');
}

function parsePdfRows(pdfBuffer) {
    const streams = inflatePdfStreams(pdfBuffer);
    const cmapStream = streams.find((stream) => stream.text.includes('beginbfchar') || stream.text.includes('beginbfrange'));
    if (!cmapStream) throw new Error('Mapa de caracteres do PDF não encontrado.');

    const charMap = buildCharacterMap(cmapStream.text);
    const textItems = [];

    streams
        .filter((stream) => stream.text.includes('BT') && stream.text.includes(' Tm') && stream.text.includes(' Tj'))
        .sort((a, b) => a.objectNumber - b.objectNumber)
        .forEach((stream) => {
            const blocks = stream.text.split('BT').slice(1).map((part) => part.split('ET')[0]);

            blocks.forEach((block) => {
                const tmMatch = block.match(/1 0 0 -1 ([0-9.]+) ([0-9.]+) Tm/);
                if (!tmMatch) return;

                const x = Number(tmMatch[1]);
                const y = Number(tmMatch[2]);
                const text = normalizeWhitespace(
                    [...block.matchAll(/<([0-9A-F]+)> Tj/g)]
                        .map((match) => decodeHexString(match[1], charMap))
                        .join('')
                );

                if (!text || y === 15) return;
                textItems.push({ objectNumber: stream.objectNumber, x, y, text });
            });
        });

    const rows = new Map();
    textItems.forEach((item) => {
        const key = `${item.objectNumber}:${item.y.toFixed(2)}`;
        if (!rows.has(key)) {
            rows.set(key, {
                objectNumber: item.objectNumber,
                y: item.y,
                items: []
            });
        }
        rows.get(key).items.push(item);
    });

    const parsedRows = [];
    let currentCategory = '';

    [...rows.values()]
        .sort((a, b) => a.objectNumber - b.objectNumber || a.y - b.y)
        .forEach((row) => {
            const sortedItems = row.items.slice().sort((a, b) => a.x - b.x);
            const name = normalizeWhitespace(
                sortedItems
                    .filter((item) => item.x < NAME_COLUMN_LIMIT)
                    .map((item) => item.text)
                    .join(' ')
            );
            const barcode = normalizeWhitespace(
                sortedItems
                    .filter((item) => item.x >= NAME_COLUMN_LIMIT && item.x < SERIAL_COLUMN_START)
                    .map((item) => item.text)
                    .join(' ')
            );
            const serialNumber = normalizeWhitespace(
                sortedItems
                    .filter((item) => item.x >= SERIAL_COLUMN_START)
                    .map((item) => item.text)
                    .join(' ')
            );

            if (!name || isHeaderText(name)) return;

            if (!barcode && !serialNumber) {
                currentCategory = normalizeCategory(name);
                parsedRows.push({
                    type: 'category',
                    category: currentCategory,
                    sourceText: name
                });
                return;
            }

            if (!barcode) return;

            const splitName = splitNameAndObservation(name);
            parsedRows.push({
                type: 'equipment',
                name: splitName.name,
                barcode,
                serialNumber: serialNumber || null,
                observation: splitName.observation,
                category: currentCategory || 'SEM CATEGORIA',
                sourceText: name
            });
        });

    return parsedRows;
}

function openDatabase(databasePath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(databasePath, (error) => {
            if (error) reject(error);
            else resolve(db);
        });
    });
}

function run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(error) {
            if (error) reject(error);
            else resolve(this);
        });
    });
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows || []);
        });
    });
}

function close(db) {
    return new Promise((resolve, reject) => {
        db.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

async function tableColumns(db, tableName) {
    return all(db, `PRAGMA table_info(${tableName})`);
}

async function ensureEquipmentSchema(db) {
    await run(db, 'ALTER TABLE equipments ADD COLUMN serial_number TEXT').catch(() => {});
    await run(db, 'ALTER TABLE equipments ADD COLUMN observation TEXT').catch(() => {});
    await run(
        db,
        `CREATE TABLE IF NOT EXISTS equipment_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`
    );
    await run(db, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_categories_name ON equipment_categories(name)');
}

async function getExistingEquipments(db) {
    const columns = await tableColumns(db, 'equipments');
    const columnNames = new Set(columns.map((column) => column.name));
    const serialSelect = columnNames.has('serial_number') ? 'serial_number' : 'NULL AS serial_number';
    const observationSelect = columnNames.has('observation') ? 'observation' : 'NULL AS observation';
    const unitPriceSelect = columnNames.has('unit_price') ? 'unit_price' : 'NULL AS unit_price';

    return all(
        db,
        `SELECT id,
                name,
                barcode,
                current_status,
                category,
                ${serialSelect},
                ${observationSelect},
                ${unitPriceSelect}
         FROM equipments`
    );
}

function createBackup() {
    if (!fs.existsSync(sqliteDbPath)) {
        throw new Error(`Banco SQLite não encontrado em ${sqliteDbPath}`);
    }

    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `database-${timestampForFile()}-equipment-categories-import.db`);
    fs.copyFileSync(sqliteDbPath, backupPath);
    return backupPath;
}

function valuesAreEqual(first, second) {
    return normalizeWhitespace(first) === normalizeWhitespace(second);
}

function buildImportPlan(parsedRows, existingEquipments) {
    const equipmentRows = parsedRows.filter((row) => row.type === 'equipment');
    const categories = [...new Set(parsedRows
        .filter((row) => row.type === 'category')
        .map((row) => row.category)
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const existingByBarcode = new Map();
    existingEquipments.forEach((equipment) => {
        existingByBarcode.set(normalizeWhitespace(equipment.barcode), equipment);
    });

    const seenPdfBarcodes = new Map();
    const duplicates = [];
    const updates = [];
    const notImported = [];

    equipmentRows.forEach((row) => {
        if (seenPdfBarcodes.has(row.barcode)) {
            duplicates.push({
                first: seenPdfBarcodes.get(row.barcode),
                duplicate: row
            });
            return;
        }

        seenPdfBarcodes.set(row.barcode, row);
        const existing = existingByBarcode.get(row.barcode);
        if (!existing) {
            notImported.push(row);
            return;
        }

        const changes = [];
        [
            ['name', 'nome', existing.name, row.name],
            ['serial_number', 'número de série', existing.serial_number, row.serialNumber],
            ['observation', 'observação', existing.observation, row.observation],
            ['category', 'categoria', existing.category, row.category]
        ].forEach(([field, label, before, after]) => {
            if (!valuesAreEqual(before, after)) {
                changes.push({ field, label, before: before ?? '', after: after ?? '' });
            }
        });

        updates.push({ existing, row, changes });
    });

    return { categories, equipmentRows, updates, notImported, duplicates };
}

async function applyImportPlan(db, plan) {
    await run(db, 'BEGIN TRANSACTION');

    try {
        for (const category of plan.categories) {
            await run(db, 'INSERT OR IGNORE INTO equipment_categories (name) VALUES (?)', [category]);
        }

        for (const update of plan.updates) {
            await run(
                db,
                `UPDATE equipments
                 SET name = ?,
                     serial_number = ?,
                     observation = ?,
                     category = ?
                 WHERE id = ?`,
                [
                    update.row.name,
                    update.row.serialNumber,
                    update.row.observation,
                    update.row.category,
                    update.existing.id
                ]
            );
        }

        await run(db, 'COMMIT');
    } catch (error) {
        await run(db, 'ROLLBACK').catch(() => {});
        throw error;
    }
}

function escapeSqlValue(value) {
    if (value === null || value === undefined || value === '') return 'NULL';
    return `'${String(value).replace(/'/g, "''")}'`;
}

function buildD1ImportSql(plan) {
    const lines = [
        '-- Importação de categorias de equipamentos gerada a partir do PDF.',
        '-- Aplique antes a migration banco de dados/migrations/0018_equipment_metadata_categories.sql se o D1 ainda não tiver estas colunas.',
        '',
        `CREATE TABLE IF NOT EXISTS equipment_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`,
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_categories_name ON equipment_categories(name);',
        ''
    ];

    plan.categories.forEach((category) => {
        lines.push(`INSERT OR IGNORE INTO equipment_categories (name) VALUES (${escapeSqlValue(category)});`);
    });

    if (plan.categories.length) lines.push('');

    plan.updates.forEach((update) => {
        lines.push(
            `UPDATE equipments SET name = ${escapeSqlValue(update.row.name)}, serial_number = ${escapeSqlValue(update.row.serialNumber)}, observation = ${escapeSqlValue(update.row.observation)}, category = ${escapeSqlValue(update.row.category)} WHERE barcode = ${escapeSqlValue(update.row.barcode)};`
        );
    });

    return `${lines.join('\n')}\n`;
}

function markdownCell(value) {
    return normalizeWhitespace(value || '-').replace(/\|/g, '\\|');
}

function buildReport(plan, backupPath) {
    const changedUpdates = plan.updates.filter((update) => update.changes.length > 0);
    const lines = [
        '# Relatório de Importação de Categorias de Equipamentos',
        '',
        `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
        `PDF analisado: ${pdfPath}`,
        `Banco SQLite local: ${sqliteDbPath}`,
        `Backup criado: ${backupPath || 'não criado (modo simulação)'}`,
        `SQL para D1: ${sqlOutputPath}`,
        `Modo: ${dryRun ? 'simulação, sem alterar banco' : 'importação aplicada no SQLite local'}`,
        '',
        '## Resumo',
        '',
        `- Categorias/tópicos detectados: ${plan.categories.length}`,
        `- Linhas de equipamentos identificadas no PDF: ${plan.equipmentRows.length}`,
        `- Patrimônios existentes atualizados: ${plan.updates.length}`,
        `- Patrimônios existentes com alguma mudança de valor: ${changedUpdates.length}`,
        `- Patrimônios novos não importados: ${plan.notImported.length}`,
        `- Patrimônios duplicados no PDF ignorados: ${plan.duplicates.length}`,
        '',
        '## Categorias Detectadas',
        ''
    ];

    plan.categories.forEach((category) => {
        lines.push(`- ${category}`);
    });

    lines.push(
        '',
        '## Patrimônios Atualizados',
        '',
        '| Patrimônio | Nome no banco antes | Nome da planilha | Categoria anterior | Categoria nova | Número de série | Observação |',
        '|---|---|---|---|---|---|---|'
    );

    plan.updates.forEach((update) => {
        lines.push(
            `| ${markdownCell(update.row.barcode)} | ${markdownCell(update.existing.name)} | ${markdownCell(update.row.name)} | ${markdownCell(update.existing.category)} | ${markdownCell(update.row.category)} | ${markdownCell(update.row.serialNumber)} | ${markdownCell(update.row.observation)} |`
        );
    });

    if (!plan.updates.length) {
        lines.push('| - | - | - | - | - | - | - |');
    }

    lines.push(
        '',
        '## Patrimônios Novos Não Importados',
        '',
        'Esses itens existem na planilha, mas o patrimônio não foi encontrado no banco local. Eles não foram cadastrados automaticamente.',
        '',
        '| Patrimônio | Nome da planilha | Categoria | Número de série | Observação |',
        '|---|---|---|---|---|'
    );

    plan.notImported.forEach((row) => {
        lines.push(
            `| ${markdownCell(row.barcode)} | ${markdownCell(row.name)} | ${markdownCell(row.category)} | ${markdownCell(row.serialNumber)} | ${markdownCell(row.observation)} |`
        );
    });

    if (!plan.notImported.length) {
        lines.push('| - | - | - | - | - |');
    }

    lines.push(
        '',
        '## Duplicados Ignorados',
        '',
        '| Patrimônio | Primeira ocorrência | Ocorrência ignorada | Categoria |',
        '|---|---|---|---|'
    );

    plan.duplicates.forEach((entry) => {
        lines.push(
            `| ${markdownCell(entry.duplicate.barcode)} | ${markdownCell(entry.first.name)} | ${markdownCell(entry.duplicate.name)} | ${markdownCell(entry.duplicate.category)} |`
        );
    });

    if (!plan.duplicates.length) {
        lines.push('| - | - | - | - |');
    }

    lines.push(
        '',
        '## Campos Preservados',
        '',
        '- O script atualizou somente nome, número de série, observação e categoria dos patrimônios já existentes.',
        '- O script não altera preço, status, disponibilidade, quantidade, eventos, manutenções, reservas ou histórico.',
        '- Patrimônios ausentes no banco foram apenas relatados; nenhum equipamento novo foi criado.',
        '',
        '## Revisão Manual Antes de D1/Deploy',
        '',
        '- Conferir os patrimônios novos não importados e decidir se algum deve ser cadastrado manualmente.',
        '- Conferir nomes com dados entre parênteses, pois o conteúdo entre parênteses foi salvo como observação.',
        '- Antes de aplicar no Cloudflare D1, aplicar a migration `0018_equipment_metadata_categories.sql` se ela ainda não estiver aplicada.',
        '- Aplicar o SQL `import-equipment-categories-from-pdf.sql` no D1 somente depois da revisão.',
        ''
    );

    return `${lines.join('\n')}\n`;
}

async function main() {
    if (!fs.existsSync(pdfPath)) throw new Error(`PDF não encontrado em ${pdfPath}`);
    if (!fs.existsSync(sqliteDbPath)) throw new Error(`Banco SQLite não encontrado em ${sqliteDbPath}`);

    const parsedRows = parsePdfRows(fs.readFileSync(pdfPath));
    const equipmentRows = parsedRows.filter((row) => row.type === 'equipment');
    if (!equipmentRows.length) throw new Error('Nenhum equipamento foi identificado no PDF.');

    const backupPath = dryRun ? '' : createBackup();
    const db = await openDatabase(sqliteDbPath);

    try {
        if (!dryRun) {
            await ensureEquipmentSchema(db);
        }

        const existingEquipments = await getExistingEquipments(db);
        const plan = buildImportPlan(parsedRows, existingEquipments);

        fs.writeFileSync(sqlOutputPath, buildD1ImportSql(plan), 'utf8');

        if (!dryRun) {
            await applyImportPlan(db, plan);
        }

        fs.writeFileSync(reportPath, buildReport(plan, backupPath), 'utf8');

        console.log(`Categorias detectadas: ${plan.categories.length}`);
        console.log(`Equipamentos no PDF: ${plan.equipmentRows.length}`);
        console.log(`Patrimônios existentes atualizados: ${plan.updates.length}`);
        console.log(`Patrimônios novos não importados: ${plan.notImported.length}`);
        if (backupPath) console.log(`Backup SQLite: ${backupPath}`);
        console.log(`Relatório: ${reportPath}`);
        console.log(`SQL para D1: ${sqlOutputPath}`);
    } finally {
        await close(db);
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
