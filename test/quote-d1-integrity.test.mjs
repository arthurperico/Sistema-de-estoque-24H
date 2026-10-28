import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { D1WriteOutcomeUnknownError } from '../src/d1-resilience.mjs';
import { handleQuoteRequest } from '../src/worker-quotes.mjs';

const sqlite3 = createRequire(import.meta.url)('sqlite3');

function createMemoryDatabase() {
    const connection = new sqlite3.Database(':memory:');

    const run = (sql, params = []) => new Promise((resolve, reject) => {
        connection.run(sql, params, function onRun(error) {
            if (error) {
                reject(error);
                return;
            }
            resolve({
                meta: {
                    changes: Number(this.changes) || 0,
                    last_row_id: Number(this.lastID) || 0
                }
            });
        });
    });
    const all = (sql, params = []) => new Promise((resolve, reject) => {
        connection.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows);
        });
    });
    const first = (sql, params = []) => new Promise((resolve, reject) => {
        connection.get(sql, params, (error, row) => {
            if (error) reject(error);
            else resolve(row || null);
        });
    });
    const batch = async (operations = []) => {
        await run('BEGIN IMMEDIATE');
        let committed = false;
        try {
            const results = [];
            for (const operation of operations) {
                if (/\bRETURNING\b/i.test(operation.sql)) {
                    results.push({ results: await all(operation.sql, operation.params || []) });
                } else {
                    results.push(await run(operation.sql, operation.params || []));
                }
            }
            await run('COMMIT');
            committed = true;
            return results;
        } catch (error) {
            if (!committed) await run('ROLLBACK').catch(() => {});
            throw error;
        }
    };
    const close = () => new Promise((resolve, reject) => {
        connection.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });

    return { run, all, first, batch, close };
}

function createD1Helpers(database) {
    return {
        queryAll: (_env, sql, params) => database.all(sql, params),
        queryFirst: (_env, sql, params) => database.first(sql, params),
        execute: (_env, sql, params) => database.run(sql, params),
        batch: (_env, operations) => database.batch(operations)
    };
}

async function withMutedExpectedError(operation) {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        return await operation();
    } finally {
        console.error = originalConsoleError;
    }
}

