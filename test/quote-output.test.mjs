import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

import {
    buildQuotePdfContentDisposition,
    buildQuotePdfFilename,
    createQuotePdf,
    groupQuoteEquipmentsByName,
    handleQuoteRequest
} from '../src/worker-quotes.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const dashboardSource = fs.readFileSync(
    path.join(projectRoot, 'javascript', 'dashboard.js'),
    'utf8'
);
const serverSource = fs.readFileSync(
    path.join(projectRoot, 'server.js'),
    'utf8'
);
const workerQuoteSource = fs.readFileSync(
    path.join(projectRoot, 'src', 'worker-quotes.mjs'),
    'utf8'
);
const browserPdfSource = fs.readFileSync(
    path.join(projectRoot, 'src', 'quote-pdf-browser.mjs'),
    'utf8'
);
const dashboardHtmlSource = fs.readFileSync(
    path.join(projectRoot, 'html', 'dashboard.html'),
    'utf8'
);

const QUOTE_HEADER_24H_SHA256 = '87580842c7d7896c2ac394291fcf6b73765eb75802a9c79c7d282fbfd817f293';

function sha256File(relativePath) {
    return crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(projectRoot, relativePath)))
        .digest('hex');
}

test('cabecalho do orcamento preserva exatamente a identidade visual da 24H', () => {
    assert.equal(sha256File(path.join('fotos', 'quote-header.png')), QUOTE_HEADER_24H_SHA256);
    assert.equal(sha256File(path.join('public', 'fotos', 'quote-header.png')), QUOTE_HEADER_24H_SHA256);
});

function createWirelessLinkEquipment(id) {
    return {
        id,
        name: 'TRANSMISSOR SEM FIO',
        barcode: String(id).padStart(4, '0'),
        category: 'LINK SEM FIO',
        serialNumber: `SERIE-${id}`,
        observation: id % 2 === 0 ? 'RECEPTOR' : 'TRANSMISSOR',
        currentStatus: 'Disponível',
        unitPrice: 300
    };
}

test('LINK SEM FIO volta a agrupar patrimônios com o mesmo nome', () => {
    const groups = groupQuoteEquipmentsByName(
        [createWirelessLinkEquipment(101), createWirelessLinkEquipment(102)],
        new Set(),
        new Map([['transmissor sem fio', 2]])
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0].totalQuantity, 2);
    assert.equal(groups[0].availableQuantity, 2);
    assert.equal(groups[0].equipments.length, 2);
    assert.equal(Object.hasOwn(groups[0], 'ungrouped'), false);
    assert.equal(Object.hasOwn(groups[0], 'barcode'), false);
});

test('nome do PDF usa evento, cliente e data do evento em DD-MM-AAAA', () => {
    const filename = buildQuotePdfFilename({
        eventName: 'Festival de Inverno',
        clientName: 'Cliente Exemplo',
        eventDatetime: '18/07/2026 às 20:00'
    });

    assert.equal(
        filename,
        'Festival de Inverno - Cliente Exemplo - 18-07-2026.pdf'
    );
});

test('nome do PDF usa a primeira data do evento e remove caracteres inválidos', () => {
    const filename = buildQuotePdfFilename({
        eventName: 'Evento: São João/2026',
        clientName: 'Cliente "Ágil".',
        eventDatetime: '18/07/2026 a 20/07/2026'
    });

    assert.equal(
        filename,
        'Evento São João 2026 - Cliente Ágil - 18-07-2026.pdf'
    );
});

test('cabeçalho do PDF preserva acentos com filename UTF-8 e oferece fallback ASCII', () => {
    const contentDisposition = buildQuotePdfContentDisposition({
        eventName: 'Evento São João',
        clientName: 'José',
        eventDatetime: '18/07/2026'
    });

    assert.match(
        contentDisposition,
        /filename="Evento Sao Joao - Jose - 18-07-2026\.pdf"/
    );
    assert.match(
        contentDisposition,
        /filename\*=UTF-8''Evento%20S%C3%A3o%20Jo%C3%A3o%20-%20Jos%C3%A9%20-%2018-07-2026\.pdf/
    );
});

test('Worker e servidor local usam o novo nome em todos os PDFs de orçamento', () => {
    assert.match(serverSource, /buildQuotePdfContentDisposition\(quote\)/);
    assert.doesNotMatch(serverSource, /filename="orcamento-\$\{quoteId\}\.pdf"/);
});

