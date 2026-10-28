const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { extractTextItems } = require('./replace-local-equipments-from-pdf');

const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const pdfArg = args.find((arg) => !arg.startsWith('--'));
const pdfPath = pdfArg || path.resolve(
    process.env.USERPROFILE || '',
    'Downloads',
    'CABOS manutencao 24HLOCACOES - Google Planilhas.pdf'
);
const databasePath = path.join(projectRoot, 'banco de dados', 'database.db');
const backupDir = path.join(projectRoot, 'backups', 'sqlite');
const reportPath = path.join(projectRoot, 'RELATORIO_IMPORTACAO_CABOS_MANUTENCAO.md');
const sqlPath = path.join(projectRoot, 'banco de dados', 'import-cable-maintenances-from-pdf.sql');
const maintenanceDescription = 'IMPORTADO DA PLANILHA DE MANUTENCAO';
const sourceNameAliases = new Map([
    ['REDE 1OM', 'REDE 10M']
]);

function normalize(value) {
    return String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleUpperCase('pt-BR');
}

function parseRows(pdfBuffer) {
    const items = extractTextItems(pdfBuffer);
    const rows = new Map();

    for (const item of items) {
        const text = normalize(item.text);
        if (!text || ['MANUTENCAO', 'MANUTENÇÃO', 'QUANTIDADE', 'CATEGORIA'].includes(text)) continue;

        const key = `${item.objectNumber}:${item.y}`;
        if (!rows.has(key)) rows.set(key, { sourceName: '', quantity: '', category: '' });
        const row = rows.get(key);
        if (item.x < 1360) row.sourceName = text;
        else if (item.x < 1462) row.quantity = text;
        else row.category = text;
    }

    const parsed = [...rows.values()]
        .filter((row) => row.sourceName)
        .map((row) => {
            const sourceName = normalize(row.sourceName);
            const name = sourceNameAliases.get(sourceName) || sourceName;
            const quantity = Number(row.quantity);
            const category = normalize(row.category);

            if (!Number.isInteger(quantity) || quantity <= 0) {
                throw new Error(`Quantidade inválida para ${sourceName}: "${row.quantity}".`);
            }
            if (!category) throw new Error(`Categoria ausente para ${sourceName}.`);
            return { sourceName, name, quantity, category };
        });

    const names = new Set();
    for (const row of parsed) {
        if (names.has(row.name)) throw new Error(`Cabo duplicado no PDF: ${row.name}.`);
        names.add(row.name);
    }
    return parsed;
}

function openDatabase(filePath, mode = sqlite3.OPEN_READWRITE) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(filePath, mode, (error) => error ? reject(error) : resolve(db));
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
        db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
    });
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || []));
    });
}

function close(db) {
    return new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
}

