const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const sqlite3 = require('sqlite3').verbose();

const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const appendMode = args.includes('--append');
const pdfArg = args.find((arg) => !arg.startsWith('--'));
const pdfPath = pdfArg || path.resolve(
    process.env.USERPROFILE || '',
    'Downloads',
    'CABOS 24HLOCACOES - Google Planilhas.pdf'
);
const sqliteDbPath = path.join(projectRoot, 'banco de dados', 'database.db');
const sqlOutputPath = path.join(projectRoot, 'banco de dados', 'import-cables-from-pdf.sql');
const backupDir = path.join(projectRoot, 'backups', 'sqlite');
const reportPath = path.join(projectRoot, 'RELATORIO_IMPORTACAO_CABOS.md');

function normalizeWhitespace(value) {
    return String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/[\r\n\u2028\u2029]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function uppercase(value) {
    return normalizeWhitespace(value).toLocaleUpperCase('pt-BR');
}

function inflateObject(pdfBuffer, objectNumber) {
    const pdfText = pdfBuffer.toString('latin1');
    const objectMatch = pdfText.match(
        new RegExp(`${objectNumber} 0 obj[\\s\\S]*?stream\\r?\\n([\\s\\S]*?)endstream`)
    );
    if (!objectMatch) throw new Error(`Objeto ${objectNumber} não encontrado no PDF.`);

    const startOffset = objectMatch.index;
    const streamMarker = pdfText.slice(startOffset).match(/stream\r?\n/)[0];
    const streamStart = startOffset + pdfText.slice(startOffset).indexOf(streamMarker) + streamMarker.length;
    const streamEnd = startOffset + objectMatch[0].lastIndexOf('endstream') - 1;

    return zlib.inflateSync(pdfBuffer.subarray(streamStart, streamEnd)).toString('latin1');
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

function normalizeCategory(name, category, previousCategory) {
    const normalized = uppercase(category);
    if (normalized) return normalized;
    if (/^REDE\b/.test(name)) return 'REDE';
    return uppercase(previousCategory || 'OUTROS');
}

function normalizeQuantity(quantity) {
    const normalized = normalizeWhitespace(quantity);
    if (!normalized) throw new Error('Foi encontrada uma linha sem quantidade.');

    const value = Number(normalized);
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`Quantidade inválida encontrada no PDF: "${normalized}".`);
    }
    return value;
}

function parsePdfRows(pdfBuffer) {
    const charMap = buildCharacterMap(inflateObject(pdfBuffer, 15));
    const items = [];

    [6, 8].forEach((objectNumber) => {
        const streamText = inflateObject(pdfBuffer, objectNumber);
        const blocks = streamText.split('BT').slice(1).map((part) => part.split('ET')[0]);

        blocks.forEach((block) => {
            const tmMatch = block.match(/1 0 0 -1 ([0-9.]+) ([0-9.]+) Tm/);
            if (!tmMatch) return;

            const x = Number(tmMatch[1]);
            const y = Number(tmMatch[2]);
            const text = [...block.matchAll(/<([0-9A-F]+)> Tj/g)]
                .map((match) => decodeHexString(match[1], charMap))
                .join('')
                .trim();

            if (!text || y === 15 || ['CABO', 'QUANTIDADE', 'CATEGORIA'].includes(uppercase(text))) return;
            items.push({ x, y, text });
        });
    });

    const rows = new Map();
    items.forEach((item) => {
        if (!rows.has(item.y)) rows.set(item.y, { name: '', quantity: '', category: '' });
        const row = rows.get(item.y);
        if (item.x < 300) row.name = item.text;
        else if (item.x < 410) row.quantity = item.text;
        else row.category = item.text;
    });

    let previousCategory = 'OUTROS';
    const parsedRows = [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, row]) => {
            const name = uppercase(row.name);
            if (!name) return null;

            const category = normalizeCategory(name, row.category, previousCategory);
            previousCategory = category;

            return {
                name,
                quantity: normalizeQuantity(row.quantity),
                category
            };
        })
        .filter(Boolean);

    const names = new Set();
    for (const row of parsedRows) {
        if (names.has(row.name)) {
            throw new Error(`Nome de cabo duplicado no PDF: "${row.name}".`);
        }
        names.add(row.name);
    }

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

