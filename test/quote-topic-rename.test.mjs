import test from 'node:test';
import assert from 'node:assert/strict';

import {
    handleQuoteRequest,
    planQuoteEquipmentTopicRename
} from '../src/worker-quotes.mjs';

test('planeja a renomeação de um tópico completo', () => {
    const plan = planQuoteEquipmentTopicRename(
        [
            { category: 'Iluminação', total: 3 },
            { category: 'Internet', total: 2 }
        ],
        'Iluminação',
        'Luz'
    );

    assert.deepEqual(plan, {
        sourceTopic: 'Iluminação',
        topic: 'Luz',
        rawTopics: ['Iluminação'],
        includesNull: false,
        merged: false,
        total: 3
    });
});

test('mescla no tópico existente e consolida variantes equivalentes', () => {
    const plan = planQuoteEquipmentTopicRename(
        [
            { category: 'Som', total: 2 },
            { category: 'Áudio', total: 3 },
            { category: 'audio', total: 1 }
        ],
        'Som',
        'Áudio'
    );

    assert.equal(plan.topic, 'Áudio');
    assert.equal(plan.merged, true);
    assert.equal(plan.total, 6);
    assert.deepEqual(new Set(plan.rawTopics), new Set(['Som', 'Áudio', 'audio']));
});

test('mescla tópicos que diferem apenas por acento, caixa ou espaços', () => {
    const plan = planQuoteEquipmentTopicRename(
        [
            { category: '  Audio  ', total: 2 },
            { category: 'Áudio', total: 4 }
        ],
        'Audio',
        'Áudio'
    );

    assert.equal(plan.topic, 'Áudio');
    assert.equal(plan.merged, true);
    assert.equal(plan.total, 6);
    assert.deepEqual(plan.rawTopics, ['  Audio  ', 'Áudio']);
});

test('a rota administrativa atualiza origem e destino em uma única operação', async () => {
    const executions = [];
    const request = new Request('https://example.com/api/orcamentos/topicos/nome', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceTopic: 'Som', topic: 'Áudio' })
    });
    const response = await handleQuoteRequest({
        request,
        env: {},
        session: { role: 'admin' },
        url: new URL(request.url),
        helpers: {
            queryAll: async () => [
                { category: 'Som', total: 2 },
                { category: 'Áudio', total: 3 }
            ],
            queryFirst: async () => null,
            execute: async (_env, sql, params) => {
                executions.push({ sql, params });
                return { meta: { changes: 5 } };
            }
        }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.merged, true);
    assert.equal(payload.updated, 5);
    assert.equal(executions.length, 1);
    assert.match(executions[0].sql, /UPDATE equipments/);
    assert.match(executions[0].sql, /SET quote_category = \?/);
    assert.doesNotMatch(executions[0].sql, /SET category = \?/);
    assert.match(executions[0].sql, /json_each/);
    assert.equal(executions[0].params[0], 'Áudio');
    assert.deepEqual(JSON.parse(executions[0].params[1]), ['Som', 'Áudio']);
});
