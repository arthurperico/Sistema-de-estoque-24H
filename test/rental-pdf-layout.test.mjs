import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const eventSource = fs.readFileSync(
    path.join(projectRoot, 'javascript', 'event.js'),
    'utf8'
);
const serverSource = fs.readFileSync(path.join(projectRoot, 'server.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(projectRoot, 'src', 'worker.mjs'), 'utf8');
const eventHtmlSource = fs.readFileSync(path.join(projectRoot, 'html', 'event.html'), 'utf8');
const eventCssSource = fs.readFileSync(path.join(projectRoot, 'css', 'event.css'), 'utf8');
const rentalPdfSource = eventSource.slice(
    eventSource.indexOf('async function generateSaidaPdf'),
    eventSource.indexOf('function generateAgsPdf')
);

test('novo layout fica restrito ao romaneio de locação das marcas 24H e AGS', () => {
    assert.match(rentalPdfSource, /const isRentalPdf = eventType === 'rental'/);
    assert.match(rentalPdfSource, /const marginX = isRentalPdf \? 10 : 18/);
    assert.match(rentalPdfSource, /const logoWidth = isRentalPdf \? \(isAgsPdf \? 84 : 88\)/);
    assert.match(rentalPdfSource, /const logoHeight = isRentalPdf \? \(isAgsPdf \? 38\.5 : 19\)/);
    assert.match(rentalPdfSource, /const logoX = \(pageWidth - logoWidth\) \/ 2/);
    assert.match(rentalPdfSource, /doc\.setFontSize\(isRentalPdf \? 20 : 18\)/);
    assert.doesNotMatch(rentalPdfSource, /doc\.rect\(logoX, logoY, logoWidth, logoHeight\)/);
    assert.match(rentalPdfSource, /const shouldRenderGroupHeading = !isRentalPdf \|\| !group\.isDefault/);
    assert.match(rentalPdfSource, /if \(isRentalPdf\) \{[\s\S]*const infoRows/);
    assert.match(rentalPdfSource, /if \(isRentalPdf\) \{[\s\S]*Assinatura do responsável/);
});

test('layout A4 remove transparência da logo e usa tipografia maior', () => {
    assert.match(eventSource, /async function trimTransparentImageDataUrl/);
    assert.match(rentalPdfSource, /removeNearBlackBackground: !isAgsPdf/);
    assert.match(rentalPdfSource, /doc\.setFontSize\(12\.5\)/);
    assert.match(rentalPdfSource, /doc\.setFontSize\(11\.5\)/);
    assert.match(rentalPdfSource, /const signatureWidth = 90/);
});

test('romaneio de locação usa linhas nas informações e reserva o rodapé da assinatura', () => {
    assert.match(rentalPdfSource, /const pageContentBottom = isRentalPdf \? pageHeight - 50/);
    assert.match(rentalPdfSource, /doc\.line\(marginX \+ labelWidth/);
    assert.match(rentalPdfSource, /doc\.rect\(marginX, cursorY, tableWidth, rowHeight\)/);
    assert.match(rentalPdfSource, /const signatureLineY = pageHeight - 30/);
    assert.match(rentalPdfSource, /pageWidth \/ 2, signatureLineY \+ 6, \{ align: 'center' \}/);
});

test('equipamentos, observações e patrimônios ocupam colunas separadas no romaneio de locação', () => {
    assert.match(eventSource, /equipments\.push\(\{ name, observation, patrimonio \}\)/);
    assert.match(rentalPdfSource, /headers: \['Equipamentos', 'Observação', 'Patrimônios'\]/);
    assert.match(rentalPdfSource, /ratios: \[0\.45, 0\.35, 0\.20\]/);
    assert.match(rentalPdfSource, /formatter: \(equipment\) => \[equipment\.name, equipment\.observation, equipment\.patrimonio \|\| '-'\]/);
    assert.match(rentalPdfSource, /doc\.line\(columnX, cursorY, columnX, cursorY \+ rowHeight\)/);
});

test('histórico fornece a observação individual e traço é convertido em célula vazia', () => {
    const historyColumns = /e\.name AS equipment_name,\s*e\.barcode,\s*e\.observation/;
    assert.match(serverSource, historyColumns);
    assert.match(workerSource, historyColumns);
    assert.match(eventSource, /const observation = rawObservation === '-' \? '' : rawObservation/);
    assert.match(rentalPdfSource, /String\(value \?\? ''\)/);
});

test('locação oferece impressão 24H e AGS em duas vias', () => {
    assert.match(eventHtmlSource, /id="printRental24hButton"[\s\S]*printRentalPdf\('24h'\)[\s\S]*Imprimir 24H \(2 vias\)/);
    assert.match(eventHtmlSource, /id="printRentalAgsButton"[\s\S]*printRentalPdf\('ags'\)[\s\S]*Imprimir AGS \(2 vias\)/);
    assert.match(eventSource, /button\.hidden = eventType !== 'rental'/);
    assert.match(rentalPdfSource, /appendPdfCopies\(doc, 2\)/);
    assert.match(eventSource, /const printFrame = document\.createElement\('iframe'\)/);
    assert.match(eventSource, /frameWindow\.print\(\)/);
    assert.doesNotMatch(rentalPdfSource, /doc\.autoPrint|printWindow|window\.open/);
    assert.match(eventCssSource, /flex: 1 1 calc\(50% - 6px\)/);
});

test('download do PDF 24H não depende do seletor nativo após buscas assíncronas', () => {
    assert.doesNotMatch(eventSource, /showSaveFilePicker/);
    assert.match(eventSource, /link\.download = fileName/);
    assert.match(eventSource, /link\.click\(\)/);
    assert.match(eventSource, /removeNearBlackBackground: !isAgsPdf/);
    assert.match(eventSource, /'\/fotos\/logo-24h\.png'/);
    assert.match(eventSource, /function formatPdfText\(value\)/);
    assert.match(eventSource, /Página \$\{pageNumber\} de \$\{totalPages\}/);
});

test('duplicação mantém duas cópias completas e na mesma ordem', () => {
    const helperSource = eventSource.slice(
        eventSource.indexOf('function appendPdfCopies'),
        eventSource.indexOf('async function presentPdfForPrinting')
    );
    const context = {};
    vm.runInNewContext(`${helperSource}; this.appendPdfCopies = appendPdfCopies;`, context);

    const doc = {
        internal: { pages: [null, ['page-1'], ['page-2']] },
        getNumberOfPages() {
            return this.internal.pages.length - 1;
        },
        addPage() {
            this.internal.pages.push(['new-page']);
        }
    };

    context.appendPdfCopies(doc, 2);
    assert.equal(
        JSON.stringify(doc.internal.pages.slice(1)),
        JSON.stringify([['page-1'], ['page-2'], ['page-1'], ['page-2']])
    );
});
