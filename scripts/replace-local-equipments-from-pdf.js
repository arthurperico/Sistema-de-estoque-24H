const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const sqlite3 = require('sqlite3').verbose();

const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const appendMode = args.includes('--append');
const pdfArg = args.find((arg) => !arg.startsWith('--'));
const pdfPath = pdfArg || path.resolve(process.env.USERPROFILE || '', 'Desktop', 'EQUIPAMENTOS 24HLOCACOES - Google Planilhas.pdf');
const sqliteDbPath = path.join(projectRoot, 'banco de dados', 'database.db');
const backupDir = path.join(projectRoot, 'backups', 'sqlite');
const reportPath = path.join(projectRoot, 'RELATORIO_IMPORTACAO_EQUIPAMENTOS_PLANILHA_24H.md');

const DEFAULT_NAME_COLUMN_LIMIT = 600;
const DEFAULT_BARCODE_COLUMN_LIMIT = 780;

function normalizeWhitespace(value) {
    return String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/[\r\n\u2028\u2029]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function uppercase(value) {
    const normalized = normalizeWhitespace(value);
    return normalized ? normalized.toLocaleUpperCase('pt-BR') : '';
}

function normalizeForSort(value) {
    return uppercase(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function normalizeMissingValue(value) {
    const normalized = uppercase(value);
    return normalizeForSort(normalized) === 'NAO ENCONTRADO' ? '-' : normalized;
}

function rackNumberFromObservation(value) {
    const match = normalizeForSort(value).match(/\bRACK\s*0*(\d+)/);
    return match ? Number(match[1]) : null;
}

function normalizeObservationValue(name, observation, category) {
    if (!observation) return null;

    let normalized = uppercase(observation).replace(/\bRARCK\b/g, 'RACK');

    if (
        category === 'MICROFONE SEM FIO RACK'
        && name === 'BODY PACK SHURE SLXD'
        && rackNumberFromObservation(normalized) === null
    ) {
        normalized = `${normalized}; RACK 05`;
    }

    return normalized;
}

function timestampForFile(date = new Date()) {
    const pad = (number) => String(number).padStart(2, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('')
        + '-'
        + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('');
}

function inflateObjectStream(body) {
    const streamMarker = body.indexOf('stream');
    if (streamMarker === -1) return null;

    let dataStart = streamMarker + 'stream'.length;
    if (body[dataStart] === '\r' && body[dataStart + 1] === '\n') {
        dataStart += 2;
    } else if (body[dataStart] === '\n') {
        dataStart += 1;
    }

    const dataEnd = body.indexOf('endstream', dataStart);
    if (dataEnd === -1) return null;

    let data = Buffer.from(body.slice(dataStart, dataEnd), 'latin1');
    while (data.length && (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d)) {
        data = data.subarray(0, data.length - 1);
    }

    try {
        return zlib.inflateSync(data).toString('latin1');
    } catch (_) {
        return data.toString('latin1');
    }
}

function readPdfObjects(pdfBuffer) {
    const pdfText = pdfBuffer.toString('latin1');
    const objects = new Map();

    for (const match of pdfText.matchAll(/(\d+)\s+0\s+obj\s*([\s\S]*?)\s*endobj/g)) {
        const objectNumber = Number(match[1]);
        const body = match[2];
        objects.set(objectNumber, {
            objectNumber,
            body,
            streamText: inflateObjectStream(body)
        });
    }

    return objects;
}

function buildCharacterMap(cmapText) {
    const map = new Map();

    for (const block of cmapText.match(/\d+ beginbfchar[\s\S]*?endbfchar/gm) || []) {
        for (const match of block.matchAll(/<([0-9A-F]+)>\s*<([0-9A-F]+)>/g)) {
            map.set(match[1].toUpperCase(), String.fromCodePoint(parseInt(match[2], 16)));
        }
    }

    for (const block of cmapText.match(/\d+ beginbfrange[\s\S]*?endbfrange/gm) || []) {
        for (const line of block.split(/\r?\n/)) {
            const simpleRange = line.match(/<([0-9A-F]+)>\s*<([0-9A-F]+)>\s*<([0-9A-F]+)>/);
            if (simpleRange) {
                let source = parseInt(simpleRange[1], 16);
                const sourceEnd = parseInt(simpleRange[2], 16);
                let target = parseInt(simpleRange[3], 16);
                const sourceWidth = simpleRange[1].length;

                while (source <= sourceEnd) {
                    map.set(source.toString(16).toUpperCase().padStart(sourceWidth, '0'), String.fromCodePoint(target));
                    source += 1;
                    target += 1;
                }
                continue;
            }

            const arrayRange = line.match(/<([0-9A-F]+)>\s*<([0-9A-F]+)>\s*\[([^\]]+)\]/);
            if (!arrayRange) continue;

            let source = parseInt(arrayRange[1], 16);
            const sourceWidth = arrayRange[1].length;
            for (const target of arrayRange[3].matchAll(/<([0-9A-F]+)>/g)) {
                map.set(source.toString(16).toUpperCase().padStart(sourceWidth, '0'), String.fromCodePoint(parseInt(target[1], 16)));
                source += 1;
            }
        }
    }

    return map;
}

function buildFontMaps(objects) {
    const fontMaps = new Map();

    for (const object of objects.values()) {
        if (!/\/Type\s*\/Font/.test(object.body)) continue;

        const toUnicodeMatch = object.body.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
        if (!toUnicodeMatch) continue;

        const cmapObject = objects.get(Number(toUnicodeMatch[1]));
        if (!cmapObject?.streamText) continue;

        fontMaps.set(`F${object.objectNumber}`, buildCharacterMap(cmapObject.streamText));
    }

    return fontMaps;
}

function decodeHexString(hex, fontName, fontMaps) {
    const charMap = fontMaps.get(fontName);
    if (!charMap) return '';

    const widths = [...new Set([...charMap.keys()].map((key) => key.length))]
        .sort((a, b) => b - a);
    let decoded = '';

    for (let index = 0; index < hex.length;) {
        let matched = false;

        for (const width of widths) {
            const chunk = hex.slice(index, index + width).toUpperCase();
            if (chunk.length === width && charMap.has(chunk)) {
                decoded += charMap.get(chunk);
                index += width;
                matched = true;
                break;
            }
        }

        if (!matched) index += 2;
    }

    return decoded;
}

function extractTextItems(pdfBuffer) {
    const objects = readPdfObjects(pdfBuffer);
    const fontMaps = buildFontMaps(objects);
    const textItems = [];

    for (const object of objects.values()) {
        const text = object.streamText;
        if (!text || !text.includes('BT')) continue;

        const blocks = text.split('BT').slice(1).map((part) => part.split('ET')[0]);
        for (const block of blocks) {
            const tmMatch = block.match(/1 0 0 -1 ([-0-9.]+) ([-0-9.]+) Tm/);
            if (!tmMatch) continue;

            let currentFont = null;
            let decoded = '';

            for (const token of block.matchAll(/\/(F\d+)\s+[0-9.]+\s+Tf|<([0-9A-F]+)>\s*Tj|\[(.*?)\]\s*TJ/gms)) {
                if (token[1]) {
                    currentFont = token[1];
                } else if (token[2]) {
                    decoded += decodeHexString(token[2], currentFont, fontMaps);
                } else if (token[3]) {
                    for (const hexString of token[3].matchAll(/<([0-9A-F]+)>/g)) {
                        decoded += decodeHexString(hexString[1], currentFont, fontMaps);
                    }
                }
            }

            decoded = normalizeWhitespace(decoded);
            if (!decoded || Number(tmMatch[2]) === 15) continue;

            textItems.push({
                objectNumber: object.objectNumber,
                x: Number(tmMatch[1]),
                y: Number(tmMatch[2]),
                text: decoded
            });
        }
    }

    return textItems.sort((a, b) => a.objectNumber - b.objectNumber || a.y - b.y || a.x - b.x);
}

function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

function inferColumnLimits(textItems) {
    const barcodeCandidates = textItems
        .filter((item) => /^\d{4}$/.test(item.text))
        .map((item) => item.x);
    const barcodeX = median(barcodeCandidates);

    if (barcodeX === null) {
        return {
            nameColumnLimit: DEFAULT_NAME_COLUMN_LIMIT,
            barcodeColumnLimit: DEFAULT_BARCODE_COLUMN_LIMIT
        };
    }

    const serialX = median(
        textItems
            .filter((item) => item.x > barcodeX + 80)
            .map((item) => item.x)
    );

    return {
        nameColumnLimit: Math.max(0, barcodeX - 20),
        barcodeColumnLimit: serialX === null
            ? barcodeX + 140
            : barcodeX + ((serialX - barcodeX) / 2)
    };
}

function splitNameAndObservation(rawName) {
    const observations = [];
    const cleanName = normalizeWhitespace(
        normalizeWhitespace(rawName).replace(/\(([^)]*)\)/g, (_, observation) => {
            const normalizedObservation = normalizeWhitespace(observation);
            if (normalizedObservation) observations.push(normalizedObservation);
            return ' ';
        })
    );

    return {
        name: uppercase(cleanName || rawName),
        observation: observations.length ? uppercase(observations.join('; ')) : null
    };
}

function isHeaderRow(text) {
    return [
        'EQUIPAMENTO',
        'EQUIPAMENTOS',
        'PATRIMONIO',
        'PATRIMONIO',
        'N SERIE',
        'N. SERIE',
        'NUMERO DE SERIE',
        'SERIE',
        'CODIGO DE BARRAS'
    ].includes(normalizeForSort(text));
}

function parsePdfRows(pdfBuffer) {
    const rows = new Map();
    const textItems = extractTextItems(pdfBuffer);
    const { nameColumnLimit, barcodeColumnLimit } = inferColumnLimits(textItems);

    for (const item of textItems) {
        const key = `${item.objectNumber}:${item.y.toFixed(2)}`;
        if (!rows.has(key)) {
            rows.set(key, {
                objectNumber: item.objectNumber,
                y: item.y,
                items: []
            });
        }
        rows.get(key).items.push(item);
    }

    const parsedRows = [];
    let currentCategory = 'SEM CATEGORIA';
    let categoryOrder = -1;
    let sourceOrder = 0;

    for (const row of [...rows.values()].sort((a, b) => a.objectNumber - b.objectNumber || a.y - b.y)) {
        const items = row.items.slice().sort((a, b) => a.x - b.x);
        const name = normalizeWhitespace(
            items
                .filter((item) => item.x < nameColumnLimit)
                .map((item) => item.text)
                .join(' ')
        );
        const barcode = normalizeWhitespace(
            items
                .filter((item) => item.x >= nameColumnLimit && item.x < barcodeColumnLimit)
                .map((item) => item.text)
                .join(' ')
        );
        const serialNumber = normalizeWhitespace(
            items
                .filter((item) => item.x >= barcodeColumnLimit)
                .map((item) => item.text)
                .join(' ')
        );

        if (!name || isHeaderRow(name)) continue;

        if (/^TOPICO\s*:/i.test(name)) {
            currentCategory = uppercase(name.replace(/^TOPICO\s*:\s*/i, '')) || 'SEM CATEGORIA';
            categoryOrder += 1;
            parsedRows.push({
                type: 'category',
                category: currentCategory,
                categoryOrder
            });
            continue;
        }

        if (!barcode && !serialNumber) continue;

        const splitName = splitNameAndObservation(name);
        parsedRows.push({
            type: 'equipment',
            sourceOrder,
            categoryOrder,
            category: currentCategory,
            name: splitName.name,
            barcode: normalizeMissingValue(barcode),
            serialNumber: normalizeMissingValue(serialNumber) || null,
            observation: normalizeObservationValue(splitName.name, splitName.observation, currentCategory)
        });
        sourceOrder += 1;
    }

    return parsedRows;
}

function barcodeSortValue(value) {
    return /^\d+$/.test(value) ? Number(value) : Number.MAX_SAFE_INTEGER;
}

function compareEquipmentsByTopicOrder(a, b) {
    if (a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;

    if (a.category === 'MICROFONE SEM FIO RACK' && b.category === 'MICROFONE SEM FIO RACK') {
        const rackA = rackNumberFromObservation(a.observation);
        const rackB = rackNumberFromObservation(b.observation);
        const rackGroupA = rackA === null ? Number.MAX_SAFE_INTEGER : rackA;
        const rackGroupB = rackB === null ? Number.MAX_SAFE_INTEGER : rackB;

        if (rackGroupA !== rackGroupB) return rackGroupA - rackGroupB;
    }

    return normalizeForSort(a.name).localeCompare(normalizeForSort(b.name), 'pt-BR')
        || barcodeSortValue(a.barcode) - barcodeSortValue(b.barcode)
        || a.barcode.localeCompare(b.barcode, 'pt-BR')
        || a.sourceOrder - b.sourceOrder;
}

function buildImportPlan(parsedRows) {
    const categories = [];
    const seenCategories = new Set();

    for (const row of parsedRows.filter((entry) => entry.type === 'category')) {
        if (seenCategories.has(row.category)) continue;
        seenCategories.add(row.category);
        categories.push(row);
    }

    const duplicateBarcodes = [];
    const seenBarcodes = new Map();
    const sortedEquipmentRows = parsedRows
        .filter((row) => row.type === 'equipment')
        .slice()
        .sort(compareEquipmentsByTopicOrder);
    const equipmentRows = [];

    for (const row of sortedEquipmentRows) {
        const key = normalizeForSort(row.barcode);
        if (seenBarcodes.has(key)) {
            duplicateBarcodes.push({ first: seenBarcodes.get(key), duplicate: row });
            continue;
        }
        seenBarcodes.set(key, row);
        equipmentRows.push(row);
    }

    const missingBarcodes = equipmentRows.filter((row) => !row.barcode || row.barcode === '-');

    return {
        categories,
        equipmentRows,
        duplicateBarcodes,
        missingBarcodes
    };
}

function openDatabase(databasePath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(databasePath, (error) => {
            if (error) reject(error);
            else resolve(db);
        });
    });
}

function run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(error) {
            if (error) reject(error);
            else resolve(this);
        });
    });
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows || []);
        });
    });
}

