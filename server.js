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
const quoteServiceCatalog = require('./src/quote-services.json');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HTML_DIR = path.join(__dirname, 'html');
const CSS_DIR = path.join(__dirname, 'css');
const JAVASCRIPT_DIR = path.join(__dirname, 'javascript');
const PHOTOS_DIR = path.join(__dirname, 'fotos');
const DATABASE_PATH = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(__dirname, 'banco de dados', 'database.db');
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
    sonorizacao: 'Sonorização',
    transmissao: 'Transmissão',
    iluminacao: 'Iluminação',
    internet: 'Internet',
    outros: 'Outros'
};
const QUOTE_SERVICE_CATEGORY = 'SERVIÇOS';
const QUOTE_SERVICE_BY_ID = new Map(quoteServiceCatalog.map((service) => [service.id, service]));

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

app.use('/css', express.static(CSS_DIR));
app.use('/javascript', express.static(JAVASCRIPT_DIR));
app.use('/fotos', express.static(PHOTOS_DIR));
app.use(express.static(HTML_DIR));

const LEGACY_STATIC_ALIASES = {
    '/dashboard.css': path.join(CSS_DIR, 'dashboard.css'),
    '/event.css': path.join(CSS_DIR, 'event.css'),
    '/login.css': path.join(CSS_DIR, 'login.css'),
    '/style.css': path.join(CSS_DIR, 'style.css'),
    '/dashboard.js': path.join(JAVASCRIPT_DIR, 'dashboard.js'),
    '/event.js': path.join(JAVASCRIPT_DIR, 'event.js'),
    '/login.js': path.join(JAVASCRIPT_DIR, 'login.js'),
    '/script.js': path.join(JAVASCRIPT_DIR, 'script.js'),
    '/logo.PNG': path.join(PHOTOS_DIR, 'logo.PNG'),
    '/quote-header.png': path.join(PHOTOS_DIR, 'quote-header.png'),
    '/quote-signature.png': path.join(PHOTOS_DIR, 'quote-signature.png')
};

Object.entries(LEGACY_STATIC_ALIASES).forEach(([route, filePath]) => {
    app.get(route, (req, res, next) => {
        if (!fs.existsSync(filePath)) {
            next();
            return;
        }

        res.sendFile(filePath);
    });
});

let db = null;

if (!process.env.SESSION_SECRET && IS_PRODUCTION) {
    console.warn('SESSION_SECRET não definido. Um segredo temporário foi gerado para esta execução.');
} else if (!process.env.SESSION_SECRET) {
    console.warn('SESSION_SECRET não definido. Usando segredo local fixo para desenvolvimento.');
}

if (!DELETE_PASSWORD_HASH) {
    console.warn('DELETE_PASSWORD_HASH não definido. Exclusões protegidas por senha ficarão indisponíveis.');
}

