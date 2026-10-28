import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    ensureAutomaticScheduledEvents,
    getEventEquipmentRequirements,
    handleQuoteRequest
} from '../src/worker-quotes.mjs';

const sqlite3 = createRequire(import.meta.url)('sqlite3');
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');

function createMemoryDatabase() {
    const connection = new sqlite3.Database(':memory:');
    const run = (sql, params = []) => new Promise((resolve, reject) => {
        connection.run(sql, params, function onRun(error) {
            if (error) return reject(error);
            resolve({ meta: { changes: Number(this.changes) || 0, last_row_id: Number(this.lastID) || 0 } });
        });
    });
    const all = (sql, params = []) => new Promise((resolve, reject) => {
        connection.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
    });
    const first = (sql, params = []) => new Promise((resolve, reject) => {
        connection.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null));
    });
    const batch = async (operations = []) => {
        await run('BEGIN IMMEDIATE');
        try {
            const results = [];
            for (const operation of operations) results.push(await run(operation.sql, operation.params || []));
            await run('COMMIT');
            return results;
        } catch (error) {
            await run('ROLLBACK').catch(() => {});
            throw error;
        }
    };
    const close = () => new Promise((resolve, reject) => {
        connection.close((error) => error ? reject(error) : resolve());
    });
    return { run, all, first, batch, close };
}

function createHelpers(database) {
    return {
        queryAll: (_env, sql, params) => database.all(sql, params),
        queryFirst: (_env, sql, params) => database.first(sql, params),
        execute: (_env, sql, params) => database.run(sql, params),
        batch: (_env, operations) => database.batch(operations)
    };
}

function getSaoPauloDateKey(dayOffset = 0) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const baseDate = new Date();
    baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
    const parts = Object.fromEntries(formatter.formatToParts(baseDate).map((part) => [part.type, part.value]));
    return `${parts.day}/${parts.month}/${parts.year}`;
}

async function initializeApprovalSchema(database) {
    const statements = [
        `CREATE TABLE quotes (
            id INTEGER PRIMARY KEY, proposal_city TEXT, proposal_date TEXT, client_name TEXT,
            event_name TEXT, event_location TEXT, event_datetime TEXT, assembly_datetime TEXT,
            disassembly_datetime TEXT, payment_method TEXT, payment_deadline TEXT,
            logistics_price REAL DEFAULT 0, technicians_price REAL DEFAULT 0,
            subtotal REAL DEFAULT 0, final_total REAL DEFAULT 0, show_item_prices INTEGER DEFAULT 0,
            notes TEXT, status TEXT DEFAULT 'pending', approved_at TEXT,
            created_by_username TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE quote_items (
            id INTEGER PRIMARY KEY, quote_id INTEGER, equipment_id INTEGER, is_manual INTEGER DEFAULT 0,
            is_service INTEGER DEFAULT 0, service_id TEXT, service_width REAL, service_height REAL,
            category TEXT, description TEXT, quantity INTEGER, daily_units INTEGER,
            internal_unit_price REAL, internal_total REAL, sort_order INTEGER
        )`,
        `CREATE TABLE quote_technicians (
            id INTEGER PRIMARY KEY, quote_id INTEGER, operator_id INTEGER, operator_name TEXT,
            daily_units INTEGER, cache_value REAL, paid_at TEXT, paid_by_username TEXT, sort_order INTEGER
        )`,
        `CREATE TABLE quote_operational_destinations (
            quote_id INTEGER PRIMARY KEY, destination_type TEXT NOT NULL,
            selected_by_username TEXT, selected_at TEXT, updated_at TEXT
        )`,
        `CREATE TABLE events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, date TEXT, end_date TEXT,
            created_by_username TEXT, event_type TEXT, withdrawal_date TEXT, return_date TEXT,
            orcamento_id INTEGER UNIQUE, auto_created_at TEXT
        )`,
        'CREATE TABLE equipment_events (id INTEGER PRIMARY KEY, event_id INTEGER, equipment_id INTEGER)',
        'CREATE TABLE cable_event_movements (id INTEGER PRIMARY KEY, event_id INTEGER)',
        'CREATE TABLE other_item_event_movements (id INTEGER PRIMARY KEY, event_id INTEGER)',
        'CREATE TABLE quote_manual_item_movements (id INTEGER PRIMARY KEY, event_id INTEGER)'
    ];
    for (const statement of statements) await database.run(statement);
    await database.run(
        `INSERT INTO quotes (
            id, proposal_city, proposal_date, client_name, event_name, event_location,
            event_datetime, assembly_datetime, disassembly_datetime, payment_method,
            payment_deadline, status, created_by_username
         ) VALUES (1, 'Belo Horizonte', '2026-08-19', 'Cliente', 'Feira', 'Pavilhão',
                   '22/08/2026', '21/08/2026', '23/08/2026', 'PIX', 'À vista', 'pending', 'comercial')`
    );
}

