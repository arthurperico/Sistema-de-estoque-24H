import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

function equipmentEntryBlock(source) {
    const workerStart = source.indexOf('// A entrada pode ser lida na aba de qualquer evento.');
    const localStart = source.indexOf('// A tela em que o operador está serve apenas como ponto de leitura.');
    const blockStart = workerStart >= 0 ? workerStart : localStart;
    assert.ok(blockStart >= 0, 'bloco da entrada global não encontrado');

    const expressEnd = source.indexOf("app.post('/api/cable-events", blockStart);
    const workerEnd = source.indexOf('const cableMovementMatch', blockStart);
    return source.slice(blockStart, expressEnd >= 0 ? expressEnd : workerEnd);
}

for (const [name, relativePath] of [
    ['servidor local', 'server.js'],
    ['Cloudflare Worker', 'src/worker.mjs']
]) {
    test(`${name}: entrada procura a saída pendente global e preserva evento/espaço de origem`, () => {
        const block = equipmentEntryBlock(read(relativePath));

        assert.match(block, /WHERE equipment_events\.equipment_id = \?/);
        assert.match(block, /HAVING SUM\(CASE WHEN equipment_events\.action_type = 'saida' THEN 1 ELSE -1 END\) > 0/);
        assert.doesNotMatch(block, /WHERE equipment_events\.equipment_id = \? AND event_id = \?/);
        assert.match(block, /movementEventId/);
        assert.match(block, /movementSpaceId/);
        assert.match(block, /eventName: pendingMovement\.eventName/);
    });
}

test('interface informa o evento de origem retornado pela API', () => {
    const eventClient = read('javascript/event.js');
    const standaloneEntry = read('html/entrada.html');
    assert.match(eventClient, /devolvido do evento: \$\{movement\.eventName\}/);
    assert.match(eventClient, /type === 'entrada' \? movement\.spaceId : spaceId/);
    assert.match(standaloneEntry, /body: JSON\.stringify\(\{\s*barcode,\s*eventId: eventId/);
    assert.doesNotMatch(standaloneEntry, /entradaEquipments\.find\(eq => eq\.id === equipment\.id\)/);
    assert.match(standaloneEntry, /devolvido do evento: \$\{result\.movement\.eventName\}/);
});