function get(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) reject(error);
            else resolve(row);
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

function escapeSqlString(value) {
    return String(value).replace(/'/g, "''");
}

function buildImportSql(rows) {
    const lines = [
        '-- Substituição integral de cabos gerada automaticamente a partir do PDF.',
        '-- Faça backup do D1 antes de executar este arquivo na nuvem.',
        "DELETE FROM event_saida_hidden_items WHERE item_type = 'cable';",
        'DELETE FROM cable_event_movements;',
        'DELETE FROM cable_maintenances;',
        'DELETE FROM cables;',
        ''
    ];

    rows.forEach((row) => {
        lines.push(
            `INSERT INTO cables (name, quantity, available_quantity, category, unit_price, updated_at) `
            + `VALUES ('${escapeSqlString(row.name)}', ${row.quantity}, ${row.quantity}, `
            + `'${escapeSqlString(row.category)}', 1, CURRENT_TIMESTAMP);`
        );
    });

    return `${lines.join('\n')}\n`;
}

function timestampForFile(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-');
}

function backupDatabase(db, destinationPath) {
    return new Promise((resolve, reject) => {
        let backup;
        backup = db.backup(destinationPath, (initializeError) => {
            if (initializeError) {
                reject(initializeError);
                return;
            }

            backup.step(-1, (stepError, completed) => {
                backup.finish(() => {
                    if (stepError) reject(stepError);
                    else if (!completed) reject(new Error('O backup SQLite não foi concluído.'));
                    else resolve();
                });
            });
        });
    });
}

async function createBackup() {
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(
        backupDir,
        `database-${timestampForFile()}-antes-substituir-cabos.db`
    );
    const db = await openDatabase(sqliteDbPath);

    try {
        await backupDatabase(db, backupPath);
    } finally {
        await close(db);
    }

    const backup = await openDatabase(backupPath);
    try {
        const result = await get(backup, 'PRAGMA integrity_check');
        if (String(result?.integrity_check || '').toLowerCase() !== 'ok') {
            throw new Error('O backup SQLite falhou na verificação de integridade.');
        }
    } finally {
        await close(backup);
    }

    return backupPath;
}

async function tableExists(db, tableName) {
    return Boolean(await get(
        db,
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        [tableName]
    ));
}

async function clearCableData(db) {
    if (await tableExists(db, 'event_saida_hidden_items')) {
        await run(db, "DELETE FROM event_saida_hidden_items WHERE item_type = 'cable'");
    }
    if (await tableExists(db, 'cable_event_movements')) {
        await run(db, 'DELETE FROM cable_event_movements');
    }
    if (await tableExists(db, 'cable_maintenances')) {
        await run(db, 'DELETE FROM cable_maintenances');
    }
    await run(db, 'DELETE FROM cables');
    await run(
        db,
        `DELETE FROM sqlite_sequence
         WHERE name IN ('cables', 'cable_event_movements', 'cable_maintenances', 'event_saida_hidden_items')`
    );
}

async function importIntoSqlite(rows) {
    const db = await openDatabase(sqliteDbPath);

    try {
        await run(
            db,
            `CREATE TABLE IF NOT EXISTS cables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0,
                available_quantity INTEGER NOT NULL DEFAULT 0,
                category TEXT NOT NULL DEFAULT 'OUTROS',
                unit_price REAL NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`
        );
        await run(db, "ALTER TABLE cables ADD COLUMN category TEXT NOT NULL DEFAULT 'OUTROS'").catch(() => {});
        await run(db, 'ALTER TABLE cables ADD COLUMN available_quantity INTEGER NOT NULL DEFAULT 0').catch(() => {});
        await run(db, 'ALTER TABLE cables ADD COLUMN unit_price REAL NOT NULL DEFAULT 1').catch(() => {});

        await run(db, 'BEGIN IMMEDIATE TRANSACTION');
        try {
            if (!appendMode) await clearCableData(db);

            for (const row of rows) {
                await run(
                    db,
                    `INSERT INTO cables (name, quantity, available_quantity, category, unit_price, updated_at)
                     VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
                     ON CONFLICT(name) DO UPDATE SET
                        quantity = excluded.quantity,
                        available_quantity = excluded.available_quantity,
                        category = excluded.category,
                        updated_at = CURRENT_TIMESTAMP`,
                    [row.name, row.quantity, row.quantity, row.category]
                );
            }

            await run(db, 'COMMIT');
        } catch (error) {
            await run(db, 'ROLLBACK').catch(() => {});
            throw error;
        }
    } finally {
        await close(db);
    }
}

function buildReport(rows, backupPath) {
    const categoryCounts = new Map();
    for (const row of rows) {
        const current = categoryCounts.get(row.category) || { items: 0, quantity: 0 };
        current.items += 1;
        current.quantity += row.quantity;
        categoryCounts.set(row.category, current);
    }

    const lines = [
        '# Relatório de Importação de Cabos',
        '',
        `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
        `PDF analisado: ${pdfPath}`,
        `Banco SQLite local: ${sqliteDbPath}`,
        `Backup: ${backupPath || 'não criado (modo de conferência)'}`,
        `Modo: ${dryRun ? 'conferência, sem alterar o banco' : appendMode ? 'incremental' : 'substituição integral'}`,
        '',
        '## Resumo por categoria',
        '',
        '| Categoria | Nomes | Quantidade total |',
        '|---|---:|---:|'
    ];

    for (const [category, counts] of categoryCounts) {
        lines.push(`| ${category.replace(/\|/g, '\\|')} | ${counts.items} | ${counts.quantity} |`);
    }

    lines.push('', '## Cabos', '', '| Categoria | Nome | Quantidade |', '|---|---|---:|');
    for (const row of rows) {
        lines.push(
            `| ${row.category.replace(/\|/g, '\\|')} `
            + `| ${row.name.replace(/\|/g, '\\|')} | ${row.quantity} |`
        );
    }
    lines.push('');
    return `${lines.join('\n')}\n`;
}

async function main() {
    if (!fs.existsSync(pdfPath)) throw new Error(`PDF não encontrado em ${pdfPath}`);
    if (!fs.existsSync(sqliteDbPath)) throw new Error(`Banco SQLite não encontrado em ${sqliteDbPath}`);

    const rows = parsePdfRows(fs.readFileSync(pdfPath));
    if (rows.length === 0) throw new Error('Nenhum cabo foi identificado no PDF.');

    fs.mkdirSync(path.dirname(sqlOutputPath), { recursive: true });
    fs.writeFileSync(sqlOutputPath, buildImportSql(rows), 'utf8');
    const backupPath = dryRun ? '' : await createBackup();
    if (!dryRun) await importIntoSqlite(rows);
    fs.writeFileSync(reportPath, buildReport(rows, backupPath), 'utf8');

    const categories = [...new Set(rows.map((row) => row.category))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    console.log(`Cabos identificados no PDF: ${rows.length}`);
    console.log(`Categorias encontradas: ${categories.length}`);
    console.log(`Quantidade total: ${rows.reduce((total, row) => total + row.quantity, 0)}`);
    console.log(`Modo: ${dryRun ? 'conferência' : appendMode ? 'incremental' : 'substituição integral'}`);
    if (backupPath) console.log(`Backup SQLite: ${backupPath}`);
    console.log(`SQL para D1 gerado em: ${sqlOutputPath}`);
    console.log(`Relatório gerado em: ${reportPath}`);
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