test('aprovação exige o destino e cria imediatamente uma locação vinculada ao orçamento', async (t) => {
    const database = createMemoryDatabase();
    t.after(() => database.close());
    await initializeApprovalSchema(database);
    const helpers = createHelpers(database);

    const request = new Request('https://example.com/api/orcamentos/1/pronto', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationType: 'rental' })
    });
    const response = await handleQuoteRequest({
        request,
        env: {},
        session: { role: 'comercial', username: 'vendas' },
        url: new URL(request.url),
        helpers
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.destinationType, 'rental');
    assert.equal((await database.first('SELECT status FROM quotes WHERE id = 1')).status, 'approved');
    assert.deepEqual(
        await database.first(
            `SELECT event_type AS eventType, date, end_date AS endDate,
                    withdrawal_date AS withdrawalDate, return_date AS returnDate,
                    orcamento_id AS quoteId
             FROM events WHERE orcamento_id = 1`
        ),
        {
            eventType: 'rental',
            date: '2026-08-21',
            endDate: '2026-08-23',
            withdrawalDate: '2026-08-21',
            returnDate: '2026-08-23',
            quoteId: 1
        }
    );
});

test('automação cria eventos em andamento e agendados sem limite de sete dias', async (t) => {
    const database = createMemoryDatabase();
    t.after(() => database.close());
    await initializeApprovalSchema(database);
    const helpers = createHelpers(database);

    const ongoingStart = getSaoPauloDateKey(-1);
    const ongoingEnd = getSaoPauloDateKey(1);
    const futureStart = getSaoPauloDateKey(30);
    const futureEnd = getSaoPauloDateKey(31);
    const endedStart = getSaoPauloDateKey(-10);
    const endedEnd = getSaoPauloDateKey(-8);

    await database.run(
        `UPDATE quotes
         SET status = 'approved', approved_at = CURRENT_TIMESTAMP,
             event_name = 'Evento em andamento', assembly_datetime = ?,
             event_datetime = ?, disassembly_datetime = ?
         WHERE id = 1`,
        [ongoingStart, ongoingStart, ongoingEnd]
    );
    await database.run(
        `INSERT INTO quotes (
            id, client_name, event_name, event_datetime, assembly_datetime,
            disassembly_datetime, status, approved_at, created_by_username
         ) VALUES (2, 'Cliente futuro', 'Evento agendado distante', ?, ?, ?,
                   'approved', CURRENT_TIMESTAMP, 'comercial')`,
        [futureStart, futureStart, futureEnd]
    );
    await database.run(
        `INSERT INTO quotes (
            id, client_name, event_name, event_datetime, assembly_datetime,
            disassembly_datetime, status, approved_at, created_by_username
         ) VALUES (3, 'Cliente passado', 'Evento encerrado', ?, ?, ?,
                   'approved', CURRENT_TIMESTAMP, 'comercial')`,
        [endedStart, endedStart, endedEnd]
    );

    await ensureAutomaticScheduledEvents({}, helpers);

    assert.deepEqual(
        await database.all('SELECT orcamento_id AS quoteId FROM events ORDER BY orcamento_id'),
        [{ quoteId: 1 }, { quoteId: 2 }]
    );
});

test('ordem de serviço soma por tópico e não expõe o modelo selecionado como nome da linha', async () => {
    const requestedRows = [
        { quantity: 1, topicName: 'Microfone sem fio', description: 'MICROFONE SENNHEISER', equipmentName: 'MICROFONE SENNHEISER' },
        { quantity: 1, topicName: 'Microfone sem fio', description: 'MICROFONE SENNHEISER', equipmentName: 'MICROFONE SENNHEISER' }
    ];
    const movementRows = [{
        equipmentId: 10,
        equipmentName: 'MICROFONE SENNHEISER',
        topicName: 'Microfone sem fio',
        activeBalance: 1,
        totalOutgoing: 1
    }];
    const inventoryRows = [1, 2, 3].map((id) => ({
        id,
        name: 'MICROFONE SENNHEISER',
        topicName: 'Microfone sem fio',
        currentStatus: 'Disponivel',
        maintenanceOpen: 0,
        activeBalance: id === 1 ? 1 : 0
    }));
    const helpers = {
        queryFirst: async () => ({ id: 5, orcamento_id: 1, date: '2026-08-21', end_date: '2026-08-23', event_type: 'event' }),
        queryAll: async (_env, sql) => {
            if (sql.includes('FROM quote_items')) {
                assert.match(
                    sql,
                    /COALESCE\(NULLIF\(TRIM\(COALESCE\(NULLIF\(TRIM\(equipments\.quote_category\), ''\), equipments\.category\)\), ''\), quote_items\.category\) AS topicName/
                );
                return requestedRows;
            }
            if (sql.includes('FROM equipment_events')) return movementRows;
            if (sql.includes('FROM equipments')) return inventoryRows;
            return [];
        },
        execute: async () => ({ meta: { changes: 0 } }),
        batch: async () => [
            { results: [] },
            { results: [] },
            { results: [] },
            { results: [] }
        ]
    };

    const requirements = await getEventEquipmentRequirements({}, 5, helpers);
    assert.equal(requirements.length, 1);
    assert.equal(requirements[0].name, 'MICROFONE SEM FIO');
    assert.equal(requirements[0].requestedQuantity, 2);
    assert.equal(requirements[0].separatedQuantity, 1);
    assert.notEqual(requirements[0].name, 'MICROFONE SENNHEISER');
});

