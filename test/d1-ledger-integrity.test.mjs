import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import sqlite3Package from 'sqlite3';

const sqlite3 = sqlite3Package.verbose();
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const migrationsDirectory = path.join(projectRoot, 'banco de dados', 'migrations');
const integrityTriggersFile = path.join(projectRoot, 'banco de dados', 'd1-integrity-triggers.sql');
const migrationFiles = fs.readdirSync(migrationsDirectory)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name) && Number(name.slice(0, 4)) <= 35)
    .sort();

assert.equal(migrationFiles.length, 35, 'o teste deve aplicar exatamente as migrations 0001-0035');
assert.match(migrationFiles[0], /^0001_/);
assert.match(migrationFiles.at(-1), /^0035_/);

function openDatabase() {
    return new Promise((resolve, reject) => {
        const database = new sqlite3.Database(':memory:', (error) => {
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

function exec(database, sql) {
    return new Promise((resolve, reject) => {
        database.exec(sql, (error) => (error ? reject(error) : resolve()));
    });
}

function run(database, sql, params = []) {
    return new Promise((resolve, reject) => {
        database.run(sql, params, function onRun(error) {
            if (error) reject(error);
            else resolve({ changes: this.changes, lastId: this.lastID });
        });
    });
}

function get(database, sql, params = []) {
    return new Promise((resolve, reject) => {
        database.get(sql, params, (error, row) => {
            if (error) reject(error);
            else resolve(row);
        });
    });
}

function all(database, sql, params = []) {
    return new Promise((resolve, reject) => {
        database.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows);
        });
    });
}

async function applyMigrations(database) {
    await exec(database, 'PRAGMA recursive_triggers = ON;');
    for (const migrationFile of migrationFiles) {
        const migration = fs.readFileSync(path.join(migrationsDirectory, migrationFile), 'utf8');
        await exec(database, migration);
    }
    await exec(database, fs.readFileSync(integrityTriggersFile, 'utf8'));
}

async function createMigratedDatabase(t) {
    const database = await openDatabase();
    t.after(async () => closeDatabase(database));
    await applyMigrations(database);
    return database;
}

async function runAtomicBatch(database, operations) {
    await run(database, 'BEGIN IMMEDIATE');
    try {
        for (const operation of operations) {
            await run(database, operation.sql, operation.params || []);
        }
        await run(database, 'COMMIT');
    } catch (error) {
        try {
            await run(database, 'ROLLBACK');
        } catch {
            // Preserva o erro original caso a transação já tenha sido encerrada.
        }
        throw error;
    }
}

async function seedEvents(database) {
    await exec(database, `
        INSERT INTO events (id, name, date)
        VALUES
            (1, 'Evento A', '2026-08-05'),
            (2, 'Evento B', '2026-08-06');

        INSERT INTO event_spaces (id, event_id, name)
        VALUES
            (1, 1, 'Palco'),
            (2, 1, 'Recepção'),
            (3, 2, 'Salão');
    `);
}

test('aplica a cadeia 0001-0034 e os gatilhos de integridade em SQLite em memória', async (t) => {
    const database = await createMigratedDatabase(t);
    const triggerRows = await all(
        database,
        "SELECT name FROM sqlite_schema WHERE type = 'trigger' AND name LIKE 'trg_0030_%'"
    );
    const triggerNames = new Set(triggerRows.map((row) => row.name));
    const integrity = await get(database, 'PRAGMA integrity_check');
    const starlinkTable = await get(
        database,
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'local_starlink_inventory'"
    );

    assert.equal(starlinkTable?.name, 'local_starlink_inventory');

    for (const triggerName of [
        'trg_0030_equipment_events_guard_insert',
        'trg_0030_equipment_events_status_after_insert',
        'trg_0030_equipment_events_status_after_delete',
        'trg_0030_equipments_derive_status_after_update',
        'trg_0030_cable_movements_guard_insert',
        'trg_0030_cables_guard_update',
        'trg_0030_other_item_movements_guard_insert',
        'trg_0030_other_items_guard_update',
        'trg_0030_quote_manual_movements_guard_insert',
        'trg_0030_quotes_guard_update',
        'trg_0030_quotes_guard_delete',
        'trg_0030_maintenances_guard_insert',
        'trg_0030_cable_maintenances_guard_insert',
        'trg_0030_event_spaces_guard_insert',
        'trg_0030_event_saida_hidden_items_guard_insert',
        'trg_0030_quote_hidden_equipments_guard_insert'
    ]) {
        assert.ok(triggerNames.has(triggerName), `trigger ausente: ${triggerName}`);
    }
    assert.equal(integrity.integrity_check, 'ok');
    const quoteColumns = await all(database, 'PRAGMA table_info(quotes)');
    const quoteColumnNames = new Set(quoteColumns.map((column) => column.name));
    assert.ok(quoteColumnNames.has('logistics_price'));
    assert.ok(quoteColumnNames.has('technicians_price'));
});

test('replay com a mesma request_id para no UNIQUE sem alterar o saldo novamente', async (t) => {
    const database = await createMigratedDatabase(t);
    await seedEvents(database);
    await run(
        database,
        'INSERT INTO cables (id, name, quantity, available_quantity) VALUES (?, ?, ?, ?)',
        [1, 'Cabo replay', 1, 1]
    );

    const movementBatch = [
        {
            sql: `INSERT INTO cable_event_movements
                  (cable_id, event_id, space_id, action_type, quantity, request_id)
                  VALUES (?, ?, ?, 'saida', ?, ?)`,
            params: [1, 1, 1, 1, 'cable-replay-0001']
        },
        {
            sql: `UPDATE cables
                  SET available_quantity = available_quantity - 1
                  WHERE id = ?`,
            params: [1]
        }
    ];

    await runAtomicBatch(database, movementBatch);
    await assert.rejects(
        runAtomicBatch(database, movementBatch),
        /UNIQUE constraint failed: cable_event_movements\.request_id/
    );

    const cable = await get(database, 'SELECT available_quantity FROM cables WHERE id = 1');
    const movements = await get(
        database,
        'SELECT COUNT(*) AS total FROM cable_event_movements WHERE cable_id = 1'
    );
    assert.equal(cable.available_quantity, 0);
    assert.equal(movements.total, 1);
});

test('transferência de cabos e outros mantém o saldo físico enquanto muda o evento', async (t) => {
    const database = await createMigratedDatabase(t);
    await seedEvents(database);
    await exec(database, `
        INSERT INTO cables (id, name, quantity, available_quantity)
        VALUES (71, 'Cabo transferível', 2, 2);
        INSERT INTO other_items (id, name, quantity, available_quantity)
        VALUES (81, 'Item transferível', 3, 3);
    `);

    await runAtomicBatch(database, [
        {
            sql: `INSERT INTO cable_event_movements
                  (cable_id, event_id, space_id, action_type, quantity, request_id)
                  VALUES (71, 1, 1, 'saida', 2, 'transfer-cable-source-out')`
        },
        {
            sql: 'UPDATE cables SET available_quantity = available_quantity - 2 WHERE id = 71'
        },
        {
            sql: `INSERT INTO other_item_event_movements
                  (item_id, event_id, space_id, action_type, quantity, request_id)
                  VALUES (81, 1, 1, 'saida', 3, 'transfer-other-source-out')`
        },
        {
            sql: 'UPDATE other_items SET available_quantity = available_quantity - 3 WHERE id = 81'
        }
    ]);

    await runAtomicBatch(database, [
        {
            sql: `INSERT INTO cable_event_movements
                  (cable_id, event_id, space_id, action_type, quantity, request_id)
                  VALUES (71, 1, 1, 'entrada', 2, 'transfer-cable-from')`
        },
        {
            sql: 'UPDATE cables SET available_quantity = available_quantity + 2 WHERE id = 71'
        },
        {
            sql: `INSERT INTO cable_event_movements
                  (cable_id, event_id, action_type, quantity, request_id)
                  VALUES (71, 2, 'saida', 2, 'transfer-cable-to')`
        },
        {
            sql: 'UPDATE cables SET available_quantity = available_quantity - 2 WHERE id = 71'
        },
        {
            sql: `INSERT INTO other_item_event_movements
                  (item_id, event_id, space_id, action_type, quantity, request_id)
                  VALUES (81, 1, 1, 'entrada', 3, 'transfer-other-from')`
        },
        {
            sql: 'UPDATE other_items SET available_quantity = available_quantity + 3 WHERE id = 81'
        },
        {
            sql: `INSERT INTO other_item_event_movements
                  (item_id, event_id, action_type, quantity, request_id)
                  VALUES (81, 2, 'saida', 3, 'transfer-other-to')`
        },
        {
            sql: 'UPDATE other_items SET available_quantity = available_quantity - 3 WHERE id = 81'
        }
    ]);

    const [cable, otherItem, cableSource, cableTarget, otherSource, otherTarget] = await Promise.all([
        get(database, 'SELECT available_quantity FROM cables WHERE id = 71'),
        get(database, 'SELECT available_quantity FROM other_items WHERE id = 81'),
        get(database, `SELECT SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS balance
                       FROM cable_event_movements WHERE cable_id = 71 AND event_id = 1`),
        get(database, `SELECT SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS balance
                       FROM cable_event_movements WHERE cable_id = 71 AND event_id = 2`),
        get(database, `SELECT SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS balance
                       FROM other_item_event_movements WHERE item_id = 81 AND event_id = 1`),
        get(database, `SELECT SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS balance
                       FROM other_item_event_movements WHERE item_id = 81 AND event_id = 2`)
    ]);

    assert.equal(cable.available_quantity, 0);
    assert.equal(otherItem.available_quantity, 0);
    assert.equal(cableSource.balance, 0);
    assert.equal(cableTarget.balance, 2);
    assert.equal(otherSource.balance, 0);
    assert.equal(otherTarget.balance, 3);
});

test('segunda saída com outra chave é bloqueada globalmente para o equipamento', async (t) => {
    const database = await createMigratedDatabase(t);
    await seedEvents(database);
    await run(
        database,
        `INSERT INTO equipments (id, name, barcode, current_status)
         VALUES (?, ?, ?, 'Disponivel')`,
        [1, 'Equipamento exclusivo', 'EQ-0001']
    );

    await runAtomicBatch(database, [
        {
            sql: `INSERT INTO equipment_events
                  (equipment_id, event_id, space_id, action_type, request_id)
                  VALUES (?, ?, ?, 'saida', ?)`,
            params: [1, 1, 1, 'equipment-out-0001']
        },
        {
            sql: "UPDATE equipments SET current_status = 'Indisponivel' WHERE id = ?",
            params: [1]
        }
    ]);

    await assert.rejects(
        runAtomicBatch(database, [{
            sql: `INSERT INTO equipment_events
                  (equipment_id, event_id, space_id, action_type, request_id)
                  VALUES (?, ?, ?, 'saida', ?)`,
            params: [1, 2, 3, 'equipment-out-0002']
        }]),
        /D1_LEDGER_EQUIPMENT_ALREADY_OUT/
    );

    // A rota de status não pode tornar disponível um patrimônio ainda em uso.
    await run(database, "UPDATE equipments SET current_status = 'Disponivel' WHERE id = 1");

    const equipment = await get(database, 'SELECT current_status FROM equipments WHERE id = 1');
    const movements = await get(
        database,
        "SELECT COUNT(*) AS total FROM equipment_events WHERE equipment_id = 1 AND action_type = 'saida'"
    );
    assert.equal(equipment.current_status, 'Indisponivel');
    assert.equal(movements.total, 1);

    await run(database, 'DELETE FROM equipment_events WHERE equipment_id = 1');
    const equipmentAfterDelete = await get(
        database,
        'SELECT current_status FROM equipments WHERE id = 1'
    );
    assert.equal(equipmentAfterDelete.current_status, 'Disponivel');
});

test('saldo negativo aborta e reverte todo o batch da movimentação', async (t) => {
    const database = await createMigratedDatabase(t);
    await seedEvents(database);
    await run(
        database,
        'INSERT INTO cables (id, name, quantity, available_quantity) VALUES (?, ?, ?, ?)',
        [1, 'Cabo rollback', 1, 1]
    );

    await assert.rejects(
        runAtomicBatch(database, [
            {
                sql: `INSERT INTO cable_event_movements
                      (cable_id, event_id, space_id, action_type, quantity, request_id)
                      VALUES (?, ?, ?, 'saida', ?, ?)`,
                params: [1, 1, 1, 1, 'cable-rollback-0001']
            },
            {
                sql: `UPDATE cables
                      SET available_quantity = available_quantity - 2
                      WHERE id = ?`,
                params: [1]
            }
        ]),
        /D1_BALANCE_CABLE_NEGATIVE/
    );

    const cable = await get(database, 'SELECT available_quantity FROM cables WHERE id = 1');
    const movement = await get(
        database,
        "SELECT id FROM cable_event_movements WHERE request_id = 'cable-rollback-0001'"
    );
    assert.equal(cable.available_quantity, 1);
    assert.equal(movement, undefined);
});

test('evento ou item apagado não permite criar ledger órfão', async (t) => {
    const database = await createMigratedDatabase(t);
    await seedEvents(database);
    await run(
        database,
        'INSERT INTO other_items (id, name, quantity, available_quantity) VALUES (?, ?, ?, ?)',
        [1, 'Item descartável', 2, 2]
    );

    await run(database, 'DELETE FROM event_spaces WHERE event_id = ?', [1]);
    await run(database, 'DELETE FROM events WHERE id = ?', [1]);
    await assert.rejects(
        runAtomicBatch(database, [{
            sql: `INSERT INTO other_item_event_movements
                  (item_id, event_id, action_type, quantity, request_id)
                  VALUES (?, ?, 'saida', ?, ?)`,
            params: [1, 1, 1, 'other-missing-event']
        }]),
        /D1_LEDGER_EVENT_NOT_FOUND/
    );
    await assert.rejects(
        run(database, 'INSERT INTO event_spaces (event_id, name) VALUES (?, ?)', [1, 'Espaço órfão']),
        /D1_LEDGER_EVENT_NOT_FOUND/
    );
    await assert.rejects(
        run(
            database,
            `INSERT INTO event_saida_hidden_items (event_id, item_type, item_id)
             VALUES (?, 'other', ?)`,
            [1, 1]
        ),
        /D1_LEDGER_EVENT_NOT_FOUND/
    );
    await assert.rejects(
        run(
            database,
            `INSERT INTO event_saida_hidden_items (event_id, space_id, item_type, item_id)
             VALUES (?, ?, 'other', ?)`,
            [2, 1, 1]
        ),
        /D1_LEDGER_SPACE_EVENT_MISMATCH/
    );

    await run(database, 'DELETE FROM other_items WHERE id = ?', [1]);
    await assert.rejects(
        runAtomicBatch(database, [{
            sql: `INSERT INTO other_item_event_movements
                  (item_id, event_id, action_type, quantity, request_id)
                  VALUES (?, ?, 'saida', ?, ?)`,
            params: [1, 2, 1, 'other-missing-parent']
        }]),
        /D1_LEDGER_OTHER_ITEM_NOT_FOUND/
    );
    await assert.rejects(
        run(
            database,
            `INSERT INTO event_saida_hidden_items (event_id, item_type, item_id)
             VALUES (?, 'other', ?)`,
            [2, 1]
        ),
        /D1_LEDGER_OTHER_ITEM_NOT_FOUND/
    );

    await run(
        database,
        "INSERT INTO equipments (id, name, barcode, current_status) VALUES (1, 'Pai manutenção', 'PARENT-EQ', 'Disponivel')"
    );
    await run(database, 'DELETE FROM equipments WHERE id = 1');
    await assert.rejects(
        run(database, 'INSERT INTO maintenances (equipment_id, description) VALUES (?, ?)', [1, 'Órfã']),
        /D1_LEDGER_EQUIPMENT_NOT_FOUND/
    );
    await assert.rejects(
        run(
            database,
            `INSERT INTO event_saida_hidden_items (event_id, item_type, item_id)
             VALUES (?, 'equipment', ?)`,
            [2, 1]
        ),
        /D1_LEDGER_EQUIPMENT_NOT_FOUND/
    );
    await assert.rejects(
        run(database, 'INSERT INTO quote_hidden_equipments (equipment_id) VALUES (?)', [1]),
        /D1_LEDGER_EQUIPMENT_NOT_FOUND/
    );

    await run(
        database,
        "INSERT INTO cables (id, name, quantity, available_quantity) VALUES (1, 'Pai manutenção cabo', 1, 1)"
    );
    await run(database, 'DELETE FROM cables WHERE id = 1');
    await assert.rejects(
        run(database, 'INSERT INTO cable_maintenances (cable_id, description) VALUES (?, ?)', [1, 'Órfã']),
        /D1_LEDGER_CABLE_NOT_FOUND/
    );
    await assert.rejects(
        run(
            database,
            `INSERT INTO event_saida_hidden_items (event_id, item_type, item_id)
             VALUES (?, 'cable', ?)`,
            [2, 1]
        ),
        /D1_LEDGER_CABLE_NOT_FOUND/
    );

    const movements = await get(database, 'SELECT COUNT(*) AS total FROM other_item_event_movements');
    assert.equal(movements.total, 0);
});

test('orçamento com qualquer ledger ou técnico pago fica bloqueado no UPDATE e DELETE', async (t) => {
    const database = await createMigratedDatabase(t);
    await exec(database, `
        INSERT INTO quotes (
            id, proposal_date, client_name, event_name, event_location,
            event_datetime, assembly_datetime, disassembly_datetime,
            payment_method, payment_deadline
        ) VALUES
            (1, '2026-08-01', 'Cliente 1', 'Evento 1', 'Local', '2026-08-05', '2026-08-05', '2026-08-05', 'pix', '2026-08-01'),
            (2, '2026-08-01', 'Cliente 2', 'Evento 2', 'Local', '2026-08-06', '2026-08-06', '2026-08-06', 'pix', '2026-08-01'),
            (3, '2026-08-01', 'Cliente 3', 'Evento 3', 'Local', '2026-08-07', '2026-08-07', '2026-08-07', 'pix', '2026-08-01'),
            (4, '2026-08-01', 'Cliente 4', 'Evento 4', 'Local', '2026-08-08', '2026-08-08', '2026-08-08', 'pix', '2026-08-01'),
            (5, '2026-08-01', 'Cliente 5', 'Evento 5', 'Local', '2026-08-09', '2026-08-09', '2026-08-09', 'pix', '2026-08-01'),
            (6, '2026-08-01', 'Cliente 6', 'Evento 6', 'Local', '2026-08-10', '2026-08-10', '2026-08-10', 'pix', '2026-08-01');

        INSERT INTO events (id, name, date, orcamento_id) VALUES
            (1, 'Evento 1', '2026-08-05', 1),
            (2, 'Evento 2', '2026-08-06', 2),
            (3, 'Evento 3', '2026-08-07', 3),
            (4, 'Evento 4', '2026-08-08', 4);

        INSERT INTO equipments (id, name, barcode, current_status)
        VALUES (1, 'Equipamento', 'QUOTE-EQ', 'Disponivel');
        INSERT INTO cables (id, name, quantity, available_quantity)
        VALUES (1, 'Cabo orçamento', 1, 1);
        INSERT INTO other_items (id, name, quantity, available_quantity)
        VALUES (1, 'Item orçamento', 1, 1);
        INSERT INTO quote_items (id, quote_id, is_manual, category, description, quantity)
        VALUES (1, 4, 1, 'Avulso', 'Manual orçamento', 1);

        INSERT INTO equipment_events (equipment_id, event_id, action_type, request_id)
        VALUES (1, 1, 'saida', 'quote-equipment-ledger');
        INSERT INTO cable_event_movements (cable_id, event_id, action_type, quantity, request_id)
        VALUES (1, 2, 'saida', 1, 'quote-cable-ledger');
        INSERT INTO other_item_event_movements (item_id, event_id, action_type, quantity, request_id)
        VALUES (1, 3, 'saida', 1, 'quote-other-ledger');
        INSERT INTO quote_manual_item_movements (
            quote_item_id, event_id, action_type, quantity, request_id
        ) VALUES (1, 4, 'saida', 1, 'quote-manual-ledger');

        UPDATE cables SET available_quantity = 0 WHERE id = 1;
        UPDATE other_items SET available_quantity = 0 WHERE id = 1;

        INSERT INTO quote_technicians (
            quote_id, operator_name, paid_at, paid_by_username
        ) VALUES (5, 'Técnico pago', CURRENT_TIMESTAMP, 'admin');
    `);

    for (const quoteId of [1, 2, 3, 4]) {
        await assert.rejects(
            run(database, 'UPDATE quotes SET notes = ? WHERE id = ?', ['alterado', quoteId]),
            /D1_LEDGER_QUOTE_LOCKED_BY_MOVEMENT/
        );
    }
    await assert.rejects(
        run(database, 'DELETE FROM quotes WHERE id = 1'),
        /D1_LEDGER_QUOTE_LOCKED_BY_MOVEMENT/
    );

    await assert.rejects(
        run(database, 'UPDATE quotes SET notes = ? WHERE id = 5', ['alterado']),
        /D1_LEDGER_QUOTE_LOCKED_BY_PAYMENT/
    );
    await assert.rejects(
        run(database, 'DELETE FROM quotes WHERE id = 5'),
        /D1_LEDGER_QUOTE_LOCKED_BY_PAYMENT/
    );

    await run(database, 'UPDATE quotes SET notes = ? WHERE id = 6', ['permitido']);
    await run(database, 'DELETE FROM quotes WHERE id = 6');
    const remainingUnlockedQuote = await get(database, 'SELECT id FROM quotes WHERE id = 6');
    assert.equal(remainingUnlockedQuote, undefined);
});

test('retorno avulso maior que a saída pendente é rejeitado', async (t) => {
    const database = await createMigratedDatabase(t);
    await seedEvents(database);
    await exec(database, `
        INSERT INTO quotes (
            id, proposal_date, client_name, event_name, event_location,
            event_datetime, assembly_datetime, disassembly_datetime,
            payment_method, payment_deadline
        ) VALUES (
            1, '2026-08-01', 'Cliente teste', 'Evento A', 'Local teste',
            '2026-08-05', '2026-08-05', '2026-08-05', 'pix', '2026-08-01'
        );

        UPDATE events SET orcamento_id = 1 WHERE id = 1;

        INSERT INTO quote_items (
            id, quote_id, is_manual, category, description, quantity
        ) VALUES (1, 1, 1, 'Avulso', 'Item manual', 2);

        INSERT INTO quote_manual_item_movements (
            quote_item_id, event_id, space_id, action_type, quantity, request_id
        ) VALUES (1, 1, 1, 'saida', 1, 'manual-out-0001');
    `);

    await assert.rejects(
        runAtomicBatch(database, [{
            sql: `INSERT INTO quote_manual_item_movements
                  (quote_item_id, event_id, space_id, action_type, quantity, request_id)
                  VALUES (?, ?, ?, 'entrada', ?, ?)`,
            params: [1, 1, 1, 2, 'manual-in-0001']
        }]),
        /D1_LEDGER_MANUAL_ITEM_RETURN_EXCEEDS_PENDING/
    );

    const balance = await get(
        database,
        `SELECT SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS total
         FROM quote_manual_item_movements
         WHERE quote_item_id = 1 AND event_id = 1`
    );
    assert.equal(balance.total, 1);
});

test('entrada não apaga uma manutenção aberta do equipamento', async (t) => {
    const database = await createMigratedDatabase(t);
    await seedEvents(database);
    await run(
        database,
        `INSERT INTO equipments (id, name, barcode, current_status)
         VALUES (?, ?, ?, 'Disponivel')`,
        [1, 'Equipamento em retorno', 'EQ-RETURN']
    );

    await runAtomicBatch(database, [
        {
            sql: `INSERT INTO equipment_events
                  (equipment_id, event_id, space_id, action_type, request_id)
                  VALUES (?, ?, ?, 'saida', ?)`,
            params: [1, 1, 1, 'equipment-maint-out']
        },
        {
            sql: "UPDATE equipments SET current_status = 'Indisponivel' WHERE id = ?",
            params: [1]
        }
    ]);
    await runAtomicBatch(database, [
        {
            sql: 'INSERT INTO maintenances (equipment_id, description) VALUES (?, ?)',
            params: [1, 'Manutenção aberta durante o evento']
        },
        {
            sql: "UPDATE equipments SET current_status = 'Em manutencao' WHERE id = ?",
            params: [1]
        }
    ]);

    await runAtomicBatch(database, [
        {
            sql: `INSERT INTO equipment_events
                  (equipment_id, event_id, space_id, action_type, request_id)
                  VALUES (?, ?, ?, 'entrada', ?)`,
            params: [1, 1, 1, 'equipment-maint-in']
        },
        {
            // Reproduz o UPDATE legado executado logo após o INSERT de entrada.
            sql: "UPDATE equipments SET current_status = 'Disponivel' WHERE id = ?",
            params: [1]
        }
    ]);

    const equipment = await get(database, 'SELECT current_status FROM equipments WHERE id = 1');
    const pending = await get(
        database,
        `SELECT SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END) AS total
         FROM equipment_events
         WHERE equipment_id = 1`
    );
    const openMaintenance = await get(
        database,
        `SELECT COUNT(*) AS total
         FROM maintenances
         WHERE equipment_id = 1 AND resolved_at IS NULL`
    );

    assert.equal(pending.total, 0);
    assert.equal(openMaintenance.total, 1);
    assert.equal(equipment.current_status, 'Em manutencao');
});
