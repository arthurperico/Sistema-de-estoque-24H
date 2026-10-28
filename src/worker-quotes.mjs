import quoteServiceCatalog from './quote-services.json' with { type: 'json' };
import {
    getD1ErrorMessage,
    isRetryableD1Error,
    isD1UnavailableError,
    isD1WriteOutcomeUnknownError,
    withD1Retry
} from './d1-resilience.mjs';

const QUOTE_CATEGORIES = new Set([
    'sonorizacao',
    'transmissao',
    'iluminacao',
    'internet',
    'outros'
]);
const USER_ROLES = new Set(['admin', 'user', 'comercial']);
const QUOTE_OPERATIONAL_DESTINATIONS = new Set(['event', 'rental']);
const QUOTE_SERVICE_CATEGORY = 'SERVIÇOS';
const QUOTE_SERVICE_BY_ID = new Map(quoteServiceCatalog.map((service) => [service.id, service]));
const QUOTE_PDF_SIZE = [596.04, 842.04];
const QUOTE_PDF_LEFT = 49.56;
const QUOTE_PDF_WIDTH = 517.2;
const DEFAULT_QUOTE_NOTES = 'Obs.: A validade desta proposta está sujeita à verificação de disponibilidade de equipamentos e pessoal especializado após sua aprovação. Proposta válida por 7 dias.';

function rgb(red, green, blue) {
    return { type: 'RGB', red, green, blue };
}
const D1_LEDGER_CONFLICT_MESSAGES = Object.freeze({
    D1_LEDGER_EQUIPMENT_NOT_FOUND: 'Equipamento não encontrado.',
    D1_LEDGER_EVENT_NOT_FOUND: 'Evento não encontrado.',
    D1_LEDGER_SPACE_EVENT_MISMATCH: 'O espaço informado não pertence a este evento.',
    D1_LEDGER_EQUIPMENT_MAINTENANCE: 'Este equipamento está em manutenção.',
    D1_LEDGER_EQUIPMENT_ALREADY_OUT: 'Este equipamento já possui uma saída pendente.',
    D1_LEDGER_EQUIPMENT_RETURN_EXCEEDS_PENDING: 'Este equipamento não possui saída pendente neste evento e espaço.',
    D1_LEDGER_CABLE_QUANTITY_INVALID: 'Informe uma quantidade válida de cabo.',
    D1_LEDGER_CABLE_NOT_FOUND: 'Cabo não encontrado.',
    D1_LEDGER_CABLE_INSUFFICIENT_STOCK: 'Quantidade de cabo insuficiente em estoque.',
    D1_LEDGER_CABLE_RETURN_EXCEEDS_PENDING: 'A entrada de cabo ultrapassa a saída pendente neste evento e espaço.',
    D1_LEDGER_CABLE_BALANCE_ABOVE_TOTAL: 'A entrada de cabo ultrapassaria a quantidade total cadastrada.',
    D1_LEDGER_OTHER_ITEM_QUANTITY_INVALID: 'Informe uma quantidade válida do item.',
    D1_LEDGER_OTHER_ITEM_NOT_FOUND: 'Item não encontrado.',
    D1_LEDGER_OTHER_ITEM_INSUFFICIENT_STOCK: 'Quantidade insuficiente deste item em estoque.',
    D1_LEDGER_OTHER_ITEM_RETURN_EXCEEDS_PENDING: 'A entrada do item ultrapassa a saída pendente neste evento e espaço.',
    D1_LEDGER_OTHER_ITEM_BALANCE_ABOVE_TOTAL: 'A entrada do item ultrapassaria a quantidade total cadastrada.',
    D1_LEDGER_MANUAL_ITEM_QUANTITY_INVALID: 'Informe uma quantidade válida do equipamento avulso.',
    D1_LEDGER_MANUAL_ITEM_EVENT_MISMATCH: 'Equipamento avulso não encontrado neste evento.',
    D1_LEDGER_MANUAL_ITEM_CAPACITY_EXCEEDED: 'A saída ultrapassa a quantidade informada no orçamento.',
    D1_LEDGER_MANUAL_ITEM_RETURN_EXCEEDS_PENDING: 'A entrada ultrapassa a saída pendente deste equipamento avulso no espaço.',
    D1_LEDGER_QUOTE_LOCKED_BY_MOVEMENT: 'Este orçamento possui movimentações e não pode ser alterado ou excluído.',
    D1_LEDGER_QUOTE_LOCKED_BY_PAYMENT: 'Este orçamento possui pagamento de técnico e não pode ser alterado ou excluído.',
    D1_BALANCE_CABLE_TOTAL_NEGATIVE: 'A quantidade total de cabo não pode ser negativa.',
    D1_BALANCE_CABLE_NEGATIVE: 'A quantidade disponível de cabo não pode ficar negativa.',
    D1_BALANCE_CABLE_ABOVE_TOTAL: 'A quantidade disponível de cabo não pode ultrapassar o total cadastrado.',
    D1_BALANCE_OTHER_ITEM_TOTAL_NEGATIVE: 'A quantidade total do item não pode ser negativa.',
    D1_BALANCE_OTHER_ITEM_NEGATIVE: 'A quantidade disponível do item não pode ficar negativa.',
    D1_BALANCE_OTHER_ITEM_ABOVE_TOTAL: 'A quantidade disponível do item não pode ultrapassar o total cadastrado.'
});

/**
 * Cloudflare Worker quote router.
 *
 * Expected helper signatures:
 * - queryAll(env, sql, params)
 * - queryFirst(env, sql, params)
 * - execute(env, sql, params)
 * - batch(env, operations), where operations are { sql, params } objects and the
 *   helper turns them into D1 prepared statements before calling DB.batch().
 *
 * Optional helpers: json(data, status, headers), readJson(request).
 */
export async function handleQuoteRequest({ request, env, executionCtx, session, url, helpers = {} }) {
    const requestUrl = url instanceof URL ? url : new URL(request.url);
    const { pathname } = requestUrl;
    const route = matchQuoteRoute(pathname, request.method);
    if (!route) return null;

    const sendJson = helpers.json || json;
    if (!session) {
        return sendJson({ error: 'Não autorizado' }, 401);
    }

    const db = createDb(env, helpers);

    try {
        if (route.access === 'quote' && !canAccessQuotes(session)) {
            return sendJson({ error: 'Acesso restrito à tela de orçamentos' }, 403);
        }
        if (route.access === 'admin' && !isAdminSession(session)) {
            return sendJson({ error: 'Acesso restrito a administradores' }, 403);
        }

        switch (route.name) {
            case 'quote-equipment-database':
                return await handleQuoteEquipmentDatabase(db, requestUrl, sendJson);
            case 'quote-equipment-visibility':
                return await handleQuoteEquipmentVisibility(db, session, route.params, sendJson);
            case 'quote-equipment-group-name':
                return await handleQuoteEquipmentGroupName(db, request, helpers, sendJson);
            case 'quote-equipment-topic-name':
                return await handleQuoteEquipmentTopicName(db, request, helpers, sendJson);
            case 'quote-equipment-group-price':
                return await handleQuoteEquipmentGroupPrice(db, request, helpers, sendJson);
            case 'quote-service-price':
                return await handleQuoteServicePrice(db, request, route.params, helpers, sendJson);
            case 'quote-equipment-group-visibility':
                return await handleQuoteEquipmentGroupVisibility(db, request, session, route.params, helpers, sendJson);
            case 'quote-equipment-available':
                return await handleAvailableQuoteEquipments(db, requestUrl, sendJson);
            case 'quote-equipment-schedule':
                return await handleQuoteEquipmentSchedule(db, request, route.params, helpers, sendJson);
            case 'quote-equipment-release':
                return await handleQuoteEquipmentRelease(db, route.params, sendJson);
            case 'quote-technicians':
                return await handleQuoteTechnicians(db, requestUrl, sendJson);
            case 'quote-date-conflicts':
                return await handleQuoteDateConflicts(db, requestUrl, sendJson);
            case 'quote-payments':
                return await handleQuotePayments(db, sendJson);
            case 'quote-payment-paid':
                return await handleQuotePaymentPaid(db, session, route.params, sendJson);
            case 'quote-payment-correct':
                return await handleQuotePaymentCorrect(db, route.params, sendJson);
            case 'quote-list':
                return await handleQuoteList(db, requestUrl, sendJson);
            case 'quote-create':
                return await handleQuoteCreate(db, request, session, helpers, sendJson);
            case 'quote-ready':
                return await handleQuoteReady(db, request, session, route.params, helpers, sendJson);
            case 'quote-delete':
                return await handleQuoteDelete(db, route.params, sendJson);
            case 'quote-get':
                return await handleQuoteGet(db, route.params, sendJson);
            case 'quote-update':
                return await handleQuoteUpdate(db, request, route.params, helpers, sendJson);
            case 'quote-pdf':
                return await handleQuotePdf(db, request, env, executionCtx, route.params, sendJson);
            case 'scheduled-events':
                return await handleScheduledEvents(db, sendJson);
            case 'quote-manual-summary':
                return await handleQuoteManualSummary(db, route.params, sendJson);
            case 'quote-manual-movement':
                return await handleQuoteManualMovement(db, request, route.params, helpers, sendJson);
            default:
                return null;
        }
    } catch (error) {
        const status = Number(error?.statusCode) || 500;
        const ledgerConflict = getD1LedgerConflict(error);
        if (ledgerConflict) {
            return sendJson({
                code: ledgerConflict.code,
                error: ledgerConflict.message,
                message: ledgerConflict.message,
                retryable: false
            }, 409, { 'Cache-Control': 'no-store' });
        }
        if (isD1WriteOutcomeUnknownError(error)) {
            const requestId = request.headers.get('cf-ray') || crypto.randomUUID();
            console.error(JSON.stringify({
                message: 'quote database write outcome unknown',
                method: request.method,
                path: pathname,
                requestId,
                operation: error?.operation || null,
                error: getD1ErrorMessage(error?.cause || error)
            }));
            return sendJson({
                code: 'DATABASE_WRITE_OUTCOME_UNKNOWN',
                error: 'A confirmação da gravação foi interrompida. Atualize a tela para conferir o resultado antes de repetir.',
                retryable: false,
                requestId
            }, 503, {
                'Cache-Control': 'no-store',
                'X-Request-ID': requestId
            });
        }
        if (isD1UnavailableError(error)) {
            const requestId = request.headers.get('cf-ray') || crypto.randomUUID();
            const retryable = isRetryableD1Error(error);
            console.error(JSON.stringify({
                message: 'quote database temporarily unavailable',
                method: request.method,
                path: pathname,
                requestId,
                error: getD1ErrorMessage(error)
            }));
            return sendJson({
                code: 'DATABASE_TEMPORARILY_UNAVAILABLE',
                error: retryable
                    ? 'O banco de dados oscilou por alguns instantes. Tente novamente.'
                    : 'O banco de dados está temporariamente indisponível. Confira o estado da operação antes de repeti-la.',
                retryable,
                requestId
            }, 503, {
                'Cache-Control': 'no-store',
                ...(retryable ? { 'Retry-After': '1' } : {}),
                'X-Request-ID': requestId
            });
        }
        if (status >= 500) {
            console.error(JSON.stringify({
                message: 'quote request failed',
                method: request.method,
                path: pathname,
                error: error instanceof Error ? error.message : String(error)
            }));
        }
        return sendJson({ error: error?.message || 'Erro interno do servidor' }, status);
    }
}

function getD1LedgerConflict(error) {
    const code = getD1ErrorMessage(error).match(/\bD1_(?:LEDGER|BALANCE)_[A-Z0-9_]+\b/)?.[0];
    if (!code) return null;
    return {
        code,
        message: D1_LEDGER_CONFLICT_MESSAGES[code]
            || 'A movimentação foi recusada para preservar a consistência do estoque.'
    };
}

function matchQuoteRoute(pathname, method) {
    if (pathname === '/api/orcamentos/equipamentos-banco' && method === 'GET') {
        return { name: 'quote-equipment-database', access: 'admin', params: {} };
    }
    if (pathname === '/api/orcamentos/equipamentos-disponiveis' && method === 'GET') {
        return { name: 'quote-equipment-available', access: 'quote', params: {} };
    }
    if (pathname === '/api/orcamentos/equipamentos-grupo/nome' && method === 'PATCH') {
        return { name: 'quote-equipment-group-name', access: 'admin', params: {} };
    }
    if (pathname === '/api/orcamentos/topicos/nome' && method === 'PATCH') {
        return { name: 'quote-equipment-topic-name', access: 'admin', params: {} };
    }
    if (pathname === '/api/orcamentos/equipamentos-grupo/preco' && method === 'PATCH') {
        return { name: 'quote-equipment-group-price', access: 'admin', params: {} };
    }

    const servicePriceMatch = pathname.match(/^\/api\/orcamentos\/servicos\/([a-z0-9-]+)\/preco$/);
    if (servicePriceMatch && method === 'PATCH') {
        return {
            name: 'quote-service-price',
            access: 'admin',
            params: { serviceId: servicePriceMatch[1] }
        };
    }

    let groupMatch = pathname.match(/^\/api\/orcamentos\/equipamentos-grupo\/(ocultar|restaurar)$/);
    if (groupMatch && method === 'POST') {
        return {
            name: 'quote-equipment-group-visibility',
            access: 'admin',
            params: { action: groupMatch[1] }
        };
    }

    let match = pathname.match(/^\/api\/orcamentos\/equipamentos\/(\d+)\/(ocultar|restaurar)$/);
    if (match && method === 'POST') {
        return {
            name: 'quote-equipment-visibility',
            access: 'admin',
            params: { equipmentId: Number(match[1]), action: match[2] }
        };
    }

    match = pathname.match(/^\/api\/orcamentos\/equipamentos\/(\d+)\/(agendar|liberar)$/);
    if (match && method === 'POST') {
        return {
            name: match[2] === 'agendar' ? 'quote-equipment-schedule' : 'quote-equipment-release',
            access: 'quote',
            params: { equipmentId: Number(match[1]) }
        };
    }

    if (pathname === '/api/orcamentos/tecnicos' && method === 'GET') {
        return { name: 'quote-technicians', access: 'quote', params: {} };
    }
    if (pathname === '/api/orcamentos/date-conflicts' && method === 'GET') {
        return { name: 'quote-date-conflicts', access: 'quote', params: {} };
    }
    if (pathname === '/api/orcamentos/pagamentos' && method === 'GET') {
        return { name: 'quote-payments', access: 'quote', params: {} };
    }

    match = pathname.match(/^\/api\/orcamentos\/pagamentos\/(\d+)\/(pago|corrigir)$/);
    if (match && method === 'PATCH') {
        return {
            name: match[2] === 'pago' ? 'quote-payment-paid' : 'quote-payment-correct',
            access: 'quote',
            params: { paymentId: Number(match[1]) }
        };
    }

    if (pathname === '/api/orcamentos' && method === 'GET') {
        return { name: 'quote-list', access: 'quote', params: {} };
    }
    if (pathname === '/api/orcamentos' && method === 'POST') {
        return { name: 'quote-create', access: 'quote', params: {} };
    }

    match = pathname.match(/^\/api\/orcamentos\/(\d+)\/(pronto|aprovar)$/);
    if (match && (method === 'PATCH' || method === 'POST')) {
        return { name: 'quote-ready', access: 'quote', params: { quoteId: Number(match[1]) } };
    }

    match = pathname.match(/^\/api\/orcamentos\/(\d+)\/pdf$/);
    if (match && method === 'GET') {
        return { name: 'quote-pdf', access: 'quote', params: { quoteId: Number(match[1]) } };
    }

    match = pathname.match(/^\/api\/orcamentos\/(\d+)$/);
    if (match && ['GET', 'PATCH', 'DELETE'].includes(method)) {
        const names = { GET: 'quote-get', PATCH: 'quote-update', DELETE: 'quote-delete' };
        return { name: names[method], access: 'quote', params: { quoteId: Number(match[1]) } };
    }

    if (pathname === '/api/scheduled-events' && method === 'GET') {
        return { name: 'scheduled-events', access: 'auth', params: {} };
    }

    match = pathname.match(/^\/api\/events\/(\d+)\/quote-other-item-summary$/);
    if (match && method === 'GET') {
        return { name: 'quote-manual-summary', access: 'auth', params: { eventId: Number(match[1]) } };
    }

    match = pathname.match(/^\/api\/quote-other-item-events\/(saida|entrada)$/);
    if (match && method === 'POST') {
        return { name: 'quote-manual-movement', access: 'auth', params: { type: match[1] } };
    }

    return null;
}

