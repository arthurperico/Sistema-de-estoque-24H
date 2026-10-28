const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const projectRoot = path.resolve(__dirname, '..');
const sourceDbPath = path.join(projectRoot, 'banco de dados', 'database.db');
const backupDir = path.join(projectRoot, 'backups', 'sqlite');
const reason = String(process.argv[2] || 'manual').trim() || 'manual';

function timestampForFile(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-');
}

function openDatabase(filePath, mode) {
    return new Promise((resolve, reject) => {
        const database = new sqlite3.Database(filePath, mode, (error) => {
            if (error) reject(error);
            else resolve(database);
        });
    });
}

function closeDatabase(database) {
    return new Promise((resolve, reject) => {
        database.close((error) => (error ? reject(error) : resolve()));
    });
}

function backupDatabase(database, destinationPath) {
    return new Promise((resolve, reject) => {
        let backup;
        backup = database.backup(destinationPath, (initializeError) => {
            if (initializeError) {
                reject(initializeError);
                return;
            }

            backup.step(-1, (stepError, completed) => {
                backup.finish(() => {
                    if (stepError) reject(stepError);
                    else if (!completed) reject(new Error('O backup SQLite não foi concluído'));
                    else resolve();
                });
            });
        });
    });
}

function integrityCheck(database) {
    return new Promise((resolve, reject) => {
        database.get('PRAGMA integrity_check', (error, row) => {
            if (error) reject(error);
            else resolve(String(row?.integrity_check || '').toLowerCase() === 'ok');
        });
    });
}

async function main() {
    if (!fs.existsSync(sourceDbPath)) {
        throw new Error(`Banco SQLite não encontrado em ${sourceDbPath}`);
    }

    await fs.promises.mkdir(backupDir, { recursive: true });
    const backupName = `database-${timestampForFile()}-${reason.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)}.db`;
    const backupPath = path.join(backupDir, backupName);

    try {
        const source = await openDatabase(sourceDbPath, sqlite3.OPEN_READONLY);
        source.configure('busyTimeout', 10_000);
        try {
            await backupDatabase(source, backupPath);
        } finally {
            await closeDatabase(source);
        }

        const backup = await openDatabase(backupPath, sqlite3.OPEN_READONLY);
        let valid;
        try {
            valid = await integrityCheck(backup);
        } finally {
            await closeDatabase(backup);
        }

        if (!valid) {
            throw new Error('O backup SQLite falhou na verificação de integridade');
        }
    } catch (error) {
        await fs.promises.rm(backupPath, { force: true });
        throw error;
    }

    console.log(`Backup SQLite íntegro criado em ${backupPath}`);
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
