const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATABASE_PATH = path.join(__dirname, 'database.db');
const TEST_SESSION_DIR = path.join(__dirname, 'data', 'test-sessions');
const SQLITE_BACKUP_DIR = path.join(__dirname, 'backups', 'sqlite');
const TEST_USERNAME = 'teste';
const LOCAL_COMMERCIAL_PASSWORD = '123';
const SEEDED_USERS = [
    {
        username: TEST_USERNAME,
        passwordHash: bcrypt.hashSync(LOCAL_COMMERCIAL_PASSWORD, 10),
        role: 'comercial'
    }
];
const INITIAL_QUANTITY_EDITOR_USERNAME = 'arthur';
const LOCAL_INITIAL_QUANTITY_EDITOR_USERNAME = '';
const INITIAL_QUANTITY_EDIT_PASSWORD = '3418';
const DELETE_PASSWORD_HASH = process.env.DELETE_PASSWORD_HASH || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || (
    IS_PRODUCTION
        ? crypto.randomBytes(32).toString('hex')
        : 'sistema-estoque-24h-local-session-secret'
);
const USER_ROLES = new Set(['admin', 'user', 'comercial']);
const OPERATOR_PHOTO_MAX_LENGTH = 2_500_000;
const OPERATOR_PHOTO_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const QUOTE_CATEGORIES = {
    sonorizacao: 'Sonorizacao',
    transmissao: 'Transmissao',
    iluminacao: 'Iluminacao',
    internet: 'Internet'
};

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '8mb' }));
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: 'sessao24h',
    cookie: {
        secure: IS_PRODUCTION,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

let db = null;

if (!process.env.SESSION_SECRET && IS_PRODUCTION) {
    console.warn('SESSION_SECRET nao definido. Um segredo temporario foi gerado para esta execucao.');
} else if (!process.env.SESSION_SECRET) {
    console.warn('SESSION_SECRET nao definido. Usando segredo local fixo para desenvolvimento.');
}

if (!DELETE_PASSWORD_HASH) {
    console.warn('DELETE_PASSWORD_HASH nao definido. Exclusoes protegidas por senha ficarao indisponiveis.');
}

function connectDatabase() {
    return new Promise((resolve, reject) => {
        const connection = new sqlite3.Database(DATABASE_PATH, (err) => {
            if (err) {
                reject(err);
                return;
            }

            db = connection;
            resolve(connection);
        });
    });
}

function closeDatabase() {
    return new Promise((resolve, reject) => {
        if (!db) {
            resolve();
            return;
        }

        db.close((err) => {
            if (err) {
                reject(err);
                return;
            }

            db = null;
            resolve();
        });
    });
}

function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS equipments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                barcode TEXT UNIQUE NOT NULL,
                current_status TEXT DEFAULT 'Disponivel',
                category TEXT DEFAULT 'Outros',
                unit_price REAL NOT NULL DEFAULT 1
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                date TEXT NOT NULL,
                end_date TEXT,
                created_by_username TEXT,
                event_type TEXT NOT NULL DEFAULT 'event',
                withdrawal_date TEXT,
                return_date TEXT,
                orcamento_id INTEGER,
                auto_created_at TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS event_spaces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS equipment_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                equipment_id INTEGER NOT NULL,
                event_id INTEGER NOT NULL,
                space_id INTEGER,
                action_type TEXT NOT NULL CHECK(action_type IN ('saida', 'entrada')),
                performed_by_username TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS event_reserved_equipments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER NOT NULL,
                equipment_id INTEGER NOT NULL,
                quote_item_id INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(event_id, equipment_id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS maintenances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                equipment_id INTEGER NOT NULL,
                description TEXT NOT NULL,
                resolved_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS cables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0,
                available_quantity INTEGER NOT NULL DEFAULT 0,
                category TEXT NOT NULL DEFAULT 'Outros',
                unit_price REAL NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS other_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0,
                available_quantity INTEGER NOT NULL DEFAULT 0,
                unit_price REAL NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS cable_maintenances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cable_id INTEGER NOT NULL,
                description TEXT NOT NULL,
                resolved_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS cable_event_movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cable_id INTEGER NOT NULL,
                event_id INTEGER NOT NULL,
                space_id INTEGER,
                action_type TEXT NOT NULL CHECK(action_type IN ('saida', 'entrada')),
                quantity INTEGER NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS other_item_event_movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                event_id INTEGER NOT NULL,
                space_id INTEGER,
                action_type TEXT NOT NULL CHECK(action_type IN ('saida', 'entrada')),
                quantity INTEGER NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS event_saida_hidden_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER NOT NULL,
                item_type TEXT NOT NULL CHECK(item_type IN ('equipment', 'cable', 'other')),
                item_id INTEGER NOT NULL,
                space_id INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user'
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS operators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                cpf TEXT NOT NULL UNIQUE,
                birth_date TEXT NOT NULL,
                address TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                area TEXT NOT NULL DEFAULT '',
                has_vehicle INTEGER NOT NULL DEFAULT 0,
                pix TEXT,
                agency TEXT,
                photo TEXT NOT NULL,
                cache_value REAL NOT NULL DEFAULT 0,
                created_by_username TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS quotes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proposal_city TEXT NOT NULL DEFAULT 'Belo Horizonte',
                proposal_date TEXT NOT NULL,
                client_name TEXT NOT NULL,
                event_name TEXT NOT NULL,
                event_location TEXT NOT NULL,
                event_datetime TEXT NOT NULL,
                assembly_datetime TEXT NOT NULL,
                disassembly_datetime TEXT NOT NULL,
                payment_method TEXT NOT NULL,
                payment_deadline TEXT NOT NULL,
                subtotal REAL NOT NULL DEFAULT 0,
                final_total REAL NOT NULL DEFAULT 0,
                show_item_prices INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                approved_at TEXT,
                created_by_username TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS quote_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                quote_id INTEGER NOT NULL,
                equipment_id INTEGER,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                daily_units INTEGER NOT NULL DEFAULT 1,
                internal_unit_price REAL NOT NULL DEFAULT 0,
                internal_total REAL NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS quote_technicians (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                quote_id INTEGER NOT NULL,
                operator_id INTEGER,
                operator_name TEXT NOT NULL,
                daily_units INTEGER NOT NULL DEFAULT 1,
                cache_value REAL NOT NULL DEFAULT 0,
                paid_at TEXT,
                paid_by_username TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS quote_hidden_equipments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                equipment_id INTEGER NOT NULL UNIQUE,
                hidden_by_username TEXT,
                hidden_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run("ALTER TABLE equipments ADD COLUMN current_status TEXT DEFAULT 'Disponivel'", () => {});
            db.run("ALTER TABLE equipments ADD COLUMN category TEXT DEFAULT 'Outros'", () => {});
            db.run("ALTER TABLE equipments ADD COLUMN unit_price REAL NOT NULL DEFAULT 1", () => {});
            db.run("ALTER TABLE events ADD COLUMN created_by_username TEXT", () => {});
            db.run("ALTER TABLE events ADD COLUMN end_date TEXT", () => {});
            db.run("ALTER TABLE events ADD COLUMN event_type TEXT DEFAULT 'event'", () => {});
            db.run("ALTER TABLE events ADD COLUMN withdrawal_date TEXT", () => {});
            db.run("ALTER TABLE events ADD COLUMN return_date TEXT", () => {});
            db.run("ALTER TABLE events ADD COLUMN orcamento_id INTEGER", () => {});
            db.run("ALTER TABLE events ADD COLUMN auto_created_at TEXT", () => {});
            db.run("ALTER TABLE equipment_events ADD COLUMN space_id INTEGER", () => {});
            db.run("ALTER TABLE equipment_events ADD COLUMN performed_by_username TEXT", () => {});
            db.run("ALTER TABLE maintenances ADD COLUMN resolved_at TEXT", () => {});
            db.run("ALTER TABLE cables ADD COLUMN category TEXT DEFAULT 'Outros'", () => {});
            db.run("ALTER TABLE cables ADD COLUMN available_quantity INTEGER DEFAULT 0", () => {});
            db.run("ALTER TABLE cables ADD COLUMN unit_price REAL NOT NULL DEFAULT 1", () => {});
            db.run("ALTER TABLE cables ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP", () => {});
            db.run("ALTER TABLE other_items ADD COLUMN unit_price REAL NOT NULL DEFAULT 1", () => {});
            db.run("ALTER TABLE cable_event_movements ADD COLUMN space_id INTEGER", () => {});
            db.run("ALTER TABLE other_item_event_movements ADD COLUMN space_id INTEGER", () => {});
            db.run("ALTER TABLE event_saida_hidden_items ADD COLUMN space_id INTEGER", () => {});
            db.run("ALTER TABLE quotes ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'", () => {});
            db.run("ALTER TABLE quotes ADD COLUMN approved_at TEXT", () => {});
            db.run("ALTER TABLE quotes ADD COLUMN show_item_prices INTEGER NOT NULL DEFAULT 0", () => {});
            db.run("ALTER TABLE quote_items ADD COLUMN equipment_id INTEGER", () => {});
            db.run("ALTER TABLE quote_technicians ADD COLUMN paid_at TEXT", () => {});
            db.run("ALTER TABLE quote_technicians ADD COLUMN paid_by_username TEXT", () => {});
            db.run("ALTER TABLE quote_technicians ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP", () => {});
            db.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'", () => {});
            db.run("ALTER TABLE operators ADD COLUMN area TEXT NOT NULL DEFAULT ''", () => {});
            db.run("ALTER TABLE operators ADD COLUMN has_vehicle INTEGER NOT NULL DEFAULT 0", () => {});
            db.run("ALTER TABLE operators ADD COLUMN created_by_username TEXT", () => {});
            db.run("ALTER TABLE operators ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP", () => {});
            db.run("ALTER TABLE operators ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP", () => {});
            db.run("UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''", () => {});
            db.run("UPDATE quotes SET status = 'pending' WHERE status IS NULL OR status = ''", () => {});
            db.run("UPDATE cables SET available_quantity = quantity WHERE available_quantity IS NULL OR available_quantity = 0", () => {});
            db.run("UPDATE equipments SET unit_price = 1 WHERE unit_price IS NULL", () => {});
            db.run("UPDATE cables SET unit_price = 1 WHERE unit_price IS NULL", () => {});
            db.run("UPDATE other_items SET unit_price = 1 WHERE unit_price IS NULL", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_event_spaces_event ON event_spaces(event_id)", () => {});
            db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_events_orcamento_id ON events(orcamento_id) WHERE orcamento_id IS NOT NULL", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_equipment_events_event_space_equipment ON equipment_events(event_id, space_id, equipment_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_event_reserved_equipments_event ON event_reserved_equipments(event_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_event_reserved_equipments_equipment ON event_reserved_equipments(equipment_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_cable_event_movements_event_space_cable ON cable_event_movements(event_id, space_id, cable_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_other_items_name ON other_items(name)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_other_item_event_movements_event_space_item ON other_item_event_movements(event_id, space_id, item_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_other_item_event_movements_event_item ON other_item_event_movements(event_id, item_id, created_at)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_event_saida_hidden_items_event_item ON event_saida_hidden_items(event_id, item_type, item_id, space_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id, sort_order)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quote_technicians_quote ON quote_technicians(quote_id, sort_order)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quote_technicians_operator ON quote_technicians(operator_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quote_hidden_equipments_equipment ON quote_hidden_equipments(equipment_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_operators_name ON operators(full_name)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_operators_cpf ON operators(cpf)", () => {});
            seedUsers(0);
        });

        function seedUsers(index) {
            if (index >= SEEDED_USERS.length) {
                resolve();
                return;
            }

            const user = SEEDED_USERS[index];
            db.run(
                `INSERT INTO users (username, password, role)
                 VALUES (?, ?, ?)
                 ON CONFLICT(username) DO UPDATE SET
                    password = excluded.password,
                    role = excluded.role`,
                [user.username, user.passwordHash, user.role],
                (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    seedUsers(index + 1);
                }
            );
        }
    });
}

async function createTestSnapshot(sessionId) {
    await fs.promises.mkdir(TEST_SESSION_DIR, { recursive: true });
    const safeSessionId = String(sessionId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
    const snapshotPath = path.join(TEST_SESSION_DIR, `snapshot-${safeSessionId}.db`);
    await fs.promises.copyFile(DATABASE_PATH, snapshotPath);
    return snapshotPath;
}

async function listTestSnapshots() {
    await fs.promises.mkdir(TEST_SESSION_DIR, { recursive: true });
    const entries = await fs.promises.readdir(TEST_SESSION_DIR, { withFileTypes: true });
    const snapshots = await Promise.all(
        entries
            .filter((entry) => entry.isFile() && entry.name.startsWith('snapshot-') && entry.name.endsWith('.db'))
            .map(async (entry) => {
                const snapshotPath = path.join(TEST_SESSION_DIR, entry.name);
                const stats = await fs.promises.stat(snapshotPath);
                return { path: snapshotPath, mtimeMs: stats.mtimeMs };
            })
    );

    return snapshots.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

async function clearPendingTestSnapshots() {
    const snapshots = await listTestSnapshots();
    await Promise.all(
        snapshots.map((snapshot) => fs.promises.rm(snapshot.path, { force: true }))
    );
}

async function restoreTestSnapshot(snapshotPath) {
    if (!snapshotPath) return;

    await closeDatabase();
    await fs.promises.copyFile(snapshotPath, DATABASE_PATH);
    await connectDatabase();
    await fs.promises.rm(snapshotPath, { force: true });
}

function timestampForFile(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-');
}

async function createSqliteBackup(reason = 'manual') {
    await fs.promises.mkdir(SQLITE_BACKUP_DIR, { recursive: true });
    const backupName = `database-${timestampForFile()}-${String(reason || 'manual')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 50)}.db`;
    const backupPath = path.join(SQLITE_BACKUP_DIR, backupName);
    await fs.promises.copyFile(DATABASE_PATH, backupPath);
    return backupPath;
}

async function verifyDeletePassword(password) {
    if (!DELETE_PASSWORD_HASH) {
        return false;
    }

    return bcrypt.compare(password, DELETE_PASSWORD_HASH);
}

function canEditInitialQuantity(req, password) {
    const username = String(req.session?.username || '').trim().toLowerCase();
    return [INITIAL_QUANTITY_EDITOR_USERNAME, LOCAL_INITIAL_QUANTITY_EDITOR_USERNAME].includes(username)
        && String(password || '').trim() === INITIAL_QUANTITY_EDIT_PASSWORD;
}

function canShowInitialQuantityEdit(username) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    return [INITIAL_QUANTITY_EDITOR_USERNAME, LOCAL_INITIAL_QUANTITY_EDITOR_USERNAME].includes(normalizedUsername);
}

function parseOptionalSpaceId(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const spaceId = Number(value);
    return Number.isInteger(spaceId) && spaceId > 0 ? spaceId : NaN;
}

async function resolveEventSpaceId(eventId, value) {
    const spaceId = parseOptionalSpaceId(value);
    if (Number.isNaN(spaceId)) {
        const error = new Error('Espaco invalido');
        error.statusCode = 400;
        throw error;
    }

    if (spaceId === null) {
        return null;
    }

    const space = await dbGet(
        'SELECT id FROM event_spaces WHERE id = ? AND event_id = ?',
        [spaceId, eventId]
    );

    if (!space) {
        const error = new Error('Espaco nao encontrado neste evento');
        error.statusCode = 404;
        throw error;
    }

    return spaceId;
}

function spacePredicate(columnName) {
    return `COALESCE(${columnName}, 0) = COALESCE(?, 0)`;
}

async function getEventsByCompletion(eventType, completed) {
    const orderBy = eventType === 'rental'
        ? 'ORDER BY COALESCE(e.return_date, e.date) DESC, e.id DESC'
        : 'ORDER BY e.date DESC, e.id DESC';
    const completionFilter = completed
        ? 'COALESCE(movements.movement_count, 0) > 0 AND COALESCE(pending.pending_quantity, 0) = 0'
        : '(COALESCE(movements.movement_count, 0) = 0 OR COALESCE(pending.pending_quantity, 0) > 0)';

    return dbAll(
        `SELECT e.*
         FROM events e
         LEFT JOIN (
             SELECT event_id, COUNT(*) AS movement_count
             FROM (
                 SELECT event_id FROM equipment_events
                 UNION ALL SELECT event_id FROM cable_event_movements
                 UNION ALL SELECT event_id FROM other_item_event_movements
             ) movement_rows
             GROUP BY event_id
         ) movements ON movements.event_id = e.id
         LEFT JOIN (
             SELECT event_id, SUM(pending_quantity) AS pending_quantity
             FROM (
                 SELECT event_id,
                        SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END) AS pending_quantity
                 FROM equipment_events
                 GROUP BY event_id, equipment_id, COALESCE(space_id, 0)
                 HAVING SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END) > 0

                 UNION ALL

                 SELECT event_id,
                        SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS pending_quantity
                 FROM cable_event_movements
                 GROUP BY event_id, cable_id, COALESCE(space_id, 0)
                 HAVING SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) > 0

                 UNION ALL

                 SELECT event_id,
                        SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS pending_quantity
                 FROM other_item_event_movements
                 GROUP BY event_id, item_id, COALESCE(space_id, 0)
                 HAVING SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) > 0
             ) pending_rows
             GROUP BY event_id
         ) pending ON pending.event_id = e.id
         WHERE COALESCE(e.event_type, 'event') = ?
           AND e.orcamento_id IS NULL
           AND ${completionFilter}
         ${orderBy}`,
        [eventType]
    );
}

async function getRentalReturnAlerts(today) {
    const rentalEvents = await dbAll(
        `SELECT *
         FROM events
         WHERE COALESCE(event_type, 'event') = 'rental'
           AND return_date IS NOT NULL
           AND return_date <= ?
         ORDER BY return_date ASC, id ASC`,
        [today]
    );

    const alerts = [];
    for (const event of rentalEvents) {
        const pendingItems = await getPendingRentalItems(Number(event.id));
        if (pendingItems.length > 0) {
            alerts.push({ ...event, pendingItems });
        }
    }

    return alerts;
}

async function getPendingRentalItems(eventId) {
    const equipments = await dbAll(
        `SELECT 'equipment' AS type,
                e.id AS item_id,
                e.name,
                e.barcode,
                SUM(CASE WHEN ee.action_type = 'saida' THEN 1 ELSE -1 END) AS quantity
         FROM equipment_events ee
         JOIN equipments e ON e.id = ee.equipment_id
         WHERE ee.event_id = ?
         GROUP BY e.id, e.name, e.barcode, COALESCE(ee.space_id, 0)
         HAVING SUM(CASE WHEN ee.action_type = 'saida' THEN 1 ELSE -1 END) > 0
         ORDER BY e.name ASC`,
        [eventId]
    );

    const cables = await dbAll(
        `SELECT 'cable' AS type,
                c.id AS item_id,
                c.name,
                NULL AS barcode,
                SUM(CASE WHEN cem.action_type = 'saida' THEN cem.quantity ELSE -cem.quantity END) AS quantity
         FROM cable_event_movements cem
         JOIN cables c ON c.id = cem.cable_id
         WHERE cem.event_id = ?
         GROUP BY c.id, c.name, COALESCE(cem.space_id, 0)
         HAVING SUM(CASE WHEN cem.action_type = 'saida' THEN cem.quantity ELSE -cem.quantity END) > 0
         ORDER BY c.name ASC`,
        [eventId]
    );

    const otherItems = await dbAll(
        `SELECT 'other' AS type,
                oi.id AS item_id,
                oi.name,
                NULL AS barcode,
                SUM(CASE WHEN oiem.action_type = 'saida' THEN oiem.quantity ELSE -oiem.quantity END) AS quantity
         FROM other_item_event_movements oiem
         JOIN other_items oi ON oi.id = oiem.item_id
         WHERE oiem.event_id = ?
         GROUP BY oi.id, oi.name, COALESCE(oiem.space_id, 0)
         HAVING SUM(CASE WHEN oiem.action_type = 'saida' THEN oiem.quantity ELSE -oiem.quantity END) > 0
         ORDER BY oi.name ASC`,
        [eventId]
    );

    return [...equipments, ...cables, ...otherItems].map((item) => ({
        ...item,
        quantity: Math.max(1, Number(item.quantity) || 1)
    }));
}

async function deleteEventRecords(eventId) {
    const equipmentsInEvent = await dbAll(
        'SELECT DISTINCT equipment_id FROM equipment_events WHERE event_id = ?',
        [eventId]
    );

    if (equipmentsInEvent.length > 0) {
        const placeholders = equipmentsInEvent.map(() => '?').join(', ');
        const equipmentIds = equipmentsInEvent.map((row) => row.equipment_id);
        await dbRun(
            `UPDATE equipments SET current_status = 'Disponivel' WHERE id IN (${placeholders})`,
            equipmentIds
        );
    }

    const cablesInEvent = await dbAll(
        `SELECT cable_id,
                SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS quantity
         FROM cable_event_movements
         WHERE event_id = ?
         GROUP BY cable_id
         HAVING quantity > 0`,
        [eventId]
    );

    for (const cableMovement of cablesInEvent) {
        await dbRun(
            'UPDATE cables SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [cableMovement.quantity, cableMovement.cable_id]
        );
    }

    const otherItemsInEvent = await dbAll(
        `SELECT item_id,
                SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS quantity
         FROM other_item_event_movements
         WHERE event_id = ?
         GROUP BY item_id
         HAVING quantity > 0`,
        [eventId]
    );

    for (const itemMovement of otherItemsInEvent) {
        await dbRun(
            'UPDATE other_items SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [itemMovement.quantity, itemMovement.item_id]
        );
    }

    await dbRun('DELETE FROM other_item_event_movements WHERE event_id = ?', [eventId]);
    await dbRun('DELETE FROM cable_event_movements WHERE event_id = ?', [eventId]);
    await dbRun('DELETE FROM equipment_events WHERE event_id = ?', [eventId]);
    await dbRun('DELETE FROM event_reserved_equipments WHERE event_id = ?', [eventId]);
    await dbRun('DELETE FROM event_saida_hidden_items WHERE event_id = ?', [eventId]);
    await dbRun('DELETE FROM event_spaces WHERE event_id = ?', [eventId]);
    await dbRun('DELETE FROM events WHERE id = ?', [eventId]);
}

async function bootstrapDatabase() {
    await fs.promises.mkdir(SQLITE_BACKUP_DIR, { recursive: true });
    await fs.promises.mkdir(TEST_SESSION_DIR, { recursive: true });
    await connectDatabase();
    await initializeDatabase();
    await clearPendingTestSnapshots();
    await createSqliteBackup('startup');
    console.log('Banco de dados conectado.');
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function destroySession(req) {
    return new Promise((resolve, reject) => {
        if (!req.session) {
            resolve();
            return;
        }

        req.session.destroy((err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve();
        });
    });
}

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve();
        });
    });
}