export async function ensureQuoteSchema() {
    // O schema de orçamentos é provisionado pelas migrations 0017–0031.
    // Mantemos a exportação como no-op para compatibilidade com chamadores antigos,
    // sem executar DDL/PRAGMA no caminho quente das requisições.
}

export async function ensureAutomaticScheduledEvents(env, helpers = {}) {
    return ensureAutomaticScheduledEventsDb(createDb(env, helpers));
}

export async function findEquipmentDateConflict(
    env,
    equipmentId,
    currentRange,
    options = {},
    helpers = {}
) {
    return findEquipmentDateConflictDb(createDb(env, helpers), equipmentId, currentRange, options);
}

export async function findEquipmentGroupCapacityConflict(
    env,
    equipment,
    event,
    helpers = {}
) {
    return findEquipmentGroupCapacityConflictDb(createDb(env, helpers), equipment, event);
}

export async function getEventEquipmentRequirements(env, eventId, helpers = {}) {
    return getEventEquipmentRequirementsDb(createDb(env, helpers), eventId);
}

export async function getCommercialEquipmentGroupCapacity(
    env,
    equipmentName,
    currentRange,
    options = {},
    helpers = {}
) {
    const groups = await buildEquipmentGroupCapacityDb(
        createDb(env, helpers),
        currentRange,
        { ...options, equipmentName }
    );
    const group = groups.get(getQuoteEquipmentNameKey(equipmentName));
    return {
        equipmentName: group?.name || cleanText(equipmentName, 300) || 'Equipamento',
        ...getGroupCapacitySnapshot(group, currentRange)
    };
}