async function initializeQuoteCreateSchema(database) {
    await database.run(`CREATE TABLE quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proposal_city TEXT NOT NULL,
        proposal_date TEXT NOT NULL,
        client_name TEXT NOT NULL,
        event_name TEXT NOT NULL,
        event_location TEXT NOT NULL,
        event_datetime TEXT NOT NULL,
        assembly_datetime TEXT NOT NULL,
        disassembly_datetime TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        payment_deadline TEXT NOT NULL,
        logistics_price REAL NOT NULL DEFAULT 0,
        technicians_price REAL NOT NULL DEFAULT 0,
        subtotal REAL NOT NULL,
        final_total REAL NOT NULL,
        show_item_prices INTEGER NOT NULL,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_by_username TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    await database.run(`CREATE TABLE quote_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL,
        equipment_id INTEGER,
        is_manual INTEGER NOT NULL,
        is_service INTEGER NOT NULL,
        service_id TEXT,
        service_width REAL,
        service_height REAL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        daily_units INTEGER NOT NULL,
        internal_unit_price REAL NOT NULL,
        internal_total REAL NOT NULL,
        sort_order INTEGER NOT NULL
    )`);
    await database.run(`CREATE TABLE quote_technicians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL,
        operator_id INTEGER,
        operator_name TEXT NOT NULL,
        daily_units INTEGER NOT NULL,
        cache_value REAL NOT NULL,
        sort_order INTEGER NOT NULL
    )`);
    await database.run(
        'CREATE TABLE quote_service_prices (service_id TEXT PRIMARY KEY, unit_price REAL NOT NULL)'
    );
    await database.run(
        'CREATE TABLE operators (id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, cache_value REAL NOT NULL)'
    );
    await database.run(
        "INSERT INTO operators VALUES (1, 'Técnico Um', 150), (2, 'Técnico Dois', 175)"
    );
}

function createQuotePayload(operatorId) {
    return {
        proposalCity: 'Belo Horizonte',
        proposalDate: '2026-08-05',
        clientName: 'Cliente de teste',
        eventName: 'Evento de teste',
        eventLocation: 'Local de teste',
        eventDatetime: '10/08/2026 às 18:00',
        assemblyDatetime: '10/08/2026 às 10:00',
        disassemblyDatetime: '11/08/2026 às 10:00',
        paymentMethod: 'Pix',
        paymentDeadline: 'À vista',
        logisticsPrice: 225,
        techniciansPrice: 375,
        items: [
            {
                isManual: true,
                description: 'Item avulso A',
                quantity: 2,
                dailyUnits: 1,
                internalUnitPrice: 100
            },
            {
                isManual: true,
                description: 'Item avulso B',
                quantity: 1,
                dailyUnits: 2,
                internalUnitPrice: 75
            }
        ],
        technicians: [{ operatorId, dailyUnits: 1 }]
    };
}

function sendQuoteCreate(helpers, operatorId) {
    const request = new Request('https://example.com/api/orcamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createQuotePayload(operatorId))
    });
    return handleQuoteRequest({
        request,
        env: {},
        session: { role: 'admin', username: 'admin' },
        url: new URL(request.url),
        helpers
    });
}

test('criação de orçamento grava pai, itens e técnicos em um batch e faz rollback integral', async (t) => {
    const database = createMemoryDatabase();
    t.after(() => database.close());
    await initializeQuoteCreateSchema(database);

    const helpers = createD1Helpers(database);
    const originalBatch = helpers.batch;
    const batches = [];
    helpers.batch = async (env, operations) => {
        batches.push(operations);
        return originalBatch(env, operations);
    };

    const response = await sendQuoteCreate(helpers, 1);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: 1, success: true });
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 3);
    assert.match(batches[0][0].sql, /INSERT INTO quotes/);
    assert.match(batches[0][1].sql, /MATERIALIZED \(SELECT last_insert_rowid\(\)\)/);
    assert.match(batches[0][2].sql, /SELECT quote_id FROM quote_items WHERE id = last_insert_rowid\(\)/);

    assert.deepEqual(
        await database.all('SELECT DISTINCT quote_id AS quoteId FROM quote_items'),
        [{ quoteId: 1 }]
    );
    assert.equal((await database.first('SELECT COUNT(*) AS total FROM quote_items')).total, 2);
    assert.deepEqual(
        await database.all('SELECT DISTINCT quote_id AS quoteId FROM quote_technicians'),
        [{ quoteId: 1 }]
    );

    await database.run(`CREATE TRIGGER fail_second_quote_technician
        BEFORE INSERT ON quote_technicians
        WHEN NEW.operator_id = 2
        BEGIN
            SELECT RAISE(ABORT, 'forced-child-failure');
        END`);
    const failedResponse = await withMutedExpectedError(() => sendQuoteCreate(helpers, 2));
    assert.equal(failedResponse.status, 500);
    assert.equal(batches.length, 2);

    assert.equal((await database.first('SELECT COUNT(*) AS total FROM quotes')).total, 1);
    assert.equal((await database.first('SELECT COUNT(*) AS total FROM quote_items')).total, 2);
    assert.equal((await database.first('SELECT COUNT(*) AS total FROM quote_technicians')).total, 1);
    assert.deepEqual(
        await database.first(`SELECT logistics_price AS logisticsPrice,
                                     technicians_price AS techniciansPrice,
                                     subtotal,
                                     final_total AS finalTotal
                              FROM quotes WHERE id = 1`),
        { logisticsPrice: 225, techniciansPrice: 375, subtotal: 1100, finalTotal: 1100 }
    );
});

test('router aguarda rejeição assíncrona e a converte em resposta D1 503', async () => {
    const request = new Request('https://example.com/api/orcamentos?status=pending');
    let response;

    await assert.doesNotReject(async () => {
        response = await withMutedExpectedError(() => handleQuoteRequest({
            request,
            env: {},
            session: { role: 'admin' },
            url: new URL(request.url),
            helpers: {
                queryAll: async () => {
                    await Promise.resolve();
                    throw new Error('D1 DB is overloaded');
                },
                queryFirst: async () => null,
                execute: async () => ({ meta: { changes: 0 } })
            }
        }));
    });

    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.code, 'DATABASE_TEMPORARILY_UNAVAILABLE');
    assert.equal(payload.retryable, false);
    assert.equal(response.headers.get('Retry-After'), null);
});

async function initializeManualMovementSchema(database) {
    await database.run(`CREATE TABLE quote_items (
        id INTEGER PRIMARY KEY,
        quote_id INTEGER NOT NULL,
        is_manual INTEGER NOT NULL,
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL
    )`);
    await database.run('CREATE TABLE events (id INTEGER PRIMARY KEY, orcamento_id INTEGER NOT NULL)');
    await database.run(`CREATE TABLE quote_manual_item_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_item_id INTEGER NOT NULL,
        event_id INTEGER NOT NULL,
        space_id INTEGER,
        action_type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        request_id TEXT
    )`);
    await database.run(`CREATE UNIQUE INDEX idx_manual_request_id
        ON quote_manual_item_movements(request_id) WHERE request_id IS NOT NULL`);
    await database.run("INSERT INTO quote_items VALUES (9, 3, 1, 'Item avulso', 3)");
    await database.run('INSERT INTO events VALUES (4, 3)');
}

function sendManualMovement(helpers, quantity, requestId) {
    const request = new Request('https://example.com/api/quote-other-item-events/saida', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': requestId
        },
        body: JSON.stringify({ quoteItemId: 9, eventId: 4, quantity })
    });
    return handleQuoteRequest({
        request,
        env: {},
        session: { role: 'user' },
        url: new URL(request.url),
        helpers
    });
}

test('movimentação manual reconhece replay e rejeita chave reutilizada com outro payload', async (t) => {
    const database = createMemoryDatabase();
    t.after(() => database.close());
    await initializeManualMovementSchema(database);
    const helpers = createD1Helpers(database);
    const requestId = 'manual-operation-0001';

    let response = await sendManualMovement(helpers, 1, requestId);
    let payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.requestId, requestId);
    assert.equal(payload.replayed, false);

    response = await sendManualMovement(helpers, 1, requestId);
    payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.requestId, requestId);
    assert.equal(payload.replayed, true);
    assert.equal(
        (await database.first('SELECT COUNT(*) AS total FROM quote_manual_item_movements')).total,
        1
    );

    response = await sendManualMovement(helpers, 2, requestId);
    payload = await response.json();
    assert.equal(response.status, 409);
    assert.match(payload.error, /chave de idempotência/i);
    assert.equal(
        (await database.first('SELECT COUNT(*) AS total FROM quote_manual_item_movements')).total,
        1
    );
});

async function initializeEventCleanupSchema(database) {
    const statements = [
        'CREATE TABLE quotes (id INTEGER PRIMARY KEY)',
        `CREATE TABLE quote_operational_destinations (
            quote_id INTEGER PRIMARY KEY,
            destination_type TEXT NOT NULL
        )`,
        'CREATE TABLE quote_items (id INTEGER PRIMARY KEY, quote_id INTEGER, equipment_id INTEGER)',
        'CREATE TABLE quote_technicians (id INTEGER PRIMARY KEY, quote_id INTEGER)',
        'CREATE TABLE events (id INTEGER PRIMARY KEY, orcamento_id INTEGER)',
        'CREATE TABLE equipments (id INTEGER PRIMARY KEY, current_status TEXT)',
        `CREATE TABLE cables (
            id INTEGER PRIMARY KEY,
            quantity INTEGER,
            available_quantity INTEGER,
            updated_at TEXT
        )`,
        `CREATE TABLE other_items (
            id INTEGER PRIMARY KEY,
            quantity INTEGER,
            available_quantity INTEGER,
            updated_at TEXT
        )`,
        `CREATE TABLE equipment_events (
            id INTEGER PRIMARY KEY,
            equipment_id INTEGER,
            event_id INTEGER,
            action_type TEXT
        )`,
        `CREATE TABLE cable_event_movements (
            id INTEGER PRIMARY KEY,
            cable_id INTEGER,
            event_id INTEGER,
            action_type TEXT,
            quantity INTEGER
        )`,
        `CREATE TABLE other_item_event_movements (
            id INTEGER PRIMARY KEY,
            item_id INTEGER,
            event_id INTEGER,
            action_type TEXT,
            quantity INTEGER
        )`,
        `CREATE TABLE quote_manual_item_movements (
            id INTEGER PRIMARY KEY,
            quote_item_id INTEGER,
            event_id INTEGER
        )`,
        `CREATE TABLE event_reserved_equipments (
            id INTEGER PRIMARY KEY,
            event_id INTEGER,
            equipment_id INTEGER,
            quote_item_id INTEGER
        )`,
        'CREATE TABLE event_saida_hidden_items (id INTEGER PRIMARY KEY, event_id INTEGER)',
        'CREATE TABLE event_spaces (id INTEGER PRIMARY KEY, event_id INTEGER)'
    ];
    for (const statement of statements) await database.run(statement);

    await database.run('INSERT INTO quotes VALUES (1)');
    await database.run('INSERT INTO quote_items VALUES (1, 1, 2)');
    await database.run('INSERT INTO events VALUES (5, 1)');
    await database.run("INSERT INTO equipments VALUES (2, 'Agendado')");
    await database.run('INSERT INTO cables VALUES (3, 10, 7, NULL)');
    await database.run('INSERT INTO other_items VALUES (4, 10, 8, NULL)');
}

function sendQuoteDelete(helpers) {
    const request = new Request('https://example.com/api/orcamentos/1', { method: 'DELETE' });
    return handleQuoteRequest({
        request,
        env: {},
        session: { role: 'admin' },
        url: new URL(request.url),
        helpers
    });
}

test('retry após commit da exclusão não altera saldos nem executa o batch duas vezes', async (t) => {
    const database = createMemoryDatabase();
    t.after(() => database.close());
    await initializeEventCleanupSchema(database);

    const helpers = createD1Helpers(database);
    const originalBatch = helpers.batch;
    const batches = [];
    let interruptAfterFirstEventCommit = true;
    helpers.batch = async (env, operations) => {
        batches.push(operations);
        const results = await originalBatch(env, operations);
        if (
            interruptAfterFirstEventCommit
            && operations.some(({ sql }) => sql.includes('DELETE FROM events WHERE id'))
        ) {
            interruptAfterFirstEventCommit = false;
            throw new D1WriteOutcomeUnknownError(
                'delete-event-records',
                new Error('Network connection lost')
            );
        }
        return results;
    };

    let response = await withMutedExpectedError(() => sendQuoteDelete(helpers));
    let payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.code, 'DATABASE_WRITE_OUTCOME_UNKNOWN');
    assert.equal(payload.retryable, false);
    assert.equal(batches.length, 1);
    assert.match(batches[0][0].sql, /^DELETE FROM quotes/);
    assert.equal((await database.first('SELECT available_quantity AS value FROM cables')).value, 7);
    assert.equal((await database.first('SELECT available_quantity AS value FROM other_items')).value, 8);
    assert.equal((await database.first('SELECT current_status AS value FROM equipments')).value, 'Disponivel');
    assert.equal((await database.first('SELECT COUNT(*) AS total FROM cable_event_movements')).total, 0);
    assert.equal((await database.first('SELECT COUNT(*) AS total FROM events')).total, 0);
    assert.equal((await database.first('SELECT COUNT(*) AS total FROM quotes')).total, 0);

    response = await sendQuoteDelete(helpers);
    assert.equal(response.status, 404);
    assert.equal(batches.length, 1);
    assert.equal((await database.first('SELECT available_quantity AS value FROM cables')).value, 7);
    assert.equal((await database.first('SELECT available_quantity AS value FROM other_items')).value, 8);
    assert.equal((await database.first('SELECT COUNT(*) AS total FROM quotes')).total, 0);

    response = await sendQuoteDelete(helpers);
    assert.equal(response.status, 404);
    assert.equal(batches.length, 1);
    assert.equal((await database.first('SELECT available_quantity AS value FROM cables')).value, 7);
    assert.equal((await database.first('SELECT available_quantity AS value FROM other_items')).value, 8);
});
