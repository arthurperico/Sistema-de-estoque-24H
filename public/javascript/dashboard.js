const EQUIPMENT_CATEGORIES = [
    'Tripé',
    'Caixa de som',
    'Mesa de som',
    'Antenas MGA',
    'Microfones',
    'Periféricos de som',
    'Tripé de câmera',
    'Câmera',
    'Mesa de corte',
    'Link sem fio',
    'Conversor',
    'Rádios',
    'Ilhas de vídeo',
    'Placas de vídeo',
    'Placas de áudio',
    'Splitter',
    'Passador de slides',
    'Extender',
    'Emenda HDMI',
    'Notebook',
    'Projetor',
    'Wi-Fi 5G',
    'Switch',
    'Elsys',
    'Extender fibra/rede',
    'Starlink',
    'Outros',
    'Monitor',
    'TV',
    'Totem LED',
    'Ribalta',
    'Wash',
    'Bean/moving',
    'Coby',
    'Parled',
    'Brut',
    'Strobe',
    'Máquina de fumaça',
    'Splitter de luz',
    'Mesa de luz',
    'Ribalta fina',
    'Laser',
    'Drone',
    'Propower',
    'Powerbank',
    'Pentacústica',
    'Gerador',
    'Transformador',
    'Nobreak',
    'Inversor',
    'Mouse'
];

let allEvents = [];
let allRentalEvents = [];
let allHistoryEvents = [];
let allHistoryRentals = [];
let allEquipmentTrackerMatches = [];
let equipmentTrackerHasSearched = false;
let rentalReturnAlerts = [];
let allEquipments = [];
let allCables = [];
let allOtherItems = [];
let quoteDatabaseEquipments = [];
let maintenanceEquipments = [];
let maintenanceCables = [];
let selectedMaintenanceItem = null;
let selectedMaintenanceType = 'equipamento';
let maintenanceModalMode = null;
let activeBancoTab = 'equipamentos';
let activeCadastroTab = 'equipamentos';
let activeMaintenanceTab = 'equipamentos';
let currentUser = null;
let loginUsers = [];
let canChangeUserPasswords = false;
let editingEquipmentId = null;
let editingEquipmentSource = 'database';
let allOperators = [];
let editingOperatorId = null;
let allQuotes = [];
let allApprovedQuotes = [];
let localStarlinks = [];
let activeStarlinkModel = 'v2';
let starlinkNumberSearchTerm = '';
let pendingStarlinkPlanActivation = null;
let pendingStarlinkCancellationId = null;
let starlinkCountdownTimer = null;
const LOCAL_STARLINK_PLANS = [
    'Residencial',
    'Viagem 100g',
    'Viagem ilimitado'
];
let quoteItems = [];
let quoteTechnicians = [];
let editingQuoteId = null;
let editingQuoteStatus = '';
let pendingQuoteApprovalId = null;
let quoteFinalEdited = false;
let quoteEquipmentSuggestions = [];
let quoteEquipmentSearchTimer = null;
let quoteTechnicianSuggestions = [];
let quoteTechnicianSearchTimer = null;
let databaseSearchTimer = null;
let quoteDatabaseSearchTimer = null;
let equipmentLoadController = null;
let equipmentLoadSequence = 0;
let cableLoadController = null;
let cableLoadSequence = 0;
let otherItemLoadController = null;
let otherItemLoadSequence = 0;
let quoteDatabaseLoadController = null;
let quoteDatabaseLoadSequence = 0;
let equipmentTrackerSearchTimer = null;
let equipmentTrackerLoadController = null;
let equipmentTrackerLoadSequence = 0;
let quoteDatabaseVisualExclusionIds = null;
let quoteDatabaseVisualExclusionNames = null;
const quoteScheduledEquipmentIds = new Set();
let approvedQuotesCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedApprovedQuoteDateKey = '';

const APPROVED_CALENDAR_MONTHS = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro'
];

const ADMIN_ALLOWED_SECTIONS = new Set([
    'home',
    'eventos',
    'cadastro',
    'banco',
    'bancoOrcamentos',
    'historico',
    'rastreadorEquipamentos',
    'manutencao',
    'locacao',
    'usuarios',
    'operadores',
    'orcamentos',
    'starlink',
    'orcamentosAprovados',
    'gerenciarOrcamentos',
    'orcamentoCriar'
]);
const USER_ALLOWED_SECTIONS = new Set(['home', 'eventos', 'locacao', 'manutencao', 'rastreadorEquipamentos']);
const COMMERCIAL_ALLOWED_SECTIONS = new Set([
    'orcamentos',
    'orcamentosAprovados',
    'gerenciarOrcamentos',
    'operadores',
    'orcamentoCriar'
]);

function getDefaultSectionForCurrentUser() {
    return currentUser?.isCommercial ? 'orcamentos' : 'home';
}

function getAllowedSectionsForCurrentUser() {
    if (currentUser?.isAdmin) return ADMIN_ALLOWED_SECTIONS;
    if (currentUser?.isCommercial) return COMMERCIAL_ALLOWED_SECTIONS;
    return USER_ALLOWED_SECTIONS;
}

function canAccessSection(sectionId) {
    if (sectionId === 'starlink') {
        return !!(currentUser?.isAdmin && currentUser?.localStarlinkTabEnabled);
    }
    return getAllowedSectionsForCurrentUser().has(sectionId);
}

function canEditInitialQuantity() {
    return !!currentUser?.canEditInitialQuantity;
}

function canAccessQuotes() {
    return !!(currentUser?.isAdmin || currentUser?.isCommercial);
}

function canAccessOperators() {
    return !!(currentUser?.isAdmin || currentUser?.isCommercial);
}

function canManagePrices() {
    return !!currentUser?.isAdmin;
}

function canManageQuoteDatabase() {
    return !!currentUser?.isAdmin;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeJsString(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function getEquipmentSerialNumber(equipment) {
    return equipment?.serialNumber ?? equipment?.serial_number ?? '';
}

function getEquipmentObservation(equipment) {
    return equipment?.observation ?? '';
}

function normalizeRackText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u00ba\u00b0]/g, ' ')
        .toUpperCase()
        .replace(/\bRARCK\b/g, 'RACK')
        .replace(/\s+/g, ' ')
        .trim();
}

function isStarlinkEquipment(equipment) {
    const text = `${equipment?.name || ''} ${equipment?.category || ''}`.toUpperCase();
    return text.includes('STARLINK');
}

function isMainStarlinkEquipment(equipment) {
    const name = String(equipment?.name || '').toUpperCase();
    return name.startsWith('STARLINK ');
}

function getStarlinkNumber(equipment) {
    const observation = String(getEquipmentObservation(equipment) || '');
    const observationMatch = observation.match(/n[uú]mero\s*:?\s*(\d{1,3})/i);
    if (observationMatch) return Number(observationMatch[1]);

    const name = String(equipment?.name || '');
    const nameMatch = name.match(/\s(\d{1,3})\s*$/);
    return nameMatch ? Number(nameMatch[1]) : Number.POSITIVE_INFINITY;
}

function getStarlinkTypeOrder(equipment) {
    const name = String(equipment?.name || '').toUpperCase();
    if (name.startsWith('STARLINK ')) return 1;
    if (name.startsWith('ROTEADOR ')) return 2;
    if (name.startsWith('FONTE ')) return 3;
    if (name.startsWith('ADAPTADOR ')) return 4;
    return 9;
}

function isWirelessRackEquipment(equipment) {
    return normalizeRackText(equipment?.category) === 'MICROFONE SEM FIO RACK'
        || !!getWirelessRackDescriptor(equipment);
}

function getWirelessRackNumber(equipment) {
    const observation = normalizeRackText(getEquipmentObservation(equipment));
    const match = observation.match(/\bRACK\s*[-:]?\s*0*(\d+)/);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function getWirelessRackDescriptor(equipment) {
    const observation = normalizeRackText(getEquipmentObservation(equipment));
    const match = observation.match(/\bRACK\s*(?:N(?:O)?(?=[^A-Z0-9])[^A-Z0-9]*)?[-:]?\s*([A-Z0-9]+)/);
    if (!match) return '';

    const descriptor = match[1].trim();
    return /^\d+$/.test(descriptor) ? descriptor.padStart(2, '0') : descriptor;
}

function getWirelessRackTopic(equipment) {
    const descriptor = getWirelessRackDescriptor(equipment);
    return descriptor ? `MICROFONE SEM FIO RACK ${descriptor}` : '';
}

function getEquipmentGroupTitle(equipment) {
    const rackTopic = getWirelessRackTopic(equipment);
    if (rackTopic) return rackTopic;

    const category = String(equipment?.category || '').trim() || 'Outros';
    return normalizeRackText(category) === 'MICROFONE SEM FIO RACK'
        ? 'MICROFONE SEM FIO RACK SEM IDENTIFICAÇÃO'
        : category;
}

function getEquipmentStoredTopic(equipment) {
    return String(equipment?.category || '')
        .trim()
        .replace(/\s+/g, ' ') || 'Outros';
}

function getQuoteEquipmentDisplayGroupingKey(equipment) {
    return getQuoteItemNameKey(equipment?.name) || `equipment-${Number(equipment?.id) || 0}`;
}

function getRackTopicNumber(topic) {
    const match = normalizeRackText(topic).match(/^MICROFONE SEM FIO RACK\s+0*(\d+)$/);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function compareEquipmentGroupTitles(a, b) {
    const aIsRack = normalizeRackText(a).startsWith('MICROFONE SEM FIO RACK ');
    const bIsRack = normalizeRackText(b).startsWith('MICROFONE SEM FIO RACK ');

    if (aIsRack && bIsRack) {
        const aNumber = getRackTopicNumber(a);
        const bNumber = getRackTopicNumber(b);
        if ((Number.isFinite(aNumber) || Number.isFinite(bNumber)) && aNumber !== bNumber) {
            return aNumber - bNumber;
        }
    }

    return String(a || '').localeCompare(String(b || ''), 'pt-BR', { numeric: true });
}

function compareEquipments(a, b) {
    const aIsStarlink = isStarlinkEquipment(a);
    const bIsStarlink = isStarlinkEquipment(b);

    if (aIsStarlink || bIsStarlink) {
        const aGroup = isMainStarlinkEquipment(a) ? 0 : 1;
        const bGroup = isMainStarlinkEquipment(b) ? 0 : 1;
        if (aGroup !== bGroup) return aGroup - bGroup;

        const aNumber = getStarlinkNumber(a);
        const bNumber = getStarlinkNumber(b);
        if (aNumber !== bNumber) return aNumber - bNumber;

        const typeDiff = getStarlinkTypeOrder(a) - getStarlinkTypeOrder(b);
        if (typeDiff !== 0) return typeDiff;
    }

    if (isWirelessRackEquipment(a) || isWirelessRackEquipment(b)) {
        const aRackNumber = getWirelessRackNumber(a);
        const bRackNumber = getWirelessRackNumber(b);
        if ((Number.isFinite(aRackNumber) || Number.isFinite(bRackNumber)) && aRackNumber !== bRackNumber) {
            return aRackNumber - bRackNumber;
        }
    }

    const nameDiff = String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { numeric: true });
    if (nameDiff !== 0) return nameDiff;

    return String(a.barcode || '').localeCompare(String(b.barcode || ''), 'pt-BR', { numeric: true });
}

function closeAvailabilityConflictModal() {
    const modal = document.getElementById('availabilityConflictModal');
    if (modal) modal.style.display = 'none';
}

function showAvailabilityConflictModal(conflict) {
    if (!conflict) return false;

    const modal = document.getElementById('availabilityConflictModal');
    const details = document.getElementById('availabilityConflictDetails');
    if (!modal || !details) return false;

    const subtitle = modal.querySelector('.modal-subtitle');
    const conflictType = String(conflict.type || conflict.conflictType || '').trim().toLowerCase();
    const isGroupCapacityConflict = conflictType.includes('group')
        || conflictType.includes('capacity')
        || conflict.availableQuantity !== undefined;
    const currentPeriod = `${conflict.currentStartLabel || '-'} até ${conflict.currentEndLabel || '-'}`;
    const reservationPeriod = `${conflict.reservationStartLabel || '-'} até ${conflict.reservationEndLabel || '-'}`;

    if (isGroupCapacityConflict) {
        const equipmentName = conflict.groupName || conflict.equipmentName || 'Equipamento';
        const availableQuantity = Math.max(0, Number(conflict.availableQuantity) || 0);
        const explanation = String(
            conflict.explanation
            || conflict.reason
            || conflict.message
            || 'A movimentação reduziria o estoque abaixo da quantidade reservada para um orçamento no mesmo período.'
        ).trim();

        if (subtitle) {
            subtitle.textContent = 'Não há quantidade suficiente deste equipamento para o período informado.';
        }

        details.innerHTML = `
            <div class="availability-conflict-item full">
                <span class="availability-conflict-label">Motivo</span>
                <div class="availability-conflict-value">${escapeHtml(explanation)}</div>
            </div>
            <div class="availability-conflict-item">
                <span class="availability-conflict-label">Equipamento</span>
                <div class="availability-conflict-value">${escapeHtml(equipmentName)}</div>
            </div>
            <div class="availability-conflict-item">
                <span class="availability-conflict-label">Quantidade disponível</span>
                <div class="availability-conflict-value">${availableQuantity}</div>
            </div>
            <div class="availability-conflict-item full">
                <span class="availability-conflict-label">Período informado</span>
                <div class="availability-conflict-value">${escapeHtml(currentPeriod)}</div>
            </div>
            ${conflict.blockingEventName ? `
                <div class="availability-conflict-item full">
                    <span class="availability-conflict-label">Reserva protegida</span>
                    <div class="availability-conflict-value">${escapeHtml(conflict.blockingEventName)}</div>
                </div>
            ` : ''}
        `;
        modal.style.display = 'flex';
        return true;
    }

    if (subtitle) {
        subtitle.textContent = 'Este patrimônio não pode ser utilizado no período informado.';
    }
    details.innerHTML = `
        <div class="availability-conflict-item full">
            <span class="availability-conflict-label">Aviso</span>
            <div class="availability-conflict-value">Este patrimônio não pode sair para este evento porque existe uma reserva no mesmo período.</div>
        </div>
        <div class="availability-conflict-item full">
            <span class="availability-conflict-label">Patrimônio afetado</span>
            <div class="availability-conflict-value">${escapeHtml(conflict.equipmentName || 'Patrimônio')}</div>
        </div>
        <div class="availability-conflict-item full">
            <span class="availability-conflict-label">Evento que está causando o conflito</span>
            <div class="availability-conflict-value">${escapeHtml(conflict.blockingEventName || 'Reserva existente')}</div>
        </div>
        <div class="availability-conflict-item">
            <span class="availability-conflict-label">Período do evento atual</span>
            <div class="availability-conflict-value">${escapeHtml(currentPeriod)}</div>
        </div>
        <div class="availability-conflict-item">
            <span class="availability-conflict-label">Período da reserva existente</span>
            <div class="availability-conflict-value">${escapeHtml(reservationPeriod)}</div>
        </div>
    `;
    modal.style.display = 'flex';
    return true;
}

function normalizeStatusText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function getEquipmentStatusDisplay(status) {
    const raw = String(status || '').toLowerCase();
    const normalized = normalizeStatusText(status);
    const isDisponivel = !normalized || normalized === 'disponivel' || raw === 'disponível';
    const isPreSeparado = raw === 'pre separado';
    const isRelacao = normalized === 'relacao' || raw === 'relação';
    const isAgendado = normalized === 'agendado';
    const isManutencao = raw.includes('manut');

    if (isPreSeparado) return { text: 'Pré-separado', className: 'badge-relation' };
    if (isRelacao) return { text: 'Relação', className: 'badge-relation' };
    if (isAgendado) return { text: 'Agendado', className: 'badge-scheduled' };
    if (isManutencao) return { text: 'Em Manutenção', className: 'badge-maintenance' };
    if (isDisponivel) return { text: 'Disponível', className: 'badge-available' };
    return { text: 'Indisponível', className: 'badge-unavailable' };
}

function getRelacaoSpaceId() {
    const spaceId = Number(localStorage.getItem('relacao_space_id'));
    return Number.isInteger(spaceId) && spaceId > 0 ? spaceId : null;
}

function isSameRelacaoSpace(firstSpaceId, secondSpaceId) {
    return String(firstSpaceId || '') === String(secondSpaceId || '');
}

function populateCategoryOptions() {
    const list = document.getElementById('equipmentCategoryList');
    const input = document.getElementById('equipmentCategory');
    if (!list || !input) return;

    list.innerHTML = '';
    EQUIPMENT_CATEGORIES.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        list.appendChild(option);
    });

    if (!input.value) {
        input.value = EQUIPMENT_CATEGORIES[0];
    }
}

function getCableCategories(cables = allCables) {
    return [...new Set(
        (cables || [])
            .map((cable) => String(cable.category || 'Outros').trim() || 'Outros')
            .filter((category) => category && category !== 'Outros')
    )].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function populateCableCategoryOptions(cables = allCables) {
    const list = document.getElementById('cableCategoryList');
    const input = document.getElementById('cableCategory');
    if (!list || !input) return;

    const categories = getCableCategories(cables);
    list.innerHTML = '';

    categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        list.appendChild(option);
    });

    if (!input.value) {
        input.value = categories[0] || 'Outros';
    }
}

function showSection(sectionId) {
    if (!canAccessSection(sectionId)) {
        sectionId = getDefaultSectionForCurrentUser();
    }

    if (['orcamentos', 'orcamentosAprovados', 'gerenciarOrcamentos', 'orcamentoCriar'].includes(sectionId) && !canAccessQuotes()) {
        sectionId = getDefaultSectionForCurrentUser();
    }

    if (sectionId === 'bancoOrcamentos' && !canManageQuoteDatabase()) {
        sectionId = getDefaultSectionForCurrentUser();
    }

    if (sectionId === 'operadores' && !canAccessOperators()) {
        sectionId = getDefaultSectionForCurrentUser();
    }

    if (sectionId === 'starlink' && !canAccessSection(sectionId)) {
        sectionId = getDefaultSectionForCurrentUser();
    }

    if (sectionId === 'usuarios' && !currentUser?.isAdmin) {
        sectionId = 'home';
    }

    if (sectionId !== 'banco') {
        clearRelacaoContext();
    }

    document.querySelectorAll('.section').forEach((section) => {
        section.classList.remove('active');
    });

    const targetSection = document.getElementById(sectionId);
    if (targetSection) targetSection.classList.add('active');

    document.querySelectorAll('.menu-item').forEach((item) => {
        item.classList.remove('active');
        const onclick = item.getAttribute('onclick') || '';
        const menuSection = onclick.match(/showSection\(['"]([^'"]+)['"]\)/)?.[1] || '';
        if (menuSection === sectionId || (sectionId === 'orcamentoCriar' && menuSection === 'orcamentos')) {
            item.classList.add('active');
        }
    });

    if (sectionId === 'home') {
        loadEvents();
        loadRentalReturnAlerts();
    }
    if (sectionId === 'cadastro') setCadastroTab(activeCadastroTab);
    if (sectionId === 'banco') setBancoTab(activeBancoTab);
    if (sectionId === 'bancoOrcamentos') loadQuoteDatabaseEquipments();
    if (sectionId === 'historico') loadHistoryEvents();
    if (sectionId === 'rastreadorEquipamentos') prepareEquipmentTracker();
    if (sectionId === 'usuarios') loadLoginUsers();
    if (sectionId === 'orcamentos') loadQuotes();
    if (sectionId === 'starlink') loadLocalStarlinks();
    if (sectionId === 'orcamentosAprovados') loadApprovedQuotes();
    if (sectionId === 'gerenciarOrcamentos') loadApprovedQuotes();
    if (sectionId === 'orcamentoCriar') initializeQuoteForm();
    if (sectionId === 'operadores') loadOperators();
    if (sectionId === 'manutencao') setMaintenanceTab(activeMaintenanceTab);
    if (sectionId === 'locacao') {
        loadRentalEvents();
        loadRentalReturnAlerts();
    }
    if (!currentUser?.isCommercial && !['home', 'locacao'].includes(sectionId)) loadRentalReturnAlerts();
}

function restorePageScroll(top, left = window.scrollX) {
    window.requestAnimationFrame(() => {
        window.scrollTo({
            top: Math.max(0, Number(top) || 0),
            left: Math.max(0, Number(left) || 0),
            behavior: 'auto'
        });
    });
}

function clearRelacaoContext() {
    localStorage.removeItem('relacao_event_id');
    localStorage.removeItem('relacao_event_name');
    localStorage.removeItem('relacao_space_id');
    localStorage.removeItem('relacao_space_name');
}

function clearPendingItems() {
    Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('pending_items_') || key.startsWith('pending_other_items_')) {
            localStorage.removeItem(key);
        }
    });
}

function getEventSearchValue() {
    return (document.getElementById('searchEventInput')?.value || '').trim();
}

function getEquipmentSearchValue() {
    return (document.getElementById('searchInput')?.value || '').trim();
}

function getQuoteDatabaseSearchValue() {
    return (document.getElementById('quoteDatabaseSearchInput')?.value || '').trim();
}

function searchDatabase() {
    window.clearTimeout(databaseSearchTimer);
    databaseSearchTimer = null;

    if (activeBancoTab === 'cabos') {
        loadCables(getEquipmentSearchValue());
        return;
    }

    if (activeBancoTab === 'outros') {
        loadOtherItems(getEquipmentSearchValue());
        return;
    }

    loadEquipments(getEquipmentSearchValue());
}

function scheduleDatabaseSearch(event) {
    window.clearTimeout(databaseSearchTimer);
    if (event?.key === 'Enter') {
        searchDatabase();
        return;
    }

    databaseSearchTimer = window.setTimeout(searchDatabase, 250);
}

function searchQuoteDatabase() {
    window.clearTimeout(quoteDatabaseSearchTimer);
    quoteDatabaseSearchTimer = null;
    loadQuoteDatabaseEquipments(getQuoteDatabaseSearchValue());
}

function scheduleQuoteDatabaseSearch(event) {
    window.clearTimeout(quoteDatabaseSearchTimer);
    if (event?.key === 'Enter') {
        searchQuoteDatabase();
        return;
    }

    quoteDatabaseSearchTimer = window.setTimeout(searchQuoteDatabase, 250);
}

function searchEvents() {
    renderEvents(allEvents, getEventSearchValue());
}

function getRentalSearchValue() {
    return (document.getElementById('searchRentalInput')?.value || '').trim();
}

function searchRentalEvents() {
    renderRentalEvents(allRentalEvents, getRentalSearchValue());
}

function getHistorySearchValue() {
    return (document.getElementById('searchHistoryInput')?.value || '').trim();
}

function searchHistoryEvents() {
    renderHistoryEvents(allHistoryEvents, allHistoryRentals, getHistorySearchValue());
}

function getEquipmentTrackerSearchValue() {
    return (document.getElementById('equipmentTrackerInput')?.value || '').trim();
}

function groupEquipmentTrackerMatches(matches) {
    const eventsById = new Map();

    (matches || []).forEach((match) => {
        const eventId = Number(match.eventId);
        if (!Number.isInteger(eventId) || eventId <= 0) return;

        if (!eventsById.has(eventId)) {
            eventsById.set(eventId, {
                id: eventId,
                name: match.eventName || 'Evento',
                date: match.date || '',
                endDate: match.endDate || match.date || '',
                eventType: String(match.eventType || 'event').toLowerCase(),
                withdrawalDate: match.withdrawalDate || '',
                returnDate: match.returnDate || '',
                createdByUsername: match.createdByUsername || '',
                equipments: []
            });
        }

        eventsById.get(eventId).equipments.push({
            id: Number(match.equipmentId),
            name: match.equipmentName || 'Equipamento',
            barcode: match.barcode || '-',
            outgoingCount: Math.max(0, Number(match.outgoingCount) || 0),
            activeBalance: Math.max(0, Number(match.activeBalance) || 0),
            lastOutgoingAt: match.lastOutgoingAt || ''
        });
    });

    return [...eventsById.values()];
}

function renderEquipmentTrackerMatches(matches = allEquipmentTrackerMatches) {
    const grid = document.getElementById('equipmentTrackerGrid');
    const count = document.getElementById('equipmentTrackerCount');
    const message = document.getElementById('equipmentTrackerMessage');
    if (!grid) return;

    const events = groupEquipmentTrackerMatches(matches);
    if (count) count.textContent = `${events.length} ${events.length === 1 ? 'evento' : 'eventos'}`;
    grid.innerHTML = '';

    if (!equipmentTrackerHasSearched) {
        if (message) message.textContent = 'Digite um patrimônio ou nome para iniciar a busca.';
        return;
    }

    if (events.length === 0) {
        if (message) message.textContent = 'Nenhum evento com saída desse equipamento foi encontrado.';
        grid.innerHTML = '<p class="empty-state">Tente buscar pelo patrimônio completo ou por outra parte do nome.</p>';
        return;
    }

    if (message) {
        message.textContent = `${events.length} ${events.length === 1 ? 'evento encontrado' : 'eventos encontrados'}.`;
    }

    events.forEach((trackedEvent) => {
        const isRental = trackedEvent.eventType === 'rental';
        const manageUrl = isRental
            ? `/event.html?id=${trackedEvent.id}&type=rental`
            : `/event.html?id=${trackedEvent.id}`;
        const period = isRental
            ? formatEventPeriod(trackedEvent.withdrawalDate || trackedEvent.date, trackedEvent.returnDate || trackedEvent.withdrawalDate || trackedEvent.date)
            : formatEventPeriod(trackedEvent.date, trackedEvent.endDate || trackedEvent.date);
        const equipmentItems = trackedEvent.equipments.map((equipment) => {
            const outgoingLabel = equipment.outgoingCount === 1
                ? '1 saída registrada'
                : `${equipment.outgoingCount} saídas registradas`;
            const statusLabel = equipment.activeBalance > 0
                ? (equipment.activeBalance === 1 ? 'Saída pendente' : `${equipment.activeBalance} saídas pendentes`)
                : 'Entrada registrada';
            const statusClass = equipment.activeBalance > 0 ? 'pending' : 'returned';

            return `
                <li class="tracker-equipment-item">
                    <div>
                        <strong>${escapeHtml(equipment.name)}</strong>
                        <span>Patrimônio: ${escapeHtml(equipment.barcode)}</span>
                        <span>${escapeHtml(outgoingLabel)}${equipment.lastOutgoingAt ? ` · Última: ${escapeHtml(formatDateTime(equipment.lastOutgoingAt))}` : ''}</span>
                    </div>
                    <span class="tracker-item-status ${statusClass}">${escapeHtml(statusLabel)}</span>
                </li>`;
        }).join('');

        const card = document.createElement('div');
        card.className = 'event-card tracker-event-card';
        card.innerHTML = `
            <div class="card-top">
                <h3>${escapeHtml(trackedEvent.name)}</h3>
                <div class="event-meta">
                    <span class="tracker-event-type">${isRental ? 'Locação' : 'Evento'}</span>
                    ${trackedEvent.createdByUsername ? `<span class="event-created-by">${escapeHtml(trackedEvent.createdByUsername)}</span>` : ''}
                    <span class="card-date">${escapeHtml(period)}</span>
                </div>
            </div>
            <ul class="tracker-equipment-list">${equipmentItems}</ul>
            <div class="event-actions">
                <button type="button" onclick="window.location.href='${manageUrl}'" class="btn-primary">Gerenciar</button>
            </div>`;
        grid.appendChild(card);
    });
}