function backupDatabase(db, destinationPath) {
    return new Promise((resolve, reject) => {
        let backup;
        backup = db.backup(destinationPath, (initializeError) => {
            if (initializeError) return reject(initializeError);
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `database-${timestamp}-antes-importar-cabos-manutencao.db`);
    const source = await openDatabase(databasePath, sqlite3.OPEN_READONLY);
    try {
        await backupDatabase(source, backupPath);
    } finally {
        await close(source);
    }

    const backup = await openDatabase(backupPath, sqlite3.OPEN_READONLY);
    try {
        const integrity = await get(backup, 'PRAGMA integrity_check');
        if (String(integrity?.integrity_check || '').toLowerCase() !== 'ok') {
            throw new Error('O backup falhou na verificação de integridade.');
        }
    } finally {
        await close(backup);
    }
    return backupPath;
}

async function buildPlan(rows) {
    const db = await openDatabase(databasePath, sqlite3.OPEN_READONLY);
    try {
        const plan = [];
        for (const row of rows) {
            const cable = await get(
                db,
                'SELECT id, name, quantity, available_quantity, category FROM cables WHERE upper(name) = upper(?)',
                [row.name]
            );
            if (!cable) throw new Error(`Cabo do PDF não encontrado no estoque: ${row.sourceName}.`);
            plan.push({
                ...row,
                cable,
                categoryMismatch: normalize(cable.category) !== row.category
            });
        }
        return plan;
    } finally {
        await close(db);
    }
}

async function applyPlan(plan) {
    const db = await openDatabase(databasePath);
    try {
        await run(db, 'ALTER TABLE cable_maintenances ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1').catch(() => {});
        await run(db, 'BEGIN IMMEDIATE TRANSACTION');
        try {
            for (const item of plan) {
                const active = await get(
                    db,
                    `SELECT COALESCE(SUM(quantity), 0) AS quantity
                     FROM cable_maintenances
                     WHERE cable_id = ? AND resolved_at IS NULL`,
                    [item.cable.id]
                );
                if (Number(active?.quantity || 0) > 0) {
                    throw new Error(`${item.name} já possui manutenção ativa no banco.`);
                }

                await run(
                    db,
                    `UPDATE cables
                     SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [item.quantity, item.cable.id]
                );
                await run(
                    db,
                    `INSERT INTO cable_maintenances (cable_id, description, quantity, created_at)
                     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                    [item.cable.id, maintenanceDescription, item.quantity]
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

function escapeSql(value) {
    return String(value).replace(/'/g, "''");
}

function buildSql(plan) {
    const lines = [
        '-- Importa cabos adicionais e os registra como indisponíveis por manutenção.',
        '-- Faça backup do D1 antes de executar.',
        ''
    ];
    for (const item of plan) {
        const name = escapeSql(item.name);
        lines.push(`UPDATE cables SET quantity = quantity + ${item.quantity}, updated_at = CURRENT_TIMESTAMP WHERE name = '${name}';`);
        lines.push(
            `INSERT INTO cable_maintenances (cable_id, description, quantity, created_at) `
            + `SELECT id, '${maintenanceDescription}', ${item.quantity}, CURRENT_TIMESTAMP FROM cables WHERE name = '${name}';`
        );
    }
    return `${lines.join('\n')}\n`;
}

function buildReport(plan, backupPath) {
    const lines = [
        '# Relatório de Importação de Cabos em Manutenção',
        '',
        `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
        `PDF: ${pdfPath}`,
        `Backup: ${backupPath || 'não criado (modo de conferência)'}`,
        `Modo: ${dryRun ? 'conferência' : 'importação aplicada no banco local'}`,
        '',
        `- Tipos de cabo: ${plan.length}`,
        `- Unidades adicionadas ao estoque geral: ${plan.reduce((total, item) => total + item.quantity, 0)}`,
        `- Unidades registradas em manutenção: ${plan.reduce((total, item) => total + item.quantity, 0)}`,
        '',
        '| Nome no PDF | Cabo no banco | Categoria do estoque | Categoria no PDF | Quantidade | Estoque inicial anterior | Estoque inicial novo |',
        '|---|---|---|---|---:|---:|---:|'
    ];
    for (const item of plan) {
        lines.push(
            `| ${item.sourceName} | ${item.name} | ${item.cable.category} | ${item.category} | ${item.quantity} `
            + `| ${item.cable.quantity} | ${Number(item.cable.quantity) + item.quantity} |`
        );
    }
    lines.push('');
    return `${lines.join('\n')}\n`;
}

async function main() {
    if (!fs.existsSync(pdfPath)) throw new Error(`PDF não encontrado: ${pdfPath}`);
    if (!fs.existsSync(databasePath)) throw new Error(`Banco local não encontrado: ${databasePath}`);

    const rows = parseRows(fs.readFileSync(pdfPath));
    if (!rows.length) throw new Error('Nenhum cabo em manutenção foi encontrado no PDF.');
    const plan = await buildPlan(rows);
    const backupPath = dryRun ? '' : await createBackup();
    if (!dryRun) await applyPlan(plan);

    fs.writeFileSync(sqlPath, buildSql(plan), 'utf8');
    fs.writeFileSync(reportPath, buildReport(plan, backupPath), 'utf8');
    console.log(`Tipos de cabo: ${plan.length}`);
    console.log(`Unidades em manutenção: ${plan.reduce((total, item) => total + item.quantity, 0)}`);
    console.log(`Modo: ${dryRun ? 'conferência' : 'importação aplicada'}`);
    if (backupPath) console.log(`Backup SQLite: ${backupPath}`);
    console.log(`Relatório: ${reportPath}`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
}

module.exports = { parseRows };
