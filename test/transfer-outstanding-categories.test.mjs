import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('transferência permite escolher equipamentos, cabos e outros no evento', () => {
    const html = read('html/event.html');
    const client = read('javascript/event.js');

    for (const category of ['equipment', 'cable', 'other']) {
        assert.match(html, new RegExp(`name="transferCategory" value="${category}"`));
    }
    assert.match(client, /getSelectedTransferCategories/);
    assert.match(client, /categories: selectedTransferCategories/);
    assert.match(client, /Selecione ao menos um tipo de item para transferir/);
});

test('Worker transfere apenas saldos pendentes das categorias escolhidas', () => {
    const worker = read('src/worker.mjs');
    const start = worker.indexOf("const transferOutstandingMatch = pathname.match");
    const end = worker.indexOf('const cableHistoryMatch', start);
    assert.ok(start >= 0 && end > start, 'rota de transferência deve existir');

    const route = worker.slice(start, end);
    assert.match(route, /\['equipment', 'cable', 'other'\]/);
    assert.match(route, /FROM equipment_events/);
    assert.match(route, /FROM cable_event_movements/);
    assert.match(route, /FROM other_item_event_movements/);
    assert.match(route, /HAVING SUM\(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END\) > 0/);
    assert.match(route, /Não há itens com saída pendente nas categorias selecionadas/);
    assert.match(route, /INSERT INTO cable_event_movements/);
    assert.match(route, /INSERT INTO other_item_event_movements/);
});
