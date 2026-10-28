const sqlite3 = require('sqlite3').verbose();

const databasePath = process.env.PERF_DATABASE || '.codex-local/perf-before.db';
const mode = process.argv[2] || 'inspect';

function openDatabase() {
    return new sqlite3.Database(databasePath);
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows || [])));
    });
}

function run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(error) {
            if (error) reject(error);
            else resolve({ changes: this.changes, lastID: this.lastID });
        });
    });
}

function close(db) {
    return new Promise((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));
}

async function inspect() {
    const db = openDatabase();
    try {
        const users = await all(db, 'SELECT id, username, role FROM users ORDER BY id');
        const equipments = await all(db, "SELECT id, name, barcode, current_status FROM equipments WHERE name LIKE '%PERF%' OR barcode LIKE '%PERF%'");
        const events = await all(db, "SELECT id, name, date, end_date FROM events WHERE name LIKE '%PERF%'");
        const cables = await all(db, "SELECT id, name, quantity, available_quantity FROM cables WHERE name LIKE '%PERF%'");
        const otherItems = await all(db, "SELECT id, name, quantity, available_quantity FROM other_items WHERE name LIKE '%PERF%'");
        console.log(JSON.stringify({ users, equipments, events, cables, otherItems }, null, 2));
    } finally {
        await close(db);
    }
}

async function counts() {
    const db = openDatabase();
    try {
        const rows = await all(
            db,
            `SELECT
                (SELECT COUNT(*) FROM equipments) AS equipments,
                (SELECT COUNT(*) FROM equipments WHERE lower(current_status) LIKE '%indispon%') AS unavailableEquipments,
                (SELECT COUNT(*) FROM equipment_events) AS equipmentMovements,
                (SELECT COUNT(*) FROM cables) AS cables,
                (SELECT COALESCE(SUM(quantity), 0) FROM cables) AS cableTotal,
                (SELECT COALESCE(SUM(available_quantity), 0) FROM cables) AS cableAvailable,
                (SELECT COUNT(*) FROM cable_event_movements) AS cableMovements,
                (SELECT COUNT(*) FROM other_items) AS otherItems,
                (SELECT COALESCE(SUM(quantity), 0) FROM other_items) AS otherTotal,
                (SELECT COALESCE(SUM(available_quantity), 0) FROM other_items) AS otherAvailable,
                (SELECT COUNT(*) FROM other_item_event_movements) AS otherMovements,
                (SELECT COUNT(*) FROM events) AS events,
                (SELECT COUNT(*) FROM quotes) AS quotes,
                (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM operators) AS operators,
                (SELECT COUNT(*) FROM event_spaces) AS eventSpaces,
                (SELECT COUNT(*) FROM event_reserved_equipments) AS reservations`
        );
        console.log(JSON.stringify(rows[0] || {}, null, 2));
    } finally {
        await close(db);
    }
}

async function prepare() {
    const username = String(process.env.PERF_USERNAME || '').trim();
    if (!username) throw new Error('PERF_USERNAME is required');
    const db = openDatabase();
    try {
        const now = new Date();
        const start = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const end = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await run(db, "UPDATE users SET role = 'user' WHERE username = ?", [username]);
        await run(db, "DELETE FROM equipment_events WHERE event_id IN (SELECT id FROM events WHERE name LIKE '%PERF%')");
        await run(db, "DELETE FROM cable_event_movements WHERE event_id IN (SELECT id FROM events WHERE name LIKE '%PERF%')");
        await run(db, "DELETE FROM other_item_event_movements WHERE event_id IN (SELECT id FROM events WHERE name LIKE '%PERF%')");
        await run(db, "DELETE FROM event_reserved_equipments WHERE event_id IN (SELECT id FROM events WHERE name LIKE '%PERF%')");
        await run(db, "UPDATE equipments SET current_status = 'Disponivel' WHERE name LIKE '%PERF%' OR barcode LIKE '%PERF%'");
        await run(db, "UPDATE cables SET available_quantity = quantity WHERE name LIKE '%PERF%'");
        await run(db, "UPDATE other_items SET available_quantity = quantity WHERE name LIKE '%PERF%'");
        await run(db, "UPDATE events SET date = ?, end_date = ?, created_by_username = ? WHERE name LIKE '%PERF%'", [start, end, username]);
        console.log(JSON.stringify({ prepared: true, username, start, end }));
    } finally {
        await close(db);
    }
}

