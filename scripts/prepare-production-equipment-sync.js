#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DEFAULT_LOCAL_PATH = path.resolve(__dirname, '..', 'banco de dados', 'database.db');
const OUTPUT_FILENAMES = {
    sql: 'production-equipment-sync.sql',
    markdown: 'production-equipment-sync-report.md',
    json: 'production-equipment-sync-report.json',
    validationDatabase: 'production-equipment-sync-validation.sqlite'
};

const REQUIRED_EQUIPMENT_COLUMNS = [
    'id',
    'name',
    'barcode',
    'current_status',
    'category',
    'serial_number',
    'observation',
    'unit_price'
];

const REFERENCE_SOURCES = [
    { key: 'equipment_events', table: 'equipment_events', idColumn: 'equipment_id' },
    { key: 'maintenances', table: 'maintenances', idColumn: 'equipment_id' },
    { key: 'event_reserved_equipments', table: 'event_reserved_equipments', idColumn: 'equipment_id' },
    { key: 'quote_items', table: 'quote_items', idColumn: 'equipment_id' },
    { key: 'quote_hidden_equipments', table: 'quote_hidden_equipments', idColumn: 'equipment_id' },
    {
        key: 'event_saida_hidden_items',
        table: 'event_saida_hidden_items',
        idColumn: 'item_id',
        requiredColumns: ['item_type'],
        whereSql: "item_type = 'equipment'"
    }
];

function usage() {
    return [
        'Uso:',
        '  node scripts/prepare-production-equipment-sync.js --remote <copia-remota.sqlite> [opcoes]',
        '',
        'Opcoes:',
        `  --local <arquivo>          SQLite local (padrao: ${DEFAULT_LOCAL_PATH})`,
        '  --remote <arquivo>         SQLite reconstruido a partir do export D1 (obrigatorio)',
        '  --out-dir <diretorio>      Diretorio de saida (padrao: ./backups/production-sync-<timestamp>)',
        '  --delete-safe-extras       Inclui DELETE apenas para extras disponiveis, preco zero e sem referencias',
        '  --help                     Exibe esta ajuda',
        '',
        'O script nunca acessa nem altera o D1 de producao. O SQL gerado e validado somente em um clone local.'
    ].join('\n');
}

function parseArgs(argv) {
    const result = {
        local: DEFAULT_LOCAL_PATH,
        remote: null,
        outDir: null,
        deleteSafeExtras: false,
        help: false
    };

    const valueOptions = new Map([
        ['--local', 'local'],
        ['--remote', 'remote'],
        ['--out-dir', 'outDir']
    ]);

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];

        if (argument === '--help' || argument === '-h') {
            result.help = true;
            continue;
        }

        if (argument === '--delete-safe-extras') {
            result.deleteSafeExtras = true;
            continue;
        }

        const equalsIndex = argument.indexOf('=');
        const optionName = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
        if (!valueOptions.has(optionName)) {
            throw new Error(`Opcao desconhecida: ${argument}\n\n${usage()}`);
        }

        const inlineValue = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : null;
        const value = inlineValue !== null ? inlineValue : argv[++index];
        if (!value || value.startsWith('--')) {
            throw new Error(`A opcao ${optionName} exige um valor.`);
        }

        result[valueOptions.get(optionName)] = value;
    }

    if (!result.help && !result.remote) {
        throw new Error(`Informe --remote com a copia SQLite reconstruida do D1.\n\n${usage()}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    result.local = path.resolve(result.local);
    result.remote = result.remote ? path.resolve(result.remote) : null;
    result.outDir = path.resolve(result.outDir || path.join('backups', `production-sync-${timestamp}`));
    return result;
}

function openDatabase(filename, mode) {
    return new Promise((resolve, reject) => {
        const database = new sqlite3.Database(filename, mode, (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(database);
        });
    });
}

function closeDatabase(database) {
    if (!database) return Promise.resolve();
    return new Promise((resolve, reject) => {
        database.close((error) => (error ? reject(error) : resolve()));
    });
}

function all(database, sql, params = []) {
    return new Promise((resolve, reject) => {
        database.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
    });
}

function get(database, sql, params = []) {
    return new Promise((resolve, reject) => {
        database.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
    });
}

function exec(database, sql) {
    return new Promise((resolve, reject) => {
        database.exec(sql, (error) => (error ? reject(error) : resolve()));
    });
}

function quoteIdentifier(identifier) {
    return `"${String(identifier).replace(/"/g, '""')}"`;
}

