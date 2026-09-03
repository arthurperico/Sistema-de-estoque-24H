const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const DATABASE_FILENAME = process.env.NODE_ENV === 'production' ? 'database.db' : 'database.local.db';
const DATABASE_PATH = path.join(__dirname, DATABASE_FILENAME);
const TEST_SESSION_DIR = path.join(__dirname, 'data', 'test-sessions');
const SQLITE_BACKUP_DIR = path.join(__dirname, 'backups', 'sqlite');
const TEST_USERNAME = 'teste';
const SEEDED_USERS = [];
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DELETE_PASSWORD_HASH = process.env.DELETE_PASSWORD_HASH || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEFAULT_NOTIFICATION_SETTINGS = {
    enabled: true,
    daysBefore: [7, 5, 3, 1, 0],
    includeOverdue: true,
    maxNotices: 20,
    repeatMode: 'daily',
    allowUserDismiss: true
};

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
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

if (!process.env.SESSION_SECRET) {
    console.warn('SESSION_SECRET nao definido. Um segredo temporario foi gerado para esta execucao.');
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
                category TEXT DEFAULT 'Outros'
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                date TEXT NOT NULL,
                created_by_username TEXT,
                event_type TEXT NOT NULL DEFAULT 'event',
                withdrawal_date TEXT,
                return_date TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS equipment_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                equipment_id INTEGER NOT NULL,
                event_id INTEGER NOT NULL,
                action_type TEXT NOT NULL CHECK(action_type IN ('saida', 'entrada')),
                performed_by_username TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS other_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0,
                available_quantity INTEGER NOT NULL DEFAULT 0,
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
                action_type TEXT NOT NULL CHECK(action_type IN ('saida', 'entrada')),
                quantity INTEGER NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS other_item_event_movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                event_id INTEGER NOT NULL,
                action_type TEXT NOT NULL CHECK(action_type IN ('saida', 'entrada')),
                quantity INTEGER NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user'
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS notification_settings (
                company_id INTEGER PRIMARY KEY,
                settings_json TEXT NOT NULL,
                updated_by_username TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS notification_dismissals (
                company_id INTEGER NOT NULL,
                notification_id TEXT NOT NULL,
                dismissed_by_username TEXT,
                dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (company_id, notification_id)
            )`);

            db.run("ALTER TABLE equipments ADD COLUMN current_status TEXT DEFAULT 'Disponivel'", () => {});
            db.run("ALTER TABLE equipments ADD COLUMN category TEXT DEFAULT 'Outros'", () => {});
            db.run("ALTER TABLE events ADD COLUMN created_by_username TEXT", () => {});
            db.run("ALTER TABLE events ADD COLUMN event_type TEXT DEFAULT 'event'", () => {});
            db.run("ALTER TABLE events ADD COLUMN withdrawal_date TEXT", () => {});
            db.run("ALTER TABLE events ADD COLUMN return_date TEXT", () => {});
            db.run("ALTER TABLE equipment_events ADD COLUMN performed_by_username TEXT", () => {});
            db.run("ALTER TABLE maintenances ADD COLUMN resolved_at TEXT", () => {});
            db.run("ALTER TABLE cables ADD COLUMN category TEXT DEFAULT 'Outros'", () => {});
            db.run("ALTER TABLE cables ADD COLUMN available_quantity INTEGER DEFAULT 0", () => {});
            db.run("ALTER TABLE cables ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP", () => {});
            db.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'", () => {});
            db.run("ALTER TABLE users ADD COLUMN company_id INTEGER", () => {});
            db.run("UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''", () => {});
            db.run("UPDATE cables SET available_quantity = quantity WHERE available_quantity IS NULL OR available_quantity = 0", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_other_items_name ON other_items(name)", () => {});
            db.run("CREATE INDEX IF NOT EXISTS idx_other_item_event_movements_event_item ON other_item_event_movements(event_id, item_id, created_at)", () => {});
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
                 SELECT ?, ?, ?
                 WHERE NOT EXISTS (
                    SELECT 1 FROM users WHERE username = ?
                 )`,
                [user.username, user.passwordHash, user.role, user.username],
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
                 GROUP BY event_id, equipment_id
                 HAVING SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END) > 0

                 UNION ALL

                 SELECT event_id,
                        SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS pending_quantity
                 FROM cable_event_movements
                 GROUP BY event_id, cable_id
                 HAVING SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) > 0

                 UNION ALL

                 SELECT event_id,
                        SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS pending_quantity
                 FROM other_item_event_movements
                 GROUP BY event_id, item_id
                 HAVING SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) > 0
             ) pending_rows
             GROUP BY event_id
         ) pending ON pending.event_id = e.id
         WHERE COALESCE(e.event_type, 'event') = ?
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
         GROUP BY e.id, e.name, e.barcode
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
         GROUP BY c.id, c.name
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
         GROUP BY oi.id, oi.name
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
    await dbRun('DELETE FROM events WHERE id = ?', [eventId]);
}

