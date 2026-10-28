import bcrypt from 'bcryptjs';
import {
    getD1ErrorMessage,
    isD1UnavailableError,
    isD1WriteOutcomeUnknownError,
    isRetryableD1Error,
    isRetrySafeSql,
    protectD1WriteOutcome,
    withD1Retry
} from './d1-resilience.mjs';
import {
    ensureAutomaticScheduledEvents,
    findEquipmentDateConflict,
    findEquipmentGroupCapacityConflict,
    getEventEquipmentRequirements,
    handleQuoteRequest
} from './worker-quotes.mjs';

const SESSION_COOKIE_NAME = 'sessao24h';
const SESSION_DURATION_SECONDS = 60 * 60 * 24;
const LOCAL_STARLINK_ROUTE_PREFIX = '/api/local-starlinks';
const LOCAL_STARLINK_PLANS = new Set([
    'Residencial',
    'Viagem 100g',
    'Viagem ilimitado'
]);
const TEST_USERNAME = 'teste';
const INITIAL_QUANTITY_EDITOR_USERNAME = 'arthur';
const INITIAL_QUANTITY_EDIT_PASSWORD = '3418';
const USER_ROLES = new Set(['admin', 'user', 'comercial']);
const OPERATOR_PHOTO_MAX_LENGTH = 2_500_000;
const OPERATOR_PHOTO_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const PRICE_TABLES = {
    equipment: {
        table: 'equipments',
        categoryColumn: 'category'
    },
    cable: {
        table: 'cables',
        categoryColumn: 'category'
    },
    other: {
        table: 'other_items',
        categoryColumn: 'category'
    }
};
const PROTECTED_PAGES = new Set([
    '/dashboard.html',
    '/event.html',
    '/entrada.html',
    '/saida.html'
]);
const PAGE_ASSET_PATHS = new Map([
    ['/index.html', '/html/index.html'],
    ['/login.html', '/html/login.html'],
    ['/dashboard.html', '/html/dashboard.html'],
    ['/event.html', '/html/event.html'],
    ['/entrada.html', '/html/entrada.html'],
    ['/saida.html', '/html/saida.html']
]);
const LEGACY_ASSET_PATHS = new Map([
    ['/dashboard.css', '/css/dashboard.css'],
    ['/event.css', '/css/event.css'],
    ['/login.css', '/css/login.css'],
    ['/style.css', '/css/style.css'],
    ['/dashboard.js', '/javascript/dashboard.js'],
    ['/event.js', '/javascript/event.js'],
    ['/login.js', '/javascript/login.js'],
    ['/script.js', '/javascript/script.js'],
    ['/logo.PNG', '/fotos/logo.PNG'],
    ['/quote-header.png', '/fotos/quote-header.png'],
    ['/quote-signature.png', '/fotos/quote-signature.png']
]);

export default {
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);

            if (url.pathname.startsWith('/api/')) {
                return await handleApiRequest(request, env, ctx);
            }

            return await handlePageRequest(request, env);
        } catch (error) {
            if (isD1WriteOutcomeUnknownError(error)) {
                return databaseWriteOutcomeUnknownResponse(error, request);
            }
            if (isD1UnavailableError(error)) {
                return databaseUnavailableResponse(error, request);
            }
            if (getD1LedgerConflictCode(error)) {
                return databaseIntegrityConflictResponse(error, request);
            }
            console.error(JSON.stringify({
                message: 'worker request failed',
                method: request.method,
                path: new URL(request.url).pathname,
                requestId: getRequestId(request),
                error: error instanceof Error ? error.message : String(error)
            }));
            if (error?.statusCode) {
                return json({ message: error.message }, error.statusCode);
            }
            return json({ error: 'Erro interno do servidor' }, 500);
        }
    }
};

async function handlePageRequest(request, env) {
    const url = new URL(request.url);
    const session = await getSessionFromRequest(request, env);
    const publicPathname = normalizePublicPagePath(url.pathname);

    if ((publicPathname === '/index.html' || publicPathname === '/login.html') && session) {
        return Response.redirect(new URL('/dashboard.html', url.origin), 302);
    }

    if (PROTECTED_PAGES.has(publicPathname) && !session) {
        return Response.redirect(new URL('/login.html', url.origin), 302);
    }

    const assetPath = PAGE_ASSET_PATHS.get(publicPathname) || LEGACY_ASSET_PATHS.get(url.pathname);
    if (assetPath) {
        return fetchAssetPath(request, env, assetPath);
    }

    return env.ASSETS.fetch(request);
}

function normalizePublicPagePath(pathname) {
    if (pathname === '/') {
        return '/index.html';
    }

    if (pathname.startsWith('/html/')) {
        return `/${pathname.slice('/html/'.length)}`;
    }

    return pathname;
}

function fetchAssetPath(request, env, pathname) {
    const assetUrl = new URL(request.url);
    assetUrl.pathname = pathname;
    return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
}

function isLocalStarlinkTabEnabled(env) {
    return env.LOCAL_STARLINK_TAB_ENABLED === 'true';
}

async function handleLocalStarlinkRequest({ request, env, session, url }) {
    if (!url.pathname.startsWith(LOCAL_STARLINK_ROUTE_PREFIX)) {
        return null;
    }

    if (!isLocalStarlinkTabEnabled(env)) {
        return json({ error: 'Rota não encontrada' }, 404);
    }

    if (!isAdminSession(session)) {
        return json({ error: 'Acesso restrito a administradores' }, 403);
    }

    if (url.pathname === LOCAL_STARLINK_ROUTE_PREFIX && request.method === 'GET') {
        const starlinks = await queryAll(
            env,
            `SELECT equipment_id AS equipmentId, name, model, stock_number AS stockNumber, is_on AS isOn, selected_plan AS selectedPlan, activated_at AS activatedAt
             FROM local_starlink_inventory
             ORDER BY CASE model WHEN 'v2' THEN 1 WHEN 'mini' THEN 2 ELSE 3 END, CAST(stock_number AS INTEGER), equipment_id`
        );
        return json({ starlinks: starlinks.map((starlink) => ({
            ...starlink,
            isOn: Number(starlink.isOn) === 1
        })) });
    }

    const statusMatch = url.pathname.match(/^\/api\/local-starlinks\/(\d+)\/status$/);
    if (statusMatch && request.method === 'PATCH') {
        const equipmentId = Number(statusMatch[1]);
        const body = await readJson(request);
        const isOn = body?.isOn;
        const selectedPlan = isOn === true ? String(body?.plan || '').trim() : 'Modo espera';
        if (
            !Number.isInteger(equipmentId)
            || equipmentId <= 0
            || typeof isOn !== 'boolean'
            || (isOn && !LOCAL_STARLINK_PLANS.has(selectedPlan))
        ) {
            return json({ error: 'Status da Starlink inválido' }, 400);
        }

        await execute(
            env,
            `UPDATE local_starlink_inventory
             SET is_on = ?, selected_plan = ?, activated_at = CASE
                WHEN ? = 1 AND is_on = 0 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHEN ? = 0 THEN NULL
                ELSE activated_at
             END
             WHERE equipment_id = ?`,
            [isOn ? 1 : 0, selectedPlan, isOn ? 1 : 0, isOn ? 1 : 0, equipmentId]
        );
        const starlink = await queryFirst(
            env,
            `SELECT equipment_id AS equipmentId, name, model, stock_number AS stockNumber, is_on AS isOn, selected_plan AS selectedPlan, activated_at AS activatedAt
             FROM local_starlink_inventory WHERE equipment_id = ?`,
            [equipmentId]
        );
        if (!starlink) return json({ error: 'Starlink não encontrada' }, 404);

        return json({
            starlink: {
                ...starlink,
                isOn: Number(starlink.isOn) === 1
            }
        });
    }

    return json({ error: 'Rota não encontrada' }, 404);
}

