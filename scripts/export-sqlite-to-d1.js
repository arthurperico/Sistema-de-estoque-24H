const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const projectRoot = path.resolve(__dirname, '..');
const sourceDbPath = path.join(projectRoot, 'banco de dados', 'database.db');
const outputPath = path.resolve(projectRoot, process.argv[2] || path.join('banco de dados', 'd1-export.sql'));

const tableOrder = [
    'users',
    'equipments',
    'events',
    'equipment_events',
    'cable_event_movements',
    'maintenances',
    'cables',
    'cable_maintenances',
    'other_items',
    'other_item_event_movements'
];

function openDatabase(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(db);
        });
    });
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows || []);
        });
    });
}

function close(db) {
    return new Promise((resolve, reject) => {
        db.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

function escapeSqlValue(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    return `'${String(value).replace(/'/g, "''")}'`;
}

async function tableExists(db, tableName) {
    const row = await all(
        db,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        [tableName]
    );
    return row.length > 0;
}

async function exportTable(db, tableName) {
    if (!(await tableExists(db, tableName))) {
        return [];
    }

    const rows = await all(db, `SELECT * FROM ${tableName}`);
    if (rows.length === 0) {
        return [];
    }

    const columns = Object.keys(rows[0]);
    const statements = [];

    rows.forEach((row) => {
        const values = columns.map((column) => escapeSqlValue(row[column]));
        statements.push(
            `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`
        );
    });

    return statements;
}

async function main() {
    if (!fs.existsSync(sourceDbPath)) {
        throw new Error(`Banco SQLite não encontrado em ${sourceDbPath}`);
    }

    const db = await openDatabase(sourceDbPath);

    try {
        const lines = [
            '-- Arquivo gerado para importar os dados atuais do SQLite para o Cloudflare D1.',
            '-- Execute este arquivo com: npx wrangler d1 execute <NOME_DO_BANCO> --remote --file "banco de dados/d1-export.sql"',
            '',
            'DELETE FROM sessions;',
            'DELETE FROM cable_event_movements;',
            'DELETE FROM other_item_event_movements;',
            'DELETE FROM equipment_events;',
            'DELETE FROM maintenances;',
            'DELETE FROM events;',
            'DELETE FROM equipments;',
            'DELETE FROM cable_maintenances;',
            'DELETE FROM cables;',
            'DELETE FROM other_items;',
            'DELETE FROM users;',
            ''
        ];

        for (const tableName of tableOrder) {
            const statements = await exportTable(db, tableName);
            if (statements.length > 0) {
                lines.push(`-- ${tableName}`);
                lines.push(...statements);
                lines.push('');
            }
        }
        fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
        console.log(`Arquivo de exportação criado em ${outputPath}`);
    } finally {
        await close(db);
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
