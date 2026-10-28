import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const workerSource = fs.readFileSync(path.join(projectRoot, 'src', 'worker-quotes.mjs'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(projectRoot, 'javascript', 'dashboard.js'), 'utf8');
const browserRendererSource = fs.readFileSync(path.join(projectRoot, 'src', 'quote-pdf-browser.mjs'), 'utf8');
const wranglerConfig = fs.readFileSync(path.join(projectRoot, 'wrangler.toml'), 'utf8');

test('PDF é renderizado no navegador e não consome CPU do Worker gratuito', () => {
    const handlerStart = workerSource.indexOf('async function handleQuotePdf(');
    const handlerEnd = workerSource.indexOf('\nexport async function createQuotePdf(', handlerStart);
    const handlerSource = workerSource.slice(handlerStart, handlerEnd);

    assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
    assert.match(handlerSource, /X-Quote-PDF-Renderer': 'browser'/);
    assert.doesNotMatch(handlerSource, /createQuotePdf\(/);
    assert.match(dashboardSource, /QuotePdfClient\?\.downloadQuotePdf/);
    assert.match(browserRendererSource, /createQuotePdf\(quote, request, env\)/);
    assert.doesNotMatch(wranglerConfig, /\[limits\][\s\S]*?cpu_ms/);
});