async function handleApiRequest(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/api/login' && request.method === 'POST') {
        return login(request, env);
    }

    if (pathname === '/api/logout' && request.method === 'POST') {
        return logout(request, env);
    }

    if (pathname === '/api/auth/status' && request.method === 'GET') {
        const session = await getSessionFromRequest(request, env);
        const role = normalizeUserRole(session?.role);
        return json({
            authenticated: !!session,
            isTestUser: session?.username === TEST_USERNAME,
            userId: session?.user_id || null,
            username: session?.username || null,
            role: session ? role : null,
            isAdmin: role === 'admin',
            isCommercial: role === 'comercial',
            canEditInitialQuantity: session ? canShowInitialQuantityEdit(session.username) : false,
            localStarlinkTabEnabled: isLocalStarlinkTabEnabled(env)
        });
    }

    const session = await getSessionFromRequest(request, env);
    if (!session) {
        return json({ error: 'Não autorizado' }, 401);
    }

    // O servidor local isola o usuário de teste em uma cópia completa do
    // SQLite. No D1 compartilhado não há isolamento por sessão, então o modo
    // publicado é somente leitura para impedir reversões de dados reais.
    if (session.username === TEST_USERNAME && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        return json({ error: 'O usuário de teste possui acesso somente para consulta no site publicado.' }, 403);
    }

    const localStarlinkResponse = await handleLocalStarlinkRequest({ request, env, session, url });
    if (localStarlinkResponse) {
        return localStarlinkResponse;
    }

    const quoteResponse = await handleQuoteRequest({
        request,
        env,
        executionCtx: ctx,
        session,
        url,
        helpers: {
            queryAll,
            queryFirst,
            execute,
            batch: executeBatch,
            json,
            readJson,
            tableExists,
            tableHasColumn,
            ensureColumn
        }
    });
    if (quoteResponse) {
        return quoteResponse;
    }

    if (pathname === '/api/users' && request.method === 'GET') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const users = await queryAll(
            env,
            `SELECT id, username, COALESCE(role, 'user') AS role
             FROM users
             ORDER BY lower(username) ASC`
        );
        return json({
            users,
            canChangePasswords: isAdminSession(session)
        });
    }

    if (pathname === '/api/users' && request.method === 'POST') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const body = await readJson(request);
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        const role = normalizeUserRole(body.role || 'user');

        if (!username) return json({ error: 'Usuário é obrigatório' }, 400);
        if (password.trim().length < 4) {
            return json({ error: 'A senha deve ter pelo menos 4 caracteres' }, 400);
        }

        const existingUser = await queryFirst(env, 'SELECT id FROM users WHERE lower(username) = lower(?)', [username]);
        if (existingUser) {
            return json({ error: 'Já existe um usuário com esse nome' }, 409);
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        const result = await execute(
            env,
            'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
            [username, passwordHash, role]
        );
        return json({ id: result.meta.last_row_id, username, role, success: true });
    }

    if (pathname === '/api/prices' && request.method === 'GET') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const type = String(url.searchParams.get('type') || '').trim().toLowerCase();
        const search = cleanText(url.searchParams.get('search'), 120);
        const config = PRICE_TABLES[type];
        if (!config) {
            return json({ error: 'Tipo de item inválido' }, 400);
        }

        const items = await getPriceItems(env, type, search);
        return json({ type, items });
    }

    const priceMatch = pathname.match(/^\/api\/prices\/([^/]+)\/(\d+)$/);
    if (priceMatch && request.method === 'PATCH') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const type = String(priceMatch[1] || '').trim().toLowerCase();
        const itemId = Number(priceMatch[2]);
        const config = PRICE_TABLES[type];
        if (!config || !Number.isInteger(itemId) || itemId <= 0) {
            return json({ error: 'Item inválido' }, 400);
        }

        const body = await readJson(request);
        const unitPrice = roundMoney(parseMoneyValue(body.unitPrice));
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            return json({ error: 'Preço inválido' }, 400);
        }

        const item = await queryFirst(env, `SELECT id, name FROM ${config.table} WHERE id = ?`, [itemId]);
        if (!item) {
            return json({ error: 'Item não encontrado' }, 404);
        }

        if (type === 'equipment') {
            await execute(
                env,
                `UPDATE equipments SET unit_price = ? WHERE lower(trim(name)) = lower(trim(?))`,
                [unitPrice, item.name]
            );
        } else {
            await execute(env, `UPDATE ${config.table} SET unit_price = ? WHERE id = ?`, [unitPrice, itemId]);
        }
        return json({ success: true, id: itemId, type, unitPrice });
    }

    if (pathname === '/api/scheduled-events' && request.method === 'GET') {
        await ensureAutomaticScheduledEvents(env, {
            queryAll,
            queryFirst,
            execute,
            batch: executeBatch,
            tableExists,
            tableHasColumn,
            ensureColumn
        });
        return getScheduledEvents(env);
    }

    if (pathname === '/api/orcamentos/equipamentos-banco' && request.method === 'GET') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const search = cleanText(url.searchParams.get('search'), 120);
        const equipments = await getQuoteDatabaseEquipments(env, search);
        return json({ equipments });
    }

    const quoteEquipmentVisibilityMatch = pathname.match(/^\/api\/orcamentos\/equipamentos\/(\d+)\/(ocultar|restaurar)$/);
    if (quoteEquipmentVisibilityMatch && request.method === 'POST') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const equipmentId = Number(quoteEquipmentVisibilityMatch[1]);
        const action = quoteEquipmentVisibilityMatch[2];
        if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
            return json({ error: 'Equipamento inválido.' }, 400);
        }

        const equipment = await queryFirst(env, 'SELECT id FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) {
            return json({ error: 'Equipamento não encontrado.' }, 404);
        }

        if (action === 'ocultar') {
            await execute(
                env,
                `INSERT INTO quote_hidden_equipments (equipment_id, hidden_by_username)
                 VALUES (?, ?)
                 ON CONFLICT(equipment_id) DO UPDATE SET
                    hidden_by_username = excluded.hidden_by_username,
                    hidden_at = CURRENT_TIMESTAMP`,
                [equipmentId, session?.username || null]
            );
            return json({ success: true, equipmentId, hiddenFromQuotes: true });
        }

        await execute(env, 'DELETE FROM quote_hidden_equipments WHERE equipment_id = ?', [equipmentId]);
        return json({ success: true, equipmentId, hiddenFromQuotes: false });
    }

    if (pathname === '/api/orcamentos/equipamentos-disponiveis' && request.method === 'GET') {
        if (!canAccessQuotes(session)) {
            return json({ error: 'Acesso restrito à tela de orçamentos' }, 403);
        }

        const search = cleanText(url.searchParams.get('search'), 120);
        if (!search) {
            return json({ equipments: [] });
        }

        const equipments = await getAvailableQuoteEquipments(env, search);
        return json({ equipments });
    }

    const userPasswordMatch = pathname.match(/^\/api\/users\/(\d+)\/password$/);
    if (userPasswordMatch && request.method === 'PATCH') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const userId = Number(userPasswordMatch[1]);
        const body = await readJson(request);
        const password = String(body.password || '');
        if (!userId) return json({ error: 'Usuário inválido' }, 400);
        if (password.trim().length < 4) {
            return json({ error: 'A senha deve ter pelo menos 4 caracteres' }, 400);
        }

        const user = await queryFirst(env, 'SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) return json({ error: 'Usuário não encontrado' }, 404);

        const passwordHash = bcrypt.hashSync(password, 10);
        await executeBatch(env, [
            { sql: 'UPDATE users SET password = ? WHERE id = ?', params: [passwordHash, userId] },
            { sql: 'DELETE FROM sessions WHERE user_id = ?', params: [userId] }
        ]);
        return json({ success: true });
    }

    const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
    if (userMatch && request.method === 'DELETE') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const userId = Number(userMatch[1]);
        if (!userId) return json({ error: 'Usuário inválido' }, 400);

        const user = await queryFirst(env, 'SELECT id, username, COALESCE(role, "user") AS role FROM users WHERE id = ?', [userId]);
        if (!user) return json({ error: 'Usuário não encontrado' }, 404);
        if (Number(user.id) === Number(session.user_id)) {
            return json({ error: 'Você não pode excluir seu próprio usuário' }, 400);
        }

        const [deleteUserResult] = await executeBatch(env, [
            {
                sql: `DELETE FROM users
                      WHERE id = ?
                        AND (
                            COALESCE(role, 'user') <> 'admin'
                            OR EXISTS (
                                SELECT 1 FROM users AS another_admin
                                WHERE another_admin.id <> users.id
                                  AND another_admin.role = 'admin'
                            )
                        )`,
                params: [userId]
            },
            {
                sql: `DELETE FROM sessions
                      WHERE user_id = ?
                        AND NOT EXISTS (SELECT 1 FROM users WHERE id = ?)`,
                params: [userId, userId]
            }
        ]);
        if (Number(deleteUserResult?.meta?.changes) === 0) {
            const remainingUser = await queryFirst(env, 'SELECT id FROM users WHERE id = ?', [userId]);
            if (!remainingUser) {
                return json({ success: true, replayed: true });
            }
            return json({ error: 'Não é possível excluir o último administrador' }, 409);
        }
        return json({ success: true });
    }

    if (pathname === '/api/operators' && request.method === 'GET') {
        if (!canAccessOperators(session)) {
            return json({ error: 'Acesso restrito a técnicos' }, 403);
        }

        const search = cleanText(url.searchParams.get('search'), 120);
        const rows = await queryAll(
            env,
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
        return json({ operators: rows.map(serializeOperator) });
    }

    if (pathname === '/api/operators' && request.method === 'POST') {
        if (!canAccessOperators(session)) {
            return json({ error: 'Acesso restrito a técnicos' }, 403);
        }

        const body = await readJson(request);
        let operatorData;
        try {
            operatorData = normalizeOperatorPayload(body, { requirePhoto: true });
        } catch (error) {
            return json({ error: error.message }, error.statusCode || 400);
        }

        try {
            const result = await execute(
                env,
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
                    session?.username || null
                ]
            );
            return json({ id: result.meta.last_row_id, success: true });
        } catch (error) {
            return handleDatabaseError(error, 'Já existe um técnico com esse CPF');
        }
    }

    const operatorMatch = pathname.match(/^\/api\/operators\/(\d+)$/);
    if (operatorMatch && request.method === 'GET') {
        if (!canAccessOperators(session)) {
            return json({ error: 'Acesso restrito a técnicos' }, 403);
        }

        const operatorId = Number(operatorMatch[1]);
        const row = await queryFirst(
            env,
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
        if (!row) return json({ error: 'Técnico não encontrado' }, 404);
        return json({ operator: serializeOperator(row) });
    }

    if (operatorMatch && request.method === 'PATCH') {
        if (!canAccessOperators(session)) {
            return json({ error: 'Acesso restrito a técnicos' }, 403);
        }

        const operatorId = Number(operatorMatch[1]);
        const existing = await queryFirst(env, 'SELECT id FROM operators WHERE id = ?', [operatorId]);
        if (!existing) return json({ error: 'Técnico não encontrado' }, 404);

        const body = await readJson(request);
        let operatorData;
        try {
            operatorData = normalizeOperatorPayload(body, { requirePhoto: true });
        } catch (error) {
            return json({ error: error.message }, error.statusCode || 400);
        }

        try {
            await execute(
                env,
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
            return json({ success: true, id: operatorId });
        } catch (error) {
            return handleDatabaseError(error, 'Já existe um técnico com esse CPF');
        }
    }

    if (operatorMatch && request.method === 'DELETE') {
        if (!canAccessOperators(session)) {
            return json({ error: 'Acesso restrito a técnicos' }, 403);
        }

        const operatorId = Number(operatorMatch[1]);
        const existing = await queryFirst(env, 'SELECT id FROM operators WHERE id = ?', [operatorId]);
        if (!existing) return json({ error: 'Técnico não encontrado' }, 404);

        await execute(env, 'DELETE FROM operators WHERE id = ?', [operatorId]);
        return json({ success: true, id: operatorId });
    }

    if (pathname === '/api/events' && request.method === 'GET') {
        await ensureAutomaticScheduledEvents(env, {
            queryAll,
            queryFirst,
            execute,
            batch: executeBatch,
            tableExists,
            tableHasColumn,
            ensureColumn
        });
        const rows = await getEventsByCompletion(env, 'event', false);
        return json(rows);
    }

    if (pathname === '/api/events' && request.method === 'POST') {
        const body = await readJson(request);
        const name = String(body.name || '').trim();
        const date = parseIsoDateKey(body.date);
        const endDate = parseIsoDateKey(body.endDate || body.end_date || body.date);

        if (!name || !date || !endDate) {
            return json({ error: 'Nome, data inicial e data final são obrigatórios' }, 400);
        }
        if (endDate < date) {
            return json({ error: 'A data final não pode ser anterior à data inicial' }, 400);
        }

        const result = await execute(
            env,
            "INSERT INTO events (name, date, end_date, created_by_username, event_type) VALUES (?, ?, ?, ?, 'event')",
            [name, date, endDate, session?.username || null]
        );
        return json({ id: result.meta.last_row_id, success: true });
    }

    if (pathname === '/api/rental-events' && request.method === 'GET') {
        const rows = await getEventsByCompletion(env, 'rental', false);
        return json(rows);
    }

    if (pathname === '/api/history-events' && request.method === 'GET') {
        await ensureAutomaticScheduledEvents(env, {
            queryAll,
            queryFirst,
            execute,
            batch: executeBatch,
            tableExists,
            tableHasColumn,
            ensureColumn
        });
        const [events, rentals] = await Promise.all([
            getEventsByCompletion(env, 'event', true),
            getEventsByCompletion(env, 'rental', true)
        ]);
        return json({ events, rentals });
    }

    if (pathname === '/api/equipment-tracker' && request.method === 'GET') {
        const search = cleanText(url.searchParams.get('search'), 120);
        if (!search) {
            return json({ matches: [] });
        }

        const searchPattern = `%${escapeSqlLikePattern(search)}%`;
        const normalizedBarcode = normalizeEquipmentBarcode(search);
        const matches = await queryAll(
            env,
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

        return json({ matches });
    }

    if (pathname === '/api/rental-return-alerts' && request.method === 'GET') {
        const today = String(url.searchParams.get('today') || new Date().toISOString().slice(0, 10)).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
            return json({ error: 'Data inválida' }, 400);
        }

        const alerts = await getRentalReturnAlerts(env, today);
        return json(alerts);
    }

    if (pathname === '/api/rental-events' && request.method === 'POST') {
        const body = await readJson(request);
        const name = String(body.name || '').trim();
        const withdrawalDate = String(body.withdrawalDate || '').trim();
        const returnDate = String(body.returnDate || '').trim();
        const session = await getSessionFromRequest(request, env);

        if (!name || !withdrawalDate || !returnDate) {
            return json({ error: 'Nome, data de retirada e data de devolução são obrigatórios' }, 400);
        }

        if (returnDate < withdrawalDate) {
            return json({ error: 'A data de devolução não pode ser anterior à data de retirada' }, 400);
        }

        const result = await execute(
            env,
            `INSERT INTO events (name, date, created_by_username, event_type, withdrawal_date, return_date)
             VALUES (?, ?, ?, 'rental', ?, ?)`,
            [name, withdrawalDate, session?.username || null, withdrawalDate, returnDate]
        );
        return json({ id: result.meta.last_row_id, success: true });
    }

    const rentalEventMatch = pathname.match(/^\/api\/rental-events\/(\d+)$/);
    if (rentalEventMatch && request.method === 'GET') {
        const event = await queryFirst(
            env,
            "SELECT * FROM events WHERE id = ? AND COALESCE(event_type, 'event') = 'rental'",
            [Number(rentalEventMatch[1])]
        );
        if (!event) return json({ error: 'Locação não encontrada' }, 404);
        return json(event);
    }

    if (rentalEventMatch && request.method === 'DELETE') {
        const body = await readJson(request);
        const password = String(body.password || '').trim();

        if (!(await verifyDeletePassword(password, env))) {
            return json({ message: 'Senha incorreta' }, 403);
        }

        const eventId = Number(rentalEventMatch[1]);
        const event = await queryFirst(
            env,
            "SELECT id FROM events WHERE id = ? AND COALESCE(event_type, 'event') = 'rental'",
            [eventId]
        );
        if (!event) return json({ error: 'Locação não encontrada' }, 404);

        await deleteEventRecords(env, eventId);
        return json({ success: true });
    }

    const eventMatch = pathname.match(/^\/api\/events\/(\d+)$/);
    if (eventMatch && request.method === 'GET') {
        const event = await queryFirst(env, 'SELECT * FROM events WHERE id = ?', [Number(eventMatch[1])]);
        if (!event) return json({ error: 'Evento não encontrado' }, 404);
        return json(event);
    }

    const reservedEquipmentsMatch = pathname.match(/^\/api\/events\/(\d+)\/reserved-equipments$/);
    if (reservedEquipmentsMatch && request.method === 'GET') {
        const eventId = Number(reservedEquipmentsMatch[1]);
        const event = await queryFirst(env, 'SELECT id FROM events WHERE id = ?', [eventId]);
        if (!event) return json({ error: 'Evento não encontrado' }, 404);

        const rows = await queryAll(
            env,
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
        return json(rows);
    }

    const equipmentRequirementsMatch = pathname.match(/^\/api\/events\/(\d+)\/equipment-requirements$/);
    if (equipmentRequirementsMatch && request.method === 'GET') {
        const eventId = Number(equipmentRequirementsMatch[1]);
        const event = await queryFirst(env, 'SELECT id FROM events WHERE id = ?', [eventId]);
        if (!event) return json({ error: 'Evento não encontrado' }, 404);

        const requirements = await getEventEquipmentRequirements(env, eventId, {
            queryAll,
            queryFirst,
            execute,
            batch: executeBatch,
            tableExists,
            tableHasColumn,
            ensureColumn
        });
        return json({ requirements });
    }

    const eventSpacesMatch = pathname.match(/^\/api\/events\/(\d+)\/spaces$/);
    if (eventSpacesMatch && request.method === 'GET') {
        const eventId = Number(eventSpacesMatch[1]);
        const event = await queryFirst(env, 'SELECT id FROM events WHERE id = ?', [eventId]);
        if (!event) return json({ error: 'Evento não encontrado' }, 404);

        const spaces = await queryAll(
            env,
            `SELECT id, event_id, name, created_at
             FROM event_spaces
             WHERE event_id = ?
             ORDER BY datetime(created_at) ASC, id ASC`,
            [eventId]
        );
        return json(spaces);
    }

    if (eventSpacesMatch && request.method === 'POST') {
        const eventId = Number(eventSpacesMatch[1]);
        const body = await readJson(request);
        const name = String(body.name || '').trim();

        if (!name) return json({ error: 'Nome do espaço é obrigatório' }, 400);
        if (name.length > 80) return json({ error: 'Nome do espaço deve ter até 80 caracteres' }, 400);

        const event = await queryFirst(env, 'SELECT id FROM events WHERE id = ?', [eventId]);
        if (!event) return json({ error: 'Evento não encontrado' }, 404);

        const result = await execute(
            env,
            `INSERT INTO event_spaces (event_id, name)
             SELECT ?, ?
             WHERE EXISTS (SELECT 1 FROM events WHERE id = ?)`,
            [eventId, name, eventId]
        );
        if (Number(result?.meta?.changes) !== 1) {
            return json({ error: 'O evento foi excluído durante a operação. Atualize a tela.' }, 409);
        }
        return json({
            id: result.meta.last_row_id,
            event_id: eventId,
            name
        });
    }

    const historyMatch = pathname.match(/^\/api\/events\/(\d+)\/history$/);
    if (historyMatch && request.method === 'GET') {
        const rows = await queryAll(
            env,
            `SELECT
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
             ORDER BY datetime(ee.created_at) ASC, ee.id ASC`,
            [Number(historyMatch[1])]
        );
        return json(rows);
    }

    const transferTargetsMatch = pathname.match(/^\/api\/events\/(\d+)\/transfer-targets$/);
    if (transferTargetsMatch && request.method === 'GET') {
        const sourceEventId = Number(transferTargetsMatch[1]);
        const sourceEvent = await queryFirst(env, 'SELECT id FROM events WHERE id = ?', [sourceEventId]);
        if (!sourceEvent) return json({ error: 'Evento de origem não encontrado' }, 404);

        await ensureAutomaticScheduledEvents(env, {
            queryAll,
            queryFirst,
            execute,
            batch: executeBatch,
            tableExists,
            tableHasColumn,
            ensureColumn
        });

        const events = await queryAll(
            env,
            `SELECT id, name, date, end_date, event_type, withdrawal_date, return_date, orcamento_id
             FROM events
             WHERE id <> ?
             ORDER BY COALESCE(withdrawal_date, date) DESC, id DESC`,
            [sourceEventId]
        );
        return json(events);
    }

    const transferOutstandingMatch = pathname.match(/^\/api\/events\/(\d+)\/transfer-outstanding$/);
    if (transferOutstandingMatch && request.method === 'POST') {
        const sourceEventId = Number(transferOutstandingMatch[1]);
        const body = await readJson(request);
        const targetEventId = Number(body.targetEventId);
        const categories = [...new Set(
            (Array.isArray(body.categories) ? body.categories : ['equipment'])
                .map((category) => String(category || '').trim().toLowerCase())
                .filter((category) => ['equipment', 'cable', 'other'].includes(category))
        )];

        if (!Number.isInteger(targetEventId) || targetEventId <= 0 || targetEventId === sourceEventId) {
            return json({ error: 'Selecione um evento de destino diferente do atual' }, 400);
        }
        if (!categories.length) {
            return json({ error: 'Selecione ao menos um tipo de item para transferir' }, 400);
        }

        const [sourceEvent, targetEvent] = await Promise.all([
            queryFirst(env, 'SELECT id, name FROM events WHERE id = ?', [sourceEventId]),
            queryFirst(env, 'SELECT id, name FROM events WHERE id = ?', [targetEventId])
        ]);
        if (!sourceEvent) return json({ error: 'Evento de origem não encontrado' }, 404);
        if (!targetEvent) return json({ error: 'Evento de destino não encontrado' }, 404);

        const mutationRequestId = getMutationRequestId(request, body);
        const targetRequestPrefix = `${mutationRequestId}:to:${targetEventId}:`;
        const replay = await queryFirst(
            env,
            `SELECT id FROM (
                SELECT id, event_id, action_type, request_id FROM equipment_events
                UNION ALL
                SELECT id, event_id, action_type, request_id FROM cable_event_movements
                UNION ALL
                SELECT id, event_id, action_type, request_id FROM other_item_event_movements
             )
             WHERE event_id = ?
               AND action_type = 'saida'
               AND request_id LIKE ? ESCAPE '\\'
             LIMIT 1`,
            [targetEventId, `${escapeSqlLikePattern(targetRequestPrefix)}%`]
        );
        if (replay) {
            return json({ success: true, replayed: true, targetEventId });
        }

        // Cada patrimônio pendente é movido do seu espaço de origem para o
        // evento de destino. Não há alteração no estoque: ele já está em saída.
        const [outstandingEquipment, outstandingCables, outstandingOtherItems] = await Promise.all([
            categories.includes('equipment')
                ? queryAll(
                    env,
                    `SELECT equipment_id, space_id
                     FROM equipment_events
                     WHERE event_id = ?
                     GROUP BY equipment_id, space_id
                     HAVING SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END) > 0
                     ORDER BY equipment_id, COALESCE(space_id, 0)`,
                    [sourceEventId]
                )
                : Promise.resolve([]),
            categories.includes('cable')
                ? queryAll(
                    env,
                    `SELECT cable_id, space_id,
                            SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS quantity
                     FROM cable_event_movements
                     WHERE event_id = ?
                     GROUP BY cable_id, space_id
                     HAVING SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) > 0
                     ORDER BY cable_id, COALESCE(space_id, 0)`,
                    [sourceEventId]
                )
                : Promise.resolve([]),
            categories.includes('other')
                ? queryAll(
                    env,
                    `SELECT item_id, space_id,
                            SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS quantity
                     FROM other_item_event_movements
                     WHERE event_id = ?
                     GROUP BY item_id, space_id
                     HAVING SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) > 0
                     ORDER BY item_id, COALESCE(space_id, 0)`,
                    [sourceEventId]
                )
                : Promise.resolve([])
        ]);
        if (!outstandingEquipment.length && !outstandingCables.length && !outstandingOtherItems.length) {
            return json({ error: 'Não há itens com saída pendente nas categorias selecionadas' }, 409);
        }

        const operations = [];
        for (const item of outstandingEquipment) {
            const equipmentId = Number(item.equipment_id);
            const sourceSpaceId = item.space_id == null ? null : Number(item.space_id);
            const spaceKey = sourceSpaceId == null ? 'geral' : String(sourceSpaceId);
            operations.push({
                sql: `INSERT INTO equipment_events
                      (equipment_id, event_id, space_id, action_type, performed_by_username, request_id)
                      VALUES (?, ?, ?, 'entrada', ?, ?)`,
                params: [
                    equipmentId,
                    sourceEventId,
                    sourceSpaceId,
                    session?.username || null,
                    `${mutationRequestId}:from:${sourceEventId}:${equipmentId}:${spaceKey}`
                ]
            });
            operations.push({
                sql: `INSERT INTO equipment_events
                      (equipment_id, event_id, space_id, action_type, performed_by_username, request_id)
                      VALUES (?, ?, NULL, 'saida', ?, ?)`,
                params: [
                    equipmentId,
                    targetEventId,
                    session?.username || null,
                    `${mutationRequestId}:to:${targetEventId}:${equipmentId}:${spaceKey}`
                ]
            });
            operations.push({
                sql: `INSERT OR IGNORE INTO event_reserved_equipments (event_id, equipment_id)
                      VALUES (?, ?)`,
                params: [targetEventId, equipmentId]
            });
        }

        for (const item of outstandingCables) {
            const cableId = Number(item.cable_id);
            const sourceSpaceId = item.space_id == null ? null : Number(item.space_id);
            const quantity = Number(item.quantity);
            const spaceKey = sourceSpaceId == null ? 'geral' : String(sourceSpaceId);
            operations.push({
                sql: `INSERT INTO cable_event_movements
                      (cable_id, event_id, space_id, action_type, quantity, request_id)
                      VALUES (?, ?, ?, 'entrada', ?, ?)`,
                params: [
                    cableId,
                    sourceEventId,
                    sourceSpaceId,
                    quantity,
                    `${mutationRequestId}:from:${sourceEventId}:cable:${cableId}:${spaceKey}`
                ]
            });
            // A transferência não devolve fisicamente o cabo ao galpão. Este
            // crédito temporário permite que o gatilho valide a nova saída no
            // destino; o débito logo depois deixa o saldo exatamente como era.
            operations.push({
                sql: `UPDATE cables
                      SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP
                      WHERE id = ?`,
                params: [quantity, cableId]
            });
            operations.push({
                sql: `INSERT INTO cable_event_movements
                      (cable_id, event_id, space_id, action_type, quantity, request_id)
                      VALUES (?, ?, NULL, 'saida', ?, ?)`,
                params: [
                    cableId,
                    targetEventId,
                    quantity,
                    `${mutationRequestId}:to:${targetEventId}:cable:${cableId}:${spaceKey}`
                ]
            });
            operations.push({
                sql: `UPDATE cables
                      SET available_quantity = available_quantity - ?, updated_at = CURRENT_TIMESTAMP
                      WHERE id = ?`,
                params: [quantity, cableId]
            });
        }

        for (const item of outstandingOtherItems) {
            const itemId = Number(item.item_id);
            const sourceSpaceId = item.space_id == null ? null : Number(item.space_id);
            const quantity = Number(item.quantity);
            const spaceKey = sourceSpaceId == null ? 'geral' : String(sourceSpaceId);
            operations.push({
                sql: `INSERT INTO other_item_event_movements
                      (item_id, event_id, space_id, action_type, quantity, request_id)
                      VALUES (?, ?, ?, 'entrada', ?, ?)`,
                params: [
                    itemId,
                    sourceEventId,
                    sourceSpaceId,
                    quantity,
                    `${mutationRequestId}:from:${sourceEventId}:other:${itemId}:${spaceKey}`
                ]
            });
            // Mesmo raciocínio dos cabos: a mudança de evento não altera o
            // estoque físico, mas os gatilhos precisam enxergar o crédito
            // antes de validar a saída que será registrada no destino.
            operations.push({
                sql: `UPDATE other_items
                      SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP
                      WHERE id = ?`,
                params: [quantity, itemId]
            });
            operations.push({
                sql: `INSERT INTO other_item_event_movements
                      (item_id, event_id, space_id, action_type, quantity, request_id)
                      VALUES (?, ?, NULL, 'saida', ?, ?)`,
                params: [
                    itemId,
                    targetEventId,
                    quantity,
                    `${mutationRequestId}:to:${targetEventId}:other:${itemId}:${spaceKey}`
                ]
            });
            operations.push({
                sql: `UPDATE other_items
                      SET available_quantity = available_quantity - ?, updated_at = CURRENT_TIMESTAMP
                      WHERE id = ?`,
                params: [quantity, itemId]
            });
        }

        await executeIdempotentMutationBatch(env, {
            operation: 'event-equipment-transfer',
            operations,
            verificationSql: `SELECT id FROM (
                                  SELECT id, event_id, action_type, request_id FROM equipment_events
                                  UNION ALL
                                  SELECT id, event_id, action_type, request_id FROM cable_event_movements
                                  UNION ALL
                                  SELECT id, event_id, action_type, request_id FROM other_item_event_movements
                              )
                              WHERE event_id = ?
                                AND action_type = 'saida'
                                AND request_id LIKE ? ESCAPE '\\'
                              LIMIT 1`,
            verificationParams: [targetEventId, `${escapeSqlLikePattern(targetRequestPrefix)}%`]
        });

        return json({
            success: true,
            transferredCount: outstandingEquipment.length + outstandingCables.length + outstandingOtherItems.length,
            transferred: {
                equipment: outstandingEquipment.length,
                cable: outstandingCables.reduce((total, item) => total + Number(item.quantity), 0),
                other: outstandingOtherItems.reduce((total, item) => total + Number(item.quantity), 0)
            },
            targetEventId,
            targetEventName: targetEvent.name
        });
    }

    const cableHistoryMatch = pathname.match(/^\/api\/events\/(\d+)\/cable-history$/);
    if (cableHistoryMatch && request.method === 'GET') {
        const rows = await queryAll(
            env,
            `SELECT
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
             ORDER BY COALESCE(es.id, 0) ASC, lower(c.name) ASC, cem.cable_id ASC`,
            [Number(cableHistoryMatch[1])]
        );
        return json(rows);
    }

    const cableSummaryMatch = pathname.match(/^\/api\/events\/(\d+)\/cable-summary$/);
    if (cableSummaryMatch && request.method === 'GET') {
        const rows = await queryAll(
            env,
            `SELECT
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
             ORDER BY COALESCE(es.id, 0) ASC, lower(c.name) ASC, cem.cable_id ASC`,
            [Number(cableSummaryMatch[1])]
        );
        return json(rows);
    }

    const otherItemSummaryMatch = pathname.match(/^\/api\/events\/(\d+)\/other-item-summary$/);
    if (otherItemSummaryMatch && request.method === 'GET') {
        const rows = await queryAll(
            env,
            `SELECT
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
             ORDER BY COALESCE(es.id, 0) ASC, lower(oi.name) ASC, oiem.item_id ASC`,
            [Number(otherItemSummaryMatch[1])]
        );
        return json(rows);
    }

    const quoteOtherItemSummaryMatch = pathname.match(/^\/api\/events\/(\d+)\/quote-other-item-summary$/);
    if (quoteOtherItemSummaryMatch && request.method === 'GET') {
        const eventId = Number(quoteOtherItemSummaryMatch[1]);
        if (!Number.isInteger(eventId) || eventId <= 0) {
            return json({ error: 'Evento inválido' }, 400);
        }
        const rows = await queryAll(
            env,
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
        return json(rows);
    }

    const hideSaidaItemMatch = pathname.match(/^\/api\/events\/(\d+)\/saida-hidden-items$/);
    if (hideSaidaItemMatch && request.method === 'POST') {
        const eventId = Number(hideSaidaItemMatch[1]);
        const body = await readJson(request);
        const itemType = String(body.itemType || '').trim();
        const itemId = Number(body.itemId);
        const password = String(body.password || '').trim();

        if (!(await verifyDeletePassword(password, env))) {
            return json({ message: 'Senha incorreta' }, 403);
        }

        if (!eventId || !['equipment', 'cable', 'other'].includes(itemType) || !itemId) {
            return json({ message: 'Dados inválidos para excluir da saída' }, 400);
        }

        const spaceId = await resolveEventSpaceId(env, eventId, body.spaceId);
        await execute(
            env,
            `INSERT OR IGNORE INTO event_saida_hidden_items (event_id, item_type, item_id, space_id)
             VALUES (?, ?, ?, ?)`,
            [eventId, itemType, itemId, spaceId]
        );
        return json({ success: true });
    }

    if (eventMatch && request.method === 'DELETE') {
        const eventId = Number(eventMatch[1]);
        await deleteEventRecords(env, eventId);
        return json({ success: true });
    }

    if (pathname === '/api/equipments' && request.method === 'GET') {
        const search = String(url.searchParams.get('search') || '').trim();
        const rows = await queryAll(
            env,
            `SELECT equipments.*,
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
            [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
        );
        return json(rows);
    }

    if (pathname === '/api/equipments' && request.method === 'POST') {
        const body = await readJson(request);
        const name = String(body.name || '').trim();
        const barcode = normalizeEquipmentBarcode(body.barcode);
        const category = String(body.category || 'Outros').trim() || 'Outros';
        const serialNumber = String(body.serialNumber || body.serial_number || '').trim() || '-';
        const observation = String(body.observation || '').trim() || '-';

        if (!name || !barcode) {
            return json({ error: 'Nome e código de barras são obrigatórios' }, 400);
        }

        try {
            const existingEquipment = await queryFirst(
                env,
                'SELECT id, name, barcode FROM equipments WHERE barcode = ?',
                [barcode]
            );
            if (existingEquipment) {
                return json({
                    error: duplicateEquipmentMessage(existingEquipment),
                    equipment: existingEquipment
                }, 409);
            }

            const result = await execute(
                env,
                'INSERT INTO equipments (name, barcode, current_status, category, serial_number, observation) VALUES (?, ?, ?, ?, ?, ?)',
                [name, barcode, 'Disponivel', category, serialNumber, observation]
            );
            return json({ id: result.meta.last_row_id, success: true });
        } catch (error) {
            return handleDatabaseError(error, 'Já existe um equipamento com esse código de barras');
        }
    }

    const equipmentStatusMatch = pathname.match(/^\/api\/equipments\/(\d+)\/status$/);
    if (equipmentStatusMatch && request.method === 'PATCH') {
        const equipmentId = Number(equipmentStatusMatch[1]);
        const body = await readJson(request);
        const status = String(body.status || '').trim();

        if (!equipmentId || !status) {
            return json({ message: 'ID e status são obrigatórios' }, 400);
        }

        const equipment = await queryFirst(env, 'SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return json({ message: 'Equipamento não encontrado' }, 404);

        await execute(env, 'UPDATE equipments SET current_status = ? WHERE id = ?', [status, equipmentId]);
        return json({ success: true });
    }

    if (pathname === '/api/cables' && request.method === 'GET') {
        const search = String(url.searchParams.get('search') || '').trim();
        const rows = await queryAll(
            env,
            `SELECT
                cables.*,
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
            [`%${search}%`, `%${search}%`]
        );
        return json(rows);
    }

    if (pathname === '/api/cables' && request.method === 'POST') {
        const body = await readJson(request);
        const name = String(body.name || '').trim();
        const quantity = Number(body.quantity);
        const category = String(body.category || 'Outros').trim() || 'Outros';

        if (!name) return json({ error: 'Nome do cabo é obrigatório' }, 400);
        if (!Number.isInteger(quantity) || quantity < 0) {
            return json({ error: 'Quantidade inválida' }, 400);
        }

        try {
            const result = await execute(
                env,
                `INSERT INTO cables (name, quantity, available_quantity, category, updated_at)
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [name, quantity, quantity, category]
            );
        return json({ id: result.meta.last_row_id, success: true });
        } catch (error) {
            return handleDatabaseError(error, 'Já existe um cabo com esse nome');
        }
    }

    const cableMaintenancesMatch = pathname.match(/^\/api\/cables\/(\d+)\/maintenances$/);
    if (cableMaintenancesMatch && request.method === 'GET') {
        const cableId = Number(cableMaintenancesMatch[1]);
        const cable = await queryFirst(env, 'SELECT id, name FROM cables WHERE id = ?', [cableId]);
        if (!cable) return json({ message: 'Cabo não encontrado' }, 404);

        const maintenances = await queryAll(
            env,
            `SELECT id, quantity, description, created_at
             FROM cable_maintenances
             WHERE cable_id = ?
               AND resolved_at IS NULL
             ORDER BY datetime(created_at) ASC, id ASC`,
            [cableId]
        );
        return json({
            cable,
            maintenanceQuantity: maintenances.reduce((total, item) => total + Number(item.quantity || 0), 0),
            maintenances
        });
    }

    const cableMatch = pathname.match(/^\/api\/cables\/(\d+)$/);
    if (cableMatch && request.method === 'PATCH') {
        const cableId = Number(cableMatch[1]);
        const body = await readJson(request);
        const quantity = Number(body.quantity);
        const password = String(body.password || '').trim();

        if (!cableId) return json({ message: 'ID do cabo é obrigatório' }, 400);
        if (!Number.isInteger(quantity) || quantity < 0) {
            return json({ message: 'Quantidade inválida' }, 400);
        }
        if (!canEditInitialQuantity(session, password)) {
            return json({ message: 'Apenas Arthur pode editar com a senha correta' }, 403);
        }

        const cable = await queryFirst(env, 'SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) return json({ message: 'Cabo não encontrado' }, 404);

        const currentQuantity = Number(cable.quantity) || 0;
        const result = await execute(
            env,
            `UPDATE cables
             SET available_quantity = available_quantity + (? - quantity),
                 quantity = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND quantity = ?
               AND available_quantity + (? - quantity) >= 0`,
            [quantity, quantity, cableId, currentQuantity, quantity]
        );

        if (Number(result?.meta?.changes) === 0) {
            return json({ message: 'O estoque foi alterado por outra operação. Atualize a tela e tente novamente.' }, 409);
        }

        return json({ success: true });
    }

    if (cableMatch && request.method === 'DELETE') {
        const cableId = Number(cableMatch[1]);
        const body = await readJson(request);
        const password = String(body.password || '').trim();

        if (!cableId) return json({ message: 'ID do cabo é obrigatório' }, 400);
        if (!(await verifyDeletePassword(password, env))) return json({ message: 'Senha incorreta' }, 403);

        const cable = await queryFirst(env, 'SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) return json({ message: 'Cabo não encontrado' }, 404);

        await executeIdempotentBatch(env, [
            { sql: 'DELETE FROM cable_event_movements WHERE cable_id = ?', params: [cableId] },
            { sql: 'DELETE FROM cable_maintenances WHERE cable_id = ?', params: [cableId] },
            { sql: "DELETE FROM event_saida_hidden_items WHERE item_type = 'cable' AND item_id = ?", params: [cableId] },
            { sql: 'DELETE FROM cables WHERE id = ?', params: [cableId] }
        ], 'delete-cable');
        return json({ success: true });
    }

    if (pathname === '/api/other-items' && request.method === 'GET') {
        const search = String(url.searchParams.get('search') || '').trim();
        const rows = await queryAll(
            env,
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
            [`%${search}%`]
        );
        return json(rows);
    }

    if (pathname === '/api/other-items' && request.method === 'POST') {
        const body = await readJson(request);
        const name = String(body.name || '').trim().toLocaleUpperCase('pt-BR');
        const quantity = Number(body.quantity);
        const category = String(body.category || 'Outros').trim() || 'Outros';

        if (!name) return json({ error: 'Nome do item é obrigatório' }, 400);
        if (!Number.isInteger(quantity) || quantity < 0) {
            return json({ error: 'Quantidade inválida' }, 400);
        }

        try {
            const hasCategory = await tableHasColumn(env, 'other_items', 'category');
            const result = await execute(
                env,
                hasCategory
                    ? `INSERT INTO other_items (name, quantity, available_quantity, category, updated_at)
                       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
                    : `INSERT INTO other_items (name, quantity, available_quantity, updated_at)
                       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                hasCategory ? [name, quantity, quantity, category] : [name, quantity, quantity]
            );
            return json({ id: result.meta.last_row_id, success: true });
        } catch (error) {
            return handleDatabaseError(error, 'Já existe um item com esse nome');
        }
    }

    const otherItemMatch = pathname.match(/^\/api\/other-items\/(\d+)$/);
    if (otherItemMatch && request.method === 'PATCH') {
        const itemId = Number(otherItemMatch[1]);
        const body = await readJson(request);
        const quantity = Number(body.quantity);
        const password = String(body.password || '').trim();

        if (!itemId) return json({ message: 'ID do item é obrigatório' }, 400);
        if (!Number.isInteger(quantity) || quantity < 0) {
            return json({ message: 'Quantidade inválida' }, 400);
        }
        if (!canEditInitialQuantity(session, password)) {
            return json({ message: 'Apenas Arthur pode editar com a senha correta' }, 403);
        }

        const item = await queryFirst(env, 'SELECT * FROM other_items WHERE id = ?', [itemId]);
        if (!item) return json({ message: 'Item não encontrado' }, 404);

        const currentQuantity = Number(item.quantity) || 0;
        const result = await execute(
            env,
            `UPDATE other_items
             SET available_quantity = available_quantity + (? - quantity),
                 quantity = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND quantity = ?
               AND available_quantity + (? - quantity) >= 0`,
            [quantity, quantity, itemId, currentQuantity, quantity]
        );

        if (Number(result?.meta?.changes) === 0) {
            return json({ message: 'O estoque foi alterado por outra operação. Atualize a tela e tente novamente.' }, 409);
        }

        return json({ success: true });
    }

    if (otherItemMatch && request.method === 'DELETE') {
        const itemId = Number(otherItemMatch[1]);
        const body = await readJson(request);
        const password = String(body.password || '').trim();

        if (!itemId) return json({ message: 'ID do item é obrigatório' }, 400);
        if (!(await verifyDeletePassword(password, env))) return json({ message: 'Senha incorreta' }, 403);

        const item = await queryFirst(env, 'SELECT * FROM other_items WHERE id = ?', [itemId]);
        if (!item) return json({ message: 'Item não encontrado' }, 404);

        await executeIdempotentBatch(env, [
            { sql: 'DELETE FROM other_item_event_movements WHERE item_id = ?', params: [itemId] },
            { sql: "DELETE FROM event_saida_hidden_items WHERE item_type = 'other' AND item_id = ?", params: [itemId] },
            { sql: 'DELETE FROM other_items WHERE id = ?', params: [itemId] }
        ], 'delete-other-item');
        return json({ success: true });
    }

    const equipmentMatch = pathname.match(/^\/api\/equipments\/(\d+)$/);
    if (equipmentMatch && request.method === 'PATCH') {
        const equipmentId = Number(equipmentMatch[1]);
        const body = await readJson(request);
        const name = String(body.name || '').trim();
        const barcode = normalizeEquipmentBarcode(body.barcode);
        const serialNumber = String(body.serialNumber || body.serial_number || '').trim() || '-';
        const observation = String(body.observation || '').trim() || '-';

        if (!equipmentId) return json({ message: 'ID do equipamento e obrigatorio' }, 400);
        if (!name || !barcode) {
            return json({ error: 'Nome e patrimonio/codigo de barras sao obrigatorios.' }, 400);
        }

        const equipment = await queryFirst(env, 'SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return json({ message: 'Equipamento nao encontrado' }, 404);

        const existingEquipment = await queryFirst(
            env,
            'SELECT id, name, barcode FROM equipments WHERE barcode = ? AND id <> ?',
            [barcode, equipmentId]
        );
        if (existingEquipment) {
            return json({
                error: duplicateEquipmentMessage(existingEquipment),
                equipment: existingEquipment
            }, 409);
        }

        try {
            await execute(
                env,
                `UPDATE equipments
                 SET name = ?, barcode = ?, serial_number = ?, observation = ?
                 WHERE id = ?`,
                [name, barcode, serialNumber, observation, equipmentId]
            );
            const unitPrice = roundMoney(parseMoneyValue(equipment.unit_price ?? 1));

            return json({
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
        } catch (error) {
            return handleDatabaseError(error, duplicateEquipmentMessage());
        }
    }

    if (equipmentMatch && request.method === 'DELETE') {
        const equipmentId = Number(equipmentMatch[1]);
        const body = await readJson(request);
        const password = String(body.password || '').trim();

        if (!equipmentId) return json({ message: 'ID do equipamento é obrigatório' }, 400);
        if (!(await verifyDeletePassword(password, env))) return json({ message: 'Senha incorreta' }, 403);

        const equipment = await queryFirst(env, 'SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return json({ message: 'Equipamento não encontrado' }, 404);

        await executeIdempotentBatch(env, [
            { sql: 'DELETE FROM equipment_events WHERE equipment_id = ?', params: [equipmentId] },
            { sql: 'DELETE FROM event_reserved_equipments WHERE equipment_id = ?', params: [equipmentId] },
            { sql: 'DELETE FROM maintenances WHERE equipment_id = ?', params: [equipmentId] },
            { sql: "DELETE FROM event_saida_hidden_items WHERE item_type = 'equipment' AND item_id = ?", params: [equipmentId] },
            { sql: 'DELETE FROM quote_hidden_equipments WHERE equipment_id = ?', params: [equipmentId] },
            { sql: 'DELETE FROM equipments WHERE id = ?', params: [equipmentId] }
        ], 'delete-equipment');
        return json({ success: true });
    }

    const movementMatch = pathname.match(/^\/api\/equipment-events\/(saida|entrada)$/);
    if (movementMatch && request.method === 'POST') {
        const type = movementMatch[1];
        const body = await readJson(request);
        const equipmentId = Number(body.equipmentId);
        const barcode = String(body.barcode || '').trim();
        const eventId = Number(body.eventId);
        const availabilityOverride = body.availabilityOverride === true || body.availabilityOverride === 1;
        const performedByUsername = session?.username || null;

        if ((!equipmentId && !barcode) || !eventId) {
            return json({ message: 'equipmentId ou código de barras e eventId são obrigatórios' }, 400);
        }
        const mutationRequestId = getMutationRequestId(request, body);

        const [equipmentResult, eventResult] = await executeBatch(env, [
            equipmentId
                ? { sql: 'SELECT * FROM equipments WHERE id = ?', params: [equipmentId] }
                : { sql: 'SELECT * FROM equipments WHERE barcode = ?', params: [barcode] },
            { sql: 'SELECT * FROM events WHERE id = ?', params: [eventId] }
        ]);
        const equipment = equipmentResult?.results?.[0] || null;
        const event = eventResult?.results?.[0] || null;
        const resolvedEquipmentId = Number(equipment?.id);

        if (!equipment) return json({ message: 'Equipamento não encontrado' }, 404);
        if (!event) return json({ message: 'Evento não encontrado' }, 404);
        const spaceId = await resolveEventSpaceId(env, eventId, body.spaceId);
        const existingMovementRequest = type === 'entrada'
            ? await queryFirst(
                env,
                `SELECT equipment_events.id,
                        equipment_events.event_id AS eventId,
                        equipment_events.space_id AS spaceId,
                        events.name AS eventName,
                        event_spaces.name AS spaceName
                 FROM equipment_events
                 INNER JOIN events ON events.id = equipment_events.event_id
                 LEFT JOIN event_spaces ON event_spaces.id = equipment_events.space_id
                 WHERE equipment_events.request_id = ?
                   AND equipment_events.equipment_id = ?
                   AND equipment_events.action_type = 'entrada'
                 LIMIT 1`,
                [mutationRequestId, resolvedEquipmentId]
            )
            : await queryFirst(
                env,
                `SELECT id FROM equipment_events
                 WHERE request_id = ?
                   AND equipment_id = ?
                   AND event_id = ?
                   AND COALESCE(space_id, 0) = COALESCE(?, 0)
                   AND action_type = 'saida'`,
                [mutationRequestId, resolvedEquipmentId, eventId, spaceId]
            );
        if (existingMovementRequest) {
            const replayedMovement = type === 'entrada' ? {
                eventId: Number(existingMovementRequest.eventId),
                eventName: existingMovementRequest.eventName || '',
                spaceId: existingMovementRequest.spaceId == null ? null : Number(existingMovementRequest.spaceId),
                spaceName: existingMovementRequest.spaceName || ''
            } : undefined;
            return json({
                success: true,
                equipment,
                requestId: mutationRequestId,
                replayed: true,
                ...(replayedMovement ? { movement: replayedMovement } : {})
            });
        }

        if (type === 'saida') {
            if (isMaintenanceStatus(equipment.current_status)) {
                return json({ message: 'Equipamento em manutenção' }, 409);
            }
            if (isInactiveEquipmentStatus(equipment.current_status)) {
                return json({ message: 'Equipamento inativo ou baixado' }, 409);
            }

            const activePhysicalMovement = await queryFirst(
                env,
                `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END), 0) AS balance
                 FROM equipment_events
                 WHERE equipment_id = ?`,
                [resolvedEquipmentId]
            );
            if (Number(activePhysicalMovement?.balance) > 0) {
                return json({ message: 'Este patrimônio já está fora do estoque' }, 409);
            }
            if (isUnavailableEquipmentStatus(equipment.current_status)) {
                return json({ message: 'Este patrimônio está fisicamente indisponível' }, 409);
            }

            const sameEventMovement = await queryFirst(
                env,
                `SELECT action_type
                 FROM equipment_events
                 WHERE equipment_id = ? AND event_id = ?
                   AND ${spacePredicate('space_id')}
                 ORDER BY datetime(created_at) DESC, id DESC
                 LIMIT 1`,
                [resolvedEquipmentId, eventId, spaceId]
            );
            if (sameEventMovement?.action_type === 'saida') {
                return json({ message: 'Este equipamento já possui saída pendente neste evento' }, 409);
            }

            const eventRange = getEventDateRange(event);
            if (!eventRange) {
                return json({ message: 'Evento sem período válido' }, 400);
            }

            const dateWarning = await findEquipmentDateConflict(
                env,
                resolvedEquipmentId,
                eventRange,
                {
                    equipment: {
                        id: equipment.id,
                        name: equipment.name,
                        barcode: equipment.barcode,
                        currentStatus: equipment.current_status,
                        category: equipment.category,
                        unitPrice: equipment.unit_price
                    },
                    excludeQuoteId: Number(event.orcamento_id) || null,
                    excludeEventId: eventId
                },
                {
                    queryAll,
                    queryFirst,
                    execute,
                    batch: executeBatch,
                    tableExists,
                    tableHasColumn,
                    ensureColumn
                }
            );
            const capacityWarning = await findEquipmentGroupCapacityConflict(
                env,
                { id: equipment.id, name: equipment.name },
                event,
                {
                    queryAll,
                    queryFirst,
                    execute,
                    batch: executeBatch,
                    tableExists,
                    tableHasColumn,
                    ensureColumn
                }
            );
            const availabilityWarnings = [capacityWarning, dateWarning].filter(Boolean);
            if (availabilityWarnings.length && !availabilityOverride) {
                const warning = capacityWarning || dateWarning;
                return json({
                    code: 'FUTURE_AVAILABILITY_WARNING',
                    requiresConfirmation: true,
                    message: 'Esta saída pode causar insuficiência de estoque para outra demanda.',
                    warning,
                    conflict: warning,
                    warnings: availabilityWarnings
                }, 409);
            }

            await executeIdempotentMutationBatch(env, {
                operation: 'equipment-checkout',
                operations: [
                    {
                        sql: `INSERT INTO equipment_events
                              (equipment_id, event_id, space_id, action_type, performed_by_username, request_id)
                              VALUES (?, ?, ?, 'saida', ?, ?)`,
                        params: [resolvedEquipmentId, eventId, spaceId, performedByUsername, mutationRequestId]
                    },
                    {
                        sql: `INSERT OR IGNORE INTO event_reserved_equipments (event_id, equipment_id)
                              VALUES (?, ?)`,
                        params: [eventId, resolvedEquipmentId]
                    },
                    availabilityWarnings.length && availabilityOverride ? {
                        sql: `INSERT INTO availability_warning_audits (
                                  equipment_id, event_id, space_id, movement_request_id,
                                  confirmed_by_username, warning_details
                              ) VALUES (?, ?, ?, ?, ?, ?)`,
                        params: [
                            resolvedEquipmentId,
                            eventId,
                            spaceId,
                            mutationRequestId,
                            performedByUsername,
                            JSON.stringify(availabilityWarnings)
                        ]
                    } : null
                ].filter(Boolean),
                verificationSql: `SELECT id FROM equipment_events
                                  WHERE request_id = ?
                                    AND equipment_id = ?
                                    AND event_id = ?
                                    AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                    AND action_type = 'saida'`,
                verificationParams: [mutationRequestId, resolvedEquipmentId, eventId, spaceId]
            });
            return json({
                success: true,
                equipment,
                requestId: mutationRequestId,
                availabilityOverride: availabilityWarnings.length > 0
            });
        }

        // A entrada pode ser lida na aba de qualquer evento. Encontra a saída
        // física pendente e grava a devolução no evento/espaço de origem.
        const pendingMovement = await queryFirst(
            env,
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
            return json({ message: 'Este equipamento não possui saída pendente' }, 409);
        }

        const movementEventId = Number(pendingMovement.eventId);
        const movementSpaceId = pendingMovement.spaceId == null ? null : Number(pendingMovement.spaceId);

        await executeIdempotentMutationBatch(env, {
            operation: 'equipment-checkin',
            operations: [
                {
                    sql: `INSERT INTO equipment_events
                          (equipment_id, event_id, space_id, action_type, performed_by_username, request_id)
                          VALUES (?, ?, ?, 'entrada', ?, ?)`,
                    params: [resolvedEquipmentId, movementEventId, movementSpaceId, performedByUsername, mutationRequestId]
                }
            ],
            verificationSql: `SELECT id FROM equipment_events
                              WHERE request_id = ?
                                AND equipment_id = ?
                                AND event_id = ?
                                AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                AND action_type = 'entrada'`,
            verificationParams: [mutationRequestId, resolvedEquipmentId, movementEventId, movementSpaceId]
        });
        return json({
            success: true,
            equipment,
            requestId: mutationRequestId,
            movement: {
                eventId: movementEventId,
                eventName: pendingMovement.eventName || '',
                spaceId: movementSpaceId,
                spaceName: pendingMovement.spaceName || ''
            }
        });
    }

    const cableMovementMatch = pathname.match(/^\/api\/cable-events\/(saida|entrada)$/);
    if (cableMovementMatch && request.method === 'POST') {
        const type = cableMovementMatch[1];
        const body = await readJson(request);
        const cableId = Number(body.cableId);
        const eventId = Number(body.eventId);
        const quantity = Number(body.quantity);

        if (!cableId || !eventId || !Number.isInteger(quantity) || quantity <= 0) {
            return json({ message: 'cableId, eventId e quantity são obrigatórios' }, 400);
        }
        const mutationRequestId = getMutationRequestId(request, body);

        const [cableResult, eventResult] = await executeBatch(env, [
            { sql: 'SELECT * FROM cables WHERE id = ?', params: [cableId] },
            { sql: 'SELECT * FROM events WHERE id = ?', params: [eventId] }
        ]);
        const cable = cableResult?.results?.[0] || null;
        const event = eventResult?.results?.[0] || null;

        if (!cable) return json({ message: 'Cabo não encontrado' }, 404);
        if (!event) return json({ message: 'Evento não encontrado' }, 404);
        const spaceId = await resolveEventSpaceId(env, eventId, body.spaceId);
        const existingMovementRequest = await queryFirst(
            env,
            `SELECT id FROM cable_event_movements
             WHERE request_id = ?
               AND cable_id = ?
               AND event_id = ?
               AND COALESCE(space_id, 0) = COALESCE(?, 0)
               AND action_type = ?
               AND quantity = ?`,
            [mutationRequestId, cableId, eventId, spaceId, type, quantity]
        );
        if (existingMovementRequest) {
            return json({ success: true, requestId: mutationRequestId, replayed: true });
        }

        if (type === 'saida') {
            if (Number(cable.available_quantity) < quantity) {
                return json({ message: 'Quantidade insuficiente em estoque' }, 409);
            }

            await executeIdempotentMutationBatch(env, {
                operation: 'cable-checkout',
                operations: [
                    {
                        sql: `INSERT INTO cable_event_movements
                              (cable_id, event_id, space_id, action_type, quantity, request_id)
                              VALUES (?, ?, ?, 'saida', ?, ?)`,
                        params: [cableId, eventId, spaceId, quantity, mutationRequestId]
                    },
                    {
                        sql: 'UPDATE cables SET available_quantity = available_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        params: [quantity, cableId]
                    }
                ],
                verificationSql: `SELECT id FROM cable_event_movements
                                  WHERE request_id = ?
                                    AND cable_id = ?
                                    AND event_id = ?
                                    AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                    AND action_type = 'saida'
                                    AND quantity = ?`,
                verificationParams: [mutationRequestId, cableId, eventId, spaceId, quantity]
            });
            return json({ success: true, requestId: mutationRequestId });
        }

        const pendingMovement = await queryFirst(
            env,
            `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0) AS quantity
             FROM cable_event_movements
             WHERE cable_id = ? AND event_id = ?
               AND ${spacePredicate('space_id')}`,
            [cableId, eventId, spaceId]
        );

        if (!pendingMovement || Number(pendingMovement.quantity) < quantity) {
            return json({ message: 'Este cabo não possui saída pendente suficiente neste evento' }, 409);
        }

        await executeIdempotentMutationBatch(env, {
            operation: 'cable-checkin',
            operations: [
                {
                    sql: `INSERT INTO cable_event_movements
                          (cable_id, event_id, space_id, action_type, quantity, request_id)
                          VALUES (?, ?, ?, 'entrada', ?, ?)`,
                    params: [cableId, eventId, spaceId, quantity, mutationRequestId]
                },
                {
                    sql: 'UPDATE cables SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    params: [quantity, cableId]
                }
            ],
            verificationSql: `SELECT id FROM cable_event_movements
                              WHERE request_id = ?
                                AND cable_id = ?
                                AND event_id = ?
                                AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                AND action_type = 'entrada'
                                AND quantity = ?`,
            verificationParams: [mutationRequestId, cableId, eventId, spaceId, quantity]
        });
        return json({ success: true, requestId: mutationRequestId });
    }

    const otherItemMovementMatch = pathname.match(/^\/api\/other-item-events\/(saida|entrada)$/);
    if (otherItemMovementMatch && request.method === 'POST') {
        const type = otherItemMovementMatch[1];
        const body = await readJson(request);
        const itemId = Number(body.itemId);
        const eventId = Number(body.eventId);
        const quantity = Number(body.quantity);

        if (!itemId || !eventId || !Number.isInteger(quantity) || quantity <= 0) {
            return json({ message: 'itemId, eventId e quantity são obrigatórios' }, 400);
        }
        const mutationRequestId = getMutationRequestId(request, body);

        const [itemResult, eventResult] = await executeBatch(env, [
            { sql: 'SELECT * FROM other_items WHERE id = ?', params: [itemId] },
            { sql: 'SELECT * FROM events WHERE id = ?', params: [eventId] }
        ]);
        const item = itemResult?.results?.[0] || null;
        const event = eventResult?.results?.[0] || null;

        if (!item) return json({ message: 'Item não encontrado' }, 404);
        if (!event) return json({ message: 'Evento não encontrado' }, 404);
        const spaceId = await resolveEventSpaceId(env, eventId, body.spaceId);
        const existingMovementRequest = await queryFirst(
            env,
            `SELECT id FROM other_item_event_movements
             WHERE request_id = ?
               AND item_id = ?
               AND event_id = ?
               AND COALESCE(space_id, 0) = COALESCE(?, 0)
               AND action_type = ?
               AND quantity = ?`,
            [mutationRequestId, itemId, eventId, spaceId, type, quantity]
        );
        if (existingMovementRequest) {
            return json({ success: true, requestId: mutationRequestId, replayed: true });
        }

        if (type === 'saida') {
            if (Number(item.available_quantity) < quantity) {
                return json({ message: 'Quantidade insuficiente em estoque' }, 409);
            }

            await executeIdempotentMutationBatch(env, {
                operation: 'other-item-checkout',
                operations: [
                    {
                        sql: `INSERT INTO other_item_event_movements
                              (item_id, event_id, space_id, action_type, quantity, request_id)
                              VALUES (?, ?, ?, 'saida', ?, ?)`,
                        params: [itemId, eventId, spaceId, quantity, mutationRequestId]
                    },
                    {
                        sql: 'UPDATE other_items SET available_quantity = available_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        params: [quantity, itemId]
                    }
                ],
                verificationSql: `SELECT id FROM other_item_event_movements
                                  WHERE request_id = ?
                                    AND item_id = ?
                                    AND event_id = ?
                                    AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                    AND action_type = 'saida'
                                    AND quantity = ?`,
                verificationParams: [mutationRequestId, itemId, eventId, spaceId, quantity]
            });
            return json({ success: true, requestId: mutationRequestId });
        }

        const pendingMovement = await queryFirst(
            env,
            `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0) AS quantity
             FROM other_item_event_movements
             WHERE item_id = ? AND event_id = ?
               AND ${spacePredicate('space_id')}`,
            [itemId, eventId, spaceId]
        );

        if (!pendingMovement || Number(pendingMovement.quantity) < quantity) {
            return json({ message: 'Este item não possui saída pendente suficiente neste evento' }, 409);
        }

        await executeIdempotentMutationBatch(env, {
            operation: 'other-item-checkin',
            operations: [
                {
                    sql: `INSERT INTO other_item_event_movements
                          (item_id, event_id, space_id, action_type, quantity, request_id)
                          VALUES (?, ?, ?, 'entrada', ?, ?)`,
                    params: [itemId, eventId, spaceId, quantity, mutationRequestId]
                },
                {
                    sql: 'UPDATE other_items SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    params: [quantity, itemId]
                }
            ],
            verificationSql: `SELECT id FROM other_item_event_movements
                              WHERE request_id = ?
                                AND item_id = ?
                                AND event_id = ?
                                AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                AND action_type = 'entrada'
                                AND quantity = ?`,
            verificationParams: [mutationRequestId, itemId, eventId, spaceId, quantity]
        });
        return json({ success: true, requestId: mutationRequestId });
    }

    const quoteOtherItemMovementMatch = pathname.match(/^\/api\/quote-other-item-events\/(saida|entrada)$/);
    if (quoteOtherItemMovementMatch && request.method === 'POST') {
        const type = quoteOtherItemMovementMatch[1];
        const body = await readJson(request);
        const quoteItemId = Number(body.quoteItemId);
        const eventId = Number(body.eventId);
        const quantity = Number(body.quantity);

        if (!Number.isInteger(quoteItemId) || quoteItemId <= 0 || !Number.isInteger(eventId) || eventId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
            return json({ message: 'quoteItemId, eventId e quantidade são obrigatórios' }, 400);
        }
        const mutationRequestId = getMutationRequestId(request, body);
        const quoteItem = await queryFirst(
            env,
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
            return json({ message: 'Equipamento avulso não encontrado neste evento' }, 404);
        }

        const spaceId = await resolveEventSpaceId(env, eventId, body.spaceId);
        const existingMovementRequest = await queryFirst(
            env,
            `SELECT id FROM quote_manual_item_movements
             WHERE request_id = ?
               AND quote_item_id = ?
               AND event_id = ?
               AND COALESCE(space_id, 0) = COALESCE(?, 0)
               AND action_type = ?
               AND quantity = ?`,
            [mutationRequestId, quoteItemId, eventId, spaceId, type, quantity]
        );
        if (existingMovementRequest) {
            return json({ success: true, requestId: mutationRequestId, replayed: true });
        }
        if (type === 'saida') {
            const totals = await queryFirst(
                env,
                `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE 0 END), 0) AS saida
                 FROM quote_manual_item_movements
                 WHERE quote_item_id = ? AND event_id = ?`,
                [quoteItemId, eventId]
            );
            if (Number(totals?.saida) + quantity > Number(quoteItem.quantity)) {
                return json({ message: 'A quantidade de saída ultrapassa a quantidade informada no orçamento' }, 409);
            }
        } else {
            const pendingMovement = await queryFirst(
                env,
                `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0) AS quantity
                 FROM quote_manual_item_movements
                 WHERE quote_item_id = ? AND event_id = ?
                   AND ${spacePredicate('space_id')}`,
                [quoteItemId, eventId, spaceId]
            );
            if (Number(pendingMovement?.quantity) < quantity) {
                return json({ message: 'Este equipamento avulso não possui saída pendente suficiente neste evento' }, 409);
            }
        }

        await executeIdempotentMutationBatch(env, {
            operation: `quote-manual-item-${type}`,
            operations: [{
                sql: `INSERT INTO quote_manual_item_movements
                      (quote_item_id, event_id, space_id, action_type, quantity, request_id)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                params: [quoteItemId, eventId, spaceId, type, quantity, mutationRequestId]
            }],
            verificationSql: `SELECT id FROM quote_manual_item_movements
                              WHERE request_id = ?
                                AND quote_item_id = ?
                                AND event_id = ?
                                AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                AND action_type = ?
                                AND quantity = ?`,
            verificationParams: [mutationRequestId, quoteItemId, eventId, spaceId, type, quantity]
        });
        return json({ success: true, requestId: mutationRequestId });
    }

    if (pathname === '/api/maintenances' && request.method === 'POST') {
        const body = await readJson(request);
        const equipmentId = Number(body.equipmentId);
        const description = String(body.description || '').trim();

        if (!equipmentId || !description) {
            return json({ message: 'equipmentId e description são obrigatórios' }, 400);
        }

        const equipment = await queryFirst(env, 'SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return json({ message: 'Equipamento não encontrado' }, 404);

        const [maintenanceResult] = await executeBatch(env, [
            {
                sql: `INSERT INTO maintenances (equipment_id, description)
                      SELECT ?, ?
                      WHERE EXISTS (SELECT 1 FROM equipments WHERE id = ?)
                        AND NOT EXISTS (
                          SELECT 1 FROM maintenances
                          WHERE equipment_id = ? AND description = ? AND resolved_at IS NULL
                      )`,
                params: [equipmentId, description, equipmentId, equipmentId, description]
            },
            {
                sql: "UPDATE equipments SET current_status = 'Em manutencao' WHERE id = ?",
                params: [equipmentId]
            }
        ]);
        if (Number(maintenanceResult?.meta?.changes) === 0) {
            const currentEquipment = await queryFirst(env, 'SELECT id FROM equipments WHERE id = ?', [equipmentId]);
            if (!currentEquipment) {
                return json({ message: 'O equipamento foi excluído durante a operação. Atualize a tela.' }, 409);
            }
        }
        return json({ success: true });
    }

    if (pathname === '/api/cable-maintenances' && request.method === 'POST') {
        const body = await readJson(request);
        const cableId = Number(body.cableId);
        const description = String(body.description || '').trim();
        const quantity = Number(body.quantity);

        if (!cableId || !description || !Number.isInteger(quantity) || quantity <= 0) {
            return json({ message: 'Cabo, quantidade e descrição são obrigatórios' }, 400);
        }

        const cable = await queryFirst(env, 'SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) return json({ message: 'Cabo não encontrado' }, 404);

        const [maintenanceResult] = await executeBatch(env, [
            {
                sql: `INSERT INTO cable_maintenances (cable_id, description, quantity)
                      SELECT id, ?, ?
                      FROM cables
                      WHERE id = ?
                        AND available_quantity >= ?`,
                params: [description, quantity, cableId, quantity]
            },
            {
                sql: `UPDATE cables
                      SET available_quantity = available_quantity - ?,
                          updated_at = CURRENT_TIMESTAMP
                      WHERE id = ?
                        AND available_quantity >= ?`,
                params: [quantity, cableId, quantity]
            }
        ]);
        if (Number(maintenanceResult?.meta?.changes) === 0) {
            const currentCable = await queryFirst(env, 'SELECT id FROM cables WHERE id = ?', [cableId]);
            if (!currentCable) {
                return json({ message: 'O cabo foi excluído durante a operação. Atualize a tela.' }, 409);
            }
            return json({ message: 'Quantidade maior que a disponível no estoque' }, 400);
        }
        return json({ success: true, maintenanceQuantity: quantity });
    }

    const maintenanceReadyMatch = pathname.match(/^\/api\/maintenances\/(\d+)\/ready$/);
    if (maintenanceReadyMatch && request.method === 'PATCH') {
        const equipmentId = Number(maintenanceReadyMatch[1]);
        if (!equipmentId) return json({ message: 'equipmentId é obrigatório' }, 400);

        const equipment = await queryFirst(env, 'SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return json({ message: 'Equipamento não encontrado' }, 404);

        await executeBatch(env, [
            {
                sql: `UPDATE maintenances
                      SET resolved_at = CURRENT_TIMESTAMP
                      WHERE equipment_id = ?
                        AND resolved_at IS NULL`,
                params: [equipmentId]
            },
            {
                sql: `UPDATE equipments
                      SET current_status = CASE
                          WHEN EXISTS (
                              SELECT 1 FROM maintenances
                              WHERE maintenances.equipment_id = equipments.id
                                AND maintenances.resolved_at IS NULL
                          ) THEN 'Em manutencao'
                          WHEN EXISTS (
                              SELECT 1
                              FROM equipment_events AS outgoing
                              WHERE outgoing.equipment_id = equipments.id
                                AND outgoing.action_type = 'saida'
                                AND NOT EXISTS (
                                    SELECT 1
                                    FROM equipment_events AS incoming
                                    WHERE incoming.equipment_id = outgoing.equipment_id
                                      AND incoming.event_id = outgoing.event_id
                                      AND COALESCE(incoming.space_id, 0) = COALESCE(outgoing.space_id, 0)
                                      AND incoming.action_type = 'entrada'
                                      AND (
                                          datetime(incoming.created_at) > datetime(outgoing.created_at)
                                          OR (
                                              datetime(incoming.created_at) = datetime(outgoing.created_at)
                                              AND incoming.id > outgoing.id
                                          )
                                      )
                                )
                          ) THEN 'Indisponivel'
                          ELSE 'Disponivel'
                      END
                      WHERE id = ?`,
                params: [equipmentId]
            }
        ]);
        return json({ success: true });
    }

    const cableMaintenanceReadyMatch = pathname.match(/^\/api\/cable-maintenances\/(\d+)\/ready$/);
    if (cableMaintenanceReadyMatch && request.method === 'PATCH') {
        const cableId = Number(cableMaintenanceReadyMatch[1]);
        if (!cableId) return json({ message: 'cableId é obrigatório' }, 400);

        const cable = await queryFirst(env, 'SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) return json({ message: 'Cabo não encontrado' }, 404);

        const maintenance = await queryFirst(
            env,
            `SELECT COALESCE(SUM(quantity), 0) AS quantity
             FROM cable_maintenances
             WHERE cable_id = ?
               AND resolved_at IS NULL`,
            [cableId]
        );
        const maintenanceQuantity = Number(maintenance?.quantity || 0);
        const updateMarker = new Date().toISOString();
        const [cableResult] = await executeBatch(env, [
            {
                sql: `UPDATE cables
                      SET available_quantity = available_quantity + COALESCE((
                              SELECT SUM(quantity)
                              FROM cable_maintenances
                              WHERE cable_id = ? AND resolved_at IS NULL
                          ), 0),
                          updated_at = ?
                      WHERE id = ?
                        AND available_quantity + COALESCE((
                              SELECT SUM(quantity)
                              FROM cable_maintenances
                              WHERE cable_id = ? AND resolved_at IS NULL
                          ), 0) <= quantity`,
                params: [cableId, updateMarker, cableId, cableId]
            },
            {
                sql: `UPDATE cable_maintenances
                      SET resolved_at = CURRENT_TIMESTAMP
                      WHERE cable_id = ?
                        AND resolved_at IS NULL
                        AND EXISTS (
                            SELECT 1 FROM cables
                            WHERE id = ? AND updated_at = ?
                        )`,
                params: [cableId, cableId, updateMarker]
            }
        ]);
        if (Number(cableResult?.meta?.changes) === 0) {
            return json({ message: 'O saldo do cabo está inconsistente. Atualize a tela.' }, 409);
        }
        return json({ success: true, returnedQuantity: maintenanceQuantity });
    }

    return json({ error: 'Rota não encontrada' }, 404);
}

async function login(request, env) {
    const body = await readJson(request);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!username || !password) {
        return json({ error: 'Usuário e senha são obrigatórios' }, 400);
    }

    const user = await queryFirst(env, 'SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return json({ error: 'Incorreto' }, 401);
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = toSqliteDate(new Date(Date.now() + SESSION_DURATION_SECONDS * 1000));

    await executeIdempotent(
        env,
        `INSERT INTO sessions (id, user_id, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        [sessionId, user.id, expiresAt],
        'create-session'
    );

    const storedSession = await queryFirst(
        env,
        'SELECT id, user_id FROM sessions WHERE id = ?',
        [sessionId]
    );
    if (!storedSession || Number(storedSession.user_id) !== Number(user.id)) {
        throw new Error('A sessão não pôde ser confirmada no banco de dados');
    }

    // A sessão nova é persistida e confirmada antes de qualquer limpeza. Assim,
    // uma oscilação durante a manutenção não derruba a única sessão válida.
    await runBestEffortD1Cleanup(
        () => cleanupExpiredSessions(env),
        'expired-sessions-after-login'
    );
    await runBestEffortD1Cleanup(
        () => cleanupCurrentSessionBeforeLogin(request, env),
        'current-session-after-login'
    );

    if (user.username === TEST_USERNAME) {
        await runBestEffortD1Cleanup(
            () => clearAllTestUserSessions(env, sessionId),
            'old-test-sessions-after-login'
        );
    }

    return json(
        { success: true, isTestUser: user.username === TEST_USERNAME },
        200,
        { 'Set-Cookie': await buildSessionCookie(sessionId, request, env) }
    );
}

async function cleanupCurrentSessionBeforeLogin(request, env) {
    const currentSession = await getSessionFromRequest(request, env);
    if (!currentSession) {
        return;
    }

    if (currentSession.username === TEST_USERNAME) {
        await clearTestSnapshot(env, currentSession.id);
    }

    await execute(env, 'DELETE FROM sessions WHERE id = ?', [currentSession.id]);
}

async function runBestEffortD1Cleanup(cleanup, operation) {
    try {
        await cleanup();
    } catch (error) {
        if (!isD1UnavailableError(error)) throw error;
        console.warn(JSON.stringify({
            message: 'd1 cleanup postponed after transient error',
            operation,
            error: getD1ErrorMessage(error)
        }));
    }
}

async function logout(request, env) {
    const session = await getSessionFromRequest(request, env);
    if (session) {
        if (session.username === TEST_USERNAME) {
            await clearTestSnapshot(env, session.id);
        }

        await execute(env, 'DELETE FROM sessions WHERE id = ?', [session.id]);
    }

    return json(
        { success: true },
        200,
        { 'Set-Cookie': clearSessionCookie(request) }
    );
}

async function getScheduledEvents(env) {
    const hasQuoteSchema = await tableExists(env, 'quotes')
        && await tableExists(env, 'event_reserved_equipments')
        && await tableHasColumn(env, 'events', 'orcamento_id')
        && await tableHasColumn(env, 'events', 'end_date')
        && await tableHasColumn(env, 'events', 'auto_created_at');

    if (!hasQuoteSchema) {
        return json({ events: [] });
    }
    const events = await queryAll(
        env,
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
        const reservedEquipments = await queryAll(
            env,
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

        const movement = await queryFirst(
            env,
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

    return json({ events: events.filter((event) => event.status !== 'Finalizado') });
}

async function getPriceItems(env, type, search = '') {
    const config = PRICE_TABLES[type];
    if (!config || !(await tableExists(env, config.table))) {
        return [];
    }

    const hasUnitPrice = await tableHasColumn(env, config.table, 'unit_price');
    const hasCategory = config.categoryColumn
        ? await tableHasColumn(env, config.table, config.categoryColumn)
        : false;
    const categoryExpression = hasCategory ? `COALESCE(${config.categoryColumn}, 'Outros')` : "'Outros'";
    const priceExpression = hasUnitPrice ? 'COALESCE(unit_price, 1)' : '1';
    const hasSerialNumber = type === 'equipment' && await tableHasColumn(env, config.table, 'serial_number');
    const hasObservation = type === 'equipment' && await tableHasColumn(env, config.table, 'observation');
    const equipmentMetadataSelect = type === 'equipment'
        ? `,
                ${hasSerialNumber ? 'serial_number' : 'NULL'} AS serialNumber,
                ${hasObservation ? 'observation' : 'NULL'} AS observation`
        : '';

    return queryAll(
        env,
        `SELECT id,
                name,
                ${categoryExpression} AS category,
                ${priceExpression} AS unitPrice
                ${equipmentMetadataSelect}
         FROM ${config.table}
         WHERE name LIKE ?
         ORDER BY category ASC, name ASC`,
        [`%${search}%`]
    );
}

async function getQuoteDatabaseEquipments(env, search = '') {
    if (!(await tableExists(env, 'equipments'))) {
        return [];
    }

    const hasUnitPrice = await tableHasColumn(env, 'equipments', 'unit_price');
    const hasCategory = await tableHasColumn(env, 'equipments', 'category');
    const hasSerialNumber = await tableHasColumn(env, 'equipments', 'serial_number');
    const hasObservation = await tableHasColumn(env, 'equipments', 'observation');
    const hasHiddenTable = await tableExists(env, 'quote_hidden_equipments');
    const categoryExpression = hasCategory ? "COALESCE(equipments.category, 'Outros')" : "'Outros'";
    const priceExpression = hasUnitPrice ? 'COALESCE(equipments.unit_price, 1)' : '1';
    const serialNumberExpression = hasSerialNumber ? 'equipments.serial_number' : 'NULL';
    const observationExpression = hasObservation ? 'equipments.observation' : 'NULL';
    const hiddenSelect = hasHiddenTable
        ? `CASE WHEN quote_hidden_equipments.equipment_id IS NULL THEN 0 ELSE 1 END AS hiddenFromQuotes,
           quote_hidden_equipments.hidden_at AS hiddenAt,
           quote_hidden_equipments.hidden_by_username AS hiddenByUsername`
        : `0 AS hiddenFromQuotes,
           NULL AS hiddenAt,
           NULL AS hiddenByUsername`;
    const hiddenJoin = hasHiddenTable
        ? `LEFT JOIN quote_hidden_equipments
             ON quote_hidden_equipments.equipment_id = equipments.id`
        : '';
    const observationSearch = hasObservation ? "OR COALESCE(equipments.observation, '') LIKE ?" : '';
    const categorySearch = hasCategory ? 'OR COALESCE(equipments.category, \'\') LIKE ?' : '';
    const params = [`%${search}%`, `%${search}%`];
    if (hasObservation) params.push(`%${search}%`);
    if (hasCategory) params.push(`%${search}%`);

    const rows = await queryAll(
        env,
        `SELECT equipments.id,
                equipments.name,
                equipments.barcode,
                ${serialNumberExpression} AS serialNumber,
                ${observationExpression} AS observation,
                equipments.current_status AS currentStatus,
                ${categoryExpression} AS category,
                ${priceExpression} AS unitPrice,
                ${hiddenSelect}
         FROM equipments
         ${hiddenJoin}
         WHERE equipments.name LIKE ?
            OR equipments.barcode LIKE ?
            ${observationSearch}
            ${categorySearch}
         ORDER BY hiddenFromQuotes ASC,
                  lower(category) ASC,
                  lower(equipments.name) ASC,
                  equipments.barcode ASC`,
        params
    );

    return rows.map(serializeQuoteDatabaseEquipment);
}

async function getAvailableQuoteEquipments(env, search = '') {
    if (!(await tableExists(env, 'equipments'))) {
        return [];
    }

    const hasUnitPrice = await tableHasColumn(env, 'equipments', 'unit_price');
    const hasCategory = await tableHasColumn(env, 'equipments', 'category');
    const hasSerialNumber = await tableHasColumn(env, 'equipments', 'serial_number');
    const hasObservation = await tableHasColumn(env, 'equipments', 'observation');
    const hasHiddenTable = await tableExists(env, 'quote_hidden_equipments');
    const categoryExpression = hasCategory ? "COALESCE(category, 'Outros')" : "'Outros'";
    const priceExpression = hasUnitPrice ? 'COALESCE(unit_price, 1)' : '1';
    const serialNumberExpression = hasSerialNumber ? 'serial_number' : 'NULL';
    const observationExpression = hasObservation ? 'observation' : 'NULL';
    const hiddenPredicate = hasHiddenTable
        ? `AND NOT EXISTS (
               SELECT 1
               FROM quote_hidden_equipments
               WHERE quote_hidden_equipments.equipment_id = equipments.id
           )`
        : '';
    const searchLike = `%${search}%`;
    const exactTopic = search.toLocaleLowerCase('pt-BR');
    const observationSearch = hasObservation ? "OR COALESCE(observation, '') LIKE ?" : '';
    const params = [searchLike, searchLike];
    if (hasObservation) params.push(searchLike);
    params.push(searchLike, exactTopic, searchLike, searchLike);

    const rows = await queryAll(
        env,
        `SELECT id,
                name,
                barcode,
                ${serialNumberExpression} AS serialNumber,
                ${observationExpression} AS observation,
                current_status AS currentStatus,
                ${categoryExpression} AS category,
                ${priceExpression} AS unitPrice
         FROM equipments
         WHERE (
                name LIKE ?
                OR barcode LIKE ?
                ${observationSearch}
                OR ${categoryExpression} LIKE ?
           )
           ${hiddenPredicate}
         ORDER BY CASE
                WHEN lower(${categoryExpression}) = ? THEN 0
                WHEN ${categoryExpression} LIKE ? THEN 1
                WHEN name LIKE ? THEN 2
                ELSE 3
            END,
            lower(${categoryExpression}) ASC,
            lower(name) ASC,
            barcode ASC
         LIMIT 300`,
        params
    );

    return rows
        .filter((equipment) => !isMaintenanceStatus(equipment.currentStatus))
        .map(serializeQuoteEquipment);
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

function serializeQuoteDatabaseEquipment(row) {
    return {
        ...serializeQuoteEquipment(row),
        hiddenFromQuotes: Number(row.hiddenFromQuotes || row.hidden_from_quotes || 0) === 1,
        hiddenAt: row.hiddenAt || row.hidden_at || null,
        hiddenByUsername: row.hiddenByUsername || row.hidden_by_username || null
    };
}

async function getSessionFromRequest(request, env) {
    const secret = env.SESSION_SECRET;
    if (!secret) {
        throw new Error('SESSION_SECRET não configurado no Worker');
    }

    const cookies = parseCookies(request.headers.get('Cookie') || '');
    const rawValue = cookies[SESSION_COOKIE_NAME];
    if (!rawValue) return null;

    const [sessionId, signature] = rawValue.split('.');
    if (!sessionId || !signature) return null;

    const expectedSignature = await signValue(sessionId, secret);
    if (signature !== expectedSignature) return null;

    const session = await queryFirst(
        env,
        `SELECT sessions.id, sessions.user_id, sessions.expires_at, users.username, COALESCE(users.role, 'user') AS role
         FROM sessions
         INNER JOIN users ON users.id = sessions.user_id
         WHERE sessions.id = ?
           AND sessions.expires_at > ?`,
        [sessionId, toSqliteDate(new Date())]
    );

    if (!session) {
        return null;
    }

    return session;
}

function isAdminSession(session) {
    return session?.role === 'admin';
}

function canAccessQuotes(session) {
    const role = normalizeUserRole(session?.role);
    return role === 'admin' || role === 'comercial';
}

function canAccessOperators(session) {
    const role = normalizeUserRole(session?.role);
    return role === 'admin' || role === 'comercial';
}

function normalizeUserRole(role) {
    const normalized = String(role || 'user').trim().toLowerCase();
    return USER_ROLES.has(normalized) ? normalized : 'user';
}

function canShowInitialQuantityEdit(username) {
    return String(username || '').trim().toLowerCase() === INITIAL_QUANTITY_EDITOR_USERNAME;
}

async function cleanupExpiredSessions(env) {
    const expiredTestSessions = await queryAll(
        env,
        `SELECT sessions.id
         FROM sessions
         INNER JOIN users ON users.id = sessions.user_id
         WHERE sessions.expires_at <= ?
           AND users.username = ?
         ORDER BY sessions.expires_at ASC`,
        [toSqliteDate(new Date()), TEST_USERNAME]
    );

    for (const session of expiredTestSessions) {
        await clearTestSnapshot(env, session.id);
    }

    await execute(env, 'DELETE FROM sessions WHERE expires_at <= ?', [toSqliteDate(new Date())]);
}

async function clearAllTestUserSessions(env, keepSessionId = null) {
    const testSessions = await queryAll(
        env,
        `SELECT sessions.id
         FROM sessions
         INNER JOIN users ON users.id = sessions.user_id
         WHERE users.username = ?
           AND (? IS NULL OR sessions.id <> ?)
         ORDER BY sessions.expires_at ASC`,
        [TEST_USERNAME, keepSessionId, keepSessionId]
    );

    if (testSessions.length === 0) {
        return;
    }

    for (const session of testSessions) {
        await clearTestSnapshot(env, session.id);
    }

    await execute(
        env,
        `DELETE FROM sessions
         WHERE id IN (${testSessions.map(() => '?').join(', ')})`,
        testSessions.map((session) => session.id)
    );
}

async function createTestSnapshot(env, snapshotId) {
    await clearTestSnapshot(env, snapshotId);

    await execute(
        env,
        `INSERT INTO test_snapshot_availability_warning_audits (
            snapshot_id, id, equipment_id, event_id, space_id, movement_request_id,
            confirmed_by_username, warning_code, warning_details, created_at
        )
         SELECT ?, id, equipment_id, event_id, space_id, movement_request_id,
                confirmed_by_username, warning_code, warning_details, created_at
         FROM availability_warning_audits`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO test_snapshot_equipments (snapshot_id, id, name, barcode, current_status, category)
         SELECT ?, id, name, barcode, current_status, category
         FROM equipments`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO test_snapshot_events (snapshot_id, id, name, date, created_by_username, event_type, withdrawal_date, return_date)
         SELECT ?, id, name, date, created_by_username, COALESCE(event_type, 'event'), withdrawal_date, return_date
         FROM events`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO test_snapshot_equipment_events (snapshot_id, id, equipment_id, event_id, action_type, performed_by_username, created_at)
         SELECT ?, id, equipment_id, event_id, action_type, performed_by_username, created_at
         FROM equipment_events`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO test_snapshot_cable_event_movements (snapshot_id, id, cable_id, event_id, action_type, quantity, created_at)
         SELECT ?, id, cable_id, event_id, action_type, quantity, created_at
         FROM cable_event_movements`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO test_snapshot_maintenances (snapshot_id, id, equipment_id, description, resolved_at, created_at)
         SELECT ?, id, equipment_id, description, resolved_at, created_at
         FROM maintenances`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO test_snapshot_cables (snapshot_id, id, name, quantity, available_quantity, category, created_at, updated_at)
         SELECT ?, id, name, quantity, available_quantity, category, created_at, updated_at
         FROM cables`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO test_snapshot_operators (
            snapshot_id, id, full_name, mother_name, cpf, rg, birth_date, address, email, phone,
            area, has_vehicle, pix, agency, photo, cache_value, created_by_username, created_at, updated_at
        )
         SELECT ?, id, full_name, mother_name, cpf, rg, birth_date, address, email, phone,
                area, has_vehicle, pix, agency, photo, cache_value, created_by_username, created_at, updated_at
         FROM operators`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO test_snapshot_cable_maintenances (snapshot_id, id, cable_id, description, quantity, resolved_at, created_at)
         SELECT ?, id, cable_id, description, quantity, resolved_at, created_at
         FROM cable_maintenances`,
        [snapshotId]
    );
}

async function restoreTestSnapshot(env, snapshotId) {
    await execute(env, 'DELETE FROM availability_warning_audits');
    await execute(env, 'DELETE FROM equipment_events');
    await execute(env, 'DELETE FROM cable_event_movements');
    await execute(env, 'DELETE FROM maintenances');
    await execute(env, 'DELETE FROM events');
    await execute(env, 'DELETE FROM equipments');
    await execute(env, 'DELETE FROM cable_maintenances');
    await execute(env, 'DELETE FROM cables');
    await execute(env, 'DELETE FROM operators');

    await execute(
        env,
        `INSERT INTO availability_warning_audits (
            id, equipment_id, event_id, space_id, movement_request_id,
            confirmed_by_username, warning_code, warning_details, created_at
        )
         SELECT id, equipment_id, event_id, space_id, movement_request_id,
                confirmed_by_username, warning_code, warning_details, created_at
         FROM test_snapshot_availability_warning_audits
         WHERE snapshot_id = ?`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO equipments (id, name, barcode, current_status, category)
         SELECT id, name, barcode, current_status, category
         FROM test_snapshot_equipments
         WHERE snapshot_id = ?`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO events (id, name, date, created_by_username, event_type, withdrawal_date, return_date)
         SELECT id, name, date, created_by_username, COALESCE(event_type, 'event'), withdrawal_date, return_date
         FROM test_snapshot_events
         WHERE snapshot_id = ?`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO equipment_events (id, equipment_id, event_id, action_type, performed_by_username, created_at)
         SELECT id, equipment_id, event_id, action_type, performed_by_username, created_at
         FROM test_snapshot_equipment_events
         WHERE snapshot_id = ?`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO cable_event_movements (id, cable_id, event_id, action_type, quantity, created_at)
         SELECT id, cable_id, event_id, action_type, quantity, created_at
         FROM test_snapshot_cable_event_movements
         WHERE snapshot_id = ?`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO maintenances (id, equipment_id, description, resolved_at, created_at)
         SELECT id, equipment_id, description, resolved_at, created_at
         FROM test_snapshot_maintenances
         WHERE snapshot_id = ?`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO cables (id, name, quantity, available_quantity, category, created_at, updated_at)
         SELECT id, name, quantity, available_quantity, category, created_at, updated_at
         FROM test_snapshot_cables
         WHERE snapshot_id = ?`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO operators (
            id, full_name, mother_name, cpf, rg, birth_date, address, email, phone, pix, agency,
            area, has_vehicle, photo, cache_value, created_by_username, created_at, updated_at
        )
         SELECT id, full_name, mother_name, cpf, rg, birth_date, address, email, phone, pix, agency,
                area, has_vehicle, photo, cache_value, created_by_username, created_at, updated_at
         FROM test_snapshot_operators
         WHERE snapshot_id = ?`,
        [snapshotId]
    );

    await execute(
        env,
        `INSERT INTO cable_maintenances (id, cable_id, description, quantity, resolved_at, created_at)
         SELECT id, cable_id, description, quantity, resolved_at, created_at
         FROM test_snapshot_cable_maintenances
         WHERE snapshot_id = ?`,
        [snapshotId]
    );
}

async function clearTestSnapshot(env, snapshotId) {
    await execute(env, 'DELETE FROM test_snapshot_availability_warning_audits WHERE snapshot_id = ?', [snapshotId]);
    await execute(env, 'DELETE FROM test_snapshot_equipment_events WHERE snapshot_id = ?', [snapshotId]);
    await execute(env, 'DELETE FROM test_snapshot_cable_event_movements WHERE snapshot_id = ?', [snapshotId]);
    await execute(env, 'DELETE FROM test_snapshot_maintenances WHERE snapshot_id = ?', [snapshotId]);
    await execute(env, 'DELETE FROM test_snapshot_events WHERE snapshot_id = ?', [snapshotId]);
    await execute(env, 'DELETE FROM test_snapshot_equipments WHERE snapshot_id = ?', [snapshotId]);
    await execute(env, 'DELETE FROM test_snapshot_cable_maintenances WHERE snapshot_id = ?', [snapshotId]);
    await execute(env, 'DELETE FROM test_snapshot_cables WHERE snapshot_id = ?', [snapshotId]);
    await execute(env, 'DELETE FROM test_snapshot_operators WHERE snapshot_id = ?', [snapshotId]);
}

async function buildSessionCookie(sessionId, request, env) {
    const signature = await signValue(sessionId, env.SESSION_SECRET);
    const url = new URL(request.url);
    const isSecure = url.protocol === 'https:';
    return [
        `${SESSION_COOKIE_NAME}=${sessionId}.${signature}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${SESSION_DURATION_SECONDS}`,
        isSecure ? 'Secure' : ''
    ].filter(Boolean).join('; ');
}

function clearSessionCookie(request) {
    const url = new URL(request.url);
    const isSecure = url.protocol === 'https:';
    return [
        `${SESSION_COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0',
        isSecure ? 'Secure' : ''
    ].filter(Boolean).join('; ');
}

async function signValue(value, secret) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
    return toBase64Url(signature);
}

async function verifyDeletePassword(password, env) {
    const passwordHash = String(env.DELETE_PASSWORD_HASH || '').trim();
    if (!passwordHash) {
        console.warn('DELETE_PASSWORD_HASH não configurado no Worker.');
        return false;
    }

    return bcrypt.compare(password, passwordHash);
}

function canEditInitialQuantity(session, password) {
    const username = String(session?.username || '').trim().toLowerCase();
    return username === INITIAL_QUANTITY_EDITOR_USERNAME && String(password || '').trim() === INITIAL_QUANTITY_EDIT_PASSWORD;
}

function httpError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseOptionalSpaceId(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const spaceId = Number(value);
    return Number.isInteger(spaceId) && spaceId > 0 ? spaceId : NaN;
}

async function resolveEventSpaceId(env, eventId, value) {
    const spaceId = parseOptionalSpaceId(value);
    if (Number.isNaN(spaceId)) {
        throw httpError('Espaço inválido', 400);
    }

    if (spaceId === null) {
        return null;
    }

    const space = await queryFirst(env, 'SELECT id FROM event_spaces WHERE id = ? AND event_id = ?', [spaceId, eventId]);
    if (!space) {
        throw httpError('Espaço não encontrado neste evento', 404);
    }

    return spaceId;
}

function spacePredicate(columnName) {
    return `COALESCE(${columnName}, 0) = COALESCE(?, 0)`;
}

async function getEventsByCompletion(env, eventType, completed) {
    const orderBy = eventType === 'rental'
        ? 'ORDER BY COALESCE(e.return_date, e.date) DESC, e.id DESC'
        : 'ORDER BY e.date DESC, e.id DESC';
    const quoteFilter = completed ? '' : 'AND e.orcamento_id IS NULL';
    const completionFilter = completed
        ? 'COALESCE(movements.movement_count, 0) > 0 AND COALESCE(pending.pending_quantity, 0) = 0'
        : '(COALESCE(movements.movement_count, 0) = 0 OR COALESCE(pending.pending_quantity, 0) > 0)';

    return queryAll(
        env,
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

async function getRentalReturnAlerts(env, today) {
    const rentalEvents = await queryAll(
        env,
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
        const pendingItems = await getPendingRentalItems(env, Number(event.id));
        if (pendingItems.length > 0) {
            alerts.push({ ...event, pendingItems });
        }
    }

    return alerts;
}

async function getPendingRentalItems(env, eventId) {
    const equipments = await queryAll(
        env,
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

    const cables = await queryAll(
        env,
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

    const otherItems = await queryAll(
        env,
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

async function deleteEventRecords(env, eventId) {
    // Cada saldo é calculado diretamente do ledger ainda presente na mesma
    // transação. Se a confirmação se perder, repetir o batch não soma duas vezes:
    // após o primeiro commit os movimentos já não existem e os UPDATEs não atuam.
    await executeIdempotentBatch(env, [
        {
            sql: `UPDATE equipments
                  SET current_status = CASE
                      WHEN EXISTS (
                          SELECT 1 FROM maintenances
                          WHERE maintenances.equipment_id = equipments.id
                            AND maintenances.resolved_at IS NULL
                      ) THEN 'Em manutencao'
                      WHEN EXISTS (
                          SELECT 1
                          FROM equipment_events AS outgoing
                          WHERE outgoing.equipment_id = equipments.id
                            AND outgoing.event_id <> ?
                            AND outgoing.action_type = 'saida'
                            AND NOT EXISTS (
                                SELECT 1
                                FROM equipment_events AS incoming
                                WHERE incoming.equipment_id = outgoing.equipment_id
                                  AND incoming.event_id = outgoing.event_id
                                  AND COALESCE(incoming.space_id, 0) = COALESCE(outgoing.space_id, 0)
                                  AND incoming.action_type = 'entrada'
                                  AND (
                                      datetime(incoming.created_at) > datetime(outgoing.created_at)
                                      OR (
                                          datetime(incoming.created_at) = datetime(outgoing.created_at)
                                          AND incoming.id > outgoing.id
                                      )
                                  )
                            )
                      ) THEN 'Indisponivel'
                      ELSE 'Disponivel'
                  END
                  WHERE id IN (
                      SELECT equipment_id FROM equipment_events WHERE event_id = ?
                  )`,
            params: [eventId, eventId]
        },
        {
            sql: `UPDATE cables
                  SET available_quantity = available_quantity + (
                          SELECT COALESCE(SUM(
                              CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END
                          ), 0)
                          FROM cable_event_movements
                          WHERE cable_event_movements.cable_id = cables.id
                            AND cable_event_movements.event_id = ?
                      ),
                      updated_at = CURRENT_TIMESTAMP
                  WHERE EXISTS (
                      SELECT 1 FROM cable_event_movements
                      WHERE cable_event_movements.cable_id = cables.id
                        AND cable_event_movements.event_id = ?
                  )`,
            params: [eventId, eventId]
        },
        {
            sql: `UPDATE other_items
                  SET available_quantity = available_quantity + (
                          SELECT COALESCE(SUM(
                              CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END
                          ), 0)
                          FROM other_item_event_movements
                          WHERE other_item_event_movements.item_id = other_items.id
                            AND other_item_event_movements.event_id = ?
                      ),
                      updated_at = CURRENT_TIMESTAMP
                  WHERE EXISTS (
                      SELECT 1 FROM other_item_event_movements
                      WHERE other_item_event_movements.item_id = other_items.id
                        AND other_item_event_movements.event_id = ?
                  )`,
            params: [eventId, eventId]
        },
        { sql: 'DELETE FROM quote_manual_item_movements WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM other_item_event_movements WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM cable_event_movements WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM equipment_events WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM event_saida_hidden_items WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM event_reserved_equipments WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM event_spaces WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM events WHERE id = ?', params: [eventId] }
    ], 'delete-event');
}

async function ensureSaidaHiddenItemsTable(env) {
    await execute(
        env,
        `CREATE TABLE IF NOT EXISTS event_saida_hidden_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            item_type TEXT NOT NULL CHECK(item_type IN ('equipment', 'cable', 'other')),
            item_id INTEGER NOT NULL,
            space_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
    );
    await ensureColumn(env, 'event_saida_hidden_items', 'space_id', 'space_id INTEGER');
    await execute(
        env,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_event_saida_hidden_items_unique_space
         ON event_saida_hidden_items(event_id, item_type, item_id, COALESCE(space_id, 0))`
    );
}

async function ensureQuoteHiddenEquipmentsTable(env) {
    await execute(
        env,
        `CREATE TABLE IF NOT EXISTS quote_hidden_equipments (
            equipment_id INTEGER PRIMARY KEY,
            hidden_by_username TEXT,
            hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
    );
}

async function ensureQuoteManualItemSchema(env) {
    if (
        !(await tableExists(env, 'quote_items'))
        || !(await tableHasColumn(env, 'quote_items', 'is_manual'))
    ) {
        return false;
    }

    await execute(
        env,
        `CREATE TABLE IF NOT EXISTS quote_manual_item_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quote_item_id INTEGER NOT NULL,
            event_id INTEGER NOT NULL,
            space_id INTEGER,
            action_type TEXT NOT NULL CHECK(action_type IN ('saida', 'entrada')),
            quantity INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`
    );
    await execute(
        env,
        `CREATE INDEX IF NOT EXISTS idx_quote_manual_item_movements_event_item
         ON quote_manual_item_movements(event_id, quote_item_id, space_id, created_at)`
    );
    return true;
}

async function ensureOperatorsSchema(env) {
    await execute(
        env,
        `CREATE TABLE IF NOT EXISTS operators (
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
        )`
    );
    await execute(env, 'CREATE INDEX IF NOT EXISTS idx_operators_name ON operators(full_name)');
    await execute(env, 'CREATE INDEX IF NOT EXISTS idx_operators_cpf ON operators(cpf)');
    await ensureColumn(env, 'operators', 'area', "area TEXT NOT NULL DEFAULT ''");
    await ensureColumn(env, 'operators', 'has_vehicle', 'has_vehicle INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(env, 'operators', 'mother_name', "mother_name TEXT NOT NULL DEFAULT ''");
    await ensureColumn(env, 'operators', 'rg', "rg TEXT NOT NULL DEFAULT ''");

    await execute(
        env,
        `CREATE TABLE IF NOT EXISTS test_snapshot_operators (
            snapshot_id TEXT NOT NULL,
            id INTEGER NOT NULL,
            full_name TEXT NOT NULL,
            mother_name TEXT NOT NULL DEFAULT '',
            cpf TEXT NOT NULL,
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
            created_at TEXT,
            updated_at TEXT
        )`
    );
    await execute(env, 'CREATE INDEX IF NOT EXISTS idx_test_snapshot_operators_snapshot ON test_snapshot_operators(snapshot_id)');
    await ensureColumn(env, 'test_snapshot_operators', 'area', "area TEXT NOT NULL DEFAULT ''");
    await ensureColumn(env, 'test_snapshot_operators', 'has_vehicle', 'has_vehicle INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(env, 'test_snapshot_operators', 'mother_name', "mother_name TEXT NOT NULL DEFAULT ''");
    await ensureColumn(env, 'test_snapshot_operators', 'rg', "rg TEXT NOT NULL DEFAULT ''");
}

async function ensureColumn(env, tableName, columnName, columnDefinition) {
    const columns = await queryAll(env, `PRAGMA table_info(${tableName})`);
    if (columns.some((column) => column.name === columnName)) {
        return;
    }

    await execute(env, `ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
}

async function ensureEventSpacesSchema(env) {
    await execute(
        env,
        `CREATE TABLE IF NOT EXISTS event_spaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`
    );

    await ensureSaidaHiddenItemsTable(env);
    await ensureColumn(env, 'equipment_events', 'space_id', 'space_id INTEGER');
    await ensureColumn(env, 'cable_event_movements', 'space_id', 'space_id INTEGER');
    await ensureColumn(env, 'other_item_event_movements', 'space_id', 'space_id INTEGER');
    await ensureColumn(env, 'event_saida_hidden_items', 'space_id', 'space_id INTEGER');
}

async function queryAll(env, sql, params = []) {
    const run = () => env.DB.prepare(sql).bind(...params).all();
    let result;
    if (isRetrySafeSql(sql)) {
        result = await withD1Retry(run, d1RetryOptions('query-all'));
    } else {
        try {
            result = await run();
        } catch (error) {
            throw protectD1WriteOutcome('query-all-write', error);
        }
    }
    return result.results || [];
}

async function queryFirst(env, sql, params = []) {
    const run = () => env.DB.prepare(sql).bind(...params).first();
    if (isRetrySafeSql(sql)) {
        return withD1Retry(run, d1RetryOptions('query-first'));
    }
    try {
        return await run();
    } catch (error) {
        throw protectD1WriteOutcome('query-first-write', error);
    }
}

async function execute(env, sql, params = []) {
    const run = () => env.DB.prepare(sql).bind(...params).run();
    if (isRetrySafeSql(sql)) {
        return withD1Retry(run, d1RetryOptions('idempotent-execute'));
    }
    try {
        return await run();
    } catch (error) {
        throw protectD1WriteOutcome('execute-write', error);
    }
}

async function executeIdempotent(env, sql, params = [], operation = 'idempotent-write') {
    return withD1Retry(
        () => env.DB.prepare(sql).bind(...params).run(),
        d1RetryOptions(operation)
    );
}

async function executeBatch(env, operations = []) {
    if (!operations.length) return [];
    const run = () => runD1Batch(env, operations);
    if (operations.every(({ sql }) => isRetrySafeSql(sql))) {
        return withD1Retry(run, d1RetryOptions('read-only-batch'));
    }
    try {
        return await run();
    } catch (error) {
        throw protectD1WriteOutcome('batch-write', error);
    }
}

async function executeIdempotentBatch(env, operations = [], operation = 'idempotent-batch') {
    if (!operations.length) return [];
    return withD1Retry(
        () => runD1Batch(env, operations),
        d1RetryOptions(operation)
    );
}

function runD1Batch(env, operations) {
    const statements = operations.map(({ sql, params = [] }) => (
        env.DB.prepare(sql).bind(...params)
    ));
    return env.DB.batch(statements);
}

function getMutationRequestId(request, body = {}) {
    const supplied = String(
        request.headers.get('Idempotency-Key')
        || body.requestId
        || body.request_id
        || ''
    ).trim();

    if (!supplied) return crypto.randomUUID();
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(supplied)) {
        const error = new Error('Chave de idempotência inválida');
        error.statusCode = 400;
        throw error;
    }
    return supplied;
}

function isUniqueConstraintError(error) {
    return getD1ErrorMessage(error).toLowerCase().includes('unique constraint failed');
}

async function executeIdempotentMutationBatch(env, options) {
    const {
        operations,
        verificationSql,
        verificationParams,
        operation
    } = options;

    return withD1Retry(async () => {
        try {
            return await runD1Batch(env, operations);
        } catch (error) {
            if (!isD1UnavailableError(error) && !isUniqueConstraintError(error)) {
                throw error;
            }

            try {
                const existing = await queryFirst(env, verificationSql, verificationParams);
                if (existing) {
                    return { replayed: true, results: [] };
                }
            } catch (verificationError) {
                // Sem conseguir confirmar o ledger, nunca convertemos a falha em
                // sucesso nem em conflito: a retentativa externa deve preservar a chave.
                throw verificationError;
            }

            if (isUniqueConstraintError(error)) {
                const conflict = new Error('Esta chave de idempotência já foi usada em outra movimentação');
                conflict.statusCode = 409;
                throw conflict;
            }

            throw error;
        }
    }, d1RetryOptions(operation));
}

function d1RetryOptions(operation) {
    return {
        maxAttempts: 6,
        baseDelayMs: 50,
        maxDelayMs: 800,
        onRetry: ({ attempt, delayMs, error }) => {
            console.warn(JSON.stringify({
                message: 'd1 transient error; retry scheduled',
                operation,
                attempt,
                delayMs,
                error: getD1ErrorMessage(error)
            }));
        }
    };
}

async function tableExists(env, tableName) {
    const row = await queryFirst(
        env,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        [tableName]
    );
    return !!row;
}

async function tableHasColumn(env, tableName, columnName) {
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) return false;
    const columns = await queryAll(env, `PRAGMA table_info(${tableName})`);
    return columns.some((column) => column.name === columnName);
}

async function readJson(request) {
    try {
        return await request.json();
    } catch {
        return {};
    }
}

function json(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...extraHeaders
        }
    });
}

function getRequestId(request) {
    return request?.headers?.get('cf-ray') || crypto.randomUUID();
}

function databaseWriteOutcomeUnknownResponse(error, request = null) {
    const requestId = getRequestId(request);
    console.error(JSON.stringify({
        message: 'd1 write outcome unknown',
        requestId,
        method: request?.method || null,
        path: request?.url ? new URL(request.url).pathname : null,
        operation: error?.operation || null,
        error: getD1ErrorMessage(error?.cause || error)
    }));
    return json({
        code: 'DATABASE_WRITE_OUTCOME_UNKNOWN',
        error: 'A confirmação da gravação foi interrompida. Atualize a tela para conferir o resultado antes de repetir.',
        retryable: false,
        requestId
    }, 503, {
        'Cache-Control': 'no-store',
        'X-Request-ID': requestId
    });
}

function databaseUnavailableResponse(error, request = null) {
    const requestId = getRequestId(request);
    const retryable = isRetryableD1Error(error);
    console.error(JSON.stringify({
        message: 'd1 temporarily unavailable',
        requestId,
        method: request?.method || null,
        path: request?.url ? new URL(request.url).pathname : null,
        error: getD1ErrorMessage(error)
    }));
    return json({
        code: 'DATABASE_TEMPORARILY_UNAVAILABLE',
        error: 'O banco de dados oscilou por alguns instantes. Tente novamente.',
        retryable,
        requestId
    }, 503, {
        'Cache-Control': 'no-store',
        ...(retryable ? { 'Retry-After': '1' } : {}),
        'X-Request-ID': requestId
    });
}

function getD1LedgerConflictCode(error) {
    return getD1ErrorMessage(error).match(/\b(D1_(?:LEDGER|BALANCE)_[A-Z0-9_]+)\b/)?.[1] || null;
}

function databaseIntegrityConflictResponse(error, request = null) {
    const requestId = getRequestId(request);
    const code = getD1LedgerConflictCode(error) || 'D1_LEDGER_CONFLICT';
    console.warn(JSON.stringify({
        message: 'd1 ledger invariant prevented an unsafe write',
        requestId,
        method: request?.method || null,
        path: request?.url ? new URL(request.url).pathname : null,
        code
    }));
    return json({
        code,
        error: 'O estoque ou o evento mudou durante a operação. Atualize a tela e tente novamente.',
        retryable: false,
        requestId
    }, 409, {
        'Cache-Control': 'no-store',
        'X-Request-ID': requestId
    });
}

function parseCookies(cookieHeader) {
    return cookieHeader
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce((acc, part) => {
            const index = part.indexOf('=');
            if (index === -1) return acc;
            const key = part.slice(0, index);
            const value = part.slice(index + 1);
            acc[key] = value;
            return acc;
        }, {});
}

function toBase64Url(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function toSqliteDate(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function cleanText(value, maxLength = 500) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function parseMoneyValue(value) {
    if (typeof value === 'number') return value;

    const text = String(value ?? '').trim();
    if (!text) return 0;

    const normalized = text
        .replace(/[^\d,.-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.');

    return Number.parseFloat(normalized);
}

function roundMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 100) / 100;
}

function parseBooleanFlag(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = String(value || '').trim().toLowerCase();
    return ['1', 'true', 'sim', 'yes', 'on'].includes(normalized);
}

function parseIsoDateKey(value) {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return '';
    }

    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function createDateRange(startValue, endValue = startValue) {
    const start = parseIsoDateKey(startValue);
    const end = parseIsoDateKey(endValue || startValue);
    if (!start || !end || end < start) return null;

    const formatLabel = (dateKey) => {
        const [year, month, day] = dateKey.split('-');
        return `${day}/${month}/${year}`;
    };
    return {
        start,
        end,
        startLabel: formatLabel(start),
        endLabel: formatLabel(end)
    };
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
        throw operatorInputError('Valor cachê inválido');
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

function isAvailableStatus(status) {
    const normalized = String(status || '').toLowerCase();
    return !normalized
        || normalized === 'disponivel'
        || normalized === 'disponível'
        || normalized === 'pre separado'
        || normalized === 'relacao'
        || normalized === 'relação';
}

function isMaintenanceStatus(status) {
    return String(status || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .includes('manut');
}

function isInactiveEquipmentStatus(status) {
    const normalized = String(status || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR');
    return normalized.includes('inativ') || normalized.includes('baix');
}

function isUnavailableEquipmentStatus(status) {
    return String(status || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .includes('indispon');
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

function handleDatabaseError(error, duplicateMessage) {
    if (isD1WriteOutcomeUnknownError(error)) {
        return databaseWriteOutcomeUnknownResponse(error);
    }

    const message = String(error?.message || error || '');
    if (message.toLowerCase().includes('unique')) {
        return json({ error: duplicateMessage }, 409);
    }

    if (isD1UnavailableError(error)) {
        return databaseUnavailableResponse(error);
    }

    if (getD1LedgerConflictCode(error)) {
        return databaseIntegrityConflictResponse(error);
    }

    console.error(JSON.stringify({
        message: 'database operation failed',
        error: getD1ErrorMessage(error)
    }));
    return json({ error: message || 'Erro no banco de dados' }, 500);
}