test('ordem de serviço divide os 45 itens de uma seção ampla pelos tópicos reais do estoque', async () => {
    const requestedRows = [
        { quantity: 4, topicName: 'CAIXA DE SOM', description: 'RCF', equipmentName: 'RCF' },
        { quantity: 1, topicName: 'MESA DE LUZ', description: 'MESA DE LUZ DMX 512', equipmentName: 'MESA DE LUZ DMX 512' },
        { quantity: 1, topicName: 'MESA DE SOM', description: 'MESA DE SOM DIGITAL MIDAS M32', equipmentName: 'MESA DE SOM DIGITAL MIDAS M32' },
        { quantity: 2, topicName: 'MICROFONE SEM FIO RACK', description: 'MICROFONE SENNHEISER W100G3', equipmentName: 'MICROFONE SENNHEISER W100G3' },
        { quantity: 1, topicName: 'NOTBOOK', description: 'NOTBOOK LENOVO 201.6', equipmentName: 'NOTBOOK LENOVO 201.6' },
        { quantity: 24, topicName: 'PARLED', description: 'PARLED SLIM AC 3 PINOS', equipmentName: 'PARLED SLIM AC 3 PINOS' },
        { quantity: 12, topicName: 'RIBALTA', description: 'RIBALTA', equipmentName: 'RIBALTA' }
    ];
    const inventoryRows = requestedRows.flatMap((item, itemIndex) => Array.from(
        { length: item.quantity },
        (_, quantityIndex) => ({
            id: (itemIndex * 100) + quantityIndex + 1,
            name: item.equipmentName,
            topicName: item.topicName,
            currentStatus: 'Disponivel',
            maintenanceOpen: 0,
            activeBalance: 0
        })
    ));
    const helpers = {
        queryFirst: async () => ({ id: 9581, orcamento_id: 23 }),
        queryAll: async (_env, sql) => {
            if (sql.includes('FROM quote_items')) return requestedRows;
            if (sql.includes('FROM equipment_events')) return [];
            if (sql.includes('FROM equipments')) return inventoryRows;
            return [];
        },
        execute: async () => ({ meta: { changes: 0 } }),
        batch: async () => []
    };

    const requirements = await getEventEquipmentRequirements({}, 9581, helpers);
    assert.equal(requirements.reduce((total, item) => total + item.requestedQuantity, 0), 45);
    assert.deepEqual(
        Object.fromEntries(requirements.map((item) => [item.name, item.requestedQuantity])),
        {
            'CAIXA DE SOM': 4,
            'MESA DE LUZ': 1,
            'MESA DE SOM': 1,
            'MICROFONE SEM FIO RACK': 2,
            NOTBOOK: 1,
            PARLED: 24,
            RIBALTA: 12
        }
    );
    assert.equal(requirements.some((item) => item.name === 'TRANSMISSÃO'), false);
});

test('interface envia a escolha e mostra quantidade antes do tópico na ordem de serviço', () => {
    const dashboard = fs.readFileSync(path.join(projectRoot, 'javascript', 'dashboard.js'), 'utf8');
    const eventPage = fs.readFileSync(path.join(projectRoot, 'javascript', 'event.js'), 'utf8');
    const html = fs.readFileSync(path.join(projectRoot, 'html', 'dashboard.html'), 'utf8');

    assert.match(html, /Criar como Evento/);
    assert.match(html, /Criar como Locação/);
    assert.match(dashboard, /JSON\.stringify\(\{ destinationType: normalizedDestination \}\)/);
    assert.match(eventPage, /requestedLabel.*padStart\(2, '0'\)/);
    assert.match(eventPage, /equipment\.category/);
});