async function bootstrapDatabase() {
    try {
        await fs.promises.mkdir(SQLITE_BACKUP_DIR, { recursive: true });
        await fs.promises.mkdir(TEST_SESSION_DIR, { recursive: true });
        await connectDatabase();
        await initializeDatabase();
        await clearPendingTestSnapshots();
        await createSqliteBackup('startup');
        console.log(`Banco de dados conectado em ${DATABASE_PATH}`);
    } catch (err) {
        console.error('Erro no banco:', err.message);
        process.exit(1);
    }
}

bootstrapDatabase();

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

function requireAuth(req, res, next) {
    if (req.session && (req.session.userId || req.session.localAuth)) return next();
    res.status(401).json({ error: 'Nao autorizado' });
}

async function requireAdmin(req, res, next) {
    try {
        if (req.session?.localAuth) {
            // Local guest/test session: grant admin permissions at runtime
            req.currentUser = { id: null, username: req.session.username || 'Convidado', role: 'admin' };
            // Set userId in session for compatibility with flows that check req.session.userId
            req.session.userId = req.session.userId || 0;
            return next();
        }

        if (!req.session?.userId) {
            return res.status(401).json({ error: 'Nao autorizado' });
        }

        const user = await dbGet('SELECT id, username, role FROM users WHERE id = ?', [req.session.userId]);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ error: 'Acesso restrito a administradores' });
        }

        req.currentUser = user;
        return next();
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

function isAvailableStatus(status) {
    const normalized = (status || '').toLowerCase();
    return !normalized
        || normalized === 'disponivel'
        || normalized === 'disponível'
        || normalized === 'pre separado'
        || normalized === 'relacao'
        || normalized === 'relação';
}

function getNotificationCompanyId(req) {
    return req.session?.companyId || req.session?.company_id || 0;
}

function sanitizeNotificationDays(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(',');
    const days = raw
        .map((item) => Number(String(item).trim()))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 365);
    return [...new Set(days)].sort((a, b) => b - a);
}

function sanitizeNotificationSettings(value = {}) {
    const daysBefore = sanitizeNotificationDays(value.daysBefore);
    return {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        enabled: value.enabled !== false,
        includeOverdue: value.includeOverdue !== false,
        allowUserDismiss: value.allowUserDismiss !== false,
        daysBefore: daysBefore.length ? daysBefore : DEFAULT_NOTIFICATION_SETTINGS.daysBefore,
        maxNotices: Math.max(1, Math.min(50, Number(value.maxNotices) || DEFAULT_NOTIFICATION_SETTINGS.maxNotices)),
        repeatMode: value.repeatMode === 'once' ? 'once' : 'daily'
    };
}