function prepareEquipmentTracker() {
    renderEquipmentTrackerMatches();
    window.requestAnimationFrame(() => document.getElementById('equipmentTrackerInput')?.focus());
}

function scheduleEquipmentTrackerSearch() {
    window.clearTimeout(equipmentTrackerSearchTimer);
    const search = getEquipmentTrackerSearchValue();
    if (!search) {
        equipmentTrackerLoadController?.abort();
        equipmentTrackerLoadSequence += 1;
        allEquipmentTrackerMatches = [];
        equipmentTrackerHasSearched = false;
        renderEquipmentTrackerMatches();
        return;
    }

    equipmentTrackerLoadController?.abort();
    equipmentTrackerSearchTimer = window.setTimeout(loadEquipmentTrackerEvents, 350);
}

function submitEquipmentTrackerSearch(event) {
    event?.preventDefault();
    window.clearTimeout(equipmentTrackerSearchTimer);
    loadEquipmentTrackerEvents();
}

async function loadEquipmentTrackerEvents() {
    const search = getEquipmentTrackerSearchValue();
    if (!search) {
        equipmentTrackerHasSearched = false;
        allEquipmentTrackerMatches = [];
        renderEquipmentTrackerMatches();
        return;
    }

    equipmentTrackerLoadController?.abort();
    equipmentTrackerLoadController = new AbortController();
    const requestSequence = ++equipmentTrackerLoadSequence;
    const message = document.getElementById('equipmentTrackerMessage');
    const button = document.getElementById('equipmentTrackerButton');
    if (message) message.textContent = 'Buscando todas as saídas...';
    if (button) button.disabled = true;

    try {
        const response = await fetch(`/api/equipment-tracker?search=${encodeURIComponent(search)}`, {
            credentials: 'include',
            signal: equipmentTrackerLoadController.signal
        });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Não foi possível rastrear o equipamento.');
        }
        if (requestSequence !== equipmentTrackerLoadSequence) return;

        allEquipmentTrackerMatches = Array.isArray(data.matches) ? data.matches : [];
        equipmentTrackerHasSearched = true;
        renderEquipmentTrackerMatches();
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error(error);
        if (requestSequence !== equipmentTrackerLoadSequence) return;
        allEquipmentTrackerMatches = [];
        equipmentTrackerHasSearched = true;
        renderEquipmentTrackerMatches();
        if (message) message.textContent = error.message || 'Erro de conexão.';
    } finally {
        if (requestSequence === equipmentTrackerLoadSequence && button) button.disabled = false;
    }
}

function getQuoteSearchValue() {
    return (document.getElementById('searchQuoteInput')?.value || '').trim();
}

function searchQuotes() {
    renderQuotes(allQuotes, getQuoteSearchValue());
}

function getOperatorSearchValue() {
    return (document.getElementById('searchOperatorInput')?.value || '').trim();
}

function searchOperators() {
    renderOperators(allOperators, getOperatorSearchValue());
}

function getApprovedQuoteSearchValue() {
    return (document.getElementById('searchApprovedQuoteInput')?.value || '').trim();
}

function searchApprovedQuotes() {
    renderApprovedQuotes();
}

function getManagedApprovedQuoteSearchValue() {
    return (document.getElementById('searchManagedApprovedQuoteInput')?.value || '').trim();
}

function searchManagedApprovedQuotes() {
    renderManagedApprovedQuotes(allApprovedQuotes, getManagedApprovedQuoteSearchValue());
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function getInputDigits(value, maxLength) {
    return String(value || '').replace(/\D/g, '').slice(0, maxLength);
}

function formatQuoteDateInput(value) {
    const digits = getInputDigits(value, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function formatQuoteDateTimeInput(value) {
    const digits = getInputDigits(value, 12);
    const datePart = formatQuoteDateInput(digits.slice(0, 8));
    if (digits.length <= 8) return datePart;

    const timeDigits = digits.slice(8);
    const timePart = timeDigits.length <= 2
        ? timeDigits
        : `${timeDigits.slice(0, 2)}:${timeDigits.slice(2)}`;
    return `${datePart} às ${timePart}`;
}

function formatQuoteDateRangeInput(value) {
    const digits = getInputDigits(value, 16);
    const startDate = formatQuoteDateInput(digits.slice(0, 8));
    if (digits.length < 8) return startDate;
    if (digits.length === 8) return `${startDate} até `;

    return `${startDate} até ${formatQuoteDateInput(digits.slice(8))}`;
}

function getQuoteDateParts(value) {
    const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;

    return {
        day: Number(match[1]),
        month: Number(match[2]),
        year: Number(match[3])
    };
}

function isValidQuoteDate(value) {
    const parts = getQuoteDateParts(value);
    if (!parts || parts.year < 1900 || parts.year > 2100) return false;

    const date = new Date(parts.year, parts.month - 1, parts.day);
    return date.getFullYear() === parts.year
        && date.getMonth() === parts.month - 1
        && date.getDate() === parts.day;
}

function isValidQuoteDateTime(value) {
    const match = String(value || '').match(/^(\d{2}\/\d{2}\/\d{4}) às (\d{2}):(\d{2})$/);
    if (!match || !isValidQuoteDate(match[1])) return false;

    const hours = Number(match[2]);
    const minutes = Number(match[3]);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function getQuoteDateTimestamp(value) {
    const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date.getTime();
}

function getQuoteDateMatches(value) {
    return Array.from(String(value || '').matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g))
        .map((match) => ({
            day: Number(match[1]),
            month: Number(match[2]),
            year: Number(match[3])
        }));
}

function formatQuoteDateParts(parts) {
    if (!parts) return '';
    return [
        String(parts.day).padStart(2, '0'),
        String(parts.month).padStart(2, '0'),
        String(parts.year).padStart(4, '0')
    ].join('/');
}

function getQuoteDateFromParts(parts) {
    if (!parts) return null;
    const value = formatQuoteDateParts(parts);
    if (!isValidQuoteDate(value)) return null;
    return new Date(parts.year, parts.month - 1, parts.day);
}

function getQuoteDateRange(value) {
    const matches = getQuoteDateMatches(value);
    if (matches.length < 2) return null;

    const startDate = getQuoteDateFromParts(matches[0]);
    const endDate = getQuoteDateFromParts(matches[1]);
    if (!startDate || !endDate || endDate < startDate) return null;

    return {
        startDate,
        endDate,
        startTime: startDate.getTime(),
        endTime: endDate.getTime()
    };
}

function isValidQuoteDateRange(value) {
    return !!getQuoteDateRange(value);
}

function normalizeQuoteDateRangeValue(value) {
    const matches = getQuoteDateMatches(value);
    if (!matches.length) return '';

    const startDate = formatQuoteDateParts(matches[0]);
    const endDate = formatQuoteDateParts(matches[1] || matches[0]);
    return `${startDate} até ${endDate}`;
}

function getQuoteDateRangeKeys(value) {
    const range = getQuoteDateRange(value);
    if (!range) {
        const singleDate = getQuoteDateFromParts(getQuoteDateMatches(value)[0]);
        return singleDate ? [getDateKey(singleDate)] : [];
    }

    const keys = [];
    const cursor = new Date(range.startDate);
    let guard = 0;
    while (cursor <= range.endDate && guard < 3700) {
        keys.push(getDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
        guard += 1;
    }
    return keys;
}

function quoteDateToIso(value) {
    const parts = getQuoteDateParts(value);
    if (!parts) return '';
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formatQuoteDateFromDate(date = new Date()) {
    return [
        String(date.getDate()).padStart(2, '0'),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getFullYear())
    ].join('/');
}

function formatQuoteDateFromIso(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '');
}

function formatQuoteMoneyInput(value) {
    const digits = getInputDigits(value, 13).replace(/^0+(?=\d)/, '') || '0';
    return formatMoney(Number(digits) / 100);
}

function parseQuoteMoneyInput(value) {
    const digits = getInputDigits(value, 13);
    return digits ? Number(digits) / 100 : 0;
}

function setQuoteMaskedFieldValidity(input, type) {
    if (!input) return true;

    const value = input.value.trim();
    let isValid = true;
    let message = '';

    if (value && type === 'date' && !isValidQuoteDate(value)) {
        isValid = false;
        message = 'Informe uma data válida no formato DD/MM/AAAA.';
    }

    if (value && type === 'datetime' && !isValidQuoteDateTime(value)) {
        isValid = false;
        message = 'Informe uma data e horário válidos no formato DD/MM/AAAA às HH:MM.';
    }

    if (value && type === 'daterange' && !isValidQuoteDateRange(value)) {
        isValid = false;
        message = 'Informe o período no formato DD/MM/AAAA até DD/MM/AAAA. A segunda data não pode ser anterior à primeira.';
    }

    input.setCustomValidity(message);
    return isValid;
}

function setupQuoteInputMasks() {
    const maskedFields = [
        { id: 'quoteProposalDate', type: 'date', formatter: formatQuoteDateInput },
        { id: 'quoteAssemblyDatetime', type: 'daterange', formatter: formatQuoteDateRangeInput },
        { id: 'quoteEventDatetime', type: 'daterange', formatter: formatQuoteDateRangeInput },
        { id: 'quoteDisassemblyDatetime', type: 'daterange', formatter: formatQuoteDateRangeInput }
    ];

    maskedFields.forEach(({ id, type, formatter }) => {
        const input = document.getElementById(id);
        if (!input || input.dataset.maskReady === 'true') return;

        input.dataset.maskReady = 'true';
        input.addEventListener('input', () => {
            input.value = formatter(input.value);
            input.setCustomValidity('');
        });
        input.addEventListener('blur', () => {
            if (setQuoteMaskedFieldValidity(input, type) && type === 'daterange') {
                validateQuoteDateOrder(false);
            }
        });
    });

    ['quoteFinalTotal', 'quoteManualItemUnitPrice', 'quoteServicesPrice'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input || input.dataset.maskReady === 'true') return;

        input.dataset.maskReady = 'true';
        input.value = formatQuoteMoneyInput(input.value);
        input.addEventListener('input', () => {
            input.value = formatQuoteMoneyInput(input.value);
            if (id === 'quoteServicesPrice') {
                updateQuoteTotals();
            }
        });
        input.addEventListener('focus', () => {
            window.setTimeout(() => input.select(), 0);
        });
    });

}

function validateQuoteDateOrder(report = true) {
    const assemblyInput = document.getElementById('quoteAssemblyDatetime');
    const eventInput = document.getElementById('quoteEventDatetime');
    const disassemblyInput = document.getElementById('quoteDisassemblyDatetime');
    const inputs = [assemblyInput, eventInput, disassemblyInput].filter(Boolean);

    inputs.forEach((input) => {
        if (isValidQuoteDateRange(input.value.trim())) {
            input.setCustomValidity('');
        }
    });

    const assemblyRange = getQuoteDateRange(assemblyInput?.value);
    const eventRange = getQuoteDateRange(eventInput?.value);
    const disassemblyRange = getQuoteDateRange(disassemblyInput?.value);

    if (!assemblyRange || !eventRange || !disassemblyRange) {
        return true;
    }

    let invalidInput = null;
    let message = '';

    if (assemblyRange.endTime > eventRange.startTime) {
        invalidInput = assemblyInput;
        message = 'A data da montagem deve ser antes da data do evento ou no mesmo dia.';
    } else if (disassemblyRange.startTime < eventRange.endTime) {
        invalidInput = disassemblyInput;
        message = 'A data da desmontagem deve ser depois da data do evento ou no mesmo dia.';
    }

    if (!invalidInput) return true;

    invalidInput.setCustomValidity(message);
    if (report) {
        invalidInput.focus();
        invalidInput.reportValidity();
    }
    return false;
}

function validateQuoteMaskedFields() {
    const validations = [
        ['quoteProposalDate', 'date'],
        ['quoteAssemblyDatetime', 'daterange'],
        ['quoteEventDatetime', 'daterange'],
        ['quoteDisassemblyDatetime', 'daterange']
    ];

    const firstInvalid = validations.find(([id, type]) => (
        !setQuoteMaskedFieldValidity(document.getElementById(id), type)
    ));

    if (!firstInvalid) {
        return validateQuoteDateOrder(true);
    }

    const input = document.getElementById(firstInvalid[0]);
    input?.focus();
    input?.reportValidity();
    return false;
}

function getQuoteSubtotal() {
    const equipmentTotal = quoteItems.reduce((sum, item) => sum + (Number(item.internalTotal) || 0), 0);
    const servicesPrice = parseQuoteMoneyInput(document.getElementById('quoteServicesPrice')?.value);
    return equipmentTotal + servicesPrice;
}

function updateQuoteTotals() {
    const subtotal = getQuoteSubtotal();
    const subtotalEl = document.getElementById('quoteSubtotal');
    const finalInput = document.getElementById('quoteFinalTotal');

    if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
    if (finalInput && !quoteFinalEdited) {
        finalInput.value = formatMoney(subtotal);
    }
}

function getQuoteItemNameKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function formatQuoteDimension(value) {
    return Number(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3
    });
}

function getQuoteItemDisplayGroups() {
    const groups = [];
    const realEquipmentGroups = new Map();
    const serviceGroups = new Map();

    quoteItems.forEach((item) => {
        if (item.isService) {
            const dailyUnits = Math.max(1, Number(item.dailyUnits) || 1);
            const serviceKey = item.serviceId || getQuoteItemNameKey(item.description);
            const key = `${serviceKey}|${getQuoteItemNameKey(item.description)}|${dailyUnits}`;
            let group = serviceGroups.get(key);
            if (!group) {
                group = {
                    ...item,
                    isManual: false,
                    isService: true,
                    description: String(item.description || '').toUpperCase(),
                    items: [],
                    equipmentIds: [],
                    quantity: 0,
                    internalTotal: 0
                };
                serviceGroups.set(key, group);
                groups.push(group);
            }

            const itemQuantity = Math.max(1, Number(item.quantity) || 1);
            group.items.push(item);
            group.quantity += itemQuantity;
            group.internalTotal += Number(item.internalTotal) || 0;
            group.internalUnitPrice = group.internalTotal / Math.max(1, group.quantity * dailyUnits);
            return;
        }

        if (item.isManual || !Number(item.equipmentId)) {
            groups.push({
                ...item,
                items: [item],
                equipmentIds: [],
                quantity: Math.max(1, Number(item.quantity) || 1)
            });
            return;
        }

        const dailyUnits = Math.max(1, Number(item.dailyUnits) || 1);
        const key = `${getQuoteItemNameKey(item.description)}|${dailyUnits}`;
        let group = realEquipmentGroups.get(key);
        if (!group) {
            group = {
                ...item,
                isManual: false,
                items: [],
                equipmentIds: [],
                quantity: 0,
                internalTotal: 0
            };
            realEquipmentGroups.set(key, group);
            groups.push(group);
        }

        const itemQuantity = Math.max(1, Number(item.quantity) || 1);
        group.items.push(item);
        group.equipmentIds.push(Number(item.equipmentId));
        group.quantity += itemQuantity;
        group.internalTotal += Number(item.internalTotal) || 0;
        group.internalUnitPrice = group.internalTotal / Math.max(1, group.quantity * dailyUnits);
    });

    return groups;
}

function openQuoteItemEditModal(groupIndex) {
    const normalizedIndex = Number(groupIndex);
    const group = getQuoteItemDisplayGroups()[normalizedIndex];
    if (!group || !Array.isArray(group.items) || group.items.length === 0) return;

    const modal = document.getElementById('quoteItemEditModal');
    const indexInput = document.getElementById('quoteItemEditGroupIndex');
    const dailyUnitsInput = document.getElementById('quoteItemEditDailyUnits');
    const unitPriceInput = document.getElementById('quoteItemEditUnitPrice');
    const subtitle = document.getElementById('quoteItemEditModalSubtitle');
    if (!modal || !indexInput || !dailyUnitsInput || !unitPriceInput) return;

    indexInput.value = String(normalizedIndex);
    dailyUnitsInput.value = String(Math.max(1, Number(group.dailyUnits) || 1));
    unitPriceInput.value = formatMoney(Number(group.internalUnitPrice) || 0);
    if (subtitle) subtitle.textContent = String(group.description || 'Item selecionado');
    modal.style.display = 'flex';
    window.setTimeout(() => unitPriceInput.focus(), 0);
}

function closeQuoteItemEditModal() {
    const modal = document.getElementById('quoteItemEditModal');
    if (modal) modal.style.display = 'none';
}

function formatQuoteItemEditPrice(input) {
    if (input) input.value = formatQuoteMoneyInput(input.value);
}

function saveQuoteItemEdit(event) {
    event?.preventDefault();
    const groupIndex = Number(document.getElementById('quoteItemEditGroupIndex')?.value);
    const group = getQuoteItemDisplayGroups()[groupIndex];
    const dailyUnits = Number.parseInt(document.getElementById('quoteItemEditDailyUnits')?.value, 10);
    const unitPrice = parseQuoteMoneyInput(document.getElementById('quoteItemEditUnitPrice')?.value);

    if (!group || !Array.isArray(group.items) || group.items.length === 0) {
        closeQuoteItemEditModal();
        return;
    }
    if (!Number.isInteger(dailyUnits) || dailyUnits <= 0) {
        alert('Informe uma quantidade válida de diárias.');
        document.getElementById('quoteItemEditDailyUnits')?.focus();
        return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        alert('Informe um preço unitário válido.');
        document.getElementById('quoteItemEditUnitPrice')?.focus();
        return;
    }

    group.items.forEach((item) => {
        const quantity = Math.max(1, Number(item.quantity) || 1);
        item.dailyUnits = dailyUnits;
        item.internalUnitPrice = unitPrice;
        item.internalTotal = Math.round(quantity * dailyUnits * unitPrice * 100) / 100;
        item.priceOverride = true;
    });
    quoteFinalEdited = false;
    closeQuoteItemEditModal();
    renderQuoteItems();
    renderQuoteEquipmentResults(quoteEquipmentSuggestions);
}

function renderQuoteItems() {
    const tbody = document.querySelector('#quoteItemsTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (quoteItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Nenhum item adicionado.</td></tr>';
        updateQuoteTotals();
        return;
    }

    getQuoteItemDisplayGroups().forEach((item, index) => {
        const row = document.createElement('tr');
        const itemBadge = item.isService
            ? '<span class="quote-service-item-badge">Serviço</span>'
            : (item.isManual ? '<span class="quote-manual-item-badge">Avulso</span>' : '');
        row.innerHTML = `
            <td>${escapeHtml(item.isService ? String(item.description || '').toUpperCase() : item.description)}${itemBadge}</td>
            <td>${escapeHtml(Math.max(1, Number(item.quantity) || 1))}</td>
            <td>${escapeHtml(item.dailyUnits)}</td>
            <td>${escapeHtml(formatMoney(item.internalUnitPrice))}</td>
            <td>${escapeHtml(formatMoney(item.internalTotal))}</td>
            <td><button type="button" class="btn-danger btn-delete-mini" onclick="removeQuoteItemGroup(${index})" title="Remover item" aria-label="Remover item">×</button></td>
        `;
        row.lastElementChild?.insertAdjacentHTML(
            'afterbegin',
            `<button type="button" class="btn-secondary btn-edit-mini" onclick="openQuoteItemEditModal(${index})">Editar</button>`
        );
        tbody.appendChild(row);
    });

    updateQuoteTotals();
}

function toggleQuoteManualItemFields(forceOpen) {
    const fields = document.getElementById('quoteManualItemFields');
    const toggle = document.getElementById('quoteManualItemToggle');
    if (!fields || !toggle) return;

    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : fields.hidden;
    fields.hidden = !shouldOpen;
    toggle.setAttribute('aria-expanded', String(shouldOpen));
    toggle.textContent = shouldOpen
        ? '− Ocultar equipamento avulso'
        : '+ Adicionar equipamento avulso';

    if (shouldOpen) {
        window.setTimeout(() => document.getElementById('quoteManualItemDescription')?.focus(), 0);
    }
}

function addQuoteManualItem() {
    const descriptionInput = document.getElementById('quoteManualItemDescription');
    const quantityInput = document.getElementById('quoteManualItemQuantity');
    const dailyUnitsInput = document.getElementById('quoteManualItemDailyUnits');
    const unitPriceInput = document.getElementById('quoteManualItemUnitPrice');
    const description = String(descriptionInput?.value || '').trim();
    const quantity = Number.parseInt(quantityInput?.value, 10);
    const dailyUnits = Number.parseInt(dailyUnitsInput?.value, 10);
    const internalUnitPrice = parseQuoteMoneyInput(unitPriceInput?.value);

    if (!description) {
        alert('Digite o nome do equipamento avulso.');
        descriptionInput?.focus();
        return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        alert('Digite uma quantidade válida para o equipamento avulso.');
        quantityInput?.focus();
        return;
    }

    if (!Number.isInteger(dailyUnits) || dailyUnits <= 0) {
        alert('Digite uma quantidade válida de diárias para o equipamento avulso.');
        dailyUnitsInput?.focus();
        return;
    }

    if (!Number.isFinite(internalUnitPrice) || internalUnitPrice < 0) {
        alert('Digite um preço válido para o equipamento avulso.');
        unitPriceInput?.focus();
        return;
    }

    quoteItems.push({
        equipmentId: null,
        isManual: true,
        isService: false,
        category: 'outros',
        description,
        quantity,
        dailyUnits,
        internalUnitPrice,
        internalTotal: quantity * dailyUnits * internalUnitPrice
    });

    if (descriptionInput) descriptionInput.value = '';
    if (quantityInput) quantityInput.value = '1';
    if (dailyUnitsInput) dailyUnitsInput.value = '1';
    if (unitPriceInput) unitPriceInput.value = formatMoney(0);
    toggleQuoteManualItemFields(false);
    renderQuoteItems();
    document.getElementById('quoteManualItemToggle')?.focus();
}

function normalizeTechnicianName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function renderQuoteTechnicianOptions(operators = quoteTechnicianSuggestions) {
    const list = document.getElementById('quoteTechnicianOptions');
    if (!list) return;

    list.innerHTML = '';
    (operators || []).forEach((operator) => {
        const option = document.createElement('option');
        option.value = operator.fullName || '';
        option.label = `Cachê: ${formatMoney(operator.cacheValue || 0)}`;
        list.appendChild(option);
    });
}

async function loadQuoteTechnicianOptions(search = '') {
    if (!canAccessOperators()) return;

    try {
        const response = await fetch(`/api/operators?search=${encodeURIComponent(search)}`, {
            credentials: 'include'
        });

        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            quoteTechnicianSuggestions = [];
            renderQuoteTechnicianOptions([]);
            return;
        }

        quoteTechnicianSuggestions = Array.isArray(data.operators) ? data.operators : [];
        if (!search) {
            allOperators = quoteTechnicianSuggestions;
        }
        renderQuoteTechnicianOptions(quoteTechnicianSuggestions);
    } catch (error) {
        console.error(error);
        quoteTechnicianSuggestions = [];
        renderQuoteTechnicianOptions([]);
    }
}

function scheduleQuoteTechnicianSearch() {
    const search = String(document.getElementById('quoteTechnicianName')?.value || '').trim();
    window.clearTimeout(quoteTechnicianSearchTimer);
    quoteTechnicianSearchTimer = window.setTimeout(() => loadQuoteTechnicianOptions(search), 220);
}

function setupQuoteTechnicianSearch() {
    const input = document.getElementById('quoteTechnicianName');
    if (!input || input.dataset.searchReady === 'true') return;

    input.dataset.searchReady = 'true';
    input.addEventListener('input', scheduleQuoteTechnicianSearch);
    input.addEventListener('focus', () => {
        if (quoteTechnicianSuggestions.length === 0) {
            loadQuoteTechnicianOptions('');
        } else {
            renderQuoteTechnicianOptions(quoteTechnicianSuggestions);
        }
    });
}

async function findQuoteTechnicianByName(name) {
    const normalizedName = normalizeTechnicianName(name);
    if (!normalizedName) return null;

    const localCandidates = [...quoteTechnicianSuggestions, ...allOperators];
    const localMatch = localCandidates.find((operator) => (
        normalizeTechnicianName(operator.fullName) === normalizedName
    ));
    if (localMatch) return localMatch;

    await loadQuoteTechnicianOptions(name);
    return quoteTechnicianSuggestions.find((operator) => (
        normalizeTechnicianName(operator.fullName) === normalizedName
    )) || null;
}

function getQuoteTechnicianDailyUnits() {
    const input = document.getElementById('quoteTechnicianDailyUnits');
    return Math.max(1, Number.parseInt(input?.value, 10) || 1);
}

