import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getD1ErrorMessage,
    isD1UnavailableError,
    isD1WriteOutcomeUnknownError,
    isRetryableD1Error,
    isRetrySafeSql,
    protectD1WriteOutcome,
    withD1Retry
} from '../src/d1-resilience.mjs';

const RESET_ERROR = new Error(
    'D1_ERROR: Internal error while starting up D1 DB storage caused object to be reset'
);

const TRANSIENT_D1_MESSAGES = [
    'D1_ERROR: Network connection lost.',
    'D1_ERROR: D1 DB reset because its code was updated.',
    'D1_ERROR: Internal error while starting up D1 DB storage caused object to be reset.',
    'D1_ERROR: D1 DB storage caused object to be reset.',
    'D1_ERROR: Cannot resolve D1 DB due to transient issue.'
];

test('reconhece os erros transitórios documentados do D1, inclusive em cause', () => {
    const wrapped = new Error('Falha no banco', { cause: RESET_ERROR });

    assert.equal(isRetryableD1Error(wrapped), true);
    assert.equal(isD1UnavailableError(wrapped), true);
    assert.match(getD1ErrorMessage(wrapped), /storage caused object to be reset/);
});

test('reconhece os cinco erros transitórios documentados pelo D1', () => {
    for (const message of TRANSIENT_D1_MESSAGES) {
        assert.equal(isRetryableD1Error(new Error(message)), true, message);
    }
});

test('repete uma operação transitória até ela funcionar', async () => {
    let calls = 0;
    const delays = [];
    const result = await withD1Retry(async () => {
        calls += 1;
        if (calls < 3) throw RESET_ERROR;
        return 'ok';
    }, {
        sleep: async (delayMs) => delays.push(delayMs)
    });

    assert.equal(result, 'ok');
    assert.equal(calls, 3);
    assert.equal(delays.length, 2);
    assert.ok(delays.every((delay) => delay >= 0 && delay <= 100));
});

test('encerra após seis tentativas quando a falha transitória persiste', async () => {
    let calls = 0;

    await assert.rejects(
        withD1Retry(async () => {
            calls += 1;
            throw RESET_ERROR;
        }, { sleep: async () => {} }),
        /storage caused object to be reset/
    );

    assert.equal(calls, 6);
});

test('não repete erro permanente', async () => {
    let calls = 0;

    await assert.rejects(
        withD1Retry(async () => {
            calls += 1;
            throw new Error('D1_ERROR: UNIQUE constraint failed');
        }, { sleep: async () => {} }),
        /UNIQUE constraint failed/
    );
    assert.equal(calls, 1);
});

test('marca como incerto o resultado de escrita interrompida', () => {
    const protectedError = protectD1WriteOutcome('create-quote', RESET_ERROR);

    assert.equal(isD1WriteOutcomeUnknownError(protectedError), true);
    assert.equal(protectedError.operation, 'create-quote');
    assert.equal(protectedError.cause, RESET_ERROR);
});

test('classifica somente leituras e DDL idempotente como SQL seguro para retry', () => {
    assert.equal(isRetrySafeSql('SELECT * FROM equipments'), true);
    assert.equal(isRetrySafeSql('WITH recent AS (SELECT 1) SELECT * FROM recent'), false);
    assert.equal(isRetrySafeSql('CREATE TABLE IF NOT EXISTS health (id INTEGER)'), true);
    assert.equal(isRetrySafeSql('CREATE UNIQUE INDEX IF NOT EXISTS idx_health ON health(id)'), true);
    assert.equal(isRetrySafeSql('PRAGMA table_info(equipments)'), true);
    assert.equal(isRetrySafeSql('PRAGMA journal_mode = DELETE'), false);
    assert.equal(isRetrySafeSql('INSERT INTO movements (quantity) VALUES (1)'), false);
    assert.equal(isRetrySafeSql('INSERT INTO quotes (name) VALUES (?) RETURNING id'), false);
    assert.equal(isRetrySafeSql('WITH deleted AS (DELETE FROM equipments RETURNING id) SELECT * FROM deleted'), false);
    assert.equal(isRetrySafeSql('UPDATE cables SET available_quantity = available_quantity - 1'), false);
    assert.equal(isRetrySafeSql('DELETE FROM equipments'), false);
});