function connectDatabase() {
    return new Promise((resolve, reject) => {
        const connection = new sqlite3.Database(DATABASE_PATH, (err) => {
            if (err) {
                reject(err);
                return;
            }

            // Evita falhas intermitentes por contenção e privilegia durabilidade
            // quando o servidor SQLite local/legado for utilizado.
            connection.configure('busyTimeout', 10_000);
            connection.exec(
                `PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = FULL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 10000;
                 PRAGMA wal_autocheckpoint = 1000;`,
                (pragmaError) => {
                    if (pragmaError) {
                        connection.close(() => reject(pragmaError));
                        return;
                    }

                    db = connection;
                    resolve(connection);
                }
            );
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

function normalizeEquipmentBarcode(value) {
    const barcode = String(value || '').trim();
    return /^\d{1,4}$/.test(barcode) ? barcode.padStart(4, '0') : barcode;
}

function escapeSqlLikePattern(value) {
    return String(value || '').replace(/[\\%_]/g, '\\$&');
}

function duplicateEquipmentMessage(equipment) {
    const equipmentName = equipment?.name ? ` (${equipment.name})` : '';
    return `Ja existe um equipamento cadastrado com esse patrimonio/codigo de barras${equipmentName}.`;
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
                serial_number TEXT,
                observation TEXT,
                unit_price REAL NOT NULL DEFAULT 1
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS equipment_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

            db.run(`CREATE TABLE IF NOT EXISTS availability_warning_audits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                equipment_id INTEGER NOT NULL,
                event_id INTEGER NOT NULL,
                space_id INTEGER,
                movement_request_id TEXT,
                confirmed_by_username TEXT,
                warning_code TEXT NOT NULL DEFAULT 'FUTURE_AVAILABILITY_WARNING',
                warning_details TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
                category TEXT NOT NULL DEFAULT 'Outros',
                unit_price REAL NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS cable_maintenances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cable_id INTEGER NOT NULL,
                description TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
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
                mother_name TEXT NOT NULL DEFAULT '',
                cpf TEXT NOT NULL UNIQUE,
                rg TEXT NOT NULL DEFAULT '',
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
                logistics_price REAL NOT NULL DEFAULT 0,
                technicians_price REAL NOT NULL DEFAULT 0,
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
                is_manual INTEGER NOT NULL DEFAULT 0,
                is_service INTEGER NOT NULL DEFAULT 0,
                service_id TEXT,
                service_width REAL,
                service_height REAL,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                daily_units INTEGER NOT NULL DEFAULT 1,
                internal_unit_price REAL NOT NULL DEFAULT 0,
                internal_total REAL NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS quote_service_prices (
                service_id TEXT PRIMARY KEY,
                unit_price REAL NOT NULL DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS quote_manual_item_movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                quote_item_id INTEGER NOT NULL,
                event_id INTEGER NOT NULL,
                space_id INTEGER,
                action_type TEXT NOT NULL CHECK(action_type IN ('saida', 'entrada')),
                quantity INTEGER NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

            db.run(`CREATE TABLE IF NOT EXISTS quote_operational_destinations (
                quote_id INTEGER PRIMARY KEY,
                destination_type TEXT NOT NULL CHECK(destination_type IN ('event', 'rental')),
                selected_by_username TEXT,
                selected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run("ALTER TABLE equipments ADD COLUMN current_status TEXT DEFAULT 'Disponivel'", () => {});
            db.run("ALTER TABLE equipments ADD COLUMN category TEXT DEFAULT 'Outros'", () => {});
            db.run("ALTER TABLE equipments ADD COLUMN serial_number TEXT", () => {});
            db.run("ALTER TABLE equipments ADD COLUMN observation TEXT", () => {});
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
            db.run("ALTER TABLE cable_maintenances ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1", () => {});
            db.run("ALTER TABLE other_items ADD COLUMN category TEXT NOT NULL DEFAULT 'Outros'", () => {});
            db.run("ALTER TABLE other_items ADD COLUMN unit_price REAL NOT NULL DEFAULT 1", () => {});
            db.run("ALTER TABLE cable_event_movements ADD COLUMN space_id INTEGER", () => {});
            db.run("ALTER TABLE other_item_event_movements ADD COLUMN space_id INTEGER", () => {});
            db.run("ALTER TABLE event_saida_hidden_items ADD COLUMN space_id INTEGER", () => {});
            db.run("ALTER TABLE quotes ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'", () => {});
            db.run("ALTER TABLE quotes ADD COLUMN approved_at TEXT", () => {});
            db.run("ALTER TABLE quotes ADD COLUMN show_item_prices INTEGER NOT NULL DEFAULT 0", () => {});
            db.run("ALTER TABLE quotes ADD COLUMN logistics_price REAL NOT NULL DEFAULT 0", () => {});
            db.run("ALTER TABLE quotes ADD COLUMN technicians_price REAL NOT NULL DEFAULT 0", () => {});
            db.run("ALTER TABLE quote_items ADD COLUMN equipment_id INTEGER", () => {});
            db.run("ALTER TABLE quote_items ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0", () => {});
            db.run("ALTER TABLE quote_items ADD COLUMN is_service INTEGER NOT NULL DEFAULT 0", () => {});
            db.run("ALTER TABLE quote_items ADD COLUMN service_id TEXT", () => {});
            db.run("ALTER TABLE quote_items ADD COLUMN service_width REAL", () => {});
            db.run("ALTER TABLE quote_items ADD COLUMN service_height REAL", () => {});
            db.run("ALTER TABLE quote_technicians ADD COLUMN paid_at TEXT", () => {});
            db.run("ALTER TABLE quote_technicians ADD COLUMN paid_by_username TEXT", () => {});
            db.run("ALTER TABLE quote_technicians ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP", () => {});
            db.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'", () => {});
            db.run("ALTER TABLE operators ADD COLUMN area TEXT NOT NULL DEFAULT ''", () => {});
            db.run("ALTER TABLE operators ADD COLUMN has_vehicle INTEGER NOT NULL DEFAULT 0", () => {});
            db.run("ALTER TABLE operators ADD COLUMN mother_name TEXT NOT NULL DEFAULT ''", () => {});
            db.run("ALTER TABLE operators ADD COLUMN rg TEXT NOT NULL DEFAULT ''", () => {});
            db.run("ALTER TABLE operators ADD COLUMN created_by_username TEXT", () => {});
            db.run("ALTER TABLE operators ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP", () => {});
            db.run("ALTER TABLE operators ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP", () => {});
            db.run("UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''", () => {});
            db.run("UPDATE quotes SET status = 'pending' WHERE status IS NULL OR status = ''", () => {});
            db.run("UPDATE cables SET available_quantity = quantity WHERE available_quantity IS NULL OR available_quantity = 0", () => {});
            db.run("UPDATE equipments SET unit_price = 1 WHERE unit_price IS NULL", () => {});
            db.run("UPDATE cables SET unit_price = 1 WHERE unit_price IS NULL", () => {});
            db.run("UPDATE other_items SET category = 'Outros' WHERE category IS NULL OR TRIM(category) = ''", () => {});
            db.run("UPDATE other_items SET unit_price = 1 WHERE unit_price IS NULL", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_event_spaces_event ON event_spaces(event_id)", () => {});
            db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_events_orcamento_id ON events(orcamento_id) WHERE orcamento_id IS NOT NULL", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_equipment_events_event_space_equipment ON equipment_events(event_id, space_id, equipment_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_event_reserved_equipments_event ON event_reserved_equipments(event_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_event_reserved_equipments_equipment ON event_reserved_equipments(equipment_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_availability_warning_audits_event_created ON availability_warning_audits(event_id, created_at DESC)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_availability_warning_audits_equipment_created ON availability_warning_audits(equipment_id, created_at DESC)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_other_items_name ON other_items(name)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_event_saida_hidden_items_event_item ON event_saida_hidden_items(event_id, item_type, item_id, space_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id, sort_order)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quote_items_service ON quote_items(service_id, quote_id) WHERE is_service = 1", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quote_operational_destinations_type ON quote_operational_destinations(destination_type, quote_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quote_manual_item_movements_event_item ON quote_manual_item_movements(event_id, quote_item_id, space_id, created_at)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quote_technicians_quote ON quote_technicians(quote_id, sort_order)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quote_technicians_operator ON quote_technicians(operator_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_quote_hidden_equipments_equipment ON quote_hidden_equipments(equipment_id)", () => {});
            db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_categories_name ON equipment_categories(name)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_operators_name ON operators(full_name)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_operators_cpf ON operators(cpf)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_equipment_events_equipment_event_action_datetime_id ON equipment_events(equipment_id, event_id, action_type, datetime(created_at), id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_equipment_events_equipment_action_datetime_id_event ON equipment_events(equipment_id, action_type, datetime(created_at) DESC, id DESC, event_id)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_equipment_events_equipment_event_space_datetime_id ON equipment_events(equipment_id, event_id, COALESCE(space_id, 0), datetime(created_at) DESC, id DESC)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_maintenances_equipment_resolved_datetime_id ON maintenances(equipment_id, resolved_at, datetime(created_at) DESC, id DESC)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_cable_maintenances_cable_resolved_datetime_id ON cable_maintenances(cable_id, resolved_at, datetime(created_at) DESC, id DESC)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_cable_event_movements_event_cable_space ON cable_event_movements(event_id, cable_id, COALESCE(space_id, 0))", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_other_item_movements_event_item_space ON other_item_event_movements(event_id, item_id, COALESCE(space_id, 0))", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_equipments_category_name ON equipments(category, name)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_equipments_name ON equipments(name)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_cables_category_name ON cables(category, name)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_other_items_category_name ON other_items(category, name)", () => {});
            db.run("DROP INDEX IF EXISTS idx_equipment_events_equipment_event", () => {});
            db.run("DROP INDEX IF EXISTS idx_maintenances_equipment_resolved", () => {});
            db.run("DROP INDEX IF EXISTS idx_cable_maintenances_cable_resolved", () => {});
            db.run("DROP INDEX IF EXISTS idx_cable_event_movements_event_cable", () => {});
            db.run("DROP INDEX IF EXISTS idx_cable_event_movements_event_space_cable", () => {});
            db.run("DROP INDEX IF EXISTS idx_other_item_event_movements_event_item", () => {});
            db.run("DROP INDEX IF EXISTS idx_other_item_event_movements_event_space_item", () => {});
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
    await backupSqliteDatabase(snapshotPath);
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
    await backupSqliteDatabase(backupPath);
    return backupPath;
}

function backupSqliteDatabase(destinationPath) {
    const operation = new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Banco SQLite não está conectado para realizar o backup'));
            return;
        }

        let backup;
        backup = db.backup(destinationPath, (initializeError) => {
            if (initializeError) {
                reject(initializeError);
                return;
            }

            backup.step(-1, (stepError, completed) => {
                backup.finish(() => {
                    if (stepError) reject(stepError);
                    else if (!completed) reject(new Error('O backup SQLite não foi concluído'));
                    else resolve(destinationPath);
                });
            });
        });
    });

    return operation.catch(async (error) => {
        await fs.promises.rm(destinationPath, { force: true });
        throw error;
    });
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
        const error = new Error('Espaço inválido');
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
        const error = new Error('Espaço não encontrado neste evento');
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
    const quoteFilter = completed ? '' : 'AND e.orcamento_id IS NULL';
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
                 UNION ALL SELECT event_id FROM quote_manual_item_movements
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

                 UNION ALL

                 SELECT event_id,
                        SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS pending_quantity
                 FROM quote_manual_item_movements
                 GROUP BY event_id, quote_item_id, COALESCE(space_id, 0)
                 HAVING SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) > 0
             ) pending_rows
             GROUP BY event_id
         ) pending ON pending.event_id = e.id
         WHERE COALESCE(e.event_type, 'event') = ?
           ${quoteFilter}
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
    await dbRun('DELETE FROM quote_manual_item_movements WHERE event_id = ?', [eventId]);
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
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const user = await dbGet('SELECT id, username, COALESCE(role, "user") AS role FROM users WHERE id = ?', [req.session.userId]);
        if (!user) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        user.role = normalizeUserRole(user.role);
        req.session.username = user.username;
        req.session.role = user.role;
        req.currentUser = user;

        if (user.role === 'comercial') {
            return res.status(403).json({ error: 'Acesso restrito à tela de orçamentos' });
        }

        return next();
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

async function requireAdmin(req, res, next) {
    try {
        if (!req.session?.userId) {
            return res.status(401).json({ error: 'Não autorizado' });
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
                return res.status(401).json({ error: 'Não autorizado' });
            }

            const user = await dbGet('SELECT id, username, COALESCE(role, "user") AS role FROM users WHERE id = ?', [req.session.userId]);
            if (!user) {
                return res.status(401).json({ error: 'Não autorizado' });
            }

            user.role = normalizeUserRole(user.role);
            req.session.username = user.username;
            req.session.role = user.role;
            req.currentUser = user;

            if (!allowed.has(user.role)) {
                return res.status(403).json({ error: 'Acesso não permitido para este usuário' });
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
const requireCommercialAccess = requireRole('admin', 'comercial');
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
        categoryExpression: "COALESCE(category, 'Outros')"
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

function isInactiveEquipmentStatus(status) {
    const normalized = normalizeQuoteStatusText(status);
    return normalized.includes('inativ') || normalized.includes('baix');
}

function isPhysicallyUnavailableEquipmentStatus(status) {
    const normalized = normalizeQuoteStatusText(status);
    return isMaintenanceStatus(status)
        || isInactiveEquipmentStatus(status)
        || normalized.includes('indispon');
}

function calculateRequirementAvailability(requestedQuantity, separatedQuantity, warehouseAvailableQuantity) {
    const requested = Math.max(0, Number(requestedQuantity) || 0);
    const separated = Math.max(0, Number(separatedQuantity) || 0);
    const warehouseAvailable = Math.max(0, Number(warehouseAvailableQuantity) || 0);
    const pendingQuantity = Math.max(0, requested - separated);
    return {
        requestedQuantity: requested,
        separatedQuantity: separated,
        pendingQuantity,
        warehouseAvailableQuantity: warehouseAvailable,
        deficit: Math.max(0, pendingQuantity - warehouseAvailable),
        extraQuantity: Math.max(0, separated - requested)
    };
}

function isQuoteEquipmentUsableStatus(status) {
    return !isMaintenanceStatus(status) && !isInactiveEquipmentStatus(status);
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

        if (!username) return res.status(400).json({ error: 'Usuário é obrigatório' });
        if (password.trim().length < 4) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });
        }

        const existingUser = await dbGet('SELECT id FROM users WHERE lower(username) = lower(?)', [username]);
        if (existingUser) {
            return res.status(409).json({ error: 'Já existe um usuário com esse nome' });
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
        if (!userId) return res.status(400).json({ error: 'Usuário inválido' });
        if (password.trim().length < 4) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });
        }

        const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

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
        if (!userId) return res.status(400).json({ error: 'Usuário inválido' });

        const user = await dbGet('SELECT id, username, COALESCE(role, "user") AS role FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        if (Number(user.id) === Number(req.currentUser.id)) {
            return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário' });
        }

        if (user.role === 'admin') {
            const adminCount = await dbGet('SELECT COUNT(*) AS total FROM users WHERE role = "admin"');
            if (Number(adminCount?.total) <= 1) {
                return res.status(400).json({ error: 'Não é possível excluir o último administrador' });
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

function normalizeQuoteOperationalDestination(value) {
    const normalized = cleanText(value, 20).toLowerCase();
    return normalized === 'event' || normalized === 'rental' ? normalized : '';
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
    const motherName = cleanText(body.motherName ?? body.mother_name, 160);
    const cpf = formatCpf(body.cpf);
    const rg = cleanText(body.rg, 30);
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

    if (!fullName) throw operatorInputError('Nome completo é obrigatório');
    if (!motherName) throw operatorInputError('Nome da mãe é obrigatório');
    if (!cpf) throw operatorInputError('CPF deve ter 11 números');
    if (!birthDate) throw operatorInputError('Data de nascimento inválida');
    if (!address) throw operatorInputError('Endereço é obrigatório');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw operatorInputError('E-mail inválido');
    }
    if (!phone) throw operatorInputError('Número de celular deve ter 11 números com DDD');
    if (!area) throw operatorInputError('Área é obrigatória');
    if (!Number.isFinite(cacheValue) || cacheValue < 0) {
        throw operatorInputError('Valor do cachê inválido');
    }
    if (!photo && options.requirePhoto) {
        throw operatorInputError('Foto é obrigatória');
    }
    if (photo && (photo.length > OPERATOR_PHOTO_MAX_LENGTH || !OPERATOR_PHOTO_PATTERN.test(photo))) {
        throw operatorInputError('Foto inválida ou muito grande');
    }

    return {
        fullName,
        motherName,
        cpf,
        rg,
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
        motherName: row.motherName ?? row.mother_name ?? '',
        cpf: row.cpf || '',
        rg: row.rg || '',
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

function normalizeQuoteServiceId(value) {
    return cleanText(value, 120)
        .toLowerCase()
        .replace(/^service:/, '')
        .replace(/[^a-z0-9-]/g, '');
}

function serializeQuoteService(service = {}, priceOverrides = new Map()) {
    const serviceId = normalizeQuoteServiceId(service.id);
    const name = cleanText(service.name, 300).toUpperCase();
    const configuredPrice = service.editablePrice && priceOverrides.has(serviceId)
        ? priceOverrides.get(serviceId)
        : service.unitPrice;
    const unitPrice = roundMoney(parseMoneyValue(configuredPrice));
    const pricePerSquareMeter = service.requiresDimensions
        ? roundMoney(parseMoneyValue(service.pricePerSquareMeter ?? service.unitPrice))
        : null;
    return {
        id: `service:${serviceId}`,
        serviceId,
        isService: true,
        unlimitedQuantity: true,
        editablePrice: service.editablePrice === true,
        requiresDimensions: service.requiresDimensions === true,
        pricePerSquareMeter,
        name,
        barcode: '',
        category: QUOTE_SERVICE_CATEGORY,
        categories: [QUOTE_SERVICE_CATEGORY],
        serialNumber: '',
        observation: 'Quantidade ilimitada',
        currentStatus: 'Disponível',
        unitPrice,
        minUnitPrice: unitPrice,
        maxUnitPrice: unitPrice,
        totalQuantity: null,
        availableQuantity: null,
        equipments: []
    };
}

function getQuoteServiceSuggestions(search = '', priceOverrides = new Map()) {
    const normalizedSearch = normalizeQuoteStatusText(search).replace(/\s+/g, ' ');
    return quoteServiceCatalog
        .filter((service) => {
            if (!normalizedSearch) return true;
            const searchable = [
                QUOTE_SERVICE_CATEGORY,
                service.name,
                String(service.id || '').replace(/-/g, ' ')
            ].map((value) => normalizeQuoteStatusText(value).replace(/\s+/g, ' '));
            return searchable.some((value) => value.includes(normalizedSearch));
        })
        .map((service) => serializeQuoteService(service, priceOverrides));
}

async function getQuoteServicePriceOverrides() {
    const rows = await dbAll('SELECT service_id AS serviceId, unit_price AS unitPrice FROM quote_service_prices');
    return new Map(rows.map((row) => [
        normalizeQuoteServiceId(row.serviceId),
        roundMoney(parseMoneyValue(row.unitPrice))
    ]));
}

async function getQuoteServiceSuggestionsFromDatabase(search = '') {
    return getQuoteServiceSuggestions(search, await getQuoteServicePriceOverrides());
}

function parseQuoteDimension(value) {
    const dimension = Number(String(value ?? '').trim().replace(',', '.'));
    return Number.isFinite(dimension) ? Math.round(dimension * 1000) / 1000 : NaN;
}

function formatQuoteDimension(value) {
    return Number(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3
    });
}

function normalizeQuoteServiceItem(item, index = 0, priceOverrides = new Map()) {
    const fallbackId = String(item?.id || '').startsWith('service:') ? item.id : '';
    const serviceId = normalizeQuoteServiceId(item?.serviceId ?? item?.service_id ?? fallbackId);
    const isService = parseBooleanFlag(item?.isService ?? item?.is_service) || !!serviceId;
    if (!isService) return null;

    const service = QUOTE_SERVICE_BY_ID.get(serviceId);
    if (!service) throw createQuoteItemError('Serviço de orçamento não encontrado.', 404);

    const quantity = Number.parseInt(item?.quantity, 10);
    const dailyUnits = Number.parseInt(item?.dailyUnits ?? item?.daily_units, 10);
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw createQuoteItemError('Informe uma quantidade válida para o serviço.');
    }
    if (!Number.isInteger(dailyUnits) || dailyUnits <= 0) {
        throw createQuoteItemError('Informe uma quantidade válida de diárias para o serviço.');
    }

    const hasPriceOverride = parseBooleanFlag(item?.priceOverride);
    let serviceWidth = null;
    let serviceHeight = null;
    let description = cleanText(service.name, 300).toUpperCase();
    let internalUnitPrice;

    if (service.requiresDimensions) {
        serviceWidth = parseQuoteDimension(item?.serviceWidth ?? item?.service_width ?? item?.panelWidth);
        serviceHeight = parseQuoteDimension(item?.serviceHeight ?? item?.service_height ?? item?.panelHeight);
        if (!(serviceWidth > 0) || !(serviceHeight > 0)) {
            throw createQuoteItemError('Informe largura e altura válidas para o Painel de LED.');
        }
        const squareMeterPrice = roundMoney(parseMoneyValue(service.pricePerSquareMeter ?? service.unitPrice));
        internalUnitPrice = roundMoney(serviceWidth * serviceHeight * squareMeterPrice);
        description = `${description} ${formatQuoteDimension(serviceWidth)}x${formatQuoteDimension(serviceHeight)} METROS`;
    } else {
        const configuredPrice = service.editablePrice && priceOverrides.has(serviceId)
            ? priceOverrides.get(serviceId)
            : service.unitPrice;
        internalUnitPrice = roundMoney(parseMoneyValue(configuredPrice));
    }

    if (hasPriceOverride) {
        internalUnitPrice = roundMoney(parseMoneyValue(item?.internalUnitPrice));
    }

    return {
        equipmentId: null,
        serviceId,
        serviceWidth,
        serviceHeight,
        isManual: false,
        isService: true,
        category: QUOTE_SERVICE_CATEGORY,
        description,
        quantity,
        dailyUnits,
        internalUnitPrice,
        internalTotal: roundMoney(quantity * dailyUnits * internalUnitPrice),
        sortOrder: index + 1
    };
}

function serializeQuoteEquipment(row) {
    return {
        id: Number(row.id),
        name: row.name,
        barcode: row.barcode,
        category: row.category || 'Outros',
        serialNumber: row.serialNumber || row.serial_number || '',
        observation: row.observation || '',
        currentStatus: row.currentStatus || row.current_status || '',
        unitPrice: roundMoney(parseMoneyValue(row.unitPrice ?? row.unit_price ?? 1))
    };
}

function getQuoteEquipmentNameKey(value) {
    return normalizeQuoteStatusText(value).replace(/\s+/g, ' ');
}

function groupQuoteEquipmentsByName(equipments, unavailableIds = new Set(), capacityByName = new Map()) {
    const groups = new Map();

    for (const equipment of equipments) {
        const key = getQuoteEquipmentNameKey(equipment?.name) || `equipment-${Number(equipment?.id) || 0}`;
        if (!groups.has(key)) {
            groups.set(key, {
                name: equipment.name || 'Equipamento',
                category: equipment.category || 'Outros',
                equipments: [],
                availableEquipments: []
            });
        }

        const group = groups.get(key);
        group.equipments.push(equipment);
        if (isQuoteEquipmentUsableStatus(equipment.currentStatus) && !unavailableIds.has(Number(equipment.id))) {
            group.availableEquipments.push(equipment);
        }
    }

    return Array.from(groups.values()).map((group) => {
        const observations = [...new Set(
            group.equipments.map((equipment) => String(equipment.observation || '').trim()).filter(Boolean)
        )];
        const categories = [...new Set(
            group.equipments.map((equipment) => String(equipment.category || 'Outros').trim() || 'Outros')
        )];
        const capacityValue = capacityByName.get(getQuoteEquipmentNameKey(group.name));
        const capacity = typeof capacityValue === 'object' && capacityValue
            ? capacityValue
            : { forecastAvailableQuantity: Math.max(0, Number(capacityValue) || 0) };
        const prices = group.equipments.map((equipment) => Number(equipment.unitPrice) || 0);
        const first = group.equipments[0];

        return {
            id: Number(first.id),
            name: group.name,
            category: categories[0] || 'Outros',
            categories,
            observation: observations.length === 1 ? observations[0] : (observations.length > 1 ? 'Varia por patrimÃ´nio' : ''),
            totalQuantity: Number(capacity.totalQuantity ?? group.availableEquipments.length) || 0,
            availableQuantity: Math.max(0, Number(capacity.forecastAvailableQuantity) || 0),
            confirmedAvailableQuantity: Math.max(0, Number(capacity.confirmedAvailableQuantity ?? capacity.forecastAvailableQuantity) || 0),
            forecastAvailableQuantity: Math.max(0, Number(capacity.forecastAvailableQuantity) || 0),
            confirmedCommittedQuantity: Math.max(0, Number(capacity.confirmedCommittedQuantity) || 0),
            forecastCommittedQuantity: Math.max(0, Number(capacity.forecastCommittedQuantity) || 0),
            minUnitPrice: prices.length ? Math.min(...prices) : 0,
            maxUnitPrice: prices.length ? Math.max(...prices) : 0,
            equipments: group.equipments
        };
    });
}

function normalizeQuoteEquipmentGroupIds(values) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map(Number)
        .filter((equipmentId) => Number.isInteger(equipmentId) && equipmentId > 0))]
        .slice(0, 1200);
}

function normalizeQuoteEquipmentTopic(value) {
    return String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ') || 'Outros';
}

function getQuoteEquipmentTopicKey(value) {
    return normalizeQuoteEquipmentTopic(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR');
}

function planQuoteEquipmentTopicRename(rows, sourceTopic, requestedTopic) {
    const normalizedSource = normalizeQuoteEquipmentTopic(sourceTopic);
    const normalizedRequested = normalizeQuoteEquipmentTopic(requestedTopic);
    const sourceKey = getQuoteEquipmentTopicKey(normalizedSource);
    const requestedKey = getQuoteEquipmentTopicKey(normalizedRequested);
    const topics = (Array.isArray(rows) ? rows : []).map((row) => ({
        raw: row?.category ?? null,
        label: normalizeQuoteEquipmentTopic(row?.category),
        key: getQuoteEquipmentTopicKey(row?.category),
        total: Math.max(0, Number(row?.total) || 0)
    }));
    const sourceMatches = topics.filter((topic) => topic.key === sourceKey);
    if (!sourceMatches.length) return null;

    const destinationMatches = topics.filter((topic) => topic.key === requestedKey);
    let topic = normalizedRequested;
    if (sourceKey !== requestedKey && destinationMatches.length) {
        const exactMatch = destinationMatches.find((entry) => entry.label === normalizedRequested);
        topic = exactMatch?.label || destinationMatches
            .slice()
            .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true }))[0].label;
    }

    const matchedTopics = sourceKey === requestedKey
        ? sourceMatches
        : [...sourceMatches, ...destinationMatches];
    const uniqueTopics = [];
    const seenRawTopics = new Set();
    matchedTopics.forEach((entry) => {
        const rawKey = entry.raw === null ? '__NULL__' : `string:${entry.raw}`;
        if (seenRawTopics.has(rawKey)) return;
        seenRawTopics.add(rawKey);
        uniqueTopics.push(entry);
    });

    return {
        sourceTopic: normalizedSource,
        topic,
        rawTopics: uniqueTopics.filter((entry) => entry.raw !== null).map((entry) => entry.raw),
        includesNull: uniqueTopics.some((entry) => entry.raw === null),
        merged: sourceKey !== requestedKey
            ? destinationMatches.length > 0
            : destinationMatches.some((entry) => entry.label === normalizedRequested)
                && sourceMatches.some((entry) => entry.label !== normalizedRequested),
        total: uniqueTopics.reduce((sum, entry) => sum + entry.total, 0)
    };
}

async function getQuoteEquipment(equipmentId) {
    return dbGet(
        `SELECT id,
                name,
                barcode,
                serial_number AS serialNumber,
                observation,
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

async function normalizeEquipmentQuoteItem(item, index, usedEquipmentIds, servicePriceOverrides) {
    const serviceItem = normalizeQuoteServiceItem(item, index, servicePriceOverrides);
    if (serviceItem) return serviceItem;

    const equipmentId = Number(item?.equipmentId);
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        if (!parseBooleanFlag(item?.isManual)) {
            throw createQuoteItemError('Item de orçamento sem equipamento cadastrado inválido.');
        }

        const description = cleanText(item?.description, 300);
        const quantity = Number.parseInt(item?.quantity, 10);
        const dailyUnits = Number.parseInt(item?.dailyUnits, 10);
        const internalUnitPrice = roundMoney(parseMoneyValue(item?.internalUnitPrice));
        if (!description) {
            throw createQuoteItemError('Digite o nome do equipamento avulso.');
        }
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw createQuoteItemError('Informe uma quantidade válida para o equipamento avulso.');
        }
        if (!Number.isInteger(dailyUnits) || dailyUnits <= 0) {
            throw createQuoteItemError('Informe uma quantidade válida de diárias para o equipamento avulso.');
        }
        if (!Number.isFinite(internalUnitPrice) || internalUnitPrice < 0) {
            throw createQuoteItemError('Informe um preço válido para o equipamento avulso.');
        }

        return {
            equipmentId: null,
            isManual: true,
            category: 'outros',
            description,
            quantity,
            dailyUnits,
            internalUnitPrice,
            internalTotal: roundMoney(quantity * dailyUnits * internalUnitPrice),
            sortOrder: index + 1
        };
    }

    if (usedEquipmentIds.has(equipmentId)) {
        throw createQuoteItemError('O mesmo equipamento foi acrescentado mais de uma vez ao orçamento.');
    }

    const equipment = await getQuoteEquipment(equipmentId);
    if (!equipment) {
        throw createQuoteItemError('Equipamento não encontrado.', 404);
    }

    usedEquipmentIds.add(equipmentId);
    const category = QUOTE_CATEGORIES[item?.category] ? item.category : 'transmissao';
    const quantity = Number.parseInt(item?.quantity, 10);
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw createQuoteItemError('Informe uma quantidade válida para o equipamento.');
    }
    const dailyUnits = Math.max(1, Number.parseInt(item?.dailyUnits, 10) || 1);
    const internalUnitPrice = parseBooleanFlag(item?.priceOverride)
        ? roundMoney(parseMoneyValue(item?.internalUnitPrice))
        : roundMoney(parseMoneyValue(equipment.unitPrice));

    return {
        equipmentId,
        isManual: false,
        category,
        description: equipment.name,
        quantity,
        dailyUnits,
        internalUnitPrice,
        internalTotal: roundMoney(quantity * dailyUnits * internalUnitPrice),
        sortOrder: index + 1
    };
}

async function getQuoteItemsFromBody(items) {
    const usedEquipmentIds = new Set();
    const normalizedItems = [];
    const servicePriceOverrides = await getQuoteServicePriceOverrides();

    for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
        const normalized = await normalizeEquipmentQuoteItem(
            item,
            index,
            usedEquipmentIds,
            servicePriceOverrides
        );
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
            throw createQuoteItemError('Selecione um técnico cadastrado para o orçamento.');
        }

        if (usedOperatorIds.has(operatorId)) {
            throw createQuoteItemError('O mesmo técnico foi acrescentado mais de uma vez ao orçamento.');
        }

        const dailyUnits = Number.parseInt(technician?.dailyUnits ?? technician?.daily_units, 10);
        if (!Number.isInteger(dailyUnits) || dailyUnits <= 0) {
            throw createQuoteItemError('Informe uma quantidade válida de diárias para cada técnico.');
        }

        const operator = await getQuoteOperator(operatorId);
        if (!operator) {
            throw createQuoteItemError('Técnico não encontrado.', 404);
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
                COALESCE(logistics_price, 0) AS logisticsPrice,
                COALESCE(technicians_price, 0) AS techniciansPrice,
                subtotal,
                final_total AS finalTotal,
                COALESCE(show_item_prices, 0) AS showItemPrices,
                notes,
                COALESCE(status, 'pending') AS status,
                approved_at AS approvedAt,
                (
                    SELECT destination_type
                    FROM quote_operational_destinations
                    WHERE quote_id = quotes.id
                ) AS destinationType,
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
                COALESCE(is_manual, 0) AS isManual,
                COALESCE(is_service, 0) AS isService,
                service_id AS serviceId,
                service_width AS serviceWidth,
                service_height AS serviceHeight,
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
    quote.items = quote.items.map((item) => ({
        ...item,
        isManual: Number(item.isManual) === 1,
        isService: Number(item.isService) === 1
    }));

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
const QUOTE_HEADER_PATH = path.join(PHOTOS_DIR, 'quote-header.png');
const QUOTE_SIGNATURE_PATH = path.join(PHOTOS_DIR, 'quote-signature.png');

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
    const description = cleanText(item?.description, 300) || '-';
    return item?.isService === true || Number(item?.isService) === 1
        ? description.toUpperCase()
        : description;
}

function consolidateQuoteItemsForDisplay(items = []) {
    const consolidated = [];
    const realEquipmentGroups = new Map();
    const serviceGroups = new Map();

    for (const item of items) {
        const isService = item?.isService === true || Number(item?.isService) === 1;
        if (isService) {
            const dailyUnits = Math.max(1, Number(item.dailyUnits) || 1);
            const serviceKey = cleanText(item.serviceId, 120)
                || normalizeQuoteStatusText(item.description).replace(/\s+/g, ' ');
            const descriptionKey = normalizeQuoteStatusText(item.description).replace(/\s+/g, ' ');
            const key = `${serviceKey}|${descriptionKey}|${dailyUnits}`;
            let group = serviceGroups.get(key);
            if (!group) {
                group = {
                    ...item,
                    isManual: false,
                    isService: true,
                    description: getQuoteItemDescription(item),
                    quantity: 0,
                    internalTotal: 0
                };
                serviceGroups.set(key, group);
                consolidated.push(group);
            }

            group.quantity += Math.max(1, Number(item.quantity) || 1);
            group.internalTotal = roundMoney(group.internalTotal + (Number(item.internalTotal) || 0));
            group.internalUnitPrice = roundMoney(
                group.internalTotal / Math.max(1, group.quantity * dailyUnits)
            );
            continue;
        }

        const isManual = item?.isManual === true || Number(item?.isManual) === 1 || !Number(item?.equipmentId);
        if (isManual) {
            consolidated.push({ ...item });
            continue;
        }

        const dailyUnits = Math.max(1, Number(item.dailyUnits) || 1);
        const nameKey = normalizeQuoteStatusText(item.description).replace(/\s+/g, ' ');
        const key = `${nameKey}|${dailyUnits}`;
        let group = realEquipmentGroups.get(key);
        if (!group) {
            group = {
                ...item,
                quantity: 0,
                internalTotal: 0
            };
            realEquipmentGroups.set(key, group);
            consolidated.push(group);
        }

        group.quantity += Math.max(1, Number(item.quantity) || 1);
        group.internalTotal = roundMoney(group.internalTotal + (Number(item.internalTotal) || 0));
        group.internalUnitPrice = roundMoney(
            group.internalTotal / Math.max(1, group.quantity * dailyUnits)
        );
    }

    const itemsByTopic = new Map();
    for (const item of consolidated) {
        const topicKey = normalizeQuoteStatusText(cleanText(item.category, 120) || 'outros')
            .replace(/\s+/g, ' ');
        if (!itemsByTopic.has(topicKey)) itemsByTopic.set(topicKey, []);
        itemsByTopic.get(topicKey).push(item);
    }

    return [...itemsByTopic.values()].flat();
}

function getQuoteItemRowHeight(doc, item, fonts, descriptionWidth) {
    doc.font(fonts.regular).fontSize(8.4);
    const descriptionHeight = doc.heightOfString(getQuoteItemDescription(item), {
        width: descriptionWidth - 8,
        lineGap: 0
    });
    return Math.max(15, descriptionHeight + 5);
}

function getQuoteItemTableWidths() {
    return [56.7, 240.3, 43, 70, 107.2];
}

function getQuoteEquipmentTotal(quote) {
    return roundMoney((Array.isArray(quote?.items) ? quote.items : [])
        .reduce((sum, item) => sum + (Number(item?.internalTotal) || 0), 0));
}

function takeQuoteItemsForPage(doc, items, fonts, maxItems, maxBodyHeight) {
    const descriptionWidth = getQuoteItemTableWidths()[1];
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
    const showItemPrices = options.showItemPrices === true;
    const showEquipmentTotal = showItemPrices && options.showEquipmentTotal === true;
    const equipmentTotalHeight = showEquipmentTotal ? 22 : 0;
    const widths = getQuoteItemTableWidths();
    const headerHeight = 32;
    const rowHeights = items.map((item) => getQuoteItemRowHeight(doc, item, fonts, widths[1]));
    const naturalBodyHeight = rowHeights.reduce((sum, height) => sum + height, 0) + equipmentTotalHeight;
    const bodyHeight = Math.max(options.minimumBodyHeight || 0, naturalBodyHeight);
    const totalHeight = headerHeight + bodyHeight;
    const boundaries = [x];

    widths.forEach((width) => boundaries.push(boundaries[boundaries.length - 1] + width));

    doc.lineWidth(0.7).strokeColor('#111111').rect(x, y, QUOTE_PDF_WIDTH, totalHeight).stroke();
    boundaries.slice(1, -1).forEach((boundary) => {
        doc.moveTo(boundary, y).lineTo(boundary, y + totalHeight).stroke();
    });
    doc.moveTo(x, y + headerHeight).lineTo(x + QUOTE_PDF_WIDTH, y + headerHeight).stroke();

    const headers = [
        'Item',
        'Equipamentos',
        'Quant',
        'Di\u00e1rias/Uni.',
        showItemPrices ? 'Valor Total/Uni.' : ''
    ];
    let headerX = x;
    headers.forEach((header, index) => {
        drawQuoteCellText(doc, header, headerX, y, widths[index], headerHeight, fonts, {
            bold: index === 1,
            fontSize: index === 1 ? 10 : (index === 0 ? 9.2 : 8.3),
            paddingX: index === 0 ? 6 : 2,
            align: index === 1 ? 'center' : 'left'
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
            String(startIndex + index + 1).padStart(2, '0'),
            getQuoteItemDescription(item),
            String(Math.max(1, Number(item.quantity) || 1)).padStart(2, '0'),
            String(Math.max(1, Number(item.dailyUnits) || 1)).padStart(2, '0')
        ];

        values.push(showItemPrices ? formatQuoteCurrency(item.internalTotal) : '');

        let cellX = x;
        values.forEach((value, valueIndex) => {
            drawQuoteCellText(doc, value, cellX, rowY, widths[valueIndex], rowHeight, fonts, {
                paddingX: valueIndex === 1 ? 1 : 2,
                fontSize: valueIndex === 1 ? 8.4 : 8.2
            });
            cellX += widths[valueIndex];
        });

        rowY += rowHeight;
    });

    if (showEquipmentTotal) {
        const footerY = y + headerHeight + bodyHeight - equipmentTotalHeight;
        doc.moveTo(x, footerY).lineTo(x + QUOTE_PDF_WIDTH, footerY).stroke();
        const values = [
            '',
            'Valor Total dos Equipamentos',
            '',
            '',
            formatQuoteCurrency(options.equipmentTotal)
        ];
        let cellX = x;
        values.forEach((value, valueIndex) => {
            drawQuoteCellText(doc, value, cellX, footerY, widths[valueIndex], equipmentTotalHeight, fonts, {
                bold: false,
                paddingX: valueIndex === 1 ? 1 : 2,
                fontSize: valueIndex === 1 ? 8.4 : 8.2,
                align: valueIndex === 1 ? 'left' : 'center'
            });
            cellX += widths[valueIndex];
        });
    }

    return y + totalHeight;
}

function getQuoteNotesText(notes) {
    const defaultNotes = 'Obs.: A validade desta proposta est\u00e1 sujeita \u00e0 verifica\u00e7\u00e3o de disponibilidade de equipamentos e pessoal especializado ap\u00f3s sua aprova\u00e7\u00e3o. Proposta v\u00e1lida por 7 dias.';
    const text = cleanText(notes, 800) || defaultNotes;
    const comparableText = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    if (
        comparableText.includes('a validade desta proposta esta sujeita a verificacao de disponibilidade')
        && (
            comparableText.includes('proposta valida por 1 dia')
            || comparableText.includes('proposta valida por 7 dias')
        )
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

function drawQuoteFixedServicesTable(doc, quote, y, fonts) {
    const x = QUOTE_PDF_LEFT;
    const widths = getQuoteItemTableWidths();
    const headingHeight = 32;
    const rowHeight = 18;
    const showServicesPrice = quote.showServicesPrice === true;
    const totalHeight = headingHeight + rowHeight;
    const boundaries = [x];
    widths.forEach((width) => boundaries.push(boundaries[boundaries.length - 1] + width));

    doc.lineWidth(0.7).strokeColor('#111111').rect(x, y, QUOTE_PDF_WIDTH, totalHeight).stroke();
    boundaries.slice(1, -1).forEach((boundary) => {
        doc.moveTo(boundary, y).lineTo(boundary, y + totalHeight).stroke();
    });
    doc.moveTo(x, y + headingHeight).lineTo(x + QUOTE_PDF_WIDTH, y + headingHeight).stroke();

    const headers = ['Item', 'Serviços', 'Quant', 'Diárias/Uni.', 'Valor Total/Uni.'];
    if (!showServicesPrice) headers[4] = '';
    let headerX = x;
    headers.forEach((header, index) => {
        drawQuoteCellText(doc, header, headerX, y, widths[index], headingHeight, fonts, {
            bold: index === 1,
            fontSize: index === 1 ? 10 : (index === 0 ? 9.2 : 8.3),
            paddingX: index === 0 ? 6 : 2,
            align: index === 1 ? 'center' : 'left'
        });
        headerX += widths[index];
    });

    const rows = [
        [
            '01',
            'Técnicos e Logística',
            '01',
            '01',
            formatQuoteCurrency((Number(quote.techniciansPrice) || 0) + (Number(quote.logisticsPrice) || 0))
        ]
    ];
    if (!showServicesPrice) rows[0][4] = '';
    rows.forEach((values, index) => {
        const rowY = y + headingHeight + rowHeight * index;
        let cellX = x;
        values.forEach((value, valueIndex) => {
            drawQuoteCellText(doc, value, cellX, rowY, widths[valueIndex], rowHeight, fonts, {
                paddingX: valueIndex === 1 ? 1 : 2,
                fontSize: valueIndex === 1 ? 8.4 : 8.2,
                align: valueIndex === 1 ? 'left' : 'center'
            });
            cellX += widths[valueIndex];
        });
    });

    return y + totalHeight;
}

function drawQuoteTotalAndNotes(doc, quote, y, fonts) {
    const x = QUOTE_PDF_LEFT;
    const totalHeight = 42.5;
    const notesText = getQuoteNotesText(quote.notes);
    const notesFontSize = 8.3;
    const notesLineGap = 1;
    doc.font(fonts.regular).fontSize(notesFontSize);
    const notesHeight = Math.max(
        58.8,
        doc.heightOfString(notesText, {
            width: QUOTE_PDF_WIDTH - 12,
            lineGap: notesLineGap
        }) + 4
    );
    const splitWidth = 340.6;

    doc.lineWidth(0.8).strokeColor('#111111').rect(x, y, QUOTE_PDF_WIDTH, totalHeight).stroke();
    doc.moveTo(x + splitWidth, y).lineTo(x + splitWidth, y + totalHeight).stroke();
    drawQuoteCellText(doc, 'Valor Total', x, y, splitWidth, totalHeight, fonts, {
        bold: true,
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
        { bold: true, fontSize: 9.6, paddingX: 1 }
    );

    const notesY = y + totalHeight;
    doc.rect(x, notesY, QUOTE_PDF_WIDTH, notesHeight).stroke();
    drawQuoteCellText(doc, notesText, x, notesY, QUOTE_PDF_WIDTH, notesHeight, fonts, {
        fontSize: notesFontSize,
        paddingX: 6,
        lineGap: notesLineGap
    });

    return notesY + notesHeight;
}

function drawQuotePaymentTable(doc, quote, y, fonts) {
    const x = 70.1;
    const width = 468.4;
    const labelWidth = 194.1;
    const valueWidth = width - labelWidth;
    const rows = [
        ['Valor Total', formatQuoteCurrency(quote.finalTotal), true, 30.5],
        ['Forma de Pagamento', getQuotePaymentMethodText(quote.paymentMethod), true, 23.5],
        ['Prazo', quote.paymentDeadline || '-', true, 27]
    ].map(([label, value, bold, minimumHeight]) => {
        const fontSize = 9.6;
        doc.font(fonts.regular).fontSize(fontSize);
        const labelHeight = doc.heightOfString(String(label), { width: labelWidth - 12 });
        doc.font(bold ? fonts.bold : fonts.regular).fontSize(fontSize);
        const valueHeight = doc.heightOfString(String(value), { width: valueWidth - 12 });
        return [label, value, bold, Math.max(minimumHeight, labelHeight, valueHeight) + 4];
    });
    const totalHeight = rows.reduce((sum, row) => sum + row[3], 0);

    doc.lineWidth(0.8).strokeColor('#111111').rect(x, y, width, totalHeight).stroke();
    doc.moveTo(x + labelWidth, y).lineTo(x + labelWidth, y + totalHeight).stroke();

    let rowY = y;
    rows.forEach(([label, value, bold, rowHeight], index) => {
        if (index > 0) {
            doc.moveTo(x, rowY).lineTo(x + width, rowY).stroke();
        }
        drawQuoteCellText(doc, label, x, rowY, labelWidth, rowHeight, fonts, {
            fontSize: 9.6,
            bold: index === 0
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
    const servicesBottom = drawQuoteFixedServicesTable(doc, quote, tableBottom + 4, fonts);
    const totalY = servicesBottom + 4;
    const notesBottom = drawQuoteTotalAndNotes(doc, quote, totalY, fonts);
    const paymentHeadingY = referenceLayout ? Math.max(619, notesBottom + 43) : notesBottom + 42;

    drawQuoteHeading(doc, 'CONDI\u00c7\u00d5ES DE PAGAMENTO:', QUOTE_PDF_LEFT, paymentHeadingY, fonts);
    drawQuotePaymentTable(doc, quote, paymentHeadingY + 16.5, fonts);
}

function drawQuoteContinuationPages(doc, quote, remainingItems, startIndex, fonts) {
    let itemIndex = startIndex;
    let pendingItems = remainingItems.slice();
    const showItemPrices = quote.showItemPrices === true;
    const equipmentTotal = getQuoteEquipmentTotal(quote);

    while (pendingItems.length > 0) {
        doc.addPage();
        drawQuoteHeader(doc);
        drawQuoteHeading(doc, 'DESCRI\u00c7\u00c3O DOS EQUIPAMENTOS (CONTINUA\u00c7\u00c3O):', QUOTE_PDF_LEFT, 204, fonts);

        const pageItems = takeQuoteItemsForPage(doc, pendingItems, fonts, 14, 245);
        pendingItems = pendingItems.slice(pageItems.length);
        const tableBottom = drawQuoteItemsTable(doc, pageItems, itemIndex, 221, fonts, {
            showItemPrices,
            showEquipmentTotal: pendingItems.length === 0,
            equipmentTotal
        });
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
        'Da mesma forma, \u00e9 responsabilidade do cliente disponibilizar ambiente e condi\u00e7\u00f5es',
        97.58,
        273,
        { width: 438 }
    );
    doc.text(
        'adequadas para o bom funcionamento e a utilidade dos equipamentos, assim como zelar pela seguran\u00e7a',
        61.58,
        286.5,
        { width: 474 }
    );
    doc.text(
        'e conserva\u00e7\u00e3o deles durante a loca\u00e7\u00e3o.',
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
    const allItems = consolidateQuoteItemsForDisplay(Array.isArray(quote.items) ? quote.items : []);
    const showItemPrices = quote.showItemPrices === true;
    const firstPageItems = takeQuoteItemsForPage(doc, allItems, fonts, 5, 75);
    const remainingItems = allItems.slice(firstPageItems.length);

    drawQuoteHeader(doc);
    doc.font(fonts.bold)
        .fontSize(10)
        .fillColor('#111111')
        .text('24H LOCAÇÃO DE EQUIPAMENTOS LTDA', 61.58, 184, { width: 470, align: 'center' });
    doc.font(fonts.regular)
        .fontSize(9.5)
        .text('CNPJ: 11.393.866/0001-26', 61.58, 198, { width: 470, align: 'center' });
    doc.font(fonts.regular)
        .fontSize(10)
        .fillColor('#111111')
        .text(
            `${quote.proposalCity || 'Belo Horizonte'}, ${formatLongDateBR(quote.proposalDate)}`,
            61.58,
            216,
            { width: 470 }
        );

    drawQuoteHeading(doc, 'INFORMA\u00c7\u00d5ES GERAIS:', 61.58, 250, fonts);
    const informationBottom = drawQuoteInformationTable(doc, quote, 267.3, fonts);
    const itemsHeadingY = Math.max(383.8, informationBottom + 32.5);
    drawQuoteHeading(doc, 'DESCRI\u00c7\u00c3O DOS EQUIPAMENTOS:', 61.58, itemsHeadingY, fonts);
    const tableBottom = drawQuoteItemsTable(doc, firstPageItems, 0, itemsHeadingY + 16.5, fonts, {
        minimumBodyHeight: 52.5,
        showItemPrices,
        showEquipmentTotal: remainingItems.length === 0,
        equipmentTotal: getQuoteEquipmentTotal(quote)
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
        return res.status(400).json({ error: 'Tipo de item inválido' });
    }

    try {
        const equipmentMetadataSelect = type === 'equipment'
            ? `,
                    serial_number AS serialNumber,
                    observation`
            : '';
        const items = await dbAll(
            `SELECT id,
                    name,
                    ${config.categoryExpression} AS category,
                    COALESCE(unit_price, 1) AS unitPrice
                    ${equipmentMetadataSelect}
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
        return res.status(400).json({ error: 'Item inválido' });
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ error: 'Preço inválido' });
    }

    try {
        const item = await dbGet(`SELECT id, name FROM ${config.table} WHERE id = ?`, [itemId]);
        if (!item) {
            return res.status(404).json({ error: 'Item não encontrado' });
        }

        if (type === 'equipment') {
            await dbRun(
                `UPDATE equipments
                 SET unit_price = ?
                 WHERE lower(trim(name)) = lower(trim(?))`,
                [unitPrice, item.name]
            );
        } else {
            await dbRun(
                `UPDATE ${config.table}
                 SET unit_price = ?
                 WHERE id = ?`,
                [unitPrice, itemId]
            );
        }

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
                    equipments.serial_number AS serialNumber,
                    equipments.observation,
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
                OR COALESCE(equipments.observation, '') LIKE ?
                OR COALESCE(equipments.category, '') LIKE ?
             ORDER BY hiddenFromQuotes ASC,
                      lower(COALESCE(equipments.category, 'Outros')) ASC,
                      lower(equipments.name) ASC,
                      equipments.barcode ASC`,
            [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
        );

        return res.json({
            equipments: rows.map(serializeQuoteDatabaseEquipment),
            services: await getQuoteServiceSuggestionsFromDatabase(search)
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/orcamentos/topicos/nome', requireQuoteDatabaseAccess, async (req, res) => {
    const sourceTopic = cleanText(req.body?.sourceTopic, 160).replace(/\s+/g, ' ');
    const requestedTopic = cleanText(req.body?.topic, 160).replace(/\s+/g, ' ');
    if (!sourceTopic || !requestedTopic) {
        return res.status(400).json({ error: 'Informe o tópico atual e o novo nome.' });
    }

    try {
        const topics = await dbAll(
            `SELECT category, COUNT(*) AS total
             FROM equipments
             GROUP BY category`
        );
        const plan = planQuoteEquipmentTopicRename(topics, sourceTopic, requestedTopic);
        if (!plan) {
            return res.status(404).json({ error: 'Tópico não encontrado.' });
        }

        const predicates = [];
        const params = [plan.topic];
        if (plan.rawTopics.length) {
            predicates.push(`category IN (${plan.rawTopics.map(() => '?').join(', ')})`);
            params.push(...plan.rawTopics);
        }
        if (plan.includesNull) predicates.push('category IS NULL');

        await createSqliteBackup('before-rename-quote-topic');
        await dbRun('BEGIN TRANSACTION');
        const result = await dbRun(
            `UPDATE equipments
             SET category = ?
             WHERE ${predicates.join(' OR ')}`,
            params
        );
        await dbRun('COMMIT');
        return res.json({
            success: true,
            sourceTopic: plan.sourceTopic,
            topic: plan.topic,
            merged: plan.merged,
            updated: Number(result?.changes) || plan.total
        });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/orcamentos/equipamentos-grupo/nome', requireQuoteDatabaseAccess, async (req, res) => {
    const equipmentIds = normalizeQuoteEquipmentGroupIds(req.body?.equipmentIds);
    const name = cleanText(req.body?.name, 300);
    if (!equipmentIds.length || !name) {
        return res.status(400).json({ error: 'Informe os equipamentos e o novo nome.' });
    }

    try {
        const placeholders = equipmentIds.map(() => '?').join(', ');
        const existing = await dbGet(
            `SELECT COUNT(*) AS total FROM equipments WHERE id IN (${placeholders})`,
            equipmentIds
        );
        if (Number(existing?.total) !== equipmentIds.length) {
            return res.status(404).json({ error: 'Um ou mais equipamentos não foram encontrados.' });
        }

        await createSqliteBackup(`before-rename-quote-equipment-group-${equipmentIds[0]}`);
        await dbRun('BEGIN TRANSACTION');
        for (const equipmentId of equipmentIds) {
            await dbRun('UPDATE equipments SET name = ? WHERE id = ?', [name, equipmentId]);
        }
        await dbRun('COMMIT');
        return res.json({ success: true, equipmentIds, name, updated: equipmentIds.length });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/orcamentos/equipamentos-grupo/preco', requireQuoteDatabaseAccess, async (req, res) => {
    const requestedIds = normalizeQuoteEquipmentGroupIds(req.body?.equipmentIds);
    const unitPrice = roundMoney(parseMoneyValue(req.body?.unitPrice));
    if (!requestedIds.length || !Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ error: 'Informe os equipamentos e um preço válido.' });
    }

    try {
        const requestedPlaceholders = requestedIds.map(() => '?').join(', ');
        const names = await dbAll(
            `SELECT DISTINCT lower(trim(name)) AS nameKey
             FROM equipments
             WHERE id IN (${requestedPlaceholders})`,
            requestedIds
        );
        if (!names.length) {
            return res.status(404).json({ error: 'Um ou mais equipamentos não foram encontrados.' });
        }
        const nameKeys = names.map((entry) => entry.nameKey);
        const namePlaceholders = nameKeys.map(() => '?').join(', ');
        const equipments = await dbAll(
            `SELECT id FROM equipments WHERE lower(trim(name)) IN (${namePlaceholders})`,
            nameKeys
        );
        const equipmentIds = equipments.map((equipment) => Number(equipment.id));

        await createSqliteBackup(`before-price-quote-equipment-group-${equipmentIds[0]}`);
        await dbRun('BEGIN TRANSACTION');
        await dbRun(
            `UPDATE equipments SET unit_price = ? WHERE lower(trim(name)) IN (${namePlaceholders})`,
            [unitPrice, ...nameKeys]
        );
        await dbRun('COMMIT');
        return res.json({ success: true, equipmentIds, unitPrice, updated: equipmentIds.length });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/orcamentos/servicos/:serviceId/preco', requireQuoteDatabaseAccess, async (req, res) => {
    const serviceId = normalizeQuoteServiceId(req.params.serviceId);
    const service = QUOTE_SERVICE_BY_ID.get(serviceId);
    const unitPrice = roundMoney(parseMoneyValue(req.body?.unitPrice));
    if (!service || service.editablePrice !== true) {
        return res.status(404).json({ error: 'Serviço com preço editável não encontrado.' });
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ error: 'Informe um preço válido.' });
    }

    try {
        await createSqliteBackup(`before-price-quote-service-${serviceId}`);
        await dbRun(
            `INSERT INTO quote_service_prices (service_id, unit_price, updated_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(service_id) DO UPDATE SET
                unit_price = excluded.unit_price,
                updated_at = CURRENT_TIMESTAMP`,
            [serviceId, unitPrice]
        );
        return res.json({ success: true, serviceId, unitPrice });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/orcamentos/equipamentos-grupo/:action(ocultar|restaurar)', requireQuoteDatabaseAccess, async (req, res) => {
    const requestedIds = normalizeQuoteEquipmentGroupIds(req.body?.equipmentIds);
    const hidden = req.params.action === 'ocultar';
    if (!requestedIds.length) {
        return res.status(400).json({ error: 'Informe os equipamentos.' });
    }

    try {
        const requestedPlaceholders = requestedIds.map(() => '?').join(', ');
        const names = await dbAll(
            `SELECT DISTINCT lower(trim(name)) AS nameKey
             FROM equipments
             WHERE id IN (${requestedPlaceholders})`,
            requestedIds
        );
        if (!names.length) {
            return res.status(404).json({ error: 'Um ou mais equipamentos não foram encontrados.' });
        }
        const nameKeys = names.map((entry) => entry.nameKey);
        const namePlaceholders = nameKeys.map(() => '?').join(', ');
        const equipments = await dbAll(
            `SELECT id FROM equipments WHERE lower(trim(name)) IN (${namePlaceholders})`,
            nameKeys
        );
        const equipmentIds = equipments.map((equipment) => Number(equipment.id));

        await dbRun('BEGIN TRANSACTION');
        for (const equipmentId of equipmentIds) {
            if (hidden) {
                await dbRun(
                    `INSERT INTO quote_hidden_equipments (equipment_id, hidden_by_username)
                     VALUES (?, ?)
                     ON CONFLICT(equipment_id) DO UPDATE SET
                        hidden_by_username = excluded.hidden_by_username,
                        hidden_at = CURRENT_TIMESTAMP`,
                    [equipmentId, req.currentUser?.username || req.session?.username || null]
                );
            } else {
                await dbRun('DELETE FROM quote_hidden_equipments WHERE equipment_id = ?', [equipmentId]);
            }
        }
        await dbRun('COMMIT');
        return res.json({ success: true, equipmentIds, hiddenFromQuotes: hidden, updated: equipmentIds.length });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/orcamentos/equipamentos/:id/ocultar', requireQuoteDatabaseAccess, async (req, res) => {
    const equipmentId = Number(req.params.id);
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        return res.status(400).json({ error: 'Equipamento inválido.' });
    }

    try {
        const equipment = await getQuoteEquipment(equipmentId);
        if (!equipment) {
            return res.status(404).json({ error: 'Equipamento não encontrado.' });
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
        return res.status(400).json({ error: 'Equipamento inválido.' });
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
    const eventRange = getQuoteOperationalRange({
        assemblyDatetime: cleanText(req.query.assemblyDatetime, 160),
        eventDatetime: cleanText(req.query.eventDatetime, 160),
        disassemblyDatetime: cleanText(req.query.disassemblyDatetime, 160)
    });
    const excludeQuoteId = Number(req.query.quoteId || req.query.excludeQuoteId);

    if (!search) {
        return res.json({ equipments: [] });
    }

    let services;
    try {
        services = await getQuoteServiceSuggestionsFromDatabase(search);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
    if (!eventRange) {
        if (services.length) {
            return res.json({ equipments: services, eventRange: null });
        }
        return res.status(400).json({
            error: 'Informe Montagem, Evento e Desmontagem em ordem válida antes de buscar os equipamentos.'
        });
    }

    try {
        const searchLike = `%${search}%`;
        const exactTopic = search.toLowerCase();
        const rows = await dbAll(
            `SELECT id,
                    name,
                    barcode,
                    serial_number AS serialNumber,
                    observation,
                    current_status AS currentStatus,
                    category,
                    COALESCE(unit_price, 1) AS unitPrice
             FROM equipments
             WHERE (
                    name LIKE ?
                    OR barcode LIKE ?
                    OR COALESCE(observation, '') LIKE ?
                    OR COALESCE(category, 'Outros') LIKE ?
               )
               AND NOT EXISTS (
                   SELECT 1
                   FROM quote_hidden_equipments
                   WHERE quote_hidden_equipments.equipment_id = equipments.id
               )
             ORDER BY CASE
                    WHEN lower(COALESCE(category, 'Outros')) = ? THEN 0
                    WHEN COALESCE(category, 'Outros') LIKE ? THEN 1
                    WHEN name LIKE ? THEN 2
                    ELSE 3
                END,
                lower(COALESCE(category, 'Outros')) ASC,
                lower(name) ASC,
                barcode ASC
             LIMIT 1200`,
            [searchLike, searchLike, searchLike, searchLike, exactTopic, searchLike, searchLike]
        );

        const catalogEquipments = rows.map(serializeQuoteEquipment);
        const unavailableIds = await findUnavailableEquipmentIds(
            catalogEquipments.map((equipment) => equipment.id),
            eventRange,
            { excludeQuoteId }
        );
        const capacityGroups = await buildEquipmentGroupCapacity(eventRange, { excludeQuoteId });
        const capacityByName = new Map();
        for (const equipment of catalogEquipments) {
            const key = getQuoteEquipmentNameKey(equipment.name);
            if (!capacityByName.has(key)) {
                capacityByName.set(
                    key,
                    getGroupCapacitySnapshot(capacityGroups.get(key), eventRange)
                );
            }
        }
        const grouped = groupQuoteEquipmentsByName(catalogEquipments, unavailableIds, capacityByName);

        return res.json({
            equipments: [...services, ...grouped],
            eventRange: { start: eventRange.start, end: eventRange.end }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/orcamentos/equipamentos/:id/agendar', requireQuoteAccess, async (req, res) => {
    const equipmentId = Number(req.params.id);
    const eventDatetime = cleanText(req.body?.eventDatetime, 160);
    const excludeQuoteId = Number(req.body?.quoteId || req.body?.excludeQuoteId);
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        return res.status(400).json({ error: 'Equipamento inválido.' });
    }

    const eventRange = getQuoteOperationalRange({
        assemblyDatetime: cleanText(req.body?.assemblyDatetime, 160),
        eventDatetime,
        disassemblyDatetime: cleanText(req.body?.disassemblyDatetime, 160)
    });
    if (!eventRange) {
        return res.status(400).json({ error: 'Informe Montagem, Evento e Desmontagem em ordem válida antes de acrescentar o equipamento.' });
    }

    try {
        const equipment = await getQuoteEquipment(equipmentId);
        if (!equipment) {
            return res.status(404).json({ error: 'Equipamento não encontrado.' });
        }

        if (await isQuoteEquipmentHidden(equipmentId)) {
            return res.status(409).json({ error: 'Este equipamento está oculto no banco de orçamentos.' });
        }

        const availabilityWarning = await findEquipmentDateConflict(equipmentId, eventRange, {
            equipment,
            excludeQuoteId
        });

        return res.json({
            success: true,
            equipment: serializeQuoteEquipment(equipment),
            availabilityWarning
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/orcamentos/equipamentos/:id/liberar', requireQuoteAccess, async (req, res) => {
    const equipmentId = Number(req.params.id);
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        return res.status(400).json({ error: 'Equipamento inválido.' });
    }

    try {
        const equipment = await getQuoteEquipment(equipmentId);
        if (!equipment) {
            return res.status(404).json({ error: 'Equipamento não encontrado.' });
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
                    (
                        SELECT destination_type
                        FROM quote_operational_destinations
                        WHERE quote_id = quotes.id
                    ) AS destinationType,
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

function sanitizeQuotePdfFilenamePart(value, fallback) {
    const sanitized = String(value ?? '')
        .normalize('NFC')
        .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/g, '')
        .trim();
    return sanitized || fallback;
}

function getQuotePdfEventDate(value) {
    const range = getQuoteDateRangeFromText(value);
    const directDateKey = parseIsoDateKey(String(value || '').trim().slice(0, 10));
    const dateKey = range?.start || directDateKey;
    if (!dateKey) return 'sem-data';
    const [year, month, day] = dateKey.split('-');
    return `${day}-${month}-${year}`;
}

function buildQuotePdfFilename(quote = {}) {
    const eventName = sanitizeQuotePdfFilenamePart(
        quote.eventName ?? quote.event_name,
        'Evento'
    );
    const clientName = sanitizeQuotePdfFilenamePart(
        quote.clientName ?? quote.client_name,
        'Cliente'
    );
    const eventDate = getQuotePdfEventDate(
        quote.eventDatetime ?? quote.event_datetime
    );
    return `${eventName} - ${clientName} - ${eventDate}.pdf`;
}

function encodeContentDispositionFilename(value) {
    return encodeURIComponent(value).replace(
        /['()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
}

function buildQuotePdfContentDisposition(quote = {}) {
    const filename = buildQuotePdfFilename(quote);
    const fallbackFilename = filename
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7e]/g, '')
        .replace(/["\\]/g, '')
        .trim() || 'orcamento.pdf';
    return `inline; filename="${fallbackFilename}"; filename*=UTF-8''${encodeContentDispositionFilename(filename)}`;
}

function getQuoteOperationalRange(quote = {}) {
    const assemblyRange = getQuoteDateRangeFromText(
        quote.assemblyDatetime ?? quote.assembly_datetime
    );
    const eventRange = getQuoteDateRangeFromText(
        quote.eventDatetime ?? quote.event_datetime
    );
    const disassemblyRange = getQuoteDateRangeFromText(
        quote.disassemblyDatetime ?? quote.disassembly_datetime
    );

    if (!assemblyRange || !eventRange || !disassemblyRange) return null;
    if (assemblyRange.start > eventRange.start || disassemblyRange.end < eventRange.end) return null;
    return createDateRange(assemblyRange.start, disassemblyRange.end);
}

function getDateKeysFromRange(range) {
    if (!range) return [];
    const keys = [];
    let cursor = range.start;
    let guard = 0;
    while (cursor && cursor <= range.end && guard < 3700) {
        keys.push(cursor);
        cursor = addDaysToDateKey(cursor, 1);
        guard += 1;
    }
    return keys;
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

function getCapacityAllocationKey(quoteId, eventId) {
    const normalizedQuoteId = Number(quoteId);
    if (Number.isInteger(normalizedQuoteId) && normalizedQuoteId > 0) {
        return `quote:${normalizedQuoteId}`;
    }
    return `event:${Number(eventId) || 0}`;
}

function ensureCapacityGroup(groups, name) {
    const normalizedName = cleanText(name, 300) || 'Equipamento';
    const key = getQuoteEquipmentNameKey(normalizedName);
    if (!groups.has(key)) {
        groups.set(key, {
            key,
            name: normalizedName,
            totalQuantity: 0,
            allocations: new Map()
        });
    }
    return groups.get(key);
}

function ensureCapacityAllocation(group, details) {
    const key = getCapacityAllocationKey(details.quoteId, details.eventId);
    if (!group.allocations.has(key)) {
        group.allocations.set(key, {
            key,
            quoteId: Number(details.quoteId) || null,
            eventId: Number(details.eventId) || null,
            eventName: cleanText(details.eventName, 200) || 'Reserva existente',
            quoteStatus: cleanText(details.quoteStatus, 30).toLowerCase() || (Number(details.quoteId) > 0 ? 'pending' : 'confirmed'),
            range: details.range,
            requestedQuantity: 0,
            actualEquipmentIds: new Set()
        });
    }
    const allocation = group.allocations.get(key);
    if (!allocation.range && details.range) allocation.range = details.range;
    if (!allocation.eventId && Number(details.eventId)) allocation.eventId = Number(details.eventId);
    if (details.quoteStatus) allocation.quoteStatus = cleanText(details.quoteStatus, 30).toLowerCase();
    return allocation;
}

function getCapacityAllocationQuantity(allocation) {
    return Math.max(
        Math.max(0, Number(allocation?.requestedQuantity) || 0),
        allocation?.actualEquipmentIds?.size || 0
    );
}

function isConfirmedCapacityAllocation(allocation) {
    return !Number(allocation?.quoteId) || allocation?.quoteStatus === 'approved';
}

function getCapacityAllocationQuantityForMode(allocation, mode = 'all') {
    if (mode === 'confirmed' && !isConfirmedCapacityAllocation(allocation)) {
        return allocation?.actualEquipmentIds?.size || 0;
    }
    return getCapacityAllocationQuantity(allocation);
}

async function getEquipmentGroupNameVariants(equipmentName) {
    const targetKey = getQuoteEquipmentNameKey(equipmentName);
    if (!targetKey) return [];

    const rows = await dbAll(
        `SELECT name AS groupName
         FROM equipments
         WHERE name IS NOT NULL AND trim(name) <> ''
         UNION
         SELECT description AS groupName
         FROM quote_items
         WHERE equipment_id IS NOT NULL
           AND description IS NOT NULL
           AND trim(description) <> ''`
    );
    const variants = rows
        .map((row) => String(row.groupName ?? ''))
        .filter((name) => name.trim() && getQuoteEquipmentNameKey(name) === targetKey);
    variants.push(String(equipmentName ?? ''));
    return [...new Set(variants.filter((name) => name.trim()))];
}

async function buildEquipmentGroupCapacity(currentRange, options = {}) {
    const groups = new Map();
    if (!currentRange) return groups;

    const excludeQuoteId = Number(options.excludeQuoteId);
    const targetNames = options.equipmentName
        ? await getEquipmentGroupNameVariants(options.equipmentName)
        : [];
    const targetNamesJson = targetNames.length ? JSON.stringify(targetNames) : '';
    const targetEquipmentClause = targetNamesJson
        ? 'WHERE name IN (SELECT CAST(value AS TEXT) FROM json_each(?))'
        : '';
    const targetQuoteClause = targetNamesJson
        ? `AND COALESCE(equipments.name, quote_items.description) IN (
               SELECT CAST(value AS TEXT) FROM json_each(?)
           )`
        : '';
    const targetReservedClause = targetNamesJson
        ? `AND reserved.equipment_id IN (
               SELECT id
               FROM equipments
               WHERE name IN (SELECT CAST(value AS TEXT) FROM json_each(?))
           )`
        : '';
    const targetMovementClause = targetNamesJson
        ? `AND equipment_events.equipment_id IN (
               SELECT id
               FROM equipments
               WHERE name IN (SELECT CAST(value AS TEXT) FROM json_each(?))
           )`
        : '';
    const equipmentParams = targetNamesJson ? [targetNamesJson] : [];
    const quoteParams = targetNamesJson ? [targetNamesJson] : [];
    const reservedParams = targetNamesJson ? [targetNamesJson] : [];
    const movementParams = targetNamesJson ? [targetNamesJson] : [];
    const quoteExcludeClause = Number.isInteger(excludeQuoteId) && excludeQuoteId > 0
        ? 'AND quotes.id <> ?'
        : '';
    if (quoteExcludeClause) quoteParams.push(excludeQuoteId);

    const [equipmentRows, quoteRows, reservedRows, movementRows] = await Promise.all([
        dbAll(
            `SELECT id, name, current_status AS currentStatus
             FROM equipments
             ${targetEquipmentClause}`,
            equipmentParams
        ),
        dbAll(
            `SELECT quotes.id AS quoteId,
                    COALESCE(quotes.status, 'pending') AS quoteStatus,
                    quotes.event_name AS eventName,
                    quotes.assembly_datetime AS assemblyDatetime,
                    quotes.event_datetime AS eventDatetime,
                    quotes.disassembly_datetime AS disassemblyDatetime,
                    events.id AS eventId,
                    quote_items.quantity,
                    quote_items.description,
                    equipments.name AS equipmentName
             FROM quote_items
             INNER JOIN quotes ON quotes.id = quote_items.quote_id
             LEFT JOIN equipments ON equipments.id = quote_items.equipment_id
             LEFT JOIN events ON events.orcamento_id = quotes.id
              WHERE quote_items.equipment_id IS NOT NULL
                AND COALESCE(quote_items.is_manual, 0) = 0
                ${targetQuoteClause}
                ${quoteExcludeClause}`,
            quoteParams
        ),
        dbAll(
            `SELECT DISTINCT events.id AS eventId,
                    events.orcamento_id AS quoteId,
                    events.name AS eventName,
                    events.date,
                    events.end_date,
                    events.event_type,
                    events.withdrawal_date,
                    events.return_date,
                    reserved.equipment_id AS equipmentId,
                    equipments.name AS equipmentName
             FROM event_reserved_equipments reserved
             INNER JOIN events ON events.id = reserved.event_id
              INNER JOIN equipments ON equipments.id = reserved.equipment_id
              WHERE reserved.quote_item_id IS NULL
                AND NOT EXISTS (
                    SELECT 1 FROM equipment_events history
                    WHERE history.event_id = reserved.event_id
                      AND history.equipment_id = reserved.equipment_id
                )
                ${targetReservedClause}`,
            reservedParams
        ),
        dbAll(
            `SELECT DISTINCT events.id AS eventId,
                    events.orcamento_id AS quoteId,
                    events.name AS eventName,
                    events.date,
                    events.end_date,
                    events.event_type,
                    events.withdrawal_date,
                    events.return_date,
                    equipment_events.equipment_id AS equipmentId,
                    equipments.name AS equipmentName
             FROM equipment_events
             INNER JOIN events ON events.id = equipment_events.event_id
              INNER JOIN equipments ON equipments.id = equipment_events.equipment_id
              WHERE equipment_events.action_type = 'saida'
                AND (
                    SELECT COALESCE(SUM(CASE WHEN ledger.action_type = 'saida' THEN 1 ELSE -1 END), 0)
                    FROM equipment_events ledger
                    WHERE ledger.event_id = equipment_events.event_id
                      AND ledger.equipment_id = equipment_events.equipment_id
                ) > 0
                ${targetMovementClause}`,
            movementParams
        )
    ]);

    for (const equipment of equipmentRows) {
        if (!isQuoteEquipmentUsableStatus(equipment.currentStatus)) continue;
        ensureCapacityGroup(groups, equipment.name).totalQuantity += 1;
    }

    const quoteMetadata = new Map();
    for (const row of quoteRows) {
        const range = getQuoteOperationalRange(row);
        if (!range || !rangesOverlap(currentRange, range)) continue;
        const quoteId = Number(row.quoteId);
        quoteMetadata.set(quoteId, {
            quoteId,
            eventId: Number(row.eventId) || null,
            eventName: row.eventName,
            quoteStatus: row.quoteStatus,
            range
        });
        const group = ensureCapacityGroup(groups, row.equipmentName || row.description);
        const allocation = ensureCapacityAllocation(group, {
            quoteId,
            eventId: row.eventId,
            eventName: row.eventName,
            quoteStatus: row.quoteStatus,
            range
        });
        allocation.requestedQuantity += Math.max(1, Number.parseInt(row.quantity, 10) || 1);
    }

    const seenActual = new Set();
    const mergeActualRow = (row) => {
        const eventId = Number(row.eventId);
        const quoteId = Number(row.quoteId);
        const equipmentId = Number(row.equipmentId);
        if (!eventId || !equipmentId) return;
        if (Number.isInteger(excludeQuoteId) && excludeQuoteId > 0 && quoteId === excludeQuoteId) return;

        const actualKey = `${eventId}:${equipmentId}`;
        if (seenActual.has(actualKey)) return;
        seenActual.add(actualKey);
        const quote = quoteMetadata.get(quoteId);
        const range = quote?.range || getEventDateRange(row);
        if (!range || !rangesOverlap(currentRange, range)) return;

        const group = ensureCapacityGroup(groups, row.equipmentName);
        const allocation = ensureCapacityAllocation(group, {
            quoteId: quote?.quoteId || quoteId,
            eventId,
            eventName: quote?.eventName || row.eventName,
            quoteStatus: quote?.quoteStatus || (quoteId ? 'approved' : 'confirmed'),
            range
        });
        allocation.actualEquipmentIds.add(equipmentId);
    };
    reservedRows.forEach(mergeActualRow);
    movementRows.forEach(mergeActualRow);

    return groups;
}

function getGroupCapacityForNewReservation(group, currentRange, mode = 'all') {
    if (!group || !currentRange) return 0;
    let minimumBalance = Number.POSITIVE_INFINITY;
    for (const date of getDateKeysFromRange(currentRange)) {
        let committed = 0;
        for (const allocation of group.allocations.values()) {
            if (allocation.range?.start <= date && allocation.range?.end >= date) {
                committed += getCapacityAllocationQuantityForMode(allocation, mode);
            }
        }
        minimumBalance = Math.min(minimumBalance, group.totalQuantity - committed);
    }
    return Number.isFinite(minimumBalance) ? Math.max(0, minimumBalance) : 0;
}

function getGroupCapacitySnapshot(group, currentRange) {
    const totalQuantity = Math.max(0, Number(group?.totalQuantity) || 0);
    const confirmedAvailableQuantity = getGroupCapacityForNewReservation(group, currentRange, 'confirmed');
    const forecastAvailableQuantity = getGroupCapacityForNewReservation(group, currentRange, 'all');
    return {
        totalQuantity,
        confirmedAvailableQuantity,
        forecastAvailableQuantity,
        confirmedCommittedQuantity: Math.max(0, totalQuantity - confirmedAvailableQuantity),
        forecastCommittedQuantity: Math.max(0, totalQuantity - forecastAvailableQuantity)
    };
}

function calculatePlanningAvailability(requestedQuantity, confirmedAvailableQuantity, forecastAvailableQuantity) {
    const requested = Math.max(0, Number(requestedQuantity) || 0);
    const confirmedAvailable = Math.max(0, Number(confirmedAvailableQuantity) || 0);
    const forecastAvailable = Math.max(0, Number(forecastAvailableQuantity) || 0);
    return {
        requestedQuantity: requested,
        confirmedAvailableQuantity: confirmedAvailable,
        forecastAvailableQuantity: forecastAvailable,
        confirmedDeficit: Math.max(0, requested - confirmedAvailable),
        forecastDeficit: Math.max(0, requested - forecastAvailable)
    };
}

function getGroupCapacityForEvent(group, event, currentRange, mode = 'all') {
    if (!group || !event || !currentRange) return 0;
    const allocationKey = getCapacityAllocationKey(event.orcamento_id ?? event.orcamentoId, event.id);
    const currentAllocation = group.allocations.get(allocationKey);
    const currentActual = currentAllocation?.actualEquipmentIds?.size || 0;
    let available = Number.POSITIVE_INFINITY;

    for (const date of getDateKeysFromRange(currentRange)) {
        let committedByOthers = 0;
        for (const allocation of group.allocations.values()) {
            if (allocation.key === allocationKey) continue;
            if (allocation.range?.start <= date && allocation.range?.end >= date) {
                committedByOthers += getCapacityAllocationQuantityForMode(allocation, mode);
            }
        }
        available = Math.min(available, group.totalQuantity - committedByOthers - currentActual);
    }
    return Number.isFinite(available) ? Math.max(0, available) : 0;
}

function getCapacityBlockingEventNames(group, currentRange, currentEvent = null) {
    const currentKey = currentEvent
        ? getCapacityAllocationKey(currentEvent.orcamento_id ?? currentEvent.orcamentoId, currentEvent.id)
        : '';
    return [...new Set(Array.from(group?.allocations?.values?.() || [])
        .filter((allocation) => allocation.key !== currentKey && rangesOverlap(currentRange, allocation.range))
        .filter((allocation) => Number(allocation.quoteId) > 0 && getCapacityAllocationQuantity(allocation) > 0)
        .map((allocation) => allocation.eventName)
        .filter(Boolean))];
}

async function findEquipmentGroupCapacityConflict(equipment, event) {
    const currentRange = getEventDateRange(event);
    if (!equipment || !currentRange) return null;
    const groups = await buildEquipmentGroupCapacity(currentRange, {
        equipmentName: equipment.name
    });
    const group = groups.get(getQuoteEquipmentNameKey(equipment.name));
    if (!group) return null;
    const currentKey = getCapacityAllocationKey(event.orcamento_id ?? event.orcamentoId, event.id);
    const currentAllocation = group.allocations.get(currentKey);
    const currentRequested = Math.max(0, Number(currentAllocation?.requestedQuantity) || 0);
    const currentActual = currentAllocation?.actualEquipmentIds?.size || 0;
    const committedBefore = Math.max(currentRequested, currentActual);
    const committedAfter = Math.max(currentRequested, currentActual + 1);
    if (committedAfter <= committedBefore) return null;

    const affectedDemands = [];
    for (const allocation of group.allocations.values()) {
        if (allocation.key === currentKey || !rangesOverlap(currentRange, allocation.range)) continue;
        const necessaryQuantity = getCapacityAllocationQuantity(allocation);
        if (necessaryQuantity <= 0) continue;
        let availableBefore = Number.POSITIVE_INFINITY;
        let availableAfter = Number.POSITIVE_INFINITY;
        for (const date of getDateKeysFromRange(allocation.range)) {
            let otherCommitments = 0;
            for (const other of group.allocations.values()) {
                if (other.key === allocation.key || other.key === currentKey) continue;
                if (other.range?.start <= date && other.range?.end >= date) {
                    otherCommitments += getCapacityAllocationQuantity(other);
                }
            }
            const currentOverlapsDate = currentRange.start <= date && currentRange.end >= date;
            availableBefore = Math.min(availableBefore, group.totalQuantity - otherCommitments - (currentOverlapsDate ? committedBefore : 0));
            availableAfter = Math.min(availableAfter, group.totalQuantity - otherCommitments - (currentOverlapsDate ? committedAfter : 0));
        }
        const deficitBefore = Math.max(0, necessaryQuantity - Math.max(0, availableBefore));
        const deficitAfter = Math.max(0, necessaryQuantity - Math.max(0, availableAfter));
        if (deficitAfter <= deficitBefore) continue;
        affectedDemands.push({
            eventId: allocation.eventId,
            quoteId: allocation.quoteId,
            eventName: allocation.eventName,
            demandType: isConfirmedCapacityAllocation(allocation) ? 'confirmed' : 'forecast',
            necessaryQuantity,
            availableAfterCheckout: Math.max(0, availableAfter),
            deficitBefore,
            deficitAfter,
            start: allocation.range?.start || '',
            end: allocation.range?.end || '',
            startLabel: allocation.range?.startLabel || '-',
            endLabel: allocation.range?.endLabel || '-'
        });
    }
    if (!affectedDemands.length) return null;

    const firstAffected = affectedDemands[0];
    return {
        type: 'future_availability_warning',
        equipmentId: Number(equipment.id) || null,
        equipmentName: equipment.name || 'Equipamento',
        totalQuantity: Number(group?.totalQuantity) || 0,
        availableQuantity: firstAffected.availableAfterCheckout,
        deficit: firstAffected.deficitAfter,
        blockingEventName: firstAffected.eventName || 'Demanda no mesmo período',
        blockingEventNames: affectedDemands.map((item) => item.eventName).filter(Boolean),
        affectedDemands,
        currentStart: currentRange.start,
        currentEnd: currentRange.end,
        currentStartLabel: currentRange.startLabel,
        currentEndLabel: currentRange.endLabel
    };
}

async function getEventEquipmentRequirements(eventId) {
    const event = await dbGet(
        `SELECT * FROM events WHERE id = ?`,
        [Number(eventId)]
    );
    const quoteId = Number(event?.orcamento_id || event?.quoteId);
    if (!event || !quoteId) return [];

    const [requestedRows, movementRows, inventoryRows] = await Promise.all([
        dbAll(
            `SELECT quote_items.quantity,
                    COALESCE(NULLIF(TRIM(equipments.category), ''), quote_items.category) AS topicName,
                    quote_items.description,
                    equipments.name AS equipmentName
             FROM quote_items
             LEFT JOIN equipments ON equipments.id = quote_items.equipment_id
             WHERE quote_items.quote_id = ?
               AND quote_items.equipment_id IS NOT NULL
               AND COALESCE(quote_items.is_manual, 0) = 0
             ORDER BY quote_items.sort_order ASC, quote_items.id ASC`,
            [quoteId]
        ),
        dbAll(
            `SELECT equipment_events.equipment_id AS equipmentId,
                    equipments.name AS equipmentName,
                    equipments.category AS topicName,
                    SUM(CASE WHEN equipment_events.action_type = 'saida' THEN 1 ELSE -1 END) AS activeBalance,
                    SUM(CASE WHEN equipment_events.action_type = 'saida' THEN 1 ELSE 0 END) AS totalOutgoing
             FROM equipment_events
             INNER JOIN equipments ON equipments.id = equipment_events.equipment_id
             WHERE equipment_events.event_id = ?
             GROUP BY equipment_events.equipment_id, equipments.name`,
            [Number(eventId)]
        ),
        dbAll(
            `SELECT equipments.id,
                    equipments.name,
                    equipments.category AS topicName,
                    equipments.current_status AS currentStatus,
                    EXISTS (
                        SELECT 1 FROM maintenances
                        WHERE maintenances.equipment_id = equipments.id
                          AND maintenances.resolved_at IS NULL
                    ) AS maintenanceOpen,
                    COALESCE((
                        SELECT SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END)
                        FROM equipment_events
                        WHERE equipment_events.equipment_id = equipments.id
                    ), 0) AS activeBalance
             FROM equipments`
        )
    ]);

    const requirements = new Map();
    const requirementsByEquipmentName = new Map();
    for (const row of requestedRows) {
        const name = (cleanText(row.topicName, 300) || 'OUTROS').toLocaleUpperCase('pt-BR');
        const key = getQuoteEquipmentNameKey(name);
        const equipmentNameKey = getQuoteEquipmentNameKey(row.equipmentName || row.description);
        if (!requirements.has(key)) {
            requirements.set(key, {
                name,
                requestedQuantity: 0,
                equipmentNameKeys: new Set(),
                separatedEquipmentIds: new Set(),
                historicalOutgoingEquipmentIds: new Set()
            });
        }
        const requirement = requirements.get(key);
        requirement.requestedQuantity += Math.max(1, Number.parseInt(row.quantity, 10) || 1);
        if (equipmentNameKey) {
            requirement.equipmentNameKeys.add(equipmentNameKey);
            if (!requirementsByEquipmentName.has(equipmentNameKey)) {
                requirementsByEquipmentName.set(equipmentNameKey, requirement);
            }
        }
    }
    for (const row of movementRows) {
        const topicKey = getQuoteEquipmentNameKey(row.topicName);
        const equipmentNameKey = getQuoteEquipmentNameKey(row.equipmentName);
        const requirement = requirements.get(topicKey) || requirementsByEquipmentName.get(equipmentNameKey);
        if (!requirement) continue;
        if (Number(row.totalOutgoing) > 0) requirement.historicalOutgoingEquipmentIds.add(Number(row.equipmentId));
        if (Number(row.activeBalance) > 0) requirement.separatedEquipmentIds.add(Number(row.equipmentId));
    }

    const inventoryByTopic = new Map();
    for (const row of inventoryRows) {
        const key = getQuoteEquipmentNameKey(row.topicName || 'OUTROS');
        if (!inventoryByTopic.has(key)) inventoryByTopic.set(key, { usable: 0, warehouse: 0 });
        const stock = inventoryByTopic.get(key);
        const excluded = Number(row.maintenanceOpen) === 1 || isInactiveEquipmentStatus(row.currentStatus) || isMaintenanceStatus(row.currentStatus);
        if (!excluded) stock.usable += 1;
        if (!excluded && Number(row.activeBalance) <= 0 && !isPhysicallyUnavailableEquipmentStatus(row.currentStatus)) {
            stock.warehouse += 1;
        }
    }

    const currentRange = getEventDateRange(event);
    const capacityGroups = currentRange ? await buildEquipmentGroupCapacity(currentRange) : new Map();

    return Array.from(requirements.values())
        .map((requirement) => {
            const separatedQuantity = requirement.separatedEquipmentIds.size;
            const stock = inventoryByTopic.get(getQuoteEquipmentNameKey(requirement.name)) || { usable: 0, warehouse: 0 };
            const availability = calculateRequirementAvailability(
                requirement.requestedQuantity,
                separatedQuantity,
                stock.warehouse
            );
            let confirmedFutureAvailableQuantity = 0;
            let forecastFutureAvailableQuantity = 0;
            for (const equipmentNameKey of requirement.equipmentNameKeys) {
                const capacityGroup = capacityGroups.get(equipmentNameKey);
                confirmedFutureAvailableQuantity += currentRange
                    ? getGroupCapacityForEvent(capacityGroup, event, currentRange, 'confirmed')
                    : 0;
                forecastFutureAvailableQuantity += currentRange
                    ? getGroupCapacityForEvent(capacityGroup, event, currentRange, 'all')
                    : 0;
            }
            if (!currentRange || requirement.equipmentNameKeys.size === 0) {
                confirmedFutureAvailableQuantity = stock.warehouse;
                forecastFutureAvailableQuantity = stock.warehouse;
            }
            return {
                name: requirement.name,
                equipmentNameKeys: Array.from(requirement.equipmentNameKeys),
                requestedQuantity: requirement.requestedQuantity,
                outgoingQuantity: availability.separatedQuantity,
                separatedQuantity: availability.separatedQuantity,
                historicalOutgoingQuantity: requirement.historicalOutgoingEquipmentIds.size,
                pendingQuantity: availability.pendingQuantity,
                warehouseAvailableQuantity: availability.warehouseAvailableQuantity,
                usableStockQuantity: stock.usable,
                deficit: availability.deficit,
                confirmedFutureAvailableQuantity,
                forecastFutureAvailableQuantity,
                predictedDeficit: Math.max(0, availability.pendingQuantity - forecastFutureAvailableQuantity),
                extraQuantity: availability.extraQuantity,
                completed: availability.pendingQuantity === 0
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function createDateConflictResponse({ equipment, currentRange, reservation }) {
    return {
        type: 'date_conflict',
        equipmentId: Number(equipment?.id || reservation?.equipmentId || 0) || null,
        equipmentName: equipment?.name || reservation?.equipmentName || 'Patrimônio',
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
    if (conflict?.type === 'group_capacity') {
        return res.status(409).json({
            code: 'QUOTE_CAPACITY_PROTECTED',
            error: `Quantidade insuficiente de "${conflict.equipmentName || 'equipamento'}" para este período. Disponível: ${Number(conflict.availableQuantity) || 0}.`,
            conflict
        });
    }
    return res.status(409).json({
        code: 'DATE_CONFLICT',
        error: 'Patrimônio indisponível por conflito de datas.',
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

    const excludeEventId = Number(options.excludeEventId);

    const reservedEventParams = [normalizedEquipmentId];
    let reservedEventExcludeClause = '';
    if (Number.isInteger(excludeEventId) && excludeEventId > 0) {
        reservedEventExcludeClause = 'AND events.id <> ?';
        reservedEventParams.push(excludeEventId);
    }

    const eventParams = [normalizedEquipmentId];
    let eventExcludeClause = '';
    if (Number.isInteger(excludeEventId) && excludeEventId > 0) {
        eventExcludeClause = 'AND events.id <> ?';
        eventParams.push(excludeEventId);
    }

    const [reservedEventRows, eventReservations] = await Promise.all([
        dbAll(
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
           AND (events.orcamento_id IS NULL OR reserved.quote_item_id IS NULL)
           AND NOT EXISTS (
               SELECT 1 FROM equipment_events history
               WHERE history.event_id = reserved.event_id
                 AND history.equipment_id = reserved.equipment_id
           )
           ${reservedEventExcludeClause}
         ORDER BY events.date DESC, events.id DESC`,
            reservedEventParams
        ),
        dbAll(
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
           AND (
               SELECT COALESCE(SUM(CASE WHEN ledger.action_type = 'saida' THEN 1 ELSE -1 END), 0)
               FROM equipment_events ledger
               WHERE ledger.event_id = equipment_events.event_id
                 AND ledger.equipment_id = equipment_events.equipment_id
           ) > 0
           ${eventExcludeClause}
         ORDER BY events.date DESC, events.id DESC`,
            eventParams
        )
    ]);

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

async function findUnavailableEquipmentIds(equipmentIds, currentRange, options = {}) {
    const normalizedIds = [...new Set((equipmentIds || [])
        .map(Number)
        .filter((equipmentId) => Number.isInteger(equipmentId) && equipmentId > 0))];
    const unavailableIds = new Set();
    if (!normalizedIds.length || !currentRange) return unavailableIds;

    const selectedEquipmentJson = JSON.stringify(normalizedIds);
    const excludeEventId = Number(options.excludeEventId);
    const eventExcludeClause = Number.isInteger(excludeEventId) && excludeEventId > 0
        ? 'AND events.id <> ?'
        : '';
    const reservedParams = [selectedEquipmentJson];
    const movementParams = [selectedEquipmentJson];
    if (eventExcludeClause) {
        reservedParams.push(excludeEventId);
        movementParams.push(excludeEventId);
    }

    const [reservedEvents, movementEvents] = await Promise.all([
        dbAll(
            `SELECT DISTINCT reserved.equipment_id AS equipmentId,
                    events.date,
                    events.end_date,
                    events.event_type,
                    events.withdrawal_date,
                    events.return_date
             FROM event_reserved_equipments reserved
             INNER JOIN events ON events.id = reserved.event_id
             WHERE reserved.equipment_id IN (
                 SELECT CAST(value AS INTEGER) FROM json_each(?)
             )
               AND (events.orcamento_id IS NULL OR reserved.quote_item_id IS NULL)
               AND NOT EXISTS (
                   SELECT 1 FROM equipment_events history
                   WHERE history.event_id = reserved.event_id
                     AND history.equipment_id = reserved.equipment_id
               )
               ${eventExcludeClause}`,
            reservedParams
        ),
        dbAll(
            `SELECT DISTINCT equipment_events.equipment_id AS equipmentId,
                    events.date,
                    events.end_date,
                    events.event_type,
                    events.withdrawal_date,
                    events.return_date
             FROM equipment_events
             INNER JOIN events ON events.id = equipment_events.event_id
             WHERE equipment_events.equipment_id IN (
                 SELECT CAST(value AS INTEGER) FROM json_each(?)
             )
               AND equipment_events.action_type = 'saida'
               AND (
                   SELECT COALESCE(SUM(CASE WHEN ledger.action_type = 'saida' THEN 1 ELSE -1 END), 0)
                   FROM equipment_events ledger
                   WHERE ledger.event_id = equipment_events.event_id
                     AND ledger.equipment_id = equipment_events.equipment_id
               ) > 0
               ${eventExcludeClause}`,
            movementParams
        )
    ]);

    for (const reservation of [...reservedEvents, ...movementEvents]) {
        const range = getEventDateRange(reservation);
        if (range && rangesOverlap(currentRange, range)) unavailableIds.add(Number(reservation.equipmentId));
    }

    return unavailableIds;
}

async function findQuoteItemsAvailabilityWarnings(items, currentRange, options = {}) {
    const requestedByName = new Map();
    for (const item of items || []) {
        const equipmentId = Number(item?.equipmentId);
        if (!Number.isInteger(equipmentId) || equipmentId <= 0) continue;
        const name = cleanText(item.description, 300) || 'Equipamento';
        const key = getQuoteEquipmentNameKey(name);
        if (!requestedByName.has(key)) requestedByName.set(key, { name, quantity: 0 });
        requestedByName.get(key).quantity += Math.max(1, Number.parseInt(item.quantity, 10) || 1);
    }
    if (!requestedByName.size || !currentRange) return [];

    const groups = await buildEquipmentGroupCapacity(currentRange, {
        excludeQuoteId: options.excludeQuoteId
    });
    const warnings = [];
    for (const [key, requested] of requestedByName) {
        const group = groups.get(key);
        const confirmedAvailableQuantity = getGroupCapacityForNewReservation(group, currentRange, 'confirmed');
        const forecastAvailableQuantity = getGroupCapacityForNewReservation(group, currentRange, 'all');
        const availability = calculatePlanningAvailability(
            requested.quantity,
            confirmedAvailableQuantity,
            forecastAvailableQuantity
        );
        const { confirmedDeficit, forecastDeficit } = availability;
        if (confirmedDeficit === 0 && forecastDeficit === 0) continue;
        const blockingEventNames = getCapacityBlockingEventNames(group, currentRange);
        warnings.push({
            type: 'availability_warning',
            equipmentName: requested.name,
            totalQuantity: Number(group?.totalQuantity) || 0,
            requestedQuantity: requested.quantity,
            availableQuantity: forecastAvailableQuantity,
            confirmedAvailableQuantity,
            forecastAvailableQuantity,
            confirmedDeficit,
            forecastDeficit,
            deficit: forecastDeficit,
            blockingEventName: blockingEventNames[0] || '',
            blockingEventNames,
            currentStart: currentRange.start,
            currentEnd: currentRange.end,
            currentStartLabel: currentRange.startLabel,
            currentEndLabel: currentRange.endLabel
        });
    }
    return warnings;
}

async function findQuoteItemsDateConflict(items, currentRange, options = {}) {
    const warnings = await findQuoteItemsAvailabilityWarnings(items, currentRange, options);
    return warnings[0] || null;
}

async function findQuoteItemsLegacyDateConflict(items, currentRange, options = {}) {
    for (const item of items) {
        const equipmentId = Number(item?.equipmentId);
        if (!Number.isInteger(equipmentId) || equipmentId <= 0) continue;

        const conflict = await findEquipmentDateConflict(equipmentId, currentRange, {
            excludeQuoteId: options.excludeQuoteId,
            excludeEventId: options.excludeEventId
        });
        if (conflict) return conflict;
    }

    return null;
}

async function linkQuoteEquipmentsToEvent(quoteId, eventId) {
    await dbRun(
        `UPDATE event_reserved_equipments
         SET quote_item_id = NULL
         WHERE event_id = ?
           AND quote_item_id IS NOT NULL
           AND EXISTS (
               SELECT 1
               FROM equipment_events
               WHERE equipment_events.event_id = event_reserved_equipments.event_id
                 AND equipment_events.equipment_id = event_reserved_equipments.equipment_id
                 AND equipment_events.action_type = 'saida'
           )`,
        [eventId]
    );
    await dbRun(
        `DELETE FROM event_reserved_equipments
         WHERE event_id = ? AND quote_item_id IS NOT NULL`,
        [eventId]
    );
}

function getOperationalEventMetadata(destinationType, range) {
    const eventType = normalizeQuoteOperationalDestination(destinationType) || 'event';
    const isRental = eventType === 'rental';
    return {
        eventType,
        date: range.start,
        endDate: range.end,
        withdrawalDate: isRental ? range.start : null,
        returnDate: isRental ? range.end : null
    };
}

async function ensureAutomaticScheduledEvents(options = {}) {
    const today = getTodayDateInput();
    const requestedQuoteId = Number(options.quoteId);
    const hasRequestedQuote = Number.isInteger(requestedQuoteId) && requestedQuoteId > 0;

    const quotes = await dbAll(
        `SELECT quotes.id,
                quotes.event_name AS eventName,
                quotes.event_datetime AS eventDatetime,
                quotes.assembly_datetime AS assemblyDatetime,
                quotes.disassembly_datetime AS disassemblyDatetime,
                quotes.created_by_username AS createdByUsername,
                COALESCE(destinations.destination_type, 'event') AS destinationType,
                events.id AS eventId,
                events.name AS currentEventName,
                events.date AS currentEventDate,
                events.end_date AS currentEventEndDate,
                COALESCE(events.event_type, 'event') AS currentEventType,
                events.withdrawal_date AS currentWithdrawalDate,
                events.return_date AS currentReturnDate,
                (
                    SELECT COUNT(*) FROM equipment_events WHERE event_id = events.id
                ) + (
                    SELECT COUNT(*) FROM cable_event_movements WHERE event_id = events.id
                ) + (
                    SELECT COUNT(*) FROM other_item_event_movements WHERE event_id = events.id
                ) + (
                    SELECT COUNT(*) FROM quote_manual_item_movements WHERE event_id = events.id
                ) AS movementCount
         FROM quotes
         LEFT JOIN quote_operational_destinations destinations
                ON destinations.quote_id = quotes.id
         LEFT JOIN events ON events.orcamento_id = quotes.id
         WHERE COALESCE(quotes.status, 'pending') = 'approved'
           ${hasRequestedQuote ? 'AND quotes.id = ?' : ''}
         ORDER BY quotes.approved_at ASC, quotes.id ASC`,
        hasRequestedQuote ? [requestedQuoteId] : []
    );

    for (const quote of quotes) {
        const range = getQuoteOperationalRange(quote);
        if (!range) continue;
        const metadata = getOperationalEventMetadata(quote.destinationType, range);

        if (Number(quote.eventId) > 0) {
            const expectedName = quote.eventName || `Orçamento ${quote.id}`;
            const eventMetadataChanged = String(quote.currentEventName || '') !== String(expectedName)
                || String(quote.currentEventDate || '') !== String(metadata.date)
                || String(quote.currentEventEndDate || '') !== String(metadata.endDate)
                || String(quote.currentEventType || 'event') !== String(metadata.eventType)
                || String(quote.currentWithdrawalDate || '') !== String(metadata.withdrawalDate || '')
                || String(quote.currentReturnDate || '') !== String(metadata.returnDate || '');
            if (Number(quote.movementCount) === 0 && eventMetadataChanged) {
                await dbRun(
                    `UPDATE events
                     SET name = ?, date = ?, end_date = ?, event_type = ?, withdrawal_date = ?, return_date = ?
                     WHERE id = ?`,
                    [
                        expectedName,
                        metadata.date,
                        metadata.endDate,
                        metadata.eventType,
                        metadata.withdrawalDate,
                        metadata.returnDate,
                        Number(quote.eventId)
                    ]
                );
            }
            await linkQuoteEquipmentsToEvent(Number(quote.id), Number(quote.eventId));
            continue;
        }

        if (!hasRequestedQuote && range.end < today) continue;

        const result = await dbRun(
            `INSERT OR IGNORE INTO events (
                name,
                date,
                end_date,
                created_by_username,
                event_type,
                withdrawal_date,
                return_date,
                orcamento_id,
                auto_created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                quote.eventName || `Orçamento ${quote.id}`,
                metadata.date,
                metadata.endDate,
                quote.createdByUsername || 'sistema',
                metadata.eventType,
                metadata.withdrawalDate,
                metadata.returnDate,
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

    await dbRun(
        `UPDATE event_reserved_equipments
         SET quote_item_id = NULL
         WHERE quote_item_id IS NOT NULL
           AND EXISTS (
               SELECT 1
               FROM equipment_events
               WHERE equipment_events.event_id = event_reserved_equipments.event_id
                 AND equipment_events.equipment_id = event_reserved_equipments.equipment_id
                 AND equipment_events.action_type = 'saida'
           )`
    );
    await dbRun('DELETE FROM event_reserved_equipments WHERE quote_item_id IS NOT NULL');
}

app.get('/api/orcamentos/date-conflicts', requireQuoteAccess, async (req, res) => {
    const date = cleanText(req.query.date, 20);
    const excludeId = Number(req.query.excludeId);
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
        return res.status(400).json({ error: 'Data inválida' });
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
                    assembly_datetime AS assemblyDatetime,
                    disassembly_datetime AS disassemblyDatetime,
                    COALESCE(status, 'pending') AS status
             FROM quotes
             ${excludeClause}
             ORDER BY created_at DESC, id DESC`,
            params
        );
        const conflicts = quotes.filter((quote) => getDateKeysFromRange(getQuoteOperationalRange(quote)).includes(date));

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
        return res.status(400).json({ error: 'Pagamento inválido' });
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
            return res.status(404).json({ error: 'Pagamento não encontrado' });
        }

        if (payment.quoteStatus !== 'approved') {
            return res.status(409).json({ error: 'Somente pagamentos de orçamentos aprovados podem ser marcados como pagos.' });
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
        return res.status(400).json({ error: 'Pagamento inválido' });
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
            return res.status(404).json({ error: 'Pagamento não encontrado' });
        }

        if (payment.quoteStatus !== 'approved') {
            return res.status(409).json({ error: 'Somente pagamentos de orçamentos aprovados podem ser corrigidos.' });
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
    const logisticsPrice = roundMoney(Math.max(0, parseMoneyValue(req.body?.logisticsPrice)));
    const techniciansPrice = roundMoney(Math.max(0, parseMoneyValue(req.body?.techniciansPrice)));
    const subtotal = roundMoney(itemsSubtotal + techniciansSubtotal + logisticsPrice + techniciansPrice);
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
        logisticsPrice,
        techniciansPrice,
        showItemPrices: parseBooleanFlag(req.body?.showItemPrices),
        notes: cleanText(req.body?.notes, 800)
    };

    if (!quote.clientName || !quote.eventName || !quote.eventLocation || !quote.eventDatetime || !quote.assemblyDatetime || !quote.disassemblyDatetime) {
        return res.status(400).json({ error: 'Preencha as informações gerais do orçamento.' });
    }

    if (!quote.paymentMethod || !quote.paymentDeadline) {
        return res.status(400).json({ error: 'Preencha as condições de pagamento.' });
    }

    if (items.length === 0) {
        return res.status(400).json({ error: 'Adicione pelo menos um item ao orçamento.' });
    }

    try {
        const eventRange = getQuoteOperationalRange(quote);
        if (!eventRange) {
            return res.status(400).json({ error: 'Informe Montagem, Evento e Desmontagem em ordem válida.' });
        }

        const availabilityWarnings = await findQuoteItemsAvailabilityWarnings(items, eventRange);

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
                logistics_price,
                technicians_price,
                subtotal,
                final_total,
                show_item_prices,
                notes,
                created_by_username
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                quote.logisticsPrice,
                quote.techniciansPrice,
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
                    is_manual,
                    is_service,
                    service_id,
                    service_width,
                    service_height,
                    category,
                    description,
                    quantity,
                    daily_units,
                    internal_unit_price,
                    internal_total,
                    sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    quoteId,
                    item.equipmentId || null,
                    item.isManual ? 1 : 0,
                    item.isService ? 1 : 0,
                    item.serviceId || null,
                    item.serviceWidth || null,
                    item.serviceHeight || null,
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
        res.json({
            id: quoteId,
            success: true,
            ...(availabilityWarnings.length ? { availabilityWarnings } : {})
        });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/orcamentos/:id/pronto', requireQuoteAccess, async (req, res) => {
    const quoteId = Number(req.params.id);
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        return res.status(400).json({ error: 'Orçamento inválido' });
    }

    try {
        const destinationType = normalizeQuoteOperationalDestination(req.body?.destinationType);
        if (!destinationType) {
            return res.status(400).json({ error: 'Escolha se o orçamento deve virar Evento ou Locação.' });
        }

        const quote = await dbGet('SELECT id, COALESCE(status, "pending") AS status FROM quotes WHERE id = ?', [quoteId]);
        if (!quote) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }

        const quoteWithItems = await getQuoteWithItems(quoteId);
        const availabilityWarnings = await findQuoteItemsAvailabilityWarnings(
            quoteWithItems?.items || [],
            getQuoteOperationalRange(quoteWithItems || {}),
            { excludeQuoteId: quoteId }
        );

        await dbRun('BEGIN TRANSACTION');
        await dbRun(
            `INSERT INTO quote_operational_destinations (
                quote_id, destination_type, selected_by_username, selected_at, updated_at
             ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT(quote_id) DO UPDATE SET
                destination_type = excluded.destination_type,
                selected_by_username = excluded.selected_by_username,
                updated_at = CURRENT_TIMESTAMP`,
            [quoteId, destinationType, req.currentUser?.username || req.session?.username || null]
        );
        await dbRun(
            `UPDATE quotes
             SET status = 'approved',
                 approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [quoteId]
        );
        await dbRun('COMMIT');

        await ensureAutomaticScheduledEvents({ quoteId });

        return res.json({
            success: true,
            id: quoteId,
            status: 'approved',
            destinationType,
            ...(availabilityWarnings.length ? { availabilityWarnings } : {})
        });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        return res.status(500).json({ error: err.message });
    }
});