function createDb(env, helpers) {
    for (const name of ['queryAll', 'queryFirst', 'execute']) {
        if (typeof helpers[name] !== 'function') {
            throw new Error(`Helper D1 obrigatório ausente: ${name}`);
        }
    }

    const queryAll = (sql, params = []) => helpers.queryAll(env, sql, params);
    const queryFirst = (sql, params = []) => helpers.queryFirst(env, sql, params);
    const execute = (sql, params = []) => helpers.execute(env, sql, params);
    const batch = async (operations) => {
        if (!operations.length) return [];
        if (typeof helpers.batch !== 'function') {
            throw new Error('Helper D1 obrigatório ausente: batch');
        }
        return helpers.batch(env, operations);
    };

    return { queryAll, queryFirst, execute, batch };
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

function isAdminSession(session) {
    return normalizeUserRole(session?.role) === 'admin';
}

function canAccessQuotes(session) {
    const role = normalizeUserRole(session?.role);
    return role === 'admin' || role === 'comercial';
}

function normalizeUserRole(role) {
    const normalized = String(role || 'user').trim().toLowerCase();
    return USER_ROLES.has(normalized) ? normalized : 'user';
}

function httpError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function readRequestJson(request, helpers) {
    if (typeof helpers.readJson === 'function') {
        return helpers.readJson(request);
    }
    try {
        return await request.json();
    } catch {
        return {};
    }
}

function cleanText(value, maxLength = 500) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeQuoteOperationalDestination(value) {
    const normalized = cleanText(value, 20).toLowerCase();
    return QUOTE_OPERATIONAL_DESTINATIONS.has(normalized) ? normalized : '';
}

function parseBooleanFlag(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    return ['1', 'true', 'sim', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
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

function normalizeQuoteStatusText(status) {
    return String(status || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function normalizeQuoteServiceId(value) {
    return cleanText(value, 120)
        .toLowerCase()
        .replace(/^service:/, '')
        .replace(/[^a-z0-9-]/g, '');
}

export function serializeQuoteService(service = {}, priceOverrides = new Map()) {
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

export function getQuoteServiceSuggestions(search = '', priceOverrides = new Map()) {
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

async function getQuoteServicePriceOverrides(db) {
    const rows = await db.queryAll(
        'SELECT service_id AS serviceId, unit_price AS unitPrice FROM quote_service_prices'
    );
    return new Map(rows.map((row) => [
        normalizeQuoteServiceId(row.serviceId),
        roundMoney(parseMoneyValue(row.unitPrice))
    ]));
}

async function getQuoteServiceSuggestionsFromDatabase(db, search = '') {
    return getQuoteServiceSuggestions(search, await getQuoteServicePriceOverrides(db));
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

export function normalizeQuoteServiceItem(item, index = 0, priceOverrides = new Map()) {
    const fallbackId = String(item?.id || '').startsWith('service:') ? item.id : '';
    const serviceId = normalizeQuoteServiceId(item?.serviceId ?? item?.service_id ?? fallbackId);
    const isService = parseBooleanFlag(item?.isService ?? item?.is_service) || !!serviceId;
    if (!isService) return null;

    const service = QUOTE_SERVICE_BY_ID.get(serviceId);
    if (!service) throw httpError('Serviço de orçamento não encontrado.', 404);

    const quantity = Number.parseInt(item?.quantity, 10);
    const dailyUnits = Number.parseInt(item?.dailyUnits ?? item?.daily_units, 10);
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw httpError('Informe uma quantidade válida para o serviço.', 400);
    }
    if (!Number.isInteger(dailyUnits) || dailyUnits <= 0) {
        throw httpError('Informe uma quantidade válida de diárias para o serviço.', 400);
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
            throw httpError('Informe largura e altura válidas para o Painel de LED.', 400);
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

function isQuoteEquipmentUsableStatus(status) {
    return !normalizeQuoteStatusText(status).includes('manut') && !isInactiveEquipmentStatus(status);
}

function isInactiveEquipmentStatus(status) {
    const normalized = normalizeQuoteStatusText(status);
    return normalized.includes('inativ') || normalized.includes('baix');
}

function isPhysicallyUnavailableEquipmentStatus(status) {
    const normalized = normalizeQuoteStatusText(status);
    return normalized.includes('manut')
        || isInactiveEquipmentStatus(status)
        || normalized.includes('indispon');
}

export function calculateRequirementAvailability(requestedQuantity, separatedQuantity, warehouseAvailableQuantity) {
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

function serializeQuoteEquipment(row = {}) {
    return {
        id: Number(row.id),
        name: row.name || '',
        barcode: row.barcode || '',
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

function quoteEquipmentNameSql(table = 'equipments') {
    return `COALESCE(NULLIF(TRIM(${table}.quote_name), ''), ${table}.name)`;
}

function quoteEquipmentCategorySql(table = 'equipments') {
    return `COALESCE(NULLIF(TRIM(${table}.quote_category), ''), ${table}.category)`;
}

export function groupQuoteEquipmentsByName(equipments, unavailableIds = new Set(), capacityByName = new Map()) {
    const groups = new Map();

    for (const equipment of equipments) {
        const key = getQuoteEquipmentNameKey(equipment?.name) || `equipment-${Number(equipment?.id) || 0}`;
        if (!groups.has(key)) {
            groups.set(key, {
                name: equipment.name || 'Equipamento',
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

export function planQuoteEquipmentTopicRename(rows, sourceTopic, requestedTopic) {
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

function serializeQuoteDatabaseEquipment(row = {}) {
    return {
        ...serializeQuoteEquipment(row),
        hiddenFromQuotes: Number(row.hiddenFromQuotes ?? row.hidden_from_quotes ?? 0) === 1,
        hiddenAt: row.hiddenAt || row.hidden_at || null,
        hiddenByUsername: row.hiddenByUsername || row.hidden_by_username || null
    };
}

async function getQuoteEquipment(db, equipmentId) {
    return db.queryFirst(
        `SELECT id,
                ${quoteEquipmentNameSql()} AS name,
                barcode,
                serial_number AS serialNumber,
                observation,
                current_status AS currentStatus,
                ${quoteEquipmentCategorySql()} AS category,
                COALESCE(unit_price, 1) AS unitPrice
         FROM equipments
         WHERE id = ?`,
        [equipmentId]
    );
}

async function isQuoteEquipmentHidden(db, equipmentId) {
    return !!(await db.queryFirst(
        'SELECT equipment_id FROM quote_hidden_equipments WHERE equipment_id = ?',
        [equipmentId]
    ));
}

async function handleQuoteEquipmentDatabase(db, url, sendJson) {
    const search = cleanText(url.searchParams.get('search'), 120);
    const wildcard = `%${search}%`;
    const rows = await db.queryAll(
        `SELECT equipments.id,
                ${quoteEquipmentNameSql()} AS name,
                equipments.barcode,
                equipments.serial_number AS serialNumber,
                equipments.observation,
                equipments.current_status AS currentStatus,
                ${quoteEquipmentCategorySql()} AS category,
                COALESCE(equipments.unit_price, 1) AS unitPrice,
                CASE WHEN quote_hidden_equipments.equipment_id IS NULL THEN 0 ELSE 1 END AS hiddenFromQuotes,
                quote_hidden_equipments.hidden_at AS hiddenAt,
                quote_hidden_equipments.hidden_by_username AS hiddenByUsername
         FROM equipments
         LEFT JOIN quote_hidden_equipments
           ON quote_hidden_equipments.equipment_id = equipments.id
         WHERE ${quoteEquipmentNameSql()} LIKE ?
            OR equipments.barcode LIKE ?
            OR COALESCE(equipments.observation, '') LIKE ?
            OR COALESCE(${quoteEquipmentCategorySql()}, '') LIKE ?
         ORDER BY hiddenFromQuotes ASC,
                  lower(COALESCE(${quoteEquipmentCategorySql()}, 'Outros')) ASC,
                  lower(${quoteEquipmentNameSql()}) ASC,
                  equipments.barcode ASC`,
        [wildcard, wildcard, wildcard, wildcard]
    );
    return sendJson({
        equipments: rows.map(serializeQuoteDatabaseEquipment),
        services: await getQuoteServiceSuggestionsFromDatabase(db, search)
    });
}

async function handleQuoteEquipmentVisibility(db, session, params, sendJson) {
    const { equipmentId, action } = params;
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        return sendJson({ error: 'Equipamento inválido.' }, 400);
    }

    const equipment = await getQuoteEquipment(db, equipmentId);
    if (!equipment) {
        return sendJson({ error: 'Equipamento não encontrado.' }, 404);
    }

    if (action === 'ocultar') {
        await db.execute(
            `INSERT INTO quote_hidden_equipments (equipment_id, hidden_by_username)
             VALUES (?, ?)
             ON CONFLICT(equipment_id) DO UPDATE SET
                hidden_by_username = excluded.hidden_by_username,
                hidden_at = CURRENT_TIMESTAMP`,
            [equipmentId, session?.username || null]
        );
        return sendJson({ success: true, equipmentId, hiddenFromQuotes: true });
    }

    await db.execute('DELETE FROM quote_hidden_equipments WHERE equipment_id = ?', [equipmentId]);
    return sendJson({ success: true, equipmentId, hiddenFromQuotes: false });
}

async function handleQuoteEquipmentGroupName(db, request, helpers, sendJson) {
    const body = await readRequestJson(request, helpers);
    const equipmentIds = normalizeQuoteEquipmentGroupIds(body.equipmentIds);
    const name = cleanText(body.name, 300);
    if (!equipmentIds.length || !name) {
        return sendJson({ error: 'Informe os equipamentos e o novo nome.' }, 400);
    }

    const existing = await db.queryFirst(
        `SELECT COUNT(*) AS total
         FROM equipments
         WHERE id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
        [JSON.stringify(equipmentIds)]
    );
    if (Number(existing?.total) !== equipmentIds.length) {
        return sendJson({ error: 'Um ou mais equipamentos não foram encontrados.' }, 404);
    }

    await db.execute(
        `UPDATE equipments
         SET quote_name = ?
         WHERE id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
        [name, JSON.stringify(equipmentIds)]
    );
    return sendJson({ success: true, equipmentIds, name, updated: equipmentIds.length });
}

async function handleQuoteEquipmentTopicName(db, request, helpers, sendJson) {
    const body = await readRequestJson(request, helpers);
    const sourceTopic = cleanText(body.sourceTopic, 160).replace(/\s+/g, ' ');
    const requestedTopic = cleanText(body.topic, 160).replace(/\s+/g, ' ');
    if (!sourceTopic || !requestedTopic) {
        return sendJson({ error: 'Informe o tópico atual e o novo nome.' }, 400);
    }

    const topics = await db.queryAll(
        `SELECT ${quoteEquipmentCategorySql()} AS category, COUNT(*) AS total
         FROM equipments
         GROUP BY ${quoteEquipmentCategorySql()}`
    );
    const plan = planQuoteEquipmentTopicRename(topics, sourceTopic, requestedTopic);
    if (!plan) {
        return sendJson({ error: 'Tópico não encontrado.' }, 404);
    }

    const predicates = [];
    const params = [plan.topic];
    if (plan.rawTopics.length) {
        predicates.push(`${quoteEquipmentCategorySql()} IN (SELECT value FROM json_each(?))`);
        params.push(JSON.stringify(plan.rawTopics));
    }
    if (plan.includesNull) predicates.push(`${quoteEquipmentCategorySql()} IS NULL`);

    const result = await db.execute(
        `UPDATE equipments
         SET quote_category = ?
         WHERE ${predicates.join(' OR ')}`,
        params
    );
    const updated = Number(result?.meta?.changes) || plan.total;
    return sendJson({
        success: true,
        sourceTopic: plan.sourceTopic,
        topic: plan.topic,
        merged: plan.merged,
        updated
    });
}

async function handleQuoteEquipmentGroupPrice(db, request, helpers, sendJson) {
    const body = await readRequestJson(request, helpers);
    const requestedIds = normalizeQuoteEquipmentGroupIds(body.equipmentIds);
    const unitPrice = roundMoney(parseMoneyValue(body.unitPrice));
    if (!requestedIds.length || !Number.isFinite(unitPrice) || unitPrice < 0) {
        return sendJson({ error: 'Informe os equipamentos e um preço válido.' }, 400);
    }

    const names = await db.queryAll(
        `SELECT DISTINCT lower(trim(${quoteEquipmentNameSql()})) AS nameKey
         FROM equipments
         WHERE id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
        [JSON.stringify(requestedIds)]
    );
    if (!names.length) {
        return sendJson({ error: 'Um ou mais equipamentos não foram encontrados.' }, 404);
    }
    const nameKeys = names.map((entry) => entry.nameKey);
    const equipments = await db.queryAll(
        `SELECT id FROM equipments
         WHERE lower(trim(${quoteEquipmentNameSql()})) IN (SELECT value FROM json_each(?))`,
        [JSON.stringify(nameKeys)]
    );
    const equipmentIds = equipments.map((equipment) => Number(equipment.id));

    await db.execute(
        `UPDATE equipments
         SET unit_price = ?
         WHERE lower(trim(${quoteEquipmentNameSql()})) IN (SELECT value FROM json_each(?))`,
        [unitPrice, JSON.stringify(nameKeys)]
    );
    return sendJson({ success: true, equipmentIds, unitPrice, updated: equipmentIds.length });
}

async function handleQuoteServicePrice(db, request, params, helpers, sendJson) {
    const serviceId = normalizeQuoteServiceId(params.serviceId);
    const service = QUOTE_SERVICE_BY_ID.get(serviceId);
    const body = await readRequestJson(request, helpers);
    const unitPrice = roundMoney(parseMoneyValue(body.unitPrice));
    if (!service || service.editablePrice !== true) {
        return sendJson({ error: 'Serviço com preço editável não encontrado.' }, 404);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return sendJson({ error: 'Informe um preço válido.' }, 400);
    }

    await db.execute(
        `INSERT INTO quote_service_prices (service_id, unit_price, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(service_id) DO UPDATE SET
            unit_price = excluded.unit_price,
            updated_at = CURRENT_TIMESTAMP`,
        [serviceId, unitPrice]
    );
    return sendJson({ success: true, serviceId, unitPrice });
}

async function handleQuoteEquipmentGroupVisibility(db, request, session, params, helpers, sendJson) {
    const body = await readRequestJson(request, helpers);
    const requestedIds = normalizeQuoteEquipmentGroupIds(body.equipmentIds);
    if (!requestedIds.length) {
        return sendJson({ error: 'Informe os equipamentos.' }, 400);
    }

    const names = await db.queryAll(
        `SELECT DISTINCT lower(trim(${quoteEquipmentNameSql()})) AS nameKey
         FROM equipments
         WHERE id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
        [JSON.stringify(requestedIds)]
    );
    if (!names.length) {
        return sendJson({ error: 'Um ou mais equipamentos não foram encontrados.' }, 404);
    }
    const nameKeys = names.map((entry) => entry.nameKey);
    const equipments = await db.queryAll(
        `SELECT id FROM equipments
         WHERE lower(trim(${quoteEquipmentNameSql()})) IN (SELECT value FROM json_each(?))`,
        [JSON.stringify(nameKeys)]
    );
    const equipmentIds = equipments.map((equipment) => Number(equipment.id));

    const hidden = params.action === 'ocultar';
    const operations = hidden
        ? equipmentIds.map((equipmentId) => ({
            sql: `INSERT INTO quote_hidden_equipments (equipment_id, hidden_by_username)
                  VALUES (?, ?)
                  ON CONFLICT(equipment_id) DO UPDATE SET
                     hidden_by_username = excluded.hidden_by_username,
                     hidden_at = CURRENT_TIMESTAMP`,
            params: [equipmentId, session?.username || null]
        }))
        : equipmentIds.map((equipmentId) => ({
            sql: 'DELETE FROM quote_hidden_equipments WHERE equipment_id = ?',
            params: [equipmentId]
        }));
    await db.batch(operations);

    return sendJson({ success: true, equipmentIds, hiddenFromQuotes: hidden, updated: equipmentIds.length });
}

async function handleAvailableQuoteEquipments(db, url, sendJson) {
    const search = cleanText(url.searchParams.get('search'), 120);
    const eventRange = getQuoteOperationalRange({
        assemblyDatetime: cleanText(url.searchParams.get('assemblyDatetime'), 160),
        eventDatetime: cleanText(url.searchParams.get('eventDatetime'), 160),
        disassemblyDatetime: cleanText(url.searchParams.get('disassemblyDatetime'), 160)
    });
    const excludeQuoteId = Number(url.searchParams.get('quoteId') || url.searchParams.get('excludeQuoteId'));
    if (!search) return sendJson({ equipments: [] });
    const services = await getQuoteServiceSuggestionsFromDatabase(db, search);
    if (!eventRange) {
        if (services.length) return sendJson({ equipments: services, eventRange: null });
        return sendJson({ error: 'Informe Montagem, Evento e Desmontagem em ordem vÃ¡lida antes de buscar os equipamentos.' }, 400);
    }

    const wildcard = `%${search}%`;
    const rows = await db.queryAll(
        `SELECT id,
                ${quoteEquipmentNameSql()} AS name,
                barcode,
                serial_number AS serialNumber,
                observation,
                current_status AS currentStatus,
                COALESCE(${quoteEquipmentCategorySql()}, 'Outros') AS category,
                COALESCE(unit_price, 1) AS unitPrice
         FROM equipments
         WHERE (
                ${quoteEquipmentNameSql()} LIKE ?
                OR barcode LIKE ?
                OR COALESCE(observation, '') LIKE ?
                OR COALESCE(${quoteEquipmentCategorySql()}, 'Outros') LIKE ?
           )
           AND NOT EXISTS (
               SELECT 1
               FROM quote_hidden_equipments
               WHERE quote_hidden_equipments.equipment_id = equipments.id
           )
         ORDER BY CASE
                WHEN lower(COALESCE(${quoteEquipmentCategorySql()}, 'Outros')) = ? THEN 0
                WHEN COALESCE(${quoteEquipmentCategorySql()}, 'Outros') LIKE ? THEN 1
                WHEN ${quoteEquipmentNameSql()} LIKE ? THEN 2
                ELSE 3
            END,
            lower(COALESCE(${quoteEquipmentCategorySql()}, 'Outros')) ASC,
            lower(${quoteEquipmentNameSql()}) ASC,
            barcode ASC
         LIMIT 1200`,
        [wildcard, wildcard, wildcard, wildcard, search.toLowerCase(), wildcard, wildcard]
    );

    const catalogEquipments = rows.map(serializeQuoteEquipment);
    const unavailableIds = await findUnavailableEquipmentIdsDb(
        db,
        catalogEquipments.map((equipment) => equipment.id),
        eventRange,
        { excludeQuoteId }
    );
    const capacityGroups = await buildEquipmentGroupCapacityDb(db, eventRange, { excludeQuoteId });
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

    const equipmentGroups = groupQuoteEquipmentsByName(catalogEquipments, unavailableIds, capacityByName);
    return sendJson({
        equipments: [...services, ...equipmentGroups],
        eventRange: { start: eventRange.start, end: eventRange.end }
    });
}

async function handleQuoteEquipmentSchedule(db, request, params, helpers, sendJson) {
    const { equipmentId } = params;
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        return sendJson({ error: 'Equipamento inválido.' }, 400);
    }

    const body = await readRequestJson(request, helpers);
    const eventRange = getQuoteOperationalRange({
        assemblyDatetime: cleanText(body.assemblyDatetime, 160),
        eventDatetime: cleanText(body.eventDatetime, 160),
        disassemblyDatetime: cleanText(body.disassemblyDatetime, 160)
    });
    if (!eventRange) {
        return sendJson({ error: 'Informe Montagem, Evento e Desmontagem em ordem vÃ¡lida antes de acrescentar o equipamento.' }, 400);
    }

    const equipment = await getQuoteEquipment(db, equipmentId);
    if (!equipment) return sendJson({ error: 'Equipamento não encontrado.' }, 404);
    if (await isQuoteEquipmentHidden(db, equipmentId)) {
        return sendJson({ error: 'Este equipamento está oculto no banco de orçamentos.' }, 409);
    }
    const availabilityWarning = await findEquipmentDateConflictDb(db, equipmentId, eventRange, {
        equipment,
        excludeQuoteId: Number(body.quoteId || body.excludeQuoteId)
    });

    return sendJson({ success: true, equipment: serializeQuoteEquipment(equipment), availabilityWarning });
}

async function handleQuoteEquipmentRelease(db, params, sendJson) {
    const { equipmentId } = params;
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        return sendJson({ error: 'Equipamento inválido.' }, 400);
    }
    const equipment = await getQuoteEquipment(db, equipmentId);
    if (!equipment) return sendJson({ error: 'Equipamento não encontrado.' }, 404);
    return sendJson({ success: true, equipment: serializeQuoteEquipment(equipment) });
}

async function handleQuoteTechnicians(db, url, sendJson) {
    const search = cleanText(url.searchParams.get('search'), 120);
    const wildcard = `%${search}%`;
    const rows = await db.queryAll(
        `SELECT id,
                full_name AS fullName,
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
         WHERE full_name LIKE ? OR cpf LIKE ? OR rg LIKE ? OR COALESCE(area, '') LIKE ?
         ORDER BY lower(full_name) ASC
         LIMIT 100`,
        [wildcard, wildcard, wildcard, wildcard]
    );
    return sendJson({ operators: rows.map(serializeOperator) });
}

function serializeOperator(row = {}) {
    return {
        id: Number(row.id),
        fullName: row.fullName ?? row.full_name ?? '',
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

function toDateKey(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
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

export function buildQuotePdfFilename(quote = {}) {
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

export function buildQuotePdfContentDisposition(quote = {}) {
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

function getQuoteDateKeysFromText(value) {
    const range = getQuoteDateRangeFromText(value);
    if (!range) return [];

    const keys = [];
    let cursor = range.start;
    let guard = 0;
    while (cursor <= range.end && guard < 3700) {
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
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return [
        String(date.getUTCFullYear()).padStart(4, '0'),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0')
    ].join('-');
}

function rangesOverlap(currentRange, reservationRange) {
    return !!currentRange
        && !!reservationRange
        && currentRange.start <= reservationRange.end
        && currentRange.end >= reservationRange.start;
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

async function getEquipmentGroupNameVariantsDb(db, equipmentName) {
    const targetKey = getQuoteEquipmentNameKey(equipmentName);
    if (!targetKey) return [];

    const rows = await db.queryAll(
        `SELECT ${quoteEquipmentNameSql()} AS groupName
         FROM equipments
         WHERE ${quoteEquipmentNameSql()} IS NOT NULL AND trim(${quoteEquipmentNameSql()}) <> ''
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

async function buildEquipmentGroupCapacityDb(db, currentRange, options = {}) {
    const groups = new Map();
    if (!currentRange) return groups;

    const excludeQuoteId = Number(options.excludeQuoteId);
    const targetNames = options.equipmentName
        ? await getEquipmentGroupNameVariantsDb(db, options.equipmentName)
        : [];
    const targetNamesJson = targetNames.length ? JSON.stringify(targetNames) : '';
    const targetEquipmentClause = targetNamesJson
        ? `WHERE ${quoteEquipmentNameSql()} IN (SELECT CAST(value AS TEXT) FROM json_each(?))`
        : '';
    const targetQuoteClause = targetNamesJson
        ? `AND COALESCE(${quoteEquipmentNameSql()}, quote_items.description) IN (
               SELECT CAST(value AS TEXT) FROM json_each(?)
           )`
        : '';
    const targetReservedClause = targetNamesJson
        ? `AND reserved.equipment_id IN (
               SELECT id
               FROM equipments
               WHERE ${quoteEquipmentNameSql()} IN (SELECT CAST(value AS TEXT) FROM json_each(?))
           )`
        : '';
    const targetMovementClause = targetNamesJson
        ? `AND equipment_events.equipment_id IN (
               SELECT id
               FROM equipments
               WHERE ${quoteEquipmentNameSql()} IN (SELECT CAST(value AS TEXT) FROM json_each(?))
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

    const capacityResults = await db.batch([
        {
            sql: `SELECT id, ${quoteEquipmentNameSql()} AS name, current_status AS currentStatus
                  FROM equipments
                  ${targetEquipmentClause}`,
            params: equipmentParams
        },
        {
            sql: `SELECT quotes.id AS quoteId,
                    COALESCE(quotes.status, 'pending') AS quoteStatus,
                    quotes.event_name AS eventName,
                    quotes.assembly_datetime AS assemblyDatetime,
                    quotes.event_datetime AS eventDatetime,
                    quotes.disassembly_datetime AS disassemblyDatetime,
                    events.id AS eventId,
                    quote_items.quantity,
                    quote_items.description,
                    ${quoteEquipmentNameSql()} AS equipmentName
             FROM quote_items
             INNER JOIN quotes ON quotes.id = quote_items.quote_id
             LEFT JOIN equipments ON equipments.id = quote_items.equipment_id
             LEFT JOIN events ON events.orcamento_id = quotes.id
              WHERE quote_items.equipment_id IS NOT NULL
                AND COALESCE(quote_items.is_manual, 0) = 0
                ${targetQuoteClause}
                ${quoteExcludeClause}`,
            params: quoteParams
        },
        {
            sql: `SELECT DISTINCT events.id AS eventId,
                    events.orcamento_id AS quoteId,
                    events.name AS eventName,
                    events.date,
                    events.end_date,
                    events.event_type,
                    events.withdrawal_date,
                    events.return_date,
                    reserved.equipment_id AS equipmentId,
                    ${quoteEquipmentNameSql()} AS equipmentName
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
            params: reservedParams
        },
        {
            sql: `SELECT DISTINCT events.id AS eventId,
                    events.orcamento_id AS quoteId,
                    events.name AS eventName,
                    events.date,
                    events.end_date,
                    events.event_type,
                    events.withdrawal_date,
                    events.return_date,
                    equipment_events.equipment_id AS equipmentId,
                    ${quoteEquipmentNameSql()} AS equipmentName
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
            params: movementParams
        }
    ]);
    const [equipmentRows, quoteRows, reservedRows, movementRows] = capacityResults
        .map((result) => result?.results || []);

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

export function calculatePlanningAvailability(requestedQuantity, confirmedAvailableQuantity, forecastAvailableQuantity) {
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

async function findEquipmentGroupCapacityConflictDb(db, equipment, event) {
    const currentRange = getEventDateRange(event);
    if (!equipment || !currentRange) return null;

    const groups = await buildEquipmentGroupCapacityDb(db, currentRange, {
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
    const blockingEventNames = affectedDemands.map((item) => item.eventName).filter(Boolean);
    return {
        type: 'future_availability_warning',
        equipmentId: Number(equipment.id) || null,
        equipmentName: equipment.name || 'Equipamento',
        totalQuantity: Number(group?.totalQuantity) || 0,
        availableQuantity: firstAffected.availableAfterCheckout,
        deficit: firstAffected.deficitAfter,
        blockingEventName: blockingEventNames[0] || 'OrÃ§amento no mesmo perÃ­odo',
        blockingEventNames,
        affectedDemands,
        currentStart: currentRange.start,
        currentEnd: currentRange.end,
        currentStartLabel: currentRange.startLabel,
        currentEndLabel: currentRange.endLabel
    };
}

async function getEventEquipmentRequirementsDb(db, eventId) {
    const event = await db.queryFirst(
        `SELECT * FROM events WHERE id = ?`,
        [Number(eventId)]
    );
    const quoteId = Number(event?.orcamento_id || event?.quoteId);
    if (!event || !quoteId) return [];

    const [requestedRows, movementRows, inventoryRows] = await Promise.all([
        db.queryAll(
            `SELECT quote_items.quantity,
                    COALESCE(NULLIF(TRIM(${quoteEquipmentCategorySql()}), ''), quote_items.category) AS topicName,
                    quote_items.description,
                    ${quoteEquipmentNameSql()} AS equipmentName
             FROM quote_items
             LEFT JOIN equipments ON equipments.id = quote_items.equipment_id
             WHERE quote_items.quote_id = ?
               AND quote_items.equipment_id IS NOT NULL
               AND COALESCE(quote_items.is_manual, 0) = 0
             ORDER BY quote_items.sort_order ASC, quote_items.id ASC`,
            [quoteId]
        ),
        db.queryAll(
            `SELECT equipment_events.equipment_id AS equipmentId,
                    ${quoteEquipmentNameSql()} AS equipmentName,
                    ${quoteEquipmentCategorySql()} AS topicName,
                    SUM(CASE WHEN equipment_events.action_type = 'saida' THEN 1 ELSE -1 END) AS activeBalance,
                    SUM(CASE WHEN equipment_events.action_type = 'saida' THEN 1 ELSE 0 END) AS totalOutgoing
             FROM equipment_events
             INNER JOIN equipments ON equipments.id = equipment_events.equipment_id
             WHERE equipment_events.event_id = ?
             GROUP BY equipment_events.equipment_id, ${quoteEquipmentNameSql()}`,
            [Number(eventId)]
        ),
        db.queryAll(
            `SELECT equipments.id,
                    ${quoteEquipmentNameSql()} AS name,
                    ${quoteEquipmentCategorySql()} AS topicName,
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
        const excluded = Number(row.maintenanceOpen) === 1
            || isInactiveEquipmentStatus(row.currentStatus)
            || normalizeQuoteStatusText(row.currentStatus).includes('manut');
        if (!excluded) stock.usable += 1;
        if (!excluded && Number(row.activeBalance) <= 0 && !isPhysicallyUnavailableEquipmentStatus(row.currentStatus)) {
            stock.warehouse += 1;
        }
    }

    const currentRange = getEventDateRange(event);
    const capacityGroups = currentRange ? await buildEquipmentGroupCapacityDb(db, currentRange) : new Map();

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

function createDateConflict({ equipment, currentRange, reservation }) {
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

function dateConflictResponse(conflict, sendJson) {
    if (conflict?.type === 'group_capacity') {
        return sendJson({
            code: 'QUOTE_CAPACITY_PROTECTED',
            error: `Quantidade insuficiente de "${conflict.equipmentName || 'equipamento'}" para este perÃ­odo. DisponÃ­vel: ${Number(conflict.availableQuantity) || 0}.`,
            conflict
        }, 409);
    }
    return sendJson({
        code: 'DATE_CONFLICT',
        error: 'Patrimônio indisponível por conflito de datas.',
        conflict
    }, 409);
}

async function findEquipmentDateConflictDb(db, equipmentId, currentRange, options = {}) {
    const normalizedEquipmentId = Number(equipmentId);
    if (!Number.isInteger(normalizedEquipmentId) || normalizedEquipmentId <= 0 || !currentRange) {
        return null;
    }

    const equipment = options.equipment || await getQuoteEquipment(db, normalizedEquipmentId);
    if (!equipment) return null;

    const excludeEventId = Number(options.excludeEventId);
    const reservedEventParams = [normalizedEquipmentId];
    let reservedEventExcludeClause = '';
    if (Number.isInteger(excludeEventId) && excludeEventId > 0) {
        reservedEventExcludeClause = 'AND events.id <> ?';
        reservedEventParams.push(excludeEventId);
    }

    const movementEventParams = [normalizedEquipmentId];
    let movementEventExcludeClause = '';
    if (Number.isInteger(excludeEventId) && excludeEventId > 0) {
        movementEventExcludeClause = 'AND events.id <> ?';
        movementEventParams.push(excludeEventId);
    }

    const conflictResults = await db.batch([
        {
            sql: `SELECT DISTINCT events.id,
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
            params: reservedEventParams
        },
        {
            sql: `SELECT DISTINCT events.id,
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
           ${movementEventExcludeClause}
         ORDER BY events.date DESC, events.id DESC`,
            params: movementEventParams
        }
    ]);
    const reservedEvents = conflictResults[0]?.results || [];
    const movementEvents = conflictResults[1]?.results || [];
    for (const reservation of reservedEvents) {
        const reservationRange = getEventDateRange(reservation);
        if (reservationRange && rangesOverlap(currentRange, reservationRange)) {
            return createDateConflict({
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

    for (const reservation of movementEvents) {
        const reservationRange = getEventDateRange(reservation);
        if (reservationRange && rangesOverlap(currentRange, reservationRange)) {
            return createDateConflict({
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

async function findUnavailableEquipmentIdsDb(db, equipmentIds, currentRange, options = {}) {
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
        db.queryAll(
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
        db.queryAll(
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

async function findQuoteItemsAvailabilityWarnings(db, items, currentRange, options = {}) {
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

    const groups = await buildEquipmentGroupCapacityDb(db, currentRange, {
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
            blockingEventName: blockingEventNames[0] || 'Reserva no mesmo perÃ­odo',
            blockingEventNames,
            currentStart: currentRange.start,
            currentEnd: currentRange.end,
            currentStartLabel: currentRange.startLabel,
            currentEndLabel: currentRange.endLabel
        });
    }
    return warnings;
}

async function findQuoteItemsDateConflict(db, items, currentRange, options = {}) {
    const warnings = await findQuoteItemsAvailabilityWarnings(db, items, currentRange, options);
    return warnings[0] || null;
}

async function findQuoteItemsLegacyDateConflict(db, items, currentRange, options = {}) {
    const equipmentItems = items.filter((item) => {
        const equipmentId = Number(item?.equipmentId);
        return Number.isInteger(equipmentId) && equipmentId > 0;
    });
    if (!equipmentItems.length || !currentRange) return null;

    const equipmentIds = [...new Set(equipmentItems.map((item) => Number(item.equipmentId)))];
    const selectedEquipmentJson = JSON.stringify(equipmentIds);
    const excludeQuoteId = Number(options.excludeQuoteId);
    const quoteParams = [selectedEquipmentJson];
    const quoteExcludeClause = Number.isInteger(excludeQuoteId) && excludeQuoteId > 0
        ? 'AND quotes.id <> ?'
        : '';
    if (quoteExcludeClause) quoteParams.push(excludeQuoteId);

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

    const [quoteReservations, reservedEvents, movementEvents] = await Promise.all([
        db.queryAll(
            `SELECT DISTINCT quote_items.equipment_id AS equipmentId,
                    quotes.id,
                    quotes.event_name AS eventName,
                    quotes.event_datetime AS eventDatetime
             FROM quote_items
             INNER JOIN quotes ON quotes.id = quote_items.quote_id
             WHERE quote_items.equipment_id IN (
                 SELECT CAST(value AS INTEGER) FROM json_each(?)
             )
               ${quoteExcludeClause}
             ORDER BY quotes.created_at DESC, quotes.id DESC`,
            quoteParams
        ),
        db.queryAll(
            `SELECT DISTINCT reserved.equipment_id AS equipmentId,
                    events.id,
                    events.name AS eventName,
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
               ${eventExcludeClause}
             ORDER BY events.date DESC, events.id DESC`,
            reservedParams
        ),
        db.queryAll(
            `SELECT DISTINCT equipment_events.equipment_id AS equipmentId,
                    events.id,
                    events.name AS eventName,
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
               ${eventExcludeClause}
             ORDER BY events.date DESC, events.id DESC`,
            movementParams
        )
    ]);

    const groupByEquipment = (rows) => {
        const grouped = new Map();
        for (const row of rows) {
            const equipmentId = Number(row.equipmentId ?? row.equipment_id);
            if (!grouped.has(equipmentId)) grouped.set(equipmentId, []);
            grouped.get(equipmentId).push(row);
        }
        return grouped;
    };
    const quoteByEquipment = groupByEquipment(quoteReservations);
    const reservedByEquipment = groupByEquipment(reservedEvents);
    const movementsByEquipment = groupByEquipment(movementEvents);

    for (const item of equipmentItems) {
        const equipmentId = Number(item.equipmentId);
        const equipment = { id: equipmentId, name: item.description };
        for (const reservation of quoteByEquipment.get(equipmentId) || []) {
            const range = getQuoteDateRangeFromText(reservation.eventDatetime);
            if (range && rangesOverlap(currentRange, range)) {
                return createDateConflict({
                    equipment,
                    currentRange,
                    reservation: { source: 'quote', eventName: reservation.eventName, range }
                });
            }
        }
        for (const reservation of reservedByEquipment.get(equipmentId) || []) {
            const range = getEventDateRange(reservation);
            if (range && rangesOverlap(currentRange, range)) {
                return createDateConflict({
                    equipment,
                    currentRange,
                    reservation: { source: 'event_reservation', eventName: reservation.eventName, range }
                });
            }
        }
        for (const reservation of movementsByEquipment.get(equipmentId) || []) {
            const range = getEventDateRange(reservation);
            if (range && rangesOverlap(currentRange, range)) {
                return createDateConflict({
                    equipment,
                    currentRange,
                    reservation: { source: 'event', eventName: reservation.eventName, range }
                });
            }
        }
    }
    return null;
}

async function handleQuoteDateConflicts(db, url, sendJson) {
    const date = cleanText(url.searchParams.get('date'), 20);
    const excludeId = Number(url.searchParams.get('excludeId'));
    if (!parseIsoDateKey(date)) {
        return sendJson({ error: 'Data inválida' }, 400);
    }

    const params = [];
    const excludeClause = Number.isInteger(excludeId) && excludeId > 0 ? 'WHERE id <> ?' : '';
    if (excludeClause) params.push(excludeId);
    const quotes = await db.queryAll(
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
    return sendJson({
        conflicts: quotes.filter((quote) => getDateKeysFromRange(getQuoteOperationalRange(quote)).includes(date))
    });
}

function serializeQuoteTechnician(row = {}) {
    const dailyUnits = Math.max(1, Number.parseInt(row.dailyUnits ?? row.daily_units, 10) || 1);
    const cacheValue = roundMoney(parseMoneyValue(row.cacheValue ?? row.cache_value));
    const rawOperatorId = row.operatorId ?? row.operator_id;
    return {
        id: row.id ? Number(row.id) : null,
        operatorId: rawOperatorId ? Number(rawOperatorId) : null,
        operatorName: row.operatorName ?? row.operator_name ?? '',
        dailyUnits,
        cacheValue,
        paymentTotal: roundMoney(dailyUnits * cacheValue),
        paidAt: row.paidAt ?? row.paid_at ?? null,
        paidByUsername: row.paidByUsername ?? row.paid_by_username ?? null,
        sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0) || 0
    };
}

function getQuotePaymentDateKey(quote) {
    const range = getQuoteDateRangeFromText(quote?.disassemblyDatetime || quote?.disassembly_datetime);
    return range ? addDaysToDateKey(range.end, 30) : '';
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

async function getQuotePaymentEntries(db) {
    const rows = await db.queryAll(
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
         WHERE quotes.status = 'approved'
         ORDER BY quotes.disassembly_datetime ASC, quotes.event_name ASC, quote_technicians.sort_order ASC`
    );
    return rows
        .map(serializeQuotePaymentEntry)
        .filter((entry) => entry.paymentDate)
        .sort((first, second) => (
            first.paymentDate.localeCompare(second.paymentDate)
            || String(first.eventName).localeCompare(String(second.eventName), 'pt-BR')
            || String(first.operatorName).localeCompare(String(second.operatorName), 'pt-BR')
        ));
}

async function handleQuotePayments(db, sendJson) {
    return sendJson({ payments: await getQuotePaymentEntries(db) });
}

async function handleQuotePaymentPaid(db, session, params, sendJson) {
    const { paymentId } = params;
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
        return sendJson({ error: 'Pagamento inválido' }, 400);
    }
    const payment = await db.queryFirst(
        `SELECT quote_technicians.id,
                quote_technicians.quote_id AS quoteId,
                quote_technicians.paid_at AS paidAt,
                COALESCE(quotes.status, 'pending') AS quoteStatus
         FROM quote_technicians
         INNER JOIN quotes ON quotes.id = quote_technicians.quote_id
         WHERE quote_technicians.id = ?`,
        [paymentId]
    );
    if (!payment) return sendJson({ error: 'Pagamento não encontrado' }, 404);
    if (payment.quoteStatus !== 'approved') {
        return sendJson({ error: 'Somente pagamentos de orçamentos aprovados podem ser marcados como pagos.' }, 409);
    }
    const result = await db.execute(
        `UPDATE quote_technicians
         SET paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
             paid_by_username = COALESCE(paid_by_username, ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND quote_id = ?
           AND EXISTS (
               SELECT 1 FROM quotes
               WHERE quotes.id = quote_technicians.quote_id
                 AND quotes.status = 'approved'
           )`,
        [session?.username || null, paymentId, Number(payment.quoteId)]
    );
    if (getChangedRowCount(result) !== 1) {
        return sendJson({
            error: 'O orçamento ou o pagamento mudou durante a operação. Atualize a tela e tente novamente.'
        }, 409);
    }
    return sendJson({ success: true, id: paymentId });
}

async function handleQuotePaymentCorrect(db, params, sendJson) {
    const { paymentId } = params;
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
        return sendJson({ error: 'Pagamento inválido' }, 400);
    }
    const payment = await db.queryFirst(
        `SELECT quote_technicians.id,
                quote_technicians.quote_id AS quoteId,
                COALESCE(quotes.status, 'pending') AS quoteStatus
         FROM quote_technicians
         INNER JOIN quotes ON quotes.id = quote_technicians.quote_id
         WHERE quote_technicians.id = ?`,
        [paymentId]
    );
    if (!payment) return sendJson({ error: 'Pagamento não encontrado' }, 404);
    if (payment.quoteStatus !== 'approved') {
        return sendJson({ error: 'Somente pagamentos de orçamentos aprovados podem ser corrigidos.' }, 409);
    }
    const result = await db.execute(
        `UPDATE quote_technicians
         SET paid_at = NULL,
             paid_by_username = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND quote_id = ?
           AND EXISTS (
               SELECT 1 FROM quotes
               WHERE quotes.id = quote_technicians.quote_id
                 AND quotes.status = 'approved'
           )`,
        [paymentId, Number(payment.quoteId)]
    );
    if (getChangedRowCount(result) !== 1) {
        return sendJson({
            error: 'O orçamento ou o pagamento mudou durante a operação. Atualize a tela e tente novamente.'
        }, 409);
    }
    return sendJson({ success: true, id: paymentId });
}

function normalizeEquipmentQuoteItem(item, index, usedEquipmentIds, equipmentById, servicePriceOverrides) {
    const serviceItem = normalizeQuoteServiceItem(item, index, servicePriceOverrides);
    if (serviceItem) return serviceItem;

    const equipmentId = Number(item?.equipmentId);
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
        if (!parseBooleanFlag(item?.isManual)) {
            throw httpError('Item de orçamento sem equipamento cadastrado inválido.', 400);
        }

        const description = cleanText(item?.description, 300);
        const quantity = Number.parseInt(item?.quantity, 10);
        const dailyUnits = Number.parseInt(item?.dailyUnits, 10);
        const internalUnitPrice = roundMoney(parseMoneyValue(item?.internalUnitPrice));
        if (!description) throw httpError('Digite o nome do equipamento avulso.', 400);
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw httpError('Informe uma quantidade válida para o equipamento avulso.', 400);
        }
        if (!Number.isInteger(dailyUnits) || dailyUnits <= 0) {
            throw httpError('Informe uma quantidade válida de diárias para o equipamento avulso.', 400);
        }
        if (!Number.isFinite(internalUnitPrice) || internalUnitPrice < 0) {
            throw httpError('Informe um preço válido para o equipamento avulso.', 400);
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
        throw httpError('O mesmo equipamento foi acrescentado mais de uma vez ao orçamento.', 400);
    }
    const equipment = equipmentById.get(equipmentId);
    if (!equipment) throw httpError('Equipamento não encontrado.', 404);
    usedEquipmentIds.add(equipmentId);
    const category = QUOTE_CATEGORIES.has(item?.category) ? item.category : 'transmissao';
    const quantity = Number.parseInt(item?.quantity, 10);
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw httpError('Informe uma quantidade válida para o equipamento.', 400);
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

async function getQuoteItemsFromBody(db, items) {
    const inputItems = Array.isArray(items) ? items : [];
    const servicePriceOverrides = await getQuoteServicePriceOverrides(db);
    const equipmentIds = [...new Set(inputItems
        .map((item) => Number(item?.equipmentId))
        .filter((equipmentId) => Number.isInteger(equipmentId) && equipmentId > 0))];
    const equipmentRows = equipmentIds.length
        ? await db.queryAll(
            `SELECT equipments.id,
                    ${quoteEquipmentNameSql()} AS name,
                    equipments.barcode,
                    equipments.serial_number AS serialNumber,
                    equipments.observation,
                    equipments.current_status AS currentStatus,
                    ${quoteEquipmentCategorySql()} AS category,
                    COALESCE(equipments.unit_price, 1) AS unitPrice
             FROM equipments
             INNER JOIN json_each(?) selected
               ON CAST(selected.value AS INTEGER) = equipments.id`,
            [JSON.stringify(equipmentIds)]
        )
        : [];
    const equipmentById = new Map(equipmentRows.map((equipment) => [Number(equipment.id), equipment]));
    const usedEquipmentIds = new Set();
    const normalizedItems = [];
    for (const [index, item] of inputItems.entries()) {
        const normalized = normalizeEquipmentQuoteItem(
            item,
            index,
            usedEquipmentIds,
            equipmentById,
            servicePriceOverrides
        );
        if (normalized) normalizedItems.push(normalized);
    }
    return normalizedItems;
}

async function normalizeQuoteTechniciansFromBody(db, technicians) {
    const inputTechnicians = Array.isArray(technicians) ? technicians : [];
    const requested = inputTechnicians.map((technician, index) => ({
        index,
        technician,
        operatorId: Number(
            technician?.operatorId
            ?? technician?.operator_id
            ?? technician?.technicianId
            ?? technician?.technician_id
        )
    }));
    const operatorIds = requested
        .map(({ operatorId }) => operatorId)
        .filter((operatorId) => Number.isInteger(operatorId) && operatorId > 0);
    const operatorRows = operatorIds.length
        ? await db.queryAll(
            `SELECT operators.id,
                    operators.full_name AS fullName,
                    operators.cache_value AS cacheValue
             FROM operators
             INNER JOIN json_each(?) selected
               ON CAST(selected.value AS INTEGER) = operators.id`,
            [JSON.stringify([...new Set(operatorIds)])]
        )
        : [];
    const operatorById = new Map(operatorRows.map((operator) => [Number(operator.id), operator]));
    const normalizedTechnicians = [];
    const usedOperatorIds = new Set();
    for (const { index, technician, operatorId } of requested) {
        if (!Number.isInteger(operatorId) || operatorId <= 0) {
            throw httpError('Selecione um técnico cadastrado para o orçamento.', 400);
        }
        if (usedOperatorIds.has(operatorId)) {
            throw httpError('O mesmo técnico foi acrescentado mais de uma vez ao orçamento.', 400);
        }

        const dailyUnits = Number.parseInt(technician?.dailyUnits ?? technician?.daily_units, 10);
        if (!Number.isInteger(dailyUnits) || dailyUnits <= 0) {
            throw httpError('Informe uma quantidade válida de diárias para cada técnico.', 400);
        }
        const operator = operatorById.get(operatorId);
        if (!operator) throw httpError('Técnico não encontrado.', 404);

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

async function getQuoteTechnicians(db, quoteId) {
    const rows = await db.queryAll(
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

async function getQuoteWithItems(db, quoteId) {
    const quote = await db.queryFirst(
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
                created_at AS createdAt,
                updated_at AS updatedAt
         FROM quotes
         WHERE id = ?`,
        [quoteId]
    );
    if (!quote) return null;

    quote.showItemPrices = Number(quote.showItemPrices) === 1;
    quote.items = await db.queryAll(
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
    quote.items = quote.items.map((item) => ({
        ...item,
        isManual: Number(item.isManual) === 1,
        isService: Number(item.isService) === 1
    }));
    quote.technicians = await getQuoteTechnicians(db, quoteId);
    return quote;
}

function getTodayDateInput() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

async function normalizeQuotePayload(db, body) {
    const items = await getQuoteItemsFromBody(db, body?.items);
    const technicians = await normalizeQuoteTechniciansFromBody(db, body?.technicians);
    const itemsSubtotal = roundMoney(items.reduce((sum, item) => sum + item.internalTotal, 0));
    const techniciansSubtotal = roundMoney(
        technicians.reduce((sum, technician) => sum + technician.paymentTotal, 0)
    );
    const logisticsPrice = roundMoney(Math.max(0, parseMoneyValue(body?.logisticsPrice)));
    const techniciansPrice = roundMoney(Math.max(0, parseMoneyValue(body?.techniciansPrice)));
    const subtotal = roundMoney(itemsSubtotal + techniciansSubtotal + logisticsPrice + techniciansPrice);
    const finalTotalInput = body?.finalTotal === undefined || body?.finalTotal === ''
        ? subtotal
        : body.finalTotal;
    const finalTotal = roundMoney(parseMoneyValue(finalTotalInput));
    const quote = {
        proposalCity: cleanText(body?.proposalCity, 80) || 'Belo Horizonte',
        proposalDate: cleanText(body?.proposalDate, 20) || getTodayDateInput(),
        clientName: cleanText(body?.clientName, 160),
        eventName: cleanText(body?.eventName, 200),
        eventLocation: cleanText(body?.eventLocation, 220),
        eventDatetime: cleanText(body?.eventDatetime, 160),
        assemblyDatetime: cleanText(body?.assemblyDatetime, 160),
        disassemblyDatetime: cleanText(body?.disassemblyDatetime, 160),
        paymentMethod: cleanText(body?.paymentMethod, 160),
        paymentDeadline: cleanText(body?.paymentDeadline, 120),
        logisticsPrice,
        techniciansPrice,
        showItemPrices: parseBooleanFlag(body?.showItemPrices),
        notes: cleanText(body?.notes, 800),
        subtotal,
        finalTotal
    };

    if (
        !quote.clientName
        || !quote.eventName
        || !quote.eventLocation
        || !quote.eventDatetime
        || !quote.assemblyDatetime
        || !quote.disassemblyDatetime
    ) {
        throw httpError('Preencha as informações gerais do orçamento.', 400);
    }
    if (!quote.paymentMethod || !quote.paymentDeadline) {
        throw httpError('Preencha as condições de pagamento.', 400);
    }
    if (items.length === 0) {
        throw httpError('Adicione pelo menos um item ao orçamento.', 400);
    }
    const eventRange = getQuoteOperationalRange(quote);
    if (!eventRange) {
        throw httpError('Informe Montagem, Evento e Desmontagem em ordem válida.', 400);
    }

    return { quote, items, technicians, eventRange };
}

function quoteItemsInsertOperation(quoteId, items) {
    if (!items.length) return null;
    const useLastInsertedQuote = quoteId === null;
    const serializedItems = JSON.stringify(items.map((item) => ({
        equipmentId: item.equipmentId || null,
        isManual: item.isManual ? 1 : 0,
        isService: item.isService ? 1 : 0,
        serviceId: item.serviceId || null,
        serviceWidth: item.serviceWidth || null,
        serviceHeight: item.serviceHeight || null,
        category: item.category,
        description: item.description,
        quantity: item.quantity,
        dailyUnits: item.dailyUnits,
        internalUnitPrice: item.internalUnitPrice,
        internalTotal: item.internalTotal,
        sortOrder: item.sortOrder
    })));
    return {
        sql: `${useLastInsertedQuote
            ? 'WITH new_quote(quote_id) AS MATERIALIZED (SELECT last_insert_rowid())'
            : ''}
              INSERT INTO quote_items (
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
              )
              SELECT ${useLastInsertedQuote ? 'new_quote.quote_id' : '?'},
                     CAST(json_extract(value, '$.equipmentId') AS INTEGER),
                     CAST(json_extract(value, '$.isManual') AS INTEGER),
                     CAST(json_extract(value, '$.isService') AS INTEGER),
                     json_extract(value, '$.serviceId'),
                     CAST(json_extract(value, '$.serviceWidth') AS REAL),
                     CAST(json_extract(value, '$.serviceHeight') AS REAL),
                     json_extract(value, '$.category'),
                     json_extract(value, '$.description'),
                     CAST(json_extract(value, '$.quantity') AS INTEGER),
                     CAST(json_extract(value, '$.dailyUnits') AS INTEGER),
                     CAST(json_extract(value, '$.internalUnitPrice') AS REAL),
                     CAST(json_extract(value, '$.internalTotal') AS REAL),
                     CAST(json_extract(value, '$.sortOrder') AS INTEGER)
              FROM json_each(?)${useLastInsertedQuote ? ' CROSS JOIN new_quote' : ''}
              ORDER BY CAST(key AS INTEGER)`,
        params: useLastInsertedQuote ? [serializedItems] : [quoteId, serializedItems]
    };
}

function quoteTechniciansInsertOperation(quoteId, technicians) {
    if (!technicians.length) return null;
    const useLastInsertedQuoteItem = quoteId === null;
    const serializedTechnicians = JSON.stringify(technicians.map((technician) => ({
        operatorId: technician.operatorId,
        operatorName: technician.operatorName,
        dailyUnits: technician.dailyUnits,
        cacheValue: technician.cacheValue,
        sortOrder: technician.sortOrder
    })));
    return {
        sql: `${useLastInsertedQuoteItem
            ? `WITH new_quote(quote_id) AS MATERIALIZED (
                SELECT quote_id FROM quote_items WHERE id = last_insert_rowid()
              )`
            : ''}
              INSERT INTO quote_technicians (
                quote_id,
                operator_id,
                operator_name,
                daily_units,
                cache_value,
                sort_order
              )
              SELECT ${useLastInsertedQuoteItem ? 'new_quote.quote_id' : '?'},
                     CAST(json_extract(value, '$.operatorId') AS INTEGER),
                     json_extract(value, '$.operatorName'),
                     CAST(json_extract(value, '$.dailyUnits') AS INTEGER),
                     CAST(json_extract(value, '$.cacheValue') AS REAL),
                     CAST(json_extract(value, '$.sortOrder') AS INTEGER)
              FROM json_each(?)${useLastInsertedQuoteItem ? ' CROSS JOIN new_quote' : ''}
              ORDER BY CAST(key AS INTEGER)`,
        params: useLastInsertedQuoteItem ? [serializedTechnicians] : [quoteId, serializedTechnicians]
    };
}

async function handleQuoteList(db, url, sendJson) {
    const status = String(url.searchParams.get('status') || 'pending').trim().toLowerCase() === 'approved'
        ? 'approved'
        : 'pending';
    const quotes = await db.queryAll(
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
         WHERE quotes.status = ?
         GROUP BY quotes.id
         ORDER BY ${status === 'approved' ? 'datetime(quotes.approved_at) DESC,' : ''}
                  quotes.created_at DESC,
                  quotes.id DESC`,
        [status]
    );
    return sendJson({ quotes });
}

async function handleQuoteCreate(db, request, session, helpers, sendJson) {
    const body = await readRequestJson(request, helpers);
    const { quote, items, technicians, eventRange } = await normalizeQuotePayload(db, body);
    const availabilityWarnings = await findQuoteItemsAvailabilityWarnings(db, items, eventRange);

    const [created] = await db.batch([
        {
            sql: `INSERT INTO quotes (
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id`,
            params: [
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
                quote.subtotal,
                quote.finalTotal,
                quote.showItemPrices ? 1 : 0,
                quote.notes,
                session?.username || null
            ]
        },
        // Os itens são obrigatórios e capturam o id do pai recém-inserido. A
        // operação de técnicos recupera esse mesmo pai a partir do último item.
        quoteItemsInsertOperation(null, items),
        quoteTechniciansInsertOperation(null, technicians)
    ].filter(Boolean));
    const quoteId = Number(created?.results?.[0]?.id ?? created?.meta?.last_row_id);
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        throw new Error('Não foi possível obter o identificador do orçamento criado');
    }
    return sendJson({
        id: quoteId,
        success: true,
        ...(availabilityWarnings.length ? { availabilityWarnings } : {})
    });
}

async function handleQuoteGet(db, params, sendJson) {
    const { quoteId } = params;
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        return sendJson({ error: 'Orçamento inválido' }, 400);
    }
    const quote = await getQuoteWithItems(db, quoteId);
    if (!quote) return sendJson({ error: 'Orçamento não encontrado' }, 404);
    return sendJson({ quote });
}

async function handleQuoteUpdate(db, request, params, helpers, sendJson) {
    const { quoteId } = params;
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        return sendJson({ error: 'Orçamento inválido' }, 400);
    }
    const body = await readRequestJson(request, helpers);
    const { quote, items, technicians, eventRange } = await normalizeQuotePayload(db, body);
    const existingQuote = await db.queryFirst(
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
    if (!existingQuote) return sendJson({ error: 'Orçamento não encontrado' }, 404);
    if (!['pending', 'approved'].includes(existingQuote.status)) {
        return sendJson({ error: 'Este orçamento não pode ser editado.' }, 409);
    }

    const isApproved = existingQuote.status === 'approved';
    const eventId = Number(existingQuote.eventId);
    const operationalMetadata = getOperationalEventMetadata(existingQuote.destinationType, eventRange);
    if (isApproved) {
        const paidTechnician = await db.queryFirst(
            `SELECT id
             FROM quote_technicians
             WHERE quote_id = ? AND paid_at IS NOT NULL
             LIMIT 1`,
            [quoteId]
        );
        if (paidTechnician) {
            return sendJson({
                error: 'Este orçamento possui pagamento de técnico registrado. Corrija o pagamento antes de editar.'
            }, 409);
        }

        if (Number.isInteger(eventId) && eventId > 0) {
            const movementHistory = await db.queryFirst(
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
                return sendJson({
                    error: 'Este orçamento já possui movimentações no evento e não pode ser editado.'
                }, 409);
            }
        }
    }

    const availabilityWarnings = await findQuoteItemsAvailabilityWarnings(db, items, eventRange, {
        excludeQuoteId: quoteId,
        excludeEventId: eventId
    });

    const newEquipmentIds = [...new Set(items.map((item) => Number(item.equipmentId)).filter(Boolean))];

    const operations = [
        {
            sql: `UPDATE quotes
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
            params: [
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
                quote.subtotal,
                quote.finalTotal,
                quote.showItemPrices ? 1 : 0,
                quote.notes,
                quoteId
            ]
        },
        {
            sql: `UPDATE equipments
                  SET current_status = 'Disponivel'
                  WHERE current_status = 'Agendado'
                    AND id IN (
                        SELECT equipment_id
                        FROM quote_items
                        WHERE quote_id = ? AND equipment_id IS NOT NULL
                    )
                    AND id NOT IN (
                        SELECT CAST(value AS INTEGER) FROM json_each(?)
                    )`,
            params: [quoteId, JSON.stringify(newEquipmentIds)]
        },
        {
            sql: `DELETE FROM quote_manual_item_movements
                  WHERE quote_item_id IN (SELECT id FROM quote_items WHERE quote_id = ?)`,
            params: [quoteId]
        },
        {
            sql: `DELETE FROM event_reserved_equipments
                  WHERE ${Number.isInteger(eventId) && eventId > 0
                    ? 'event_id = ?'
                    : 'quote_item_id IN (SELECT id FROM quote_items WHERE quote_id = ?)'}`,
            params: [Number.isInteger(eventId) && eventId > 0 ? eventId : quoteId]
        },
        { sql: 'DELETE FROM quote_items WHERE quote_id = ?', params: [quoteId] },
        { sql: 'DELETE FROM quote_technicians WHERE quote_id = ?', params: [quoteId] },
        quoteItemsInsertOperation(quoteId, items),
        quoteTechniciansInsertOperation(quoteId, technicians),
        Number.isInteger(eventId) && eventId > 0 ? {
            sql: `UPDATE events
                  SET name = ?, date = ?, end_date = ?, event_type = ?, withdrawal_date = ?, return_date = ?
                  WHERE id = ?`,
            params: [
                quote.eventName || `Orçamento ${quoteId}`,
                operationalMetadata.date,
                operationalMetadata.endDate,
                operationalMetadata.eventType,
                operationalMetadata.withdrawalDate,
                operationalMetadata.returnDate,
                eventId
            ]
        } : null,
    ].filter(Boolean);
    await db.batch(operations);
    if (isApproved && (!Number.isInteger(eventId) || eventId <= 0)) {
        await ensureAutomaticScheduledEventsDb(db, { quoteId });
    }
    return sendJson({
        id: quoteId,
        success: true,
        status: existingQuote.status,
        ...(availabilityWarnings.length ? { availabilityWarnings } : {})
    });
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

async function ensureAutomaticScheduledEventsDb(db, options = {}) {
    const today = getTodayDateInput();
    const requestedQuoteId = Number(options.quoteId);
    const hasRequestedQuote = Number.isInteger(requestedQuoteId) && requestedQuoteId > 0;
    const quotes = await db.queryAll(
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
         WHERE quotes.status = 'approved'
           ${hasRequestedQuote ? 'AND quotes.id = ?' : ''}
         ORDER BY quotes.approved_at ASC, quotes.id ASC`,
        hasRequestedQuote ? [requestedQuoteId] : []
    );

    const eventsToCreate = [];
    const existingEventsToUpdate = [];
    for (const quote of quotes) {
        const range = getQuoteOperationalRange(quote);
        if (!range) continue;
        const metadata = getOperationalEventMetadata(quote.destinationType, range);
        if (Number(quote.eventId) > 0) {
            const expectedName = quote.eventName || `OrÃ§amento ${quote.id}`;
            const eventMetadataChanged = String(quote.currentEventName || '') !== String(expectedName)
                || String(quote.currentEventDate || '') !== String(metadata.date)
                || String(quote.currentEventEndDate || '') !== String(metadata.endDate)
                || String(quote.currentEventType || 'event') !== String(metadata.eventType)
                || String(quote.currentWithdrawalDate || '') !== String(metadata.withdrawalDate || '')
                || String(quote.currentReturnDate || '') !== String(metadata.returnDate || '');
            if (Number(quote.movementCount) === 0 && eventMetadataChanged) {
                existingEventsToUpdate.push({
                    eventId: Number(quote.eventId),
                    name: expectedName,
                    ...metadata
                });
            }
            continue;
        }
        if (!hasRequestedQuote && range.end < today) continue;
        eventsToCreate.push({
            name: quote.eventName || `Orçamento ${quote.id}`,
            ...metadata,
            createdByUsername: quote.createdByUsername || 'sistema',
            quoteId: Number(quote.id)
        });
    }

    if (existingEventsToUpdate.length) {
        await db.batch(existingEventsToUpdate.map((event) => ({
            sql: `UPDATE events
                  SET name = ?, date = ?, end_date = ?, event_type = ?, withdrawal_date = ?, return_date = ?
                  WHERE id = ?`,
            params: [
                event.name,
                event.date,
                event.endDate,
                event.eventType,
                event.withdrawalDate,
                event.returnDate,
                event.eventId
            ]
        })));
    }

    for (let index = 0; index < eventsToCreate.length; index += 20) {
        const chunk = eventsToCreate.slice(index, index + 20);
        const params = [];
        const values = chunk.map((event) => {
            params.push(
                event.name,
                event.date,
                event.endDate,
                event.createdByUsername,
                event.eventType,
                event.withdrawalDate,
                event.returnDate,
                event.quoteId
            );
            return '(?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)';
        });
        await db.execute(
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
             ) VALUES ${values.join(', ')}`,
            params
        );
    }

}

async function handleQuoteReady(db, request, session, params, helpers, sendJson) {
    const { quoteId } = params;
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        return sendJson({ error: 'Orçamento inválido' }, 400);
    }
    const quote = await db.queryFirst(
        'SELECT id, COALESCE(status, "pending") AS status FROM quotes WHERE id = ?',
        [quoteId]
    );
    if (!quote) return sendJson({ error: 'Orçamento não encontrado' }, 404);

    const body = await readRequestJson(request, helpers);
    const destinationType = normalizeQuoteOperationalDestination(body?.destinationType);
    if (!destinationType) {
        return sendJson({ error: 'Escolha se o orçamento deve virar Evento ou Locação.' }, 400);
    }

    const quoteWithItems = await getQuoteWithItems(db, quoteId);
    const availabilityWarnings = await findQuoteItemsAvailabilityWarnings(
        db,
        quoteWithItems?.items || [],
        getQuoteOperationalRange(quoteWithItems || {}),
        { excludeQuoteId: quoteId }
    );

    await db.batch([
        {
            sql: `INSERT INTO quote_operational_destinations (
                    quote_id, destination_type, selected_by_username, selected_at, updated_at
                  ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                  ON CONFLICT(quote_id) DO UPDATE SET
                    destination_type = excluded.destination_type,
                    selected_by_username = excluded.selected_by_username,
                    updated_at = CURRENT_TIMESTAMP`,
            params: [quoteId, destinationType, session?.username || null]
        },
        {
            sql: `UPDATE quotes
                  SET status = 'approved',
                      approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
                      updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
            params: [quoteId]
        }
    ]);
    await ensureAutomaticScheduledEventsDb(db, { quoteId });
    return sendJson({
        success: true,
        id: quoteId,
        status: 'approved',
        destinationType,
        ...(availabilityWarnings.length ? { availabilityWarnings } : {})
    });
}

async function releaseScheduledQuoteEquipments(db, quoteId) {
    await db.execute(
        `UPDATE equipments
         SET current_status = 'Disponivel'
         WHERE current_status = 'Agendado'
           AND id IN (
               SELECT equipment_id
               FROM quote_items
               WHERE quote_id = ? AND equipment_id IS NOT NULL
           )`,
        [quoteId]
    );
}

async function deleteEventRecords(db, eventId) {
    // O saldo é calculado dentro da mesma transação que apaga os movimentos.
    // Assim, um retry após commit encontra zero linhas e não devolve o estoque duas vezes.
    await db.batch([
        {
            sql: `UPDATE equipments
                  SET current_status = 'Disponivel'
                  WHERE EXISTS (
                      SELECT 1
                      FROM equipment_events
                      WHERE equipment_events.event_id = ?
                        AND equipment_events.equipment_id = equipments.id
                  )`,
            params: [eventId]
        },
        {
            sql: `UPDATE cables
                  SET available_quantity = available_quantity + (
                          SELECT COALESCE(SUM(CASE
                              WHEN action_type = 'saida' THEN quantity
                              ELSE -quantity
                          END), 0)
                          FROM cable_event_movements
                          WHERE cable_event_movements.event_id = ?
                            AND cable_event_movements.cable_id = cables.id
                      ),
                      updated_at = CURRENT_TIMESTAMP
                  WHERE (
                      SELECT COALESCE(SUM(CASE
                          WHEN action_type = 'saida' THEN quantity
                          ELSE -quantity
                      END), 0)
                      FROM cable_event_movements
                      WHERE cable_event_movements.event_id = ?
                        AND cable_event_movements.cable_id = cables.id
                  ) > 0`,
            params: [eventId, eventId]
        },
        {
            sql: `UPDATE other_items
                  SET available_quantity = available_quantity + (
                          SELECT COALESCE(SUM(CASE
                              WHEN action_type = 'saida' THEN quantity
                              ELSE -quantity
                          END), 0)
                          FROM other_item_event_movements
                          WHERE other_item_event_movements.event_id = ?
                            AND other_item_event_movements.item_id = other_items.id
                      ),
                      updated_at = CURRENT_TIMESTAMP
                  WHERE (
                      SELECT COALESCE(SUM(CASE
                          WHEN action_type = 'saida' THEN quantity
                          ELSE -quantity
                      END), 0)
                      FROM other_item_event_movements
                      WHERE other_item_event_movements.event_id = ?
                        AND other_item_event_movements.item_id = other_items.id
                  ) > 0`,
            params: [eventId, eventId]
        },
        { sql: 'DELETE FROM quote_manual_item_movements WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM event_reserved_equipments WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM other_item_event_movements WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM cable_event_movements WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM equipment_events WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM event_saida_hidden_items WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM event_spaces WHERE event_id = ?', params: [eventId] },
        { sql: 'DELETE FROM events WHERE id = ?', params: [eventId] }
    ]);
}

async function handleQuoteDelete(db, params, sendJson) {
    const { quoteId } = params;
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        return sendJson({ error: 'Orçamento inválido' }, 400);
    }
    const quote = await db.queryFirst('SELECT id FROM quotes WHERE id = ?', [quoteId]);
    if (!quote) return sendJson({ error: 'Orçamento não encontrado' }, 404);

    const automaticEvent = await db.queryFirst('SELECT id FROM events WHERE orcamento_id = ?', [quoteId]);
    const eventId = Number(automaticEvent?.id);
    await db.batch([
        // O pai é removido primeiro para que o trigger 0030 valide pagamentos e
        // movimentos enquanto todos os filhos ainda existem. Qualquer conflito
        // aborta e reverte o batch inteiro.
        { sql: 'DELETE FROM quotes WHERE id = ?', params: [quoteId] },
        {
            sql: `UPDATE equipments
                  SET current_status = 'Disponivel'
                  WHERE current_status = 'Agendado'
                    AND id IN (
                        SELECT equipment_id
                        FROM quote_items
                        WHERE quote_id = ? AND equipment_id IS NOT NULL
                    )`,
            params: [quoteId]
        },
        {
            sql: `DELETE FROM quote_manual_item_movements
                  WHERE quote_item_id IN (SELECT id FROM quote_items WHERE quote_id = ?)`,
            params: [quoteId]
        },
        {
            sql: `DELETE FROM event_reserved_equipments
                  WHERE quote_item_id IN (SELECT id FROM quote_items WHERE quote_id = ?)
                     OR (? > 0 AND event_id = ?)`,
            params: [quoteId, eventId || 0, eventId || 0]
        },
        eventId > 0 ? { sql: 'DELETE FROM event_saida_hidden_items WHERE event_id = ?', params: [eventId] } : null,
        eventId > 0 ? { sql: 'DELETE FROM event_spaces WHERE event_id = ?', params: [eventId] } : null,
        eventId > 0 ? { sql: 'DELETE FROM events WHERE id = ?', params: [eventId] } : null,
        { sql: 'DELETE FROM quote_operational_destinations WHERE quote_id = ?', params: [quoteId] },
        { sql: 'DELETE FROM quote_technicians WHERE quote_id = ?', params: [quoteId] },
        { sql: 'DELETE FROM quote_items WHERE quote_id = ?', params: [quoteId] }
    ].filter(Boolean));
    return sendJson({ success: true });
}

async function handleScheduledEvents(db, sendJson) {
    await ensureAutomaticScheduledEventsDb(db);
    const [events, reservedEquipments, movements] = await Promise.all([
        db.queryAll(
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
        ),
        db.queryAll(
            `SELECT reserved.event_id AS eventId,
                    equipments.id,
                    equipments.name,
                    equipments.barcode,
                    COALESCE(equipments.category, 'Outros') AS category
             FROM event_reserved_equipments reserved
             INNER JOIN equipments ON equipments.id = reserved.equipment_id
             INNER JOIN events ON events.id = reserved.event_id
             WHERE events.orcamento_id IS NOT NULL
             ORDER BY lower(equipments.name) ASC, equipments.barcode ASC`,
        ),
        db.queryAll(
            `SELECT all_movements.event_id AS eventId,
                    SUM(all_movements.movementCount) AS movementCount,
                    SUM(all_movements.pendingQuantity) AS pendingQuantity
             FROM (
                 SELECT event_id,
                        COUNT(*) AS movementCount,
                        SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END) AS pendingQuantity
                 FROM equipment_events
                 GROUP BY event_id

                 UNION ALL

                 SELECT event_id,
                        COUNT(*) AS movementCount,
                        SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS pendingQuantity
                 FROM cable_event_movements
                 GROUP BY event_id

                 UNION ALL

                 SELECT event_id,
                        COUNT(*) AS movementCount,
                        SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS pendingQuantity
                 FROM other_item_event_movements
                 GROUP BY event_id

                 UNION ALL
                 SELECT event_id,
                        COUNT(*) AS movementCount,
                        SUM(CASE
                            WHEN action_type = 'saida' THEN quantity
                            ELSE -quantity
                        END) AS pendingQuantity
                 FROM quote_manual_item_movements
                 GROUP BY event_id
             ) AS all_movements
             INNER JOIN events ON events.id = all_movements.event_id
             WHERE events.orcamento_id IS NOT NULL
             GROUP BY all_movements.event_id`
        )
    ]);

    const reservedByEvent = new Map();
    for (const equipment of reservedEquipments) {
        const eventId = Number(equipment.eventId);
        if (!reservedByEvent.has(eventId)) reservedByEvent.set(eventId, []);
        const { eventId: ignoredEventId, ...serializedEquipment } = equipment;
        reservedByEvent.get(eventId).push(serializedEquipment);
    }
    const movementByEvent = new Map(movements.map((movement) => [Number(movement.eventId), movement]));

    for (const event of events) {
        event.reservedEquipments = reservedByEvent.get(Number(event.id)) || [];
        const movement = movementByEvent.get(Number(event.id));
        const movementCount = Number(movement?.movementCount) || 0;
        const pendingQuantity = Number(movement?.pendingQuantity) || 0;
        event.status = movementCount === 0
            ? 'Agendado'
            : (pendingQuantity > 0 ? 'Em andamento' : 'Finalizado');
    }
    return sendJson({ events: events.filter((event) => event.status !== 'Finalizado') });
}

async function handleQuoteManualSummary(db, params, sendJson) {
    const { eventId } = params;
    if (!Number.isInteger(eventId) || eventId <= 0) {
        return sendJson({ error: 'Evento inválido' }, 400);
    }
    const rows = await db.queryAll(
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
    return sendJson(rows);
}

function parseOptionalSpaceId(value) {
    if (value === undefined || value === null || value === '') return null;
    const spaceId = Number(value);
    return Number.isInteger(spaceId) && spaceId > 0 ? spaceId : NaN;
}

async function resolveEventSpaceId(db, eventId, value) {
    const spaceId = parseOptionalSpaceId(value);
    if (Number.isNaN(spaceId)) throw httpError('Espaço inválido', 400);
    if (spaceId === null) return null;
    const space = await db.queryFirst(
        'SELECT id FROM event_spaces WHERE id = ? AND event_id = ?',
        [spaceId, eventId]
    );
    if (!space) throw httpError('Espaço não encontrado neste evento', 404);
    return spaceId;
}

function getQuoteMutationRequestId(request, body = {}) {
    const supplied = String(
        request.headers.get('Idempotency-Key')
        || body.requestId
        || body.request_id
        || ''
    ).trim();

    if (!supplied) return crypto.randomUUID();
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(supplied)) {
        throw httpError('Chave de idempotência inválida', 400);
    }
    return supplied;
}

function isUniqueConstraintError(error) {
    return getD1ErrorMessage(error).toLowerCase().includes('unique constraint failed');
}

function isSameQuoteManualMovement(row, expected) {
    return Number(row?.quoteItemId) === expected.quoteItemId
        && Number(row?.eventId) === expected.eventId
        && Number(row?.spaceId || 0) === Number(expected.spaceId || 0)
        && String(row?.actionType || '') === expected.type
        && Number(row?.quantity) === expected.quantity;
}

function assertQuoteManualMovementReplay(row, expected) {
    if (!isSameQuoteManualMovement(row, expected)) {
        throw httpError('Esta chave de idempotência já foi usada em outra movimentação', 409);
    }
    return { replayed: true, result: null };
}

async function executeIdempotentQuoteManualMovement(db, options) {
    const { requestId, expected, sql, params } = options;
    const findExisting = () => db.queryFirst(
        `SELECT id,
                quote_item_id AS quoteItemId,
                event_id AS eventId,
                space_id AS spaceId,
                action_type AS actionType,
                quantity
         FROM quote_manual_item_movements
         WHERE request_id = ?`,
        [requestId]
    );

    return withD1Retry(async () => {
        const existing = await findExisting();
        if (existing) return assertQuoteManualMovementReplay(existing, expected);

        try {
            return {
                replayed: false,
                result: await db.execute(sql, params)
            };
        } catch (error) {
            if (!isD1UnavailableError(error) && !isUniqueConstraintError(error)) {
                throw error;
            }

            try {
                const committed = await findExisting();
                if (committed) return assertQuoteManualMovementReplay(committed, expected);
            } catch (verificationError) {
                throw verificationError;
            }
            throw error;
        }
    }, {
        maxAttempts: 6,
        baseDelayMs: 50,
        maxDelayMs: 800,
        onRetry: ({ attempt, delayMs, error }) => {
            console.warn(JSON.stringify({
                message: 'd1 transient error; retry scheduled',
                operation: `quote-manual-item-${expected.type}`,
                attempt,
                delayMs,
                error: getD1ErrorMessage(error)
            }));
        }
    });
}

async function handleQuoteManualMovement(db, request, params, helpers, sendJson) {
    const body = await readRequestJson(request, helpers);
    const { type } = params;
    const quoteItemId = Number(body.quoteItemId);
    const eventId = Number(body.eventId);
    const quantity = Number(body.quantity);
    if (
        !Number.isInteger(quoteItemId)
        || quoteItemId <= 0
        || !Number.isInteger(eventId)
        || eventId <= 0
        || !Number.isInteger(quantity)
        || quantity <= 0
    ) {
        return sendJson({ message: 'quoteItemId, eventId e quantidade são obrigatórios' }, 400);
    }
    const requestId = getQuoteMutationRequestId(request, body);

    const quoteItem = await db.queryFirst(
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
        return sendJson({ message: 'Equipamento avulso não encontrado neste evento' }, 404);
    }

    const spaceId = await resolveEventSpaceId(db, eventId, body.spaceId);
    const expected = { quoteItemId, eventId, spaceId, type, quantity };
    let mutation;
    if (type === 'saida') {
        mutation = await executeIdempotentQuoteManualMovement(db, {
            requestId,
            expected,
            sql: `INSERT INTO quote_manual_item_movements (
                    quote_item_id, event_id, space_id, action_type, quantity, request_id
                  )
                  SELECT ?, ?, ?, 'saida', ?, ?
                  WHERE (
                      SELECT COALESCE(SUM(CASE
                          WHEN action_type = 'saida' THEN quantity
                          WHEN action_type = 'entrada' THEN -quantity
                          ELSE 0
                      END), 0)
                      FROM quote_manual_item_movements
                      WHERE quote_item_id = ? AND event_id = ?
                  ) + ? <= ?`,
            params: [
                quoteItemId,
                eventId,
                spaceId,
                quantity,
                requestId,
                quoteItemId,
                eventId,
                quantity,
                Number(quoteItem.quantity)
            ]
        });
        if (!mutation.replayed && getChangedRowCount(mutation.result) !== 1) {
            return sendJson({ message: 'A quantidade de saída ultrapassa a quantidade informada no orçamento' }, 409);
        }
    } else {
        mutation = await executeIdempotentQuoteManualMovement(db, {
            requestId,
            expected,
            sql: `INSERT INTO quote_manual_item_movements (
                    quote_item_id, event_id, space_id, action_type, quantity, request_id
                  )
                  SELECT ?, ?, ?, 'entrada', ?, ?
                  WHERE (
                      SELECT COALESCE(SUM(CASE
                          WHEN action_type = 'saida' THEN quantity
                          ELSE -quantity
                      END), 0)
                      FROM quote_manual_item_movements
                      WHERE quote_item_id = ?
                        AND event_id = ?
                        AND COALESCE(space_id, 0) = COALESCE(?, 0)
                  ) >= ?`,
            params: [
                quoteItemId,
                eventId,
                spaceId,
                quantity,
                requestId,
                quoteItemId,
                eventId,
                spaceId,
                quantity
            ]
        });
        if (!mutation.replayed && getChangedRowCount(mutation.result) !== 1) {
            return sendJson({ message: 'Este equipamento avulso não possui saída pendente suficiente neste evento' }, 409);
        }
    }
    return sendJson({ success: true, requestId, replayed: mutation.replayed });
}

function getChangedRowCount(result) {
    return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

async function handleQuotePdf(db, request, env, executionCtx, params, sendJson) {
    const { quoteId } = params;
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        return sendJson({ error: 'Orçamento inválido' }, 400);
    }
    const quote = await db.queryFirst('SELECT id FROM quotes WHERE id = ?', [quoteId]);
    if (!quote) return sendJson({ error: 'Orçamento não encontrado' }, 404);

    return new Response(`<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gerando PDF...</title></head>
<body data-quote-pdf-id="${quoteId}"><p>Gerando PDF do orçamento...</p><script src="/javascript/quote-pdf-client.js?v=20260819-named-download"></script></body>
</html>`, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=UTF-8',
            'Cache-Control': 'private, no-store',
            'X-Quote-PDF-Renderer': 'browser'
        }
    });
}

export async function createQuotePdf(quote, request, env) {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`Orçamento ${quote.eventName || quote.id}`);
    pdfDoc.setAuthor('24H Locações');
    pdfDoc.setSubject('Proposta comercial');
    pdfDoc.setCreator('Sistema de Estoque 24H');

    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const [headerBytes, signatureBytes] = await Promise.all([
        fetchAssetBytes(env, request, '/fotos/quote-header.png'),
        fetchAssetBytes(env, request, '/fotos/quote-signature.png')
    ]);
    let headerImage = null;
    let signatureImage = null;
    if (headerBytes) {
        try {
            headerImage = await pdfDoc.embedPng(headerBytes);
        } catch {
            headerImage = null;
        }
    }
    if (signatureBytes) {
        try {
            signatureImage = await pdfDoc.embedPng(signatureBytes);
        } catch {
            signatureImage = null;
        }
    }

    const context = { pdfDoc, regular, bold, headerImage, signatureImage };
    drawQuoteDocument(context, quote);
    return pdfDoc.save({
        useObjectStreams: false,
        addDefaultPage: false,
        objectsPerTick: Infinity,
        updateFieldAppearances: false
    });
}

async function fetchAssetBytes(env, request, pathname) {
    if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') return null;
    try {
        const assetUrl = new URL(pathname, request.url);
        const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: 'GET' }));
        if (!response.ok) return null;
        return response.arrayBuffer();
    } catch {
        return null;
    }
}

function addPdfPage(context) {
    return context.pdfDoc.addPage(QUOTE_PDF_SIZE);
}

function pdfText(value) {
    return String(value ?? '-')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/\u00A0/g, ' ')
        .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, '?');
}

function wrapPdfText(text, font, size, maxWidth) {
    const paragraphs = pdfText(text).split(/\r?\n/);
    const lines = [];
    for (const paragraph of paragraphs) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (!words.length) {
            lines.push('');
            continue;
        }
        let line = '';
        for (const rawWord of words) {
            let word = rawWord;
            if (font.widthOfTextAtSize(word, size) > maxWidth) {
                const pieces = [];
                let piece = '';
                for (const char of word) {
                    const candidate = `${piece}${char}`;
                    if (piece && font.widthOfTextAtSize(candidate, size) > maxWidth) {
                        pieces.push(piece);
                        piece = char;
                    } else {
                        piece = candidate;
                    }
                }
                if (piece) pieces.push(piece);
                for (const splitWord of pieces) {
                    const candidate = line ? `${line} ${splitWord}` : splitWord;
                    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
                        lines.push(line);
                        line = splitWord;
                    } else {
                        line = candidate;
                    }
                }
                continue;
            }

            const candidate = line ? `${line} ${word}` : word;
            if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
                lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        }
        if (line) lines.push(line);
    }
    return lines.length ? lines : [''];
}

function drawPdfText(page, text, x, top, options) {
    const {
        width,
        font,
        size = 9.2,
        align = 'left',
        lineHeight = size * 1.18,
        color = rgb(0.07, 0.07, 0.07),
        maxLines = Infinity
    } = options;
    let lines = wrapPdfText(text, font, size, Math.max(1, width));
    if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        const lastIndex = lines.length - 1;
        let last = lines[lastIndex];
        while (last && font.widthOfTextAtSize(`${last}...`, size) > width) {
            last = last.slice(0, -1);
        }
        lines[lastIndex] = `${last}...`;
    }

    lines.forEach((line, index) => {
        const lineWidth = font.widthOfTextAtSize(line, size);
        let textX = x;
        if (align === 'center') textX = x + Math.max(0, (width - lineWidth) / 2);
        if (align === 'right') textX = x + Math.max(0, width - lineWidth);
        page.drawText(line, {
            x: textX,
            y: QUOTE_PDF_SIZE[1] - top - size - index * lineHeight,
            size,
            font,
            color
        });
    });
    return { lines, height: lines.length * lineHeight };
}

function drawTopRectangle(page, x, top, width, height, options = {}) {
    page.drawRectangle({
        x,
        y: QUOTE_PDF_SIZE[1] - top - height,
        width,
        height,
        borderWidth: options.borderWidth ?? 0.8,
        borderColor: options.borderColor || rgb(0.07, 0.07, 0.07),
        color: options.color
    });
}

function drawTopLine(page, x1, top1, x2, top2, thickness = 0.8) {
    page.drawLine({
        start: { x: x1, y: QUOTE_PDF_SIZE[1] - top1 },
        end: { x: x2, y: QUOTE_PDF_SIZE[1] - top2 },
        thickness,
        color: rgb(0.07, 0.07, 0.07)
    });
}

function drawQuoteHeader(page, context) {
    if (context.headerImage) {
        page.drawImage(context.headerImage, {
            x: 50.9,
            y: QUOTE_PDF_SIZE[1] - 22.4 - 154.6,
            width: 512.1,
            height: 154.6
        });
        return;
    }
    drawPdfText(page, '24H LOCAÇÕES', 50.9, 45, {
        width: 512.1,
        font: context.bold,
        size: 24,
        align: 'center'
    });
    drawPdfText(page, 'LOCAÇÃO DE EQUIPAMENTOS', 50.9, 78, {
        width: 512.1,
        font: context.regular,
        size: 11,
        align: 'center'
    });
    drawTopLine(page, 50.9, 120, 563, 120, 1.2);
}

function drawQuoteHeading(page, context, text, x, top, width = 500) {
    const value = pdfText(text);
    drawPdfText(page, value, x, top, { width, font: context.regular, size: 10.4 });
    const textWidth = Math.min(width, context.regular.widthOfTextAtSize(value, 10.4));
    drawTopLine(page, x, top + 12.3, x + textWidth, top + 12.3, 0.6);
}

function drawQuoteCellText(page, context, text, x, top, width, height, options = {}) {
    const font = options.bold ? context.bold : context.regular;
    const size = options.fontSize || 9.2;
    const paddingX = options.paddingX ?? 6;
    const lineHeight = size * 1.15 + (options.lineGap || 0);
    const textWidth = Math.max(1, width - paddingX * 2);
    const lines = wrapPdfText(text, font, size, textWidth);
    const maxLines = Math.max(1, Math.floor((height - 3) / lineHeight));
    const visibleLineCount = Math.min(lines.length, maxLines);
    const textHeight = visibleLineCount * lineHeight;
    const verticalPadding = Math.max(2, (height - textHeight) / 2);
    drawPdfText(page, text, x + paddingX, top + verticalPadding, {
        width: textWidth,
        font,
        size,
        align: options.align || 'left',
        lineHeight,
        maxLines
    });
}

function drawQuoteInformationTable(page, context, quote, top) {
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
    const rowHeights = rows.map(([, value]) => Math.max(
        15.1,
        wrapPdfText(value || '-', context.regular, 9.2, valueWidth - 12).length * 10.6 + 4
    ));
    const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0);
    drawTopRectangle(page, x, top, width, totalHeight);
    drawTopLine(page, x + labelWidth, top, x + labelWidth, top + totalHeight);

    let rowTop = top;
    rows.forEach(([label, value], index) => {
        if (index > 0) drawTopLine(page, x, rowTop, x + width, rowTop);
        drawQuoteCellText(page, context, label, x, rowTop, labelWidth, rowHeights[index]);
        drawQuoteCellText(page, context, value || '-', x + labelWidth, rowTop, valueWidth, rowHeights[index], {
            paddingX: 1
        });
        rowTop += rowHeights[index];
    });
    return top + totalHeight;
}

function formatQuoteCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value) || 0).replace(/\s/g, '');
}

function getQuoteItemDescription(item) {
    const description = cleanText(item?.description, 300) || '-';
    return item?.isService === true || Number(item?.isService) === 1
        ? description.toUpperCase()
        : description;
}

export function consolidateQuoteItemsForDisplay(items = []) {
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

function getQuoteItemTableWidths() {
    return [56.7, 240.3, 43, 70, 107.2];
}

function getQuoteEquipmentTotal(quote) {
    return roundMoney((Array.isArray(quote?.items) ? quote.items : [])
        .reduce((sum, item) => sum + (Number(item?.internalTotal) || 0), 0));
}

function getQuoteItemRowHeight(context, item, descriptionWidth) {
    return Math.max(
        15,
        wrapPdfText(getQuoteItemDescription(item), context.regular, 8.4, descriptionWidth - 8).length * 9.7 + 5
    );
}

function takeQuoteItemsForPage(context, items, maxItems, maxBodyHeight) {
    const descriptionWidth = getQuoteItemTableWidths()[1];
    let count = 0;
    let usedHeight = 0;
    for (const item of items) {
        const rowHeight = getQuoteItemRowHeight(context, item, descriptionWidth);
        if (count > 0 && (count >= maxItems || usedHeight + rowHeight > maxBodyHeight)) break;
        count += 1;
        usedHeight += rowHeight;
    }
    return items.slice(0, count);
}

function drawQuoteItemsTable(page, context, items, startIndex, top, options = {}) {
    const x = QUOTE_PDF_LEFT;
    const showItemPrices = options.showItemPrices === true;
    const showEquipmentTotal = showItemPrices && options.showEquipmentTotal === true;
    const equipmentTotalHeight = showEquipmentTotal ? 22 : 0;
    const widths = getQuoteItemTableWidths();
    const headerHeight = 32;
    const rowHeights = items.map((item) => getQuoteItemRowHeight(context, item, widths[1]));
    const naturalBodyHeight = rowHeights.reduce((sum, height) => sum + height, 0) + equipmentTotalHeight;
    const bodyHeight = Math.max(options.minimumBodyHeight || 0, naturalBodyHeight);
    const totalHeight = headerHeight + bodyHeight;
    const boundaries = [x];
    widths.forEach((width) => boundaries.push(boundaries[boundaries.length - 1] + width));

    drawTopRectangle(page, x, top, QUOTE_PDF_WIDTH, totalHeight, { borderWidth: 0.7 });
    boundaries.slice(1, -1).forEach((boundary) => {
        drawTopLine(page, boundary, top, boundary, top + totalHeight, 0.7);
    });
    drawTopLine(page, x, top + headerHeight, x + QUOTE_PDF_WIDTH, top + headerHeight, 0.7);

    const headers = [
        'Item',
        'Equipamentos',
        'Quant',
        'Diárias/Uni.',
        showItemPrices ? 'Valor Total/Uni.' : ''
    ];
    let headerX = x;
    headers.forEach((header, index) => {
        drawQuoteCellText(page, context, header, headerX, top, widths[index], headerHeight, {
            bold: index === 1,
            fontSize: index === 1 ? 10 : (index === 0 ? 9.2 : 8.3),
            paddingX: index === 0 ? 6 : 2,
            align: index === 1 ? 'center' : 'left'
        });
        headerX += widths[index];
    });

    let rowTop = top + headerHeight;
    items.forEach((item, index) => {
        if (index > 0) drawTopLine(page, x, rowTop, x + QUOTE_PDF_WIDTH, rowTop, 0.7);
        const values = [
            String(startIndex + index + 1).padStart(2, '0'),
            getQuoteItemDescription(item),
            String(Math.max(1, Number(item.quantity) || 1)).padStart(2, '0'),
            String(Math.max(1, Number(item.dailyUnits) || 1)).padStart(2, '0')
        ];
        values.push(showItemPrices ? formatQuoteCurrency(item.internalTotal) : '');

        let cellX = x;
        values.forEach((value, valueIndex) => {
            drawQuoteCellText(page, context, value, cellX, rowTop, widths[valueIndex], rowHeights[index], {
                paddingX: valueIndex === 1 ? 1 : 2,
                fontSize: valueIndex === 1 ? 8.4 : 8.2,
                align: valueIndex === 1 ? 'left' : 'center'
            });
            cellX += widths[valueIndex];
        });
        rowTop += rowHeights[index];
    });

    if (showEquipmentTotal) {
        const footerTop = top + headerHeight + bodyHeight - equipmentTotalHeight;
        drawTopLine(page, x, footerTop, x + QUOTE_PDF_WIDTH, footerTop, 0.7);
        const values = [
            '',
            'Valor Total dos Equipamentos',
            '',
            '',
            formatQuoteCurrency(options.equipmentTotal)
        ];
        let cellX = x;
        values.forEach((value, valueIndex) => {
            drawQuoteCellText(page, context, value, cellX, footerTop, widths[valueIndex], equipmentTotalHeight, {
                bold: false,
                paddingX: valueIndex === 1 ? 1 : 2,
                fontSize: valueIndex === 1 ? 8.4 : 8.2,
                align: valueIndex === 1 ? 'left' : 'center'
            });
            cellX += widths[valueIndex];
        });
    }
    return top + totalHeight;
}

function getQuoteNotesText(notes) {
    const text = cleanText(notes, 800) || DEFAULT_QUOTE_NOTES;
    const comparable = normalizeQuoteStatusText(text);
    if (
        comparable.includes('a validade desta proposta esta sujeita a verificacao de disponibilidade')
        && (comparable.includes('proposta valida por 1 dia') || comparable.includes('proposta valida por 7 dias'))
    ) {
        return DEFAULT_QUOTE_NOTES;
    }
    return /^obs\.\s*:/i.test(text) ? text : `Obs.: ${text}`;
}

function getQuotePaymentMethodText(value) {
    const text = cleanText(value, 160) || '-';
    return normalizeQuoteStatusText(text) === 'deposito em conta corrente'
        ? 'Depósito em Conta Corrente'
        : text;
}

function drawQuoteFixedServicesTable(page, context, quote, top) {
    const x = QUOTE_PDF_LEFT;
    const widths = getQuoteItemTableWidths();
    const headingHeight = 32;
    const rowHeight = 18;
    const showServicesPrice = quote.showServicesPrice === true;
    const totalHeight = headingHeight + rowHeight;
    const boundaries = [x];
    widths.forEach((width) => boundaries.push(boundaries[boundaries.length - 1] + width));

    drawTopRectangle(page, x, top, QUOTE_PDF_WIDTH, totalHeight, { borderWidth: 0.7 });
    boundaries.slice(1, -1).forEach((boundary) => {
        drawTopLine(page, boundary, top, boundary, top + totalHeight, 0.7);
    });
    drawTopLine(page, x, top + headingHeight, x + QUOTE_PDF_WIDTH, top + headingHeight, 0.7);

    const headers = ['Item', 'Serviços', 'Quant', 'Diárias/Uni.', 'Valor Total/Uni.'];
    if (!showServicesPrice) headers[4] = '';
    let headerX = x;
    headers.forEach((header, index) => {
        drawQuoteCellText(page, context, header, headerX, top, widths[index], headingHeight, {
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
        const rowTop = top + headingHeight + rowHeight * index;
        let cellX = x;
        values.forEach((value, valueIndex) => {
            drawQuoteCellText(page, context, value, cellX, rowTop, widths[valueIndex], rowHeight, {
                paddingX: valueIndex === 1 ? 1 : 2,
                fontSize: valueIndex === 1 ? 8.4 : 8.2,
                align: valueIndex === 1 ? 'left' : 'center'
            });
            cellX += widths[valueIndex];
        });
    });

    return top + totalHeight;
}

function drawQuoteTotalAndNotes(page, context, quote, top) {
    const x = QUOTE_PDF_LEFT;
    const totalHeight = 42.5;
    const notesText = getQuoteNotesText(quote.notes);
    const notesFontSize = 8.3;
    const notesLineHeight = notesFontSize * 1.15 + 1;
    const notesHeight = Math.max(
        58.8,
        wrapPdfText(notesText, context.regular, notesFontSize, QUOTE_PDF_WIDTH - 12).length * notesLineHeight + 4
    );
    const splitWidth = 340.6;
    drawTopRectangle(page, x, top, QUOTE_PDF_WIDTH, totalHeight);
    drawTopLine(page, x + splitWidth, top, x + splitWidth, top + totalHeight);
    drawQuoteCellText(page, context, 'Valor Total', x, top, splitWidth, totalHeight, {
        bold: true,
        fontSize: 9.6,
        align: 'center'
    });
    drawQuoteCellText(
        page,
        context,
        formatQuoteCurrency(quote.finalTotal),
        x + splitWidth,
        top,
        QUOTE_PDF_WIDTH - splitWidth,
        totalHeight,
        { bold: true, fontSize: 9.6, paddingX: 1, align: 'center' }
    );

    const notesTop = top + totalHeight;
    drawTopRectangle(page, x, notesTop, QUOTE_PDF_WIDTH, notesHeight);
    drawQuoteCellText(page, context, notesText, x, notesTop, QUOTE_PDF_WIDTH, notesHeight, {
        fontSize: notesFontSize,
        paddingX: 6,
        lineGap: 1
    });
    return notesTop + notesHeight;
}

function drawQuotePaymentTable(page, context, quote, top) {
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
        const lineHeight = fontSize * 1.15;
        const labelLines = wrapPdfText(label, context.regular, fontSize, labelWidth - 12).length;
        const valueLines = wrapPdfText(value, context.bold, fontSize, valueWidth - 12).length;
        return [
            label,
            value,
            bold,
            Math.max(minimumHeight, Math.max(labelLines, valueLines) * lineHeight + 4)
        ];
    });
    const totalHeight = rows.reduce((sum, row) => sum + row[3], 0);
    drawTopRectangle(page, x, top, width, totalHeight);
    drawTopLine(page, x + labelWidth, top, x + labelWidth, top + totalHeight);

    let rowTop = top;
    rows.forEach(([label, value, bold, rowHeight], index) => {
        if (index > 0) drawTopLine(page, x, rowTop, x + width, rowTop);
        drawQuoteCellText(page, context, label, x, rowTop, labelWidth, rowHeight, {
            fontSize: 9.6,
            bold: index === 0
        });
        drawQuoteCellText(page, context, value, x + labelWidth, rowTop, valueWidth, rowHeight, {
            fontSize: 9.6,
            bold,
            paddingX: 6
        });
        rowTop += rowHeight;
    });
    return top + totalHeight;
}

function drawQuoteSummary(page, context, quote, tableBottom, referenceLayout = false) {
    const servicesBottom = drawQuoteFixedServicesTable(page, context, quote, tableBottom + 4);
    const totalTop = servicesBottom + 4;
    const notesBottom = drawQuoteTotalAndNotes(page, context, quote, totalTop);
    const paymentHeadingTop = referenceLayout ? Math.max(619, notesBottom + 43) : notesBottom + 42;
    drawQuoteHeading(page, context, 'CONDIÇÕES DE PAGAMENTO:', QUOTE_PDF_LEFT, paymentHeadingTop);
    drawQuotePaymentTable(page, context, quote, paymentHeadingTop + 16.5);
}

function drawQuoteContinuationPages(context, quote, remainingItems, startIndex) {
    let itemIndex = startIndex;
    let pendingItems = remainingItems.slice();
    const showItemPrices = quote.showItemPrices === true;
    const equipmentTotal = getQuoteEquipmentTotal(quote);

    while (pendingItems.length > 0) {
        const page = addPdfPage(context);
        drawQuoteHeader(page, context);
        drawQuoteHeading(page, context, 'DESCRIÇÃO DOS EQUIPAMENTOS (CONTINUAÇÃO):', QUOTE_PDF_LEFT, 204);
        const pageItems = takeQuoteItemsForPage(context, pendingItems, 14, 245);
        pendingItems = pendingItems.slice(pageItems.length);
        const tableBottom = drawQuoteItemsTable(page, context, pageItems, itemIndex, 221, {
            showItemPrices,
            showEquipmentTotal: pendingItems.length === 0,
            equipmentTotal
        });
        itemIndex += pageItems.length;

        if (pendingItems.length === 0) {
            drawQuoteSummary(page, context, quote, tableBottom);
        } else {
            drawPdfText(page, 'Continua na próxima página.', QUOTE_PDF_LEFT, tableBottom + 10, {
                width: QUOTE_PDF_WIDTH,
                font: context.regular,
                size: 8.5,
                align: 'right',
                color: rgb(0.27, 0.27, 0.27)
            });
        }
    }
}

function drawQuoteResponsibilitiesPage(context) {
    const page = addPdfPage(context);
    drawQuoteHeader(page, context);
    drawQuoteHeading(page, context, 'RESPONSABILIDADES E GARANTIAS:', QUOTE_PDF_LEFT, 204.5);

    const bulletOne = 'A 24H LOCAÇÃO DE EQUIPAMENTOS LTDA. se responsabiliza pela entrega e montagem (quando solicitada) dos equipamentos em perfeitas condições de uso, garantindo seu funcionamento, desde que submetido às condições pré-estabelecidas pelo fabricante.';
    const bulletTwo = 'Da mesma forma, é responsabilidade do cliente disponibilizar ambiente e condições adequadas para o bom funcionamento e a utilidade dos equipamentos, assim como zelar pela segurança e conservação deles durante a locação.';
    drawPdfText(page, '-', 61.58, 232.5, { width: 12, font: context.regular, size: 9.5 });
    const first = drawPdfText(page, bulletOne, 82, 232.5, {
        width: 453.5,
        font: context.regular,
        size: 9.5,
        lineHeight: 13.5
    });
    const secondTop = 232.5 + first.height + 10;
    drawPdfText(page, '-', 61.58, secondTop, { width: 12, font: context.regular, size: 9.5 });
    const second = drawPdfText(page, bulletTwo, 82, secondTop, {
        width: 453.5,
        font: context.regular,
        size: 9.5,
        lineHeight: 13.5
    });
    const thanksTop = secondTop + second.height + 16;
    const thanks = drawPdfText(
        page,
        'Agradecemos e aguardamos retorno, na expectativa de que possamos trabalhar juntos em prol do sucesso deste evento.',
        61.58,
        thanksTop,
        { width: 473.5, font: context.regular, size: 9.5, lineHeight: 13.5 }
    );
    const regardsTop = thanksTop + thanks.height + 18;
    drawPdfText(page, 'Atenciosamente,', 61.58, regardsTop, {
        width: 200,
        font: context.regular,
        size: 9.5
    });
    drawPdfText(page, '24H Locação', 61.58, regardsTop + 27, {
        width: 90,
        font: context.regular,
        size: 9.5
    });
    drawTopLine(page, 61.58, regardsTop + 39, 122, regardsTop + 39, 0.6);

    if (context.signatureImage) {
        page.drawImage(context.signatureImage, {
            x: 53,
            y: QUOTE_PDF_SIZE[1] - (regardsTop + 52) - 84.7,
            width: 205,
            height: 84.7
        });
    }
}

function formatLongDateBR(value) {
    const key = parseIsoDateKey(value) || getTodayDateInput();
    const [year, month, day] = key.split('-').map(Number);
    const months = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    return `${day} de ${months[month - 1]} de ${year}`;
}

function drawQuoteDocument(context, quote) {
    const allItems = consolidateQuoteItemsForDisplay(Array.isArray(quote.items) ? quote.items : []);
    const showItemPrices = quote.showItemPrices === true;
    const firstPageItems = takeQuoteItemsForPage(context, allItems, 5, 75);
    const remainingItems = allItems.slice(firstPageItems.length);
    const page = addPdfPage(context);
    drawQuoteHeader(page, context);
    drawPdfText(page, '24H LOCAÇÃO DE EQUIPAMENTOS LTDA', 61.58, 184, {
        width: 470,
        font: context.bold,
        size: 10,
        align: 'center'
    });
    drawPdfText(page, 'CNPJ: 11.393.866/0001-26', 61.58, 198, {
        width: 470,
        font: context.regular,
        size: 9.5,
        align: 'center'
    });
    drawPdfText(
        page,
        `${quote.proposalCity || 'Belo Horizonte'}, ${formatLongDateBR(quote.proposalDate)}`,
        61.58,
        216,
        { width: 470, font: context.regular, size: 10 }
    );

    drawQuoteHeading(page, context, 'INFORMAÇÕES GERAIS:', 61.58, 250);
    const informationBottom = drawQuoteInformationTable(page, context, quote, 267.3);
    const itemsHeadingTop = Math.max(383.8, informationBottom + 32.5);
    drawQuoteHeading(page, context, 'DESCRIÇÃO DOS EQUIPAMENTOS:', 61.58, itemsHeadingTop);
    const tableBottom = drawQuoteItemsTable(
        page,
        context,
        firstPageItems,
        0,
        itemsHeadingTop + 16.5,
        {
            minimumBodyHeight: 52.5,
            showItemPrices,
            showEquipmentTotal: remainingItems.length === 0,
            equipmentTotal: getQuoteEquipmentTotal(quote)
        }
    );

    if (remainingItems.length === 0) {
        drawQuoteSummary(page, context, quote, tableBottom, true);
    } else {
        drawPdfText(page, 'Continua na próxima página.', QUOTE_PDF_LEFT, tableBottom + 10, {
            width: QUOTE_PDF_WIDTH,
            font: context.regular,
            size: 8.5,
            align: 'right',
            color: rgb(0.27, 0.27, 0.27)
        });
        drawQuoteContinuationPages(context, quote, remainingItems, firstPageItems.length);
    }
    drawQuoteResponsibilitiesPage(context);
}
