import test from 'node:test';
import assert from 'node:assert/strict';

import {
    consolidateQuoteItemsForDisplay,
    getQuoteServiceSuggestions,
    handleQuoteRequest,
    normalizeQuoteServiceItem
} from '../src/worker-quotes.mjs';

const EXPECTED_PRICES = new Map([
    ['PROJETOR DE 6000 LASER', 1000],
    ['PROJETOR DE 7000 LASER', 1400],
    ['PAINEL DE LED', 500],
    ['TOTEM DE LED', 0],
    ['FOTÓGRAFO', 1600],
    ['VIDEOMAKER', 2500],
    ['VÍDEO ATÉ 1 MINUTO', 1800],
    ['VÍDEO ATÉ 3 MINUTOS', 3000],
    ['VÍDEO ATÉ 8 MINUTOS', 6000],
    ['LINK DE INTERNET DEDICADO 100MB', 2200],
    ['LINK DE INTERNET DEDICADO 500MB', 3500],
    ['LINK DE INTERNET STARLINK BACKUP', 1000],
    ['TÉCNICO DE SONORIZAÇÃO', 600],
    ['TÉCNICO DE VÍDEO', 600],
    ['TÉCNICO DE ILUMINAÇÃO', 600],
    ['TÉCNICO DE STREAMING', 1000]
]);

test('catálogo SERVIÇOS contém os itens, preços e quantidade ilimitada', () => {
    const services = getQuoteServiceSuggestions('servicos');

    assert.equal(services.length, EXPECTED_PRICES.size);
    services.forEach((service) => {
        assert.equal(service.category, 'SERVIÇOS');
        assert.equal(service.isService, true);
        assert.equal(service.unlimitedQuantity, true);
        assert.equal(service.name, service.name.toUpperCase());
        assert.equal(service.unitPrice, EXPECTED_PRICES.get(service.name));
    });
});

test('busca de serviços ignora acentos e encontra nomes individuais', () => {
    const services = getQuoteServiceSuggestions('fotografo');

    assert.deepEqual(services.map((service) => service.name), ['FOTÓGRAFO']);
});

test('servidor valida o serviço pelo catálogo e ignora preço ou nome adulterado', () => {
    const item = normalizeQuoteServiceItem({
        isService: true,
        serviceId: 'projetor-6000-laser',
        description: 'nome adulterado',
        quantity: 3,
        dailyUnits: 2,
        internalUnitPrice: 1
    }, 4);

    assert.deepEqual(item, {
        equipmentId: null,
        serviceId: 'projetor-6000-laser',
        serviceWidth: null,
        serviceHeight: null,
        isManual: false,
        isService: true,
        category: 'SERVIÇOS',
        description: 'PROJETOR DE 6000 LASER',
        quantity: 3,
        dailyUnits: 2,
        internalUnitPrice: 1000,
        internalTotal: 6000,
        sortOrder: 5
    });
});

test('preço alterado pelo editor fica restrito ao orçamento', () => {
    const item = normalizeQuoteServiceItem({
        isService: true,
        serviceId: 'projetor-6000-laser',
        quantity: 2,
        dailyUnits: 3,
        internalUnitPrice: 825,
        priceOverride: true
    }, 0);

    assert.equal(item.internalUnitPrice, 825);
    assert.equal(item.internalTotal, 4950);
});

test('Painel de LED exige tamanho e calcula R$ 500 por metro quadrado', () => {
    const item = normalizeQuoteServiceItem({
        isService: true,
        serviceId: 'painel-de-led',
        serviceWidth: 4,
        serviceHeight: 10,
        quantity: 2,
        dailyUnits: 1,
        internalUnitPrice: 1
    });

    assert.equal(item.description, 'PAINEL DE LED 4x10 METROS');
    assert.equal(item.serviceWidth, 4);
    assert.equal(item.serviceHeight, 10);
    assert.equal(item.internalUnitPrice, 20000);
    assert.equal(item.internalTotal, 40000);
    assert.throws(
        () => normalizeQuoteServiceItem({
            isService: true,
            serviceId: 'painel-de-led',
            quantity: 1,
            dailyUnits: 1
        }),
        /largura e altura válidas/
    );
});

test('Totem de LED começa zerado e aceita preço autorizado pelo banco', () => {
    const item = normalizeQuoteServiceItem({
        isService: true,
        serviceId: 'totem-de-led',
        quantity: 3,
        dailyUnits: 2,
        internalUnitPrice: 999
    }, 0, new Map([['totem-de-led', 750]]));

    assert.equal(item.description, 'TOTEM DE LED');
    assert.equal(item.internalUnitPrice, 750);
    assert.equal(item.internalTotal, 4500);
});

test('administrador pode salvar o preço do Totem de LED no banco', async () => {
    const writes = [];
    const request = new Request('https://example.com/api/orcamentos/servicos/totem-de-led/preco', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitPrice: 875 })
    });
    const response = await handleQuoteRequest({
        request,
        env: {},
        session: { role: 'admin' },
        url: new URL(request.url),
        helpers: {
            queryAll: async () => [],
            queryFirst: async () => null,
            execute: async (env, sql, params) => {
                writes.push({ sql, params });
                return { meta: { changes: 1 } };
            }
        }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.unitPrice, 875);
    assert.equal(writes.length, 1);
    assert.match(writes[0].sql, /quote_service_prices/);
    assert.deepEqual(writes[0].params, ['totem-de-led', 875]);
});

