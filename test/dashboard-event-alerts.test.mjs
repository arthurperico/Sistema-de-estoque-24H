import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const dashboardHtml = fs.readFileSync(path.join(projectRoot, 'html', 'dashboard.html'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(projectRoot, 'javascript', 'dashboard.js'), 'utf8');
const dashboardCss = fs.readFileSync(path.join(projectRoot, 'css', 'dashboard.css'), 'utf8');
const workerSource = fs.readFileSync(path.join(projectRoot, 'src', 'worker.mjs'), 'utf8');

function loadAlertHelpers(currentUser) {
    const start = dashboardJs.indexOf('function getDateKeyDayNumber');
    const end = dashboardJs.indexOf('function renderEvents');
    assert.ok(start >= 0 && end > start, 'funções de alerta devem existir no dashboard');

    const createHelpers = new Function(
        'currentUser',
        `${dashboardJs.slice(start, end)}
        return {
            getDateKeyDayNumber,
            getTodayDateKeyInSaoPaulo,
            getScheduledAssemblyAlertDays
        };`
    );
    return createHelpers(currentUser);
}

test('orçamento pendente usa o botão Aprovado com o estilo verde', () => {
    assert.match(
        dashboardJs,
        /class="btn-success">Aprovado<\/button>/
    );
});

test('eventos agendados aparecem em Eventos sem menu ou seção separados', () => {
    assert.doesNotMatch(dashboardHtml, /Eventos Agendados|eventosAgendados|scheduledEventsGrid/);
    assert.match(dashboardJs, /fetch\('\/api\/scheduled-events'/);
    assert.match(dashboardJs, /allEvents = \[\.\.\.scheduledEvents, \.\.\.regularEvents\]/);
});

test('Worker aguarda a criação automática antes de listar eventos agendados', () => {
    const routeStart = workerSource.indexOf("if (pathname === '/api/scheduled-events'");
    const routeEnd = workerSource.indexOf("if (pathname === '/api/orcamentos/equipamentos-banco'", routeStart);
    assert.ok(routeStart >= 0 && routeEnd > routeStart, 'rota de eventos agendados deve existir');

    const routeSource = workerSource.slice(routeStart, routeEnd);
    assert.match(routeSource, /await ensureAutomaticScheduledEvents/);
    assert.match(routeSource, /return getScheduledEvents\(env\)/);
});

test('somente user recebe o piscar entre três dias antes e o dia da montagem', () => {
    const currentUser = { role: 'user' };
    const helpers = loadAlertHelpers(currentUser);
    const todayDay = helpers.getDateKeyDayNumber(helpers.getTodayDateKeyInSaoPaulo());
    const toDateKey = (dayNumber) => new Date(dayNumber * 86400000).toISOString().slice(0, 10);

    assert.equal(
        helpers.getScheduledAssemblyAlertDays({ isScheduled: true, date: toDateKey(todayDay + 3) }),
        3
    );
    assert.equal(
        helpers.getScheduledAssemblyAlertDays({ isScheduled: true, date: toDateKey(todayDay + 4) }),
        null
    );
    assert.equal(
        helpers.getScheduledAssemblyAlertDays({ isScheduled: false, date: toDateKey(todayDay + 2) }),
        null
    );

    currentUser.role = 'admin';
    assert.equal(
        helpers.getScheduledAssemblyAlertDays({ isScheduled: true, date: toDateKey(todayDay + 2) }),
        null
    );

    assert.match(dashboardCss, /@keyframes eventAssemblyBlink/);
    assert.match(dashboardCss, /@media \(prefers-reduced-motion: reduce\)/);
});