function sqlValue(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`Numero invalido para SQL: ${value}`);
        return String(value);
    }
    return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizePatrimonio(value) {
    const trimmed = String(value ?? '').trim();
    if (/^\d{1,4}$/.test(trimmed)) return trimmed.padStart(4, '0');
    return trimmed.toUpperCase();
}

function normalizeStatus(value) {
    return String(value ?? '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function isAvailableStatus(value) {
    return new Set(['disponivel', 'available']).has(normalizeStatus(value));
}

function comparableText(value) {
    return value === null || value === undefined ? null : String(value);
}

function finitePrice(value, context) {
    if (value === null || value === undefined || value === '') {
        throw new Error(`Preco ausente em ${context}.`);
    }
    const price = Number(value);
    if (!Number.isFinite(price)) throw new Error(`Preco invalido em ${context}: ${value}`);
    return price;
}

async function assertInputFile(filename, label) {
    let stat;
    try {
        stat = await fsp.stat(filename);
    } catch (error) {
        if (error.code === 'ENOENT') throw new Error(`${label} nao encontrado: ${filename}`);
        throw error;
    }
    if (!stat.isFile()) throw new Error(`${label} nao e um arquivo: ${filename}`);
}

async function tableInfo(database, table) {
    return all(database, `PRAGMA table_info(${quoteIdentifier(table)})`);
}

function requireColumns(columns, required, context) {
    const names = new Set(columns.map((column) => column.name));
    const missing = required.filter((column) => !names.has(column));
    if (missing.length) {
        throw new Error(`${context} nao possui as colunas obrigatorias: ${missing.join(', ')}`);
    }
    return names;
}

function buildPatrimonioIndex(rows, sourceLabel) {
    const index = new Map();
    const empty = [];

    for (const row of rows) {
        const normalized = normalizePatrimonio(row.barcode);
        if (!normalized) {
            empty.push({ id: row.id, name: row.name, barcode: row.barcode });
            continue;
        }
        if (!index.has(normalized)) index.set(normalized, []);
        index.get(normalized).push(row);
    }

    const collisions = [...index.entries()]
        .filter(([, matchingRows]) => matchingRows.length > 1)
        .map(([normalized, matchingRows]) => ({ normalized, rows: matchingRows }));

    if (empty.length || collisions.length) {
        const details = [];
        if (empty.length) {
            details.push(`patrimonios vazios: ${empty.map((row) => `id=${row.id} (${row.name})`).join('; ')}`);
        }
        for (const collision of collisions) {
            const records = collision.rows
                .map((row) => `id=${row.id}, patrimonio=${JSON.stringify(row.barcode)}, nome=${JSON.stringify(row.name)}`)
                .join('; ');
            details.push(`chave normalizada ${JSON.stringify(collision.normalized)}: ${records}`);
        }
        throw new Error(`Sincronizacao abortada: colisao/invalidade de patrimonio em ${sourceLabel}. ${details.join(' | ')}`);
    }

    return new Map([...index.entries()].map(([key, matchingRows]) => [key, matchingRows[0]]));
}

async function loadDatabaseSnapshot(database, sourceLabel) {
    const equipmentColumns = await tableInfo(database, 'equipments');
    requireColumns(equipmentColumns, REQUIRED_EQUIPMENT_COLUMNS, `${sourceLabel}.equipments`);

    const categoryColumns = await tableInfo(database, 'equipment_categories');
    requireColumns(categoryColumns, ['id', 'name'], `${sourceLabel}.equipment_categories`);
    const categoryColumnNames = new Set(categoryColumns.map((column) => column.name));

    const equipments = await all(
        database,
        `SELECT id, name, barcode, current_status, category, serial_number, observation, unit_price
         FROM equipments
         ORDER BY id ASC`
    );

    for (const equipment of equipments) {
        if (!Number.isInteger(Number(equipment.id))) {
            throw new Error(`ID de equipamento invalido em ${sourceLabel}: ${equipment.id}`);
        }
        if (!String(equipment.name ?? '').trim()) {
            throw new Error(`Nome de equipamento vazio em ${sourceLabel}, id=${equipment.id}.`);
        }
        equipment.unit_price = finitePrice(
            equipment.unit_price,
            `${sourceLabel}.equipments id=${equipment.id}, patrimonio=${equipment.barcode}`
        );
    }

    const categoryCreatedAtSelect = categoryColumnNames.has('created_at') ? ', created_at' : '';
    const categories = await all(
        database,
        `SELECT id, name${categoryCreatedAtSelect} FROM equipment_categories ORDER BY id ASC`
    );

    const categoryIds = new Set();
    const categoryNames = new Set();
    for (const category of categories) {
        if (!Number.isInteger(Number(category.id))) {
            throw new Error(`ID de categoria invalido em ${sourceLabel}: ${category.id}`);
        }
        if (!String(category.name ?? '').trim()) {
            throw new Error(`Nome de categoria vazio em ${sourceLabel}, id=${category.id}.`);
        }
        if (categoryIds.has(Number(category.id))) {
            throw new Error(`ID de categoria duplicado em ${sourceLabel}: ${category.id}`);
        }
        if (categoryNames.has(String(category.name))) {
            throw new Error(`Nome de categoria duplicado em ${sourceLabel}: ${category.name}`);
        }
        categoryIds.add(Number(category.id));
        categoryNames.add(String(category.name));
    }

    return {
        equipments,
        categories,
        patrimonioIndex: buildPatrimonioIndex(equipments, sourceLabel)
    };
}

async function listUserTables(database) {
    const rows = await all(
        database,
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
         ORDER BY name ASC`
    );
    return rows.map((row) => row.name);
}

async function collectTableCounts(database, tableNames) {
    const counts = {};
    for (const table of tableNames) {
        const row = await get(database, `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`);
        counts[table] = Number(row?.count || 0);
    }
    return counts;
}

async function collectReferences(database, tableNames) {
    const existingTables = new Set(tableNames);
    const referencesByEquipmentId = new Map();
    const sources = [];

    for (const definition of REFERENCE_SOURCES) {
        if (!existingTables.has(definition.table)) {
            sources.push({ ...definition, exists: false, rowCount: 0 });
            continue;
        }

        const columns = await tableInfo(database, definition.table);
        const required = [definition.idColumn, ...(definition.requiredColumns || [])];
        requireColumns(columns, required, `remoto.${definition.table}`);

        const whereParts = [`${quoteIdentifier(definition.idColumn)} IS NOT NULL`];
        if (definition.whereSql) whereParts.push(definition.whereSql);
        const rows = await all(
            database,
            `SELECT ${quoteIdentifier(definition.idColumn)} AS equipment_id, COUNT(*) AS count
             FROM ${quoteIdentifier(definition.table)}
             WHERE ${whereParts.join(' AND ')}
             GROUP BY ${quoteIdentifier(definition.idColumn)}`
        );

        let sourceRowCount = 0;
        for (const row of rows) {
            const equipmentId = Number(row.equipment_id);
            const count = Number(row.count || 0);
            sourceRowCount += count;
            if (!referencesByEquipmentId.has(equipmentId)) referencesByEquipmentId.set(equipmentId, {});
            referencesByEquipmentId.get(equipmentId)[definition.key] = count;
        }
        sources.push({ ...definition, exists: true, rowCount: sourceRowCount });
    }

    return { referencesByEquipmentId, sources };
}

function referenceSummaryFor(equipmentId, collectedReferences) {
    const raw = collectedReferences.referencesByEquipmentId.get(Number(equipmentId)) || {};
    const bySource = {};
    let total = 0;
    for (const definition of REFERENCE_SOURCES) {
        const count = Number(raw[definition.key] || 0);
        bySource[definition.key] = count;
        total += count;
    }
    return { total, bySource };
}

function publicEquipment(equipment) {
    return {
        id: Number(equipment.id),
        name: comparableText(equipment.name),
        patrimonio: comparableText(equipment.barcode),
        patrimonioNormalizado: normalizePatrimonio(equipment.barcode),
        unitPrice: Number(equipment.unit_price),
        status: comparableText(equipment.current_status),
        category: comparableText(equipment.category),
        serialNumber: comparableText(equipment.serial_number),
        observation: comparableText(equipment.observation)
    };
}

function createPlan(local, remote, collectedReferences, deleteSafeExtras) {
    const matches = [];
    const inserts = [];
    const extras = [];

    for (const localEquipment of local.equipments) {
        const normalized = normalizePatrimonio(localEquipment.barcode);
        const remoteEquipment = remote.patrimonioIndex.get(normalized);
        if (remoteEquipment) {
            matches.push({
                normalized,
                local: localEquipment,
                remote: remoteEquipment,
                remoteUnavailable: !isAvailableStatus(remoteEquipment.current_status),
                priceDiffers: Number(localEquipment.unit_price) !== Number(remoteEquipment.unit_price)
            });
        } else {
            inserts.push({ normalized, local: localEquipment });
        }
    }

    for (const remoteEquipment of remote.equipments) {
        const normalized = normalizePatrimonio(remoteEquipment.barcode);
        if (local.patrimonioIndex.has(normalized)) continue;

        const unitPrice = Number(remoteEquipment.unit_price);
        const available = isAvailableStatus(remoteEquipment.current_status);
        const references = referenceSummaryFor(remoteEquipment.id, collectedReferences);
        const safeDeleteCandidate = available && unitPrice === 0 && references.total === 0;
        const reasons = [];
        if (unitPrice > 0) reasons.push('preco_positivo');
        if (!available) reasons.push('status_indisponivel');
        if (references.total > 0) reasons.push('referencias_historicas');
        if (unitPrice < 0) reasons.push('preco_negativo_preservado_por_seguranca');

        extras.push({
            normalized,
            remote: remoteEquipment,
            available,
            unitPrice,
            references,
            safeDeleteCandidate,
            willDelete: Boolean(deleteSafeExtras && safeDeleteCandidate),
            preservationReasons: reasons
        });
    }

    return {
        matches,
        inserts,
        extras,
        deleteSafeExtras,
        priceExtras: extras.filter((extra) => extra.unitPrice > 0),
        unavailableExtras: extras.filter((extra) => !extra.available),
        historyExtras: extras.filter((extra) => extra.references.total > 0),
        safeDeleteCandidates: extras.filter((extra) => extra.safeDeleteCandidate),
        actualDeletes: extras.filter((extra) => extra.willDelete),
        matchedUnavailable: matches.filter((match) => match.remoteUnavailable),
        matchedPriceDifferences: matches.filter((match) => match.priceDiffers)
    };
}

function deleteReferencePredicates(existingSources) {
    const predicates = [];
    for (const source of existingSources.filter((entry) => entry.exists)) {
        const table = quoteIdentifier(source.table);
        const idColumn = quoteIdentifier(source.idColumn);
        const filter = source.whereSql ? ` AND ${source.whereSql}` : '';
        predicates.push(
            `  AND NOT EXISTS (SELECT 1 FROM ${table} WHERE ${table}.${idColumn} = equipments.id${filter})`
        );
    }
    return predicates;
}

function generateSql({ localPath, remotePath, local, plan, referenceSources, generatedAt }) {
    const lines = [
        '-- Sincronizacao seletiva de equipamentos para D1.',
        `-- Gerado em: ${generatedAt}`,
        `-- Origem local: ${localPath}`,
        `-- Snapshot remoto: ${remotePath}`,
        '-- IMPORTANTE: faca backup e gere novamente imediatamente antes de aplicar em producao.',
        '-- Este arquivo nao altera events, event_spaces, quotes nem tabelas de movimentacao/historico.',
        ''
    ];

    lines.push('-- Categorias: IDs e ordem copiados integralmente do banco local.');
    lines.push('DELETE FROM equipment_categories;');
    for (const category of local.categories) {
        lines.push(
            `INSERT INTO equipment_categories (id, name) VALUES (${sqlValue(Number(category.id))}, ${sqlValue(category.name)});`
        );
    }

    lines.push('', '-- Equipamentos coincidentes: preserva id, current_status e unit_price remotos.');
    for (const match of plan.matches) {
        const localEquipment = match.local;
        const remoteEquipment = match.remote;
        lines.push(
            [
                'UPDATE equipments',
                `SET name = ${sqlValue(localEquipment.name)},`,
                `    barcode = ${sqlValue(localEquipment.barcode)},`,
                `    category = ${sqlValue(localEquipment.category)},`,
                `    serial_number = ${sqlValue(localEquipment.serial_number)},`,
                `    observation = ${sqlValue(localEquipment.observation)}`,
                `WHERE id = ${sqlValue(Number(remoteEquipment.id))}`,
                `  AND barcode = ${sqlValue(remoteEquipment.barcode)};`
            ].join('\n')
        );
    }

    lines.push('', "-- Equipamentos locais ausentes: sem id explicito, status 'Disponivel' e preco local.");
    for (const insert of plan.inserts) {
        const equipment = insert.local;
        lines.push(
            [
                'INSERT INTO equipments',
                '    (name, barcode, current_status, category, serial_number, observation, unit_price)',
                `VALUES (${sqlValue(equipment.name)}, ${sqlValue(equipment.barcode)}, 'Disponivel', ${sqlValue(equipment.category)}, ${sqlValue(equipment.serial_number)}, ${sqlValue(equipment.observation)}, ${sqlValue(Number(equipment.unit_price))});`
            ].join('\n')
        );
    }

    if (plan.deleteSafeExtras) {
        lines.push('', '-- Extras seguros: exclusao defensiva somente se continuarem disponiveis, com preco zero e sem referencias.');
        const referencePredicates = deleteReferencePredicates(referenceSources);
        for (const extra of plan.actualDeletes) {
            const equipment = extra.remote;
            lines.push(
                [
                    'DELETE FROM equipments',
                    `WHERE id = ${sqlValue(Number(equipment.id))}`,
                    `  AND barcode = ${sqlValue(equipment.barcode)}`,
                    `  AND current_status = ${sqlValue(equipment.current_status)}`,
                    '  AND COALESCE(unit_price, 0) = 0',
                    ...referencePredicates,
                    ';'
                ].join('\n').replace(/\n;/, ';')
            );
        }
        if (!plan.actualDeletes.length) lines.push('-- Nenhum extra atende aos criterios de exclusao segura.');
    } else {
        lines.push('', '-- Nenhum equipamento remoto extra sera excluido: --delete-safe-extras nao foi informado.');
    }

    lines.push('');
    return lines.join('\n');
}

function sameDatabaseValue(actual, expected) {
    if (actual === null || actual === undefined) return expected === null || expected === undefined;
    if (expected === null || expected === undefined) return false;
    return String(actual) === String(expected);
}

function assertCondition(condition, message) {
    if (!condition) throw new Error(`Falha na validacao do SQL: ${message}`);
}

async function validateSql({ remotePath, validationPath, sql, local, plan, protectedTableCounts }) {
    for (const suffix of ['', '-wal', '-shm']) {
        await fsp.unlink(`${validationPath}${suffix}`).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
        });
    }
    await fsp.copyFile(remotePath, validationPath);

    let database;
    try {
        database = await openDatabase(validationPath, sqlite3.OPEN_READWRITE);
        await exec(database, sql);

        const validated = await loadDatabaseSnapshot(database, 'clone-validacao');
        assertCondition(
            validated.categories.length === local.categories.length,
            `quantidade de categorias: esperado ${local.categories.length}, obtido ${validated.categories.length}`
        );
        for (let index = 0; index < local.categories.length; index += 1) {
            const expected = local.categories[index];
            const actual = validated.categories[index];
            assertCondition(
                Number(actual.id) === Number(expected.id) && sameDatabaseValue(actual.name, expected.name),
                `categoria na posicao ${index + 1} divergiu (esperado id=${expected.id}, nome=${expected.name})`
            );
        }

        for (const match of plan.matches) {
            const actual = validated.equipments.find((equipment) => Number(equipment.id) === Number(match.remote.id));
            assertCondition(actual, `equipamento coincidente id=${match.remote.id} desapareceu`);
            assertCondition(sameDatabaseValue(actual.name, match.local.name), `nome nao atualizado no id=${match.remote.id}`);
            assertCondition(sameDatabaseValue(actual.barcode, match.local.barcode), `patrimonio nao atualizado no id=${match.remote.id}`);
            assertCondition(sameDatabaseValue(actual.category, match.local.category), `categoria nao atualizada no id=${match.remote.id}`);
            assertCondition(sameDatabaseValue(actual.serial_number, match.local.serial_number), `numero de serie nao atualizado no id=${match.remote.id}`);
            assertCondition(sameDatabaseValue(actual.observation, match.local.observation), `observacao nao atualizada no id=${match.remote.id}`);
            assertCondition(sameDatabaseValue(actual.current_status, match.remote.current_status), `status remoto alterado no id=${match.remote.id}`);
            assertCondition(Number(actual.unit_price) === Number(match.remote.unit_price), `preco remoto alterado no id=${match.remote.id}`);
        }

        for (const insert of plan.inserts) {
            const actual = validated.patrimonioIndex.get(insert.normalized);
            assertCondition(actual, `equipamento local novo patrimonio=${insert.local.barcode} nao foi inserido`);
            assertCondition(sameDatabaseValue(actual.name, insert.local.name), `nome divergente no novo patrimonio=${insert.local.barcode}`);
            assertCondition(sameDatabaseValue(actual.category, insert.local.category), `categoria divergente no novo patrimonio=${insert.local.barcode}`);
            assertCondition(sameDatabaseValue(actual.serial_number, insert.local.serial_number), `numero de serie divergente no novo patrimonio=${insert.local.barcode}`);
            assertCondition(sameDatabaseValue(actual.observation, insert.local.observation), `observacao divergente no novo patrimonio=${insert.local.barcode}`);
            assertCondition(actual.current_status === 'Disponivel', `status do novo patrimonio=${insert.local.barcode} nao e Disponivel`);
            assertCondition(Number(actual.unit_price) === Number(insert.local.unit_price), `preco local divergente no novo patrimonio=${insert.local.barcode}`);
        }

        for (const extra of plan.extras) {
            const actual = validated.equipments.find((equipment) => Number(equipment.id) === Number(extra.remote.id));
            if (extra.willDelete) {
                assertCondition(!actual, `extra seguro id=${extra.remote.id}, patrimonio=${extra.remote.barcode} nao foi excluido`);
            } else {
                assertCondition(actual, `extra preservado id=${extra.remote.id}, patrimonio=${extra.remote.barcode} desapareceu`);
                assertCondition(sameDatabaseValue(actual.current_status, extra.remote.current_status), `status do extra id=${extra.remote.id} foi alterado`);
                assertCondition(Number(actual.unit_price) === Number(extra.remote.unit_price), `preco do extra id=${extra.remote.id} foi alterado`);
            }
        }

        const expectedEquipmentCount =
            plan.matches.length + plan.inserts.length + plan.extras.length - plan.actualDeletes.length;
        assertCondition(
            validated.equipments.length === expectedEquipmentCount,
            `quantidade de equipamentos: esperado ${expectedEquipmentCount}, obtido ${validated.equipments.length}`
        );

        for (const [table, expectedCount] of Object.entries(protectedTableCounts)) {
            const row = await get(database, `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`);
            assertCondition(
                Number(row?.count || 0) === Number(expectedCount),
                `tabela protegida ${table} mudou de ${expectedCount} para ${row?.count || 0} registros`
            );
        }

        return {
            passed: true,
            validationDatabase: validationPath,
            equipmentCount: validated.equipments.length,
            categoryCount: validated.categories.length,
            protectedTablesChecked: Object.keys(protectedTableCounts).length
        };
    } finally {
        await closeDatabase(database);
    }
}

function markdownCell(value) {
    return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function formatPrice(value) {
    return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

function referencesLabel(references) {
    const parts = Object.entries(references.bySource)
        .filter(([, count]) => count > 0)
        .map(([source, count]) => `${source}: ${count}`);
    return parts.length ? parts.join('; ') : '-';
}

function equipmentRowsMarkdown(entries, mapper) {
    if (!entries.length) return ['_Nenhum._', ''];
    const lines = [
        '| Nome | Patrimonio | Preco | Status | Categoria | Referencias | Acao |',
        '|---|---:|---:|---|---|---|---|'
    ];
    for (const entry of entries) {
        const item = mapper(entry);
        lines.push(
            `| ${markdownCell(item.name)} | ${markdownCell(item.patrimonio)} | ${markdownCell(formatPrice(item.unitPrice))} | ${markdownCell(item.status)} | ${markdownCell(item.category)} | ${markdownCell(item.references || '-')} | ${markdownCell(item.action || '-')} |`
        );
    }
    lines.push('');
    return lines;
}

function extraMarkdownRow(extra) {
    return {
        ...extra,
        references: referencesLabel(extra.references),
        action: extra.willDelete ? 'EXCLUIR (seguro)' : 'MANTER'
    };
}

function generateMarkdownReport(report) {
    const { counts, lists } = report;
    const lines = [
        '# Relatorio de sincronizacao seletiva de equipamentos',
        '',
        `Gerado em: ${report.generatedAt}`,
        '',
        `- Banco local: \`${report.inputs.local}\``,
        `- Snapshot remoto: \`${report.inputs.remote}\``,
        `- Exclusao de extras seguros solicitada: **${report.options.deleteSafeExtras ? 'sim' : 'nao'}**`,
        `- Validacao em clone local: **${report.validation.passed ? 'APROVADA' : 'REPROVADA'}**`,
        '',
        '## Resumo',
        '',
        '| Medida | Quantidade |',
        '|---|---:|',
        `| Equipamentos locais | ${counts.localEquipments} |`,
        `| Equipamentos no snapshot remoto | ${counts.remoteEquipments} |`,
        `| Patrimonios coincidentes | ${counts.matches} |`,
        `| Novos equipamentos a inserir | ${counts.inserts} |`,
        `| Extras remotos | ${counts.remoteExtras} |`,
        `| Extras com preco maior que zero | ${counts.priceExtras} |`,
        `| Extras indisponiveis | ${counts.unavailableExtras} |`,
        `| Extras com referencias historicas | ${counts.historyExtras} |`,
        `| Candidatos a exclusao segura | ${counts.safeDeleteCandidates} |`,
        `| Exclusoes efetivamente incluidas no SQL | ${counts.actualDeletes} |`,
        `| Coincidentes indisponiveis preservados | ${counts.matchedUnavailable} |`,
        `| Precos remotos preservados apesar de divergirem do local | ${counts.matchedPriceDifferences} |`,
        `| Categorias locais sincronizadas | ${counts.localCategories} |`,
        '',
        'O pareamento usa patrimonio normalizado: valores numericos de 1 a 4 digitos recebem zeros a esquerda ate 4 digitos; os demais usam `trim` e letras maiusculas. Qualquer colisao aborta a geracao.',
        '',
        '## Todos os extras remotos com preco maior que zero',
        ''
    ];

    lines.push(...equipmentRowsMarkdown(lists.priceExtras, extraMarkdownRow));
    lines.push('## Todos os extras remotos indisponiveis', '');
    lines.push(...equipmentRowsMarkdown(lists.unavailableExtras, extraMarkdownRow));
    lines.push('## Todos os extras preservados por referencias historicas', '');
    lines.push(...equipmentRowsMarkdown(lists.historyExtras, extraMarkdownRow));
    lines.push('## Todos os candidatos a exclusao segura', '');
    lines.push(...equipmentRowsMarkdown(lists.safeDeleteCandidates, extraMarkdownRow));
    lines.push('## Todos os patrimonios coincidentes que permanecem indisponiveis', '');
    lines.push(
        ...equipmentRowsMarkdown(lists.matchedUnavailable, (entry) => ({
            ...entry.remote,
            references: '-',
            action: 'MANTER status e id remotos'
        }))
    );
    lines.push('## Equipamentos locais novos', '');
    lines.push(
        ...equipmentRowsMarkdown(lists.inserts, (entry) => ({
            ...entry,
            references: '-',
            action: 'INSERIR sem id explicito'
        }))
    );

    const missingReferenceTables = report.referenceSources.filter((source) => !source.exists).map((source) => source.table);
    lines.push('## Verificacoes de seguranca', '');
    lines.push(`- Tabelas protegidas conferidas no clone: ${report.validation.protectedTablesChecked}.`);
    lines.push(`- Contagem final validada no clone: ${report.validation.equipmentCount} equipamentos e ${report.validation.categoryCount} categorias.`);
    lines.push(
        missingReferenceTables.length
            ? `- Tabelas de referencia ausentes no snapshot (logo, sem registros a consultar): ${missingReferenceTables.map((name) => `\`${name}\``).join(', ')}.`
            : '- Todas as seis fontes previstas de referencia de equipamentos existem no snapshot.'
    );
    lines.push('- O SQL nao contem comandos para eventos, locais, orcamentos ou movimentacoes.');
    lines.push('- Gere novamente o plano imediatamente antes da aplicacao para evitar divergencia entre o snapshot e a producao.');
    lines.push('');
    return lines.join('\n');
}

function serializeExtra(extra) {
    return {
        ...publicEquipment(extra.remote),
        available: extra.available,
        references: extra.references,
        safeDeleteCandidate: extra.safeDeleteCandidate,
        willDelete: extra.willDelete,
        preservationReasons: extra.preservationReasons
    };
}

function buildJsonReport({ generatedAt, args, local, remote, plan, references, validation }) {
    const lists = {
        priceExtras: plan.priceExtras.map(serializeExtra),
        unavailableExtras: plan.unavailableExtras.map(serializeExtra),
        historyExtras: plan.historyExtras.map(serializeExtra),
        safeDeleteCandidates: plan.safeDeleteCandidates.map(serializeExtra),
        actualDeletes: plan.actualDeletes.map(serializeExtra),
        matchedUnavailable: plan.matchedUnavailable.map((match) => ({
            normalizedPatrimonio: match.normalized,
            local: publicEquipment(match.local),
            remote: publicEquipment(match.remote),
            preservedRemoteId: Number(match.remote.id),
            preservedRemoteStatus: match.remote.current_status,
            preservedRemoteUnitPrice: Number(match.remote.unit_price)
        })),
        matchedPriceDifferences: plan.matchedPriceDifferences.map((match) => ({
            normalizedPatrimonio: match.normalized,
            name: match.local.name,
            patrimonio: match.local.barcode,
            localUnitPrice: Number(match.local.unit_price),
            preservedRemoteUnitPrice: Number(match.remote.unit_price),
            remoteId: Number(match.remote.id)
        })),
        inserts: plan.inserts.map((insert) => ({
            ...publicEquipment({ ...insert.local, current_status: 'Disponivel' }),
            sourceLocalIdNotImported: Number(insert.local.id)
        })),
        remoteExtras: plan.extras.map(serializeExtra)
    };

    return {
        generatedAt,
        inputs: { local: args.local, remote: args.remote, outDir: args.outDir },
        outputs: {
            sql: path.join(args.outDir, OUTPUT_FILENAMES.sql),
            markdown: path.join(args.outDir, OUTPUT_FILENAMES.markdown),
            json: path.join(args.outDir, OUTPUT_FILENAMES.json),
            validationDatabase: path.join(args.outDir, OUTPUT_FILENAMES.validationDatabase)
        },
        options: { deleteSafeExtras: args.deleteSafeExtras },
        normalization: {
            numericOneToFourDigits: 'padStart(4, "0")',
            otherValues: 'trim().toUpperCase()',
            collisionPolicy: 'abort'
        },
        counts: {
            localEquipments: local.equipments.length,
            remoteEquipments: remote.equipments.length,
            matches: plan.matches.length,
            inserts: plan.inserts.length,
            remoteExtras: plan.extras.length,
            priceExtras: plan.priceExtras.length,
            unavailableExtras: plan.unavailableExtras.length,
            historyExtras: plan.historyExtras.length,
            safeDeleteCandidates: plan.safeDeleteCandidates.length,
            actualDeletes: plan.actualDeletes.length,
            matchedUnavailable: plan.matchedUnavailable.length,
            matchedPriceDifferences: plan.matchedPriceDifferences.length,
            localCategories: local.categories.length,
            protectedTablesChecked: validation.protectedTablesChecked
        },
        referenceSources: references.sources.map((source) => ({
            table: source.table,
            key: source.key,
            exists: source.exists,
            consideredRows: source.rowCount
        })),
        validation,
        lists
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        process.stdout.write(`${usage()}\n`);
        return;
    }

    await assertInputFile(args.local, 'Banco local');
    await assertInputFile(args.remote, 'Snapshot remoto');
    const [localRealPath, remoteRealPath] = await Promise.all([fsp.realpath(args.local), fsp.realpath(args.remote)]);
    if (localRealPath.toLowerCase() === remoteRealPath.toLowerCase()) {
        throw new Error('Os argumentos --local e --remote precisam apontar para arquivos diferentes.');
    }

    let localDatabase;
    let remoteDatabase;
    let local;
    let remote;
    let references;
    let protectedTableCounts;
    try {
        [localDatabase, remoteDatabase] = await Promise.all([
            openDatabase(args.local, sqlite3.OPEN_READONLY),
            openDatabase(args.remote, sqlite3.OPEN_READONLY)
        ]);
        [local, remote] = await Promise.all([
            loadDatabaseSnapshot(localDatabase, 'local'),
            loadDatabaseSnapshot(remoteDatabase, 'remoto')
        ]);

        const remoteTables = await listUserTables(remoteDatabase);
        references = await collectReferences(remoteDatabase, remoteTables);
        const protectedTables = remoteTables.filter(
            (table) => table !== 'equipments' && table !== 'equipment_categories'
        );
        protectedTableCounts = await collectTableCounts(remoteDatabase, protectedTables);
    } finally {
        await Promise.all([closeDatabase(localDatabase), closeDatabase(remoteDatabase)]);
    }

    const plan = createPlan(local, remote, references, args.deleteSafeExtras);
    const generatedAt = new Date().toISOString();
    const sql = generateSql({
        localPath: args.local,
        remotePath: args.remote,
        local,
        plan,
        referenceSources: references.sources,
        generatedAt
    });

    await fsp.mkdir(args.outDir, { recursive: true });
    const validationPath = path.join(args.outDir, OUTPUT_FILENAMES.validationDatabase);
    const validation = await validateSql({
        remotePath: args.remote,
        validationPath,
        sql,
        local,
        plan,
        protectedTableCounts
    });

    const report = buildJsonReport({ generatedAt, args, local, remote, plan, references, validation });
    const markdown = generateMarkdownReport(report);
    const sqlPath = path.join(args.outDir, OUTPUT_FILENAMES.sql);
    const markdownPath = path.join(args.outDir, OUTPUT_FILENAMES.markdown);
    const jsonPath = path.join(args.outDir, OUTPUT_FILENAMES.json);

    await Promise.all([
        fsp.writeFile(sqlPath, sql, 'utf8'),
        fsp.writeFile(markdownPath, markdown, 'utf8'),
        fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    ]);

    process.stdout.write(
        [
            'Plano seletivo gerado e validado sem acessar a producao.',
            `SQL: ${sqlPath}`,
            `Relatorio Markdown: ${markdownPath}`,
            `Relatorio JSON: ${jsonPath}`,
            `Clone de validacao: ${validationPath}`,
            `Resumo: ${plan.matches.length} coincidentes, ${plan.inserts.length} insercoes, ${plan.extras.length} extras remotos, ${plan.actualDeletes.length} exclusoes seguras no SQL.`
        ].join('\n') + '\n'
    );
}

main().catch((error) => {
    process.stderr.write(`ERRO: ${error.stack || error.message}\n`);
    process.exitCode = 1;
});
