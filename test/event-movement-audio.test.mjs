import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, '..');
const eventHtml = fs.readFileSync(path.join(projectRoot, 'html', 'event.html'), 'utf8');
const eventJs = fs.readFileSync(path.join(projectRoot, 'javascript', 'event.js'), 'utf8');

test('event page provides separate audio controls for outgoing and incoming equipment', () => {
    assert.match(eventHtml, /id="saidaAudioToggle"/);
    assert.match(eventHtml, /id="entradaAudioToggle"/);
    assert.match(eventHtml, /toggleMovementAudio\('saida'\)/);
    assert.match(eventHtml, /toggleMovementAudio\('entrada'\)/);
});

test('equipment name is spoken only in the confirmed movement success path', () => {
    const successResponseIndex = eventJs.indexOf('const result = await save.json()');
    const speakIndex = eventJs.indexOf('speakEquipmentMovement(type, eq.name || eq.equipment_name)');

    assert.ok(successResponseIndex >= 0, 'confirmed movement response should be parsed');
    assert.ok(speakIndex > successResponseIndex, 'speech should happen after the successful response');
    assert.match(eventJs, /new SpeechSynthesisUtterance\(`\$\{label\}: \$\{name\}`\)/);
});

test('audio preferences are stored locally without an extra API request', () => {
    const audioImplementation = eventJs.slice(
        eventJs.indexOf('function loadMovementAudioPreferences'),
        eventJs.indexOf('function waitForMovementRetry')
    );

    assert.match(audioImplementation, /localStorage\.setItem\(MOVEMENT_AUDIO_STORAGE_KEY/);
    assert.doesNotMatch(audioImplementation, /fetch\(/);
});