function renderQuoteTechnicians() {
    const tbody = document.querySelector('#quoteTechniciansTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (quoteTechnicians.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Nenhum técnico adicionado.</td></tr>';
        updateQuoteTotals();
        return;
    }

    quoteTechnicians.forEach((technician, index) => {
        const dailyUnits = Math.max(1, Number(technician.dailyUnits) || 1);
        const cacheValue = Number(technician.cacheValue) || 0;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(technician.operatorName || technician.fullName || 'Técnico')}</td>
            <td>${escapeHtml(dailyUnits)}</td>
            <td>${escapeHtml(formatMoney(cacheValue))}</td>
            <td>${escapeHtml(formatMoney(dailyUnits * cacheValue))}</td>
            <td><button type="button" class="btn-danger btn-delete-mini" onclick="removeQuoteTechnician(${index})">Remover</button></td>
        `;
        tbody.appendChild(row);
    });

    updateQuoteTotals();
}

async function addQuoteTechnician() {
    const nameInput = document.getElementById('quoteTechnicianName');
    const dailyInput = document.getElementById('quoteTechnicianDailyUnits');
    const name = String(nameInput?.value || '').trim();
    const dailyUnits = getQuoteTechnicianDailyUnits();

    if (!name) {
        alert('Digite o nome do técnico.');
        nameInput?.focus();
        return;
    }

    const operator = await findQuoteTechnicianByName(name);
    if (!operator) {
        alert('Selecione um técnico cadastrado.');
        nameInput?.focus();
        return;
    }

    const operatorId = Number(operator.id);
    if (quoteTechnicians.some((technician) => Number(technician.operatorId) === operatorId)) {
        alert('Este técnico já foi adicionado ao orçamento.');
        return;
    }

    const cacheValue = Number(operator.cacheValue) || 0;
    quoteTechnicians.push({
        operatorId,
        operatorName: operator.fullName || name,
        dailyUnits,
        cacheValue,
        paymentTotal: dailyUnits * cacheValue
    });

    if (nameInput) nameInput.value = '';
    if (dailyInput) dailyInput.value = '1';
    renderQuoteTechnicians();
}

function removeQuoteTechnician(index) {
    quoteTechnicians.splice(Number(index), 1);
    renderQuoteTechnicians();
}

function setQuoteTextInput(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value || '';
}

function getQuoteDailyUnits() {
    const dailyInput = document.getElementById('quoteItemDailyUnits');
    return Math.max(1, Number.parseInt(dailyInput?.value, 10) || 1);
}

const QUOTE_DATABASE_VISUAL_EXCLUSIONS_KEY = 'quote_database_visual_exclusions_v1';
const QUOTE_DATABASE_VISUAL_EXCLUSION_NAMES_KEY = 'quote_database_visual_exclusion_names_v1';

function getQuoteDatabaseVisualExclusionIds() {
    if (quoteDatabaseVisualExclusionIds instanceof Set) {
        return quoteDatabaseVisualExclusionIds;
    }

    let storedIds = [];
    try {
        const storedValue = JSON.parse(localStorage.getItem(QUOTE_DATABASE_VISUAL_EXCLUSIONS_KEY) || '[]');
        if (Array.isArray(storedValue)) storedIds = storedValue;
    } catch (error) {
        console.warn('Não foi possível carregar as exclusões visuais do banco de orçamentos.', error);
    }

    quoteDatabaseVisualExclusionIds = new Set(
        storedIds
            .map(Number)
            .filter((equipmentId) => Number.isInteger(equipmentId) && equipmentId > 0)
    );
    return quoteDatabaseVisualExclusionIds;
}

function saveQuoteDatabaseVisualExclusionIds() {
    try {
        localStorage.setItem(
            QUOTE_DATABASE_VISUAL_EXCLUSIONS_KEY,
            JSON.stringify([...getQuoteDatabaseVisualExclusionIds()].sort((a, b) => a - b))
        );
    } catch (error) {
        console.warn('Não foi possível salvar as exclusões visuais do banco de orçamentos.', error);
    }
}

function getQuoteDatabaseVisualExclusionNames() {
    if (quoteDatabaseVisualExclusionNames instanceof Set) {
        return quoteDatabaseVisualExclusionNames;
    }

    let storedNames = [];
    try {
        const storedValue = JSON.parse(localStorage.getItem(QUOTE_DATABASE_VISUAL_EXCLUSION_NAMES_KEY) || '[]');
        if (Array.isArray(storedValue)) storedNames = storedValue;
    } catch (error) {
        console.warn('Não foi possível carregar os nomes excluídos da visualização de orçamentos.', error);
    }

    quoteDatabaseVisualExclusionNames = new Set(
        storedNames.map(getQuoteItemNameKey).filter(Boolean)
    );
    return quoteDatabaseVisualExclusionNames;
}

function saveQuoteDatabaseVisualExclusionNames() {
    try {
        localStorage.setItem(
            QUOTE_DATABASE_VISUAL_EXCLUSION_NAMES_KEY,
            JSON.stringify([...getQuoteDatabaseVisualExclusionNames()].sort())
        );
    } catch (error) {
        console.warn('Não foi possível salvar os nomes excluídos da visualização de orçamentos.', error);
    }
}

function isQuoteEquipmentVisuallyExcluded(equipment) {
    const excludedIds = getQuoteDatabaseVisualExclusionIds();
    const equipmentNameKey = getQuoteItemNameKey(equipment?.name);
    if (equipmentNameKey && getQuoteDatabaseVisualExclusionNames().has(equipmentNameKey)) {
        return true;
    }

    const equipmentIds = [
        Number(equipment?.id),
        ...(Array.isArray(equipment?.equipments)
            ? equipment.equipments.map((item) => Number(item?.id))
            : [])
    ].filter((equipmentId) => Number.isInteger(equipmentId) && equipmentId > 0);

    return equipmentIds.length > 0 && equipmentIds.every((equipmentId) => excludedIds.has(equipmentId));
}

function filterQuoteEquipmentVisualExclusions(equipments) {
    return (Array.isArray(equipments) ? equipments : [])
        .filter((equipment) => !isQuoteEquipmentVisuallyExcluded(equipment));
}

function getQuoteEquipmentSelectedCount(equipment) {
    if (equipment?.isService === true) {
        return quoteItems.reduce((total, item) => (
            item?.isService && item.serviceId === equipment.serviceId
                ? total + Math.max(1, Number(item.quantity) || 1)
                : total
        ), 0);
    }

    const equipmentNameKey = getQuoteItemNameKey(equipment?.name);
    return quoteItems.reduce((total, item) => (
        !item?.isManual && !item?.isService
            && getQuoteItemNameKey(item.description) === equipmentNameKey
            ? total + Math.max(1, Number(item.quantity) || 1)
            : total
    ), 0);
}

function renderQuoteEquipmentResults(equipments = quoteEquipmentSuggestions) {
    const container = document.getElementById('quoteEquipmentResults');
    if (!container) return;

    const search = String(document.getElementById('quoteItemDescription')?.value || '').trim();
    container.innerHTML = '';

    if (!search) {
        return;
    }

    if (!equipments.length) {
        container.innerHTML = '<p class="quote-equipment-empty">Nenhum equipamento disponível encontrado.</p>';
        return;
    }

    const selectedEquipmentIds = new Set(
        quoteItems.map((item) => Number(item.equipmentId)).filter((equipmentId) => equipmentId > 0)
    );

    equipments.forEach((equipment, groupIndex) => {
        const isService = equipment.isService === true;
        const selectedCount = getQuoteEquipmentSelectedCount(equipment);
        const remainingCapacity = isService
            ? Number.MAX_SAFE_INTEGER
            : Math.max(0, Number(equipment.forecastAvailableQuantity ?? equipment.availableQuantity) || 0);
        const availableEquipments = (Array.isArray(equipment.equipments) ? equipment.equipments : [])
            .filter((item) => !selectedEquipmentIds.has(Number(item.id)));
        const minPrice = Number(equipment.minUnitPrice ?? 0) || 0;
        const maxPrice = Number(equipment.maxUnitPrice ?? minPrice) || minPrice;
        const priceText = Math.abs(maxPrice - minPrice) < 0.009
            ? formatMoney(minPrice)
            : `${formatMoney(minPrice)} a ${formatMoney(maxPrice)}`;
        const requiresDimensions = isService && equipment.requiresDimensions === true;
        const displayedPrice = requiresDimensions
            ? `${formatMoney(equipment.pricePerSquareMeter || 500)} por m²`
            : priceText;
        const categoryText = (Array.isArray(equipment.categories) && equipment.categories.length)
            ? equipment.categories.join(', ')
            : (equipment.category || 'Outros');
        const noAvailability = false;
        const confirmedAvailable = Math.max(0, Number(equipment.confirmedAvailableQuantity ?? equipment.availableQuantity) || 0);
        const forecastAvailable = Math.max(0, Number(equipment.forecastAvailableQuantity ?? equipment.availableQuantity) || 0);
        const confirmedDemand = editingQuoteStatus === 'approved';
        const confirmedBalance = Math.max(0, confirmedAvailable - (confirmedDemand ? selectedCount : 0));
        const forecastBalance = Math.max(0, forecastAvailable - selectedCount);
        const forecastDeficit = Math.max(0, selectedCount - forecastAvailable);
        const availabilityText = isService
            ? '<strong class="quote-availability-count">Quantidade ilimitada</strong>'
            : `<strong class="quote-availability-count">Disponível considerando confirmados: ${confirmedBalance}</strong>
               <span>Disponível considerando também as demandas previstas: ${forecastBalance}</span>
               ${forecastDeficit > 0 ? `<strong class="quote-availability-warning">Estoque insuficiente para o período • Déficit previsto: ${forecastDeficit}</strong>` : ''}`;
        const quoteAvailabilityText = isService
            ? '<strong class="quote-availability-count">Disponível: ilimitado</strong>'
            : `<strong class="quote-availability-count">Disponível: ${forecastBalance}</strong>`;
        const quantityAttributes = '';
        const row = document.createElement('div');
        row.className = `quote-equipment-result ${isService ? 'quote-service-result' : ''} ${selectedCount > 0 ? 'scheduled' : ''}`.trim();
        const dimensionControls = requiresDimensions
            ? `<div class="quote-panel-size-control">
                    <label>Tamanho do painel (metros)</label>
                    <div class="quote-panel-size-fields">
                        <input type="number" id="quotePanelWidth_${groupIndex}" min="0.001" step="0.001" placeholder="Largura" aria-label="Largura do painel em metros">
                        <span aria-hidden="true">x</span>
                        <input type="number" id="quotePanelHeight_${groupIndex}" min="0.001" step="0.001" placeholder="Altura" aria-label="Altura do painel em metros">
                    </div>
                </div>`
            : '';
        row.innerHTML = `
            <div class="quote-equipment-info">
                <strong>
                    ${escapeHtml(isService ? String(equipment.name || '').toUpperCase() : equipment.name)}
                    ${isService ? '<span class="quote-service-item-badge">Serviço</span>' : ''}
                    ${selectedCount > 0 ? `<span class="status-badge badge-scheduled quote-equipment-status">${selectedCount} no orçamento</span>` : ''}
                </strong>
                <span>${quoteAvailabilityText}</span>
                <span>Categoria: ${escapeHtml(categoryText)} | Preço: ${escapeHtml(displayedPrice)}</span>
                <span>Observação: ${escapeHtml(getEquipmentObservation(equipment) || '-')}</span>
            </div>
            <div class="quote-equipment-add-controls ${requiresDimensions ? 'has-dimensions' : ''}">
                ${dimensionControls}
                <label for="quoteEquipmentQuantity_${groupIndex}">Quantidade</label>
                <input type="number" id="quoteEquipmentQuantity_${groupIndex}" min="1" step="1" value="1" ${quantityAttributes}>
                <button type="button" class="btn-primary btn-small" onclick="addQuoteEquipmentGroup(${groupIndex})">
                    Adicionar
                </button>
            </div>
        `;
        container.appendChild(row);
    });
}

async function searchQuoteEquipments() {
    const input = document.getElementById('quoteItemDescription');
    const search = String(input?.value || '').trim();
    const assemblyInput = document.getElementById('quoteAssemblyDatetime');
    const eventInput = document.getElementById('quoteEventDatetime');
    const disassemblyInput = document.getElementById('quoteDisassemblyDatetime');

    if (!search) {
        quoteEquipmentSuggestions = [];
        renderQuoteEquipmentResults([]);
        return;
    }

    try {
        const params = new URLSearchParams({
            search,
            assemblyDatetime: assemblyInput.value.trim(),
            eventDatetime: eventInput.value.trim(),
            disassemblyDatetime: disassemblyInput.value.trim()
        });
        if (editingQuoteId) params.set('quoteId', String(editingQuoteId));
        const response = await fetch(`/api/orcamentos/equipamentos-disponiveis?${params.toString()}`, {
            credentials: 'include'
        });

        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            quoteEquipmentSuggestions = [];
            const container = document.getElementById('quoteEquipmentResults');
            if (container) {
                container.innerHTML = `<p class="quote-equipment-empty">${escapeHtml(data.error || 'Não foi possível consultar a disponibilidade.')}</p>`;
            }
            return;
        }

        quoteEquipmentSuggestions = filterQuoteEquipmentVisualExclusions(data.equipments);
        renderQuoteEquipmentResults(quoteEquipmentSuggestions);
    } catch (error) {
        console.error(error);
        quoteEquipmentSuggestions = [];
        renderQuoteEquipmentResults([]);
    }
}

function scheduleQuoteEquipmentSearch() {
    window.clearTimeout(quoteEquipmentSearchTimer);
    quoteEquipmentSearchTimer = window.setTimeout(searchQuoteEquipments, 220);
}

function setupQuoteEquipmentSearch() {
    const input = document.getElementById('quoteItemDescription');
    if (!input || input.dataset.searchReady === 'true') return;

    input.dataset.searchReady = 'true';
    input.addEventListener('input', scheduleQuoteEquipmentSearch);
    input.addEventListener('focus', () => {
        if (input.value.trim() && quoteEquipmentSuggestions.length > 0) {
            renderQuoteEquipmentResults(quoteEquipmentSuggestions);
        }
    });

    ['quoteAssemblyDatetime', 'quoteEventDatetime', 'quoteDisassemblyDatetime'].forEach((dateInputId) => {
        const dateInput = document.getElementById(dateInputId);
        if (!dateInput || dateInput.dataset.availabilityReady === 'true') return;
        dateInput.dataset.availabilityReady = 'true';
        dateInput.addEventListener('blur', () => {
            if (input.value.trim()) searchQuoteEquipments();
        });
    });
}

async function setQuoteEquipmentSchedule(equipmentId, action) {
    const response = await fetch(`/api/orcamentos/equipamentos/${Number(equipmentId)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            assemblyDatetime: document.getElementById('quoteAssemblyDatetime')?.value || '',
            eventDatetime: document.getElementById('quoteEventDatetime')?.value || '',
            disassemblyDatetime: document.getElementById('quoteDisassemblyDatetime')?.value || '',
            quoteId: editingQuoteId || null
        })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(data.error || data.message || 'Não foi possível atualizar o equipamento.');
        error.code = data.code || '';
        error.conflict = data.conflict || null;
        throw error;
    }

    return data.equipment || {};
}

async function addQuoteEquipmentGroup(groupIndex) {
    const scrollTop = window.scrollY;
    const scrollLeft = window.scrollX;
    const equipmentGroup = quoteEquipmentSuggestions[Number(groupIndex)];
    if (!equipmentGroup) {
        alert('Equipamento não encontrado na busca.');
        return;
    }

    const quantityInput = document.getElementById(`quoteEquipmentQuantity_${Number(groupIndex)}`);
    const requestedQuantity = Number.parseInt(quantityInput?.value, 10);
    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
        alert('Digite uma quantidade válida.');
        quantityInput?.focus();
        return;
    }

    const dailyUnits = getQuoteDailyUnits();
    if (equipmentGroup.isService === true) {
        const serviceId = String(equipmentGroup.serviceId || '').trim();
        if (!serviceId) {
            alert('Serviço não encontrado na busca.');
            return;
        }

        let serviceWidth = null;
        let serviceHeight = null;
        let description = String(equipmentGroup.name || '').toUpperCase();
        let internalUnitPrice = Number(equipmentGroup.unitPrice ?? equipmentGroup.minUnitPrice ?? 0) || 0;

        if (equipmentGroup.requiresDimensions === true) {
            const widthInput = document.getElementById(`quotePanelWidth_${Number(groupIndex)}`);
            const heightInput = document.getElementById(`quotePanelHeight_${Number(groupIndex)}`);
            serviceWidth = Number(widthInput?.value);
            serviceHeight = Number(heightInput?.value);
            if (!(serviceWidth > 0)) {
                alert('Digite uma largura válida para o Painel de LED.');
                widthInput?.focus();
                return;
            }
            if (!(serviceHeight > 0)) {
                alert('Digite uma altura válida para o Painel de LED.');
                heightInput?.focus();
                return;
            }

            serviceWidth = Math.round(serviceWidth * 1000) / 1000;
            serviceHeight = Math.round(serviceHeight * 1000) / 1000;
            const squareMeterPrice = Number(equipmentGroup.pricePerSquareMeter) || 500;
            internalUnitPrice = Math.round(serviceWidth * serviceHeight * squareMeterPrice * 100) / 100;
            description = `${description} ${formatQuoteDimension(serviceWidth)}x${formatQuoteDimension(serviceHeight)} METROS`;
        }

        const existingService = quoteItems.find((item) => (
            item.isService
            && item.serviceId === serviceId
            && Math.max(1, Number(item.dailyUnits) || 1) === dailyUnits
            && Number(item.serviceWidth || 0) === Number(serviceWidth || 0)
            && Number(item.serviceHeight || 0) === Number(serviceHeight || 0)
        ));
        if (existingService) {
            existingService.quantity = Math.max(1, Number(existingService.quantity) || 1) + requestedQuantity;
            existingService.internalTotal = existingService.quantity * dailyUnits * internalUnitPrice;
        } else {
            quoteItems.push({
                equipmentId: null,
                serviceId,
                serviceWidth,
                serviceHeight,
                isManual: false,
                isService: true,
                category: 'SERVIÇOS',
                description,
                quantity: requestedQuantity,
                dailyUnits,
                internalUnitPrice,
                internalTotal: requestedQuantity * dailyUnits * internalUnitPrice
            });
        }

        renderQuoteEquipmentResults(quoteEquipmentSuggestions);
        renderQuoteItems();
        restorePageScroll(scrollTop, scrollLeft);
        return;
    }

    const invalidDateInput = [
        document.getElementById('quoteAssemblyDatetime'),
        document.getElementById('quoteEventDatetime'),
        document.getElementById('quoteDisassemblyDatetime')
    ].find((dateInput) => !setQuoteMaskedFieldValidity(dateInput, 'daterange'));
    if (invalidDateInput) {
        invalidDateInput.focus();
        invalidDateInput.reportValidity();
        return;
    }

    const nameKey = getQuoteItemNameKey(equipmentGroup.name);
    const existingEquipmentItem = quoteItems.find((item) => (
        !item.isManual && !item.isService && getQuoteItemNameKey(item.description) === nameKey
    ));
    const equipment = existingEquipmentItem
        ? null
        : (Array.isArray(equipmentGroup.equipments) ? equipmentGroup.equipments[0] : null);
    if (!existingEquipmentItem && !equipment) {
        alert('Nenhum patrimônio cadastrado foi encontrado para representar este equipamento no planejamento.');
        return;
    }

    if (existingEquipmentItem) {
        existingEquipmentItem.quantity = Math.max(1, Number(existingEquipmentItem.quantity) || 1) + requestedQuantity;
        existingEquipmentItem.internalTotal = existingEquipmentItem.quantity
            * Math.max(1, Number(existingEquipmentItem.dailyUnits) || 1)
            * (Number(existingEquipmentItem.internalUnitPrice) || 0);
    } else {
        const equipmentId = Number(equipment.id);
        const internalUnitPrice = Number(equipment.unitPrice ?? equipment.unit_price ?? equipmentGroup.minUnitPrice ?? 0) || 0;
        quoteItems.push({
            equipmentId,
            isManual: false,
            isService: false,
            category: equipment.category || equipmentGroup.category || 'Outros',
            description: equipment.name || equipmentGroup.name,
            quantity: requestedQuantity,
            dailyUnits,
            internalUnitPrice,
            internalTotal: requestedQuantity * dailyUnits * internalUnitPrice
        });
        quoteScheduledEquipmentIds.add(equipmentId);
    }

    renderQuoteEquipmentResults(quoteEquipmentSuggestions);
    renderQuoteItems();
    restorePageScroll(scrollTop, scrollLeft);
}

async function releaseQuoteEquipment(equipmentId) {
    const normalizedId = Number(equipmentId);
    if (!quoteScheduledEquipmentIds.has(normalizedId)) return;

    try {
        await setQuoteEquipmentSchedule(normalizedId, 'liberar');
    } catch (error) {
        console.error(error);
    } finally {
        quoteScheduledEquipmentIds.delete(normalizedId);
    }
}

async function releasePendingQuoteEquipments() {
    const equipmentIds = Array.from(quoteScheduledEquipmentIds);
    await Promise.all(equipmentIds.map((equipmentId) => releaseQuoteEquipment(equipmentId)));
}

async function removeQuoteItem(index) {
    const [removedItem] = quoteItems.splice(Number(index), 1);
    if (removedItem?.equipmentId) {
        await releaseQuoteEquipment(removedItem.equipmentId);
        if (document.getElementById('quoteItemDescription')?.value.trim()) {
            await searchQuoteEquipments();
        } else {
            renderQuoteEquipmentResults(quoteEquipmentSuggestions);
        }
    }
    renderQuoteItems();
}

async function removeQuoteItemGroup(groupIndex) {
    const group = getQuoteItemDisplayGroups()[Number(groupIndex)];
    if (!group) return;

    const itemsToRemove = new Set(group.items || []);
    const equipmentIds = (group.equipmentIds || []).map(Number).filter((equipmentId) => equipmentId > 0);
    quoteItems = quoteItems.filter((item) => !itemsToRemove.has(item));
    await Promise.all(equipmentIds.map((equipmentId) => releaseQuoteEquipment(equipmentId)));

    if (document.getElementById('quoteItemDescription')?.value.trim()) {
        await searchQuoteEquipments();
    } else {
        renderQuoteEquipmentResults(quoteEquipmentSuggestions);
    }
    renderQuoteItems();
}

function initializeQuoteForm(forceReset = false) {
    const dateInput = document.getElementById('quoteProposalDate');
    if (dateInput && (!dateInput.value || forceReset)) {
        dateInput.value = formatQuoteDateFromDate();
    }
    const finalInput = document.getElementById('quoteFinalTotal');
    if (finalInput) finalInput.value = formatQuoteMoneyInput(finalInput.value);
    if (forceReset) toggleQuoteManualItemFields(false);
    const title = document.getElementById('quoteFormTitle');
    const submitButton = document.getElementById('quoteSubmitButton');
    const isApprovedEdit = !!editingQuoteId && editingQuoteStatus === 'approved';
    if (title) {
        title.textContent = isApprovedEdit
            ? 'Editar Orçamento Aprovado'
            : (editingQuoteId ? 'Editar Orçamento' : 'Criar Orçamento');
    }
    if (submitButton) {
        submitButton.textContent = isApprovedEdit
            ? 'Salvar e gerar novo PDF'
            : (editingQuoteId ? 'Salvar alterações' : 'Gerar PDF');
    }
    const manualDescriptionInput = document.getElementById('quoteManualItemDescription');
    if (manualDescriptionInput && manualDescriptionInput.dataset.enterReady !== 'true') {
        manualDescriptionInput.dataset.enterReady = 'true';
        manualDescriptionInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addQuoteManualItem();
        });
    }
    setupQuoteEquipmentSearch();
    renderQuoteItems();
    renderQuoteEquipmentResults([]);
}

function resetQuoteForm() {
    document.getElementById('quoteForm')?.reset();
    quoteItems = [];
    quoteTechnicians = [];
    quoteEquipmentSuggestions = [];
    quoteTechnicianSuggestions = [];
    editingQuoteId = null;
    editingQuoteStatus = '';
    quoteFinalEdited = false;
    initializeQuoteForm(true);
}

async function openQuoteCreate() {
    await releasePendingQuoteEquipments();
    resetQuoteForm();
    showSection('orcamentoCriar');
}

async function cancelQuoteForm() {
    const returnSection = editingQuoteStatus === 'approved' ? 'gerenciarOrcamentos' : 'orcamentos';
    await releasePendingQuoteEquipments();
    resetQuoteForm();
    showSection(returnSection);
}

function populateQuoteForm(quote) {
    editingQuoteId = Number(quote.id);
    editingQuoteStatus = String(quote.status || 'pending').trim().toLowerCase();
    quoteEquipmentSuggestions = [];
    quoteItems = (Array.isArray(quote.items) ? quote.items : []).map((item, index) => ({
        equipmentId: Number(item.equipmentId) || null,
        serviceId: item.serviceId || null,
        serviceWidth: Number(item.serviceWidth) || null,
        serviceHeight: Number(item.serviceHeight) || null,
        isManual: item.isManual === true || Number(item.isManual) === 1,
        isService: item.isService === true || Number(item.isService) === 1,
        category: item.category || (item.isService ? 'SERVIÇOS' : (item.isManual ? 'outros' : 'transmissao')),
        description: item.isService ? String(item.description || '').toUpperCase() : (item.description || ''),
        quantity: Math.max(1, Number(item.quantity) || 1),
        dailyUnits: Math.max(1, Number(item.dailyUnits) || 1),
        internalUnitPrice: Number(item.internalUnitPrice) || 0,
        internalTotal: Number(item.internalTotal) || 0,
        priceOverride: true,
        sortOrder: Number(item.sortOrder) || index + 1
    }));
    quoteTechnicians = [];
    const computedTotal = quoteItems.reduce((sum, item) => sum + (Number(item.internalTotal) || 0), 0)
        + (Number(quote.logisticsPrice) || 0)
        + (Number(quote.techniciansPrice) || 0);
    quoteFinalEdited = Math.abs((Number(quote.finalTotal) || 0) - computedTotal) > 0.009;

    setQuoteTextInput('quoteProposalCity', quote.proposalCity || 'Belo Horizonte');
    setQuoteTextInput('quoteProposalDate', formatQuoteDateFromIso(quote.proposalDate));
    setQuoteTextInput('quoteClientName', quote.clientName || '');
    setQuoteTextInput('quoteEventName', quote.eventName || '');
    setQuoteTextInput('quoteEventLocation', quote.eventLocation || '');
    setQuoteTextInput('quoteAssemblyDatetime', normalizeQuoteDateRangeValue(quote.assemblyDatetime || ''));
    setQuoteTextInput('quoteEventDatetime', normalizeQuoteDateRangeValue(quote.eventDatetime || ''));
    setQuoteTextInput('quoteDisassemblyDatetime', normalizeQuoteDateRangeValue(quote.disassemblyDatetime || ''));
    setQuoteTextInput('quotePaymentMethod', quote.paymentMethod || '');
    setQuoteTextInput('quotePaymentDeadline', quote.paymentDeadline || '');
    setQuoteTextInput('quoteNotes', quote.notes || '');
    setQuoteTextInput('quoteManualItemDescription', '');
    setQuoteTextInput('quoteManualItemQuantity', '1');
    setQuoteTextInput('quoteManualItemDailyUnits', '1');
    setQuoteTextInput('quoteManualItemUnitPrice', formatMoney(0));
    setQuoteTextInput('quoteItemDescription', '');
    setQuoteTextInput('quoteItemDailyUnits', '1');
    setQuoteTextInput(
        'quoteServicesPrice',
        formatMoney((Number(quote.logisticsPrice) || 0) + (Number(quote.techniciansPrice) || 0))
    );
    setQuoteTextInput('quoteFinalTotal', formatMoney(quote.finalTotal || computedTotal));
    const showItemPricesInput = document.getElementById('quoteShowItemPrices');
    if (showItemPricesInput) {
        showItemPricesInput.checked = !!quote.showItemPrices;
    }
    const showServicesPriceInput = document.getElementById('quoteShowServicesPrice');
    if (showServicesPriceInput) {
        showServicesPriceInput.checked = !!quote.showServicesPrice;
    }
}

