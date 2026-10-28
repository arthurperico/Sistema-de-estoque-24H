const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const root = __dirname;
const source = path.join(root, 'database.db');
const backupDir = path.join(root, 'backups');

function timestampForFile(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-');
}

fs.mkdirSync(backupDir, { recursive: true });

const dest = path.join(backupDir, `emergency-db-${timestampForFile()}.db`);
const sqliteDest = dest.replace(/\\/g, '/').replace(/'/g, "''");
const db = new sqlite3.Database(source);

db.exec(`VACUUM INTO '${sqliteDest}'`, (error) => {
    if (error) {
        console.error(`${new Date().toISOString()} ${error.message}`);
        process.exitCode = 1;
    } else {
        console.log(`${new Date().toISOString()} ${dest}`);
    }

    db.close();
});
