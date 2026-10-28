import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sqlite3Package from 'sqlite3';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const dashboardHtml = read('html/dashboard.html');
const dashboardJs = read('javascript/dashboard.js');
const workerSource = read('src/worker.mjs');
const serverSource = read('server.js');

function sourceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `marcador inicial ausente: ${startMarker}`);
    assert.ok(end > start, `marcador final ausente: ${endMarker}`);
    return source.slice(start, end);
}

function trackerRoute(source, isWorker) {
    return sourceBetween(
        source,
        isWorker
            ? "if (pathname === '/api/equipment-tracker'"
            : "app.get('/api/equipment-tracker'",
        isWorker
            ? "if (pathname === '/api/rental-return-alerts'"
            : "app.get('/api/scheduled-events'"
    );
}

test('a aba do rastreador fica disponível para operadores e administradores', () => {
    assert.match(dashboardHtml, /showSection\('rastreadorEquipamentos'\)/);
    assert.match(dashboardHtml, /id="equipmentTrackerInput"/);
    assert.match(dashboardHtml, /Patrimônio ou nome do equipamento/);

    const adminSections = sourceBetween(
        dashboardJs,
        'const ADMIN_ALLOWED_SECTIONS',
        'const USER_ALLOWED_SECTIONS'
    );
    const userSections = sourceBetween(
        dashboardJs,
        'const USER_ALLOWED_SECTIONS',
        'const COMMERCIAL_ALLOWED_SECTIONS'
    );
    assert.match(adminSections, /'rastreadorEquipamentos'/);
    assert.match(userSections, /'rastreadorEquipamentos'/);
});

for (const [name, source, isWorker] of [
    ['servidor local', serverSource, false],
    ['Cloudflare Worker', workerSource, true]
]) {
    test(`${name}: consulta somente saídas e não descarta registros que receberam entrada`, () => {
        const route = trackerRoute(source, isWorker);

        assert.match(route, /FROM equipment_events outgoing/);
        assert.match(route, /WHERE outgoing\.action_type = 'saida'/);
        assert.match(route, /INNER JOIN events ON events\.id = outgoing\.event_id/);
        assert.match(route, /COUNT\(outgoing\.id\) AS outgoingCount/);
        assert.match(route, /ledger\.action_type = 'saida' THEN 1 ELSE -1/);
        assert.doesNotMatch(route, /HAVING[\s\S]*activeBalance/);
        assert.doesNotMatch(route, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
    });
}

test('cada evento encontrado oferece Gerenciar, inclusive locações', () => {
    assert.match(dashboardJs, /\? `\/event\.html\?id=\$\{trackedEvent\.id\}&type=rental`/);
    assert.match(dashboardJs, />Gerenciar<\/button>/);
});

test('a consulta retorna evento finalizado e evento em andamento para o mesmo patrimônio', async () => {
    const route = trackerRoute(workerSource, true);
    const sqlMatch = route.match(/const matches = await queryAll\(\s*env,\s*`([\s\S]*?)`,\s*\[searchPattern, normalizedBarcode\]/);
    assert.ok(sqlMatch, 'SQL do rastreador não encontrado no Worker');
    const trackerSql = new Function(`return \`${sqlMatch[1]}\`;`)();

    const sqlite3 = sqlite3Package.verbose();
    const db = new sqlite3.Database(':memory:');
    const exec = (sql) => new Promise((resolve, reject) => {
        db.exec(sql, (error) => error ? reject(error) : resolve());
    });
    const all = (sql, params) => new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
    });
    const close = () => new Promise((resolve, reject) => {
        db.close((error) => error ? reject(error) : resolve());
    });

    try {
        await exec(`
            CREATE TABLE equipments (id INTEGER PRIMARY KEY, name TEXT, barcode TEXT);
            CREATE TABLE events (
                id INTEGER PRIMARY KEY,
                name TEXT,
                date TEXT,
                end_date TEXT,
                event_type TEXT,
                withdrawal_date TEXT,
                return_date TEXT,
                created_by_username TEXT
            );
            CREATE TABLE equipment_events (
                id INTEGER PRIMARY KEY,
                equipment_id INTEGER,
                event_id INTEGER,
                action_type TEXT,
                created_at TEXT
            );

            INSERT INTO equipments VALUES (1, 'Projetor principal', '0007');
            INSERT INTO events VALUES (1, 'Evento encerrado', '2026-01-10', '2026-01-10', 'event', NULL, NULL, 'operador');
            INSERT INTO events VALUES (2, 'Locação em andamento', '2026-02-10', NULL, 'rental', '2026-02-10', '2026-02-12', 'operador');
            INSERT INTO events VALUES (3, 'Evento sem saída', '2026-03-10', '2026-03-10', 'event', NULL, NULL, 'operador');

            INSERT INTO equipment_events VALUES (1, 1, 1, 'saida', '2026-01-10 08:00:00');
            INSERT INTO equipment_events VALUES (2, 1, 1, 'entrada', '2026-01-10 18:00:00');
            INSERT INTO equipment_events VALUES (3, 1, 2, 'saida', '2026-02-10 08:00:00');
            INSERT INTO equipment_events VALUES (4, 1, 3, 'entrada', '2026-03-10 08:00:00');
        `);

        const rows = await all(trackerSql, ['%sem correspondência no nome%', '0007']);
        assert.deepEqual(rows.map((row) => row.eventId).sort(), [1, 2]);
        assert.equal(rows.find((row) => row.eventId === 1).activeBalance, 0);
        assert.equal(rows.find((row) => row.eventId === 2).activeBalance, 1);
    } finally {
        await close();
    }
});