test('ao juntar equipamentos com o mesmo nome preserva o preço individual de cada patrimônio', async () => {
    const reads = [];
    const writes = [];
    const request = new Request('https://example.com/api/orcamentos/equipamentos-grupo/nome', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipmentIds: [101, 102], name: 'PROJETOR LASER' })
    });
    const response = await handleQuoteRequest({
        request,
        env: {},
        session: { role: 'admin' },
        url: new URL(request.url),
        helpers: {
            queryAll: async () => [],
            queryFirst: async (env, sql, params) => {
                reads.push({ sql, params });
                if (/COUNT\(\*\)/i.test(sql)) return { total: 2 };
                throw new Error(`Consulta inesperada: ${sql}`);
            },
            execute: async (env, sql, params) => {
                writes.push({ sql, params });
                return { meta: { changes: 2 } };
            }
        }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.unitPrice, undefined);
    assert.equal(writes.length, 1);
    assert.match(writes[0].sql, /SET quote_name = \?/);
    assert.doesNotMatch(writes[0].sql, /SET name = \?/);
    assert.doesNotMatch(writes[0].sql, /unit_price/i);
    assert.ok(reads.every(({ sql }) => !/unit_price/i.test(sql)));
});

test('Painéis de tamanhos diferentes permanecem em linhas separadas', () => {
    const items = consolidateQuoteItemsForDisplay([
        normalizeQuoteServiceItem({
            isService: true,
            serviceId: 'painel-de-led',
            serviceWidth: 4,
            serviceHeight: 10,
            quantity: 1,
            dailyUnits: 1
        }),
        normalizeQuoteServiceItem({
            isService: true,
            serviceId: 'painel-de-led',
            serviceWidth: 3,
            serviceHeight: 6,
            quantity: 1,
            dailyUnits: 1
        })
    ]);

    assert.equal(items.length, 2);
    assert.deepEqual(items.map((item) => item.description), [
        'PAINEL DE LED 4X10 METROS',
        'PAINEL DE LED 3X6 METROS'
    ]);
});

test('serviços repetidos são consolidados e permanecem em maiúsculas no orçamento', () => {
    const items = consolidateQuoteItemsForDisplay([
        {
            serviceId: 'tecnico-video',
            isService: true,
            description: 'Técnico de vídeo',
            quantity: 2,
            dailyUnits: 1,
            internalUnitPrice: 600,
            internalTotal: 1200
        },
        {
            serviceId: 'tecnico-video',
            isService: true,
            description: 'TÉCNICO DE VÍDEO',
            quantity: 3,
            dailyUnits: 1,
            internalUnitPrice: 600,
            internalTotal: 1800
        }
    ]);

    assert.equal(items.length, 1);
    assert.equal(items[0].description, 'TÉCNICO DE VÍDEO');
    assert.equal(items[0].quantity, 5);
    assert.equal(items[0].internalUnitPrice, 600);
    assert.equal(items[0].internalTotal, 3000);
});

test('equipamentos do mesmo tópico ficam juntos no PDF independentemente da ordem de inclusão', () => {
    const items = consolidateQuoteItemsForDisplay([
        {
            equipmentId: 1,
            category: 'ÁUDIO',
            description: 'Caixa de som',
            quantity: 1,
            dailyUnits: 1,
            internalTotal: 100
        },
        {
            equipmentId: 2,
            category: 'ILUMINAÇÃO',
            description: 'Refletor',
            quantity: 1,
            dailyUnits: 1,
            internalTotal: 80
        },
        {
            equipmentId: 3,
            category: 'audio',
            description: 'Mesa de som',
            quantity: 1,
            dailyUnits: 1,
            internalTotal: 120
        }
    ]);

    assert.deepEqual(items.map((item) => item.description), [
        'Caixa de som',
        'Mesa de som',
        'Refletor'
    ]);
});

test('Banco de Orçamentos recebe o tópico SERVIÇOS sem executar escrita', async () => {
    let writes = 0;
    const request = new Request('https://example.com/api/orcamentos/equipamentos-banco?search=servicos');
    const response = await handleQuoteRequest({
        request,
        env: {},
        session: { role: 'admin' },
        url: new URL(request.url),
        helpers: {
            queryAll: async () => [],
            queryFirst: async () => null,
            execute: async () => {
                writes += 1;
                return { meta: { changes: 0 } };
            }
        }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.equipments.length, 0);
    assert.equal(payload.services.length, EXPECTED_PRICES.size);
    assert.equal(writes, 0);
});

test('serviços podem ser pesquisados sem datas porque não usam disponibilidade de estoque', async () => {
    const request = new Request('https://example.com/api/orcamentos/equipamentos-disponiveis?search=servicos');
    const response = await handleQuoteRequest({
        request,
        env: {},
        session: { role: 'comercial' },
        url: new URL(request.url),
        helpers: {
            queryAll: async (env, sql) => {
                assert.match(sql, /quote_service_prices/);
                return [];
            },
            queryFirst: async () => {
                throw new Error('A busca exclusiva de serviços não deve consultar equipamentos.');
            },
            execute: async () => {
                throw new Error('A busca exclusiva de serviços não deve executar escrita.');
            }
        }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.eventRange, null);
    assert.equal(payload.equipments.length, EXPECTED_PRICES.size);
    assert.equal(payload.equipments.every((item) => item.isService && item.unlimitedQuantity), true);
});