test('orçamento unifica Técnicos e Logística e os exibe no bloco SERVIÇOS do PDF', () => {
    assert.match(dashboardHtmlSource, /id="quoteServicesPrice"/);
    assert.doesNotMatch(dashboardHtmlSource, /id="quoteLogisticsPrice"/);
    assert.doesNotMatch(dashboardHtmlSource, /id="quoteTechniciansPrice"/);
    assert.doesNotMatch(dashboardHtmlSource, /id="quoteTechnicianName"/);
    assert.doesNotMatch(dashboardHtmlSource, /id="quoteTechniciansTable"/);
    assert.match(dashboardSource, /logisticsPrice: 0/);
    assert.match(dashboardSource, /techniciansPrice: parseQuoteMoneyInput\(document\.getElementById\('quoteServicesPrice'\)/);
    assert.match(dashboardSource, /technicians: \[\]/);

    for (const source of [serverSource, workerQuoteSource]) {
        assert.match(source, /24H LOCAÇÃO DE EQUIPAMENTOS LTDA/);
        assert.match(source, /CNPJ: 11\.393\.866\/0001-26/);
        assert.doesNotMatch(source, /\['Item', 'Equipamentos e Serviços'/);
        assert.match(source, /drawQuoteFixedServicesTable/);
        assert.match(source, /\['Item', 'Serviços', 'Quant', 'Diárias\/Uni\.', 'Valor Total\/Uni\.'\]/);
        assert.match(source, /'Técnicos e Logística'/);
        assert.match(source, /formatQuoteCurrency\(\(Number\(quote\.techniciansPrice\) \|\| 0\) \+ \(Number\(quote\.logisticsPrice\) \|\| 0\)\)/);
        assert.match(source, /bold: index === 1/);
        assert.match(source, /fontSize: index === 1 \? 10/);
        assert.match(source, /24H LOCAÇÃO DE EQUIPAMENTOS LTDA[\s\S]{0,220}align: 'center'/);
        assert.match(source, /CNPJ: 11\.393\.866\/0001-26[\s\S]{0,220}align: 'center'/);
        assert.match(source, /align: index === 1 \? 'center' : 'left'/);
        assert.match(source, /function getQuoteItemTableWidths\(\) \{\s+return \[56\.7, 240\.3, 43, 70, 107\.2\];/);
        assert.match(source, /values\.push\(showItemPrices \? formatQuoteCurrency\(item\.internalTotal\) : ''\)/);
        assert.match(source, /'Valor Total dos Equipamentos'/);
        assert.match(source, /'Valor Total dos Equipamentos'[\s\S]*?bold: false/);
        assert.doesNotMatch(source, /bold: valueIndex === 1 \|\| valueIndex === 4/);
        assert.doesNotMatch(source, /'Valor Total dos Equipamentos'[\s\S]*?bold: valueIndex === 4/);
        assert.match(source, /formatQuoteCurrency\(options\.equipmentTotal\)/);
        assert.match(source, /showEquipmentTotal: remainingItems\.length === 0/);
        assert.match(source, /drawQuoteCellText\([\s\S]*?'Valor Total'[\s\S]*?bold: true/);
        assert.match(source, /\['Valor Total', formatQuoteCurrency\(quote\.finalTotal\), true, 30\.5\]/);
        assert.match(source, /bold: index === 0/);
    }
    assert.doesNotMatch(dashboardHtmlSource, /id="quoteShowItemPrices" checked disabled/);
    assert.match(dashboardSource, /showItemPrices: !!document\.getElementById\('quoteShowItemPrices'\)\?\.checked/);
    assert.match(dashboardHtmlSource, /id="quoteShowServicesPrice"/);
    assert.match(dashboardSource, /showServicesPrice: !!document\.getElementById\('quoteShowServicesPrice'\)\?\.checked/);
    assert.doesNotMatch(workerQuoteSource, /show_services_price/);
    assert.match(workerQuoteSource, /const showServicesPrice = quote\.showServicesPrice === true/);
    assert.match(workerQuoteSource, /if \(!showServicesPrice\) rows\[0\]\[4\] = ''/);
});

test('criação do orçamento baixa o PDF sem abrir uma aba branca', () => {
    const functionStart = dashboardSource.indexOf('async function createQuote()');
    const functionEnd = dashboardSource.indexOf('function getLocalDateString', functionStart);
    assert.ok(functionStart >= 0 && functionEnd > functionStart);

    const createQuoteSource = dashboardSource.slice(functionStart, functionEnd);
    assert.doesNotMatch(createQuoteSource, /window\.open\(/);
    assert.match(createQuoteSource, /await downloadGeneratedQuotePdf\(data\.id, \{\s+showServicesPrice:/);
    assert.match(dashboardSource, /QuotePdfClient\?\.downloadQuotePdf/);
    assert.match(browserPdfSource, /URL\.createObjectURL\(blob\)/);
    assert.match(browserPdfSource, /downloadLink\.click\(\)/);
});

test('todos os botões de PDF baixam o arquivo nomeado sem abrir uma URL blob em outra aba', () => {
    assert.match(dashboardSource, /async function downloadExistingQuotePdf\(quoteId\)/);
    assert.equal(
        (dashboardSource.match(/onclick="downloadExistingQuotePdf\(\$\{quoteId\}\)"/g) || []).length,
        3
    );
    assert.doesNotMatch(dashboardSource, /window\.open\('\/api\/orcamentos\/\$\{quoteId\}\/pdf'/);
    assert.match(
        browserPdfSource,
        /if \(bootstrapQuoteId\) \{\s+downloadQuotePdf\(bootstrapQuoteId\)/
    );
});

test('download do orçamento preserva o nome UTF-8 enviado pelo Worker', () => {
    const functionStart = dashboardSource.indexOf('function getGeneratedQuotePdfFilename(');
    const functionEnd = dashboardSource.indexOf('\n\nasync function downloadGeneratedQuotePdf(', functionStart);
    assert.ok(functionStart >= 0 && functionEnd > functionStart);

    const getGeneratedQuotePdfFilename = new Function(
        `return (${dashboardSource.slice(functionStart, functionEnd)});`
    )();
    const filename = getGeneratedQuotePdfFilename(
        `inline; filename="Evento Sao Joao.pdf"; filename*=UTF-8''Evento%20S%C3%A3o%20Jo%C3%A3o.pdf`,
        42
    );

    assert.equal(filename, 'Evento São João.pdf');
});

test('rota do Worker entrega o gerador de navegador sem processar o PDF', async () => {
    const request = new Request('https://example.com/api/orcamentos/42/pdf');
    const helpers = {
        queryFirst: async () => ({ id: 42 }),
        queryAll: async () => [],
        execute: async () => ({ meta: { changes: 0 } })
    };
    const response = await handleQuoteRequest({
        request,
        env: {},
        session: { role: 'admin' },
        url: new URL(request.url),
        helpers
    });

    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type'), /^text\/html/);
    assert.equal(response.headers.get('X-Quote-PDF-Renderer'), 'browser');
    assert.match(html, /data-quote-pdf-id="42"/);
    assert.match(html, /quote-pdf-client\.js/);
});

test('gerador usado no navegador preserva um PDF válido', async () => {
    const quote = {
        id: 42,
        proposalCity: 'Belo Horizonte',
        proposalDate: '21/07/2026',
        clientName: 'Cliente Teste',
        eventName: 'Evento Teste',
        eventLocation: 'Local Teste',
        eventDatetime: '25/07/2026 às 18:00',
        assemblyDatetime: '25/07/2026 às 08:00',
        disassemblyDatetime: '26/07/2026 às 08:00',
        paymentMethod: 'PIX',
        paymentDeadline: '5 dias',
        logisticsPrice: 0,
        techniciansPrice: 100,
        finalTotal: 200,
        showItemPrices: true,
        showServicesPrice: true,
        notes: '',
        items: [{
            id: 1,
            equipmentId: null,
            isManual: true,
            isService: false,
            category: 'outros',
            description: 'Equipamento Teste',
            quantity: 1,
            dailyUnits: 1,
            internalUnitPrice: 100,
            internalTotal: 100,
            sortOrder: 1
        }]
    };
    const request = new Request('https://example.com/');
    const env = { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } };
    const pdfBytes = await createQuotePdf(quote, request, env);
    const pdfWithoutItemPrices = await createQuotePdf(
        { ...quote, showItemPrices: false },
        request,
        env
    );

    assert.equal(new TextDecoder().decode(pdfBytes.slice(0, 4)), '%PDF');
    assert.ok(pdfBytes.length > 1_000);
    assert.ok(
        pdfBytes.length > pdfWithoutItemPrices.length,
        'marcar a opção deve acrescentar os preços e o total dos equipamentos ao PDF'
    );
});

test('PDF mantém até cinco linhas compactas na primeira página e leva a sexta para continuação', async () => {
    const createQuote = (itemCount) => ({
        proposalCity: 'Belo Horizonte',
        proposalDate: '2026-07-21',
        clientName: 'Cliente Teste',
        eventName: 'Evento Teste',
        eventLocation: 'Local Teste',
        eventDatetime: '25/07/2026 até 25/07/2026',
        assemblyDatetime: '24/07/2026 até 24/07/2026',
        disassemblyDatetime: '26/07/2026 até 26/07/2026',
        paymentMethod: 'PIX',
        paymentDeadline: '5 dias',
        logisticsPrice: 0,
        techniciansPrice: 100,
        finalTotal: itemCount * 100 + 100,
        showItemPrices: true,
        notes: '',
        items: Array.from({ length: itemCount }, (_, index) => ({
            id: index + 1,
            equipmentId: null,
            isManual: true,
            isService: false,
            category: 'outros',
            description: `Equipamento ${index + 1}`,
            quantity: 1,
            dailyUnits: 1,
            internalUnitPrice: 100,
            internalTotal: 100,
            sortOrder: index + 1
        }))
    });
    const request = new Request('https://example.com/');
    const env = { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } };

    const compactPdf = await PDFDocument.load(await createQuotePdf(createQuote(5), request, env));
    const continuationPdf = await PDFDocument.load(await createQuotePdf(createQuote(6), request, env));

    assert.equal(compactPdf.getPageCount(), 2, 'uma página de orçamento e uma de responsabilidades');
    assert.equal(continuationPdf.getPageCount(), 3, 'a sexta linha cria uma página de continuação antes das responsabilidades');
});

test('tela de orçamentos não mantém tratamento individual para LINK SEM FIO', () => {
    assert.doesNotMatch(dashboardSource, /isUngroupedQuoteEquipmentTopic/);
    assert.doesNotMatch(dashboardSource, /saveQuoteEquipmentUnitPrice/);
    assert.doesNotMatch(dashboardSource, /quote-ungrouped-equipment-details/);
});