async function removeDraftIndexes() {
    const db = openDatabase();
    const indexNames = [
        'idx_equipment_events_equipment_event_created_id',
        'idx_equipment_events_equipment_action_event',
        'idx_equipment_events_lookup_space',
        'idx_maintenances_equipment_resolved_created_id',
        'idx_cable_maintenances_cable_resolved_created_id'
    ];
    try {
        for (const indexName of indexNames) {
            await run(db, `DROP INDEX IF EXISTS ${indexName}`);
        }
        console.log(JSON.stringify({ removedDraftIndexes: indexNames }));
    } finally {
        await close(db);
    }
}

async function timeRequest(url, options = {}) {
    const startedAt = performance.now();
    const response = await fetch(url, options);
    const body = await response.text();
    const elapsedMs = performance.now() - startedAt;
    let data = null;
    try {
        data = JSON.parse(body);
    } catch {
        data = body;
    }
    return { ok: response.ok, status: response.status, elapsedMs, data };
}

function summarize(values) {
    const sorted = values.slice().sort((left, right) => left - right);
    const average = sorted.reduce((sum, value) => sum + value, 0) / Math.max(sorted.length, 1);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    return {
        count: sorted.length,
        averageMs: Number(average.toFixed(2)),
        medianMs: Number(median.toFixed(2)),
        minMs: Number((sorted[0] || 0).toFixed(2)),
        maxMs: Number((sorted.at(-1) || 0).toFixed(2))
    };
}