async function editQuote(quoteId) {
    await releasePendingQuoteEquipments();

    try {
        const response = await fetch(`/api/orcamentos/${Number(quoteId)}`, { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Não foi possível carregar o orçamento.');
            return;
        }

        const quoteStatus = String(data.quote?.status || 'pending').trim().toLowerCase();
        if (!['pending', 'approved'].includes(quoteStatus)) {
            alert('Este orçamento não pode ser editado.');
            return;
        }

        quoteScheduledEquipmentIds.clear();
        populateQuoteForm(data.quote || {});
        showSection('orcamentoCriar');
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

function getQuotePayload() {
    return {
        proposalCity: document.getElementById('quoteProposalCity')?.value || '',
        proposalDate: quoteDateToIso(document.getElementById('quoteProposalDate')?.value || ''),
        clientName: document.getElementById('quoteClientName')?.value || '',
        eventName: document.getElementById('quoteEventName')?.value || '',
        eventLocation: document.getElementById('quoteEventLocation')?.value || '',
        eventDatetime: document.getElementById('quoteEventDatetime')?.value || '',
        assemblyDatetime: document.getElementById('quoteAssemblyDatetime')?.value || '',
        disassemblyDatetime: document.getElementById('quoteDisassemblyDatetime')?.value || '',
        paymentMethod: document.getElementById('quotePaymentMethod')?.value || '',
        paymentDeadline: document.getElementById('quotePaymentDeadline')?.value || '',
        logisticsPrice: 0,
        techniciansPrice: parseQuoteMoneyInput(document.getElementById('quoteServicesPrice')?.value),
        finalTotal: parseQuoteMoneyInput(document.getElementById('quoteFinalTotal')?.value),
        showItemPrices: !!document.getElementById('quoteShowItemPrices')?.checked,
        showServicesPrice: !!document.getElementById('quoteShowServicesPrice')?.checked,
        notes: document.getElementById('quoteNotes')?.value || '',
        items: quoteItems,
        technicians: []
    };
}

function renderQuoteList(quotes, search = '', options = {}) {
    const grid = document.getElementById(options.gridId || 'quotesGrid');
    if (!grid) return;

    const normalizedSearch = search.toLowerCase();
    const filtered = quotes.filter((quote) => {
        if (!normalizedSearch) return true;
        return [quote.clientName, quote.eventName, quote.eventLocation, quote.eventDatetime]
            .some((field) => String(field || '').toLowerCase().includes(normalizedSearch));
    });

    grid.innerHTML = '';
    if (filtered.length === 0) {
        grid.innerHTML = `<p class="empty-state">${escapeHtml(options.emptyMessage || 'Nenhum orçamento encontrado.')}</p>`;
        return;
    }

    filtered.forEach((quote) => {
        const quoteId = Number(quote.id);
        const destinationLabel = quote.destinationType === 'rental' ? 'Locação' : 'Evento';
        const approvedInfo = options.approved
            ? `<span class="card-date">Destino: ${escapeHtml(destinationLabel)}</span>
               <span class="card-date">Aprovado em ${escapeHtml(formatDateTime(quote.approvedAt))}</span>`
            : '';
        const editButton = !options.approved || options.allowApprovedEdit
            ? `<button type="button" onclick="editQuote(${quoteId})" class="btn-secondary">Editar</button>`
            : '';
        const readyButton = options.approved
            ? ''
            : `<button type="button" onclick="markQuoteReady(${quoteId})" class="btn-success">Aprovado</button>`;
        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = `
            <div class="card-top">
                <h3>${escapeHtml(quote.eventName || 'Orçamento')}</h3>
                <div class="event-meta">
                    <span class="card-date">${escapeHtml(formatMoney(quote.finalTotal))}</span>
                    <span class="card-date">${escapeHtml(formatDateTime(quote.createdAt))}</span>
                    ${approvedInfo}
                </div>
            </div>
            <p>${escapeHtml(quote.clientName || '-')}</p>
            <p>${escapeHtml(quote.eventLocation || '-')}</p>
            <div class="event-actions quote-actions">
                <button type="button" onclick="downloadExistingQuotePdf(${quoteId})" class="btn-primary">PDF</button>
                ${editButton}
                ${readyButton}
                <button type="button" onclick="deleteQuote(${quoteId}, ${options.approved ? 'true' : 'false'})" class="btn-danger">Excluir</button>
            </div>`;
        grid.appendChild(card);
    });
}

function renderQuotes(quotes, search = '') {
    renderQuoteList(quotes, search, {
        gridId: 'quotesGrid',
        emptyMessage: 'Nenhum orçamento encontrado.',
        approved: false
    });
}

function renderManagedApprovedQuotes(quotes = allApprovedQuotes, search = '') {
    renderQuoteList(quotes, search, {
        gridId: 'managedApprovedQuotesGrid',
        emptyMessage: 'Nenhum orçamento aprovado encontrado.',
        approved: true,
        allowApprovedEdit: true
    });
}

function getQuoteEventDateKey(quote) {
    return getQuoteDateRangeKeys(quote)[0] || '';
}

function getDateKey(date) {
    return [
        String(date.getFullYear()).padStart(4, '0'),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function getApprovedQuoteCalendarEntries(quote) {
    return [
        { type: 'event', label: 'Evento', value: quote.eventDatetime },
        { type: 'assembly', label: 'Montagem', value: quote.assemblyDatetime },
        { type: 'disassembly', label: 'Desmontagem', value: quote.disassemblyDatetime }
    ].flatMap((entry) => (
        getQuoteDateRangeKeys(entry.value).map((dateKey) => ({
            type: entry.type,
            label: entry.label,
            dateKey,
            quote
        }))
    ));
}

function getApprovedCalendarEntriesByDate(quotes = allApprovedQuotes) {
    return quotes.reduce((groups, quote) => {
        getApprovedQuoteCalendarEntries(quote).forEach((entry) => {
            if (!groups.has(entry.dateKey)) groups.set(entry.dateKey, []);
            groups.get(entry.dateKey).push(entry);
        });
        return groups;
    }, new Map());
}

function getUniqueApprovedQuotesForEntries(entries = []) {
    const byId = new Map();
    entries.forEach((entry) => {
        const quoteId = Number(entry.quote?.id);
        if (!byId.has(quoteId)) byId.set(quoteId, entry.quote);
    });
    return Array.from(byId.values()).filter(Boolean);
}

function getApprovedEntryLabelsForQuote(entries = [], quoteId) {
    return entries
        .filter((entry) => Number(entry.quote?.id) === Number(quoteId))
        .map((entry) => entry.label);
}

function getApprovedEntryDatetime(entry) {
    if (entry.type === 'assembly') return entry.quote?.assemblyDatetime || '';
    if (entry.type === 'disassembly') return entry.quote?.disassemblyDatetime || '';
    return entry.quote?.eventDatetime || '';
}

function getApprovedEntryDetailsForQuote(entries = [], quoteId) {
    return entries
        .filter((entry) => Number(entry.quote?.id) === Number(quoteId))
        .map((entry) => ({
            label: entry.label,
            type: entry.type,
            datetime: getApprovedEntryDatetime(entry)
        }));
}

function getApprovedEntryTypesForDay(entries = []) {
    const orderedTypes = [
        ['event', 'Evento'],
        ['assembly', 'Montagem'],
        ['disassembly', 'Desmontagem']
    ];
    return orderedTypes
        .filter(([type]) => entries.some((entry) => entry.type === type))
        .map(([type, label]) => ({ type, label }));
}

function getApprovedDateLabel(dateKey) {
    const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    return `${match[3]}/${match[2]}/${match[1]}`;
}

function renderApprovedQuoteDayDetails(dateKey, entriesForDay = []) {
    const details = document.getElementById('approvedQuoteDayDetails');
    if (!details) return;
    const quotesForDay = getUniqueApprovedQuotesForEntries(entriesForDay);

    if (!dateKey) {
        details.innerHTML = '<p class="empty-state">Clique em um dia marcado para ver os eventos aprovados.</p>';
        return;
    }

    if (!quotesForDay.length) {
        details.innerHTML = `<p class="empty-state">Nenhum evento aprovado em ${escapeHtml(getApprovedDateLabel(dateKey))}.</p>`;
        return;
    }

    details.innerHTML = `
        <div class="approved-day-header">
            <h2>${escapeHtml(getApprovedDateLabel(dateKey))}</h2>
            <span>${entriesForDay.length} ${entriesForDay.length === 1 ? 'marcação' : 'marcações'}</span>
        </div>
        <div class="events-grid approved-day-events"></div>
    `;

    const grid = details.querySelector('.approved-day-events');
    quotesForDay.forEach((quote) => {
        const quoteId = Number(quote.id);
        const entryDetails = getApprovedEntryDetailsForQuote(entriesForDay, quoteId);
        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = `
            <div class="card-top">
                <h3>${escapeHtml(quote.eventName || 'Orçamento')}</h3>
                <div class="event-meta">
                    <span class="card-date">${escapeHtml(formatMoney(quote.finalTotal))}</span>
                </div>
            </div>
            <div class="approved-day-tags">
                ${entryDetails.map((entry) => `<span class="${entry.type === 'event' ? 'tag-event' : 'tag-schedule'}">${escapeHtml(entry.label)}</span>`).join('')}
            </div>
            <div class="approved-day-dates">
                ${entryDetails.map((entry) => `<span><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.datetime || '-')}</span>`).join('')}
            </div>
            <p>${escapeHtml(quote.clientName || '-')}</p>
            <p>${escapeHtml(quote.eventLocation || '-')}</p>
            <div class="event-actions quote-actions">
                <button type="button" onclick="downloadExistingQuotePdf(${quoteId})" class="btn-primary">PDF</button>
                <button type="button" onclick="deleteQuote(${quoteId}, true)" class="btn-danger">Excluir</button>
            </div>`;
        grid.appendChild(card);
    });
}

function renderApprovedQuotes() {
    const calendar = document.getElementById('approvedQuotesCalendar');
    const title = document.getElementById('approvedCalendarTitle');
    if (!calendar || !title) return;

    const year = approvedQuotesCalendarDate.getFullYear();
    const month = approvedQuotesCalendarDate.getMonth();
    const entriesByDate = getApprovedCalendarEntriesByDate();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    title.textContent = `${APPROVED_CALENDAR_MONTHS[month]} ${year}`;
    calendar.innerHTML = '';

    for (let blank = 0; blank < firstDay.getDay(); blank += 1) {
        const empty = document.createElement('div');
        empty.className = 'approved-calendar-day empty';
        calendar.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day);
        const dateKey = getDateKey(date);
        const entriesForDay = entriesByDate.get(dateKey) || [];
        const hasEvent = entriesForDay.some((entry) => entry.type === 'event');
        const hasSchedule = entriesForDay.some((entry) => entry.type === 'assembly' || entry.type === 'disassembly');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `approved-calendar-day ${hasEvent ? 'has-event' : ''} ${hasSchedule ? 'has-schedule' : ''} ${selectedApprovedQuoteDateKey === dateKey ? 'selected' : ''}`.trim();
        const labelsForDay = getApprovedEntryTypesForDay(entriesForDay);
        button.innerHTML = `
            <span class="approved-calendar-number">${day}</span>
            ${entriesForDay.length ? `<span class="approved-calendar-count">${entriesForDay.length}</span>` : ''}
            ${labelsForDay.length ? `
                <span class="approved-calendar-labels">
                    ${labelsForDay.map((entry) => `<span class="calendar-label-${entry.type}">${escapeHtml(entry.label)}</span>`).join('')}
                </span>
            ` : ''}
        `;
        button.addEventListener('click', () => {
            selectedApprovedQuoteDateKey = dateKey;
            renderApprovedQuotes();
            renderApprovedQuoteDayDetails(dateKey, entriesForDay);
        });
        calendar.appendChild(button);
    }

    if (selectedApprovedQuoteDateKey) {
        renderApprovedQuoteDayDetails(selectedApprovedQuoteDateKey, entriesByDate.get(selectedApprovedQuoteDateKey) || []);
    } else {
        renderApprovedQuoteDayDetails('', []);
    }
}

function changeApprovedQuotesMonth(offset) {
    approvedQuotesCalendarDate = new Date(
        approvedQuotesCalendarDate.getFullYear(),
        approvedQuotesCalendarDate.getMonth() + Number(offset || 0),
        1
    );
    selectedApprovedQuoteDateKey = '';
    renderApprovedQuotes();
}

function setStarlinkMessage(message = '', type = '') {
    const messageEl = document.getElementById('starlinkMessage');
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.className = `starlink-message ${type}`.trim();
}

function getStarlinkModelLabel(model) {
    if (model === 'v2') return 'Starlink V2';
    if (model === 'mini') return 'Starlink Mini';
    return 'Starlink Standard';
}

function getStarlinkImage(model) {
    if (model === 'v2') return '/fotos/starlink-grande.png';
    if (model === 'mini') return '/fotos/starlink-mini.png';
    return '/fotos/starlink-standard.png';
}

function formatStarlinkDuration(milliseconds) {
    const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    return `${days}d ${hours}h ${minutes}min`;
}

function getStarlinkActivationTiming(starlink, now = Date.now()) {
    if (!starlink?.isOn || !starlink.activatedAt) return null;

    const activatedAt = Date.parse(starlink.activatedAt);
    if (Number.isNaN(activatedAt)) return null;

    const elapsed = Math.max(0, now - activatedAt);
    const remaining = (30 * 24 * 60 * 60 * 1000) - elapsed;
    if (remaining > 0) {
        const remainingDays = Math.ceil(remaining / (24 * 60 * 60 * 1000));
        return {
            isExpiring: remaining <= (2 * 24 * 60 * 60 * 1000),
            label: `Restam ${remainingDays} ${remainingDays === 1 ? 'dia' : 'dias'}`
        };
    }

    return {
        isExpiring: false,
        label: `Ativada há ${formatStarlinkDuration(elapsed)}.`
    };
}

function updateStarlinkExpirationAlert() {
    const menuItem = document.getElementById('starlinkMenuItem');
    if (!menuItem) return;
    const hasExpiringStarlink = localStarlinks.some((starlink) => getStarlinkActivationTiming(starlink)?.isExpiring);
    menuItem.classList.toggle('starlink-menu-expiring', hasExpiringStarlink);
}

function ensureStarlinkCountdownTimer() {
    if (starlinkCountdownTimer) return;
    starlinkCountdownTimer = window.setInterval(() => {
        if (localStarlinks.some((starlink) => starlink.isOn)) renderLocalStarlinks();
    }, 30000);
}

function renderLocalStarlinks() {
    const container = document.getElementById('starlinkList');
    if (!container) return;

    const selectedModelStarlinks = localStarlinks
        .filter((starlink) => (
            starlink.model === activeStarlinkModel
            || (activeStarlinkModel === 'mini' && starlink.model === 'other')
        ))
        .sort((first, second) => {
            if (activeStarlinkModel !== 'mini') return 0;
            return (first.model === 'other') - (second.model === 'other');
        });
    const normalizedSearchTerm = starlinkNumberSearchTerm.trim().toLowerCase();
    const visibleStarlinks = normalizedSearchTerm
        ? localStarlinks.filter((starlink) => String(starlink.stockNumber || '').toLowerCase().includes(normalizedSearchTerm))
        : selectedModelStarlinks;
    document.querySelectorAll('.starlink-filter').forEach((button) => {
        button.classList.toggle('active', button.dataset.starlinkFilter === activeStarlinkModel);
    });
    updateStarlinkExpirationAlert();

    if (visibleStarlinks.length === 0) {
        container.innerHTML = normalizedSearchTerm
            ? '<p class="empty-state">Nenhuma Starlink encontrada com esse número.</p>'
            : '<p class="empty-state">Nenhuma Starlink deste modelo encontrada no estoque local.</p>';
        return;
    }

    container.innerHTML = '';
    visibleStarlinks.forEach((starlink) => {
        const image = getStarlinkImage(starlink.model);
        const isOn = !!starlink.isOn;
        const selectedPlan = starlink.selectedPlan || (isOn ? '' : 'Modo espera');
        const timing = getStarlinkActivationTiming(starlink);
        const card = document.createElement('article');
        card.className = `starlink-card ${isOn ? 'is-on' : 'is-off'} ${timing?.isExpiring ? 'is-expiring' : ''}`;
        card.innerHTML = `
            <div class="starlink-device ${image ? '' : 'without-image'}">
                ${image
                    ? `<img src="${image}" alt="${escapeHtml(getStarlinkModelLabel(starlink.model))}">`
                    : '<span aria-hidden="true">◉</span>'}
            </div>
            <div class="starlink-card-content">
                <span class="starlink-model">${escapeHtml(getStarlinkModelLabel(starlink.model))}</span>
                <h2>Starlink nº ${escapeHtml(starlink.stockNumber)}</h2>
                <p>${escapeHtml(starlink.name)}</p>
                ${selectedPlan
                    ? `<p class="starlink-selected-plan ${isOn ? 'is-active' : 'is-waiting'}">Plano: ${escapeHtml(selectedPlan)}</p>`
                    : ''}
                ${timing ? `<p class="starlink-timer ${timing.isExpiring ? 'is-expiring' : ''}">${escapeHtml(timing.label)}</p>` : ''}
            </div>
            <div class="starlink-controls" aria-label="Status da Starlink número ${escapeHtml(starlink.stockNumber)}">
                <span class="starlink-status ${isOn ? 'on' : 'off'}">${isOn ? 'ON' : 'OFF'}</span>
                <div class="starlink-toggle-buttons">
                    <button type="button" class="starlink-toggle on ${isOn ? 'active' : ''}" data-starlink-id="${Number(starlink.equipmentId)}" data-starlink-status="on">ON</button>
                    <button type="button" class="starlink-toggle off ${!isOn ? 'active' : ''}" data-starlink-id="${Number(starlink.equipmentId)}" data-starlink-status="off">OFF</button>
                </div>
                ${isOn
                    ? `<button type="button" class="starlink-cancel-activation" data-starlink-id="${Number(starlink.equipmentId)}">Cancelar ativação</button>`
                    : ''}
            </div>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll('.starlink-toggle').forEach((button) => {
        button.addEventListener('click', () => {
            const equipmentId = Number(button.dataset.starlinkId);
            if (button.dataset.starlinkStatus === 'on') {
                openStarlinkPlanModal(equipmentId);
                return;
            }
            openStarlinkCancelModal(equipmentId);
        });
    });

    container.querySelectorAll('.starlink-cancel-activation').forEach((button) => {
        button.addEventListener('click', () => {
            cancelStarlinkActivation(Number(button.dataset.starlinkId));
        });
    });
}

function searchLocalStarlinksByNumber() {
    const input = document.getElementById('starlinkNumberSearch');
    starlinkNumberSearchTerm = String(input?.value || '').replace(/\s+/g, '');
    renderLocalStarlinks();
}

function setActiveStarlinkModel(model) {
    if (!['v2', 'mini'].includes(model)) return;
    activeStarlinkModel = model;
    setStarlinkMessage('');
    renderLocalStarlinks();
}

async function loadLocalStarlinks() {
    if (!canAccessSection('starlink')) return;
    setStarlinkMessage('');

    try {
        const response = await fetch('/api/local-starlinks', { credentials: 'include' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setStarlinkMessage(data.error || 'Não foi possível carregar as Starlinks.', 'error');
            return;
        }

        localStarlinks = Array.isArray(data.starlinks) ? data.starlinks : [];
        renderLocalStarlinks();
        ensureStarlinkCountdownTimer();
    } catch (error) {
        console.error(error);
        setStarlinkMessage('Erro de conexão ao carregar as Starlinks.', 'error');
    }
}

function openStarlinkPlanModal(equipmentId) {
    const normalizedId = Number(equipmentId);
    const starlink = localStarlinks.find((item) => Number(item.equipmentId) === normalizedId);
    const modal = document.getElementById('starlinkPlanModal');
    const subtitle = document.getElementById('starlinkPlanModalSubtitle');
    const options = document.getElementById('starlinkPlanOptions');
    const confirmButton = document.getElementById('confirmStarlinkPlanButton');
    if (!starlink || !modal || !subtitle || !options || !confirmButton) return;

    pendingStarlinkPlanActivation = { equipmentId: normalizedId, plan: '' };
    subtitle.textContent = `Selecione o plano para a Starlink nº ${starlink.stockNumber}.`;
    options.innerHTML = LOCAL_STARLINK_PLANS.map((plan) => `
        <label class="starlink-plan-option">
            <input type="radio" name="starlinkPlan" value="${escapeHtml(plan)}">
            <span>${escapeHtml(plan)}</span>
        </label>
    `).join('');
    confirmButton.disabled = true;
    options.querySelectorAll('input[name="starlinkPlan"]').forEach((input) => {
        input.addEventListener('change', () => {
            pendingStarlinkPlanActivation.plan = input.value;
            confirmButton.disabled = false;
        });
    });
    modal.style.display = 'flex';
}

function closeStarlinkPlanModal() {
    const modal = document.getElementById('starlinkPlanModal');
    if (modal) modal.style.display = 'none';
    pendingStarlinkPlanActivation = null;
}

async function confirmStarlinkPlan() {
    const pending = pendingStarlinkPlanActivation;
    if (!pending?.plan) return;

    const confirmButton = document.getElementById('confirmStarlinkPlanButton');
    if (confirmButton) confirmButton.disabled = true;
    const updated = await setLocalStarlinkStatus(pending.equipmentId, true, pending.plan);
    if (updated) closeStarlinkPlanModal();
    else if (confirmButton) confirmButton.disabled = false;
}

function cancelStarlinkActivation(equipmentId) {
    openStarlinkCancelModal(equipmentId);
}

function openStarlinkCancelModal(equipmentId) {
    const normalizedId = Number(equipmentId);
    const starlink = localStarlinks.find((item) => Number(item.equipmentId) === normalizedId);
    const modal = document.getElementById('starlinkCancelModal');
    const message = document.getElementById('starlinkCancelModalMessage');
    if (!starlink || !modal || !message) return;

    pendingStarlinkCancellationId = normalizedId;
    message.textContent = `Deseja realmente cancelar a ativação da Starlink nº ${starlink.stockNumber}? Ela ficará em Modo espera.`;
    modal.style.display = 'flex';
}

function closeStarlinkCancelModal() {
    const modal = document.getElementById('starlinkCancelModal');
    if (modal) modal.style.display = 'none';
    pendingStarlinkCancellationId = null;
}

async function confirmStarlinkCancellation() {
    const equipmentId = pendingStarlinkCancellationId;
    if (!equipmentId) return;

    const confirmButton = document.getElementById('confirmStarlinkCancellationButton');
    if (confirmButton) confirmButton.disabled = true;
    const updated = await setLocalStarlinkStatus(equipmentId, false);
    if (updated) closeStarlinkCancelModal();
    else if (confirmButton) confirmButton.disabled = false;
}

async function setLocalStarlinkStatus(equipmentId, isOn, plan = null) {
    const normalizedId = Number(equipmentId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) return false;

    try {
        const response = await fetch(`/api/local-starlinks/${normalizedId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(isOn ? { isOn, plan } : { isOn })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setStarlinkMessage(data.error || 'Não foi possível atualizar o status.', 'error');
            return false;
        }

        localStarlinks = localStarlinks.map((starlink) => (
            Number(starlink.equipmentId) === normalizedId ? data.starlink : starlink
        ));
        renderLocalStarlinks();
        const statusMessage = data.starlink.isOn
            ? `Starlink nº ${data.starlink.stockNumber} ativada com o plano ${data.starlink.selectedPlan}.`
            : `Ativação da Starlink nº ${data.starlink.stockNumber} cancelada; ela ficou em Modo espera.`;
        setStarlinkMessage(statusMessage, 'success');
        return true;
    } catch (error) {
        console.error(error);
        setStarlinkMessage('Erro de conexão ao atualizar o status.', 'error');
        return false;
    }
}

async function loadQuotes() {
    if (!canAccessQuotes()) return;

    try {
        const response = await fetch('/api/orcamentos?status=pending', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Não foi possível carregar os orçamentos.');
            return;
        }

        allQuotes = Array.isArray(data.quotes) ? data.quotes : [];
        renderQuotes(allQuotes, getQuoteSearchValue());
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function loadApprovedQuotes() {
    if (!canAccessQuotes()) return;

    try {
        const response = await fetch('/api/orcamentos?status=approved', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Não foi possível carregar os orçamentos aprovados.');
            return;
        }

        allApprovedQuotes = Array.isArray(data.quotes) ? data.quotes : [];
        const currentMonth = `${approvedQuotesCalendarDate.getFullYear()}-${String(approvedQuotesCalendarDate.getMonth() + 1).padStart(2, '0')}`;
        const approvedDateKeys = allApprovedQuotes
            .flatMap((quote) => getApprovedQuoteCalendarEntries(quote).map((entry) => entry.dateKey))
            .filter(Boolean);
        const hasEventInCurrentMonth = approvedDateKeys.some((dateKey) => dateKey.startsWith(currentMonth));
        if (!hasEventInCurrentMonth) {
            const firstEventDateKey = approvedDateKeys.sort()[0];
            const match = firstEventDateKey?.match(/^(\d{4})-(\d{2})-/);
            if (match) {
                approvedQuotesCalendarDate = new Date(Number(match[1]), Number(match[2]) - 1, 1);
            }
        }
        renderApprovedQuotes();
        renderManagedApprovedQuotes(allApprovedQuotes, getManagedApprovedQuoteSearchValue());
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

function showQuoteAvailabilityWarnings(warnings) {
    const items = Array.isArray(warnings)
        ? warnings.filter((item) => Number(item?.forecastDeficit ?? item?.deficit) > 0)
        : [];
    if (!items.length) return;
    const lines = items.map((item) => (
        `${item.equipmentName || 'Equipamento'}: solicitado ${Number(item.requestedQuantity) || 0}, `
        + `disponibilidade prevista ${Number(item.forecastAvailableQuantity ?? item.availableQuantity) || 0}, `
        + `déficit ${Number(item.forecastDeficit ?? item.deficit) || 0}.`
    ));
    alert(`Operação concluída normalmente.\n\nAtenção de estoque:\n${lines.join('\n')}`);
}

function openQuoteApprovalDestinationModal(quoteId) {
    const normalizedQuoteId = Number(quoteId);
    if (!Number.isInteger(normalizedQuoteId) || normalizedQuoteId <= 0) return;

    pendingQuoteApprovalId = normalizedQuoteId;
    const modal = document.getElementById('quoteApprovalDestinationModal');
    if (modal) modal.style.display = 'flex';
}

function closeQuoteApprovalDestinationModal() {
    pendingQuoteApprovalId = null;
    const modal = document.getElementById('quoteApprovalDestinationModal');
    if (modal) modal.style.display = 'none';
}

async function approveQuoteWithDestination(destinationType) {
    const quoteId = Number(pendingQuoteApprovalId);
    const normalizedDestination = String(destinationType || '').trim().toLowerCase();
    if (!Number.isInteger(quoteId) || quoteId <= 0) return;
    if (!['event', 'rental'].includes(normalizedDestination)) return;

    const actionButtons = document.querySelectorAll('#quoteApprovalDestinationModal [data-approval-destination]');
    actionButtons.forEach((button) => { button.disabled = true; });

    try {
        const response = await fetch(`/api/orcamentos/${quoteId}/pronto`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destinationType: normalizedDestination }),
            credentials: 'include'
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            alert(data.error || 'Não foi possível aprovar o orçamento.');
            return;
        }

        closeQuoteApprovalDestinationModal();
        await loadQuotes();
        await loadApprovedQuotes();
        if (normalizedDestination === 'rental') {
            await loadRentalEvents();
        } else {
            await loadEvents();
        }
        showQuoteAvailabilityWarnings(data.availabilityWarnings);
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    } finally {
        actionButtons.forEach((button) => { button.disabled = false; });
    }
}

function markQuoteReady(quoteId) {
    openQuoteApprovalDestinationModal(quoteId);
}

async function deleteQuote(quoteId, approved = false) {
    const message = approved
        ? 'Excluir este orçamento aprovado? Os equipamentos agendados voltarão para disponível.'
        : 'Excluir este orçamento? Os equipamentos agendados voltarão para disponível.';
    if (!confirm(message)) return;

    try {
        const response = await fetch(`/api/orcamentos/${Number(quoteId)}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            alert(data.error || 'Não foi possível excluir o orçamento.');
            return;
        }

        await loadQuotes();
        await loadApprovedQuotes();
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function confirmQuoteEventDateConflict() {
    const eventDatetime = document.getElementById('quoteEventDatetime')?.value || '';
    const eventDateKeys = getQuoteDateRangeKeys(eventDatetime);
    if (!eventDateKeys.length) return true;

    const conflictsById = new Map();

    try {
        for (const eventDateKey of eventDateKeys) {
            const params = new URLSearchParams({ date: eventDateKey });
            if (editingQuoteId) {
                params.set('excludeId', String(Number(editingQuoteId)));
            }

            const response = await fetch(`/api/orcamentos/date-conflicts?${params.toString()}`, {
                credentials: 'include'
            });

            if (response.status === 401) {
                window.location.href = '/login.html';
                return false;
            }

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                return true;
            }

            (Array.isArray(data.conflicts) ? data.conflicts : []).forEach((quote) => {
                const quoteId = Number(quote.id);
                if (!conflictsById.has(quoteId)) {
                    conflictsById.set(quoteId, { ...quote, conflictDates: [] });
                }
                conflictsById.get(quoteId).conflictDates.push(eventDateKey);
            });
        }

        const conflicts = Array.from(conflictsById.values());
        if (conflicts.length === 0) return true;

        const firstDateLabel = getApprovedDateLabel(eventDateKeys[0]);
        const lastDateLabel = getApprovedDateLabel(eventDateKeys[eventDateKeys.length - 1]);
        const dateLabel = eventDateKeys.length === 1
            ? firstDateLabel
            : `${firstDateLabel} até ${lastDateLabel}`;
        const conflictLines = conflicts.slice(0, 5).map((quote) => {
            const status = quote.status === 'approved' ? 'aprovado' : 'pendente';
            const dates = [...new Set(quote.conflictDates || [])]
                .map((dateKey) => getApprovedDateLabel(dateKey))
                .join(', ');
            return `- ${quote.eventName || 'Orçamento'} | Cliente: ${quote.clientName || '-'} | Data(s): ${dates || dateLabel} | ${status}`;
        }).join('\n');
        const extraCount = conflicts.length > 5
            ? `\n... e mais ${conflicts.length - 5} orçamento(s).`
            : '';
        const conflictText = conflicts.length === 1
            ? 'já existe 1 evento'
            : `já existem ${conflicts.length} eventos`;

        return confirm(
            `Atenção: ${conflictText} no período ${dateLabel}.\n\n` +
            `${conflictLines}${extraCount}\n\n` +
            'Pode haver montagem no mesmo dia em que estiver acontecendo outro evento. Este aviso é apenas para eventos na mesma data.\n\n' +
            `Deseja continuar ${editingQuoteId ? 'salvando' : 'criando'} este orçamento?`
        );
    } catch (error) {
        console.error(error);
        return true;
    }
}

function getGeneratedQuotePdfFilename(contentDisposition, quoteId) {
    const fallbackFilename = `orcamento-${Number(quoteId) || 'novo'}.pdf`;
    const header = String(contentDisposition || '');
    const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (encodedMatch) {
        try {
            return decodeURIComponent(encodedMatch[1]);
        } catch {
            // Continua para o nome ASCII enviado no mesmo cabeçalho.
        }
    }

    const fallbackMatch = header.match(/filename="([^"]+)"/i);
    return fallbackMatch?.[1] || fallbackFilename;
}

async function downloadGeneratedQuotePdf(quoteId, quoteOverrides = {}) {
    const normalizedQuoteId = Number(quoteId);
    if (!Number.isInteger(normalizedQuoteId) || normalizedQuoteId <= 0) {
        throw new Error('Orçamento criado sem identificador válido.');
    }
    if (!window.QuotePdfClient?.downloadQuotePdf) {
        throw new Error('O gerador de PDF não foi carregado. Atualize a página e tente novamente.');
    }
    await window.QuotePdfClient.downloadQuotePdf(normalizedQuoteId, quoteOverrides);
}

async function downloadExistingQuotePdf(quoteId) {
    try {
        await downloadGeneratedQuotePdf(quoteId);
    } catch (error) {
        console.error(error);
        const message = error instanceof Error
            ? error.message
            : 'Não foi possível baixar o PDF.';
        alert(`Não foi possível baixar o PDF: ${message}`);
    }
}

async function createQuote() {
    if (!validateQuoteMaskedFields()) {
        return;
    }

    if (quoteItems.length === 0) {
        alert('Adicione pelo menos um item ao orçamento.');
        return;
    }

    const isEditing = Number.isInteger(Number(editingQuoteId)) && Number(editingQuoteId) > 0;
    const isApprovedEdit = isEditing && editingQuoteStatus === 'approved';
    const canContinue = await confirmQuoteEventDateConflict();
    if (!canContinue) {
        return;
    }

    const submitButton = document.getElementById('quoteSubmitButton');
    const submitButtonText = submitButton?.textContent || 'Gerar PDF';
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Gerando PDF...';
    }

    try {
        const response = await fetch(isEditing ? `/api/orcamentos/${Number(editingQuoteId)}` : '/api/orcamentos', {
            method: isEditing ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(getQuotePayload())
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (showAvailabilityConflictModal(data.conflict)) {
                return;
            }
            alert(data.error || 'Não foi possível gerar o orçamento.');
            return;
        }

        const availabilityWarnings = Array.isArray(data.availabilityWarnings) ? data.availabilityWarnings : [];
        let pdfError = null;
        try {
            await downloadGeneratedQuotePdf(data.id, {
                showServicesPrice: !!document.getElementById('quoteShowServicesPrice')?.checked
            });
        } catch (error) {
            console.error(error);
            pdfError = error;
        }

        quoteScheduledEquipmentIds.clear();
        resetQuoteForm();
        showSection(isApprovedEdit ? 'gerenciarOrcamentos' : 'orcamentos');
        if (isApprovedEdit) {
            await loadApprovedQuotes();
            alert(pdfError
                ? `Orçamento aprovado atualizado, mas o PDF não foi baixado: ${pdfError.message}`
                : 'Orçamento aprovado atualizado. O novo PDF foi gerado.');
        } else {
            await loadQuotes();
            if (pdfError) {
                alert(`Orçamento salvo, mas o PDF não foi baixado: ${pdfError.message}`);
            }
        }
        showQuoteAvailabilityWarnings(availabilityWarnings);
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = submitButtonText;
        }
    }
}

function getLocalDateString(date = new Date()) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
}

function getDismissedRentalAlertKey(today = getLocalDateString()) {
    return `dismissed_rental_return_alerts_${today}`;
}

function getDismissedRentalAlertIds(today = getLocalDateString()) {
    try {
        const parsed = JSON.parse(localStorage.getItem(getDismissedRentalAlertKey(today)) || '[]');
        return Array.isArray(parsed)
            ? parsed.map((id) => Number(id)).filter((id) => Number.isFinite(id))
            : [];
    } catch {
        return [];
    }
}

function setDismissedRentalAlertIds(ids, today = getLocalDateString()) {
    const cleanIds = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
    localStorage.setItem(getDismissedRentalAlertKey(today), JSON.stringify(cleanIds));
}

function setRentalMenuAlertState(hasAlerts) {
    document.getElementById('rentalMenuItem')?.classList.toggle('rental-return-pulse', hasAlerts);
}

function getRentalAlertItemText(item) {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const prefix = quantity > 1 ? `${quantity}x ` : '';
    const barcode = item.barcode ? ` (${item.barcode})` : '';
    const typeLabel = item.type === 'cable'
        ? 'Cabo'
        : (item.type === 'other' ? 'Item' : 'Equipamento');
    return `${typeLabel}: ${prefix}${item.name || 'Sem nome'}${barcode}`;
}

function renderRentalReturnAlert() {
    const container = document.getElementById('rentalReturnAlert');
    const hasAlerts = rentalReturnAlerts.length > 0;
    setRentalMenuAlertState(hasAlerts);
    if (!container) return;

    const today = getLocalDateString();
    const dismissedIds = new Set(getDismissedRentalAlertIds(today));
    const visibleAlerts = rentalReturnAlerts.filter((event) => !dismissedIds.has(Number(event.id)));

    if (visibleAlerts.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    const alertList = visibleAlerts.map((event) => {
        const pendingItems = Array.isArray(event.pendingItems) ? event.pendingItems : [];
        const pendingHtml = pendingItems.length > 0
            ? pendingItems.map((item) => `<li>${escapeHtml(getRentalAlertItemText(item))}</li>`).join('')
            : '<li>Itens com saída pendente nesta locação.</li>';

        return `
            <div class="rental-alert-event">
                <div class="rental-alert-event-title">
                    <span>${escapeHtml(event.name)}</span>
                    <span>Devolução: ${escapeHtml(formatDate(event.return_date))}</span>
                </div>
                <ul class="rental-alert-items">${pendingHtml}</ul>
                <button type="button" class="btn-primary btn-small" onclick="window.location.href='/event.html?id=${Number(event.id)}&type=rental'">Gerenciar</button>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="rental-return-alert-header">
            <div>
                <h2>Data de devolução de locação chegou</h2>
                <p>Existem equipamentos ou itens com saída pendente em locação vencida ou vencendo hoje.</p>
            </div>
            <button type="button" class="btn-secondary rental-alert-close" onclick="closeRentalReturnAlert()">Fechar</button>
        </div>
        <div class="rental-alert-list">${alertList}</div>
    `;
    container.style.display = 'block';
}

function closeRentalReturnAlert() {
    const today = getLocalDateString();
    const dismissedIds = getDismissedRentalAlertIds(today);
    setDismissedRentalAlertIds([
        ...dismissedIds,
        ...rentalReturnAlerts.map((event) => Number(event.id))
    ], today);
    renderRentalReturnAlert();
}

async function loadRentalReturnAlerts() {
    try {
        const today = getLocalDateString();
        const response = await fetch(`/api/rental-return-alerts?today=${encodeURIComponent(today)}`, {
            credentials: 'include'
        });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        if (!response.ok) return;

        rentalReturnAlerts = await response.json();
        renderRentalReturnAlert();
    } catch (error) {
        console.error(error);
    }
}

function searchEquipments() {
    searchDatabase();
}

function setCadastroTab(tab) {
    activeCadastroTab = ['cabos', 'outros'].includes(tab) ? tab : 'equipamentos';

    const title = document.getElementById('cadastroTitle');
    const equipmentButton = document.getElementById('cadastroEquipamentosTabButton');
    const cableButton = document.getElementById('cadastroCabosTabButton');
    const otherButton = document.getElementById('cadastroOutrosTabButton');
    const equipmentView = document.getElementById('cadastroEquipamentosView');
    const cableView = document.getElementById('cadastroCabosView');
    const otherView = document.getElementById('cadastroOutrosView');

    if (title) {
        title.textContent = activeCadastroTab === 'cabos'
            ? 'Cadastro de Cabos'
            : (activeCadastroTab === 'outros' ? 'Cadastro de Outros Itens' : 'Cadastro de Equipamento');
    }

    if (equipmentButton) equipmentButton.classList.toggle('active', activeCadastroTab === 'equipamentos');
    if (cableButton) cableButton.classList.toggle('active', activeCadastroTab === 'cabos');
    if (otherButton) otherButton.classList.toggle('active', activeCadastroTab === 'outros');
    if (equipmentView) equipmentView.classList.toggle('active', activeCadastroTab === 'equipamentos');
    if (cableView) cableView.classList.toggle('active', activeCadastroTab === 'cabos');
    if (otherView) otherView.classList.toggle('active', activeCadastroTab === 'outros');
}

function setBancoTab(tab) {
    window.clearTimeout(databaseSearchTimer);
    databaseSearchTimer = null;
    activeBancoTab = ['cabos', 'outros'].includes(tab) ? tab : 'equipamentos';

    const title = document.getElementById('databaseTitle');
    const searchInput = document.getElementById('searchInput');
    const equipmentButton = document.getElementById('equipamentosTabButton');
    const cableButton = document.getElementById('cabosTabButton');
    const otherButton = document.getElementById('outrosTabButton');
    const equipmentView = document.getElementById('equipamentosDatabaseView');
    const cableView = document.getElementById('cabosDatabaseView');
    const otherView = document.getElementById('outrosDatabaseView');

    if (title) {
        const baseTitle = activeBancoTab === 'cabos'
            ? 'Banco de Dados de Cabos'
            : (activeBancoTab === 'outros' ? 'Banco de Dados de Outros Itens' : 'Banco de Dados de Equipamentos');
        title.textContent = baseTitle;
    }

    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = activeBancoTab === 'cabos'
            ? 'Buscar cabo...'
            : (activeBancoTab === 'outros' ? 'Buscar item...' : 'Buscar equipamento...');
    }

    if (equipmentButton) equipmentButton.classList.toggle('active', activeBancoTab === 'equipamentos');
    if (cableButton) cableButton.classList.toggle('active', activeBancoTab === 'cabos');
    if (otherButton) otherButton.classList.toggle('active', activeBancoTab === 'outros');
    if (equipmentView) equipmentView.classList.toggle('active', activeBancoTab === 'equipamentos');
    if (cableView) cableView.classList.toggle('active', activeBancoTab === 'cabos');
    if (otherView) otherView.classList.toggle('active', activeBancoTab === 'outros');

    if (activeBancoTab === 'cabos') {
        loadCables();
        return;
    }

    if (activeBancoTab === 'outros') {
        loadOtherItems();
        return;
    }

    loadEquipments();
}

function setMaintenanceTab(tab) {
    activeMaintenanceTab = tab === 'cabos' ? 'cabos' : 'equipamentos';

    const equipmentButton = document.getElementById('maintenanceEquipamentosTabButton');
    const cableButton = document.getElementById('maintenanceCabosTabButton');
    const equipmentView = document.getElementById('maintenanceEquipamentosView');
    const cableView = document.getElementById('maintenanceCabosView');

    if (equipmentButton) equipmentButton.classList.toggle('active', activeMaintenanceTab === 'equipamentos');
    if (cableButton) cableButton.classList.toggle('active', activeMaintenanceTab === 'cabos');
    if (equipmentView) equipmentView.classList.toggle('active', activeMaintenanceTab === 'equipamentos');
    if (cableView) cableView.classList.toggle('active', activeMaintenanceTab === 'cabos');

    clearMaintenance();

    if (activeMaintenanceTab === 'cabos') {
        loadMaintenanceCables();
        return;
    }

    loadMaintenanceEquipments();
}

function cancelEquipmentForm() {
    document.getElementById('equipmentForm')?.reset();
    populateCategoryOptions();
    showSection('home');
}

function cancelEventForm() {
    document.getElementById('eventForm')?.reset();
    showSection('home');
}

function openRentalModal() {
    const modal = document.getElementById('rentalModal');
    if (modal) modal.style.display = 'flex';
}

function closeRentalModal() {
    document.getElementById('rentalForm')?.reset();
    const modal = document.getElementById('rentalModal');
    if (modal) modal.style.display = 'none';
}

function cancelCableForm() {
    document.getElementById('cableForm')?.reset();
    const quantityInput = document.getElementById('cableQuantity');
    if (quantityInput) quantityInput.value = '';
    populateCableCategoryOptions();
    setCadastroTab('cabos');
}

function cancelOtherItemForm() {
    document.getElementById('otherItemForm')?.reset();
    const quantityInput = document.getElementById('otherItemQuantity');
    if (quantityInput) quantityInput.value = '';
    setCadastroTab('outros');
}

function getDateKeyDayNumber(value) {
    const dateKey = String(value || '').trim().slice(0, 10);
    const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        return null;
    }

    return Math.floor(timestamp / 86400000);
}

function getTodayDateKeyInSaoPaulo() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function getScheduledAssemblyAlertDays(event) {
    if (currentUser?.role !== 'user' || !event?.isScheduled) return null;

    const assemblyDay = getDateKeyDayNumber(event.date);
    const today = getDateKeyDayNumber(getTodayDateKeyInSaoPaulo());
    if (assemblyDay === null || today === null) return null;

    const daysUntilAssembly = assemblyDay - today;
    return daysUntilAssembly >= 0 && daysUntilAssembly <= 3
        ? daysUntilAssembly
        : null;
}

function getScheduledAssemblyAlertLabel(daysUntilAssembly) {
    if (daysUntilAssembly === 0) return 'Montagem hoje';
    if (daysUntilAssembly === 1) return 'Montagem amanhã';
    return `Montagem em ${daysUntilAssembly} dias`;
}

function normalizeScheduledEvent(event) {
    return {
        ...event,
        end_date: event.endDate || event.end_date || event.date,
        isScheduled: true
    };
}

function renderEvents(events, search = '') {
    const grid = document.getElementById('eventsGrid');
    if (!grid) return;

    const normalizedSearch = String(search || '').trim().toLowerCase();
    const filtered = events.filter((event) => {
        if (!normalizedSearch) return true;
        return [
            event.name,
            event.quoteEventName,
            event.clientName,
            event.status,
            formatEventPeriod(event.date, event.end_date || event.endDate)
        ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });

    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = '<p class="empty-state">Nenhum evento encontrado.</p>';
        return;
    }

    filtered.forEach((event) => {
        const eventId = Number(event.id);
        const quoteId = Number(event.quoteId);
        const isScheduled = event.isScheduled === true;
        const alertDays = getScheduledAssemblyAlertDays(event);
        const hasAssemblyAlert = alertDays !== null;
        const assemblyAlertLabel = hasAssemblyAlert
            ? getScheduledAssemblyAlertLabel(alertDays)
            : '';
        const card = document.createElement('div');
        card.className = [
            'event-card',
            isScheduled ? 'scheduled-event-card' : '',
            hasAssemblyAlert ? 'event-assembly-alert' : ''
        ].filter(Boolean).join(' ');
        if (hasAssemblyAlert) {
            card.setAttribute('aria-label', `${event.name || 'Evento'}. ${assemblyAlertLabel}.`);
        }
        card.innerHTML = `
            <div class="card-top">
                <h3>${escapeHtml(event.name || 'Evento')}</h3>
                <div class="event-meta">
                    ${event.created_by_username ? `<span class="event-created-by">${escapeHtml(event.created_by_username)}</span>` : ''}
                    ${isScheduled ? `<span class="status-badge badge-scheduled">${escapeHtml(event.status || 'Agendado')}</span>` : ''}
                    ${hasAssemblyAlert ? `<span class="status-badge badge-assembly-alert">${escapeHtml(assemblyAlertLabel)}</span>` : ''}
                    <span class="card-date">${escapeHtml(formatEventPeriod(event.date, event.end_date || event.endDate))}</span>
                </div>
            </div>
            ${isScheduled ? `
                <div class="scheduled-event-details">
                    <p><strong>Orçamento:</strong> ${escapeHtml(event.quoteEventName || `#${quoteId}`)}</p>
                    <p><strong>Cliente:</strong> ${escapeHtml(event.clientName || '-')}</p>
                </div>
            ` : ''}
            <div class="event-actions">
                <button onclick="window.location.href='/event.html?id=${eventId}'" class="btn-primary">Gerenciar</button>
                ${isScheduled
                    ? `<button type="button" onclick="downloadExistingQuotePdf(${quoteId})" class="btn-secondary">PDF</button>`
                    : `<button onclick="deleteEvent(${eventId})" class="btn-danger">Excluir</button>`}
            </div>`;
        grid.appendChild(card);
    });
}

async function loadEvents() {
    try {
        const [eventsResponse, scheduledResponse] = await Promise.all([
            fetch('/api/events', { credentials: 'include' }),
            fetch('/api/scheduled-events', { credentials: 'include' })
        ]);
        if (eventsResponse.status === 401 || scheduledResponse.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const eventData = await eventsResponse.json().catch(() => []);
        if (!eventsResponse.ok) {
            throw new Error(eventData?.error || 'Não foi possível carregar os eventos.');
        }

        const scheduledData = await scheduledResponse.json().catch(() => ({}));
        const scheduledEvents = scheduledResponse.ok && Array.isArray(scheduledData.events)
            ? scheduledData.events.map(normalizeScheduledEvent)
            : [];
        if (!scheduledResponse.ok) {
            console.error(scheduledData?.error || 'Não foi possível carregar os eventos agendados.');
        }

        const regularEvents = Array.isArray(eventData)
            ? eventData.map((event) => ({ ...event, isScheduled: false }))
            : [];
        allEvents = [...scheduledEvents, ...regularEvents];
        renderEvents(allEvents, getEventSearchValue());
    } catch (error) {
        console.error(error);
    }
}

function getOperatorInitials(name) {
    return String(name || 'OP')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'OP';
}

function getOperatorPhotoMarkup(operator, className = 'operator-card-photo') {
    const photo = String(operator?.photo || '');
    const name = String(operator?.fullName || 'Técnico');
    if (photo) {
        return `<img class="${className}" src="${escapeHtml(photo)}" alt="Foto de ${escapeHtml(name)}">`;
    }

    const placeholderClass = className === 'operator-details-photo'
        ? 'operator-details-photo operator-photo-placeholder'
        : 'operator-photo-placeholder';
    return `<div class="${placeholderClass}">${escapeHtml(getOperatorInitials(name))}</div>`;
}

function renderOperators(operators, search = '') {
    const grid = document.getElementById('operatorsGrid');
    if (!grid) return;

    const normalizedSearch = String(search || '').trim().toLowerCase();
    const filtered = (operators || []).filter((operator) => {
        if (!normalizedSearch) return true;
        return [
            operator.fullName,
            operator.motherName,
            operator.cpf,
            operator.rg,
            operator.email,
            operator.phone,
            operator.area,
            operator.pix,
            operator.agency,
            operator.hasVehicle ? 'sim' : 'nao'
        ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });

    grid.innerHTML = '';
    if (filtered.length === 0) {
        grid.innerHTML = '<p class="empty-state">Nenhum técnico encontrado.</p>';
        return;
    }

    filtered.forEach((operator) => {
        const operatorId = Number(operator.id);
        const card = document.createElement('div');
        card.className = 'event-card operator-card';
        card.innerHTML = `
            <div class="operator-card-header">
                ${getOperatorPhotoMarkup(operator)}
                <div class="operator-card-info">
                    <h3>${escapeHtml(operator.fullName)}</h3>
                    <p>Área: ${escapeHtml(operator.area || '-')}</p>
                    <p>CPF: ${escapeHtml(operator.cpf)}</p>
                    <p>RG: ${escapeHtml(operator.rg || '-')}</p>
                    <p>Celular: ${escapeHtml(operator.phone)}</p>
                    <p>Automóvel: ${operator.hasVehicle ? 'Sim' : 'Não'}</p>
                    <p>Cachê: ${escapeHtml(formatMoney(operator.cacheValue))}</p>
                </div>
            </div>
            <div class="event-actions operator-actions">
                <button type="button" class="btn-primary" onclick="openOperatorDetails(${operatorId})">Visualizar</button>
                <button type="button" class="btn-secondary" onclick="openOperatorFormModal(${operatorId})">Editar</button>
                <button type="button" class="btn-danger" onclick="deleteOperator(${operatorId})">Excluir</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function loadOperators() {
    if (!canAccessOperators()) return;

    try {
        const response = await fetch(`/api/operators?search=${encodeURIComponent(getOperatorSearchValue())}`, {
            credentials: 'include'
        });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Não foi possível carregar os técnicos.');
            return;
        }

        allOperators = Array.isArray(data.operators) ? data.operators : [];
        renderOperators(allOperators, getOperatorSearchValue());
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

function updateOperatorPhotoPreview(photo) {
    const preview = document.getElementById('operatorPhotoPreview');
    if (!preview) return;

    if (photo) {
        preview.classList.remove('empty');
        preview.innerHTML = `<img src="${escapeHtml(photo)}" alt="Foto do técnico">`;
        return;
    }

    preview.classList.add('empty');
    preview.textContent = 'Foto';
}

function getOnlyDigits(value, maxLength) {
    return String(value || '').replace(/\D/g, '').slice(0, maxLength);
}

function formatCpfInput(value) {
    const digits = getOnlyDigits(value, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhoneInput(value) {
    const digits = getOnlyDigits(value, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function setupOperatorInputMasks() {
    const cpfInput = document.getElementById('operatorCpf');
    const phoneInput = document.getElementById('operatorPhone');

    cpfInput?.addEventListener('input', () => {
        cpfInput.value = formatCpfInput(cpfInput.value);
    });

    phoneInput?.addEventListener('input', () => {
        phoneInput.value = formatPhoneInput(phoneInput.value);
    });
}

function resizeOperatorPhoto(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve('');
            return;
        }

        if (!String(file.type || '').startsWith('image/')) {
            reject(new Error('Selecione um arquivo de imagem.'));
            return;
        }

        if (file.size > 8 * 1024 * 1024) {
            reject(new Error('A foto deve ter no maximo 8 MB.'));
            return;
        }

        const image = new Image();
        const objectUrl = URL.createObjectURL(file);
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            const maxSize = 700;
            const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
            const width = Math.max(1, Math.round(image.width * ratio));
            const height = Math.max(1, Math.round(image.height * ratio));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            context.fillStyle = '#1a1a1a';
            context.fillRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            if (dataUrl.length > 2500000) {
                reject(new Error('A foto ficou muito grande. Tente outra imagem.'));
                return;
            }
            resolve(dataUrl);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Não foi possível ler essa imagem.'));
        };
        image.src = objectUrl;
    });
}

async function handleOperatorPhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const photo = await resizeOperatorPhoto(file);
        const input = document.getElementById('operatorPhotoData');
        if (input) input.value = photo;
        updateOperatorPhotoPreview(photo);
    } catch (error) {
        event.target.value = '';
        alert(error.message || 'Não foi possível carregar a foto.');
    }
}

function openOperatorFormModal(operatorId = null) {
    if (!canAccessOperators()) {
        alert('Acesso restrito a administradores e comercial.');
        return;
    }

    const modal = document.getElementById('operatorFormModal');
    const form = document.getElementById('operatorForm');
    if (!modal || !form) return;

    const normalizedId = Number(operatorId) || null;
    const operator = normalizedId
        ? allOperators.find((item) => Number(item.id) === normalizedId)
        : null;

    editingOperatorId = operator ? normalizedId : null;
    form.reset();
    document.getElementById('operatorFormTitle').textContent = editingOperatorId ? 'Editar técnico' : 'Cadastrar técnico';
    document.getElementById('operatorSubmitButton').textContent = editingOperatorId ? 'Salvar alterações' : 'Salvar técnico';

    document.getElementById('operatorFullName').value = operator?.fullName || '';
    document.getElementById('operatorMotherName').value = operator?.motherName || '';
    document.getElementById('operatorArea').value = operator?.area || '';
    document.getElementById('operatorCpf').value = formatCpfInput(operator?.cpf || '');
    document.getElementById('operatorRg').value = operator?.rg || '';
    document.getElementById('operatorBirthDate').value = operator?.birthDate || '';
    document.getElementById('operatorAddress').value = operator?.address || '';
    document.getElementById('operatorEmail').value = operator?.email || '';
    document.getElementById('operatorPhone').value = formatPhoneInput(operator?.phone || '');
    document.getElementById('operatorPix').value = operator?.pix || '';
    document.getElementById('operatorAgency').value = operator?.agency || '';
    document.getElementById('operatorCacheValue').value = operator ? Number(operator.cacheValue || 0).toFixed(2) : '';
    document.getElementById('operatorHasVehicle').value = operator?.hasVehicle ? 'sim' : 'nao';
    document.getElementById('operatorPhotoData').value = operator?.photo || '';
    updateOperatorPhotoPreview(operator?.photo || '');

    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('operatorFullName')?.focus(), 0);
}

function closeOperatorFormModal() {
    const modal = document.getElementById('operatorFormModal');
    const form = document.getElementById('operatorForm');
    if (modal) modal.style.display = 'none';
    if (form) form.reset();
    editingOperatorId = null;
    updateOperatorPhotoPreview('');
}

async function submitOperatorForm(event) {
    event.preventDefault();
    if (!canAccessOperators()) {
        alert('Acesso restrito a administradores e comercial.');
        return;
    }

    const motherName = document.getElementById('operatorMotherName')?.value.trim() || '';
    if (!motherName) {
        alert('Digite o nome da mãe do técnico.');
        document.getElementById('operatorMotherName')?.focus();
        return;
    }

    const photo = document.getElementById('operatorPhotoData')?.value || '';
    if (!photo) {
        alert('Selecione uma foto do técnico.');
        return;
    }

    const cpfDigits = getOnlyDigits(document.getElementById('operatorCpf')?.value, 11);
    const phoneDigits = getOnlyDigits(document.getElementById('operatorPhone')?.value, 11);

    if (cpfDigits.length !== 11) {
        alert('Digite os 11 números do CPF.');
        document.getElementById('operatorCpf')?.focus();
        return;
    }

    if (phoneDigits.length !== 11) {
        alert('Digite os 11 números do celular com DDD.');
        document.getElementById('operatorPhone')?.focus();
        return;
    }

    const payload = {
        fullName: document.getElementById('operatorFullName')?.value.trim(),
        motherName,
        area: document.getElementById('operatorArea')?.value.trim(),
        cpf: formatCpfInput(cpfDigits),
        rg: document.getElementById('operatorRg')?.value.trim() || '',
        birthDate: document.getElementById('operatorBirthDate')?.value,
        address: document.getElementById('operatorAddress')?.value.trim(),
        email: document.getElementById('operatorEmail')?.value.trim(),
        phone: formatPhoneInput(phoneDigits),
        pix: document.getElementById('operatorPix')?.value.trim(),
        agency: document.getElementById('operatorAgency')?.value.trim(),
        cacheValue: Number(document.getElementById('operatorCacheValue')?.value || 0),
        hasVehicle: document.getElementById('operatorHasVehicle')?.value === 'sim',
        photo
    };

    try {
        const wasEditing = !!editingOperatorId;
        const response = await fetch(wasEditing ? `/api/operators/${editingOperatorId}` : '/api/operators', {
            method: wasEditing ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        if (!response.ok) {
            alert(data.error || 'Não foi possível salvar o técnico.');
            return;
        }

        closeOperatorFormModal();
        await loadOperators();
        alert(wasEditing ? 'Técnico atualizado com sucesso.' : 'Técnico cadastrado com sucesso.');
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function openOperatorDetails(operatorId) {
    const normalizedId = Number(operatorId);
    let operator = allOperators.find((item) => Number(item.id) === normalizedId);

    try {
        const response = await fetch(`/api/operators/${normalizedId}`, { credentials: 'include' });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.operator) {
            operator = data.operator;
            allOperators = allOperators.map((item) => Number(item.id) === normalizedId ? operator : item);
        } else if (!operator) {
            alert(data.error || 'Técnico não encontrado.');
            return;
        }
    } catch (error) {
        console.error(error);
        if (!operator) {
            alert('Erro de conexão.');
            return;
        }
    }

    const modal = document.getElementById('operatorDetailsModal');
    const content = document.getElementById('operatorDetailsContent');
    if (!modal || !content || !operator) return;

    content.innerHTML = `
        <div>${getOperatorPhotoMarkup(operator, 'operator-details-photo')}</div>
        <div class="operator-details-grid">
            <div class="operator-detail-item full">
                <span class="operator-detail-label">Nome completo</span>
                <div class="operator-detail-value">${escapeHtml(operator.fullName)}</div>
            </div>
            <div class="operator-detail-item full">
                <span class="operator-detail-label">Nome da mãe</span>
                <div class="operator-detail-value">${escapeHtml(operator.motherName || '-')}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">Área</span>
                <div class="operator-detail-value">${escapeHtml(operator.area || '-')}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">CPF</span>
                <div class="operator-detail-value">${escapeHtml(operator.cpf)}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">RG</span>
                <div class="operator-detail-value">${escapeHtml(operator.rg || '-')}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">Data de nascimento</span>
                <div class="operator-detail-value">${escapeHtml(formatDate(operator.birthDate))}</div>
            </div>
            <div class="operator-detail-item full">
                <span class="operator-detail-label">Endereço</span>
                <div class="operator-detail-value">${escapeHtml(operator.address)}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">E-mail</span>
                <div class="operator-detail-value">${escapeHtml(operator.email)}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">Número de celular</span>
                <div class="operator-detail-value">${escapeHtml(operator.phone)}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">Possui automóvel</span>
                <div class="operator-detail-value">${operator.hasVehicle ? 'Sim' : 'Não'}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">Pix</span>
                <div class="operator-detail-value">${escapeHtml(operator.pix || '-')}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">Banco</span>
                <div class="operator-detail-value">${escapeHtml(operator.agency || '-')}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">Valor do cachê</span>
                <div class="operator-detail-value">${escapeHtml(formatMoney(operator.cacheValue))}</div>
            </div>
            <div class="form-actions operator-details-actions">
                <button type="button" class="btn-danger" onclick="deleteOperator(${Number(operator.id)})">Excluir técnico</button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

async function deleteOperator(operatorId) {
    if (!canAccessOperators()) {
        alert('Acesso restrito a administradores e comercial.');
        return;
    }

    const normalizedId = Number(operatorId);
    const operator = allOperators.find((item) => Number(item.id) === normalizedId);
    if (!operator) {
        alert('Técnico não encontrado.');
        return;
    }

    if (!confirm(`Excluir o técnico ${operator.fullName}?`)) return;

    try {
        const response = await fetch(`/api/operators/${normalizedId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        if (!response.ok) {
            alert(data.error || 'Não foi possível excluir o técnico.');
            return;
        }

        allOperators = allOperators.filter((item) => Number(item.id) !== normalizedId);
        renderOperators(allOperators, getOperatorSearchValue());
        closeOperatorDetailsModal();
        alert('Técnico excluído.');
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

function closeOperatorDetailsModal() {
    const modal = document.getElementById('operatorDetailsModal');
    if (modal) modal.style.display = 'none';
}

function setupOperatorModals() {
    document.getElementById('operatorForm')?.addEventListener('submit', submitOperatorForm);
    document.getElementById('operatorPhoto')?.addEventListener('change', handleOperatorPhotoChange);
    setupOperatorInputMasks();

    const formModal = document.getElementById('operatorFormModal');
    const detailsModal = document.getElementById('operatorDetailsModal');
    if (formModal) {
        formModal.addEventListener('click', (event) => {
            if (event.target === formModal) closeOperatorFormModal();
        });
    }
    if (detailsModal) {
        detailsModal.addEventListener('click', (event) => {
            if (event.target === detailsModal) closeOperatorDetailsModal();
        });
    }
}

function renderRentalEvents(events, search = '') {
    const grid = document.getElementById('rentalEventsGrid');
    if (!grid) return;

    const normalizedSearch = search.toLowerCase();
    const filtered = events.filter((event) => {
        if (!normalizedSearch) return true;
        return (
            String(event.name || '').toLowerCase().includes(normalizedSearch) ||
            String(formatDate(event.withdrawal_date)).toLowerCase().includes(normalizedSearch) ||
            String(formatDate(event.return_date)).toLowerCase().includes(normalizedSearch)
        );
    });

    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = '<p class="empty-state">Nenhuma locação encontrada.</p>';
        return;
    }

    filtered.forEach((event) => {
        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = `
            <div class="card-top">
                <h3>${escapeHtml(event.name)}</h3>
                <div class="event-meta">
                    ${event.created_by_username ? `<span class="event-created-by">${escapeHtml(event.created_by_username)}</span>` : ''}
                    <span class="card-date">Retirada: ${escapeHtml(formatDate(event.withdrawal_date))}</span>
                    <span class="card-date">Devolução: ${escapeHtml(formatDate(event.return_date))}</span>
                </div>
            </div>
            <div class="event-actions">
                <button onclick="window.location.href='/event.html?id=${event.id}&type=rental'" class="btn-primary">Gerenciar</button>
                <button onclick="deleteRentalEvent(${event.id}, '${escapeJsString(event.name)}')" class="btn-danger">Excluir</button>
            </div>`;
        grid.appendChild(card);
    });
}

async function loadRentalEvents() {
    try {
        const response = await fetch('/api/rental-events', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        allRentalEvents = await response.json();
        renderRentalEvents(allRentalEvents, getRentalSearchValue());
    } catch (error) {
        console.error(error);
    }
}

function historyMatchesSearch(event, search, isRental) {
    if (!search) return true;
    const normalizedSearch = search.toLowerCase();
    const fields = isRental
        ? [event.name, formatDate(event.withdrawal_date), formatDate(event.return_date), event.created_by_username]
        : [event.name, formatDate(event.date), event.created_by_username];
    return fields.some((field) => String(field || '').toLowerCase().includes(normalizedSearch));
}

function getHistoryCardHtml(event, isRental) {
    const manageUrl = isRental
        ? `/event.html?id=${Number(event.id)}&type=rental`
        : `/event.html?id=${Number(event.id)}`;
    const dateHtml = isRental
        ? `
            <span class="card-date">Retirada: ${escapeHtml(formatDate(event.withdrawal_date))}</span>
            <span class="card-date">Devolução: ${escapeHtml(formatDate(event.return_date))}</span>
        `
        : `<span class="card-date">${escapeHtml(formatDate(event.date))}</span>`;

    return `
        <div class="card-top">
            <h3>${escapeHtml(event.name)}</h3>
            <div class="event-meta">
                <span class="history-badge">Finalizado</span>
                ${event.created_by_username ? `<span class="event-created-by">${escapeHtml(event.created_by_username)}</span>` : ''}
                ${dateHtml}
            </div>
        </div>
        <div class="event-actions">
            <button onclick="window.location.href='${manageUrl}'" class="btn-primary">Gerenciar</button>
        </div>`;
}

function renderHistoryGrid(gridId, countId, events, emptyMessage, isRental) {
    const grid = document.getElementById(gridId);
    const count = document.getElementById(countId);
    if (!grid) return;

    if (count) {
        const label = isRental
            ? (events.length === 1 ? 'locação' : 'locações')
            : (events.length === 1 ? 'evento' : 'eventos');
        count.textContent = `${events.length} ${label}`;
    }

    grid.innerHTML = '';
    if (events.length === 0) {
        grid.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
        return;
    }

    events.forEach((event) => {
        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = getHistoryCardHtml(event, isRental);
        grid.appendChild(card);
    });
}

function renderHistoryEvents(events = allHistoryEvents, rentals = allHistoryRentals, search = '') {
    const filteredEvents = events.filter((event) => historyMatchesSearch(event, search, false));
    const filteredRentals = rentals.filter((event) => historyMatchesSearch(event, search, true));

    renderHistoryGrid('historyEventsGrid', 'historyEventsCount', filteredEvents, 'Nenhum evento finalizado encontrado.', false);
    renderHistoryGrid('historyRentalsGrid', 'historyRentalsCount', filteredRentals, 'Nenhuma locação finalizada encontrada.', true);
}

async function loadHistoryEvents() {
    try {
        const response = await fetch('/api/history-events', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        if (!response.ok) return;

        const data = await response.json();
        allHistoryEvents = Array.isArray(data.events) ? data.events : [];
        allHistoryRentals = Array.isArray(data.rentals) ? data.rentals : [];
        renderHistoryEvents(allHistoryEvents, allHistoryRentals, getHistorySearchValue());
    } catch (error) {
        console.error(error);
    }
}

function formatPriceEditor(input) {
    if (!input) return;
    input.value = formatQuoteMoneyInput(input.value);
}

function getPriceEditorHtml(type, item, context = '') {
    const itemId = Number(item.id);
    const contextPrefix = context ? `${context}_` : '';
    return `
        <div class="price-editor">
            <input
                type="text"
                id="price_${contextPrefix}${type}_${itemId}"
                class="price-editor-input"
                inputmode="numeric"
                value="${escapeHtml(formatMoney(item.unitPrice ?? 1))}"
                oninput="formatPriceEditor(this)"
                onfocus="this.select()"
                aria-label="Preço de ${escapeHtml(item.name)}"
            >
            <button
                type="button"
                class="btn-primary btn-small"
                onclick="saveItemPrice('${type}', ${itemId}, '${context}')"
            >Salvar</button>
        </div>
    `;
}

async function loadItemPrices(type, search = '') {
    const response = await fetch(
        `/api/prices?type=${encodeURIComponent(type)}&search=${encodeURIComponent(search)}`,
        { credentials: 'include' }
    );

    if (response.status === 401) {
        window.location.href = '/login.html';
        return [];
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || 'Não foi possível carregar os preços.');
    }

    return Array.isArray(data.items) ? data.items : [];
}

function mergeItemsWithPrices(items, prices) {
    const priceById = new Map(prices.map((item) => [Number(item.id), Number(item.unitPrice) || 0]));
    return items.map((item) => ({
        ...item,
        unitPrice: priceById.has(Number(item.id)) ? priceById.get(Number(item.id)) : 1
    }));
}

async function saveItemPrice(type, itemId, context = '') {
    const contextPrefix = context ? `${context}_` : '';
    const input = document.getElementById(`price_${contextPrefix}${type}_${Number(itemId)}`);
    if (!input || !canManagePrices()) return;

    const unitPrice = parseQuoteMoneyInput(input.value);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        alert('Informe um preço válido.');
        return;
    }

    const button = input.parentElement?.querySelector('button');
    if (button) button.disabled = true;

    try {
        const response = await fetch(`/api/prices/${encodeURIComponent(type)}/${Number(itemId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ unitPrice })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            alert(data.error || 'Não foi possível salvar o preço.');
            return;
        }

        input.value = formatMoney(data.unitPrice);
        if (type === 'equipment') {
            const item = allEquipments.find((entry) => Number(entry.id) === Number(itemId));
            if (item) item.unitPrice = data.unitPrice;
            const quoteItem = quoteDatabaseEquipments.find((entry) => Number(entry.id) === Number(itemId));
            if (quoteItem) quoteItem.unitPrice = data.unitPrice;
        } else if (type === 'cable') {
            const item = allCables.find((entry) => Number(entry.id) === Number(itemId));
            if (item) item.unitPrice = data.unitPrice;
        } else {
            const item = allOtherItems.find((entry) => Number(entry.id) === Number(itemId));
            if (item) item.unitPrice = data.unitPrice;
        }
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    } finally {
        if (button) button.disabled = false;
    }
}

function renderQuoteDatabaseEquipments(equipments) {
    const tbody = document.querySelector('#quoteEquipmentsTable tbody');
    const theadRow = document.querySelector('#quoteEquipmentsTable thead tr');
    if (!tbody) return;

    const columnCount = 3;
    const visibleEquipments = filterQuoteEquipmentVisualExclusions(equipments);
    const restoreButton = document.getElementById('restoreQuoteDatabaseVisualExclusionsButton');

    if (restoreButton) {
        restoreButton.hidden = getQuoteDatabaseVisualExclusionIds().size === 0
            && getQuoteDatabaseVisualExclusionNames().size === 0;
    }

    if (theadRow) {
        theadRow.innerHTML = `
            <th>Equipamento</th>
            <th>Quantidade</th>
            <th>Preço</th>
        `;
    }

    tbody.innerHTML = '';

    if (!visibleEquipments.length) {
        tbody.innerHTML = `<tr><td colspan="${columnCount}" class="empty-row">Nenhum equipamento encontrado.</td></tr>`;
        return;
    }

    const groupedEquipments = new Map();
    visibleEquipments.forEach((equipment) => {
        const category = getEquipmentGroupTitle(equipment);
        if (!groupedEquipments.has(category)) {
            groupedEquipments.set(category, []);
        }
        groupedEquipments.get(category).push(equipment);
    });
    let renderedGroupIndex = 0;

    Array.from(groupedEquipments.entries())
        .sort((a, b) => compareEquipmentGroupTitles(a[0], b[0]))
        .forEach(([category, items]) => {
            const containsServices = items.some((item) => item.isService === true);
            const storedTopics = [...new Set(items.map(getEquipmentStoredTopic))];
            const sourceTopic = storedTopics.length === 1 ? storedTopics[0] : '';
            const canEditTopic = !containsServices && sourceTopic
                && items.every((item) => normalizeRackText(getEquipmentGroupTitle(item)) === normalizeRackText(sourceTopic));
            const sourceTopicArgument = escapeHtml(JSON.stringify(sourceTopic));
            const topicEditButton = canEditTopic
                ? `<button type="button" class="btn-primary btn-delete-mini quote-topic-edit-button" onclick="editQuoteEquipmentTopic(${sourceTopicArgument})">Editar tópico</button>`
                : '';
            const categoryRow = document.createElement('tr');
            categoryRow.className = 'category-row';
            categoryRow.innerHTML = `
                <td colspan="${columnCount}" class="categoria-titulo">
                    <div class="quote-topic-heading">
                        <span>${escapeHtml(category)}</span>
                        ${topicEditButton}
                    </div>
                </td>`;
            tbody.appendChild(categoryRow);

            const groupsByName = new Map();
            items.slice().sort(compareEquipments).forEach((equipment) => {
                const nameKey = getQuoteEquipmentDisplayGroupingKey(equipment);
                if (!groupsByName.has(nameKey)) groupsByName.set(nameKey, []);
                groupsByName.get(nameKey).push(equipment);
            });

            Array.from(groupsByName.values()).forEach((groupItems) => {
                const first = groupItems[0];
                const isService = first.isService === true;
                const groupToken = renderedGroupIndex++;
                const priceInputId = `quoteEquipmentGroupPrice_${groupToken}`;
                const prices = [...new Set(groupItems.map((equipment) => Number(equipment.unitPrice) || 0))]
                    .sort((a, b) => a - b);
                const allEquipmentIds = groupItems
                    .map((equipment) => Number(equipment.id))
                    .filter((equipmentId) => Number.isInteger(equipmentId) && equipmentId > 0);
                const groupNameArgument = escapeHtml(JSON.stringify(first.name || ''));
                const visualDeleteButton = `<button type="button" class="btn-danger btn-delete-mini" onclick="excludeQuoteEquipmentGroupVisually(${JSON.stringify(allEquipmentIds)}, ${groupNameArgument})">Excluir</button>`;
                const priceText = prices.length <= 1
                    ? formatMoney(prices[0] || 0)
                    : `${formatMoney(prices[0])} a ${formatMoney(prices[prices.length - 1])}`;
                const nameActions = isService
                    ? visualDeleteButton
                    : `<button type="button" class="btn-primary btn-delete-mini" onclick="editQuoteEquipmentGroupName(${JSON.stringify(allEquipmentIds)}, ${groupNameArgument})">Editar nome</button>${visualDeleteButton}`;
                const fixedServicePrice = first.requiresDimensions
                    ? `${formatMoney(first.pricePerSquareMeter || 500)} por m²`
                    : formatMoney(prices[0] || 0);
                const priceContent = isService && first.editablePrice === true
                    ? `<div class="price-editor quote-equipment-group-price-editor">
                            <input
                                type="text"
                                id="${priceInputId}"
                                class="price-editor-input"
                                inputmode="numeric"
                                value="${escapeHtml(formatMoney(prices[0] || 0))}"
                                oninput="formatPriceEditor(this)"
                                onfocus="this.select()"
                                aria-label="Preço de ${escapeHtml(first.name)}"
                            >
                            <button type="button" class="btn-primary btn-small" onclick="saveQuoteServicePrice('${escapeHtml(first.serviceId)}', '${priceInputId}')">Salvar</button>
                        </div>`
                    : isService
                        ? `<div class="quote-service-fixed-price"><strong>${escapeHtml(fixedServicePrice)}</strong><small>Preço fixo</small></div>`
                    : `<div class="price-editor quote-equipment-group-price-editor">
                            <input
                                type="text"
                                id="${priceInputId}"
                                class="price-editor-input"
                                inputmode="numeric"
                                value="${escapeHtml(formatMoney(prices[0] || 0))}"
                                oninput="formatPriceEditor(this)"
                                onfocus="this.select()"
                                aria-label="Preço de ${escapeHtml(first.name)}"
                            >
                            <button type="button" class="btn-primary btn-small" onclick="saveQuoteEquipmentGroupPrice(${JSON.stringify(allEquipmentIds)}, '${priceInputId}')">Salvar</button>
                        </div>
                        ${prices.length > 1 ? `<small class="quote-group-price-range">Valores atuais: ${escapeHtml(priceText)}</small>` : ''}`;

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <strong>${escapeHtml(first.name)}</strong>
                        <div class="table-action-buttons quote-equipment-group-actions">
                            ${nameActions}
                        </div>
                    </td>
                    <td class="quote-equipment-group-quantity">${isService ? 'ILIMITADA' : String(groupItems.length).padStart(2, '0')}</td>
                    <td>
                        ${priceContent}
                    </td>
                `;
                tbody.appendChild(row);
            });
        });
}

async function editQuoteEquipmentTopic(sourceTopic) {
    const currentTopic = getEquipmentStoredTopic({ category: sourceTopic });
    const requestedTopic = prompt(
        'Novo nome do tópico. Se ele já existir, os equipamentos serão reunidos no mesmo tópico:',
        currentTopic
    );
    if (requestedTopic === null) return;

    const topic = String(requestedTopic).trim().replace(/\s+/g, ' ');
    if (!topic) {
        alert('Digite um nome de tópico válido.');
        return;
    }
    if (topic === currentTopic) return;

    try {
        const response = await fetch('/api/orcamentos/topicos/nome', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ sourceTopic: currentTopic, topic })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Não foi possível alterar o nome do tópico.');
            return;
        }

        const searchInput = document.getElementById('quoteDatabaseSearchInput');
        if (searchInput && normalizeRackText(searchInput.value) === normalizeRackText(currentTopic)) {
            searchInput.value = data.topic || topic;
        }
        await Promise.all([
            loadQuoteDatabaseEquipments(getQuoteDatabaseSearchValue()),
            loadEquipments(getEquipmentSearchValue())
        ]);
        const message = data.merged
            ? `Tópicos unidos em "${data.topic || topic}". ${data.updated || 0} equipamento(s) organizado(s).`
            : `Tópico alterado para "${data.topic || topic}" em ${data.updated || 0} equipamento(s).`;
        alert(message);
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function editQuoteEquipmentGroupName(equipmentIds, currentName) {
    const ids = (Array.isArray(equipmentIds) ? equipmentIds : []).map(Number).filter((id) => id > 0);
    if (!ids.length) return;

    const name = prompt(
        `Novo nome para ${ids.length} patrimônio(s). Se esse nome já existir, as quantidades serão agrupadas automaticamente:`,
        currentName || ''
    );
    if (name === null) return;
    const normalizedName = String(name).trim();
    if (!normalizedName) {
        alert('Digite um nome válido.');
        return;
    }
    if (getQuoteItemNameKey(normalizedName) === getQuoteItemNameKey(currentName)) return;

    try {
        const response = await fetch('/api/orcamentos/equipamentos-grupo/nome', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ equipmentIds: ids, name: normalizedName })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Não foi possível editar o nome dos equipamentos.');
            return;
        }

        await Promise.all([
            loadQuoteDatabaseEquipments(getQuoteDatabaseSearchValue()),
            loadEquipments(getEquipmentSearchValue())
        ]);
        alert(`${data.updated || ids.length} patrimônio(s) atualizado(s). Equipamentos com o mesmo nome foram agrupados e os preços unitários foram preservados.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function saveQuoteEquipmentGroupPrice(equipmentIds, inputId) {
    const ids = (Array.isArray(equipmentIds) ? equipmentIds : []).map(Number).filter((id) => id > 0);
    const input = document.getElementById(inputId);
    if (!ids.length || !input) return;

    const unitPrice = parseQuoteMoneyInput(input.value);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        alert('Informe um preço válido.');
        input.focus();
        return;
    }

    const button = input.parentElement?.querySelector('button');
    if (button) button.disabled = true;
    try {
        const response = await fetch('/api/orcamentos/equipamentos-grupo/preco', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ equipmentIds: ids, unitPrice })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Não foi possível editar o preço dos equipamentos.');
            return;
        }

        await Promise.all([
            loadQuoteDatabaseEquipments(getQuoteDatabaseSearchValue()),
            loadEquipments(getEquipmentSearchValue())
        ]);
        alert(`Preço atualizado em ${data.updated || ids.length} patrimônio(s).`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    } finally {
        if (button) button.disabled = false;
    }
}

async function saveQuoteServicePrice(serviceId, inputId) {
    const input = document.getElementById(inputId);
    const normalizedServiceId = String(serviceId || '').trim();
    if (!input || !normalizedServiceId) return;

    const unitPrice = parseQuoteMoneyInput(input.value);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        alert('Informe um preço válido.');
        input.focus();
        return;
    }

    const button = input.parentElement?.querySelector('button');
    if (button) button.disabled = true;
    try {
        const response = await fetch(`/api/orcamentos/servicos/${encodeURIComponent(normalizedServiceId)}/preco`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ unitPrice })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Não foi possível editar o preço do serviço.');
            return;
        }

        await loadQuoteDatabaseEquipments(getQuoteDatabaseSearchValue());
        alert('Preço do serviço atualizado.');
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    } finally {
        if (button) button.disabled = false;
    }
}

function excludeQuoteEquipmentGroupVisually(equipmentIds, name) {
    const ids = (Array.isArray(equipmentIds) ? equipmentIds : []).map(Number).filter((id) => id > 0);
    const nameKey = getQuoteItemNameKey(name);
    if (!ids.length && !nameKey) return;

    const message = `Excluir "${name}" somente das telas de orçamento deste navegador? O banco de dados não será alterado.`;
    if (!confirm(message)) return;

    const excludedIds = getQuoteDatabaseVisualExclusionIds();
    ids.forEach((equipmentId) => excludedIds.add(equipmentId));
    if (nameKey) getQuoteDatabaseVisualExclusionNames().add(nameKey);
    saveQuoteDatabaseVisualExclusionIds();
    saveQuoteDatabaseVisualExclusionNames();
    renderQuoteDatabaseEquipments(quoteDatabaseEquipments);

    if (quoteEquipmentSuggestions.length) {
        quoteEquipmentSuggestions = filterQuoteEquipmentVisualExclusions(quoteEquipmentSuggestions);
        renderQuoteEquipmentResults(quoteEquipmentSuggestions);
    }
}

function restoreQuoteDatabaseVisualExclusions() {
    const excludedIds = getQuoteDatabaseVisualExclusionIds();
    const excludedNames = getQuoteDatabaseVisualExclusionNames();
    if (!excludedIds.size && !excludedNames.size) return;
    const searchedName = getQuoteDatabaseSearchValue();
    const searchedNameKey = getQuoteItemNameKey(searchedName);
    const searchedEquipmentIds = quoteDatabaseEquipments
        .filter((equipment) => getQuoteItemNameKey(equipment?.name) === searchedNameKey)
        .flatMap((equipment) => [
            Number(equipment?.id),
            ...(Array.isArray(equipment?.equipments)
                ? equipment.equipments.map((item) => Number(item?.id))
                : [])
        ])
        .filter((equipmentId) => Number.isInteger(equipmentId) && equipmentId > 0);
    const canRestoreOnlySearch = Boolean(searchedNameKey) && (
        excludedNames.has(searchedNameKey)
        || searchedEquipmentIds.some((equipmentId) => excludedIds.has(equipmentId))
    );

    if (searchedNameKey && !canRestoreOnlySearch) {
        alert(`Nenhum equipamento excluído encontrado com o nome "${searchedName}".`);
        return;
    }

    if (canRestoreOnlySearch) {
        if (!confirm(`Restaurar somente "${searchedName}" nas telas de orçamento?`)) return;
        excludedNames.delete(searchedNameKey);
        searchedEquipmentIds.forEach((equipmentId) => excludedIds.delete(equipmentId));
    } else {
        if (!confirm('Restaurar todos os equipamentos excluídos das telas de orçamento?')) return;
        excludedIds.clear();
        excludedNames.clear();
    }

    saveQuoteDatabaseVisualExclusionIds();
    saveQuoteDatabaseVisualExclusionNames();
    renderQuoteDatabaseEquipments(quoteDatabaseEquipments);

    if (document.getElementById('quoteItemDescription')?.value.trim()) {
        searchQuoteEquipments();
    }
}

async function loadQuoteDatabaseEquipments(search = '') {
    if (!canManageQuoteDatabase()) return;

    quoteDatabaseLoadController?.abort();
    const controller = new AbortController();
    const requestSequence = ++quoteDatabaseLoadSequence;
    quoteDatabaseLoadController = controller;

    try {
        const response = await fetch(`/api/orcamentos/equipamentos-banco?search=${encodeURIComponent(search)}`, {
            credentials: 'include',
            signal: controller.signal
        });
        if (requestSequence !== quoteDatabaseLoadSequence) return;
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        const data = await response.json().catch(() => ({}));
        if (requestSequence !== quoteDatabaseLoadSequence) return;
        if (!response.ok) {
            alert(data.error || 'Não foi possível carregar o banco de orçamentos.');
            return;
        }

        quoteDatabaseEquipments = [
            ...(Array.isArray(data.equipments) ? data.equipments : []),
            ...(Array.isArray(data.services) ? data.services : [])
        ];
        renderQuoteDatabaseEquipments(quoteDatabaseEquipments);
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error(error);
        alert('Erro de conexão.');
    } finally {
        if (quoteDatabaseLoadController === controller) {
            quoteDatabaseLoadController = null;
        }
    }
}

function renderEquipments(equipments) {
    const tbody = document.querySelector('#equipmentsTable tbody');
    const theadRow = document.querySelector('#equipmentsTable thead tr');
    if (!tbody || !theadRow) return;

    const relacaoEventId = localStorage.getItem('relacao_event_id');
    const columnCount = 7;

    theadRow.innerHTML = `
        <th>Nome do Equipamento</th>
        <th>Observação</th>
        <th>Número de Série</th>
        <th>Patrimônio</th>
        <th>Status</th>
        <th>Evento</th>
        <th>Ações</th>
    `;

    if (equipments.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="${columnCount}" class="empty-row">Nenhum equipamento encontrado.</td>`;
        tbody.replaceChildren(emptyRow);
        return;
    }

    const groupedEquipments = new Map();
    const rowsFragment = document.createDocumentFragment();

    equipments.forEach((eq) => {
        const category = getEquipmentGroupTitle(eq);
        if (!groupedEquipments.has(category)) {
            groupedEquipments.set(category, []);
        }
        groupedEquipments.get(category).push(eq);
    });

    Array.from(groupedEquipments.entries())
        .sort((a, b) => compareEquipmentGroupTitles(a[0], b[0]))
        .forEach(([category, items]) => {
            const categoryRow = document.createElement('tr');
            categoryRow.className = 'category-row';
            categoryRow.innerHTML = `<td colspan="${columnCount}" class="categoria-titulo">${escapeHtml(category)}</td>`;
            rowsFragment.appendChild(categoryRow);

            items
                .sort(compareEquipments)
                .forEach((eq) => {
                    const row = document.createElement('tr');
                    const statusRaw = String(eq.current_status || '').toLowerCase();
                    const isDisponivel = !statusRaw || statusRaw === 'disponível' || statusRaw === 'disponivel';
                    const isPreSeparado = statusRaw === 'pre separado';
                    const isRelacao = statusRaw === 'relação' || statusRaw === 'relacao';
                    const isManutencao = statusRaw.includes('manut');
                    const statusText = isPreSeparado ? 'Pré-separado' : (isRelacao ? 'Relação' : (isManutencao ? 'Em Manutenção' : (isDisponivel ? 'Disponível' : 'Indisponível')));
                    const statusClass = (isPreSeparado || isRelacao) ? 'badge-relation' : (isManutencao ? 'badge-maintenance' : (isDisponivel ? 'badge-available' : 'badge-unavailable'));
                    const warningButton = isManutencao && eq.maintenance_description
                        ? `<button type="button" class="warning-button" onclick="openMaintenanceDetails(${eq.id})" title="Ver problema">⚠️</button>`
                        : '';

                    const displayStatus = getEquipmentStatusDisplay(eq.current_status);
                    const actionButtons = [];
                    if (relacaoEventId) {
                        actionButtons.push(`<button onclick="adicionarARelacao(${eq.id}, '${escapeJsString(eq.name)}', '${escapeJsString(eq.barcode)}')" class="btn-primary btn-small">Adicionar</button>`);
                    }
                    if (!relacaoEventId) {
                        actionButtons.push(`<button type="button" onclick="openEditEquipmentModal(${Number(eq.id)})" class="btn-primary btn-delete-mini">Editar</button>`);
                        actionButtons.push(`<button onclick="deleteEquipment(${eq.id}, '${escapeJsString(eq.name)}')" class="btn-danger btn-delete-mini">Excluir</button>`);
                    }

                    row.innerHTML = `
                        <td>${escapeHtml(eq.name)}${warningButton}</td>
                        <td class="equipment-observation-cell">${escapeHtml(getEquipmentObservation(eq) || '-')}</td>
                        <td class="equipment-serial-cell">${escapeHtml(getEquipmentSerialNumber(eq) || '-')}</td>
                        <td>${escapeHtml(eq.barcode || '-')}</td>
                        <td><span class="status-badge ${displayStatus.className}">${escapeHtml(displayStatus.text)}</span></td>
                        <td>${escapeHtml(eq.current_event_name || '-')}</td>
                        <td><div class="table-action-buttons">${actionButtons.join('')}</div></td>`;
                    rowsFragment.appendChild(row);
                });
        });

    tbody.replaceChildren(rowsFragment);
}

async function loadEquipments(search = '') {
    equipmentLoadController?.abort();
    const controller = new AbortController();
    const requestSequence = ++equipmentLoadSequence;
    equipmentLoadController = controller;

    try {
        const response = await fetch(`/api/equipments?search=${encodeURIComponent(search)}`, {
            credentials: 'include',
            signal: controller.signal
        });
        if (requestSequence !== equipmentLoadSequence) return;
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const equipments = await response.json().catch(() => []);
        if (requestSequence !== equipmentLoadSequence) return;
        if (!response.ok || !Array.isArray(equipments)) {
            renderEquipments([]);
            return;
        }

        allEquipments = equipments;
        renderEquipments(allEquipments);
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error(error);
        renderEquipments([]);
    } finally {
        if (equipmentLoadController === controller) {
            equipmentLoadController = null;
        }
    }
}

function openEditEquipmentModal(id, source = 'database') {
    editingEquipmentId = Number(id);
    editingEquipmentSource = source === 'quote' ? 'quote' : 'database';
    const primaryItems = editingEquipmentSource === 'quote' ? quoteDatabaseEquipments : allEquipments;
    const fallbackItems = editingEquipmentSource === 'quote' ? allEquipments : quoteDatabaseEquipments;
    const equipment = primaryItems.find((item) => Number(item.id) === editingEquipmentId)
        || fallbackItems.find((item) => Number(item.id) === editingEquipmentId);
    const modal = document.getElementById('editEquipmentModal');
    const title = document.getElementById('editEquipmentModalTitle');
    const subtitle = document.getElementById('editEquipmentModalSubtitle');
    const nameInput = document.getElementById('editEquipmentName');
    const barcodeInput = document.getElementById('editEquipmentBarcode');
    const serialInput = document.getElementById('editEquipmentSerialNumber');
    const observationInput = document.getElementById('editEquipmentObservation');

    if (!editingEquipmentId || !equipment || !modal || !nameInput || !barcodeInput || !serialInput || !observationInput) return;

    nameInput.value = equipment.name || '';
    barcodeInput.value = equipment.barcode || '';
    serialInput.value = getEquipmentSerialNumber(equipment) || '-';
    observationInput.value = getEquipmentObservation(equipment) || '-';
    if (title) title.textContent = editingEquipmentSource === 'quote' ? 'Editar equipamento do orçamento' : 'Editar equipamento';
    if (subtitle) {
        subtitle.textContent = editingEquipmentSource === 'quote'
            ? 'Nome e observação são compartilhados com o Banco de Dados.'
            : 'As alterações também aparecerão no Banco de Orçamentos.';
    }
    modal.style.display = 'flex';
    nameInput.focus();
}

function closeEditEquipmentModal() {
    editingEquipmentId = null;
    editingEquipmentSource = 'database';
    document.getElementById('editEquipmentForm')?.reset();
    const modal = document.getElementById('editEquipmentModal');
    if (modal) modal.style.display = 'none';
}

async function submitEquipmentEdit() {
    if (!editingEquipmentId) return;

    const editedEquipmentId = editingEquipmentId;
    const editedSource = editingEquipmentSource;

    const data = {
        name: document.getElementById('editEquipmentName')?.value.trim() || '',
        barcode: document.getElementById('editEquipmentBarcode')?.value.trim() || '',
        serialNumber: document.getElementById('editEquipmentSerialNumber')?.value.trim() || '-',
        observation: document.getElementById('editEquipmentObservation')?.value.trim() || '-'
    };

    if (!data.name || !data.barcode) {
        alert('Nome e patrimonio sao obrigatorios.');
        return;
    }

    try {
        const response = await fetch(`/api/equipments/${editedEquipmentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.error || error.message || 'Nao foi possivel editar o equipamento.');
            return;
        }

        closeEditEquipmentModal();
        const reloads = [loadEquipments(getEquipmentSearchValue()), loadMaintenanceEquipments()];
        if (canManageQuoteDatabase()) {
            reloads.push(loadQuoteDatabaseEquipments(getQuoteDatabaseSearchValue()));
        }
        await Promise.all(reloads);
        alert(editedSource === 'quote'
            ? 'Equipamento atualizado nos dois bancos com sucesso.'
            : 'Equipamento atualizado com sucesso. A alteração também está no Banco de Orçamentos.');
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

function renderMaintenanceList(equipments) {
    const list = document.getElementById('maintenanceList');
    const count = document.getElementById('maintenanceCount');
    if (!list || !count) return;

    count.textContent = `${equipments.length} ${equipments.length === 1 ? 'item' : 'itens'}`;
    list.innerHTML = '';

    if (equipments.length === 0) {
        list.innerHTML = '<p class="empty-state">Nenhum equipamento em manutenção.</p>';
        return;
    }

    equipments
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
        .forEach((equipment) => {
            const item = document.createElement('div');
            item.className = 'maintenance-item';
            item.innerHTML = `
                <div class="maintenance-item-info">
                    <h3>${escapeHtml(equipment.name)}</h3>
                    <p class="maintenance-meta">Código: ${escapeHtml(equipment.barcode)} | Categoria: ${escapeHtml(equipment.category || 'Outros')}</p>
                    <p class="maintenance-problem"><strong>Problema:</strong> ${escapeHtml(equipment.maintenance_description || 'Sem descrição.')}</p>
                </div>
                <button type="button" class="btn-ready" onclick="markMaintenanceReady(${equipment.id})">Pronto</button>
            `;
            list.appendChild(item);
        });
}

async function loadMaintenanceEquipments() {
    try {
        const response = await fetch('/api/equipments', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const equipments = await response.json();
        maintenanceEquipments = equipments.filter((equipment) =>
            String(equipment.current_status || '').toLowerCase().includes('manut')
        );
        renderMaintenanceList(maintenanceEquipments);
    } catch (error) {
        console.error(error);
    }
}

async function adicionarARelacao(id, name, barcode) {
    const eventId = localStorage.getItem('relacao_event_id');
    if (!eventId) return;

    try {
        const pendingKey = `pending_items_${eventId}`;
        const pendingItems = JSON.parse(localStorage.getItem(pendingKey) || '[]');
        const spaceId = getRelacaoSpaceId();
        const alreadyAdded = pendingItems.some((item) => (
            Number(item.id) === Number(id) && isSameRelacaoSpace(item.spaceId, spaceId)
        ));

        if (!alreadyAdded) {
            pendingItems.push({
                id: Number(id),
                name,
                barcode,
                spaceId
            });
            localStorage.setItem(pendingKey, JSON.stringify(pendingItems));

            await fetch(`/api/equipments/${Number(id)}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Pre separado' }),
                credentials: 'include'
            });
        }

        await loadEquipments(getEquipmentSearchValue());
        alert(`${name} adicionado ao evento.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function deleteEvent(id) {
    if (!confirm('Deseja excluir este evento?')) return;

    try {
        const pendingKey = `pending_items_${id}`;
        const pendingOtherKey = `pending_other_items_${id}`;

        const response = await fetch(`/api/events/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) {
            alert('Não foi possível excluir o evento.');
            return;
        }

        localStorage.removeItem(pendingKey);
        localStorage.removeItem(pendingOtherKey);
        clearRelacaoContext();
        await loadEvents();
        await loadEquipments(getEquipmentSearchValue());
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

function renderCables(cables) {
    const tbody = document.querySelector('#cablesTable tbody');
    if (!tbody) return;
    const relacaoEventId = localStorage.getItem('relacao_event_id');
    const showInitialQuantityEdit = !relacaoEventId && canEditInitialQuantity();
    const theadRow = document.querySelector('#cablesTable thead tr');
    const columnCount = 4;

    if (theadRow) {
        theadRow.innerHTML = `
            <th>Nome</th>
            <th class="cable-quantity-column">Quantidade Inicial</th>
            <th class="cable-quantity-column">Quantidade Disponível</th>
            <th></th>
        `;
    }

    if (cables.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columnCount}" class="empty-row">Nenhum cabo encontrado.</td></tr>`;
        return;
    }

    const groupedCables = new Map();
    const rowsFragment = document.createDocumentFragment();
    cables.forEach((cable) => {
        const category = cable.category || 'Outros';
        if (!groupedCables.has(category)) {
            groupedCables.set(category, []);
        }
        groupedCables.get(category).push(cable);
    });

    Array.from(groupedCables.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
        .forEach(([category, items]) => {
            if (category !== 'Outros') {
                const categoryRow = document.createElement('tr');
                categoryRow.className = 'category-row';
                categoryRow.innerHTML = `<td colspan="${columnCount}" class="categoria-titulo">${escapeHtml(category)}</td>`;
                rowsFragment.appendChild(categoryRow);
            }

            items
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
                .forEach((cable) => {
                    const maintenanceQuantity = Number(cable.maintenance_quantity) || 0;
                    const maintenanceButtonClass = maintenanceQuantity > 0 ? ' active' : '';
                    const maintenanceTitle = maintenanceQuantity > 0
                        ? `${maintenanceQuantity} em manutenção — ver detalhes`
                        : 'Nenhum cabo em manutenção — ver detalhes';
                    const actionButtons = [];
                    if (!relacaoEventId) {
                        if (showInitialQuantityEdit) {
                            actionButtons.push(`<button type="button" class="btn-primary btn-delete-mini" onclick="editCableInitialQuantity(${cable.id}, '${escapeJsString(cable.name)}', ${Number(cable.quantity) || 0})">Editar</button>`);
                        }
                        actionButtons.push(`<button type="button" class="btn-danger btn-delete-mini" onclick="deleteCable(${cable.id}, '${escapeJsString(cable.name)}')">Excluir</button>`);
                    }

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${escapeHtml(cable.name)}</td>
                        <td class="cable-quantity-cell cable-quantity-column">
                            <span class="cable-initial-quantity">${escapeHtml(cable.quantity)}</span>
                            <button type="button" class="cable-maintenance-button${maintenanceButtonClass}" onclick="openCableMaintenanceSummary(${cable.id})" title="${escapeHtml(maintenanceTitle)}" aria-label="${escapeHtml(maintenanceTitle)}">🛠️</button>
                        </td>
                        <td class="cable-quantity-cell cable-quantity-column cable-available-quantity-cell" style="color: #2ecc71;">${escapeHtml(cable.available_quantity)}</td>
                        <td><div class="table-action-buttons">${actionButtons.join('')}</div></td>
                    `;
                    rowsFragment.appendChild(row);
                });
        });

    tbody.replaceChildren(rowsFragment);
}

function requestEditQuantityPassword() {
    const password = prompt('Digite a senha para editar:');
    if (password === null) return null;
    return String(password).trim();
}

function requestInitialQuantity(name, currentQuantity) {
    const input = prompt(`Quantidade inicial de ${name}:`, String(Number(currentQuantity) || 0));
    if (input === null) return null;

    const quantity = Number(input);
    if (!Number.isInteger(quantity) || quantity < 0) {
        alert('Quantidade inválida.');
        return null;
    }

    return quantity;
}

async function editCableInitialQuantity(id, name, currentQuantity) {
    if (!canEditInitialQuantity()) {
        alert('Apenas o usuário Arthur pode editar a quantidade inicial.');
        return;
    }

    const quantity = requestInitialQuantity(name, currentQuantity);
    if (quantity === null) return;

    const password = requestEditQuantityPassword();
    if (password === null) return;

    try {
        const response = await fetch(`/api/cables/${Number(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ quantity, password })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Não foi possível editar a quantidade inicial.');
            return;
        }

        await Promise.all([loadCables(getEquipmentSearchValue()), loadMaintenanceCables()]);
        alert('Quantidade inicial atualizada.');
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function editOtherItemInitialQuantity(id, name, currentQuantity) {
    if (!canEditInitialQuantity()) {
        alert('Apenas o usuário Arthur pode editar a quantidade inicial.');
        return;
    }

    const quantity = requestInitialQuantity(name, currentQuantity);
    if (quantity === null) return;

    const password = requestEditQuantityPassword();
    if (password === null) return;

    try {
        const response = await fetch(`/api/other-items/${Number(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ quantity, password })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Não foi possível editar a quantidade inicial.');
            return;
        }

        await loadOtherItems(getEquipmentSearchValue());
        alert('Quantidade inicial atualizada.');
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

function requestDeletePassword() {
    const password = prompt('Digite a senha para excluir:');
    if (password === null) return null;
    return String(password).trim();
}

async function deleteRentalEvent(id, name) {
    if (!confirm('Deseja excluir esta locação?')) return;

    const password = requestDeletePassword();
    if (password === null) return;

    try {
        const response = await fetch(`/api/rental-events/${Number(id)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ password })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Não foi possível excluir a locação.');
            return;
        }

        await loadRentalEvents();
        await loadRentalReturnAlerts();
        alert(`${name} excluído com sucesso.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function deleteEquipment(id, name) {
    const password = requestDeletePassword();
    if (password === null) return;

    try {
        const response = await fetch(`/api/equipments/${Number(id)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ password })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Não foi possível excluir o equipamento.');
            return;
        }

        await Promise.all([loadEquipments(getEquipmentSearchValue()), loadMaintenanceEquipments()]);
        alert(`${name} excluído com sucesso.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function deleteCable(id, name) {
    const password = requestDeletePassword();
    if (password === null) return;

    try {
        const response = await fetch(`/api/cables/${Number(id)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ password })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Não foi possível excluir o cabo.');
            return;
        }

        await Promise.all([loadCables(getEquipmentSearchValue()), loadMaintenanceCables()]);
        alert(`${name} excluído com sucesso.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function deleteOtherItem(id, name) {
    const password = requestDeletePassword();
    if (password === null) return;

    try {
        const response = await fetch(`/api/other-items/${Number(id)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ password })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Não foi possível excluir o item.');
            return;
        }

        await loadOtherItems(getEquipmentSearchValue());
        alert(`${name} excluído com sucesso.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

function renderCableMaintenanceList(cables) {
    const list = document.getElementById('maintenanceCableList');
    const count = document.getElementById('maintenanceCableCount');
    if (!list || !count) return;

    count.textContent = `${cables.length} ${cables.length === 1 ? 'item' : 'itens'}`;
    list.innerHTML = '';

    if (cables.length === 0) {
        list.innerHTML = '<p class="empty-state">Nenhum cabo em manutenção.</p>';
        return;
    }

    cables
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
        .forEach((cable) => {
            const item = document.createElement('div');
            item.className = 'maintenance-item';
            item.innerHTML = `
                <div class="maintenance-item-info">
                    <h3>${escapeHtml(cable.name)}</h3>
                    <p class="maintenance-meta">Em manutenção: ${escapeHtml(Number(cable.maintenance_quantity) || 0)} | Desde: ${escapeHtml(formatDateTime(cable.maintenance_started_at))}</p>
                    <p class="maintenance-problem"><strong>Problema:</strong> ${escapeHtml(cable.maintenance_description || 'Sem descrição.')}</p>
                </div>
                <button type="button" class="btn-ready" onclick="markCableMaintenanceReady(${cable.id})">Pronto</button>
            `;
            list.appendChild(item);
        });
}

async function loadCables(search = '') {
    cableLoadController?.abort();
    const controller = new AbortController();
    const requestSequence = ++cableLoadSequence;
    cableLoadController = controller;

    try {
        const response = await fetch(`/api/cables?search=${encodeURIComponent(search)}`, {
            credentials: 'include',
            signal: controller.signal
        });
        if (requestSequence !== cableLoadSequence) return;
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const cables = await response.json();
        if (requestSequence !== cableLoadSequence) return;
        allCables = cables;
        populateCableCategoryOptions(allCables);
        renderCables(allCables);
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error(error);
    } finally {
        if (cableLoadController === controller) {
            cableLoadController = null;
        }
    }
}

function renderOtherItems(items) {
    const tbody = document.querySelector('#otherItemsTable tbody');
    if (!tbody) return;
    const relacaoEventId = localStorage.getItem('relacao_event_id');
    const showInitialQuantityEdit = !relacaoEventId && canEditInitialQuantity();
    const theadRow = document.querySelector('#otherItemsTable thead tr');
    const columnCount = 4;

    if (theadRow) {
        theadRow.innerHTML = `
            <th>Nome</th>
            <th class="cable-quantity-column">Quantidade Inicial</th>
            <th class="cable-quantity-column">Quantidade Atual</th>
            <th></th>
        `;
    }

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columnCount}" class="empty-row">Nenhum item encontrado.</td></tr>`;
        return;
    }

    const topicOrder = [
        'TOPICO: PERIFERICOS INTERNET',
        'TOPICO: PERIFERICOS VIDEO',
        'TOPICO: PERIFERICOS SONORIZA\u00c7AO',
        'Outros'
    ];
    const topicIndex = new Map(topicOrder.map((topic, index) => [topic, index]));
    const groupedItems = new Map();
    const rowsFragment = document.createDocumentFragment();

    items.forEach((item) => {
        const category = String(item.category || 'Outros').trim() || 'Outros';
        if (!groupedItems.has(category)) groupedItems.set(category, []);
        groupedItems.get(category).push(item);
    });

    Array.from(groupedItems.entries())
        .sort((a, b) => {
            const aIndex = topicIndex.has(a[0]) ? topicIndex.get(a[0]) : Number.MAX_SAFE_INTEGER;
            const bIndex = topicIndex.has(b[0]) ? topicIndex.get(b[0]) : Number.MAX_SAFE_INTEGER;
            if (aIndex !== bIndex) return aIndex - bIndex;
            return String(a[0]).localeCompare(String(b[0]), 'pt-BR', { numeric: true });
        })
        .forEach(([category, groupItems]) => {
            const categoryRow = document.createElement('tr');
            categoryRow.className = 'category-row';
            categoryRow.innerHTML = `<td colspan="${columnCount}" class="categoria-titulo">${escapeHtml(category)}</td>`;
            rowsFragment.appendChild(categoryRow);

            groupItems
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
                .forEach((item) => {
            const actionButtons = relacaoEventId
                ? [`<button type="button" class="btn-primary btn-small" onclick="adicionarOutroARelacao(${item.id}, '${escapeJsString(item.name)}', ${Number(item.available_quantity) || 0})">Adicionar</button>`]
                : [
                    showInitialQuantityEdit ? `<button type="button" class="btn-primary btn-delete-mini" onclick="editOtherItemInitialQuantity(${item.id}, '${escapeJsString(item.name)}', ${Number(item.quantity) || 0})">Editar</button>` : '',
                    `<button type="button" class="btn-danger btn-delete-mini" onclick="deleteOtherItem(${item.id}, '${escapeJsString(item.name)}')">Excluir</button>`
                ].filter(Boolean);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="other-item-name-cell">${escapeHtml(item.name)}</td>
                <td class="cable-quantity-cell cable-quantity-column">${escapeHtml(item.quantity)}</td>
                <td class="cable-quantity-cell cable-quantity-column cable-available-quantity-cell" style="color: #2ecc71;">${escapeHtml(item.available_quantity)}</td>
                <td><div class="table-action-buttons">${actionButtons.join('')}</div></td>
            `;
            rowsFragment.appendChild(row);
        });
        });

    tbody.replaceChildren(rowsFragment);
}

function adicionarOutroARelacao(id, name, availableQuantity) {
    const eventId = localStorage.getItem('relacao_event_id');
    if (!eventId) return;

    const maxQuantity = Number(availableQuantity) || 0;
    if (maxQuantity <= 0) {
        alert('Este item não possui quantidade disponível.');
        return;
    }

    const input = prompt(`Quantidade de ${name}:`, '1');
    if (input === null) return;

    const quantity = Number(input);
    if (!Number.isInteger(quantity) || quantity <= 0) {
        alert('Quantidade inválida.');
        return;
    }

    if (quantity > maxQuantity) {
        alert('Quantidade maior que a disponível.');
        return;
    }

    const pendingKey = `pending_other_items_${eventId}`;
    const pendingItems = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    const spaceId = getRelacaoSpaceId();
    const existing = pendingItems.find((item) => (
        Number(item.id) === Number(id) && isSameRelacaoSpace(item.spaceId, spaceId)
    ));

    if (existing) {
        existing.quantity = quantity;
    } else {
        pendingItems.push({ id: Number(id), name, quantity, spaceId });
    }

    localStorage.setItem(pendingKey, JSON.stringify(pendingItems));
    alert(`${name} adicionado ao evento.`);
}

async function loadOtherItems(search = '') {
    otherItemLoadController?.abort();
    const controller = new AbortController();
    const requestSequence = ++otherItemLoadSequence;
    otherItemLoadController = controller;

    try {
        const response = await fetch(`/api/other-items?search=${encodeURIComponent(search)}`, {
            credentials: 'include',
            signal: controller.signal
        });
        if (requestSequence !== otherItemLoadSequence) return;
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const items = await response.json();
        if (requestSequence !== otherItemLoadSequence) return;
        allOtherItems = items;
        renderOtherItems(allOtherItems);
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error(error);
    } finally {
        if (otherItemLoadController === controller) {
            otherItemLoadController = null;
        }
    }
}

async function loadMaintenanceCables() {
    try {
        const response = await fetch('/api/cables', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const cables = await response.json();
        maintenanceCables = cables.filter((cable) => Number(cable.maintenance_quantity) > 0);
        renderCableMaintenanceList(maintenanceCables);
    } catch (error) {
        console.error(error);
    }
}

async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });

        if (!response.ok) {
            alert('Não foi possível encerrar a sessão.');
            return;
        }

        clearPendingItems();
        clearRelacaoContext();
        window.location.href = '/login.html';
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

document.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isEquip = e.target.id === 'equipmentForm';
    const isEvent = e.target.id === 'eventForm';
    const isCable = e.target.id === 'cableForm';
    const isOtherItem = e.target.id === 'otherItemForm';
    const isRental = e.target.id === 'rentalForm';
    const isQuote = e.target.id === 'quoteForm';
    const isEquipmentEdit = e.target.id === 'editEquipmentForm';
    if (!isEquip && !isEvent && !isCable && !isOtherItem && !isRental && !isQuote && !isEquipmentEdit) return;

    if (isEquipmentEdit) {
        await submitEquipmentEdit();
        return;
    }

    if (isQuote) {
        await createQuote();
        return;
    }

    const data = isEquip
        ? {
            name: document.getElementById('equipmentName').value.trim(),
            barcode: document.getElementById('equipmentBarcode').value.trim(),
            category: document.getElementById('equipmentCategory').value,
            serialNumber: document.getElementById('equipmentSerialNumber').value.trim() || '-',
            observation: document.getElementById('equipmentObservation').value.trim() || '-'
        }
        : isCable
        ? {
            name: document.getElementById('cableName').value.trim(),
            quantity: Number(document.getElementById('cableQuantity').value),
            category: document.getElementById('cableCategory').value.trim()
        }
        : isOtherItem
        ? {
            name: document.getElementById('otherItemName').value.trim(),
            quantity: Number(document.getElementById('otherItemQuantity').value)
        }
        : isRental
        ? {
            name: document.getElementById('rentalEventName').value.trim(),
            withdrawalDate: document.getElementById('rentalWithdrawalDate').value,
            returnDate: document.getElementById('rentalReturnDate').value
        }
        : {
            name: document.getElementById('eventName').value.trim(),
            date: document.getElementById('eventDate').value,
            endDate: document.getElementById('eventEndDate').value
        };

    if (isEvent && data.endDate < data.date) {
        alert('A data final não pode ser anterior à data inicial.');
        return;
    }

    if (isRental && data.returnDate < data.withdrawalDate) {
        alert('A data de devolução não pode ser anterior à data de retirada.');
        return;
    }

    try {
        const res = await fetch(
            isEquip ? '/api/equipments' : (isCable ? '/api/cables' : (isOtherItem ? '/api/other-items' : (isRental ? '/api/rental-events' : '/api/events'))),
            {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include'
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            alert(error.error || 'Não foi possível salvar.');
            return;
        }

        const shouldKeepCadastroScroll = isEquip || isCable || isOtherItem;
        const cadastroScrollTop = window.scrollY;
        const cadastroScrollLeft = window.scrollX;

        e.target.reset();
        if (isEquip) populateCategoryOptions();
        if (isCable) populateCableCategoryOptions();
        alert(
            isEquip
                ? 'Equipamento cadastrado com sucesso.'
                : (isCable ? 'Cabo cadastrado com sucesso.' : (isOtherItem ? 'Item cadastrado com sucesso.' : (isRental ? 'Locação criada com sucesso.' : 'Evento criado com sucesso.')))
        );

        if (isRental) {
            closeRentalModal();
            showSection('locacao');
            await loadRentalEvents();
            await loadRentalReturnAlerts();
        } else if (isEvent) {
            showSection('home');
            await loadEvents();
        } else if (isCable) {
            showSection('cadastro');
            setCadastroTab('cabos');
        } else if (isOtherItem) {
            showSection('cadastro');
            setCadastroTab('outros');
        } else {
            showSection('cadastro');
            setCadastroTab('equipamentos');
        }

        if (shouldKeepCadastroScroll) {
            restorePageScroll(cadastroScrollTop, cadastroScrollLeft);
        }
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
});

async function handleMaintenanceKeyPress(event) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    await searchMaintenanceEquipment();
}

async function handleMaintenanceCableKeyPress(event) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    await searchMaintenanceCable();
}

async function searchMaintenanceEquipment() {
    const barcode = document.getElementById('maintenanceBarcode')?.value.trim();
    if (!barcode) return;

    try {
        const response = await fetch(`/api/equipments?search=${encodeURIComponent(barcode)}`, { credentials: 'include' });
        if (!response.ok) {
            alert('Não foi possível buscar o equipamento.');
            return;
        }

        const equipments = await response.json();
        const equipment = equipments.find((item) => item.barcode === barcode) || equipments[0];

        if (!equipment) {
            alert('Equipamento não encontrado.');
            clearMaintenance();
            return;
        }

        selectedMaintenanceItem = equipment;
        selectedMaintenanceType = 'equipamento';
        openMaintenanceModal('create', equipment, 'equipamento');
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function searchMaintenanceCable() {
    const cableName = document.getElementById('maintenanceCableName')?.value.trim();
    if (!cableName) return;

    try {
        const response = await fetch(`/api/cables?search=${encodeURIComponent(cableName)}`, { credentials: 'include' });
        if (!response.ok) {
            alert('Não foi possível buscar o cabo.');
            return;
        }

        const cables = await response.json();
        const normalizedName = cableName.toLowerCase();
        const cable = cables.find((item) => String(item.name || '').toLowerCase() === normalizedName) || cables[0];

        if (!cable) {
            alert('Cabo não encontrado.');
            clearMaintenance();
            return;
        }

        selectedMaintenanceItem = cable;
        selectedMaintenanceType = 'cabo';
        openMaintenanceModal('create', cable, 'cabo');
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

function openMaintenanceModal(mode, item, itemType = 'equipamento') {
    maintenanceModalMode = mode;

    const modal = document.getElementById('maintenanceModal');
    const title = document.getElementById('maintenanceModalTitle');
    const subtitle = document.getElementById('maintenanceModalSubtitle');
    const label = document.getElementById('maintenanceModalLabel');
    const input = document.getElementById('maintenanceModalInput');
    const action = document.getElementById('maintenanceModalAction');
    const quantityGroup = document.getElementById('maintenanceModalQuantityGroup');
    const quantityInput = document.getElementById('maintenanceModalQuantity');
    const itemLabel = itemType === 'cabo' ? 'Cabo' : 'Equipamento';

    if (!modal || !title || !subtitle || !label || !input || !action) return;

    if (mode === 'create') {
        title.textContent = 'Registrar problema';
        subtitle.textContent = `${itemLabel}: ${item.name}`;
        label.textContent = 'Qual o problema?';
        input.value = '';
        input.placeholder = 'Descreva o problema...';
        input.readOnly = false;
        action.style.display = '';
        action.textContent = 'Salvar';
        if (quantityGroup) quantityGroup.style.display = itemType === 'cabo' ? '' : 'none';
        if (quantityInput) {
            quantityInput.value = '1';
            quantityInput.max = String(Math.max(1, Number(item.available_quantity) || 1));
        }
        setTimeout(() => input.focus(), 0);
        return modal.style.display = 'flex';
    }

    title.textContent = `Problema do ${itemType === 'cabo' ? 'cabo' : 'equipamento'}`;
    subtitle.textContent = `${itemLabel}: ${item.name}`;
    label.textContent = 'Descrição';
    input.value = item.maintenance_description || 'Sem descrição.';
    input.readOnly = true;
    action.style.display = 'none';
    if (quantityGroup) quantityGroup.style.display = 'none';
    modal.style.display = 'flex';
}

function closeMaintenanceModal() {
    const modal = document.getElementById('maintenanceModal');
    const input = document.getElementById('maintenanceModalInput');
    const quantityGroup = document.getElementById('maintenanceModalQuantityGroup');
    if (modal) modal.style.display = 'none';
    if (input) {
        input.value = '';
        input.readOnly = false;
    }
    if (quantityGroup) quantityGroup.style.display = 'none';
    maintenanceModalMode = null;
}

async function handleMaintenanceModalKeyPress(event) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (maintenanceModalMode !== 'create') return;

    event.preventDefault();
    await saveMaintenance();
}

function setupMaintenanceModal() {
    const modal = document.getElementById('maintenanceModal');
    const input = document.getElementById('maintenanceModalInput');

    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeMaintenanceModal();
            }
        });
    }

    const detailsModal = document.getElementById('cableMaintenanceDetailsModal');
    if (detailsModal) {
        detailsModal.addEventListener('click', (event) => {
            if (event.target === detailsModal) closeCableMaintenanceDetailsModal();
        });
    }

    if (input) {
        input.addEventListener('keypress', handleMaintenanceModalKeyPress);
    }
}

function openMaintenanceDetails(equipmentId) {
    const equipment = allEquipments.find((item) => Number(item.id) === Number(equipmentId));
    if (!equipment) {
        alert('Equipamento não encontrado.');
        return;
    }

    openMaintenanceModal('view', equipment, 'equipamento');
}

function openCableMaintenanceDetails(cableId) {
    openCableMaintenanceSummary(cableId);
}

async function openCableMaintenanceSummary(cableId) {
    const cable = allCables.find((item) => Number(item.id) === Number(cableId));
    const modal = document.getElementById('cableMaintenanceDetailsModal');
    const subtitle = document.getElementById('cableMaintenanceDetailsSubtitle');
    const summary = document.getElementById('cableMaintenanceDetailsSummary');
    const list = document.getElementById('cableMaintenanceDetailsList');
    if (!modal || !subtitle || !summary || !list) return;

    subtitle.textContent = cable?.name || 'Carregando cabo...';
    summary.textContent = 'Carregando informações...';
    list.innerHTML = '';
    modal.style.display = 'flex';

    try {
        const response = await fetch(`/api/cables/${Number(cableId)}/maintenances`, { credentials: 'include' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível consultar as manutenções.');

        const maintenanceQuantity = Number(data.maintenanceQuantity) || 0;
        const maintenances = Array.isArray(data.maintenances) ? data.maintenances : [];
        subtitle.textContent = data.cable?.name || cable?.name || 'Cabo';
        summary.innerHTML = `<strong>${escapeHtml(maintenanceQuantity)}</strong> ${maintenanceQuantity === 1 ? 'cabo está' : 'cabos estão'} em manutenção.`;

        if (maintenances.length === 0) {
            list.innerHTML = '<p class="empty-state">Nenhuma unidade deste cabo está em manutenção.</p>';
            return;
        }

        list.innerHTML = maintenances.map((maintenance) => `
            <div class="cable-maintenance-detail-item">
                <span class="cable-maintenance-detail-quantity">${escapeHtml(Number(maintenance.quantity) || 0)} ${Number(maintenance.quantity) === 1 ? 'unidade' : 'unidades'}</span>
                <span class="cable-maintenance-detail-date">Entrada: ${escapeHtml(formatDateTime(maintenance.created_at))}</span>
                <span class="cable-maintenance-detail-description">${escapeHtml(maintenance.description || 'Sem descrição.')}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error(error);
        summary.textContent = error.message || 'Não foi possível consultar as manutenções.';
        list.innerHTML = '';
    }
}

function closeCableMaintenanceDetailsModal() {
    const modal = document.getElementById('cableMaintenanceDetailsModal');
    if (modal) modal.style.display = 'none';
}

async function submitMaintenanceModal() {
    if (maintenanceModalMode !== 'create') return;
    await saveMaintenance();
}

async function saveMaintenance() {
    if (!selectedMaintenanceItem) {
        alert(`Busque um ${selectedMaintenanceType === 'cabo' ? 'cabo' : 'equipamento'} antes de registrar a manutenção.`);
        return;
    }

    const description = document.getElementById('maintenanceModalInput')?.value.trim();
    if (!description) {
        alert('Descreva o problema antes de salvar.');
        return;
    }

    const quantity = selectedMaintenanceType === 'cabo'
        ? Number(document.getElementById('maintenanceModalQuantity')?.value)
        : null;
    if (selectedMaintenanceType === 'cabo' && (!Number.isInteger(quantity) || quantity <= 0)) {
        alert('Informe uma quantidade válida para manutenção.');
        return;
    }

    try {
        const response = await fetch(selectedMaintenanceType === 'cabo' ? '/api/cable-maintenances' : '/api/maintenances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(
                selectedMaintenanceType === 'cabo'
                    ? { cableId: selectedMaintenanceItem.id, description, quantity }
                    : { equipmentId: selectedMaintenanceItem.id, description }
            )
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Não foi possível registrar a manutenção.');
            return;
        }

        alert('Manutenção registrada com sucesso.');
        closeMaintenanceModal();
        clearMaintenance();
        if (selectedMaintenanceType === 'cabo') {
            await Promise.all([loadCables(getEquipmentSearchValue()), loadMaintenanceCables()]);
        } else {
            await Promise.all([loadEquipments(getEquipmentSearchValue()), loadMaintenanceEquipments()]);
        }
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function markMaintenanceReady(equipmentId) {
    const equipment = maintenanceEquipments.find((item) => Number(item.id) === Number(equipmentId));
    if (!equipment) {
        alert('Equipamento não encontrado.');
        return;
    }

    try {
        const response = await fetch(`/api/maintenances/${Number(equipmentId)}/ready`, {
            method: 'PATCH',
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Não foi possível finalizar a manutenção.');
            return;
        }

        await loadMaintenanceEquipments();
        await loadEquipments(getEquipmentSearchValue());
        alert(`${equipment.name} marcado como disponível.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

async function markCableMaintenanceReady(cableId) {
    const cable = maintenanceCables.find((item) => Number(item.id) === Number(cableId));
    if (!cable) {
        alert('Cabo não encontrado.');
        return;
    }

    try {
        const response = await fetch(`/api/cable-maintenances/${Number(cableId)}/ready`, {
            method: 'PATCH',
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Não foi possível finalizar a manutenção do cabo.');
            return;
        }

        await Promise.all([loadMaintenanceCables(), loadCables(getEquipmentSearchValue())]);
        alert(`${cable.name} marcado como pronto.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexão.');
    }
}

function clearMaintenance() {
    selectedMaintenanceItem = null;
    const maintenanceBarcode = document.getElementById('maintenanceBarcode');
    const maintenanceCableName = document.getElementById('maintenanceCableName');
    if (maintenanceBarcode) maintenanceBarcode.value = '';
    if (maintenanceCableName) maintenanceCableName.value = '';
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function formatEventPeriod(startDate, endDate = startDate) {
    const start = formatDate(startDate);
    const end = formatDate(endDate || startDate);
    if (!start) return '';
    return end && end !== start ? `${start} até ${end}` : start;
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR');
}

function applyLoginManagementVisibility() {
    const isCommercial = !!currentUser?.isCommercial;
    document.body.classList.toggle('commercial-mode', isCommercial);

    document.querySelectorAll('.menu ul li').forEach((item) => {
        const onclick = item.querySelector('.menu-item')?.getAttribute('onclick') || '';
        const sectionId = onclick.match(/showSection\(['"]([^'"]+)['"]\)/)?.[1] || '';
        item.style.display = canAccessSection(sectionId) ? '' : 'none';
    });

    document.querySelectorAll('.menu-group').forEach((group) => {
        const hasVisibleMenuItem = [...group.querySelectorAll('li')]
            .some((item) => item.style.display !== 'none');
        group.hidden = !hasVisibleMenuItem;
    });
}

function setUsersMessage(message, type = '') {
    const messageEl = document.getElementById('usersMessage');
    if (!messageEl) return;
    messageEl.textContent = message || '';
    messageEl.className = `users-message ${type}`.trim();
}

function toggleCreateUserForm(forceOpen) {
    const form = document.getElementById('createUserForm');
    if (!form) return;

    const shouldOpen = typeof forceOpen === 'boolean'
        ? forceOpen
        : form.style.display === 'none';
    form.style.display = shouldOpen ? '' : 'none';

    if (!shouldOpen) {
        form.reset();
    }
}

async function loadLoginUsers() {
    if (!currentUser?.isAdmin) return;

    try {
        const response = await fetch('/api/users', { credentials: 'include' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setUsersMessage(data.error || 'Não foi possível carregar os usuários.', 'error');
            return;
        }

        loginUsers = Array.isArray(data.users) ? data.users : [];
        canChangeUserPasswords = !!data.canChangePasswords;
        const createButton = document.getElementById('openUserCreateButton');
        if (createButton) {
            createButton.style.display = canChangeUserPasswords ? '' : 'none';
        }
        renderLoginUsers();
        setUsersMessage('');
    } catch (error) {
        console.error(error);
        setUsersMessage('Erro de conexão.', 'error');
    }
}

function renderLoginUsers() {
    const tbody = document.querySelector('#usersTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    loginUsers.forEach((user) => {
        const userId = Number(user.id);
        const canEdit = canChangeUserPasswords && currentUser?.isAdmin;
        const canDelete = canEdit && Number(user.id) !== Number(currentUser?.userId);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(user.username)}</td>
            <td><span class="user-role-badge ${user.role === 'admin' ? 'admin' : (user.role === 'comercial' ? 'comercial' : '')}">${escapeHtml(user.role || 'user')}</span></td>
            <td>
                <input
                    type="password"
                    id="userPassword_${userId}"
                    class="user-password-input"
                    placeholder="${canEdit ? 'Nova senha' : 'Restrito'}"
                    autocomplete="new-password"
                    ${canEdit ? '' : 'disabled'}
                >
            </td>
            <td class="user-actions-cell">
                <button type="button" class="btn-primary user-password-button" onclick="changeUserPassword(${userId})" ${canEdit ? '' : 'disabled'}>Salvar</button>
                <button type="button" class="btn-danger user-password-button" onclick="deleteLoginUser(${userId})" ${canDelete ? '' : 'disabled'}>Excluir</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function changeUserPassword(userId) {
    const input = document.getElementById(`userPassword_${Number(userId)}`);
    const password = String(input?.value || '');
    if (password.trim().length < 4) {
        setUsersMessage('A senha deve ter pelo menos 4 caracteres.', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/users/${Number(userId)}/password`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ password })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setUsersMessage(data.error || 'Não foi possível alterar a senha.', 'error');
            return;
        }

        input.value = '';
        setUsersMessage('Senha atualizada com segurança.', 'success');
    } catch (error) {
        console.error(error);
        setUsersMessage('Erro de conexão.', 'error');
    }
}

async function createLoginUser(event) {
    event.preventDefault();
    if (!canChangeUserPasswords || !currentUser?.isAdmin) {
        setUsersMessage('Apenas administradores podem cadastrar usuários.', 'error');
        return;
    }

    const username = String(document.getElementById('newUsername')?.value || '').trim();
    const password = String(document.getElementById('newUserPassword')?.value || '');
    const role = String(document.getElementById('newUserRole')?.value || 'user').trim();

    if (!username) {
        setUsersMessage('Informe o usuário.', 'error');
        return;
    }

    if (password.trim().length < 4) {
        setUsersMessage('A senha deve ter pelo menos 4 caracteres.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password, role })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setUsersMessage(data.error || 'Não foi possível cadastrar o usuário.', 'error');
            return;
        }

        toggleCreateUserForm(false);
        await loadLoginUsers();
        setUsersMessage('Usuário cadastrado com segurança.', 'success');
    } catch (error) {
        console.error(error);
        setUsersMessage('Erro de conexão.', 'error');
    }
}

async function deleteLoginUser(userId) {
    const user = loginUsers.find((item) => Number(item.id) === Number(userId));
    if (!user) {
        setUsersMessage('Usuário não encontrado.', 'error');
        return;
    }

    if (Number(user.id) === Number(currentUser?.userId)) {
        setUsersMessage('Você não pode excluir seu próprio usuário.', 'error');
        return;
    }

    const confirmed = window.confirm(`Excluir o usuário ${user.username}?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/users/${Number(userId)}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setUsersMessage(data.error || 'Não foi possível excluir o usuário.', 'error');
            return;
        }

        await loadLoginUsers();
        setUsersMessage('Usuário excluído.', 'success');
    } catch (error) {
        console.error(error);
        setUsersMessage('Erro de conexão.', 'error');
    }
}

async function checkAuth() {
    try {
        const res = await fetch('/api/auth/status', { credentials: 'include' });
        const data = await res.json();
        if (!data.authenticated) window.location.href = '/login.html';
        currentUser = data.authenticated
            ? {
                userId: data.userId || null,
                username: data.username || '',
                role: data.role || 'user',
                isAdmin: !!data.isAdmin,
                isCommercial: !!data.isCommercial,
                canEditInitialQuantity: data.canEditInitialQuantity ?? String(data.username || '').trim().toLowerCase() === 'arthur',
                localStarlinkTabEnabled: !!data.localStarlinkTabEnabled
            }
            : null;
        applyLoginManagementVisibility();
    } catch (error) {
        window.location.href = '/login.html';
    }
}

function setSidebarCollapsed(collapsed, persist = true) {
    const container = document.querySelector('.dashboard-container');
    const toggle = document.getElementById('sidebarToggle');
    if (!container || !toggle) return;

    container.classList.toggle('sidebar-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Mostrar menu' : 'Ocultar menu');
    toggle.querySelector('span').textContent = collapsed ? '›' : '‹';
    if (persist) localStorage.setItem('dashboardSidebarCollapsed', collapsed ? 'true' : 'false');
}

function toggleSidebar() {
    const container = document.querySelector('.dashboard-container');
    if (!container) return;
    setSidebarCollapsed(!container.classList.contains('sidebar-collapsed'));
}

function setupSidebarMenuAutoCollapse() {
    const menu = document.querySelector('.sidebar .menu');
    if (!menu || menu.dataset.autoCollapseReady === 'true') return;

    menu.dataset.autoCollapseReady = 'true';
    menu.addEventListener('click', (event) => {
        const menuItem = event.target.closest('.menu-item');
        if (!menuItem || !menu.contains(menuItem)) return;
        if (!/showSection\(['"]/.test(menuItem.getAttribute('onclick') || '')) return;
        if (!window.matchMedia('(min-width: 769px)').matches) return;

        // O onclick do item escolhe a tela primeiro; em seguida recolhemos só o menu.
        window.setTimeout(() => setSidebarCollapsed(true), 0);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    setSidebarCollapsed(localStorage.getItem('dashboardSidebarCollapsed') === 'true', false);
    setupSidebarMenuAutoCollapse();
    populateCategoryOptions();
    populateCableCategoryOptions();
    setupMaintenanceModal();
    setupOperatorModals();
    setupQuoteInputMasks();
    document.getElementById('createUserForm')?.addEventListener('submit', createLoginUser);
    document.getElementById('quoteFinalTotal')?.addEventListener('input', () => {
        quoteFinalEdited = true;
    });
    initializeQuoteForm(true);
    await checkAuth();

    const urlParams = new URLSearchParams(window.location.search);
    const requestedSection = urlParams.get('section') || window.location.hash.replace('#', '');
    const section = canAccessSection(requestedSection)
        ? requestedSection
        : getDefaultSectionForCurrentUser();
    showSection(section);
});

