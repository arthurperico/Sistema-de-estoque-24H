import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    calculatePlanningAvailability,
    calculateRequirementAvailability
} from '../src/worker-quotes.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('cenários A, B e C: falta de estoque gera déficit numérico sem saldo negativo', () => {
    assert.deepEqual(calculatePlanningAvailability(4, 10, 10), {
        requestedQuantity: 4,
        confirmedAvailableQuantity: 10,
        forecastAvailableQuantity: 10,
        confirmedDeficit: 0,
        forecastDeficit: 0
    });
    assert.equal(calculatePlanningAvailability(8, 5, 5).forecastDeficit, 3);
    assert.equal(calculatePlanningAvailability(6, 2, 2).forecastDeficit, 4);
});

test('cenários D e H: progresso aceita patrimônios reais e representa extras sem 5/4', () => {
    assert.deepEqual(calculateRequirementAvailability(3, 3, 7), {
        requestedQuantity: 3,
        separatedQuantity: 3,
        pendingQuantity: 0,
        warehouseAvailableQuantity: 7,
        deficit: 0,
        extraQuantity: 0
    });
    const extra = calculateRequirementAvailability(4, 5, 5);
    assert.equal(extra.pendingQuantity, 0);
    assert.equal(extra.extraQuantity, 1);
});

test('cenário I: devolução ao galpão elimina o déficit dinamicamente', () => {
    assert.equal(calculateRequirementAvailability(4, 2, 0).deficit, 2);
    assert.equal(calculateRequirementAvailability(4, 2, 2).deficit, 0);
});

test('cenários B e C: criação e edição retornam avisos e não bloqueiam por capacidade', () => {
    const workerQuotes = read('src/worker-quotes.mjs');
    assert.match(workerQuotes, /availabilityWarnings = await findQuoteItemsAvailabilityWarnings/);
    assert.doesNotMatch(workerQuotes, /if \(conflict\) return dateConflictResponse\(conflict, sendJson\);/);
    assert.match(workerQuotes, /quantity,\s*dailyUnits,\s*internalUnitPrice/);
});

test('cenário E: aviso exige escolha e a confirmação efetiva a saída com auditoria', () => {
    const worker = read('src/worker.mjs');
    const eventClient = read('javascript/event.js');
    assert.match(worker, /FUTURE_AVAILABILITY_WARNING/);
    assert.match(worker, /availabilityOverride/);
    assert.match(worker, /INSERT INTO availability_warning_audits/);
    assert.match(eventClient, /confirmFutureAvailabilityWarning/);
    assert.match(eventClient, /availabilityOverride: true/);
    assert.match(eventClient, /Continuar saída|availabilityWarningContinueButton/);
});

test('cenários F e G: manutenção, baixa e saída física ativa continuam bloqueando', () => {
    const worker = read('src/worker.mjs');
    assert.match(worker, /isMaintenanceStatus\(equipment\.current_status\)/);
    assert.match(worker, /isInactiveEquipmentStatus\(equipment\.current_status\)/);
    assert.match(worker, /activePhysicalMovement/);
    assert.match(worker, /já está fora do estoque/);
});

test('cenário J: migração é somente aditiva e a automação inclui períodos não encerrados', () => {
    const migration = read('banco de dados/migrations/0032_availability_warning_audits.sql');
    const workerQuotes = read('src/worker-quotes.mjs');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS availability_warning_audits/);
    assert.match(migration, /CREATE INDEX IF NOT EXISTS/);
    assert.doesNotMatch(migration, /\b(?:DELETE|DROP|TRUNCATE|UPDATE)\b/i);
    assert.match(workerQuotes, /if \(!hasRequestedQuote && range\.end < today\) continue;/);
    assert.doesNotMatch(workerQuotes, /range\.start > nextWeek/);
    assert.match(workerQuotes, /INSERT OR IGNORE INTO events/);
});