async function getNotificationSettingsForCompany(companyId) {
    const row = await dbGet('SELECT settings_json FROM notification_settings WHERE company_id = ?', [companyId]);
    if (!row?.settings_json) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    try {
        return sanitizeNotificationSettings(JSON.parse(row.settings_json));
    } catch (_) {
        return { ...DEFAULT_NOTIFICATION_SETTINGS };
    }
}

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        await cleanupTestSession(req);

        if (String(username || '').trim() === TEST_USERNAME) {
            await clearPendingTestSnapshots();
        }

        const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
        if (user && bcrypt.compareSync(password, user.password)) {
            await regenerateSession(req);
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role || 'user';
            req.session.isTestUser = user.username === TEST_USERNAME;

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

// Login simplificado para "Convidado" — cria sessão local sem usar DB
app.post('/api/login/guest', async (req, res) => {
    try {
        await cleanupTestSession(req);
        await regenerateSession(req);
        req.session.userId = 'local-guest';
        req.session.username = 'Convidado';
        // Por compatibilidade com requireAdmin anterior que aceitava localAuth,
        // mantemos o mesmo sinalizador para conceder permissões temporarias.
        req.session.role = 'admin';
        req.session.localAuth = true;
        req.session.isGuest = true;
        req.session.save(() => res.json({ success: true }));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/auth/status', async (req, res) => {
    if (!req.session?.userId && !req.session?.localAuth) {
        return res.json({ authenticated: false, isTestUser: false, username: null, isAdmin: false });
    }

    if (req.session?.localAuth) {
        return res.json({
            authenticated: true,
            isTestUser: false,
            userId: req.session.userId,
            username: req.session.username || 'Convidado',
            isAdmin: true,
            isGuest: req.session.isGuest || false
        });
    }

    try {
        const user = await dbGet('SELECT username, COALESCE(role, "user") AS role FROM users WHERE id = ?', [req.session.userId]);
        if (!user) {
            return res.json({ authenticated: false, isTestUser: false, username: null, isAdmin: false });
        }

        req.session.username = user.username;
        req.session.role = user.role;
        return res.json({
            authenticated: true,
            isTestUser: !!req.session.isTestUser,
            userId: req.session.userId,
            username: user.username,
            isAdmin: user.role === 'admin'
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/users', requireAdmin, async (req, res) => {
    try {
        const users = await dbAll(
            `SELECT id, username,
                    CASE
                        WHEN COALESCE(role, 'user') = 'admin' AND company_id IS NULL THEN 'gestor_admin'
                        ELSE COALESCE(role, 'user')
                    END AS role,
                    company_id
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
        const requestedRole = String(req.body?.role || 'user').trim();
        const role = ['user', 'admin', 'gestor_admin'].includes(requestedRole) ? requestedRole : 'user';
        const companyId = req.body?.company_id ? Number(req.body.company_id) : null;

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
            'INSERT INTO users (username, password, role, company_id) VALUES (?, ?, ?, ?)',
            [username, passwordHash, role, companyId]
        );
        res.json({ id: result.lastID, username, role, company_id: companyId, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const username = String(req.body?.username || '').trim();
        const requestedRole = String(req.body?.role || 'user').trim();
        const role = ['user', 'admin', 'gestor_admin'].includes(requestedRole) ? requestedRole : 'user';
        const companyId = req.body?.company_id ? Number(req.body.company_id) : null;

        if (!userId) return res.status(400).json({ error: 'Usuario invalido' });
        if (!username) return res.status(400).json({ error: 'Nome do usuario e obrigatorio' });

        const user = await dbGet('SELECT id, username, COALESCE(role, "user") AS role, company_id FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });

        const existingUser = await dbGet('SELECT id FROM users WHERE lower(username) = lower(?) AND id <> ?', [username, userId]);
        if (existingUser) {
            return res.status(409).json({ error: 'Ja existe um usuario com esse nome' });
        }

        const wasAdmin = user.role === 'admin' || user.role === 'gestor_admin';
        const willAdmin = role === 'admin' || role === 'gestor_admin';
        if (wasAdmin && !willAdmin) {
            const adminCount = await dbGet('SELECT COUNT(*) AS total FROM users WHERE role IN ("admin", "gestor_admin")');
            if (Number(adminCount?.total) <= 1) {
                return res.status(400).json({ error: 'Nao e possivel alterar o ultimo administrador' });
            }
        }

        await dbRun(
            'UPDATE users SET username = ?, role = ?, company_id = ? WHERE id = ?',
            [username, role, companyId, userId]
        );

        const effectiveOldRole = user.role === 'admin' && !user.company_id ? 'gestor_admin' : user.role;
        if (Number(userId) !== Number(req.currentUser.id) && (effectiveOldRole !== role || Number(user.company_id || 0) !== Number(companyId || 0))) {
            await dbRun('DELETE FROM sessions WHERE user_id = ?', [userId]).catch(() => {});
        }

        res.json({ id: userId, username, role, company_id: companyId, success: true });
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

app.get('/api/notification-settings', requireAuth, async (req, res) => {
    try {
        const settings = await getNotificationSettingsForCompany(getNotificationCompanyId(req));
        res.json({ settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notification-settings', requireAdmin, async (req, res) => {
    try {
        const settings = sanitizeNotificationSettings(req.body || {});
        await dbRun(
            `INSERT INTO notification_settings (company_id, settings_json, updated_by_username, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(company_id) DO UPDATE SET
                settings_json = excluded.settings_json,
                updated_by_username = excluded.updated_by_username,
                updated_at = CURRENT_TIMESTAMP`,
            [getNotificationCompanyId(req), JSON.stringify(settings), req.session?.username || null]
        );
        res.json({ settings, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/notification-dismissals', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(
            'SELECT notification_id FROM notification_dismissals WHERE company_id = ? ORDER BY dismissed_at DESC',
            [getNotificationCompanyId(req)]
        );
        res.json({ ids: rows.map((row) => row.notification_id) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notification-dismissals', requireAuth, async (req, res) => {
    try {
        const settings = await getNotificationSettingsForCompany(getNotificationCompanyId(req));
        const isAdmin = req.session?.role === 'admin' || req.session?.localAuth;
        if (!isAdmin && settings.allowUserDismiss === false) {
            return res.status(403).json({ error: 'O administrador bloqueou a remocao de notificacoes' });
        }

        const ids = Array.isArray(req.body?.ids)
            ? req.body.ids.map((id) => String(id).trim()).filter(Boolean)
            : [];

        for (const id of [...new Set(ids)].slice(0, 100)) {
            await dbRun(
                `INSERT OR IGNORE INTO notification_dismissals
                 (company_id, notification_id, dismissed_by_username, dismissed_at)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                [getNotificationCompanyId(req), id, req.session?.username || null]
            );
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/events', requireAuth, (req, res) => {
    getEventsByCompletion('event', false)
        .then((rows) => res.json(rows || []))
        .catch((err) => res.status(500).json({ error: err.message }));
});

app.get('/api/history-events', requireAuth, async (req, res) => {
    try {
        const [events, rentals] = await Promise.all([
            getEventsByCompletion('event', true),
            getEventsByCompletion('rental', true)
        ]);
        res.json({ events, rentals });
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

app.get('/api/events/:id/history', requireAuth, (req, res) => {
    const sql = `
        SELECT
            ee.id,
            ee.equipment_id,
            ee.event_id,
            ee.action_type,
            ee.performed_by_username,
            ee.created_at,
            e.name AS equipment_name,
            e.barcode
        FROM equipment_events ee
        INNER JOIN equipments e ON e.id = ee.equipment_id
        WHERE ee.event_id = ?
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
            c.name,
            SUM(cem.quantity) AS quantity
        FROM cable_event_movements cem
        INNER JOIN cables c ON c.id = cem.cable_id
        WHERE cem.event_id = ?
          AND cem.action_type = 'saida'
        GROUP BY cem.cable_id, c.name
        ORDER BY lower(c.name) ASC, cem.cable_id ASC
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
            c.name,
            SUM(CASE WHEN cem.action_type = 'saida' THEN cem.quantity ELSE 0 END) AS saida,
            SUM(CASE WHEN cem.action_type = 'entrada' THEN cem.quantity ELSE 0 END) AS entrada,
            SUM(CASE WHEN cem.action_type = 'saida' THEN cem.quantity ELSE -cem.quantity END) AS final
        FROM cable_event_movements cem
        INNER JOIN cables c ON c.id = cem.cable_id
        WHERE cem.event_id = ?
        GROUP BY cem.cable_id, c.name
        ORDER BY lower(c.name) ASC, cem.cable_id ASC
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
            oi.name,
            SUM(CASE WHEN oiem.action_type = 'saida' THEN oiem.quantity ELSE 0 END) AS saida,
            SUM(CASE WHEN oiem.action_type = 'entrada' THEN oiem.quantity ELSE 0 END) AS entrada,
            SUM(CASE WHEN oiem.action_type = 'saida' THEN oiem.quantity ELSE -oiem.quantity END) AS final
        FROM other_item_event_movements oiem
        INNER JOIN other_items oi ON oi.id = oiem.item_id
        WHERE oiem.event_id = ?
        GROUP BY oiem.item_id, oi.name
        ORDER BY lower(oi.name) ASC, oiem.item_id ASC
    `;

    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/events', requireAuth, (req, res) => {
    const { name, date } = req.body;
    const createdByUsername = String(req.session?.username || '').trim() || null;

    db.run(
        "INSERT INTO events (name, date, created_by_username, event_type) VALUES (?, ?, ?, 'event')",
        [name, date, createdByUsername],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
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

app.patch('/api/rental-events/:id', requireAuth, async (req, res) => {
    try {
        const eventId = Number(req.params.id);
        const withdrawalDate = String(req.body?.withdrawalDate || '').trim();
        const returnDate = String(req.body?.returnDate || '').trim();

        if (!withdrawalDate || !returnDate) {
            return res.status(400).json({ error: 'Data de retirada e data de devolucao sao obrigatorias' });
        }

        if (returnDate < withdrawalDate) {
            return res.status(400).json({ error: 'A data de devolucao nao pode ser anterior a data de retirada' });
        }

        const event = await dbGet(
            "SELECT id FROM events WHERE id = ? AND COALESCE(event_type, 'event') = 'rental'",
            [eventId]
        );
        if (!event) return res.status(404).json({ error: 'Locacao nao encontrada' });

        await dbRun(
            'UPDATE events SET date = ?, withdrawal_date = ?, return_date = ? WHERE id = ?',
            [withdrawalDate, withdrawalDate, returnDate, eventId]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
            equipments.*,
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
            cables.*,
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

    if (!cableId) {
        return res.status(400).json({ message: 'id do cabo e obrigatorio' });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ message: 'Quantidade invalida' });
    }

    try {
        const cable = await dbGet('SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) {
            return res.status(404).json({ message: 'Cabo nao encontrado' });
        }

        await dbRun(
            `UPDATE cables
             SET quantity = ?, available_quantity = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [quantity, quantity, cableId]
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
        `SELECT *
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

    if (!itemId) {
        return res.status(400).json({ message: 'id do item e obrigatorio' });
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({ message: 'Quantidade invalida' });
    }

    try {
        const item = await dbGet('SELECT * FROM other_items WHERE id = ?', [itemId]);
        if (!item) {
            return res.status(404).json({ message: 'Item nao encontrado' });
        }

        await dbRun(
            `UPDATE other_items
             SET quantity = ?, available_quantity = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [quantity, quantity, itemId]
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

        if (type === 'saida') {
            if (!isAvailableStatus(equipment.current_status)) {
                return res.status(409).json({ message: 'Equipamento ja esta indisponivel' });
            }

            await dbRun(
                "INSERT INTO equipment_events (equipment_id, event_id, action_type, performed_by_username) VALUES (?, ?, 'saida', ?)",
                [resolvedEquipmentId, eventId, performedByUsername]
            );
            await dbRun("UPDATE equipments SET current_status = 'Indisponivel' WHERE id = ?", [resolvedEquipmentId]);

            return res.json({ success: true, equipment });
        }

        const lastMovement = await dbGet(
            `SELECT action_type
             FROM equipment_events
             WHERE equipment_id = ? AND event_id = ?
             ORDER BY datetime(created_at) DESC, id DESC
             LIMIT 1`,
            [resolvedEquipmentId, eventId]
        );

        if (!lastMovement || lastMovement.action_type !== 'saida') {
            return res.status(409).json({ message: 'Este equipamento nao possui saida pendente neste evento' });
        }

        await dbRun(
            "INSERT INTO equipment_events (equipment_id, event_id, action_type, performed_by_username) VALUES (?, ?, 'entrada', ?)",
            [resolvedEquipmentId, eventId, performedByUsername]
        );
        await dbRun("UPDATE equipments SET current_status = 'Disponivel' WHERE id = ?", [resolvedEquipmentId]);

        return res.json({ success: true, equipment });
    } catch (err) {
        console.error('Erro ao registrar movimentacao:', err);
        return res.status(500).json({ message: err.message });
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

        if (type === 'saida') {
            if (Number(cable.available_quantity) < quantity) {
                return res.status(409).json({ message: 'Quantidade insuficiente em estoque' });
            }

            await dbRun(
                "INSERT INTO cable_event_movements (cable_id, event_id, action_type, quantity) VALUES (?, ?, 'saida', ?)",
                [cableId, eventId, quantity]
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
             WHERE cable_id = ? AND event_id = ?`,
            [cableId, eventId]
        );

        if (!pendingMovement || Number(pendingMovement.quantity) < quantity) {
            return res.status(409).json({ message: 'Este cabo nao possui saida pendente suficiente neste evento' });
        }

        await dbRun(
            "INSERT INTO cable_event_movements (cable_id, event_id, action_type, quantity) VALUES (?, ?, 'entrada', ?)",
            [cableId, eventId, quantity]
        );
        await dbRun(
            'UPDATE cables SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [quantity, cableId]
        );

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao registrar movimentacao de cabo:', err);
        return res.status(500).json({ message: err.message });
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

        if (type === 'saida') {
            if (Number(item.available_quantity) < quantity) {
                return res.status(409).json({ message: 'Quantidade insuficiente em estoque' });
            }

            await dbRun(
                "INSERT INTO other_item_event_movements (item_id, event_id, action_type, quantity) VALUES (?, ?, 'saida', ?)",
                [itemId, eventId, quantity]
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
             WHERE item_id = ? AND event_id = ?`,
            [itemId, eventId]
        );

        if (!pendingMovement || Number(pendingMovement.quantity) < quantity) {
            return res.status(409).json({ message: 'Este item nao possui saida pendente suficiente neste evento' });
        }

        await dbRun(
            "INSERT INTO other_item_event_movements (item_id, event_id, action_type, quantity) VALUES (?, ?, 'entrada', ?)",
            [itemId, eventId, quantity]
        );
        await dbRun(
            'UPDATE other_items SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [quantity, itemId]
        );

        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao registrar movimentacao de item sem patrimonio:', err);
        return res.status(500).json({ message: err.message });
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

// ── AI Chat (Skylet) ─────────────────────────────────────────────────────────
app.post('/api/chat', requireAuth, async (req, res) => {
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
    const CF_AI_TOKEN   = process.env.CLOUDFLARE_AI_TOKEN;

    if (!CF_ACCOUNT_ID || !CF_AI_TOKEN) {
        return res.status(503).json({
            error: 'IA disponível apenas em produção. Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_AI_TOKEN para ativar localmente.'
        });
    }

    const message = String(req.body.message || '').trim().slice(0, 1200);
    const rawHistory = Array.isArray(req.body.history) ? req.body.history : [];
    if (!message) return res.status(400).json({ error: 'Mensagem obrigatória' });

    const history = rawHistory.slice(-20).map(h => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: String(h.content || '').slice(0, 600),
    }));

    let dbContext = '';
    try {
        const [equip, equipAvail, cables, events, rentals, users] = await Promise.all([
            dbGet('SELECT COUNT(*) AS n FROM equipments'),
            dbGet("SELECT COUNT(*) AS n FROM equipments WHERE current_status = 'Disponivel'"),
            dbGet('SELECT COUNT(*) AS n FROM cables'),
            dbGet("SELECT COUNT(*) AS n FROM events WHERE COALESCE(event_type,'event') = 'event'"),
            dbGet("SELECT COUNT(*) AS n FROM events WHERE event_type = 'rental'"),
            dbGet('SELECT COUNT(*) AS n FROM users'),
        ]);
        dbContext = '\n\nDADOS ATUAIS DA SUA CONTA:' +
            `\n- Equipamentos: ${equip?.n ?? 0} cadastrados, ${equipAvail?.n ?? 0} disponíveis` +
            `\n- Tipos de cabo: ${cables?.n ?? 0}` +
            `\n- Eventos ativos: ${events?.n ?? 0} eventos, ${rentals?.n ?? 0} locações` +
            `\n- Usuários cadastrados: ${users?.n ?? 0}`;
    } catch (_) {}

    const systemPrompt = 'Você é a Skylet, assistente virtual de um sistema de gestão de estoque para empresas de eventos. Responda sempre em português brasileiro, de forma clara e prática. Nunca mencione o nome de nenhum sistema ou produto. Quando se identificar, diga apenas que é a Skylet. Quando for útil direcionar o usuário a uma seção, inclua no final da resposta exatamente um marcador [NAVEGAR:sectionId|Texto do botão]. Seções válidas: home, eventos, locacao, manutencao, banco-de-dados, cadastro, historico, config.' + dbContext;

    const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
    ];

    try {
        const cfRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CF_AI_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messages, max_tokens: 800 }),
            }
        );
        if (!cfRes.ok) {
            console.error('Cloudflare AI error:', await cfRes.text());
            return res.status(502).json({ error: 'Erro ao processar resposta da IA' });
        }
        const cfData = await cfRes.json();
        const reply = (cfData?.result?.response || '').trim() || 'Não consegui processar sua pergunta no momento.';
        return res.json({ reply });
    } catch (err) {
        console.error('AI chat error:', err);
        return res.status(502).json({ error: 'Erro ao processar resposta da IA' });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor: http://localhost:${PORT}`));
