const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { PDFParse } = require(path.join(__dirname, 'pdf-tools', 'node_modules', 'pdf-parse'));

const projectRoot = path.resolve(__dirname, '..');
const pdfPath = 'C:\\Users\\Arthur S\\Downloads\\EQUIPAMENTOS 24HLOCACOES - Google Planilhas.pdf';
const dbPath = path.join(projectRoot, 'banco de dados', 'database.db');
const applyChanges = process.argv.includes('--apply');

const topicPlan = [
    { topic: 'SWITCH', count: 19 },
    { topic: 'ROTEADOR WI-FI', count: 18 },
    { topic: 'PERIFERICOS INTERNET', count: 4 },
    { topic: 'CONVERSOR FIBRA/REDE', count: 10 },
    { topic: 'STARLINK V2', count: 22 },
    { topic: 'STARLINK STANDARD', count: 3 },
    { topic: 'STARLINK MINI', count: 16 },
    { topic: 'ADAPTADOR STARLINK', count: 7 }
];

const reportTopicCategories = new Set([
    ...topicPlan.map((item) => item.topic),
    'STARLINK'
]);

function compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function toUpper(value) {
    const text = compact(value);
    return text ? text.toLocaleUpperCase('pt-BR') : '';
}

function splitNameAndObservation(rawName) {
    const observations = [];
    const nameWithoutObservation = String(rawName || '').replace(/\(([^)]*)\)/g, (_, content) => {
        const cleanContent = compact(content);
        if (cleanContent) observations.push(cleanContent);
        return ' ';
    });

    return {
        name: toUpper(nameWithoutObservation),
        observation: observations.length ? toUpper(observations.join('; ')) : null
    };
}

function parseDataLine(line) {
    const parts = line.split('\t').map(compact).filter(Boolean);
    if (parts.length < 3) return null;

    const serialNumber = parts[parts.length - 1];
    const barcode = parts[parts.length - 2];
    const rawName = parts.slice(0, -2).join(' ');

    if (!/^\d{3,5}$/.test(barcode)) return null;

    const normalized = splitNameAndObservation(rawName);
    return {
        rawName,
        name: normalized.name,
        observation: normalized.observation,
        barcode: barcode.padStart(4, '0'),
        serialNumber: toUpper(serialNumber)
    };
}

async function extractRecordsFromPdf() {
    const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
    const result = await parser.getText();
    await parser.destroy();

    const records = result.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('TOPICO:') && !line.startsWith('--'))
        .map(parseDataLine)
        .filter(Boolean);

    const expectedCount = topicPlan.reduce((sum, item) => sum + item.count, 0);
    if (records.length !== expectedCount) {
        throw new Error(`Foram extraidas ${records.length} linhas, mas o esperado era ${expectedCount}.`);
    }

    let index = 0;
    for (const item of topicPlan) {
        for (let i = 0; i < item.count; i += 1) {
            records[index].topic = item.topic;
            index += 1;
        }
    }

    const seen = new Set();
    const duplicates = records.filter((record) => {
        if (seen.has(record.barcode)) return true;
        seen.add(record.barcode);
        return false;
    });
    if (duplicates.length) {
        throw new Error(`Patrimonios duplicados na planilha: ${duplicates.map((item) => item.barcode).join(', ')}`);
    }

    return records;
}

function openDb() {
    return new sqlite3.Database(dbPath);
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
    });
}

function run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(error) {
            error ? reject(error) : resolve(this);
        });
    });
}

function closeDb(db) {
    return new Promise((resolve, reject) => {
        db.close((error) => error ? reject(error) : resolve());
    });
}

function normalizeBarcode(value) {
    return String(value || '').trim().padStart(4, '0');
}

function sortByBarcode(items) {
    return items.slice().sort((a, b) => {
        const barcodeA = normalizeBarcode(a.barcode || a.patrimonio);
        const barcodeB = normalizeBarcode(b.barcode || b.patrimonio);
        return Number(barcodeA) - Number(barcodeB) || barcodeA.localeCompare(barcodeB);
    });
}

async function main() {
    if (!fs.existsSync(pdfPath)) throw new Error(`PDF nao encontrado: ${pdfPath}`);
    if (!fs.existsSync(dbPath)) throw new Error(`Banco local nao encontrado: ${dbPath}`);

    const records = await extractRecordsFromPdf();
    const recordByBarcode = new Map(records.map((record) => [record.barcode, record]));
    const db = openDb();

    try {
        const equipments = await all(db, 'SELECT id, name, barcode, category, serial_number, observation FROM equipments');
        const equipmentByBarcode = new Map(equipments.map((item) => [normalizeBarcode(item.barcode), item]));

        const updates = records
            .filter((record) => equipmentByBarcode.has(record.barcode))
            .map((record) => ({
                ...record,
                current: equipmentByBarcode.get(record.barcode)
            }));

        const newPatrimonios = records
            .filter((record) => !equipmentByBarcode.has(record.barcode))
            .map((record) => ({
                patrimonio: record.barcode,
                nome: record.name,
                observacao: record.observation || '',
                numeroPatrimonio: record.serialNumber,
                topico: record.topic
            }));

        const notAlteredInDb = equipments
            .filter((item) => reportTopicCategories.has(toUpper(item.category)))
            .filter((item) => !recordByBarcode.has(normalizeBarcode(item.barcode)))
            .map((item) => ({
                patrimonio: normalizeBarcode(item.barcode),
                nomeAtual: item.name,
                categoriaAtual: item.category || '',
                numeroPatrimonioAtual: item.serial_number || '',
                observacaoAtual: item.observation || ''
            }));

        if (applyChanges) {
            await run(db, 'BEGIN IMMEDIATE TRANSACTION');
            try {
                for (const update of updates) {
                    await run(
                        db,
                        `UPDATE equipments
                         SET name = ?,
                             observation = ?,
                             barcode = ?,
                             serial_number = ?,
                             category = ?
                         WHERE id = ?`,
                        [
                            update.name,
                            update.observation,
                            update.barcode,
                            update.serialNumber,
                            update.topic,
                            update.current.id
                        ]
                    );
                }
                await run(db, 'COMMIT');
            } catch (error) {
                await run(db, 'ROLLBACK').catch(() => {});
                throw error;
            }
        }

        const report = {
            mode: applyChanges ? 'apply' : 'dry-run',
            pdfRecords: records.length,
            updatedCount: updates.length,
            newPatrimoniosCount: newPatrimonios.length,
            notAlteredInDbCount: notAlteredInDb.length,
            newPatrimonios: sortByBarcode(newPatrimonios),
            notAlteredInDb: sortByBarcode(notAlteredInDb),
            updatedPreview: sortByBarcode(updates).slice(0, 10).map((item) => ({
                patrimonio: item.barcode,
                nomeAntes: item.current.name,
                nomeDepois: item.name,
                observacaoDepois: item.observation || '',
                numeroPatrimonioDepois: item.serialNumber,
                topicoDepois: item.topic
            }))
        };

        console.log(JSON.stringify(report, null, 2));
    } finally {
        await closeDb(db);
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
