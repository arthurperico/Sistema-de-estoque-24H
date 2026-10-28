const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const databaseName = String(process.env.D1_DATABASE_NAME || 'sistema-estoque-24h').trim();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDirectory = path.join(projectRoot, 'backups', 'd1');
const backupPath = path.join(backupDirectory, `${databaseName}-${timestamp}.sql`);
const wranglerEntry = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

fs.mkdirSync(backupDirectory, { recursive: true });

const result = spawnSync(
    process.execPath,
    [wranglerEntry, 'd1', 'export', databaseName, '--remote', '--output', backupPath],
    { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error || result.status !== 0) {
    if (fs.existsSync(backupPath) && fs.statSync(backupPath).size === 0) {
        fs.rmSync(backupPath);
    }
    throw result.error || new Error(`Wrangler encerrou com código ${result.status}`);
}

if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size === 0) {
    throw new Error('O export do D1 terminou sem produzir um backup válido');
}

const sha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(backupPath))
    .digest('hex')
    .toUpperCase();

console.log(`Backup D1: ${backupPath}`);
console.log(`Tamanho: ${fs.statSync(backupPath).size} bytes`);
console.log(`SHA256: ${sha256}`);
