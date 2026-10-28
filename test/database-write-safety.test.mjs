import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import worker from '../src/worker.mjs';
import { handleQuoteRequest } from '../src/worker-quotes.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const workerSource = fs.readFileSync(path.join(projectRoot, 'src', 'worker.mjs'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(projectRoot, 'javascript', 'dashboard.js'), 'utf8');
const migrationSource = fs.readFileSync(
    path.join(projectRoot, 'banco de dados', 'migrations', '0030_movement_idempotency.sql'),
    'utf8'
);
const integrityTriggersSource = fs.readFileSync(
    path.join(projectRoot, 'banco de dados', 'd1-integrity-triggers.sql'),
    'utf8'
);

function sourceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `marcador inicial ausente: ${startMarker}`);
    assert.ok(end > start, `marcador final ausente: ${endMarker}`);
    return source.slice(start, end);
}

function rejectingD1(message) {
    let calls = 0;
    const fail = async () => {
        calls += 1;
        throw new Error(message);
    };
    const statement = {
        bind() {
            return this;
        },
        all: fail,
        first: fail,
        run: fail
    };

    return {
        env: {
            DB: {
                prepare() {
                    return statement;
                },
                batch: fail
            }
        },
        get calls() {
            return calls;
        }
    };
}

test('o fetch principal converte rejeicao D1 assincrona em 503 estruturado', async () => {
    const d1 = rejectingD1('D1_ERROR: D1 DB is overloaded. Please try again.');
    const request = new Request('https://estoque.example/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'arthur', password: 'senha' })
    });

    const response = await worker.fetch(request, d1.env);
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.code, 'DATABASE_TEMPORARILY_UNAVAILABLE');
    assert.equal(payload.retryable, false);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(d1.calls, 1);
});