function close(db) {
    return new Promise((resolve, reject) => {
        db.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

async function tableExists(db, tableName) {
    const row = await all(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [tableName]);
    return row.length > 0;
}

async function tableColumns(db, tableName) {
    if (!(await tableExists(db, tableName))) return [];
    return all(db, `PRAGMA table_info(${tableName})`);
}

async function ensureEquipmentSchema(db) {
    await run(db, "ALTER TABLE equipments ADD COLUMN current_status TEXT DEFAULT 'Disponivel'").catch(() => {});
    await run(db, "ALTER TABLE equipments ADD COLUMN category TEXT DEFAULT 'Outros'").catch(() => {});
    await run(db, 'ALTER TABLE equipments ADD COLUMN serial_number TEXT').catch(() => {});
    await run(db, 'ALTER TABLE equipments ADD COLUMN observation TEXT').catch(() => {});
    await run(db, 'ALTER TABLE equipments ADD COLUMN unit_price REAL NOT NULL DEFAULT 1').catch(() => {});
    await run(
        db,
        `CREATE TABLE IF NOT EXISTS equipment_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`
    );
    await run(db, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_categories_name ON equipment_categories(name)');
}

function createBackup() {
    if (!fs.existsSync(sqliteDbPath)) {
        throw new Error(`Banco SQLite nao encontrado em ${sqliteDbPath}`);
    }

    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(
        backupDir,
        `database-${timestampForFile()}-${appendMode ? 'before-append' : 'before-replace'}-equipments-from-pdf.db`
    );
    fs.copyFileSync(sqliteDbPath, backupPath);
    return backupPath;
}

async function maybeRun(db, sql, params = []) {
    const tableMatch = sql.match(/^(?:DELETE FROM|UPDATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
    if (tableMatch && !(await tableExists(db, tableMatch[1]))) return;
    await run(db, sql, params);
}

async function clearEquipmentData(db) {
    await maybeRun(db, 'DELETE FROM equipment_events');
    await maybeRun(db, 'DELETE FROM maintenances');
    await maybeRun(db, 'DELETE FROM event_reserved_equipments');
    await maybeRun(db, 'DELETE FROM quote_hidden_equipments');
    await maybeRun(db, 'UPDATE quote_items SET equipment_id = NULL WHERE equipment_id IS NOT NULL');
    await maybeRun(db, 'DELETE FROM equipments');
    await maybeRun(db, 'DELETE FROM equipment_categories');
    await maybeRun(
        db,
        `DELETE FROM sqlite_sequence
         WHERE name IN (
            'equipments',
            'equipment_categories',
            'equipment_events',
            'maintenances',
            'event_reserved_equipments',
            'quote_hidden_equipments'
         )`
    );
}

async function insertCategories(db, categories) {
    for (const category of categories) {
        await run(db, 'INSERT OR IGNORE INTO equipment_categories (name) VALUES (?)', [category.category]);
    }
}

async function insertEquipments(db, equipmentRows) {
    const columns = await tableColumns(db, 'equipments');
    const columnNames = new Set(columns.map((column) => column.name));
    const insertColumns = ['name', 'barcode'];
    const values = ['?', '?'];

    if (columnNames.has('current_status')) {
        insertColumns.push('current_status');
        values.push('?');
    }
    if (columnNames.has('category')) {
        insertColumns.push('category');
        values.push('?');
    }
    if (columnNames.has('serial_number')) {
        insertColumns.push('serial_number');
        values.push('?');
    }
    if (columnNames.has('observation')) {
        insertColumns.push('observation');
        values.push('?');
    }
    if (columnNames.has('unit_price')) {
        insertColumns.push('unit_price');
        values.push('?');
    }

    const sql = `INSERT INTO equipments (${insertColumns.join(', ')}) VALUES (${values.join(', ')})`;

    for (const row of equipmentRows) {
        const params = [row.name, row.barcode];
        if (columnNames.has('current_status')) params.push('Disponivel');
        if (columnNames.has('category')) params.push(row.category);
        if (columnNames.has('serial_number')) params.push(row.serialNumber);
        if (columnNames.has('observation')) params.push(row.observation);
        if (columnNames.has('unit_price')) params.push(1);
        await run(db, sql, params);
    }
}

async function buildAppendPlan(db, plan) {
    const existingEquipments = await all(db, 'SELECT id, name, barcode, category FROM equipments');
    const existingByBarcode = new Map();
    existingEquipments.forEach((equipment) => {
        existingByBarcode.set(normalizeForSort(equipment.barcode), equipment);
    });

    const skippedExisting = [];
    const equipmentRows = [];

    plan.equipmentRows.forEach((row) => {
        const existing = existingByBarcode.get(normalizeForSort(row.barcode));
        if (existing) {
            skippedExisting.push({ existing, row });
            return;
        }
        equipmentRows.push(row);
    });

    return {
        ...plan,
        equipmentRows,
        sourceEquipmentRows: plan.equipmentRows,
        skippedExisting
    };
}

async function applyImportPlan(db, plan) {
    await run(db, 'BEGIN TRANSACTION');

    try {
        if (!appendMode) {
            await clearEquipmentData(db);
        }
        await insertCategories(db, plan.categories);
        await insertEquipments(db, plan.equipmentRows);
        await run(db, 'COMMIT');
    } catch (error) {
        await run(db, 'ROLLBACK').catch(() => {});
        throw error;
    }
}

function markdownCell(value) {
    return normalizeWhitespace(value || '-').replace(/\|/g, '\\|');
}

function buildReport(plan, backupPath) {
    const counts = new Map();
    for (const row of plan.equipmentRows) {
        counts.set(row.category, (counts.get(row.category) || 0) + 1);
    }

    const lines = [
        '# Relatorio de Importacao de Equipamentos',
        '',
        `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
        `PDF analisado: ${pdfPath}`,
        `Banco SQLite local: ${sqliteDbPath}`,
        `Backup criado: ${backupPath || 'nao criado (modo dry-run)'}`,
        `Modo: ${dryRun ? 'dry-run, sem alterar banco' : appendMode ? 'importacao incremental aplicada no SQLite local' : 'importacao aplicada no SQLite local'}`,
        '',
        '## Resumo',
        '',
        `- Topicos/categorias importados: ${plan.categories.length}`,
        `- Equipamentos importados: ${plan.equipmentRows.length}`,
        `- Equipamentos na planilha: ${plan.sourceEquipmentRows?.length || plan.equipmentRows.length}`,
        `- Patrimonios ja existentes ignorados: ${plan.skippedExisting?.length || 0}`,
        `- Patrimonios -/em branco: ${plan.missingBarcodes.length}`,
        `- Patrimonios duplicados: ${plan.duplicateBarcodes.length}`,
        '',
        '## Categorias',
        '',
        '| Ordem | Categoria | Equipamentos |',
        '|---:|---|---:|'
    ];

    plan.categories.forEach((category, index) => {
        lines.push(`| ${index + 1} | ${markdownCell(category.category)} | ${counts.get(category.category) || 0} |`);
    });

    lines.push('', '## Patrimonios -/Em Branco', '', '| Categoria | Nome | Patrimonio | Serie | Observacao |', '|---|---|---|---|---|');
    plan.missingBarcodes.forEach((row) => {
        lines.push(`| ${markdownCell(row.category)} | ${markdownCell(row.name)} | ${markdownCell(row.barcode)} | ${markdownCell(row.serialNumber)} | ${markdownCell(row.observation)} |`);
    });
    if (!plan.missingBarcodes.length) lines.push('| - | - | - | - | - |');

    lines.push('', '## Equipamentos Importados', '', '| Ordem | Categoria | Nome | Patrimonio | Serie | Observacao |', '|---:|---|---|---|---|---|');
    plan.equipmentRows.forEach((row, index) => {
        lines.push(`| ${index + 1} | ${markdownCell(row.category)} | ${markdownCell(row.name)} | ${markdownCell(row.barcode)} | ${markdownCell(row.serialNumber)} | ${markdownCell(row.observation)} |`);
    });

    if (plan.duplicateBarcodes.length) {
        lines.push('', '## Duplicados', '', '| Patrimonio | Primeira ocorrencia | Duplicada |', '|---|---|---|');
        plan.duplicateBarcodes.forEach((entry) => {
            lines.push(`| ${markdownCell(entry.duplicate.barcode)} | ${markdownCell(entry.first.name)} | ${markdownCell(entry.duplicate.name)} |`);
        });
    }

    if (plan.skippedExisting?.length) {
        lines.push('', '## Patrimonios Ja Existentes Ignorados', '', '| Patrimonio | Nome no banco | Categoria no banco | Nome da planilha | Categoria da planilha |', '|---|---|---|---|---|');
        plan.skippedExisting.forEach((entry) => {
            lines.push(`| ${markdownCell(entry.row.barcode)} | ${markdownCell(entry.existing.name)} | ${markdownCell(entry.existing.category)} | ${markdownCell(entry.row.name)} | ${markdownCell(entry.row.category)} |`);
        });
    }

    lines.push('');
    return `${lines.join('\n')}\n`;
}

async function main() {
    if (!fs.existsSync(pdfPath)) throw new Error(`PDF nao encontrado em ${pdfPath}`);
    if (!fs.existsSync(sqliteDbPath)) throw new Error(`Banco SQLite nao encontrado em ${sqliteDbPath}`);

    const parsedRows = parsePdfRows(fs.readFileSync(pdfPath));
    const plan = buildImportPlan(parsedRows);

    if (!plan.equipmentRows.length) {
        throw new Error('Nenhum equipamento foi identificado no PDF.');
    }

    const backupPath = dryRun ? '' : createBackup();
    const db = await openDatabase(sqliteDbPath);

    try {
        await ensureEquipmentSchema(db);
        const finalPlan = appendMode ? await buildAppendPlan(db, plan) : plan;

        if (!dryRun) {
            await applyImportPlan(db, finalPlan);
        }
        fs.writeFileSync(reportPath, buildReport(finalPlan, backupPath), 'utf8');

        console.log(`Categorias importadas: ${finalPlan.categories.length}`);
        console.log(`Equipamentos importados: ${finalPlan.equipmentRows.length}`);
        console.log(`Equipamentos na planilha: ${finalPlan.sourceEquipmentRows?.length || finalPlan.equipmentRows.length}`);
        console.log(`Patrimonios ja existentes ignorados: ${finalPlan.skippedExisting?.length || 0}`);
        console.log(`Patrimonios -/em branco: ${finalPlan.missingBarcodes.length}`);
        if (backupPath) console.log(`Backup SQLite: ${backupPath}`);
        console.log(`Relatorio: ${reportPath}`);
    } finally {
        await close(db);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
}

module.exports = { extractTextItems };