async function cleanupTestSession(req) {
    const snapshotPath = req.session?.snapshotPath;
    const isTestUser = !!req.session?.isTestUser;

    if (!isTestUser) return;

    await destroySession(req);
    await restoreTestSnapshot(snapshotPath);
}

function normalizeUserRole(role) {
    const normalized = String(role || 'user').trim().toLowerCase();
    return USER_ROLES.has(normalized) ? normalized : 'user';
}

function isDisposableTestUser(user) {
    const username = String(user?.username || '').trim().toLowerCase();
    return username === TEST_USERNAME && normalizeUserRole(user?.role) !== 'comercial';
}

async function requireAuth(req, res, next) {
    try {
        if (!req.session?.userId) {
            return res.status(401).json({ error: 'Nao autorizado' });
        }

        const user = await dbGet('SELECT id, username, COALESCE(role, "user") AS role FROM users WHERE id = ?', [req.session.userId]);
        if (!user) {
            return res.status(401).json({ error: 'Nao autorizado' });
        }

        user.role = normalizeUserRole(user.role);
        req.session.username = user.username;
        req.session.role = user.role;
        req.currentUser = user;

        if (user.role === 'comercial') {
            return res.status(403).json({ error: 'Acesso restrito a tela de orcamentos' });
        }

        return next();
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

async function requireAdmin(req, res, next) {
    try {
        if (!req.session?.userId) {
            return res.status(401).json({ error: 'Nao autorizado' });
        }

        const user = await dbGet('SELECT id, username, COALESCE(role, "user") AS role FROM users WHERE id = ?', [req.session.userId]);
        if (!user || normalizeUserRole(user.role) !== 'admin') {
            return res.status(403).json({ error: 'Acesso restrito a administradores' });
        }

        user.role = 'admin';
        req.currentUser = user;
        return next();
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

function requireRole(...allowedRoles) {
    const allowed = new Set(allowedRoles.map(normalizeUserRole));

    return async (req, res, next) => {
        try {
            if (!req.session?.userId) {
                return res.status(401).json({ error: 'Nao autorizado' });
            }

            const user = await dbGet('SELECT id, username, COALESCE(role, "user") AS role FROM users WHERE id = ?', [req.session.userId]);
            if (!user) {
                return res.status(401).json({ error: 'Nao autorizado' });
            }

            user.role = normalizeUserRole(user.role);
            req.session.username = user.username;
            req.session.role = user.role;
            req.currentUser = user;

            if (!allowed.has(user.role)) {
                return res.status(403).json({ error: 'Acesso nao permitido para este usuario' });
            }

            return next();
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };
}

const requireQuoteAccess = requireRole('admin', 'comercial');
const requireQuoteDatabaseAccess = requireRole('admin');
const requirePriceAccess = requireRole('admin');
const requireOperatorAccess = requireRole('admin', 'comercial');
const requireCommercialAccess = requireRole('comercial');
const PRICE_TABLES = {
    equipment: {
        table: 'equipments',
        categoryExpression: "COALESCE(category, 'Outros')"
    },
    cable: {
        table: 'cables',
        categoryExpression: "COALESCE(category, 'Outros')"
    },
    other: {
        table: 'other_items',
        categoryExpression: "'Outros'"
    }
};

function isAvailableStatus(status) {
    const normalized = (status || '').toLowerCase();
    return !normalized
        || normalized === 'disponivel'
        || normalized === 'disponível'
        || normalized === 'pre separado'
        || normalized === 'relacao'
        || normalized === 'relação';
}

function normalizeQuoteStatusText(status) {
    return String(status || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function isMaintenanceStatus(status) {
    return normalizeQuoteStatusText(status).includes('manut');
}

function isQuoteEquipmentUsableStatus(status) {
    return !isMaintenanceStatus(status);
}

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        await cleanupTestSession(req);

        const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
        if (user && bcrypt.compareSync(password, user.password)) {
            const role = normalizeUserRole(user.role);
            const disposableTestUser = isDisposableTestUser(user);
            if (disposableTestUser) {
                await clearPendingTestSnapshots();
            }

            await regenerateSession(req);
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = role;
            req.session.isTestUser = disposableTestUser;

            if (req.session.isTestUser) {
                req.session.snapshotPath = await createTestSnapshot(req.sessionID);
            }

            req.session.save(() => res.json({ success: true, isTestUser: req.session.isTestUser }));
            return;
        }

        res.status(401).json({ error: 'Incorreto' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/status', async (req, res) => {
    if (!req.session?.userId) {
        return res.json({ authenticated: false, isTestUser: false, username: null, role: null, isAdmin: false, isCommercial: false });
    }

    try {
        const user = await dbGet('SELECT username, COALESCE(role, "user") AS role FROM users WHERE id = ?', [req.session.userId]);
        if (!user) {
            return res.json({ authenticated: false, isTestUser: false, username: null, role: null, isAdmin: false, isCommercial: false });
        }

        user.role = normalizeUserRole(user.role);
        req.session.username = user.username;
        req.session.role = user.role;
        return res.json({
            authenticated: true,
            isTestUser: !!req.session.isTestUser,
            userId: req.session.userId,
            username: user.username,
            role: user.role,
            isAdmin: user.role === 'admin',
            isCommercial: user.role === 'comercial',
            canEditInitialQuantity: canShowInitialQuantityEdit(user.username)
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/users', requireAdmin, async (req, res) => {
    try {
        const users = await dbAll(
            `SELECT id, username, COALESCE(role, 'user') AS role
             FROM users
             ORDER BY lower(username) ASC`
        );
        res.json({
            users,
            canChangePasswords: req.currentUser?.role === 'admin'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', requireAdmin, async (req, res) => {
    try {
        const username = String(req.body?.username || '').trim();
        const password = String(req.body?.password || '');
        const role = normalizeUserRole(req.body?.role || 'user');

        if (!username) return res.status(400).json({ error: 'Usuario e obrigatorio' });
        if (password.trim().length < 4) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });
        }

        const existingUser = await dbGet('SELECT id FROM users WHERE lower(username) = lower(?)', [username]);
        if (existingUser) {
            return res.status(409).json({ error: 'Ja existe um usuario com esse nome' });
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        const result = await dbRun(
            'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
            [username, passwordHash, role]
        );
        res.json({ id: result.lastID, username, role, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/users/:id/password', requireAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const password = String(req.body?.password || '');
        if (!userId) return res.status(400).json({ error: 'Usuario invalido' });
        if (password.trim().length < 4) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });
        }

        const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });

        const passwordHash = bcrypt.hashSync(password, 10);
        await dbRun('UPDATE users SET password = ? WHERE id = ?', [passwordHash, userId]);
        await dbRun('DELETE FROM sessions WHERE user_id = ?', [userId]).catch(() => {});
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.id);
        if (!userId) return res.status(400).json({ error: 'Usuario invalido' });

        const user = await dbGet('SELECT id, username, COALESCE(role, "user") AS role FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
        if (Number(user.id) === Number(req.currentUser.id)) {
            return res.status(400).json({ error: 'Voce nao pode excluir seu proprio usuario' });
        }

        if (user.role === 'admin') {
            const adminCount = await dbGet('SELECT COUNT(*) AS total FROM users WHERE role = "admin"');
            if (Number(adminCount?.total) <= 1) {
                return res.status(400).json({ error: 'Nao e possivel excluir o ultimo administrador' });
            }
        }

        await dbRun('DELETE FROM sessions WHERE user_id = ?', [userId]).catch(() => {});
        await dbRun('DELETE FROM users WHERE id = ?', [userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function cleanText(value, maxLength = 500) {
    return String(value || '').trim().slice(0, maxLength);
}

function parseMoneyValue(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    const normalized = String(value || '')
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function operatorInputError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function onlyDigits(value, maxLength) {
    return String(value || '').replace(/\D/g, '').slice(0, maxLength);
}

function formatCpf(value) {
    const digits = onlyDigits(value, 11);
    if (digits.length !== 11) return '';
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCellPhone(value) {
    const digits = onlyDigits(value, 11);
    if (digits.length !== 11) return '';
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function normalizeOperatorPayload(body = {}, options = {}) {
    const fullName = cleanText(body.fullName ?? body.full_name, 160);
    const cpf = formatCpf(body.cpf);
    const birthDate = parseIsoDateKey(body.birthDate ?? body.birth_date);
    const address = cleanText(body.address, 300);
    const email = cleanText(body.email, 160);
    const phone = formatCellPhone(body.phone);
    const area = cleanText(body.area, 120);
    const hasVehicle = parseBooleanFlag(body.hasVehicle ?? body.has_vehicle);
    const pix = cleanText(body.pix, 160);
    const agency = cleanText(body.agency, 80);
    const photo = String(body.photo || '').trim();
    const cacheValue = roundMoney(parseMoneyValue(body.cacheValue ?? body.cache_value));

    if (!fullName) throw operatorInputError('Nome completo e obrigatorio');
    if (!cpf) throw operatorInputError('CPF deve ter 11 numeros');
    if (!birthDate) throw operatorInputError('Data de nascimento invalida');
    if (!address) throw operatorInputError('Endereco e obrigatorio');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw operatorInputError('Email invalido');
    }
    if (!phone) throw operatorInputError('Numero de celular deve ter 11 numeros com DDD');
    if (!area) throw operatorInputError('Area e obrigatoria');
    if (!Number.isFinite(cacheValue) || cacheValue < 0) {
        throw operatorInputError('Valor cache invalido');
    }
    if (!photo && options.requirePhoto) {
        throw operatorInputError('Foto e obrigatoria');
    }
    if (photo && (photo.length > OPERATOR_PHOTO_MAX_LENGTH || !OPERATOR_PHOTO_PATTERN.test(photo))) {
        throw operatorInputError('Foto invalida ou muito grande');
    }

    return {
        fullName,
        cpf,
        birthDate,
        address,
        email,
        phone,
        area,
        hasVehicle,
        pix,
        agency,
        photo,
        cacheValue
    };
}

function serializeOperator(row = {}) {
    return {
        id: row.id,
        fullName: row.fullName ?? row.full_name ?? '',
        cpf: row.cpf || '',
        birthDate: row.birthDate ?? row.birth_date ?? '',
        address: row.address || '',
        email: row.email || '',
        phone: row.phone || '',
        area: row.area || '',
        hasVehicle: Number(row.hasVehicle ?? row.has_vehicle ?? 0) === 1,
        pix: row.pix || '',
        agency: row.agency || '',
        photo: row.photo || '',
        cacheValue: roundMoney(row.cacheValue ?? row.cache_value ?? 0),
        createdByUsername: row.createdByUsername ?? row.created_by_username ?? '',
        createdAt: row.createdAt ?? row.created_at ?? '',
        updatedAt: row.updatedAt ?? row.updated_at ?? ''
    };
}

function parseBooleanFlag(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = String(value || '').trim().toLowerCase();
    return ['1', 'true', 'sim', 'yes', 'on'].includes(normalized);
}

function normalizeQuoteItem(item, index) {
    const description = cleanText(item?.description, 300);
    if (!description) return null;

    const category = QUOTE_CATEGORIES[item?.category] ? item.category : 'transmissao';
    const quantity = Math.max(1, Number.parseInt(item?.quantity, 10) || 1);
    const dailyUnits = Math.max(1, Number.parseInt(item?.dailyUnits, 10) || 1);
    const internalUnitPrice = roundMoney(parseMoneyValue(item?.internalUnitPrice));
    const internalTotal = roundMoney(quantity * dailyUnits * internalUnitPrice);

    return {
        category,
        description,
        quantity,
        dailyUnits,
        internalUnitPrice,
        internalTotal,
        sortOrder: index + 1
    };
}

function createQuoteItemError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function serializeQuoteEquipment(row) {
    return {
        id: Number(row.id),
        name: row.name,
        barcode: row.barcode,
        category: row.category || 'Outros',
        currentStatus: row.currentStatus || row.current_status || '',
        unitPrice: roundMoney(parseMoneyValue(row.unitPrice ?? row.unit_price ?? 1))
    };
}

async function getQuoteEquipment(equipmentId) {
    return dbGet(
        `SELECT id,
                name,
                barcode,
                current_status AS currentStatus,
                category,
                COALESCE(unit_price, 1) AS unitPrice
         FROM equipments
         WHERE id = ?`,
        [equipmentId]
    );
}

async function isQuoteEquipmentHidden(equipmentId) {
    const row = await dbGet(
        'SELECT equipment_id FROM quote_hidden_equipments WHERE equipment_id = ?',
        [equipmentId]
    );
    return !!row;
}

function serializeQuoteDatabaseEquipment(row) {
    const equipment = serializeQuoteEquipment(row);
    return {
        ...equipment,
        hiddenFromQuotes: Number(row.hiddenFromQuotes || row.hidden_from_quotes || 0) === 1,
        hiddenAt: row.hiddenAt || row.hidden_at || null,
        hiddenByUsername: row.hiddenByUsername || row.hidden_by_username || null
    };
}

async function normalizeEquipmentQuoteItem(item, index, usedEquipmentIds) {
    const equipmentId = Number(item?.equipmentId);
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        return normalizeQuoteItem(item, index);
    }

    if (usedEquipmentIds.has(equipmentId)) {
        throw createQuoteItemError('O mesmo equipamento foi acrescentado mais de uma vez ao orcamento.');
    }

    const equipment = await getQuoteEquipment(equipmentId);
    if (!equipment) {
        throw createQuoteItemError('Equipamento nao encontrado.', 404);
    }

    if (!isQuoteEquipmentUsableStatus(equipment.currentStatus)) {
        throw createQuoteItemError(`O equipamento "${equipment.name}" esta em manutencao.`, 409);
    }

    usedEquipmentIds.add(equipmentId);
    const category = QUOTE_CATEGORIES[item?.category] ? item.category : 'transmissao';
    const dailyUnits = Math.max(1, Number.parseInt(item?.dailyUnits, 10) || 1);
    const internalUnitPrice = roundMoney(parseMoneyValue(equipment.unitPrice));

    return {
        equipmentId,
        category,
        description: equipment.name,
        quantity: 1,
        dailyUnits,
        internalUnitPrice,
        internalTotal: roundMoney(dailyUnits * internalUnitPrice),
        sortOrder: index + 1
    };
}

async function getQuoteItemsFromBody(items) {
    const usedEquipmentIds = new Set();
    const normalizedItems = [];

    for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
        const normalized = await normalizeEquipmentQuoteItem(item, index, usedEquipmentIds);
        if (normalized) normalizedItems.push(normalized);
    }

    return normalizedItems;
}

async function getQuoteOperator(operatorId) {
    return dbGet(
        `SELECT id,
                full_name AS fullName,
                cache_value AS cacheValue
         FROM operators
         WHERE id = ?`,
        [operatorId]
    );
}

function serializeQuoteTechnician(row = {}) {
    const dailyUnits = Math.max(1, Number.parseInt(row.dailyUnits ?? row.daily_units, 10) || 1);
    const cacheValue = roundMoney(parseMoneyValue(row.cacheValue ?? row.cache_value));

    return {
        id: row.id ? Number(row.id) : null,
        operatorId: row.operatorId ?? row.operator_id ? Number(row.operatorId ?? row.operator_id) : null,
        operatorName: row.operatorName ?? row.operator_name ?? '',
        dailyUnits,
        cacheValue,
        paymentTotal: roundMoney(dailyUnits * cacheValue),
        paidAt: row.paidAt ?? row.paid_at ?? null,
        paidByUsername: row.paidByUsername ?? row.paid_by_username ?? null,
        sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0) || 0
    };
}

async function normalizeQuoteTechniciansFromBody(technicians) {
    const normalizedTechnicians = [];
    const usedOperatorIds = new Set();

    for (const [index, technician] of (Array.isArray(technicians) ? technicians : []).entries()) {
        const operatorId = Number(
            technician?.operatorId ??
            technician?.operator_id ??
            technician?.technicianId ??
            technician?.technician_id
        );
        if (!Number.isInteger(operatorId) || operatorId <= 0) {
            throw createQuoteItemError('Selecione um tecnico cadastrado para o orcamento.');
        }

        if (usedOperatorIds.has(operatorId)) {
            throw createQuoteItemError('O mesmo tecnico foi acrescentado mais de uma vez ao orcamento.');
        }

        const dailyUnits = Number.parseInt(technician?.dailyUnits ?? technician?.daily_units, 10);
        if (!Number.isInteger(dailyUnits) || dailyUnits <= 0) {
            throw createQuoteItemError('Informe uma quantidade valida de diarias para cada tecnico.');
        }

        const operator = await getQuoteOperator(operatorId);
        if (!operator) {
            throw createQuoteItemError('Tecnico nao encontrado.', 404);
        }

        usedOperatorIds.add(operatorId);
        const cacheValue = roundMoney(parseMoneyValue(operator.cacheValue));
        normalizedTechnicians.push({
            operatorId,
            operatorName: cleanText(operator.fullName, 160),
            dailyUnits,
            cacheValue,
            paymentTotal: roundMoney(dailyUnits * cacheValue),
            sortOrder: index + 1
        });
    }

    return normalizedTechnicians;
}

async function getQuoteTechnicians(quoteId) {
    const rows = await dbAll(
        `SELECT id,
                operator_id AS operatorId,
                operator_name AS operatorName,
                daily_units AS dailyUnits,
                cache_value AS cacheValue,
                paid_at AS paidAt,
                paid_by_username AS paidByUsername,
                sort_order AS sortOrder
         FROM quote_technicians
         WHERE quote_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [quoteId]
    );

    return rows.map(serializeQuoteTechnician);
}

async function saveQuoteTechnicians(quoteId, technicians) {
    await dbRun('DELETE FROM quote_technicians WHERE quote_id = ?', [quoteId]);

    for (const technician of technicians) {
        await dbRun(
            `INSERT INTO quote_technicians (
                quote_id,
                operator_id,
                operator_name,
                daily_units,
                cache_value,
                sort_order
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                quoteId,
                technician.operatorId,
                technician.operatorName,
                technician.dailyUnits,
                technician.cacheValue,
                technician.sortOrder
            ]
        );
    }
}

function getQuotePaymentDateKey(quote) {
    const disassemblyRange = getQuoteDateRangeFromText(quote?.disassemblyDatetime || quote?.disassembly_datetime);
    if (!disassemblyRange) return '';
    return addDaysToDateKey(disassemblyRange.end, 30);
}

function serializeQuotePaymentEntry(row = {}) {
    const technician = serializeQuoteTechnician(row);
    const paymentDate = getQuotePaymentDateKey(row);

    return {
        id: technician.id,
        quoteId: Number(row.quoteId ?? row.quote_id),
        eventName: row.eventName ?? row.event_name ?? '',
        clientName: row.clientName ?? row.client_name ?? '',
        eventLocation: row.eventLocation ?? row.event_location ?? '',
        eventDatetime: row.eventDatetime ?? row.event_datetime ?? '',
        disassemblyDatetime: row.disassemblyDatetime ?? row.disassembly_datetime ?? '',
        paymentDate,
        paymentDateLabel: formatDateKeyBR(paymentDate),
        operatorId: technician.operatorId,
        operatorName: technician.operatorName,
        dailyUnits: technician.dailyUnits,
        cacheValue: technician.cacheValue,
        paymentTotal: technician.paymentTotal,
        paidAt: technician.paidAt,
        paidByUsername: technician.paidByUsername
    };
}

async function getQuotePaymentEntries() {
    const rows = await dbAll(
        `SELECT quote_technicians.id,
                quote_technicians.operator_id AS operatorId,
                quote_technicians.operator_name AS operatorName,
                quote_technicians.daily_units AS dailyUnits,
                quote_technicians.cache_value AS cacheValue,
                quote_technicians.paid_at AS paidAt,
                quote_technicians.paid_by_username AS paidByUsername,
                quote_technicians.sort_order AS sortOrder,
                quotes.id AS quoteId,
                quotes.event_name AS eventName,
                quotes.client_name AS clientName,
                quotes.event_location AS eventLocation,
                quotes.event_datetime AS eventDatetime,
                quotes.disassembly_datetime AS disassemblyDatetime
         FROM quote_technicians
         INNER JOIN quotes ON quotes.id = quote_technicians.quote_id
         WHERE COALESCE(quotes.status, 'pending') = 'approved'
         ORDER BY quotes.disassembly_datetime ASC, quotes.event_name ASC, quote_technicians.sort_order ASC`
    );

    return rows
        .map(serializeQuotePaymentEntry)
        .filter((entry) => entry.paymentDate)
        .sort((first, second) => (
            first.paymentDate.localeCompare(second.paymentDate) ||
            String(first.eventName || '').localeCompare(String(second.eventName || ''), 'pt-BR') ||
            String(first.operatorName || '').localeCompare(String(second.operatorName || ''), 'pt-BR')
        ));
}

function getTodayDateInput() {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
}

function formatCurrencyBRL(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function parseLocalDate(dateValue) {
    const text = cleanText(dateValue, 20);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatLongDateBR(dateValue) {
    const date = parseLocalDate(dateValue);
    const months = [
        'janeiro',
        'fevereiro',
        'mar\u00e7o',
        'abril',
        'maio',
        'junho',
        'julho',
        'agosto',
        'setembro',
        'outubro',
        'novembro',
        'dezembro'
    ];

    return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}

async function getQuoteWithItems(quoteId) {
    const quote = await dbGet(
        `SELECT id,
                proposal_city AS proposalCity,
                proposal_date AS proposalDate,
                client_name AS clientName,
                event_name AS eventName,
                event_location AS eventLocation,
                event_datetime AS eventDatetime,
                assembly_datetime AS assemblyDatetime,
                disassembly_datetime AS disassemblyDatetime,
                payment_method AS paymentMethod,
                payment_deadline AS paymentDeadline,
                subtotal,
                final_total AS finalTotal,
                COALESCE(show_item_prices, 0) AS showItemPrices,
                notes,
                COALESCE(status, 'pending') AS status,
                approved_at AS approvedAt,
                created_by_username AS createdByUsername,
                created_at AS createdAt
         FROM quotes
         WHERE id = ?`,
        [quoteId]
    );

    if (!quote) return null;
    quote.showItemPrices = Number(quote.showItemPrices) === 1;

    quote.items = await dbAll(
        `SELECT id,
                equipment_id AS equipmentId,
                category,
                description,
                quantity,
                daily_units AS dailyUnits,
                internal_unit_price AS internalUnitPrice,
                internal_total AS internalTotal,
                sort_order AS sortOrder
         FROM quote_items
         WHERE quote_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [quoteId]
    );

    quote.technicians = await getQuoteTechnicians(quoteId);

    return quote;
}

async function releaseScheduledQuoteEquipments(quoteId) {
    const equipments = await dbAll(
        `SELECT DISTINCT equipment_id AS equipmentId
         FROM quote_items
         WHERE quote_id = ?
           AND equipment_id IS NOT NULL`,
        [quoteId]
    );

    if (equipments.length === 0) return;

    const equipmentIds = equipments
        .map((item) => Number(item.equipmentId))
        .filter((equipmentId) => Number.isInteger(equipmentId) && equipmentId > 0);
    if (equipmentIds.length === 0) return;

    const placeholders = equipmentIds.map(() => '?').join(', ');
    await dbRun(
        `UPDATE equipments
         SET current_status = 'Disponivel'
         WHERE current_status = 'Agendado'
           AND id IN (${placeholders})`,
        equipmentIds
    );
}

const QUOTE_PDF_SIZE = [596.04, 842.04];
const QUOTE_PDF_LEFT = 49.56;
const QUOTE_PDF_WIDTH = 517.2;
const QUOTE_HEADER_PATH = path.join(__dirname, 'public', 'quote-header.png');
const QUOTE_SIGNATURE_PATH = path.join(__dirname, 'public', 'quote-signature.png');

function getQuotePdfFonts(doc) {
    const windowsFonts = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
    const regularPath = path.join(windowsFonts, 'arial.ttf');
    const boldPath = path.join(windowsFonts, 'arialbd.ttf');

    if (fs.existsSync(regularPath) && fs.existsSync(boldPath)) {
        doc.registerFont('QuoteRegular', regularPath);
        doc.registerFont('QuoteBold', boldPath);
        return { regular: 'QuoteRegular', bold: 'QuoteBold' };
    }

    return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
}

function drawQuoteHeader(doc) {
    if (fs.existsSync(QUOTE_HEADER_PATH)) {
        doc.image(QUOTE_HEADER_PATH, 50.9, 22.4, {
            width: 512.1,
            height: 154.6
        });
    }
}

function drawQuoteHeading(doc, text, x, y, fonts, width = 500) {
    doc.font(fonts.regular)
        .fontSize(10.4)
        .fillColor('#111111')
        .text(text, x, y, {
            width,
            underline: true,
            lineBreak: false
        });
}

function drawQuoteCellText(doc, text, x, y, width, height, fonts, options = {}) {
    const font = options.bold ? fonts.bold : fonts.regular;
    const fontSize = options.fontSize || 9.2;
    const paddingX = options.paddingX ?? 6;
    const lineGap = options.lineGap ?? 0;
    const textValue = String(text ?? '-');
    const textWidth = Math.max(1, width - paddingX * 2);

    doc.font(font).fontSize(fontSize);
    const textHeight = doc.heightOfString(textValue, {
        width: textWidth,
        lineGap
    });
    const verticalPadding = Math.max(2, (height - textHeight) / 2);

    doc.fillColor('#111111').text(textValue, x + paddingX, y + verticalPadding, {
        width: textWidth,
        height: Math.max(textHeight + 2, height - verticalPadding),
        align: options.align || 'left',
        lineGap
    });
}

function drawQuoteInformationTable(doc, quote, y, fonts) {
    const x = 71.05;
    const width = 488.4;
    const labelWidth = 184.1;
    const valueWidth = width - labelWidth;
    const rows = [
        ['NOME DO CLIENTE', quote.clientName],
        ['NOME DO EVENTO', quote.eventName],
        ['LOCAL DO EVENTO', quote.eventLocation],
        ['DATA DE MONTAGEM', quote.assemblyDatetime],
        ['DATA DO EVENTO', quote.eventDatetime],
        ['DATA DE DESMONTAGEM', quote.disassemblyDatetime]
    ];

    const rowHeights = rows.map(([, value]) => {
        doc.font(fonts.regular).fontSize(9.2);
        return Math.max(
            15.1,
            doc.heightOfString(String(value || '-'), { width: valueWidth - 12 }) + 4
        );
    });
    const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0);

    doc.lineWidth(0.8).strokeColor('#111111').rect(x, y, width, totalHeight).stroke();
    doc.moveTo(x + labelWidth, y).lineTo(x + labelWidth, y + totalHeight).stroke();

    let rowY = y;
    rows.forEach(([label, value], index) => {
        const rowHeight = rowHeights[index];
        if (index > 0) {
            doc.moveTo(x, rowY).lineTo(x + width, rowY).stroke();
        }
        drawQuoteCellText(doc, label, x, rowY, labelWidth, rowHeight, fonts);
        drawQuoteCellText(doc, value || '-', x + labelWidth, rowY, valueWidth, rowHeight, fonts, {
            paddingX: 1
        });
        rowY += rowHeight;
    });

    return y + totalHeight;
}

function formatQuoteCurrency(value) {
    return formatCurrencyBRL(value).replace(/\s/g, '');
}

function getQuoteItemDescription(item) {
    return cleanText(item?.description, 300) || '-';
}

function getQuoteItemRowHeight(doc, item, fonts, descriptionWidth) {
    doc.font(fonts.regular).fontSize(9.2);
    const descriptionHeight = doc.heightOfString(getQuoteItemDescription(item), {
        width: descriptionWidth - 12
    });
    return Math.max(18, descriptionHeight + 7);
}

function getQuoteItemTableWidths(showItemPrices) {
    return showItemPrices
        ? [56.7, 240.3, 43, 70, 107.2]
        : [56.7, 347.5, 43, 70];
}

function takeQuoteItemsForPage(doc, items, fonts, maxItems, maxBodyHeight, showItemPrices = true) {
    const descriptionWidth = getQuoteItemTableWidths(showItemPrices)[1];
    let count = 0;
    let usedHeight = 0;

    for (const item of items) {
        const rowHeight = getQuoteItemRowHeight(doc, item, fonts, descriptionWidth);
        if (count > 0 && (count >= maxItems || usedHeight + rowHeight > maxBodyHeight)) {
            break;
        }
        count += 1;
        usedHeight += rowHeight;
    }

    return items.slice(0, Math.max(1, count));
}

function drawQuoteItemsTable(doc, items, startIndex, y, fonts, options = {}) {
    const x = QUOTE_PDF_LEFT;
    const showItemPrices = options.showItemPrices !== false;
    const widths = getQuoteItemTableWidths(showItemPrices);
    const headerHeight = 14.5;
    const rowHeights = items.map((item) => getQuoteItemRowHeight(doc, item, fonts, widths[1]));
    const naturalBodyHeight = rowHeights.reduce((sum, height) => sum + height, 0);
    const bodyHeight = Math.max(options.minimumBodyHeight || 0, naturalBodyHeight);
    const totalHeight = headerHeight + bodyHeight;
    const boundaries = [x];

    widths.forEach((width) => boundaries.push(boundaries[boundaries.length - 1] + width));

    doc.lineWidth(0.7).strokeColor('#111111').rect(x, y, QUOTE_PDF_WIDTH, totalHeight).stroke();
    boundaries.slice(1, -1).forEach((boundary) => {
        doc.moveTo(boundary, y).lineTo(boundary, y + totalHeight).stroke();
    });
    doc.moveTo(x, y + headerHeight).lineTo(x + QUOTE_PDF_WIDTH, y + headerHeight).stroke();

    const headers = showItemPrices
        ? ['Item', 'Equipamentos e Servi\u00e7os', 'Quant', 'Di\u00e1rias/Uni.', 'Valor Total/Uni.']
        : ['Item', 'Equipamentos e Servi\u00e7os', 'Quant', 'Di\u00e1rias/Uni.'];
    let headerX = x;
    headers.forEach((header, index) => {
        drawQuoteCellText(doc, header, headerX, y, widths[index], headerHeight, fonts, {
            fontSize: index === 0 ? 10 : 9.2,
            paddingX: index === 0 ? 6 : 2
        });
        headerX += widths[index];
    });

    let rowY = y + headerHeight;
    items.forEach((item, index) => {
        const rowHeight = rowHeights[index];
        if (index > 0) {
            doc.moveTo(x, rowY).lineTo(x + QUOTE_PDF_WIDTH, rowY).stroke();
        }

        const values = [
            '',
            `${String(startIndex + index + 1).padStart(2, '0')} ${getQuoteItemDescription(item)}`,
            String(Math.max(1, Number(item.quantity) || 1)).padStart(2, '0'),
            String(Math.max(1, Number(item.dailyUnits) || 1)).padStart(2, '0')
        ];

        if (showItemPrices) {
            values.push(formatQuoteCurrency(item.internalTotal));
        }

        let cellX = x;
        values.forEach((value, valueIndex) => {
            drawQuoteCellText(doc, value, cellX, rowY, widths[valueIndex], rowHeight, fonts, {
                paddingX: valueIndex === 1 ? 1 : 2
            });
            cellX += widths[valueIndex];
        });

        rowY += rowHeight;
    });

    return y + totalHeight;
}

function getQuoteNotesText(notes) {
    const defaultNotes = 'Obs.: A validade desta proposta est\u00e1 sujeita \u00e0 verifica\u00e7\u00e3o de disponibilidade de equipamentos e pessoal especializado ap\u00f3s sua aprova\u00e7\u00e3o. Proposta v\u00e1lida por 1 dia.';
    const text = cleanText(notes, 800) || defaultNotes;
    const comparableText = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    if (
        comparableText.includes('a validade desta proposta esta sujeita a verificacao de disponibilidade')
        && comparableText.includes('proposta valida por 1 dia')
    ) {
        return defaultNotes;
    }

    return /^obs\.\s*:/i.test(text) ? text : `Obs.: ${text}`;
}

function getQuotePaymentMethodText(value) {
    const text = cleanText(value, 160) || '-';
    const comparableText = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    return comparableText === 'deposito em conta corrente'
        ? 'Dep\u00f3sito em Conta Corrente'
        : text;
}

function drawQuoteTotalAndNotes(doc, quote, y, fonts) {
    const x = QUOTE_PDF_LEFT;
    const totalHeight = 42.5;
    const notesHeight = 58.8;
    const splitWidth = 340.6;

    doc.lineWidth(0.8).strokeColor('#111111').rect(x, y, QUOTE_PDF_WIDTH, totalHeight).stroke();
    doc.moveTo(x + splitWidth, y).lineTo(x + splitWidth, y + totalHeight).stroke();
    drawQuoteCellText(doc, 'Valor Total', x, y, splitWidth, totalHeight, fonts, {
        fontSize: 9.6,
        align: 'center'
    });
    drawQuoteCellText(
        doc,
        formatQuoteCurrency(quote.finalTotal),
        x + splitWidth,
        y,
        QUOTE_PDF_WIDTH - splitWidth,
        totalHeight,
        fonts,
        { fontSize: 9.6, paddingX: 1 }
    );

    const notesY = y + totalHeight;
    doc.rect(x, notesY, QUOTE_PDF_WIDTH, notesHeight).stroke();
    drawQuoteCellText(doc, getQuoteNotesText(quote.notes), x, notesY, QUOTE_PDF_WIDTH, notesHeight, fonts, {
        fontSize: 8.3,
        paddingX: 6,
        lineGap: 1
    });

    return notesY + notesHeight;
}

function drawQuotePaymentTable(doc, quote, y, fonts) {
    const x = 70.1;
    const width = 468.4;
    const labelWidth = 194.1;
    const valueWidth = width - labelWidth;
    const rows = [
        ['Valor Total', formatQuoteCurrency(quote.finalTotal), false, 30.5],
        ['Forma de Pagamento', getQuotePaymentMethodText(quote.paymentMethod), true, 23.5],
        ['Prazo', quote.paymentDeadline || '-', true, 27]
    ];
    const totalHeight = rows.reduce((sum, row) => sum + row[3], 0);

    doc.lineWidth(0.8).strokeColor('#111111').rect(x, y, width, totalHeight).stroke();
    doc.moveTo(x + labelWidth, y).lineTo(x + labelWidth, y + totalHeight).stroke();

    let rowY = y;
    rows.forEach(([label, value, bold, rowHeight], index) => {
        if (index > 0) {
            doc.moveTo(x, rowY).lineTo(x + width, rowY).stroke();
        }
        drawQuoteCellText(doc, label, x, rowY, labelWidth, rowHeight, fonts, {
            fontSize: 9.6
        });
        drawQuoteCellText(doc, value, x + labelWidth, rowY, valueWidth, rowHeight, fonts, {
            fontSize: 9.6,
            bold,
            paddingX: 6
        });
        rowY += rowHeight;
    });

    return y + totalHeight;
}

function drawQuoteSummary(doc, quote, tableBottom, fonts, referenceLayout = false) {
    const totalY = tableBottom + 4;
    const notesBottom = drawQuoteTotalAndNotes(doc, quote, totalY, fonts);
    const paymentHeadingY = referenceLayout ? Math.max(619, notesBottom + 43) : notesBottom + 42;

    drawQuoteHeading(doc, 'CONDI\u00c7\u00d5ES DE PAGAMENTO:', QUOTE_PDF_LEFT, paymentHeadingY, fonts);
    drawQuotePaymentTable(doc, quote, paymentHeadingY + 16.5, fonts);
}

function drawQuoteContinuationPages(doc, quote, remainingItems, startIndex, fonts) {
    let itemIndex = startIndex;
    let pendingItems = remainingItems.slice();
    const showItemPrices = quote.showItemPrices === true;

    while (pendingItems.length > 0) {
        doc.addPage();
        drawQuoteHeader(doc);
        drawQuoteHeading(doc, 'DESCRI\u00c7\u00c3O DOS EQUIPAMENTOS (CONTINUA\u00c7\u00c3O):', QUOTE_PDF_LEFT, 204, fonts);

        const pageItems = takeQuoteItemsForPage(doc, pendingItems, fonts, 12, 324, showItemPrices);
        pendingItems = pendingItems.slice(pageItems.length);
        const tableBottom = drawQuoteItemsTable(doc, pageItems, itemIndex, 221, fonts, { showItemPrices });
        itemIndex += pageItems.length;

        if (pendingItems.length === 0) {
            drawQuoteSummary(doc, quote, tableBottom, fonts);
        } else {
            doc.font(fonts.regular)
                .fontSize(8.5)
                .fillColor('#444444')
                .text('Continua na pr\u00f3xima p\u00e1gina.', QUOTE_PDF_LEFT, tableBottom + 10, {
                    width: QUOTE_PDF_WIDTH,
                    align: 'right'
                });
        }
    }
}

function drawQuoteResponsibilitiesPage(doc, fonts) {
    doc.addPage();
    drawQuoteHeader(doc);
    drawQuoteHeading(doc, 'RESPONSABILIDADES E GARANTIAS:', QUOTE_PDF_LEFT, 204.5, fonts);

    doc.font(fonts.regular).fontSize(9.5).fillColor('#111111');
    doc.text('-', 61.58, 232.5, { width: 12 });
    doc.text(
        'A 24H LOCA\u00c7\u00c3O DE EQUIPAMENTOS LTDA. se responsabiliza pela entrega e montagem (quando',
        97.58,
        232.5,
        { width: 438 }
    );
    doc.text(
        'solicitada) dos equipamentos em perfeitas condi\u00e7\u00f5es de uso, garantindo seu funcionamento, desde que',
        61.58,
        246,
        { width: 474 }
    );
    doc.text(
        'submetido \u00e0s condi\u00e7\u00f5es pr\u00e9-estabelecidas pelo fabricante.',
        61.58,
        259.5,
        { width: 474 }
    );
    doc.text('-', 61.58, 273, { width: 12 });
    doc.text(
        'Da mesma forma, \u00e9 da responsabilidade do cliente, disponibilizar ambiente e condi\u00e7\u00f5es',
        97.58,
        273,
        { width: 438 }
    );
    doc.text(
        'adequadas para o bom funcionamento e utilidade dos equipamentos, assim como o zelar pela seguran\u00e7a',
        61.58,
        286.5,
        { width: 474 }
    );
    doc.text(
        'e conserva\u00e7\u00e3o dos mesmos durante a loca\u00e7\u00e3o.',
        61.58,
        300,
        { width: 474 }
    );
    doc.text(
        'Agradecemos e aguardamos retorno, na expectativa de que possamos trabalhar juntos em prol do sucesso deste evento.',
        61.58,
        326.5,
        {
            width: 473.5,
            align: 'justify',
            lineGap: 2
        }
    );
    doc.text('Atenciosamente,', 61.58, 367.2, { width: 200 });
    doc.text('24H Loca\u00e7\u00e3o', 61.58, 393.8, {
        width: 90,
        underline: true
    });

    if (fs.existsSync(QUOTE_SIGNATURE_PATH)) {
        doc.image(QUOTE_SIGNATURE_PATH, 53, 422, {
            width: 205,
            height: 84.7
        });
    }
}

function drawQuotePdf(doc, quote) {
    const fonts = getQuotePdfFonts(doc);
    const allItems = Array.isArray(quote.items) ? quote.items : [];
    const showItemPrices = quote.showItemPrices === true;
    const firstPageItems = takeQuoteItemsForPage(doc, allItems, fonts, 6, 108, showItemPrices);
    const remainingItems = allItems.slice(firstPageItems.length);

    drawQuoteHeader(doc);
    doc.font(fonts.regular)
        .fontSize(10)
        .fillColor('#111111')
        .text(
            `${quote.proposalCity || 'Belo Horizonte'}, ${formatLongDateBR(quote.proposalDate)}`,
            61.58,
            198.5,
            { width: 470 }
        );

    drawQuoteHeading(doc, 'INFORMA\u00c7\u00d5ES GERAIS:', 61.58, 242.5, fonts);
    const informationBottom = drawQuoteInformationTable(doc, quote, 259.8, fonts);
    const itemsHeadingY = Math.max(383.8, informationBottom + 32.5);
    drawQuoteHeading(doc, 'DESCRI\u00c7\u00c3O DOS EQUIPAMENTOS:', 61.58, itemsHeadingY, fonts);
    const tableBottom = drawQuoteItemsTable(doc, firstPageItems, 0, itemsHeadingY + 16.5, fonts, {
        minimumBodyHeight: 52.5,
        showItemPrices
    });

    if (remainingItems.length === 0) {
        drawQuoteSummary(doc, quote, tableBottom, fonts, true);
    } else {
        doc.font(fonts.regular)
            .fontSize(8.5)
            .fillColor('#444444')
            .text('Continua na pr\u00f3xima p\u00e1gina.', QUOTE_PDF_LEFT, tableBottom + 10, {
                width: QUOTE_PDF_WIDTH,
                align: 'right'
            });
        drawQuoteContinuationPages(doc, quote, remainingItems, firstPageItems.length, fonts);
    }

    drawQuoteResponsibilitiesPage(doc, fonts);
}

app.get('/api/prices', requirePriceAccess, async (req, res) => {
    const type = String(req.query.type || '').trim().toLowerCase();
    const search = cleanText(req.query.search, 120);
    const config = PRICE_TABLES[type];

    if (!config) {
        return res.status(400).json({ error: 'Tipo de item invalido' });
    }

    try {
        const items = await dbAll(
            `SELECT id,
                    name,
                    ${config.categoryExpression} AS category,
                    COALESCE(unit_price, 1) AS unitPrice
             FROM ${config.table}
             WHERE name LIKE ?
             ORDER BY category ASC, name ASC`,
            [`%${search}%`]
        );

        return res.json({ type, items });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/prices/:type/:id', requirePriceAccess, async (req, res) => {
    const type = String(req.params.type || '').trim().toLowerCase();
    const itemId = Number(req.params.id);
    const unitPrice = roundMoney(parseMoneyValue(req.body?.unitPrice));
    const config = PRICE_TABLES[type];

    if (!config || !Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: 'Item invalido' });
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ error: 'Preco invalido' });
    }

    try {
        const item = await dbGet(`SELECT id FROM ${config.table} WHERE id = ?`, [itemId]);
        if (!item) {
            return res.status(404).json({ error: 'Item nao encontrado' });
        }

        await dbRun(
            `UPDATE ${config.table}
             SET unit_price = ?
             WHERE id = ?`,
            [unitPrice, itemId]
        );

        return res.json({ success: true, id: itemId, type, unitPrice });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/orcamentos/equipamentos-banco', requireQuoteDatabaseAccess, async (req, res) => {
    const search = cleanText(req.query.search, 120);

    try {
        const rows = await dbAll(
            `SELECT equipments.id,
                    equipments.name,
                    equipments.barcode,
                    equipments.current_status AS currentStatus,
                    equipments.category,
                    COALESCE(equipments.unit_price, 1) AS unitPrice,
                    CASE WHEN quote_hidden_equipments.equipment_id IS NULL THEN 0 ELSE 1 END AS hiddenFromQuotes,
                    quote_hidden_equipments.hidden_at AS hiddenAt,
                    quote_hidden_equipments.hidden_by_username AS hiddenByUsername
             FROM equipments
             LEFT JOIN quote_hidden_equipments
               ON quote_hidden_equipments.equipment_id = equipments.id
             WHERE equipments.name LIKE ?
                OR equipments.barcode LIKE ?
                OR COALESCE(equipments.category, '') LIKE ?
             ORDER BY hiddenFromQuotes ASC,
                      lower(COALESCE(equipments.category, 'Outros')) ASC,
                      lower(equipments.name) ASC,
                      equipments.barcode ASC`,
            [`%${search}%`, `%${search}%`, `%${search}%`]
        );

        return res.json({ equipments: rows.map(serializeQuoteDatabaseEquipment) });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/orcamentos/equipamentos/:id/ocultar', requireQuoteDatabaseAccess, async (req, res) => {
    const equipmentId = Number(req.params.id);
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        return res.status(400).json({ error: 'Equipamento invalido.' });
    }

    try {
        const equipment = await getQuoteEquipment(equipmentId);
        if (!equipment) {
            return res.status(404).json({ error: 'Equipamento nao encontrado.' });
        }

        await dbRun(
            `INSERT INTO quote_hidden_equipments (equipment_id, hidden_by_username)
             VALUES (?, ?)
             ON CONFLICT(equipment_id) DO UPDATE SET
                hidden_by_username = excluded.hidden_by_username,
                hidden_at = CURRENT_TIMESTAMP`,
            [equipmentId, req.currentUser?.username || req.session?.username || null]
        );

        return res.json({ success: true, equipmentId, hiddenFromQuotes: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/orcamentos/equipamentos/:id/restaurar', requireQuoteDatabaseAccess, async (req, res) => {
    const equipmentId = Number(req.params.id);
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        return res.status(400).json({ error: 'Equipamento invalido.' });
    }

    try {
        await dbRun('DELETE FROM quote_hidden_equipments WHERE equipment_id = ?', [equipmentId]);
        return res.json({ success: true, equipmentId, hiddenFromQuotes: false });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/orcamentos/equipamentos-disponiveis', requireQuoteAccess, async (req, res) => {
    const search = cleanText(req.query.search, 120);

    if (!search) {
        return res.json({ equipments: [] });
    }

    try {
        const rows = await dbAll(
            `SELECT id,
                    name,
                    barcode,
                    current_status AS currentStatus,
                    category,
                    COALESCE(unit_price, 1) AS unitPrice
             FROM equipments
             WHERE name LIKE ?
               AND NOT EXISTS (
                   SELECT 1
                   FROM quote_hidden_equipments
                   WHERE quote_hidden_equipments.equipment_id = equipments.id
               )
             ORDER BY lower(name) ASC, barcode ASC
             LIMIT 50`,
            [`%${search}%`]
        );

        const equipments = rows
            .filter((equipment) => isQuoteEquipmentUsableStatus(equipment.currentStatus))
            .map(serializeQuoteEquipment);

        return res.json({ equipments });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/orcamentos/equipamentos/:id/agendar', requireQuoteAccess, async (req, res) => {
    const equipmentId = Number(req.params.id);
    const eventDatetime = cleanText(req.body?.eventDatetime, 160);
    const excludeQuoteId = Number(req.body?.quoteId || req.body?.excludeQuoteId);
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        return res.status(400).json({ error: 'Equipamento invalido.' });
    }

    const eventRange = getQuoteDateRangeFromText(eventDatetime);
    if (!eventRange) {
        return res.status(400).json({ error: 'Informe a Data do Evento antes de acrescentar o equipamento.' });
    }

    try {
        const equipment = await getQuoteEquipment(equipmentId);
        if (!equipment) {
            return res.status(404).json({ error: 'Equipamento nao encontrado.' });
        }

        if (await isQuoteEquipmentHidden(equipmentId)) {
            return res.status(409).json({ error: 'Este equipamento esta oculto no banco de orcamentos.' });
        }

        if (!isQuoteEquipmentUsableStatus(equipment.currentStatus)) {
            return res.status(409).json({ error: 'Este equipamento esta em manutencao.' });
        }

        const conflict = await findEquipmentDateConflict(equipmentId, eventRange, {
            equipment,
            excludeQuoteId
        });
        if (conflict) {
            return sendDateConflict(res, conflict);
        }

        return res.json({
            success: true,
            equipment: serializeQuoteEquipment(equipment)
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/orcamentos/equipamentos/:id/liberar', requireQuoteAccess, async (req, res) => {
    const equipmentId = Number(req.params.id);
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        return res.status(400).json({ error: 'Equipamento invalido.' });
    }

    try {
        const equipment = await getQuoteEquipment(equipmentId);
        if (!equipment) {
            return res.status(404).json({ error: 'Equipamento nao encontrado.' });
        }

        return res.json({
            success: true,
            equipment: serializeQuoteEquipment(equipment)
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/orcamentos', requireQuoteAccess, async (req, res) => {
    const status = String(req.query.status || 'pending').trim().toLowerCase() === 'approved'
        ? 'approved'
        : 'pending';

    try {
        const quotes = await dbAll(
            `SELECT quotes.id,
                    quotes.client_name AS clientName,
                    quotes.event_name AS eventName,
                    quotes.event_location AS eventLocation,
                    quotes.event_datetime AS eventDatetime,
                    quotes.assembly_datetime AS assemblyDatetime,
                    quotes.disassembly_datetime AS disassemblyDatetime,
                    quotes.final_total AS finalTotal,
                    COALESCE(quotes.status, 'pending') AS status,
                    quotes.approved_at AS approvedAt,
                    quotes.created_by_username AS createdByUsername,
                    quotes.created_at AS createdAt,
                    COUNT(quote_items.id) AS itemCount
             FROM quotes
             LEFT JOIN quote_items ON quote_items.quote_id = quotes.id
             WHERE COALESCE(quotes.status, 'pending') = ?
             GROUP BY quotes.id
             ORDER BY ${status === 'approved' ? 'datetime(quotes.approved_at) DESC,' : ''} quotes.created_at DESC, quotes.id DESC`,
            [status]
        );

        res.json({ quotes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function getQuoteDateKeysFromText(value) {
    const matches = Array.from(String(value || '').matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g))
        .map((match) => ({
            day: Number(match[1]),
            month: Number(match[2]),
            year: Number(match[3])
        }));

    if (!matches.length) return [];

    const start = matches[0];
    const end = matches[1] || matches[0];
    const startDate = new Date(start.year, start.month - 1, start.day);
    const endDate = new Date(end.year, end.month - 1, end.day);
    if (
        startDate.getFullYear() !== start.year ||
        startDate.getMonth() !== start.month - 1 ||
        startDate.getDate() !== start.day ||
        endDate.getFullYear() !== end.year ||
        endDate.getMonth() !== end.month - 1 ||
        endDate.getDate() !== end.day ||
        endDate < startDate
    ) {
        return [];
    }

    const keys = [];
    const cursor = new Date(startDate);
    let guard = 0;
    while (cursor <= endDate && guard < 3700) {
        keys.push([
            String(cursor.getFullYear()).padStart(4, '0'),
            String(cursor.getMonth() + 1).padStart(2, '0'),
            String(cursor.getDate()).padStart(2, '0')
        ].join('-'));
        cursor.setDate(cursor.getDate() + 1);
        guard += 1;
    }

    return keys;
}

function toDateKey(year, month, day) {
    const date = new Date(year, month - 1, day);
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return '';
    }

    return [
        String(year).padStart(4, '0'),
        String(month).padStart(2, '0'),
        String(day).padStart(2, '0')
    ].join('-');
}

function parseIsoDateKey(value) {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    return toDateKey(Number(match[1]), Number(match[2]), Number(match[3]));
}

function formatDateKeyBR(dateKey) {
    const key = parseIsoDateKey(dateKey);
    if (!key) return '-';
    const [year, month, day] = key.split('-');
    return `${day}/${month}/${year}`;
}

function createDateRange(startKey, endKey = startKey) {
    const start = parseIsoDateKey(startKey);
    const end = parseIsoDateKey(endKey || startKey);
    if (!start || !end || end < start) return null;

    return {
        start,
        end,
        startLabel: formatDateKeyBR(start),
        endLabel: formatDateKeyBR(end)
    };
}

function getQuoteDateRangeFromText(value) {
    const matches = Array.from(String(value || '').matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g))
        .map((match) => toDateKey(Number(match[3]), Number(match[2]), Number(match[1])))
        .filter(Boolean);

    if (!matches.length) return null;
    return createDateRange(matches[0], matches[1] || matches[0]);
}

function getEventDateRange(event) {
    if (!event) return null;

    const eventType = String(event.event_type || event.eventType || 'event').trim().toLowerCase();
    if (eventType === 'rental') {
        const start = event.withdrawal_date || event.withdrawalDate || event.date;
        const end = event.return_date || event.returnDate || start;
        return createDateRange(start, end);
    }

    return createDateRange(event.date, event.end_date || event.endDate || event.date);
}

function addDaysToDateKey(dateKey, days) {
    const key = parseIsoDateKey(dateKey);
    if (!key) return '';
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + Number(days || 0));
    return [
        String(date.getFullYear()).padStart(4, '0'),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function rangesOverlap(newRange, reservationRange) {
    if (!newRange || !reservationRange) return false;
    return newRange.start <= reservationRange.end && newRange.end >= reservationRange.start;
}

function createDateConflictResponse({ equipment, currentRange, reservation }) {
    return {
        type: 'date_conflict',
        equipmentId: Number(equipment?.id || reservation?.equipmentId || 0) || null,
        equipmentName: equipment?.name || reservation?.equipmentName || 'Patrimonio',
        blockingEventName: reservation?.eventName || 'Reserva existente',
        blockingSource: reservation?.source || 'reservation',
        currentStart: currentRange?.start || '',
        currentEnd: currentRange?.end || '',
        currentStartLabel: currentRange?.startLabel || '-',
        currentEndLabel: currentRange?.endLabel || '-',
        reservationStart: reservation?.range?.start || '',
        reservationEnd: reservation?.range?.end || '',
        reservationStartLabel: reservation?.range?.startLabel || '-',
        reservationEndLabel: reservation?.range?.endLabel || '-'
    };
}

function sendDateConflict(res, conflict) {
    return res.status(409).json({
        code: 'DATE_CONFLICT',
        error: 'Patrimonio indisponivel por conflito de datas.',
        conflict
    });
}

async function findEquipmentDateConflict(equipmentId, currentRange, options = {}) {
    const normalizedEquipmentId = Number(equipmentId);
    if (!Number.isInteger(normalizedEquipmentId) || normalizedEquipmentId <= 0 || !currentRange) {
        return null;
    }

    const equipment = options.equipment || await getQuoteEquipment(normalizedEquipmentId);
    if (!equipment) return null;

    const quoteParams = [normalizedEquipmentId];
    let quoteExcludeClause = '';
    const excludeQuoteId = Number(options.excludeQuoteId);
    if (Number.isInteger(excludeQuoteId) && excludeQuoteId > 0) {
        quoteExcludeClause = 'AND quotes.id <> ?';
        quoteParams.push(excludeQuoteId);
    }

    const quoteReservations = await dbAll(
        `SELECT DISTINCT quotes.id,
                quotes.event_name AS eventName,
                quotes.event_datetime AS eventDatetime
         FROM quote_items
         INNER JOIN quotes ON quotes.id = quote_items.quote_id
         WHERE quote_items.equipment_id = ?
           ${quoteExcludeClause}
         ORDER BY quotes.created_at DESC, quotes.id DESC`,
        quoteParams
    );

    for (const reservation of quoteReservations) {
        const reservationRange = getQuoteDateRangeFromText(reservation.eventDatetime);
        if (reservationRange && rangesOverlap(currentRange, reservationRange)) {
            return createDateConflictResponse({
                equipment,
                currentRange,
                reservation: {
                    source: 'quote',
                    eventName: reservation.eventName,
                    range: reservationRange
                }
            });
        }
    }

    const excludeEventId = Number(options.excludeEventId);

    const reservedEventParams = [normalizedEquipmentId];
    let reservedEventExcludeClause = '';
    if (Number.isInteger(excludeEventId) && excludeEventId > 0) {
        reservedEventExcludeClause = 'AND events.id <> ?';
        reservedEventParams.push(excludeEventId);
    }

    const reservedEventRows = await dbAll(
        `SELECT DISTINCT events.id,
                events.name AS eventName,
                events.date,
                events.end_date,
                events.event_type,
                events.withdrawal_date,
                events.return_date
         FROM event_reserved_equipments reserved
         INNER JOIN events ON events.id = reserved.event_id
         WHERE reserved.equipment_id = ?
           ${reservedEventExcludeClause}
         ORDER BY events.date DESC, events.id DESC`,
        reservedEventParams
    );

    for (const reservation of reservedEventRows) {
        const reservationRange = getEventDateRange(reservation);
        if (reservationRange && rangesOverlap(currentRange, reservationRange)) {
            return createDateConflictResponse({
                equipment,
                currentRange,
                reservation: {
                    source: 'event_reservation',
                    eventName: reservation.eventName,
                    range: reservationRange
                }
            });
        }
    }

    const eventParams = [normalizedEquipmentId];
    let eventExcludeClause = '';
    if (Number.isInteger(excludeEventId) && excludeEventId > 0) {
        eventExcludeClause = 'AND events.id <> ?';
        eventParams.push(excludeEventId);
    }

    const eventReservations = await dbAll(
        `SELECT DISTINCT events.id,
                events.name AS eventName,
                events.date,
                events.end_date,
                events.event_type,
                events.withdrawal_date,
                events.return_date
         FROM equipment_events
         INNER JOIN events ON events.id = equipment_events.event_id
         WHERE equipment_events.equipment_id = ?
           AND equipment_events.action_type = 'saida'
           ${eventExcludeClause}
         ORDER BY events.date DESC, events.id DESC`,
        eventParams
    );

    for (const reservation of eventReservations) {
        const reservationRange = getEventDateRange(reservation);
        if (reservationRange && rangesOverlap(currentRange, reservationRange)) {
            return createDateConflictResponse({
                equipment,
                currentRange,
                reservation: {
                    source: 'event',
                    eventName: reservation.eventName,
                    range: reservationRange
                }
            });
        }
    }

    return null;
}

async function findQuoteItemsDateConflict(items, currentRange, options = {}) {
    for (const item of items) {
        const equipmentId = Number(item?.equipmentId);
        if (!Number.isInteger(equipmentId) || equipmentId <= 0) continue;

        const conflict = await findEquipmentDateConflict(equipmentId, currentRange, {
            excludeQuoteId: options.excludeQuoteId
        });
        if (conflict) return conflict;
    }

    return null;
}

async function linkQuoteEquipmentsToEvent(quoteId, eventId) {
    const items = await dbAll(
        `SELECT id, equipment_id AS equipmentId
         FROM quote_items
         WHERE quote_id = ?
           AND equipment_id IS NOT NULL`,
        [quoteId]
    );

    for (const item of items) {
        await dbRun(
            `INSERT OR IGNORE INTO event_reserved_equipments (event_id, equipment_id, quote_item_id)
             VALUES (?, ?, ?)`,
            [eventId, Number(item.equipmentId), Number(item.id)]
        );
    }
}

async function ensureAutomaticScheduledEvents() {
    const today = getTodayDateInput();
    const nextWeek = addDaysToDateKey(today, 7);

    const quotes = await dbAll(
        `SELECT quotes.id,
                quotes.event_name AS eventName,
                quotes.event_datetime AS eventDatetime,
                quotes.created_by_username AS createdByUsername
         FROM quotes
         LEFT JOIN events ON events.orcamento_id = quotes.id
         WHERE COALESCE(quotes.status, 'pending') = 'approved'
           AND events.id IS NULL
         ORDER BY quotes.approved_at ASC, quotes.id ASC`
    );

    for (const quote of quotes) {
        const range = getQuoteDateRangeFromText(quote.eventDatetime);
        if (!range || range.start > nextWeek || range.end < today) continue;

        const result = await dbRun(
            `INSERT OR IGNORE INTO events (
                name,
                date,
                end_date,
                created_by_username,
                event_type,
                orcamento_id,
                auto_created_at
            ) VALUES (?, ?, ?, ?, 'event', ?, CURRENT_TIMESTAMP)`,
            [
                quote.eventName || `Orcamento ${quote.id}`,
                range.start,
                range.end,
                quote.createdByUsername || 'sistema',
                Number(quote.id)
            ]
        );

        const event = result.lastID
            ? { id: result.lastID }
            : await dbGet('SELECT id FROM events WHERE orcamento_id = ?', [Number(quote.id)]);
        if (event?.id) {
            await linkQuoteEquipmentsToEvent(Number(quote.id), Number(event.id));
        }
    }
}

app.get('/api/orcamentos/date-conflicts', requireQuoteAccess, async (req, res) => {
    const date = cleanText(req.query.date, 20);
    const excludeId = Number(req.query.excludeId);
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
        return res.status(400).json({ error: 'Data invalida' });
    }

    try {
        const params = [];
        const excludeClause = Number.isInteger(excludeId) && excludeId > 0
            ? 'WHERE id <> ?'
            : '';
        if (excludeClause) params.push(excludeId);

        const quotes = await dbAll(
            `SELECT id,
                    client_name AS clientName,
                    event_name AS eventName,
                    event_location AS eventLocation,
                    event_datetime AS eventDatetime,
                    COALESCE(status, 'pending') AS status
             FROM quotes
             ${excludeClause}
             ORDER BY created_at DESC, id DESC`,
            params
        );
        const conflicts = quotes.filter((quote) => getQuoteDateKeysFromText(quote.eventDatetime).includes(date));

        return res.json({ conflicts });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/orcamentos/pagamentos', requireCommercialAccess, async (req, res) => {
    try {
        const payments = await getQuotePaymentEntries();
        return res.json({ payments });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/orcamentos/pagamentos/:id/pago', requireCommercialAccess, async (req, res) => {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
        return res.status(400).json({ error: 'Pagamento invalido' });
    }

    try {
        const payment = await dbGet(
            `SELECT quote_technicians.id,
                    quote_technicians.quote_id AS quoteId,
                    quote_technicians.paid_at AS paidAt,
                    COALESCE(quotes.status, 'pending') AS quoteStatus
             FROM quote_technicians
             INNER JOIN quotes ON quotes.id = quote_technicians.quote_id
             WHERE quote_technicians.id = ?`,
            [paymentId]
        );

        if (!payment) {
            return res.status(404).json({ error: 'Pagamento nao encontrado' });
        }

        if (payment.quoteStatus !== 'approved') {
            return res.status(409).json({ error: 'Somente pagamentos de orcamentos aprovados podem ser marcados como pagos.' });
        }

        await dbRun(
            `UPDATE quote_technicians
             SET paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
                 paid_by_username = COALESCE(paid_by_username, ?),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [req.currentUser?.username || req.session?.username || null, paymentId]
        );

        return res.json({ success: true, id: paymentId });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/orcamentos/pagamentos/:id/corrigir', requireCommercialAccess, async (req, res) => {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
        return res.status(400).json({ error: 'Pagamento invalido' });
    }

    try {
        const payment = await dbGet(
            `SELECT quote_technicians.id,
                    COALESCE(quotes.status, 'pending') AS quoteStatus
             FROM quote_technicians
             INNER JOIN quotes ON quotes.id = quote_technicians.quote_id
             WHERE quote_technicians.id = ?`,
            [paymentId]
        );

        if (!payment) {
            return res.status(404).json({ error: 'Pagamento nao encontrado' });
        }

        if (payment.quoteStatus !== 'approved') {
            return res.status(409).json({ error: 'Somente pagamentos de orcamentos aprovados podem ser corrigidos.' });
        }

        await dbRun(
            `UPDATE quote_technicians
             SET paid_at = NULL,
                 paid_by_username = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [paymentId]
        );

        return res.json({ success: true, id: paymentId });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/orcamentos', requireQuoteAccess, async (req, res) => {
    let items;
    let technicians;
    try {
        items = await getQuoteItemsFromBody(req.body?.items);
        technicians = await normalizeQuoteTechniciansFromBody(req.body?.technicians);
    } catch (err) {
        return res.status(err.statusCode || 400).json({ error: err.message });
    }

    const itemsSubtotal = roundMoney(items.reduce((sum, item) => sum + item.internalTotal, 0));
    const techniciansSubtotal = roundMoney(technicians.reduce((sum, technician) => sum + technician.paymentTotal, 0));
    const subtotal = roundMoney(itemsSubtotal + techniciansSubtotal);
    const finalTotalInput = req.body?.finalTotal === undefined || req.body?.finalTotal === '' ? subtotal : req.body.finalTotal;
    const finalTotal = roundMoney(parseMoneyValue(finalTotalInput));

    const quote = {
        proposalCity: cleanText(req.body?.proposalCity, 80) || 'Belo Horizonte',
        proposalDate: cleanText(req.body?.proposalDate, 20) || getTodayDateInput(),
        clientName: cleanText(req.body?.clientName, 160),
        eventName: cleanText(req.body?.eventName, 200),
        eventLocation: cleanText(req.body?.eventLocation, 220),
        eventDatetime: cleanText(req.body?.eventDatetime, 160),
        assemblyDatetime: cleanText(req.body?.assemblyDatetime, 160),
        disassemblyDatetime: cleanText(req.body?.disassemblyDatetime, 160),
        paymentMethod: cleanText(req.body?.paymentMethod, 160),
        paymentDeadline: cleanText(req.body?.paymentDeadline, 120),
        showItemPrices: parseBooleanFlag(req.body?.showItemPrices),
        notes: cleanText(req.body?.notes, 800)
    };

    if (!quote.clientName || !quote.eventName || !quote.eventLocation || !quote.eventDatetime || !quote.assemblyDatetime || !quote.disassemblyDatetime) {
        return res.status(400).json({ error: 'Preencha as informacoes gerais do orcamento.' });
    }

    if (!quote.paymentMethod || !quote.paymentDeadline) {
        return res.status(400).json({ error: 'Preencha as condicoes de pagamento.' });
    }

    if (items.length === 0) {
        return res.status(400).json({ error: 'Adicione pelo menos um item ao orcamento.' });
    }

    try {
        const eventRange = getQuoteDateRangeFromText(quote.eventDatetime);
        if (!eventRange) {
            return res.status(400).json({ error: 'Informe uma Data do Evento valida.' });
        }

        const dateConflict = await findQuoteItemsDateConflict(items, eventRange);
        if (dateConflict) {
            return sendDateConflict(res, dateConflict);
        }

        await dbRun('BEGIN TRANSACTION');
        const result = await dbRun(
            `INSERT INTO quotes (
                proposal_city,
                proposal_date,
                client_name,
                event_name,
                event_location,
                event_datetime,
                assembly_datetime,
                disassembly_datetime,
                payment_method,
                payment_deadline,
                subtotal,
                final_total,
                show_item_prices,
                notes,
                created_by_username
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                quote.proposalCity,
                quote.proposalDate,
                quote.clientName,
                quote.eventName,
                quote.eventLocation,
                quote.eventDatetime,
                quote.assemblyDatetime,
                quote.disassemblyDatetime,
                quote.paymentMethod,
                quote.paymentDeadline,
                subtotal,
                finalTotal,
                quote.showItemPrices ? 1 : 0,
                quote.notes,
                req.currentUser?.username || req.session?.username || null
            ]
        );

        const quoteId = result.lastID;
        for (const item of items) {
            await dbRun(
                `INSERT INTO quote_items (
                    quote_id,
                    equipment_id,
                    category,
                    description,
                    quantity,
                    daily_units,
                    internal_unit_price,
                    internal_total,
                    sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    quoteId,
                    item.equipmentId || null,
                    item.category,
                    item.description,
                    item.quantity,
                    item.dailyUnits,
                    item.internalUnitPrice,
                    item.internalTotal,
                    item.sortOrder
                ]
            );
        }

        await saveQuoteTechnicians(quoteId, technicians);

        await dbRun('COMMIT');
        res.json({ id: quoteId, success: true });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/orcamentos/:id/pronto', requireQuoteAccess, async (req, res) => {
    const quoteId = Number(req.params.id);
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        return res.status(400).json({ error: 'Orcamento invalido' });
    }

    try {
        const quote = await dbGet('SELECT id, COALESCE(status, "pending") AS status FROM quotes WHERE id = ?', [quoteId]);
        if (!quote) {
            return res.status(404).json({ error: 'Orcamento nao encontrado' });
        }

        await dbRun(
            `UPDATE quotes
             SET status = 'approved',
                 approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [quoteId]
        );

        await ensureAutomaticScheduledEvents();

        return res.json({ success: true, id: quoteId, status: 'approved' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.delete('/api/orcamentos/:id', requireQuoteAccess, async (req, res) => {
    const quoteId = Number(req.params.id);
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        return res.status(400).json({ error: 'Orcamento invalido' });
    }

    try {
        const quote = await dbGet('SELECT id FROM quotes WHERE id = ?', [quoteId]);
        if (!quote) {
            return res.status(404).json({ error: 'Orcamento nao encontrado' });
        }

        await dbRun('BEGIN TRANSACTION');
        const automaticEvent = await dbGet('SELECT id FROM events WHERE orcamento_id = ?', [quoteId]);
        if (automaticEvent?.id) {
            await deleteEventRecords(Number(automaticEvent.id));
        }
        await releaseScheduledQuoteEquipments(quoteId);
        await dbRun('DELETE FROM quote_technicians WHERE quote_id = ?', [quoteId]);
        await dbRun('DELETE FROM quote_items WHERE quote_id = ?', [quoteId]);
        await dbRun('DELETE FROM quotes WHERE id = ?', [quoteId]);
        await dbRun('COMMIT');

        return res.json({ success: true });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/orcamentos/:id', requireQuoteAccess, async (req, res) => {
    try {
        const quoteId = Number(req.params.id);
        if (!Number.isInteger(quoteId) || quoteId <= 0) {
            return res.status(400).json({ error: 'Orcamento invalido' });
        }

        const quote = await getQuoteWithItems(quoteId);
        if (!quote) return res.status(404).json({ error: 'Orcamento nao encontrado' });

        return res.json({ quote });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/orcamentos/:id', requireQuoteAccess, async (req, res) => {
    const quoteId = Number(req.params.id);
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        return res.status(400).json({ error: 'Orcamento invalido' });
    }

    let items;
    let technicians;
    try {
        items = await getQuoteItemsFromBody(req.body?.items);
        technicians = await normalizeQuoteTechniciansFromBody(req.body?.technicians);
    } catch (err) {
        return res.status(err.statusCode || 400).json({ error: err.message });
    }

    const itemsSubtotal = roundMoney(items.reduce((sum, item) => sum + item.internalTotal, 0));
    const techniciansSubtotal = roundMoney(technicians.reduce((sum, technician) => sum + technician.paymentTotal, 0));
    const subtotal = roundMoney(itemsSubtotal + techniciansSubtotal);
    const finalTotalInput = req.body?.finalTotal === undefined || req.body?.finalTotal === '' ? subtotal : req.body.finalTotal;
    const finalTotal = roundMoney(parseMoneyValue(finalTotalInput));
    const quote = {
        proposalCity: cleanText(req.body?.proposalCity, 80) || 'Belo Horizonte',
        proposalDate: cleanText(req.body?.proposalDate, 20) || getTodayDateInput(),
        clientName: cleanText(req.body?.clientName, 160),
        eventName: cleanText(req.body?.eventName, 200),
        eventLocation: cleanText(req.body?.eventLocation, 220),
        eventDatetime: cleanText(req.body?.eventDatetime, 160),
        assemblyDatetime: cleanText(req.body?.assemblyDatetime, 160),
        disassemblyDatetime: cleanText(req.body?.disassemblyDatetime, 160),
        paymentMethod: cleanText(req.body?.paymentMethod, 160),
        paymentDeadline: cleanText(req.body?.paymentDeadline, 120),
        showItemPrices: parseBooleanFlag(req.body?.showItemPrices),
        notes: cleanText(req.body?.notes, 800)
    };

    if (!quote.clientName || !quote.eventName || !quote.eventLocation || !quote.eventDatetime || !quote.assemblyDatetime || !quote.disassemblyDatetime) {
        return res.status(400).json({ error: 'Preencha as informacoes gerais do orcamento.' });
    }

    if (!quote.paymentMethod || !quote.paymentDeadline) {
        return res.status(400).json({ error: 'Preencha as condicoes de pagamento.' });
    }

    if (items.length === 0) {
        return res.status(400).json({ error: 'Adicione pelo menos um item ao orcamento.' });
    }

    try {
        const eventRange = getQuoteDateRangeFromText(quote.eventDatetime);
        if (!eventRange) {
            return res.status(400).json({ error: 'Informe uma Data do Evento valida.' });
        }

        const existingQuote = await dbGet('SELECT id, COALESCE(status, "pending") AS status FROM quotes WHERE id = ?', [quoteId]);
        if (!existingQuote) {
            return res.status(404).json({ error: 'Orcamento nao encontrado' });
        }
        if (existingQuote.status !== 'pending') {
            return res.status(409).json({ error: 'Somente orcamentos pendentes podem ser editados.' });
        }

        const dateConflict = await findQuoteItemsDateConflict(items, eventRange, {
            excludeQuoteId: quoteId
        });
        if (dateConflict) {
            return sendDateConflict(res, dateConflict);
        }

        const oldEquipmentRows = await dbAll(
            'SELECT DISTINCT equipment_id AS equipmentId FROM quote_items WHERE quote_id = ? AND equipment_id IS NOT NULL',
            [quoteId]
        );
        const oldEquipmentIds = oldEquipmentRows.map((row) => Number(row.equipmentId)).filter(Boolean);
        const newEquipmentIds = items.map((item) => Number(item.equipmentId)).filter(Boolean);
        const removedEquipmentIds = oldEquipmentIds.filter((equipmentId) => !newEquipmentIds.includes(equipmentId));

        await dbRun('BEGIN TRANSACTION');
        await dbRun(
            `UPDATE quotes
             SET proposal_city = ?,
                 proposal_date = ?,
                 client_name = ?,
                 event_name = ?,
                 event_location = ?,
                 event_datetime = ?,
                 assembly_datetime = ?,
                 disassembly_datetime = ?,
                 payment_method = ?,
                 payment_deadline = ?,
                 subtotal = ?,
                 final_total = ?,
                 show_item_prices = ?,
                 notes = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                quote.proposalCity,
                quote.proposalDate,
                quote.clientName,
                quote.eventName,
                quote.eventLocation,
                quote.eventDatetime,
                quote.assemblyDatetime,
                quote.disassemblyDatetime,
                quote.paymentMethod,
                quote.paymentDeadline,
                subtotal,
                finalTotal,
                quote.showItemPrices ? 1 : 0,
                quote.notes,
                quoteId
            ]
        );

        await dbRun('DELETE FROM quote_items WHERE quote_id = ?', [quoteId]);
        for (const item of items) {
            await dbRun(
                `INSERT INTO quote_items (
                    quote_id,
                    equipment_id,
                    category,
                    description,
                    quantity,
                    daily_units,
                    internal_unit_price,
                    internal_total,
                    sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    quoteId,
                    item.equipmentId || null,
                    item.category,
                    item.description,
                    item.quantity,
                    item.dailyUnits,
                    item.internalUnitPrice,
                    item.internalTotal,
                    item.sortOrder
                ]
            );
        }

        await saveQuoteTechnicians(quoteId, technicians);

        if (removedEquipmentIds.length > 0) {
            const placeholders = removedEquipmentIds.map(() => '?').join(', ');
            await dbRun(
                `UPDATE equipments
                 SET current_status = 'Disponivel'
                 WHERE current_status = 'Agendado'
                   AND id IN (${placeholders})`,
                removedEquipmentIds
            );
        }

        await dbRun('COMMIT');
        return res.json({ id: quoteId, success: true });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/orcamentos/:id/pdf', requireQuoteAccess, async (req, res) => {
    try {
        const quoteId = Number(req.params.id);
        if (!quoteId) return res.status(400).json({ error: 'Orcamento invalido' });

        const quote = await getQuoteWithItems(quoteId);
        if (!quote) return res.status(404).json({ error: 'Orcamento nao encontrado' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="orcamento-${quoteId}.pdf"`);

        const doc = new PDFDocument({
            size: QUOTE_PDF_SIZE,
            margins: { top: 0, right: 0, bottom: 0, left: 0 },
            info: {
                Title: `Orcamento ${quote.eventName || quoteId}`,
                Author: '24H Locacoes',
                Subject: 'Proposta comercial'
            }
        });
        doc.pipe(res);
        drawQuotePdf(doc, quote);
        doc.end();
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        } else {
            res.end();
        }
    }
});

app.post('/api/logout', async (req, res) => {
    const snapshotPath = req.session?.snapshotPath;
    const isTestUser = !!req.session?.isTestUser;

    try {
        await destroySession(req);

        res.clearCookie('sessao24h');

        if (isTestUser) {
            await restoreTestSnapshot(snapshotPath);
        } else if (snapshotPath) {
            await fs.promises.rm(snapshotPath, { force: true });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao finalizar sessao:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/operators', requireOperatorAccess, async (req, res) => {
    const search = cleanText(req.query.search, 120);

    try {
        const rows = await dbAll(
            `SELECT id,
                    full_name AS fullName,
                    cpf,
                    birth_date AS birthDate,
                    address,
                    email,
                    phone,
                    area,
                    has_vehicle AS hasVehicle,
                    pix,
                    agency,
                    photo,
                    cache_value AS cacheValue,
                    created_by_username AS createdByUsername,
                    created_at AS createdAt,
                    updated_at AS updatedAt
             FROM operators
             WHERE full_name LIKE ?
                OR cpf LIKE ?
                OR email LIKE ?
                OR phone LIKE ?
                OR area LIKE ?
             ORDER BY lower(full_name) ASC, id DESC`,
            [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
        );

        return res.json({ operators: rows.map(serializeOperator) });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/operators/:id', requireOperatorAccess, async (req, res) => {
    const operatorId = Number(req.params.id);
    if (!Number.isInteger(operatorId) || operatorId <= 0) {
        return res.status(400).json({ error: 'Tecnico invalido' });
    }

    try {
        const row = await dbGet(
            `SELECT id,
                    full_name AS fullName,
                    cpf,
                    birth_date AS birthDate,
                    address,
                    email,
                    phone,
                    area,
                    has_vehicle AS hasVehicle,
                    pix,
                    agency,
                    photo,
                    cache_value AS cacheValue,
                    created_by_username AS createdByUsername,
                    created_at AS createdAt,
                    updated_at AS updatedAt
             FROM operators
             WHERE id = ?`,
            [operatorId]
        );
        if (!row) return res.status(404).json({ error: 'Tecnico nao encontrado' });
        return res.json({ operator: serializeOperator(row) });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/operators', requireOperatorAccess, async (req, res) => {
    let operatorData;
    try {
        operatorData = normalizeOperatorPayload(req.body, { requirePhoto: true });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ error: err.message });
    }

    try {
        const result = await dbRun(
            `INSERT INTO operators (
                full_name, cpf, birth_date, address, email, phone, area, has_vehicle, pix, agency,
                photo, cache_value, created_by_username, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                operatorData.fullName,
                operatorData.cpf,
                operatorData.birthDate,
                operatorData.address,
                operatorData.email,
                operatorData.phone,
                operatorData.area,
                operatorData.hasVehicle ? 1 : 0,
                operatorData.pix,
                operatorData.agency,
                operatorData.photo,
                operatorData.cacheValue,
                req.currentUser?.username || req.session?.username || null
            ]
        );
        return res.json({ id: result.lastID, success: true });
    } catch (err) {
        if (String(err.message || '').toLowerCase().includes('unique')) {
            return res.status(409).json({ error: 'Ja existe um tecnico com esse CPF' });
        }
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/operators/:id', requireOperatorAccess, async (req, res) => {
    const operatorId = Number(req.params.id);
    if (!Number.isInteger(operatorId) || operatorId <= 0) {
        return res.status(400).json({ error: 'Tecnico invalido' });
    }

    let operatorData;
    try {
        operatorData = normalizeOperatorPayload(req.body, { requirePhoto: true });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ error: err.message });
    }

    try {
        const existing = await dbGet('SELECT id FROM operators WHERE id = ?', [operatorId]);
        if (!existing) return res.status(404).json({ error: 'Tecnico nao encontrado' });

        await dbRun(
            `UPDATE operators
             SET full_name = ?,
                 cpf = ?,
                 birth_date = ?,
                 address = ?,
                 email = ?,
                 phone = ?,
                 area = ?,
                 has_vehicle = ?,
                 pix = ?,
                 agency = ?,
                 photo = ?,
                 cache_value = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                operatorData.fullName,
                operatorData.cpf,
                operatorData.birthDate,
                operatorData.address,
                operatorData.email,
                operatorData.phone,
                operatorData.area,
                operatorData.hasVehicle ? 1 : 0,
                operatorData.pix,
                operatorData.agency,
                operatorData.photo,
                operatorData.cacheValue,
                operatorId
            ]
        );
        return res.json({ success: true, id: operatorId });
    } catch (err) {
        if (String(err.message || '').toLowerCase().includes('unique')) {
            return res.status(409).json({ error: 'Ja existe um tecnico com esse CPF' });
        }
        return res.status(500).json({ error: err.message });
    }
});

app.delete('/api/operators/:id', requireOperatorAccess, async (req, res) => {
    const operatorId = Number(req.params.id);
    if (!Number.isInteger(operatorId) || operatorId <= 0) {
        return res.status(400).json({ error: 'Tecnico invalido' });
    }

    try {
        const existing = await dbGet('SELECT id FROM operators WHERE id = ?', [operatorId]);
        if (!existing) return res.status(404).json({ error: 'Tecnico nao encontrado' });

        await dbRun('DELETE FROM operators WHERE id = ?', [operatorId]);
        return res.json({ success: true, id: operatorId });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/events', requireAuth, (req, res) => {
    ensureAutomaticScheduledEvents()
        .then(() => getEventsByCompletion('event', false))
        .then((rows) => res.json(rows || []))
        .catch((err) => res.status(500).json({ error: err.message }));
});

app.get('/api/history-events', requireAuth, async (req, res) => {
    try {
        await ensureAutomaticScheduledEvents();
        const [events, rentals] = await Promise.all([
            getEventsByCompletion('event', true),
            getEventsByCompletion('rental', true)
        ]);
        res.json({ events, rentals });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/scheduled-events', requireAuth, async (req, res) => {
    try {
        await ensureAutomaticScheduledEvents();

        const events = await dbAll(
            `SELECT events.id,
                    events.name,
                    events.date,
                    events.end_date AS endDate,
                    events.orcamento_id AS quoteId,
                    events.auto_created_at AS autoCreatedAt,
                    quotes.event_name AS quoteEventName,
                    quotes.client_name AS clientName
             FROM events
             INNER JOIN quotes ON quotes.id = events.orcamento_id
             WHERE events.orcamento_id IS NOT NULL
             ORDER BY events.date ASC, events.id ASC`
        );

        for (const event of events) {
            const reservedEquipments = await dbAll(
                `SELECT equipments.id,
                        equipments.name,
                        equipments.barcode,
                        COALESCE(equipments.category, 'Outros') AS category
                 FROM event_reserved_equipments reserved
                 INNER JOIN equipments ON equipments.id = reserved.equipment_id
                 WHERE reserved.event_id = ?
                 ORDER BY lower(equipments.name) ASC, equipments.barcode ASC`,
                [Number(event.id)]
            );

            const movement = await dbGet(
                `SELECT COUNT(*) AS movementCount,
                        COALESCE(SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END), 0) AS pendingQuantity
                 FROM equipment_events
                 WHERE event_id = ?`,
                [Number(event.id)]
            );
            const movementCount = Number(movement?.movementCount) || 0;
            const pendingQuantity = Number(movement?.pendingQuantity) || 0;

            event.reservedEquipments = reservedEquipments;
            event.status = movementCount === 0
                ? 'Agendado'
                : (pendingQuantity > 0 ? 'Em andamento' : 'Finalizado');
        }

        res.json({ events });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/events/:id', requireAuth, (req, res) => {
    db.get('SELECT * FROM events WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Evento nao encontrado' });
        res.json(row);
    });
});

app.get('/api/events/:id/reserved-equipments', requireAuth, async (req, res) => {
    const eventId = Number(req.params.id);
    if (!eventId) {
        return res.status(400).json({ error: 'Evento invalido' });
    }

    try {
        const rows = await dbAll(
            `SELECT equipments.id,
                    equipments.name,
                    equipments.barcode,
                    COALESCE(equipments.category, 'Outros') AS category
             FROM event_reserved_equipments reserved
             INNER JOIN equipments ON equipments.id = reserved.equipment_id
             WHERE reserved.event_id = ?
             ORDER BY lower(equipments.name) ASC, equipments.barcode ASC`,
            [eventId]
        );
        return res.json(rows || []);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/events/:id/spaces', requireAuth, async (req, res) => {
    const eventId = Number(req.params.id);

    if (!eventId) {
        return res.status(400).json({ error: 'Evento invalido' });
    }

    try {
        const event = await dbGet('SELECT id FROM events WHERE id = ?', [eventId]);
        if (!event) return res.status(404).json({ error: 'Evento nao encontrado' });

        const spaces = await dbAll(
            `SELECT id, event_id, name, created_at
             FROM event_spaces
             WHERE event_id = ?
             ORDER BY datetime(created_at) ASC, id ASC`,
            [eventId]
        );
        return res.json(spaces || []);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/events/:id/spaces', requireAuth, async (req, res) => {
    const eventId = Number(req.params.id);
    const name = String(req.body?.name || '').trim();

    if (!eventId) {
        return res.status(400).json({ error: 'Evento invalido' });
    }

    if (!name) {
        return res.status(400).json({ error: 'Nome do espaco e obrigatorio' });
    }

    if (name.length > 80) {
        return res.status(400).json({ error: 'Nome do espaco deve ter ate 80 caracteres' });
    }

    try {
        const event = await dbGet('SELECT id FROM events WHERE id = ?', [eventId]);
        if (!event) return res.status(404).json({ error: 'Evento nao encontrado' });

        const result = await dbRun(
            'INSERT INTO event_spaces (event_id, name) VALUES (?, ?)',
            [eventId, name]
        );

        return res.json({
            id: result.lastID,
            event_id: eventId,
            name
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/events/:id/history', requireAuth, (req, res) => {
    const sql = `
        SELECT
            ee.id,
            ee.equipment_id,
            ee.event_id,
            ee.space_id,
            es.name AS space_name,
            ee.action_type,
            ee.performed_by_username,
            ee.created_at,
            e.name AS equipment_name,
            e.barcode
        FROM equipment_events ee
        INNER JOIN equipments e ON e.id = ee.equipment_id
        LEFT JOIN event_spaces es ON es.id = ee.space_id
        WHERE ee.event_id = ?
          AND NOT EXISTS (
              SELECT 1
              FROM event_saida_hidden_items hidden
              WHERE hidden.event_id = ee.event_id
                AND hidden.item_type = 'equipment'
                AND hidden.item_id = ee.equipment_id
                AND COALESCE(hidden.space_id, 0) = COALESCE(ee.space_id, 0)
          )
        ORDER BY datetime(ee.created_at) ASC, ee.id ASC
    `;

    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/events/:id/cable-history', requireAuth, (req, res) => {
    const sql = `
        SELECT
            cem.cable_id,
            cem.space_id,
            es.name AS space_name,
            c.name,
            SUM(cem.quantity) AS quantity
        FROM cable_event_movements cem
        INNER JOIN cables c ON c.id = cem.cable_id
        LEFT JOIN event_spaces es ON es.id = cem.space_id
        WHERE cem.event_id = ?
          AND cem.action_type = 'saida'
          AND NOT EXISTS (
              SELECT 1
              FROM event_saida_hidden_items hidden
              WHERE hidden.event_id = cem.event_id
                AND hidden.item_type = 'cable'
                AND hidden.item_id = cem.cable_id
                AND COALESCE(hidden.space_id, 0) = COALESCE(cem.space_id, 0)
          )
        GROUP BY cem.cable_id, cem.space_id, es.name, c.name
        ORDER BY COALESCE(es.id, 0) ASC, lower(c.name) ASC, cem.cable_id ASC
    `;

    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/events/:id/cable-summary', requireAuth, (req, res) => {
    const sql = `
        SELECT
            cem.cable_id,
            cem.space_id,
            es.name AS space_name,
            c.name,
            SUM(CASE WHEN cem.action_type = 'saida' THEN cem.quantity ELSE 0 END) AS saida,
            SUM(CASE WHEN cem.action_type = 'entrada' THEN cem.quantity ELSE 0 END) AS entrada,
            SUM(CASE WHEN cem.action_type = 'saida' THEN cem.quantity ELSE -cem.quantity END) AS final
        FROM cable_event_movements cem
        INNER JOIN cables c ON c.id = cem.cable_id
        LEFT JOIN event_spaces es ON es.id = cem.space_id
        WHERE cem.event_id = ?
          AND NOT EXISTS (
              SELECT 1
              FROM event_saida_hidden_items hidden
              WHERE hidden.event_id = cem.event_id
                AND hidden.item_type = 'cable'
                AND hidden.item_id = cem.cable_id
                AND COALESCE(hidden.space_id, 0) = COALESCE(cem.space_id, 0)
          )
        GROUP BY cem.cable_id, cem.space_id, es.name, c.name
        ORDER BY COALESCE(es.id, 0) ASC, lower(c.name) ASC, cem.cable_id ASC
    `;

    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/events/:id/other-item-summary', requireAuth, (req, res) => {
    const sql = `
        SELECT
            oiem.item_id,
            oiem.space_id,
            es.name AS space_name,
            oi.name,
            SUM(CASE WHEN oiem.action_type = 'saida' THEN oiem.quantity ELSE 0 END) AS saida,
            SUM(CASE WHEN oiem.action_type = 'entrada' THEN oiem.quantity ELSE 0 END) AS entrada,
            SUM(CASE WHEN oiem.action_type = 'saida' THEN oiem.quantity ELSE -oiem.quantity END) AS final
        FROM other_item_event_movements oiem
        INNER JOIN other_items oi ON oi.id = oiem.item_id
        LEFT JOIN event_spaces es ON es.id = oiem.space_id
        WHERE oiem.event_id = ?
          AND NOT EXISTS (
              SELECT 1
              FROM event_saida_hidden_items hidden
              WHERE hidden.event_id = oiem.event_id
                AND hidden.item_type = 'other'
                AND hidden.item_id = oiem.item_id
                AND COALESCE(hidden.space_id, 0) = COALESCE(oiem.space_id, 0)
          )
        GROUP BY oiem.item_id, oiem.space_id, es.name, oi.name
        ORDER BY COALESCE(es.id, 0) ASC, lower(oi.name) ASC, oiem.item_id ASC
    `;

    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/events/:id/saida-hidden-items', requireAuth, async (req, res) => {
    const eventId = Number(req.params.id);
    const itemType = String(req.body?.itemType || '').trim();
    const itemId = Number(req.body?.itemId);
    const password = String(req.body?.password || '').trim();

    if (!(await verifyDeletePassword(password))) {
        return res.status(403).json({ message: 'Senha incorreta' });
    }

    if (!eventId || !['equipment', 'cable', 'other'].includes(itemType) || !itemId) {
        return res.status(400).json({ message: 'Dados invalidos para excluir da saida' });
    }

    try {
        const event = await dbGet('SELECT id FROM events WHERE id = ?', [eventId]);
        if (!event) return res.status(404).json({ message: 'Evento nao encontrado' });

        const spaceId = await resolveEventSpaceId(eventId, req.body?.spaceId);
        await dbRun(
            `INSERT INTO event_saida_hidden_items (event_id, item_type, item_id, space_id)
             SELECT ?, ?, ?, ?
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM event_saida_hidden_items
                 WHERE event_id = ?
                   AND item_type = ?
                   AND item_id = ?
                   AND COALESCE(space_id, 0) = COALESCE(?, 0)
             )`,
            [eventId, itemType, itemId, spaceId, eventId, itemType, itemId, spaceId]
        );

        return res.json({ success: true });
    } catch (err) {
        if (!err.statusCode || err.statusCode >= 500) {
            console.error('Erro ao ocultar item da saida:', err);
        }
        return res.status(err.statusCode || 500).json({ message: err.message });
    }
});

app.post('/api/events', requireAuth, async (req, res) => {
    const { name, date, endDate } = req.body;
    const createdByUsername = String(req.session?.username || '').trim() || null;
    const cleanName = String(name || '').trim();
    const startDate = parseIsoDateKey(date);
    const finishDate = parseIsoDateKey(endDate || date);

    if (!cleanName || !startDate || !finishDate) {
        return res.status(400).json({ error: 'Nome, data inicial e data final sao obrigatorios' });
    }

    if (finishDate < startDate) {
        return res.status(400).json({ error: 'A data final nao pode ser anterior a data inicial' });
    }

    try {
        const result = await dbRun(
            "INSERT INTO events (name, date, end_date, created_by_username, event_type) VALUES (?, ?, ?, ?, 'event')",
            [cleanName, startDate, finishDate, createdByUsername]
        );
        return res.json({ id: result.lastID });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/rental-events', requireAuth, (req, res) => {
    getEventsByCompletion('rental', false)
        .then((rows) => res.json(rows || []))
        .catch((err) => res.status(500).json({ error: err.message }));
});

app.get('/api/rental-return-alerts', requireAuth, async (req, res) => {
    try {
        const today = String(req.query.today || new Date().toISOString().slice(0, 10)).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
            return res.status(400).json({ error: 'Data invalida' });
        }

        const alerts = await getRentalReturnAlerts(today);
        res.json(alerts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/rental-events', requireAuth, (req, res) => {
    const { name, withdrawalDate, returnDate } = req.body;
    const cleanName = String(name || '').trim();
    const cleanWithdrawalDate = String(withdrawalDate || '').trim();
    const cleanReturnDate = String(returnDate || '').trim();
    const createdByUsername = String(req.session?.username || '').trim() || null;

    if (!cleanName || !cleanWithdrawalDate || !cleanReturnDate) {
        return res.status(400).json({ error: 'Nome, data de retirada e data de devolucao sao obrigatorios' });
    }

    if (cleanReturnDate < cleanWithdrawalDate) {
        return res.status(400).json({ error: 'A data de devolucao nao pode ser anterior a data de retirada' });
    }

    db.run(
        `INSERT INTO events (name, date, created_by_username, event_type, withdrawal_date, return_date)
         VALUES (?, ?, ?, 'rental', ?, ?)`,
        [cleanName, cleanWithdrawalDate, createdByUsername, cleanWithdrawalDate, cleanReturnDate],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.get('/api/rental-events/:id', requireAuth, (req, res) => {
    db.get(
        "SELECT * FROM events WHERE id = ? AND COALESCE(event_type, 'event') = 'rental'",
        [req.params.id],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'Locação nao encontrada' });
            res.json(row);
        }
    );
});

app.delete('/api/rental-events/:id', requireAuth, async (req, res) => {
    try {
        const password = String(req.body?.password || '').trim();
        if (!(await verifyDeletePassword(password))) {
            return res.status(403).json({ message: 'Senha incorreta' });
        }

        const eventId = Number(req.params.id);
        const event = await dbGet(
            "SELECT id FROM events WHERE id = ? AND COALESCE(event_type, 'event') = 'rental'",
            [eventId]
        );
        if (!event) return res.status(404).json({ error: 'Locação nao encontrada' });

        await deleteEventRecords(eventId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/events/:id', requireAuth, async (req, res) => {
    try {
        const eventId = Number(req.params.id);
        await deleteEventRecords(eventId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/equipments', requireAuth, (req, res) => {
    const search = req.query.search || '';
    db.all(
        `SELECT
            equipments.id,
            equipments.name,
            equipments.barcode,
            equipments.current_status,
            equipments.category,
            COALESCE(equipments.unit_price, 1) AS unitPrice,
            (
                SELECT events.name
                FROM equipment_events ee
                INNER JOIN events ON events.id = ee.event_id
                WHERE ee.equipment_id = equipments.id
                  AND ee.action_type = 'saida'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM equipment_events ee2
                      WHERE ee2.equipment_id = ee.equipment_id
                        AND ee2.event_id = ee.event_id
                        AND ee2.action_type = 'entrada'
                        AND (datetime(ee2.created_at) > datetime(ee.created_at)
                            OR (datetime(ee2.created_at) = datetime(ee.created_at) AND ee2.id > ee.id))
                  )
                ORDER BY datetime(ee.created_at) DESC, ee.id DESC
                LIMIT 1
            ) AS current_event_name,
            (
                SELECT m.description
                FROM maintenances m
                WHERE m.equipment_id = equipments.id
                  AND m.resolved_at IS NULL
                ORDER BY datetime(m.created_at) DESC, m.id DESC
                LIMIT 1
            ) AS maintenance_description
        FROM equipments
        WHERE name LIKE ? OR barcode LIKE ? OR category LIKE ?
        ORDER BY category ASC, name ASC`,
        [`%${search}%`, `%${search}%`, `%${search}%`],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

app.post('/api/equipments', requireAuth, (req, res) => {
    const { name, barcode, category } = req.body;

    db.run(
        'INSERT INTO equipments (name, barcode, current_status, category) VALUES (?, ?, ?, ?)',
        [name, barcode, 'Disponivel', category || 'Outros'],
        function(err) {
            if (err) {
                console.error('Erro ao cadastrar:', err.message);
                return res.status(500).json({ error: err.message });
            }

            res.json({ id: this.lastID, success: true });
        }
    );
});

app.get('/api/cables', requireAuth, (req, res) => {
    const search = String(req.query.search || '').trim();

    db.all(
        `SELECT
            cables.id,
            cables.name,
            cables.quantity,
            cables.available_quantity,
            cables.category,
            cables.created_at,
            cables.updated_at,
            (
                SELECT cm.description
                FROM cable_maintenances cm
                WHERE cm.cable_id = cables.id
                  AND cm.resolved_at IS NULL
                ORDER BY datetime(cm.created_at) DESC, cm.id DESC
                LIMIT 1
            ) AS maintenance_description
         FROM cables
         WHERE name LIKE ? OR category LIKE ?
         ORDER BY category ASC, name ASC`,
        [`%${search}%`, `%${search}%`],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

app.post('/api/cables', requireAuth, async (req, res) => {
    const name = String(req.body.name || '').trim();
    const quantity = Number(req.body.quantity);
    const category = String(req.body.category || 'Outros').trim() || 'Outros';

    if (!name) {
        return res.status(400).json({ error: 'Nome do cabo e obrigatorio' });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ error: 'Quantidade invalida' });
    }

    try {
        const existingCable = await dbGet('SELECT id FROM cables WHERE lower(name) = lower(?)', [name]);
        if (existingCable) {
            return res.status(409).json({ error: 'Ja existe um cabo com esse nome' });
        }

        const result = await dbRun(
            `INSERT INTO cables (name, quantity, available_quantity, category, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [name, quantity, quantity, category]
        );

        return res.json({ id: result.lastID, success: true });
    } catch (err) {
        console.error('Erro ao cadastrar cabo:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/cables/:id', requireAuth, async (req, res) => {
    const cableId = Number(req.params.id);
    const quantity = Number(req.body.quantity);
    const password = String(req.body.password || '').trim();

    if (!cableId) {
        return res.status(400).json({ message: 'id do cabo e obrigatorio' });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ message: 'Quantidade invalida' });
    }

    if (!canEditInitialQuantity(req, password)) {
        return res.status(403).json({ message: 'Apenas Arthur pode editar com a senha correta' });
    }

    try {
        const cable = await dbGet('SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) {
            return res.status(404).json({ message: 'Cabo nao encontrado' });
        }

        const currentQuantity = Number(cable.quantity) || 0;
        const currentAvailable = Number(cable.available_quantity) || 0;
        const newAvailableQuantity = currentAvailable + (quantity - currentQuantity);

        if (newAvailableQuantity < 0) {
            return res.status(400).json({ message: 'Quantidade inicial menor que a quantidade em uso' });
        }

        await dbRun(
            `UPDATE cables
             SET quantity = ?, available_quantity = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [quantity, newAvailableQuantity, cableId]
        );

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao atualizar cabo:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.delete('/api/cables/:id', requireAuth, async (req, res) => {
    const cableId = Number(req.params.id);
    const password = String(req.body.password || '').trim();

    if (!cableId) {
        return res.status(400).json({ message: 'id do cabo e obrigatorio' });
    }

    if (!(await verifyDeletePassword(password))) {
        return res.status(403).json({ message: 'Senha incorreta' });
    }

    try {
        const cable = await dbGet('SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) {
            return res.status(404).json({ message: 'Cabo nao encontrado' });
        }

        await createSqliteBackup(`before-delete-cable-${cableId}`);
        await dbRun('DELETE FROM cable_event_movements WHERE cable_id = ?', [cableId]);
        await dbRun('DELETE FROM cable_maintenances WHERE cable_id = ?', [cableId]);
        await dbRun('DELETE FROM cables WHERE id = ?', [cableId]);

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir cabo:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.get('/api/other-items', requireAuth, (req, res) => {
    const search = String(req.query.search || '').trim();

    db.all(
        `SELECT id,
                name,
                quantity,
                available_quantity,
                created_at,
                updated_at
         FROM other_items
         WHERE name LIKE ?
         ORDER BY name ASC`,
        [`%${search}%`],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

app.post('/api/other-items', requireAuth, async (req, res) => {
    const name = String(req.body.name || '').trim();
    const quantity = Number(req.body.quantity);

    if (!name) {
        return res.status(400).json({ error: 'Nome do item e obrigatorio' });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ error: 'Quantidade invalida' });
    }

    try {
        const existingItem = await dbGet('SELECT id FROM other_items WHERE lower(name) = lower(?)', [name]);
        if (existingItem) {
            return res.status(409).json({ error: 'Ja existe um item com esse nome' });
        }

        const result = await dbRun(
            `INSERT INTO other_items (name, quantity, available_quantity, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [name, quantity, quantity]
        );

        return res.json({ id: result.lastID, success: true });
    } catch (err) {
        console.error('Erro ao cadastrar item sem patrimonio:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/other-items/:id', requireAuth, async (req, res) => {
    const itemId = Number(req.params.id);
    const quantity = Number(req.body.quantity);
    const password = String(req.body.password || '').trim();

    if (!itemId) {
        return res.status(400).json({ message: 'id do item e obrigatorio' });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ message: 'Quantidade invalida' });
    }

    if (!canEditInitialQuantity(req, password)) {
        return res.status(403).json({ message: 'Apenas Arthur pode editar com a senha correta' });
    }

    try {
        const item = await dbGet('SELECT * FROM other_items WHERE id = ?', [itemId]);
        if (!item) {
            return res.status(404).json({ message: 'Item nao encontrado' });
        }

        const currentQuantity = Number(item.quantity) || 0;
        const currentAvailable = Number(item.available_quantity) || 0;
        const newAvailableQuantity = currentAvailable + (quantity - currentQuantity);

        if (newAvailableQuantity < 0) {
            return res.status(400).json({ message: 'Quantidade inicial menor que a quantidade em uso' });
        }

        await dbRun(
            `UPDATE other_items
             SET quantity = ?, available_quantity = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [quantity, newAvailableQuantity, itemId]
        );

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao atualizar item sem patrimonio:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.delete('/api/other-items/:id', requireAuth, async (req, res) => {
    const itemId = Number(req.params.id);
    const password = String(req.body.password || '').trim();

    if (!itemId) {
        return res.status(400).json({ message: 'id do item e obrigatorio' });
    }

    if (!(await verifyDeletePassword(password))) {
        return res.status(403).json({ message: 'Senha incorreta' });
    }

    try {
        const item = await dbGet('SELECT * FROM other_items WHERE id = ?', [itemId]);
        if (!item) {
            return res.status(404).json({ message: 'Item nao encontrado' });
        }

        await createSqliteBackup(`before-delete-other-item-${itemId}`);
        await dbRun('DELETE FROM other_item_event_movements WHERE item_id = ?', [itemId]);
        await dbRun('DELETE FROM other_items WHERE id = ?', [itemId]);

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir item sem patrimonio:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.delete('/api/equipments/:id', requireAuth, async (req, res) => {
    const equipmentId = Number(req.params.id);
    const password = String(req.body.password || '').trim();

    if (!equipmentId) {
        return res.status(400).json({ message: 'id do equipamento e obrigatorio' });
    }

    if (!(await verifyDeletePassword(password))) {
        return res.status(403).json({ message: 'Senha incorreta' });
    }

    try {
        const equipment = await dbGet('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) {
            return res.status(404).json({ message: 'Equipamento nao encontrado' });
        }

        await createSqliteBackup(`before-delete-equipment-${equipmentId}`);
        await dbRun('DELETE FROM equipment_events WHERE equipment_id = ?', [equipmentId]);
        await dbRun('DELETE FROM event_reserved_equipments WHERE equipment_id = ?', [equipmentId]);
        await dbRun('DELETE FROM maintenances WHERE equipment_id = ?', [equipmentId]);
        await dbRun('DELETE FROM equipments WHERE id = ?', [equipmentId]);

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir equipamento:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.patch('/api/equipments/:id/status', requireAuth, async (req, res) => {
    const equipmentId = Number(req.params.id);
    const status = String(req.body.status || '').trim();

    if (!equipmentId || !status) {
        return res.status(400).json({ message: 'id e status sao obrigatorios' });
    }

    try {
        const equipment = await dbGet('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return res.status(404).json({ message: 'Equipamento nao encontrado' });

        await dbRun('UPDATE equipments SET current_status = ? WHERE id = ?', [status, equipmentId]);
        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao atualizar status:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.post('/api/equipment-events/:type', requireAuth, async (req, res) => {
    const { type } = req.params;
    const equipmentId = Number(req.body.equipmentId);
    const barcode = String(req.body.barcode || '').trim();
    const eventId = Number(req.body.eventId);
    const performedByUsername = String(req.session?.username || '').trim() || null;

    if (!['saida', 'entrada'].includes(type)) {
        return res.status(400).json({ message: 'Tipo de movimentacao invalido' });
    }

    if ((!equipmentId && !barcode) || !eventId) {
        return res.status(400).json({ message: 'equipmentId ou codigo de barras e eventId sao obrigatorios' });
    }

    try {
        const equipment = equipmentId
            ? await dbGet('SELECT * FROM equipments WHERE id = ?', [equipmentId])
            : await dbGet('SELECT * FROM equipments WHERE barcode = ?', [barcode]);
        const event = await dbGet('SELECT * FROM events WHERE id = ?', [eventId]);
        const resolvedEquipmentId = Number(equipment?.id);

        if (!equipment) return res.status(404).json({ message: 'Equipamento nao encontrado' });
        if (!event) return res.status(404).json({ message: 'Evento nao encontrado' });
        const spaceId = await resolveEventSpaceId(eventId, req.body.spaceId);

        if (type === 'saida') {
            if (isMaintenanceStatus(equipment.current_status)) {
                return res.status(409).json({ message: 'Equipamento em manutencao' });
            }

            const sameEventMovement = await dbGet(
                `SELECT action_type
                 FROM equipment_events
                 WHERE equipment_id = ? AND event_id = ?
                   AND ${spacePredicate('space_id')}
                 ORDER BY datetime(created_at) DESC, id DESC
                 LIMIT 1`,
                [resolvedEquipmentId, eventId, spaceId]
            );
            if (sameEventMovement?.action_type === 'saida') {
                return res.status(409).json({ message: 'Este equipamento ja possui saida pendente neste evento' });
            }

            const eventRange = getEventDateRange(event);
            if (!eventRange) {
                return res.status(400).json({ message: 'Evento sem periodo valido' });
            }

            const dateConflict = await findEquipmentDateConflict(resolvedEquipmentId, eventRange, {
                equipment: {
                    id: equipment.id,
                    name: equipment.name,
                    barcode: equipment.barcode,
                    currentStatus: equipment.current_status,
                    category: equipment.category,
                    unitPrice: equipment.unitPrice
                },
                excludeQuoteId: Number(event.orcamento_id) || null,
                excludeEventId: eventId
            });
            if (dateConflict) {
                return sendDateConflict(res, dateConflict);
            }

            await dbRun(
                "INSERT INTO equipment_events (equipment_id, event_id, space_id, action_type, performed_by_username) VALUES (?, ?, ?, 'saida', ?)",
                [resolvedEquipmentId, eventId, spaceId, performedByUsername]
            );
            await dbRun(
                `INSERT OR IGNORE INTO event_reserved_equipments (event_id, equipment_id)
                 VALUES (?, ?)`,
                [eventId, resolvedEquipmentId]
            );
            await dbRun("UPDATE equipments SET current_status = 'Indisponivel' WHERE id = ?", [resolvedEquipmentId]);

            return res.json({ success: true, equipment });
        }

        const lastMovement = await dbGet(
            `SELECT action_type
             FROM equipment_events
             WHERE equipment_id = ? AND event_id = ?
               AND ${spacePredicate('space_id')}
             ORDER BY datetime(created_at) DESC, id DESC
             LIMIT 1`,
            [resolvedEquipmentId, eventId, spaceId]
        );

        if (!lastMovement || lastMovement.action_type !== 'saida') {
            return res.status(409).json({ message: 'Este equipamento nao possui saida pendente neste evento' });
        }

        await dbRun(
            "INSERT INTO equipment_events (equipment_id, event_id, space_id, action_type, performed_by_username) VALUES (?, ?, ?, 'entrada', ?)",
            [resolvedEquipmentId, eventId, spaceId, performedByUsername]
        );
        await dbRun("UPDATE equipments SET current_status = 'Disponivel' WHERE id = ?", [resolvedEquipmentId]);

        return res.json({ success: true, equipment });
    } catch (err) {
        if (!err.statusCode || err.statusCode >= 500) {
            console.error('Erro ao registrar movimentacao:', err);
        }
        return res.status(err.statusCode || 500).json({ message: err.message });
    }
});

app.post('/api/cable-events/:type', requireAuth, async (req, res) => {
    const { type } = req.params;
    const cableId = Number(req.body.cableId);
    const eventId = Number(req.body.eventId);
    const quantity = Number(req.body.quantity);

    if (!['saida', 'entrada'].includes(type)) {
        return res.status(400).json({ message: 'Tipo de movimentacao invalido' });
    }

    if (!cableId || !eventId || !Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: 'cableId, eventId e quantity sao obrigatorios' });
    }

    try {
        const cable = await dbGet('SELECT * FROM cables WHERE id = ?', [cableId]);
        const event = await dbGet('SELECT * FROM events WHERE id = ?', [eventId]);

        if (!cable) return res.status(404).json({ message: 'Cabo nao encontrado' });
        if (!event) return res.status(404).json({ message: 'Evento nao encontrado' });
        const spaceId = await resolveEventSpaceId(eventId, req.body.spaceId);

        if (type === 'saida') {
            if (Number(cable.available_quantity) < quantity) {
                return res.status(409).json({ message: 'Quantidade insuficiente em estoque' });
            }

            await dbRun(
                "INSERT INTO cable_event_movements (cable_id, event_id, space_id, action_type, quantity) VALUES (?, ?, ?, 'saida', ?)",
                [cableId, eventId, spaceId, quantity]
            );
            await dbRun(
                'UPDATE cables SET available_quantity = available_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [quantity, cableId]
            );

            return res.json({ success: true });
        }

        const pendingMovement = await dbGet(
            `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0) AS quantity
             FROM cable_event_movements
             WHERE cable_id = ? AND event_id = ?
               AND ${spacePredicate('space_id')}`,
            [cableId, eventId, spaceId]
        );

        if (!pendingMovement || Number(pendingMovement.quantity) < quantity) {
            return res.status(409).json({ message: 'Este cabo nao possui saida pendente suficiente neste evento' });
        }

        await dbRun(
            "INSERT INTO cable_event_movements (cable_id, event_id, space_id, action_type, quantity) VALUES (?, ?, ?, 'entrada', ?)",
            [cableId, eventId, spaceId, quantity]
        );
        await dbRun(
            'UPDATE cables SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [quantity, cableId]
        );

        return res.json({ success: true });
    } catch (err) {
        if (!err.statusCode || err.statusCode >= 500) {
            console.error('Erro ao registrar movimentacao de cabo:', err);
        }
        return res.status(err.statusCode || 500).json({ message: err.message });
    }
});

app.post('/api/other-item-events/:type', requireAuth, async (req, res) => {
    const { type } = req.params;
    const itemId = Number(req.body.itemId);
    const eventId = Number(req.body.eventId);
    const quantity = Number(req.body.quantity);

    if (!['saida', 'entrada'].includes(type)) {
        return res.status(400).json({ message: 'Tipo de movimentacao invalido' });
    }

    if (!itemId || !eventId || !Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: 'itemId, eventId e quantity sao obrigatorios' });
    }

    try {
        const item = await dbGet('SELECT * FROM other_items WHERE id = ?', [itemId]);
        const event = await dbGet('SELECT * FROM events WHERE id = ?', [eventId]);

        if (!item) return res.status(404).json({ message: 'Item nao encontrado' });
        if (!event) return res.status(404).json({ message: 'Evento nao encontrado' });
        const spaceId = await resolveEventSpaceId(eventId, req.body.spaceId);

        if (type === 'saida') {
            if (Number(item.available_quantity) < quantity) {
                return res.status(409).json({ message: 'Quantidade insuficiente em estoque' });
            }

            await dbRun(
                "INSERT INTO other_item_event_movements (item_id, event_id, space_id, action_type, quantity) VALUES (?, ?, ?, 'saida', ?)",
                [itemId, eventId, spaceId, quantity]
            );
            await dbRun(
                'UPDATE other_items SET available_quantity = available_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [quantity, itemId]
            );

            return res.json({ success: true });
        }

        const pendingMovement = await dbGet(
            `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0) AS quantity
             FROM other_item_event_movements
             WHERE item_id = ? AND event_id = ?
               AND ${spacePredicate('space_id')}`,
            [itemId, eventId, spaceId]
        );

        if (!pendingMovement || Number(pendingMovement.quantity) < quantity) {
            return res.status(409).json({ message: 'Este item nao possui saida pendente suficiente neste evento' });
        }

        await dbRun(
            "INSERT INTO other_item_event_movements (item_id, event_id, space_id, action_type, quantity) VALUES (?, ?, ?, 'entrada', ?)",
            [itemId, eventId, spaceId, quantity]
        );
        await dbRun(
            'UPDATE other_items SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [quantity, itemId]
        );

        return res.json({ success: true });
    } catch (err) {
        if (!err.statusCode || err.statusCode >= 500) {
            console.error('Erro ao registrar movimentacao de item sem patrimonio:', err);
        }
        return res.status(err.statusCode || 500).json({ message: err.message });
    }
});

app.post('/api/maintenances', requireAuth, async (req, res) => {
    const equipmentId = Number(req.body.equipmentId);
    const description = String(req.body.description || '').trim();

    if (!equipmentId || !description) {
        return res.status(400).json({ message: 'equipmentId e description sao obrigatorios' });
    }

    try {
        const equipment = await dbGet('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return res.status(404).json({ message: 'Equipamento nao encontrado' });

        await dbRun(
            'INSERT INTO maintenances (equipment_id, description) VALUES (?, ?)',
            [equipmentId, description]
        );
        await dbRun("UPDATE equipments SET current_status = 'Em manutencao' WHERE id = ?", [equipmentId]);

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao registrar manutencao:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.post('/api/cable-maintenances', requireAuth, async (req, res) => {
    const cableId = Number(req.body.cableId);
    const description = String(req.body.description || '').trim();

    if (!cableId || !description) {
        return res.status(400).json({ message: 'cableId e description sao obrigatorios' });
    }

    try {
        const cable = await dbGet('SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) return res.status(404).json({ message: 'Cabo nao encontrado' });

        await dbRun(
            'INSERT INTO cable_maintenances (cable_id, description) VALUES (?, ?)',
            [cableId, description]
        );

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao registrar manutencao do cabo:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.patch('/api/maintenances/:equipmentId/ready', requireAuth, async (req, res) => {
    const equipmentId = Number(req.params.equipmentId);

    if (!equipmentId) {
        return res.status(400).json({ message: 'equipmentId e obrigatorio' });
    }

    try {
        const equipment = await dbGet('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return res.status(404).json({ message: 'Equipamento nao encontrado' });

        await dbRun(
            `UPDATE maintenances
             SET resolved_at = CURRENT_TIMESTAMP
             WHERE equipment_id = ?
               AND resolved_at IS NULL`,
            [equipmentId]
        );
        await dbRun("UPDATE equipments SET current_status = 'Disponivel' WHERE id = ?", [equipmentId]);

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao finalizar manutencao:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.patch('/api/cable-maintenances/:cableId/ready', requireAuth, async (req, res) => {
    const cableId = Number(req.params.cableId);

    if (!cableId) {
        return res.status(400).json({ message: 'cableId e obrigatorio' });
    }

    try {
        const cable = await dbGet('SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) return res.status(404).json({ message: 'Cabo nao encontrado' });

        await dbRun(
            `UPDATE cable_maintenances
             SET resolved_at = CURRENT_TIMESTAMP
             WHERE cable_id = ?
               AND resolved_at IS NULL`,
            [cableId]
        );

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao finalizar manutencao do cabo:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.get('/dashboard.html', (req, res) => {
    if (req.session && req.session.userId) {
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
        return;
    }

    res.redirect('/');
});

function startServer() {
    return new Promise((resolve, reject) => {
        let databaseReady = false;
        const server = http.createServer((req, res) => {
            if (!databaseReady) {
                res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Servidor iniciando. Tente novamente em instantes.' }));
                return;
            }

            app(req, res);
        });

        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Servidor ja esta aberto em http://localhost:${PORT}`);
                resolve(null);
                return;
            }

            reject(err);
        });

        server.listen(PORT, '0.0.0.0', async () => {
            try {
                await bootstrapDatabase();
                databaseReady = true;
                console.log(`Servidor: http://localhost:${PORT}`);
                resolve(server);
            } catch (err) {
                server.close(() => reject(err));
            }
        });
    });
}

if (require.main === module) {
    startServer().catch(async (err) => {
        console.error('Erro ao iniciar o servidor:', err.message);
        try {
            await closeDatabase();
        } catch (closeErr) {
            console.error('Erro ao fechar o banco:', closeErr.message);
        }
        process.exitCode = 1;
    });
}

module.exports = {
    drawQuotePdf,
    QUOTE_PDF_SIZE,
    startServer
};
