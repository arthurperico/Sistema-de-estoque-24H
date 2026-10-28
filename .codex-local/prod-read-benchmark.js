const baseUrl = String(process.env.BENCH_BASE_URL || 'https://estoque.24hlocacoes.com').replace(/\/$/, '');
const username = String(process.env.BENCH_USERNAME || '').trim();
const password = String(process.env.BENCH_PASSWORD || '');

if (!username || !password) {
    throw new Error('BENCH_USERNAME and BENCH_PASSWORD are required');
}

function summarize(samples) {
    const sorted = samples.map((sample) => sample.elapsedMs).sort((left, right) => left - right);
    const average = sorted.reduce((sum, value) => sum + value, 0) / Math.max(sorted.length, 1);
    return {
        count: samples.length,
        averageMs: Number(average.toFixed(1)),
        medianMs: Number((sorted[Math.floor(sorted.length / 2)] || 0).toFixed(1)),
        minMs: Number((sorted[0] || 0).toFixed(1)),
        maxMs: Number((sorted.at(-1) || 0).toFixed(1)),
        bytes: samples[0]?.bytes || 0,
        rows: samples[0]?.rows ?? null
    };
}

async function timedGet(pathname, cookie) {
    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}${pathname}`, {
        headers: { Cookie: cookie, 'Cache-Control': 'no-cache' }
    });
    const body = await response.text();
    const elapsedMs = performance.now() - startedAt;
    let rows = null;
    try {
        const parsed = JSON.parse(body);
        if (Array.isArray(parsed)) rows = parsed.length;
    } catch {
        // Static HTML is intentionally not parsed.
    }
    if (!response.ok) {
        throw new Error(`${pathname} failed (${response.status}): ${body.slice(0, 200)}`);
    }
    return { elapsedMs, bytes: Buffer.byteLength(body), rows };
}

(async () => {
    const loginResponse = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!loginResponse.ok) {
        throw new Error(`Login failed (${loginResponse.status})`);
    }
    const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Session cookie was not returned');

    const routes = {
        equipments: '/api/equipments?search=',
        cables: '/api/cables?search=',
        otherItems: '/api/other-items?search=',
        dashboard: '/dashboard.html'
    };
    const results = {};

    for (const [name, pathname] of Object.entries(routes)) {
        await timedGet(pathname, cookie);
        const samples = [];
        for (let index = 0; index < 7; index += 1) {
            samples.push(await timedGet(`${pathname}${pathname.includes('?') ? '&' : '?'}bench=${Date.now()}-${index}`, cookie));
        }
        results[name] = summarize(samples);
    }

    console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
});