async function measure() {
    const baseUrl = String(process.env.PERF_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
    const username = String(process.env.PERF_USERNAME || '').trim();
    const password = String(process.env.PERF_PASSWORD || '');
    if (!username || !password) throw new Error('PERF_USERNAME and PERF_PASSWORD are required');

    const login = await timeRequest(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!login.ok) throw new Error(`Login failed (${login.status}): ${JSON.stringify(login.data)}`);
    const cookie = login.data?.cookie || null;

    // Express returns the cookie in the response header, not the JSON body.
    const rawLogin = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!rawLogin.ok) throw new Error(`Second login failed (${rawLogin.status})`);
    const authCookie = rawLogin.headers.get('set-cookie')?.split(';')[0] || cookie;
    if (!authCookie) throw new Error('Session cookie was not returned');

    const headers = { Cookie: authCookie, 'Content-Type': 'application/json' };
    const fixtureRequests = await Promise.all([
        timeRequest(`${baseUrl}/api/equipments?search=PERF`, { headers }),
        timeRequest(`${baseUrl}/api/events`, { headers }),
        timeRequest(`${baseUrl}/api/cables?search=PERF`, { headers }),
        timeRequest(`${baseUrl}/api/other-items?search=PERF`, { headers })
    ]);
    for (const request of fixtureRequests) {
        if (!request.ok) throw new Error(`Fixture request failed (${request.status}): ${JSON.stringify(request.data)}`);
    }

    const equipment = fixtureRequests[0].data.find((item) => String(item.name).includes('PERF'));
    const event = fixtureRequests[1].data.find((item) => String(item.name || item.event_name || item.eventName).includes('PERF'));
    const cable = fixtureRequests[2].data.find((item) => String(item.name).includes('PERF'));
    const otherItem = fixtureRequests[3].data.find((item) => String(item.name).includes('PERF'));
    if (!equipment || !event || !cable || !otherItem) {
        throw new Error(`Performance fixtures were not found: ${JSON.stringify({
            equipment: !!equipment,
            event: !!event,
            cable: !!cable,
            otherItem: !!otherItem,
            equipmentRows: Array.isArray(fixtureRequests[0].data) ? fixtureRequests[0].data.length : null,
            eventRows: Array.isArray(fixtureRequests[1].data) ? fixtureRequests[1].data.length : null,
            eventSamples: Array.isArray(fixtureRequests[1].data) ? fixtureRequests[1].data.map((item) => ({ id: item.id, name: item.name, event_name: item.event_name, eventName: item.eventName })) : null,
            cableRows: Array.isArray(fixtureRequests[2].data) ? fixtureRequests[2].data.length : null,
            otherRows: Array.isArray(fixtureRequests[3].data) ? fixtureRequests[3].data.length : null
        })}`);
    }

    const measurements = {
        equipmentSaida: [],
        equipmentEntrada: [],
        cableSaida: [],
        cableEntrada: [],
        otherSaida: [],
        otherEntrada: [],
        equipmentList: []
    };

    for (let index = 0; index < 10; index += 1) {
        const saida = await timeRequest(`${baseUrl}/api/equipment-events/saida`, {
            method: 'POST', headers, body: JSON.stringify({ equipmentId: equipment.id, eventId: event.id })
        });
        if (!saida.ok) throw new Error(`Equipment saida failed (${saida.status}): ${JSON.stringify(saida.data)}`);
        measurements.equipmentSaida.push(saida.elapsedMs);

        const entrada = await timeRequest(`${baseUrl}/api/equipment-events/entrada`, {
            method: 'POST', headers, body: JSON.stringify({ equipmentId: equipment.id, eventId: event.id })
        });
        if (!entrada.ok) throw new Error(`Equipment entrada failed (${entrada.status}): ${JSON.stringify(entrada.data)}`);
        measurements.equipmentEntrada.push(entrada.elapsedMs);
    }

    for (let index = 0; index < 8; index += 1) {
        const cableSaida = await timeRequest(`${baseUrl}/api/cable-events/saida`, {
            method: 'POST', headers, body: JSON.stringify({ cableId: cable.id, eventId: event.id, quantity: 1 })
        });
        if (!cableSaida.ok) throw new Error(`Cable saida failed (${cableSaida.status}): ${JSON.stringify(cableSaida.data)}`);
        measurements.cableSaida.push(cableSaida.elapsedMs);

        const cableEntrada = await timeRequest(`${baseUrl}/api/cable-events/entrada`, {
            method: 'POST', headers, body: JSON.stringify({ cableId: cable.id, eventId: event.id, quantity: 1 })
        });
        if (!cableEntrada.ok) throw new Error(`Cable entrada failed (${cableEntrada.status}): ${JSON.stringify(cableEntrada.data)}`);
        measurements.cableEntrada.push(cableEntrada.elapsedMs);

        const otherSaida = await timeRequest(`${baseUrl}/api/other-item-events/saida`, {
            method: 'POST', headers, body: JSON.stringify({ itemId: otherItem.id, eventId: event.id, quantity: 1 })
        });
        if (!otherSaida.ok) throw new Error(`Other saida failed (${otherSaida.status}): ${JSON.stringify(otherSaida.data)}`);
        measurements.otherSaida.push(otherSaida.elapsedMs);

        const otherEntrada = await timeRequest(`${baseUrl}/api/other-item-events/entrada`, {
            method: 'POST', headers, body: JSON.stringify({ itemId: otherItem.id, eventId: event.id, quantity: 1 })
        });
        if (!otherEntrada.ok) throw new Error(`Other entrada failed (${otherEntrada.status}): ${JSON.stringify(otherEntrada.data)}`);
        measurements.otherEntrada.push(otherEntrada.elapsedMs);
    }

    for (let index = 0; index < 10; index += 1) {
        const listing = await timeRequest(`${baseUrl}/api/equipments?search=`, { headers });
        if (!listing.ok) throw new Error(`Equipment listing failed (${listing.status})`);
        measurements.equipmentList.push(listing.elapsedMs);
    }

    const summary = Object.fromEntries(Object.entries(measurements).map(([key, values]) => [key, summarize(values)]));
    console.log(JSON.stringify(summary, null, 2));
}

(async () => {
    if (mode === 'inspect') await inspect();
    else if (mode === 'counts') await counts();
    else if (mode === 'prepare') await prepare();
    else if (mode === 'remove-draft-indexes') await removeDraftIndexes();
    else if (mode === 'measure') await measure();
    else throw new Error(`Unknown mode: ${mode}`);
})().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
});