app.delete('/api/orcamentos/:id', requireQuoteAccess, async (req, res) => {
    const quoteId = Number(req.params.id);
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        return res.status(400).json({ error: 'Orçamento inválido' });
    }

    try {
        const quote = await dbGet('SELECT id FROM quotes WHERE id = ?', [quoteId]);
        if (!quote) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }

        await dbRun('BEGIN TRANSACTION');
        const automaticEvent = await dbGet('SELECT id FROM events WHERE orcamento_id = ?', [quoteId]);
        if (automaticEvent?.id) {
            await deleteEventRecords(Number(automaticEvent.id));
        }
        await releaseScheduledQuoteEquipments(quoteId);
        await dbRun('DELETE FROM quote_operational_destinations WHERE quote_id = ?', [quoteId]);
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
            return res.status(400).json({ error: 'Orçamento inválido' });
        }

        const quote = await getQuoteWithItems(quoteId);
        if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });

        return res.json({ quote });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/orcamentos/:id', requireQuoteAccess, async (req, res) => {
    const quoteId = Number(req.params.id);
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        return res.status(400).json({ error: 'Orçamento inválido' });
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
    const logisticsPrice = roundMoney(Math.max(0, parseMoneyValue(req.body?.logisticsPrice)));
    const techniciansPrice = roundMoney(Math.max(0, parseMoneyValue(req.body?.techniciansPrice)));
    const subtotal = roundMoney(itemsSubtotal + techniciansSubtotal + logisticsPrice + techniciansPrice);
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
        logisticsPrice,
        techniciansPrice,
        showItemPrices: parseBooleanFlag(req.body?.showItemPrices),
        notes: cleanText(req.body?.notes, 800)
    };

    if (!quote.clientName || !quote.eventName || !quote.eventLocation || !quote.eventDatetime || !quote.assemblyDatetime || !quote.disassemblyDatetime) {
        return res.status(400).json({ error: 'Preencha as informações gerais do orçamento.' });
    }

    if (!quote.paymentMethod || !quote.paymentDeadline) {
        return res.status(400).json({ error: 'Preencha as condições de pagamento.' });
    }

    if (items.length === 0) {
        return res.status(400).json({ error: 'Adicione pelo menos um item ao orçamento.' });
    }

    try {
        const eventRange = getQuoteOperationalRange(quote);
        if (!eventRange) {
            return res.status(400).json({ error: 'Informe Montagem, Evento e Desmontagem em ordem válida.' });
        }

        const existingQuote = await dbGet(
            `SELECT quotes.id,
                    COALESCE(quotes.status, 'pending') AS status,
                    COALESCE(destinations.destination_type, 'event') AS destinationType,
                    events.id AS eventId
             FROM quotes
             LEFT JOIN quote_operational_destinations destinations
                    ON destinations.quote_id = quotes.id
             LEFT JOIN events ON events.orcamento_id = quotes.id
             WHERE quotes.id = ?`,
            [quoteId]
        );
        if (!existingQuote) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }
        if (!['pending', 'approved'].includes(existingQuote.status)) {
            return res.status(409).json({ error: 'Este orçamento não pode ser editado.' });
        }

        const isApproved = existingQuote.status === 'approved';
        const eventId = Number(existingQuote.eventId);
        const operationalMetadata = getOperationalEventMetadata(existingQuote.destinationType, eventRange);
        if (isApproved) {
            const paidTechnician = await dbGet(
                `SELECT id
                 FROM quote_technicians
                 WHERE quote_id = ? AND paid_at IS NOT NULL
                 LIMIT 1`,
                [quoteId]
            );
            if (paidTechnician) {
                return res.status(409).json({
                    error: 'Este orçamento possui pagamento de técnico registrado. Corrija o pagamento antes de editar.'
                });
            }

            if (Number.isInteger(eventId) && eventId > 0) {
                const movementHistory = await dbGet(
                    `SELECT (
                            SELECT COUNT(*) FROM equipment_events WHERE event_id = ?
                        ) + (
                            SELECT COUNT(*) FROM cable_event_movements WHERE event_id = ?
                        ) + (
                            SELECT COUNT(*) FROM other_item_event_movements WHERE event_id = ?
                        ) + (
                            SELECT COUNT(*) FROM quote_manual_item_movements WHERE event_id = ?
                        ) AS movementCount`,
                    [eventId, eventId, eventId, eventId]
                );
                if (Number(movementHistory?.movementCount) > 0) {
                    return res.status(409).json({
                        error: 'Este orçamento já possui movimentações no evento e não pode ser editado.'
                    });
                }
            }
        }

        const availabilityWarnings = await findQuoteItemsAvailabilityWarnings(items, eventRange, {
            excludeQuoteId: quoteId,
            excludeEventId: eventId
        });

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
                 logistics_price = ?,
                 technicians_price = ?,
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
                quote.logisticsPrice,
                quote.techniciansPrice,
                subtotal,
                finalTotal,
                quote.showItemPrices ? 1 : 0,
                quote.notes,
                quoteId
            ]
        );

        await dbRun(
            `DELETE FROM quote_manual_item_movements
             WHERE quote_item_id IN (SELECT id FROM quote_items WHERE quote_id = ?)`,
            [quoteId]
        );
        if (Number.isInteger(eventId) && eventId > 0) {
            await dbRun('DELETE FROM event_reserved_equipments WHERE event_id = ?', [eventId]);
        } else {
            await dbRun(
                `DELETE FROM event_reserved_equipments
                 WHERE quote_item_id IN (SELECT id FROM quote_items WHERE quote_id = ?)`,
                [quoteId]
            );
        }
        await dbRun('DELETE FROM quote_items WHERE quote_id = ?', [quoteId]);
        for (const item of items) {
            await dbRun(
                `INSERT INTO quote_items (
                    quote_id,
                    equipment_id,
                    is_manual,
                    is_service,
                    service_id,
                    service_width,
                    service_height,
                    category,
                    description,
                    quantity,
                    daily_units,
                    internal_unit_price,
                    internal_total,
                    sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    quoteId,
                    item.equipmentId || null,
                    item.isManual ? 1 : 0,
                    item.isService ? 1 : 0,
                    item.serviceId || null,
                    item.serviceWidth || null,
                    item.serviceHeight || null,
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

        if (Number.isInteger(eventId) && eventId > 0) {
            await dbRun(
                `UPDATE events
                 SET name = ?, date = ?, end_date = ?, event_type = ?, withdrawal_date = ?, return_date = ?
                 WHERE id = ?`,
                [
                    quote.eventName || `Orçamento ${quoteId}`,
                    operationalMetadata.date,
                    operationalMetadata.endDate,
                    operationalMetadata.eventType,
                    operationalMetadata.withdrawalDate,
                    operationalMetadata.returnDate,
                    eventId
                ]
            );
            await linkQuoteEquipmentsToEvent(quoteId, eventId);
        }

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

        if (isApproved && (!Number.isInteger(eventId) || eventId <= 0)) {
            await ensureAutomaticScheduledEvents({ quoteId });
        }
        await dbRun('COMMIT');
        return res.json({
            id: quoteId,
            success: true,
            status: existingQuote.status,
            ...(availabilityWarnings.length ? { availabilityWarnings } : {})
        });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/orcamentos/:id/pdf', requireQuoteAccess, async (req, res) => {
    try {
        const quoteId = Number(req.params.id);
        if (!quoteId) return res.status(400).json({ error: 'Orçamento inválido' });

        const quote = await getQuoteWithItems(quoteId);
        if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', buildQuotePdfContentDisposition(quote));

        const doc = new PDFDocument({
            size: QUOTE_PDF_SIZE,
            margins: { top: 0, right: 0, bottom: 0, left: 0 },
            info: {
                Title: `Orçamento ${quote.eventName || quoteId}`,
                Author: '24H Locações',
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
        console.error('Erro ao finalizar sessão:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/operators', requireOperatorAccess, async (req, res) => {
    const search = cleanText(req.query.search, 120);

    try {
        const rows = await dbAll(
            `SELECT id,
                    full_name AS fullName,
                    mother_name AS motherName,
                    cpf,
                    rg,
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
                OR mother_name LIKE ?
                OR cpf LIKE ?
                OR rg LIKE ?
                OR email LIKE ?
                OR phone LIKE ?
                OR area LIKE ?
             ORDER BY lower(full_name) ASC, id DESC`,
            [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
        );

        return res.json({ operators: rows.map(serializeOperator) });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/operators/:id', requireOperatorAccess, async (req, res) => {
    const operatorId = Number(req.params.id);
    if (!Number.isInteger(operatorId) || operatorId <= 0) {
        return res.status(400).json({ error: 'Técnico inválido' });
    }

    try {
        const row = await dbGet(
            `SELECT id,
                    full_name AS fullName,
                    mother_name AS motherName,
                    cpf,
                    rg,
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
        if (!row) return res.status(404).json({ error: 'Técnico não encontrado' });
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
                full_name, mother_name, cpf, rg, birth_date, address, email, phone, area, has_vehicle, pix, agency,
                photo, cache_value, created_by_username, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                operatorData.fullName,
                operatorData.motherName,
                operatorData.cpf,
                operatorData.rg,
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
            return res.status(409).json({ error: 'Já existe um técnico com esse CPF' });
        }
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/operators/:id', requireOperatorAccess, async (req, res) => {
    const operatorId = Number(req.params.id);
    if (!Number.isInteger(operatorId) || operatorId <= 0) {
        return res.status(400).json({ error: 'Técnico inválido' });
    }

    let operatorData;
    try {
        operatorData = normalizeOperatorPayload(req.body, { requirePhoto: true });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ error: err.message });
    }

    try {
        const existing = await dbGet('SELECT id FROM operators WHERE id = ?', [operatorId]);
        if (!existing) return res.status(404).json({ error: 'Técnico não encontrado' });

        await dbRun(
            `UPDATE operators
             SET full_name = ?,
                 mother_name = ?,
                 cpf = ?,
                 rg = ?,
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
                operatorData.motherName,
                operatorData.cpf,
                operatorData.rg,
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
            return res.status(409).json({ error: 'Já existe um técnico com esse CPF' });
        }
        return res.status(500).json({ error: err.message });
    }
});

app.delete('/api/operators/:id', requireOperatorAccess, async (req, res) => {
    const operatorId = Number(req.params.id);
    if (!Number.isInteger(operatorId) || operatorId <= 0) {
        return res.status(400).json({ error: 'Técnico inválido' });
    }

    try {
        const existing = await dbGet('SELECT id FROM operators WHERE id = ?', [operatorId]);
        if (!existing) return res.status(404).json({ error: 'Técnico não encontrado' });

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

app.get('/api/equipment-tracker', requireAuth, async (req, res) => {
    const search = cleanText(req.query.search, 120);
    if (!search) {
        return res.json({ matches: [] });
    }

    try {
        const searchPattern = `%${escapeSqlLikePattern(search)}%`;
        const normalizedBarcode = normalizeEquipmentBarcode(search);
        const matches = await dbAll(
            `SELECT events.id AS eventId,
                    events.name AS eventName,
                    events.date,
                    events.end_date AS endDate,
                    COALESCE(events.event_type, 'event') AS eventType,
                    events.withdrawal_date AS withdrawalDate,
                    events.return_date AS returnDate,
                    events.created_by_username AS createdByUsername,
                    equipments.id AS equipmentId,
                    equipments.name AS equipmentName,
                    equipments.barcode,
                    COUNT(outgoing.id) AS outgoingCount,
                    MAX(outgoing.created_at) AS lastOutgoingAt,
                    COALESCE((
                        SELECT SUM(CASE WHEN ledger.action_type = 'saida' THEN 1 ELSE -1 END)
                        FROM equipment_events ledger
                        WHERE ledger.event_id = events.id
                          AND ledger.equipment_id = equipments.id
                    ), 0) AS activeBalance
             FROM equipment_events outgoing
             INNER JOIN equipments ON equipments.id = outgoing.equipment_id
             INNER JOIN events ON events.id = outgoing.event_id
             WHERE outgoing.action_type = 'saida'
               AND (
                    lower(equipments.name) LIKE lower(?) ESCAPE '\\'
                    OR equipments.barcode = ?
               )
             GROUP BY events.id,
                      events.name,
                      events.date,
                      events.end_date,
                      events.event_type,
                      events.withdrawal_date,
                      events.return_date,
                      events.created_by_username,
                      equipments.id,
                      equipments.name,
                      equipments.barcode
             ORDER BY MAX(outgoing.id) DESC, events.id DESC, lower(equipments.name) ASC`,
            [searchPattern, normalizedBarcode]
        );

        return res.json({ matches });
    } catch (err) {
        return res.status(500).json({ error: err.message });
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
                `SELECT (
                        SELECT COUNT(*) FROM equipment_events WHERE event_id = ?
                    ) + (
                        SELECT COUNT(*) FROM cable_event_movements WHERE event_id = ?
                    ) + (
                        SELECT COUNT(*) FROM other_item_event_movements WHERE event_id = ?
                    ) + (
                        SELECT COUNT(*) FROM quote_manual_item_movements WHERE event_id = ?
                    ) AS movementCount,
                    (
                        SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END), 0)
                        FROM equipment_events WHERE event_id = ?
                    ) + (
                        SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0)
                        FROM cable_event_movements WHERE event_id = ?
                    ) + (
                        SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0)
                        FROM other_item_event_movements WHERE event_id = ?
                    ) + (
                        SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0)
                        FROM quote_manual_item_movements WHERE event_id = ?
                    ) AS pendingQuantity`,
                [Number(event.id), Number(event.id), Number(event.id), Number(event.id), Number(event.id), Number(event.id), Number(event.id), Number(event.id)]
            );
            const movementCount = Number(movement?.movementCount) || 0;
            const pendingQuantity = Number(movement?.pendingQuantity) || 0;

            event.reservedEquipments = reservedEquipments;
            event.status = movementCount === 0
                ? 'Agendado'
                : (pendingQuantity > 0 ? 'Em andamento' : 'Finalizado');
        }

        res.json({ events: events.filter((event) => event.status !== 'Finalizado') });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/events/:id', requireAuth, (req, res) => {
    db.get('SELECT * FROM events WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Evento não encontrado' });
        res.json(row);
    });
});

app.get('/api/events/:id/reserved-equipments', requireAuth, async (req, res) => {
    const eventId = Number(req.params.id);
    if (!eventId) {
        return res.status(400).json({ error: 'Evento inválido' });
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

app.get('/api/events/:id/equipment-requirements', requireAuth, async (req, res) => {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({ error: 'Evento inválido' });
    }

    try {
        const event = await dbGet('SELECT id FROM events WHERE id = ?', [eventId]);
        if (!event) return res.status(404).json({ error: 'Evento não encontrado' });
        const requirements = await getEventEquipmentRequirements(eventId);
        return res.json({ requirements });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/events/:id/spaces', requireAuth, async (req, res) => {
    const eventId = Number(req.params.id);

    if (!eventId) {
        return res.status(400).json({ error: 'Evento inválido' });
    }

    try {
        const event = await dbGet('SELECT id FROM events WHERE id = ?', [eventId]);
        if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

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
        return res.status(400).json({ error: 'Evento inválido' });
    }

    if (!name) {
        return res.status(400).json({ error: 'Nome do espaço é obrigatório' });
    }

    if (name.length > 80) {
        return res.status(400).json({ error: 'Nome do espaço deve ter até 80 caracteres' });
    }

    try {
        const event = await dbGet('SELECT id FROM events WHERE id = ?', [eventId]);
        if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

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
            e.barcode,
            e.observation
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

app.get('/api/events/:id/quote-other-item-summary', requireAuth, async (req, res) => {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId) || eventId <= 0) {
        return res.status(400).json({ error: 'Evento inválido' });
    }

    try {
        const rows = await dbAll(
            `SELECT quote_items.id AS quote_item_id,
                    movements.space_id,
                    event_spaces.name AS space_name,
                    quote_items.description AS name,
                    quote_items.quantity AS requested_quantity,
                    COALESCE(SUM(CASE WHEN movements.action_type = 'saida' THEN movements.quantity ELSE 0 END), 0) AS saida,
                    COALESCE(SUM(CASE WHEN movements.action_type = 'entrada' THEN movements.quantity ELSE 0 END), 0) AS entrada,
                    COALESCE(SUM(CASE
                        WHEN movements.action_type = 'saida' THEN movements.quantity
                        WHEN movements.action_type = 'entrada' THEN -movements.quantity
                        ELSE 0
                    END), 0) AS final
             FROM events
             INNER JOIN quote_items ON quote_items.quote_id = events.orcamento_id
             LEFT JOIN quote_manual_item_movements movements
               ON movements.event_id = events.id
              AND movements.quote_item_id = quote_items.id
             LEFT JOIN event_spaces ON event_spaces.id = movements.space_id
             WHERE events.id = ?
               AND COALESCE(quote_items.is_manual, 0) = 1
             GROUP BY quote_items.id,
                      movements.space_id,
                      event_spaces.name,
                      quote_items.description,
                      quote_items.quantity
             ORDER BY COALESCE(event_spaces.id, 0) ASC,
                      lower(quote_items.description) ASC,
                      quote_items.id ASC`,
            [eventId]
        );

        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
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
        return res.status(400).json({ message: 'Dados inválidos para excluir da saída' });
    }

    try {
        const event = await dbGet('SELECT id FROM events WHERE id = ?', [eventId]);
        if (!event) return res.status(404).json({ message: 'Evento não encontrado' });

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
            console.error('Erro ao ocultar item da saída:', err);
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
        return res.status(400).json({ error: 'Nome, data inicial e data final são obrigatórios' });
    }

    if (finishDate < startDate) {
        return res.status(400).json({ error: 'A data final não pode ser anterior à data inicial' });
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
            return res.status(400).json({ error: 'Data inválida' });
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
        return res.status(400).json({ error: 'Nome, data de retirada e data de devolução são obrigatórios' });
    }

    if (cleanReturnDate < cleanWithdrawalDate) {
        return res.status(400).json({ error: 'A data de devolução não pode ser anterior à data de retirada' });
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
            if (!row) return res.status(404).json({ error: 'Locação não encontrada' });
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
        if (!event) return res.status(404).json({ error: 'Locação não encontrada' });

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
            equipments.serial_number AS serialNumber,
            equipments.observation,
            COALESCE(equipments.unit_price, 1) AS unitPrice,
            (
                SELECT events.name
                FROM equipment_events AS outgoing
                INNER JOIN events ON events.id = outgoing.event_id
                WHERE outgoing.equipment_id = equipments.id
                  AND outgoing.action_type = 'saida'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM equipment_events AS incoming
                      WHERE incoming.equipment_id = outgoing.equipment_id
                        AND incoming.event_id = outgoing.event_id
                        AND incoming.action_type = 'entrada'
                        AND (
                            datetime(incoming.created_at) > datetime(outgoing.created_at)
                            OR (
                                datetime(incoming.created_at) = datetime(outgoing.created_at)
                                AND incoming.id > outgoing.id
                            )
                        )
                  )
                ORDER BY datetime(outgoing.created_at) DESC, outgoing.id DESC
                LIMIT 1
            ) AS current_event_name,
            (
                SELECT maintenances.description
                FROM maintenances
                WHERE maintenances.equipment_id = equipments.id
                  AND maintenances.resolved_at IS NULL
                ORDER BY datetime(maintenances.created_at) DESC, maintenances.id DESC
                LIMIT 1
            ) AS maintenance_description
        FROM equipments
        WHERE equipments.name LIKE ?
           OR equipments.barcode LIKE ?
           OR COALESCE(equipments.observation, '') LIKE ?
           OR equipments.category LIKE ?
        ORDER BY equipments.category ASC, equipments.name ASC`,
        [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

app.post('/api/equipments', requireAuth, (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const barcode = normalizeEquipmentBarcode(body.barcode);
    const category = String(body.category || 'Outros').trim() || 'Outros';
    const normalizedSerialNumber = String(body.serialNumber || body.serial_number || '').trim() || '-';
    const normalizedObservation = String(body.observation || '').trim() || '-';

    if (!name || !barcode) {
        return res.status(400).json({ error: 'Nome e patrimonio/codigo de barras sao obrigatorios.' });
    }

    db.get(
        'SELECT id, name, barcode FROM equipments WHERE barcode = ?',
        [barcode],
        (selectErr, existingEquipment) => {
            if (selectErr) {
                console.error('Erro ao verificar patrimonio:', selectErr.message);
                return res.status(500).json({ error: 'Nao foi possivel verificar o patrimonio antes de cadastrar.' });
            }

            if (existingEquipment) {
                return res.status(409).json({
                    error: duplicateEquipmentMessage(existingEquipment),
                    equipment: existingEquipment
                });
            }

            db.run(
                'INSERT INTO equipments (name, barcode, current_status, category, serial_number, observation) VALUES (?, ?, ?, ?, ?, ?)',
                [name, barcode, 'Disponivel', category, normalizedSerialNumber, normalizedObservation],
                function(err) {
                    if (err) {
                        const message = String(err.message || err || '');
                        if (message.toLowerCase().includes('unique')) {
                            return res.status(409).json({ error: duplicateEquipmentMessage() });
                        }

                        console.error('Erro ao cadastrar:', err.message);
                        return res.status(500).json({ error: err.message });
                    }

                    res.json({ id: this.lastID, success: true });
                }
            );
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
            ) AS maintenance_description,
            COALESCE((
                SELECT SUM(cm.quantity)
                FROM cable_maintenances cm
                WHERE cm.cable_id = cables.id
                  AND cm.resolved_at IS NULL
            ), 0) AS maintenance_quantity,
            (
                SELECT MIN(cm.created_at)
                FROM cable_maintenances cm
                WHERE cm.cable_id = cables.id
                  AND cm.resolved_at IS NULL
            ) AS maintenance_started_at
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
        return res.status(400).json({ error: 'Nome do cabo é obrigatório' });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ error: 'Quantidade inválida' });
    }

    try {
        const existingCable = await dbGet('SELECT id FROM cables WHERE lower(name) = lower(?)', [name]);
        if (existingCable) {
            return res.status(409).json({ error: 'Já existe um cabo com esse nome' });
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
        return res.status(400).json({ message: 'ID do cabo é obrigatório' });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ message: 'Quantidade inválida' });
    }

    if (!canEditInitialQuantity(req, password)) {
        return res.status(403).json({ message: 'Apenas Arthur pode editar com a senha correta' });
    }

    try {
        const cable = await dbGet('SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) {
            return res.status(404).json({ message: 'Cabo não encontrado' });
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
        return res.status(400).json({ message: 'ID do cabo é obrigatório' });
    }

    if (!(await verifyDeletePassword(password))) {
        return res.status(403).json({ message: 'Senha incorreta' });
    }

    try {
        const cable = await dbGet('SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) {
            return res.status(404).json({ message: 'Cabo não encontrado' });
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
                COALESCE(category, 'Outros') AS category,
                created_at,
                updated_at
         FROM other_items
         WHERE name LIKE ?
         ORDER BY category ASC, name ASC`,
        [`%${search}%`],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

app.post('/api/other-items', requireAuth, async (req, res) => {
    const name = String(req.body.name || '').trim().toLocaleUpperCase('pt-BR');
    const quantity = Number(req.body.quantity);
    const category = String(req.body.category || 'Outros').trim() || 'Outros';

    if (!name) {
        return res.status(400).json({ error: 'Nome do item é obrigatório' });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ error: 'Quantidade inválida' });
    }

    try {
        const existingItem = await dbGet('SELECT id FROM other_items WHERE lower(name) = lower(?)', [name]);
        if (existingItem) {
            return res.status(409).json({ error: 'Já existe um item com esse nome' });
        }

        const result = await dbRun(
            `INSERT INTO other_items (name, quantity, available_quantity, category, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [name, quantity, quantity, category]
        );

        return res.json({ id: result.lastID, success: true });
    } catch (err) {
        console.error('Erro ao cadastrar item sem patrimônio:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/other-items/:id', requireAuth, async (req, res) => {
    const itemId = Number(req.params.id);
    const quantity = Number(req.body.quantity);
    const password = String(req.body.password || '').trim();

    if (!itemId) {
        return res.status(400).json({ message: 'ID do item é obrigatório' });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ message: 'Quantidade inválida' });
    }

    if (!canEditInitialQuantity(req, password)) {
        return res.status(403).json({ message: 'Apenas Arthur pode editar com a senha correta' });
    }

    try {
        const item = await dbGet('SELECT * FROM other_items WHERE id = ?', [itemId]);
        if (!item) {
            return res.status(404).json({ message: 'Item não encontrado' });
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
        console.error('Erro ao atualizar item sem patrimônio:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.delete('/api/other-items/:id', requireAuth, async (req, res) => {
    const itemId = Number(req.params.id);
    const password = String(req.body.password || '').trim();

    if (!itemId) {
        return res.status(400).json({ message: 'ID do item é obrigatório' });
    }

    if (!(await verifyDeletePassword(password))) {
        return res.status(403).json({ message: 'Senha incorreta' });
    }

    try {
        const item = await dbGet('SELECT * FROM other_items WHERE id = ?', [itemId]);
        if (!item) {
            return res.status(404).json({ message: 'Item não encontrado' });
        }

        await createSqliteBackup(`before-delete-other-item-${itemId}`);
        await dbRun('DELETE FROM other_item_event_movements WHERE item_id = ?', [itemId]);
        await dbRun('DELETE FROM other_items WHERE id = ?', [itemId]);

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir item sem patrimônio:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.patch('/api/equipments/:id', requireAuth, async (req, res) => {
    const equipmentId = Number(req.params.id);
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const barcode = normalizeEquipmentBarcode(body.barcode);
    const serialNumber = String(body.serialNumber || body.serial_number || '').trim() || '-';
    const observation = String(body.observation || '').trim() || '-';

    if (!equipmentId) {
        return res.status(400).json({ message: 'ID do equipamento e obrigatorio' });
    }

    if (!name || !barcode) {
        return res.status(400).json({ error: 'Nome e patrimonio/codigo de barras sao obrigatorios.' });
    }

    try {
        const equipment = await dbGet('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) {
            return res.status(404).json({ message: 'Equipamento nao encontrado' });
        }

        const existingEquipment = await dbGet(
            'SELECT id, name, barcode FROM equipments WHERE barcode = ? AND id <> ?',
            [barcode, equipmentId]
        );
        if (existingEquipment) {
            return res.status(409).json({
                error: duplicateEquipmentMessage(existingEquipment),
                equipment: existingEquipment
            });
        }

        await createSqliteBackup(`before-edit-equipment-${equipmentId}`);
        await dbRun(
            `UPDATE equipments
             SET name = ?, barcode = ?, serial_number = ?, observation = ?
             WHERE id = ?`,
            [name, barcode, serialNumber, observation, equipmentId]
        );
        const unitPrice = roundMoney(parseMoneyValue(equipment.unit_price ?? 1));

        return res.json({
            success: true,
            equipment: {
                ...equipment,
                name,
                barcode,
                serial_number: serialNumber,
                serialNumber,
                observation,
                unit_price: unitPrice,
                unitPrice
            }
        });
    } catch (err) {
        const message = String(err.message || err || '');
        if (message.toLowerCase().includes('unique')) {
            return res.status(409).json({ error: duplicateEquipmentMessage() });
        }

        console.error('Erro ao editar equipamento:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.delete('/api/equipments/:id', requireAuth, async (req, res) => {
    const equipmentId = Number(req.params.id);
    const password = String(req.body.password || '').trim();

    if (!equipmentId) {
        return res.status(400).json({ message: 'ID do equipamento é obrigatório' });
    }

    if (!(await verifyDeletePassword(password))) {
        return res.status(403).json({ message: 'Senha incorreta' });
    }

    try {
        const equipment = await dbGet('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) {
            return res.status(404).json({ message: 'Equipamento não encontrado' });
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
        return res.status(400).json({ message: 'ID e status são obrigatórios' });
    }

    try {
        const equipment = await dbGet('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return res.status(404).json({ message: 'Equipamento não encontrado' });

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
    const availabilityOverride = req.body?.availabilityOverride === true || req.body?.availabilityOverride === 1;
    const performedByUsername = String(req.session?.username || '').trim() || null;

    if (!['saida', 'entrada'].includes(type)) {
        return res.status(400).json({ message: 'Tipo de movimentação inválido' });
    }

    if ((!equipmentId && !barcode) || !eventId) {
        return res.status(400).json({ message: 'equipmentId ou código de barras e eventId são obrigatórios' });
    }

    try {
        const [equipment, event] = await Promise.all([
            equipmentId
                ? dbGet('SELECT * FROM equipments WHERE id = ?', [equipmentId])
                : dbGet('SELECT * FROM equipments WHERE barcode = ?', [barcode]),
            dbGet('SELECT * FROM events WHERE id = ?', [eventId])
        ]);
        const resolvedEquipmentId = Number(equipment?.id);

        if (!equipment) return res.status(404).json({ message: 'Equipamento não encontrado' });
        if (!event) return res.status(404).json({ message: 'Evento não encontrado' });
        const spaceId = await resolveEventSpaceId(eventId, req.body.spaceId);

        if (type === 'saida') {
            if (isMaintenanceStatus(equipment.current_status)) {
                return res.status(409).json({ message: 'Equipamento em manutenção' });
            }
            if (isInactiveEquipmentStatus(equipment.current_status)) {
                return res.status(409).json({ message: 'Equipamento inativo ou baixado' });
            }

            const activePhysicalMovement = await dbGet(
                `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END), 0) AS balance
                 FROM equipment_events
                 WHERE equipment_id = ?`,
                [resolvedEquipmentId]
            );
            if (Number(activePhysicalMovement?.balance) > 0) {
                return res.status(409).json({ message: 'Este patrimônio já está fora do estoque' });
            }
            if (normalizeQuoteStatusText(equipment.current_status).includes('indispon')) {
                return res.status(409).json({ message: 'Este patrimônio está fisicamente indisponível' });
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
                return res.status(409).json({ message: 'Este equipamento já possui saída pendente neste evento' });
            }

            const eventRange = getEventDateRange(event);
            if (!eventRange) {
                return res.status(400).json({ message: 'Evento sem período válido' });
            }

            const dateWarning = await findEquipmentDateConflict(resolvedEquipmentId, eventRange, {
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
            const capacityWarning = await findEquipmentGroupCapacityConflict(
                { id: equipment.id, name: equipment.name },
                event
            );
            const availabilityWarnings = [capacityWarning, dateWarning].filter(Boolean);
            if (availabilityWarnings.length && !availabilityOverride) {
                const warning = capacityWarning || dateWarning;
                return res.status(409).json({
                    code: 'FUTURE_AVAILABILITY_WARNING',
                    requiresConfirmation: true,
                    message: 'Esta saída pode causar insuficiência de estoque para outra demanda.',
                    warning,
                    conflict: warning,
                    warnings: availabilityWarnings
                });
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

            if (availabilityWarnings.length && availabilityOverride) {
                await dbRun(
                    `INSERT INTO availability_warning_audits (
                        equipment_id, event_id, space_id, confirmed_by_username, warning_details
                    ) VALUES (?, ?, ?, ?, ?)`,
                    [
                        resolvedEquipmentId,
                        eventId,
                        spaceId,
                        performedByUsername,
                        JSON.stringify(availabilityWarnings)
                    ]
                );
            }

            return res.json({ success: true, equipment, availabilityOverride: availabilityWarnings.length > 0 });
        }

        // A tela em que o operador está serve apenas como ponto de leitura. A
        // entrada baixa a saída física pendente no evento e espaço de origem.
        const pendingMovement = await dbGet(
            `SELECT equipment_events.event_id AS eventId,
                    equipment_events.space_id AS spaceId,
                    events.name AS eventName,
                    event_spaces.name AS spaceName
             FROM equipment_events
             INNER JOIN events ON events.id = equipment_events.event_id
             LEFT JOIN event_spaces ON event_spaces.id = equipment_events.space_id
             WHERE equipment_events.equipment_id = ?
             GROUP BY equipment_events.event_id,
                      equipment_events.space_id,
                      events.name,
                      event_spaces.name
             HAVING SUM(CASE WHEN equipment_events.action_type = 'saida' THEN 1 ELSE -1 END) > 0
             ORDER BY MAX(equipment_events.id) DESC
             LIMIT 1`,
            [resolvedEquipmentId]
        );

        if (!pendingMovement) {
            return res.status(409).json({ message: 'Este equipamento não possui saída pendente' });
        }

        const movementEventId = Number(pendingMovement.eventId);
        const movementSpaceId = pendingMovement.spaceId == null ? null : Number(pendingMovement.spaceId);

        await dbRun(
            "INSERT INTO equipment_events (equipment_id, event_id, space_id, action_type, performed_by_username) VALUES (?, ?, ?, 'entrada', ?)",
            [resolvedEquipmentId, movementEventId, movementSpaceId, performedByUsername]
        );
        await dbRun("UPDATE equipments SET current_status = 'Disponivel' WHERE id = ?", [resolvedEquipmentId]);

        return res.json({
            success: true,
            equipment,
            movement: {
                eventId: movementEventId,
                eventName: pendingMovement.eventName || '',
                spaceId: movementSpaceId,
                spaceName: pendingMovement.spaceName || ''
            }
        });
    } catch (err) {
        if (!err.statusCode || err.statusCode >= 500) {
            console.error('Erro ao registrar movimentação:', err);
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
        return res.status(400).json({ message: 'Tipo de movimentação inválido' });
    }

    if (!cableId || !eventId || !Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: 'cableId, eventId e quantidade são obrigatórios' });
    }

    try {
        const [cable, event] = await Promise.all([
            dbGet('SELECT * FROM cables WHERE id = ?', [cableId]),
            dbGet('SELECT * FROM events WHERE id = ?', [eventId])
        ]);

        if (!cable) return res.status(404).json({ message: 'Cabo não encontrado' });
        if (!event) return res.status(404).json({ message: 'Evento não encontrado' });
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
            return res.status(409).json({ message: 'Este cabo não possui saída pendente suficiente neste evento' });
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
            console.error('Erro ao registrar movimentação de cabo:', err);
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
        return res.status(400).json({ message: 'Tipo de movimentação inválido' });
    }

    if (!itemId || !eventId || !Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: 'itemId, eventId e quantidade são obrigatórios' });
    }

    try {
        const [item, event] = await Promise.all([
            dbGet('SELECT * FROM other_items WHERE id = ?', [itemId]),
            dbGet('SELECT * FROM events WHERE id = ?', [eventId])
        ]);

        if (!item) return res.status(404).json({ message: 'Item não encontrado' });
        if (!event) return res.status(404).json({ message: 'Evento não encontrado' });
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
            return res.status(409).json({ message: 'Este item não possui saída pendente suficiente neste evento' });
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
            console.error('Erro ao registrar movimentação de item sem patrimônio:', err);
        }
        return res.status(err.statusCode || 500).json({ message: err.message });
    }
});

app.post('/api/quote-other-item-events/:type', requireAuth, async (req, res) => {
    const { type } = req.params;
    const quoteItemId = Number(req.body?.quoteItemId);
    const eventId = Number(req.body?.eventId);
    const quantity = Number(req.body?.quantity);

    if (!['saida', 'entrada'].includes(type)) {
        return res.status(400).json({ message: 'Tipo de movimentação inválido' });
    }
    if (!Number.isInteger(quoteItemId) || quoteItemId <= 0 || !Number.isInteger(eventId) || eventId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: 'quoteItemId, eventId e quantidade são obrigatórios' });
    }

    try {
        const quoteItem = await dbGet(
            `SELECT quote_items.id,
                    quote_items.description,
                    quote_items.quantity
             FROM quote_items
             INNER JOIN events ON events.orcamento_id = quote_items.quote_id
             WHERE quote_items.id = ?
               AND events.id = ?
               AND COALESCE(quote_items.is_manual, 0) = 1`,
            [quoteItemId, eventId]
        );
        if (!quoteItem) {
            return res.status(404).json({ message: 'Equipamento avulso não encontrado neste evento' });
        }

        const spaceId = await resolveEventSpaceId(eventId, req.body?.spaceId);
        if (type === 'saida') {
            const totals = await dbGet(
                `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE 0 END), 0) AS saida
                 FROM quote_manual_item_movements
                 WHERE quote_item_id = ? AND event_id = ?`,
                [quoteItemId, eventId]
            );
            if (Number(totals?.saida) + quantity > Number(quoteItem.quantity)) {
                return res.status(409).json({ message: 'A quantidade de saída ultrapassa a quantidade informada no orçamento' });
            }
        } else {
            const pendingMovement = await dbGet(
                `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0) AS quantity
                 FROM quote_manual_item_movements
                 WHERE quote_item_id = ? AND event_id = ?
                   AND ${spacePredicate('space_id')}`,
                [quoteItemId, eventId, spaceId]
            );
            if (Number(pendingMovement?.quantity) < quantity) {
                return res.status(409).json({ message: 'Este equipamento avulso não possui saída pendente suficiente neste evento' });
            }
        }

        await dbRun(
            `INSERT INTO quote_manual_item_movements (quote_item_id, event_id, space_id, action_type, quantity)
             VALUES (?, ?, ?, ?, ?)`,
            [quoteItemId, eventId, spaceId, type, quantity]
        );
        return res.json({ success: true });
    } catch (err) {
        if (!err.statusCode || err.statusCode >= 500) {
            console.error('Erro ao registrar movimentação de equipamento avulso:', err);
        }
        return res.status(err.statusCode || 500).json({ message: err.message });
    }
});

app.post('/api/maintenances', requireAuth, async (req, res) => {
    const equipmentId = Number(req.body.equipmentId);
    const description = String(req.body.description || '').trim();

    if (!equipmentId || !description) {
        return res.status(400).json({ message: 'equipmentId e descrição são obrigatórios' });
    }

    try {
        const equipment = await dbGet('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return res.status(404).json({ message: 'Equipamento não encontrado' });

        await dbRun(
            'INSERT INTO maintenances (equipment_id, description) VALUES (?, ?)',
            [equipmentId, description]
        );
        await dbRun("UPDATE equipments SET current_status = 'Em manutencao' WHERE id = ?", [equipmentId]);

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao registrar manutenção:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.post('/api/cable-maintenances', requireAuth, async (req, res) => {
    const cableId = Number(req.body.cableId);
    const description = String(req.body.description || '').trim();
    const quantity = Number(req.body.quantity);

    if (!cableId || !description || !Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: 'Cabo, quantidade e descrição são obrigatórios' });
    }

    try {
        await dbRun('BEGIN IMMEDIATE TRANSACTION');
        const cable = await dbGet('SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) {
            await dbRun('ROLLBACK');
            return res.status(404).json({ message: 'Cabo não encontrado' });
        }

        if (Number(cable.available_quantity) < quantity) {
            await dbRun('ROLLBACK');
            return res.status(400).json({ message: 'Quantidade maior que a disponível no estoque' });
        }

        await dbRun(
            'INSERT INTO cable_maintenances (cable_id, description, quantity) VALUES (?, ?, ?)',
            [cableId, description, quantity]
        );
        await dbRun(
            `UPDATE cables
             SET available_quantity = available_quantity - ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [quantity, cableId]
        );
        await dbRun('COMMIT');

        return res.json({ success: true, maintenanceQuantity: quantity });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        console.error('Erro ao registrar manutenção do cabo:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.get('/api/cables/:cableId/maintenances', requireAuth, async (req, res) => {
    const cableId = Number(req.params.cableId);
    if (!cableId) return res.status(400).json({ message: 'cableId é obrigatório' });

    try {
        const cable = await dbGet('SELECT id, name FROM cables WHERE id = ?', [cableId]);
        if (!cable) return res.status(404).json({ message: 'Cabo não encontrado' });

        const maintenances = await dbAll(
            `SELECT id, quantity, description, created_at
             FROM cable_maintenances
             WHERE cable_id = ?
               AND resolved_at IS NULL
             ORDER BY datetime(created_at) ASC, id ASC`,
            [cableId]
        );

        return res.json({
            cable,
            maintenanceQuantity: maintenances.reduce((total, item) => total + Number(item.quantity || 0), 0),
            maintenances
        });
    } catch (err) {
        console.error('Erro ao consultar manutenções do cabo:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.patch('/api/maintenances/:equipmentId/ready', requireAuth, async (req, res) => {
    const equipmentId = Number(req.params.equipmentId);

    if (!equipmentId) {
        return res.status(400).json({ message: 'equipmentId é obrigatório' });
    }

    try {
        const equipment = await dbGet('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return res.status(404).json({ message: 'Equipamento não encontrado' });

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
        console.error('Erro ao finalizar manutenção:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.patch('/api/cable-maintenances/:cableId/ready', requireAuth, async (req, res) => {
    const cableId = Number(req.params.cableId);

    if (!cableId) {
        return res.status(400).json({ message: 'cableId é obrigatório' });
    }

    try {
        await dbRun('BEGIN IMMEDIATE TRANSACTION');
        const cable = await dbGet('SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) {
            await dbRun('ROLLBACK');
            return res.status(404).json({ message: 'Cabo não encontrado' });
        }

        const maintenance = await dbGet(
            `SELECT COALESCE(SUM(quantity), 0) AS quantity
             FROM cable_maintenances
             WHERE cable_id = ?
               AND resolved_at IS NULL`,
            [cableId]
        );
        const maintenanceQuantity = Number(maintenance?.quantity || 0);

        if (Number(cable.available_quantity) + maintenanceQuantity > Number(cable.quantity)) {
            await dbRun('ROLLBACK');
            return res.status(409).json({ message: 'O saldo do cabo está inconsistente. Atualize a tela.' });
        }

        await dbRun(
            `UPDATE cable_maintenances
             SET resolved_at = CURRENT_TIMESTAMP
             WHERE cable_id = ?
               AND resolved_at IS NULL`,
            [cableId]
        );
        await dbRun(
            `UPDATE cables
             SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [maintenanceQuantity, cableId]
        );
        await dbRun('COMMIT');

        return res.json({ success: true, returnedQuantity: maintenanceQuantity });
    } catch (err) {
        await dbRun('ROLLBACK').catch(() => {});
        console.error('Erro ao finalizar manutenção do cabo:', err);
        return res.status(500).json({ message: err.message });
    }
});

app.get('/dashboard.html', (req, res) => {
    if (req.session && req.session.userId) {
        res.sendFile(path.join(HTML_DIR, 'dashboard.html'));
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
                console.log(`Servidor já está aberto em http://localhost:${PORT}`);
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
    buildQuotePdfContentDisposition,
    buildQuotePdfFilename,
    drawQuotePdf,
    groupQuoteEquipmentsByName,
    QUOTE_PDF_SIZE,
    startServer
};