test('o roteador de orcamentos tambem captura rejeicao D1 assincrona', async () => {
    const unavailable = new Error('D1_ERROR: D1 DB is overloaded. Please try again.');
    const reject = async () => {
        throw unavailable;
    };
    const request = new Request('https://estoque.example/api/orcamentos');

    const response = await handleQuoteRequest({
        request,
        env: {},
        session: { role: 'admin', username: 'arthur' },
        url: new URL(request.url),
        helpers: {
            queryAll: reject,
            queryFirst: reject,
            execute: reject,
            batch: reject
        }
    });
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.code, 'DATABASE_TEMPORARILY_UNAVAILABLE');
    assert.equal(payload.retryable, false);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('edicao de quantidade usa CAS e nunca repete UPDATE relativo', () => {
    const cablePatch = sourceBetween(
        workerSource,
        "if (cableMatch && request.method === 'PATCH')",
        "if (cableMatch && request.method === 'DELETE')"
    );
    const otherItemPatch = sourceBetween(
        workerSource,
        "if (otherItemMatch && request.method === 'PATCH')",
        "if (otherItemMatch && request.method === 'DELETE')"
    );

    for (const block of [cablePatch, otherItemPatch]) {
        assert.match(block, /const currentQuantity =/);
        assert.match(block, /const result = await execute\s*\(/);
        assert.doesNotMatch(block, /executeIdempotent/);
        assert.match(block, /AND quantity = \?/);
        assert.match(block, /available_quantity \+ \(\? - quantity\) >= 0/);
        assert.match(block, /result\?\.meta\?\.changes\) === 0/);
    }
});

test('login confirma a nova sessao antes de remover sessoes antigas', () => {
    const loginSource = sourceBetween(
        workerSource,
        'async function login(request, env)',
        'async function cleanupCurrentSessionBeforeLogin'
    );
    const createIndex = loginSource.indexOf('await executeIdempotent');
    const confirmIndex = loginSource.indexOf('const storedSession');
    const validateIndex = loginSource.indexOf('if (!storedSession');
    const cleanupIndex = loginSource.indexOf('cleanupExpiredSessions(env)');

    assert.ok(createIndex >= 0);
    assert.match(loginSource, /ON CONFLICT\(id\) DO NOTHING/);
    assert.ok(confirmIndex > createIndex);
    assert.ok(validateIndex > confirmIndex);
    assert.ok(cleanupIndex > validateIndex);
});

test('deletes de evento restauram saldos e removem ledgers no mesmo batch repetivel', () => {
    const deletion = sourceBetween(
        workerSource,
        'async function deleteEventRecords(env, eventId)',
        'async function ensureSaidaHiddenItemsTable'
    );

    assert.match(deletion, /await executeIdempotentBatch\s*\(env, \[/);
    assert.match(deletion, /UPDATE equipments/);
    assert.match(deletion, /UPDATE cables/);
    assert.match(deletion, /UPDATE other_items/);
    assert.match(deletion, /DELETE FROM equipment_events WHERE event_id = \?/);
    assert.match(deletion, /DELETE FROM cable_event_movements WHERE event_id = \?/);
    assert.match(deletion, /DELETE FROM other_item_event_movements WHERE event_id = \?/);
    assert.match(deletion, /DELETE FROM events WHERE id = \?/);
    assert.match(deletion, /], 'delete-event'\);/);
});

test('painel nao libera equipamentos antes do delete atomico do evento', () => {
    const deletion = sourceBetween(
        dashboardSource,
        'async function deleteEvent(id)',
        'function renderCables(cables)'
    );
    const deleteRequestIndex = deletion.indexOf('fetch(`/api/events/${id}`');
    const clearLocalStateIndex = deletion.indexOf('localStorage.removeItem(pendingKey)');

    assert.ok(deleteRequestIndex >= 0);
    assert.doesNotMatch(deletion, /\/api\/equipments\/\$\{Number\(item\.id\)\}\/status/);
    assert.ok(clearLocalStateIndex > deleteRequestIndex);
});

test('gatilhos bloqueiam movimento concorrente depois que item ou evento foi excluido', () => {
    for (const table of ['equipment_events', 'cable_event_movements', 'other_item_event_movements']) {
        assert.match(
            integrityTriggersSource,
            new RegExp(`BEFORE INSERT ON ${table}[\\s\\S]+?D1_LEDGER_EVENT_NOT_FOUND[\\s\\S]+?FROM events WHERE id = NEW\\.event_id`)
        );
    }

    assert.match(
        integrityTriggersSource,
        /BEFORE INSERT ON quote_manual_item_movements[\s\S]+?D1_LEDGER_MANUAL_ITEM_EVENT_MISMATCH[\s\S]+?INNER JOIN events/
    );
    for (const table of [
        'equipment_events',
        'cable_event_movements',
        'other_item_event_movements',
        'quote_manual_item_movements'
    ]) {
        assert.match(
            migrationSource,
            new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS [^\\n]+[\\s\\S]+?ON ${table}\\(request_id\\)`)
        );
    }
});

test('manutencao e ultimo administrador preservam invariantes dentro do batch', () => {
    const maintenanceReady = sourceBetween(
        workerSource,
        'const maintenanceReadyMatch',
        'const cableMaintenanceReadyMatch'
    );
    const userDelete = sourceBetween(
        workerSource,
        'const userMatch = pathname.match',
        "if (pathname === '/api/operators'"
    );

    assert.match(maintenanceReady, /await executeBatch\s*\(env, \[/);
    assert.match(maintenanceReady, /SET current_status = CASE/);
    assert.match(maintenanceReady, /maintenances\.resolved_at IS NULL/);
    assert.match(maintenanceReady, /FROM equipment_events AS outgoing/);
    assert.match(maintenanceReady, /THEN 'Indisponivel'/);

    assert.match(userDelete, /DELETE FROM users[\s\S]+?EXISTS \([\s\S]+?another_admin\.role = 'admin'/);
    assert.match(userDelete, /DELETE FROM sessions[\s\S]+?NOT EXISTS \(SELECT 1 FROM users WHERE id = \?\)/);
    assert.match(userDelete, /deleteUserResult\?\.meta\?\.changes/);
});

test('503 de escrita incerta nunca instrui retry automatico', () => {
    const unknownResponse = sourceBetween(
        workerSource,
        'function databaseWriteOutcomeUnknownResponse',
        'function databaseUnavailableResponse'
    );
    const unavailableResponse = sourceBetween(
        workerSource,
        'function databaseUnavailableResponse',
        'function getD1LedgerConflictCode'
    );

    assert.match(unknownResponse, /DATABASE_WRITE_OUTCOME_UNKNOWN/);
    assert.match(unknownResponse, /retryable: false/);
    assert.doesNotMatch(unknownResponse, /Retry-After/);
    assert.match(unavailableResponse, /const retryable = isRetryableD1Error\(error\)/);
    assert.match(unavailableResponse, /retryable \? \{ 'Retry-After': '1' \} : \{\}/);
});
