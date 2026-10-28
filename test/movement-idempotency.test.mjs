import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const eventSource = fs.readFileSync(path.join(projectRoot, 'javascript', 'event.js'), 'utf8');
const entradaSource = fs.readFileSync(path.join(projectRoot, 'html', 'entrada.html'), 'utf8');
const saidaSource = fs.readFileSync(path.join(projectRoot, 'html', 'saida.html'), 'utf8');

function createMovementRequestHelper(fetchImpl, options = {}) {
    const start = eventSource.indexOf('const MOVEMENT_REQUEST_MAX_ATTEMPTS');
    const end = eventSource.indexOf('function fetchSharedJson', start);
    assert.ok(start >= 0 && end > start, 'helper de movimentacao deve existir no event.js');

    const createHelper = new Function(
        'fetch',
        'crypto',
        'Headers',
        'setTimeout',
        'window',
        `${eventSource.slice(start, end)}
        return { fetchMovementWithRetry };`
    );

    return createHelper(
        fetchImpl,
        options.crypto || { randomUUID: () => 'operation-uuid' },
        Headers,
        options.setTimeout || ((resolve) => {
            resolve();
            return 0;
        }),
        options.window || { location: { protocol: 'http:' } }
    ).fetchMovementWithRetry;
}

test('retry de rede em HTTPS reutiliza uma unica Idempotency-Key e para em tres tentativas', async () => {
    const keys = [];
    let calls = 0;
    let uuidCalls = 0;
    const fetchMovement = createMovementRequestHelper(async (_url, options) => {
        calls += 1;
        keys.push(options.headers.get('Idempotency-Key'));
        if (calls < 3) throw new TypeError('Network connection lost');
        return new Response('{}', { status: 200 });
    }, {
        crypto: {
            randomUUID: () => {
                uuidCalls += 1;
                return 'same-operation-uuid';
            }
        },
        window: { location: { protocol: 'https:' } }
    });

    const response = await fetchMovement('/api/equipment-events/saida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
    });

    assert.equal(response.status, 200);
    assert.equal(calls, 3);
    assert.equal(uuidCalls, 1);
    assert.deepEqual(keys, [
        'same-operation-uuid',
        'same-operation-uuid',
        'same-operation-uuid'
    ]);
});

test('nao repete TypeError no HTTP local sem idempotencia atomica', async () => {
    let calls = 0;
    const fetchMovement = createMovementRequestHelper(async () => {
        calls += 1;
        throw new TypeError('Network connection lost');
    }, {
        window: { location: { protocol: 'http:' } }
    });

    await assert.rejects(
        fetchMovement('/api/equipment-events/saida', { method: 'POST', body: '{}' }),
        /Network connection lost/
    );
    assert.equal(calls, 1);
});

test('repete 503 somente quando o payload declara retryable true e respeita Retry-After', async () => {
    const delays = [];
    let calls = 0;
    const fetchMovement = createMovementRequestHelper(async () => {
        calls += 1;
        if (calls === 1) {
            return Response.json({ retryable: true }, {
                status: 503,
                headers: { 'Retry-After': '0' }
            });
        }
        return Response.json({ success: true });
    }, {
        setTimeout: (resolve, delayMs) => {
            delays.push(delayMs);
            resolve();
            return 0;
        },
        window: { location: { protocol: 'http:' } }
    });

    const response = await fetchMovement('/api/cable-events/entrada', {
        method: 'POST',
        body: '{}'
    });

    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    assert.deepEqual(delays, [0]);
});

test('nao repete outros erros HTTP nem excecao que nao seja de rede', async () => {
    let httpCalls = 0;
    const fetchHttp = createMovementRequestHelper(async () => {
        httpCalls += 1;
        return Response.json({ retryable: false }, { status: 503 });
    });
    const response = await fetchHttp('/api/other-item-events/saida', { method: 'POST' });
    assert.equal(response.status, 503);
    assert.equal(httpCalls, 1);

    let exceptionCalls = 0;
    const fetchException = createMovementRequestHelper(async () => {
        exceptionCalls += 1;
        throw new Error('erro de programacao');
    });
    await assert.rejects(
        fetchException('/api/other-item-events/entrada', { method: 'POST' }),
        /erro de programacao/
    );
    assert.equal(exceptionCalls, 1);
});

test('somente os POSTs de movimentacao usam o helper resiliente nas tres telas', () => {
    const movementEndpoint = '(?:equipment-events|cable-events|other-item-events|quote-other-item-events)';
    const directMovementFetch = new RegExp(
        "fetch\\((?:`|['\"])/api/" + movementEndpoint + "/"
    );

    for (const source of [eventSource, entradaSource, saidaSource]) {
        assert.doesNotMatch(source, directMovementFetch);
        assert.match(source, /headers\.set\('Idempotency-Key', idempotencyKey\)/);
        assert.match(source, /window\.location\?\.protocol === 'https:'/);
    }

    assert.match(eventSource, /fetch\(`\/api\/events\/\$\{eventId\}`\)/);
    assert.match(eventSource, /fetch\('\/api\/logout'/);
});
