const EQUIPMENT_CATEGORIES = [
    'Tripe',
    'Caixa de som',
    'Mesa de som',
    'Antenas MGA',
    'Microfones',
    'Perifericos som',
    'Tripe de camera',
    'Camera',
    'Mesa de corte',
    'Link sem fio',
    'Conversor',
    'Radios',
    'Ilhas de video',
    'Placas de video',
    'Placas de audio',
    'Spliter',
    'Passador de slide',
    'Extender',
    'Emenda hdmi',
    'Notbook',
    'Projetor',
    'WI-FI 5g',
    'Switch',
    'Elsys',
    'Extender fibra/rede',
    'Starlink',
    'Outros',
    'Monitor',
    'TV',
    'Totem led',
    'Ribalta',
    'Wash',
    'Bean/moving',
    'Coby',
    'Parled',
    'Brut',
    'Strobe',
    'Maquina de fumaca',
    'Spliter luz',
    'Mesa de luz',
    'Ribalta fina',
    'Lazer',
    'Drone',
    'Propower',
    'Powerbank',
    'Pentacustica',
    'Gerador',
    'Transformador',
    'Nobreak',
    'Inversor',
    'Mouse'
];

let allEvents = [];
let allScheduledEvents = [];
let allRentalEvents = [];
let allHistoryEvents = [];
let allHistoryRentals = [];
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
let allOperators = [];
let editingOperatorId = null;
let allQuotes = [];
let allApprovedQuotes = [];
let allPaymentEntries = [];
let quoteItems = [];
let quoteTechnicians = [];
let editingQuoteId = null;
let quoteFinalEdited = false;
let quoteEquipmentSuggestions = [];
let quoteEquipmentSearchTimer = null;
let quoteTechnicianSuggestions = [];
let quoteTechnicianSearchTimer = null;
const quoteScheduledEquipmentIds = new Set();
let approvedQuotesCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedApprovedQuoteDateKey = '';
let paymentCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedPaymentDateKey = '';

const APPROVED_CALENDAR_MONTHS = [
    'Janeiro',
    'Fevereiro',
    'Marco',
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

function canEditInitialQuantity() {
    return !!currentUser?.canEditInitialQuantity;
}

function canAccessQuotes() {
    return !!(currentUser?.isAdmin || currentUser?.isCommercial);
}

function canAccessOperators() {
    return !!(currentUser?.isAdmin || currentUser?.isCommercial);
}

function canAccessPaymentCalendar() {
    return currentUser?.role === 'comercial' || !!currentUser?.isCommercial;
}

function canManagePrices() {
    return !!currentUser?.isAdmin;
}

function canManageQuoteDatabase() {
    return !!currentUser?.isAdmin;
}

function canAccessScheduledEvents() {
    return currentUser?.role === 'admin' || currentUser?.role === 'user';
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

function closeAvailabilityConflictModal() {
    const modal = document.getElementById('availabilityConflictModal');
    if (modal) modal.style.display = 'none';
}

function showAvailabilityConflictModal(conflict) {
    if (!conflict) return false;

    const modal = document.getElementById('availabilityConflictModal');
    const details = document.getElementById('availabilityConflictDetails');
    if (!modal || !details) return false;

    const currentPeriod = `${conflict.currentStartLabel || '-'} ate ${conflict.currentEndLabel || '-'}`;
    const reservationPeriod = `${conflict.reservationStartLabel || '-'} ate ${conflict.reservationEndLabel || '-'}`;
    details.innerHTML = `
        <div class="availability-conflict-item full">
            <span class="availability-conflict-label">Aviso</span>
            <div class="availability-conflict-value">Este patrimonio nao pode sair para este evento porque existe uma reserva no mesmo periodo.</div>
        </div>
        <div class="availability-conflict-item full">
            <span class="availability-conflict-label">Patrimonio afetado</span>
            <div class="availability-conflict-value">${escapeHtml(conflict.equipmentName || 'Patrimonio')}</div>
        </div>
        <div class="availability-conflict-item full">
            <span class="availability-conflict-label">Evento que esta causando o conflito</span>
            <div class="availability-conflict-value">${escapeHtml(conflict.blockingEventName || 'Reserva existente')}</div>
        </div>
        <div class="availability-conflict-item">
            <span class="availability-conflict-label">Periodo do evento atual</span>
            <div class="availability-conflict-value">${escapeHtml(currentPeriod)}</div>
        </div>
        <div class="availability-conflict-item">
            <span class="availability-conflict-label">Periodo da reserva existente</span>
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
    const isDisponivel = !normalized || normalized === 'disponivel' || raw === 'disponÃ­vel';
    const isPreSeparado = raw === 'pre separado';
    const isRelacao = normalized === 'relacao' || raw === 'relaÃ§Ã£o';
    const isAgendado = normalized === 'agendado';
    const isManutencao = raw.includes('manut');

    if (isPreSeparado) return { text: 'Pre separado', className: 'badge-relation' };
    if (isRelacao) return { text: 'Relacao', className: 'badge-relation' };
    if (isAgendado) return { text: 'Agendado', className: 'badge-scheduled' };
    if (isManutencao) return { text: 'Em Manutencao', className: 'badge-maintenance' };
    if (isDisponivel) return { text: 'Disponivel', className: 'badge-available' };
    return { text: 'Indisponivel', className: 'badge-unavailable' };
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
    if (currentUser?.isCommercial && !['orcamentos', 'orcamentosAprovados', 'calendarioPagamento', 'gerenciarOrcamentos', 'orcamentoCriar', 'operadores'].includes(sectionId)) {
        sectionId = 'orcamentos';
    }

    if (['orcamentos', 'orcamentosAprovados', 'gerenciarOrcamentos', 'orcamentoCriar'].includes(sectionId) && !canAccessQuotes()) {
        sectionId = 'home';
    }

    if (sectionId === 'calendarioPagamento' && !canAccessPaymentCalendar()) {
        sectionId = currentUser?.isCommercial ? 'calendarioPagamento' : 'home';
    }

    if (sectionId === 'bancoOrcamentos' && !canManageQuoteDatabase()) {
        sectionId = currentUser?.isCommercial ? 'orcamentos' : 'home';
    }

    if (sectionId === 'eventosAgendados' && !canAccessScheduledEvents()) {
        sectionId = currentUser?.isCommercial ? 'orcamentos' : 'home';
    }

    if (sectionId === 'operadores' && !canAccessOperators()) {
        sectionId = currentUser?.isCommercial ? 'orcamentos' : 'home';
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
    if (sectionId === 'eventosAgendados') loadScheduledEvents();
    if (sectionId === 'cadastro') setCadastroTab(activeCadastroTab);
    if (sectionId === 'banco') setBancoTab(activeBancoTab);
    if (sectionId === 'bancoOrcamentos') loadQuoteDatabaseEquipments();
    if (sectionId === 'historico') loadHistoryEvents();
    if (sectionId === 'usuarios') loadLoginUsers();
    if (sectionId === 'orcamentos') loadQuotes();
    if (sectionId === 'orcamentosAprovados') loadApprovedQuotes();
    if (sectionId === 'calendarioPagamento') loadPaymentCalendar();
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

function getScheduledEventSearchValue() {
    return (document.getElementById('searchScheduledEventInput')?.value || '').trim();
}

function getQuoteDatabaseSearchValue() {
    return (document.getElementById('quoteDatabaseSearchInput')?.value || '').trim();
}

function searchDatabase() {
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

function searchQuoteDatabase() {
    loadQuoteDatabaseEquipments(getQuoteDatabaseSearchValue());
}

function searchEvents() {
    renderEvents(allEvents, getEventSearchValue());
}

function searchScheduledEvents() {
    renderScheduledEvents(allScheduledEvents, getScheduledEventSearchValue());
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
    if (digits.length === 8) return `${startDate} ate `;

    return `${startDate} ate ${formatQuoteDateInput(digits.slice(8))}`;
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
    return `${startDate} ate ${endDate}`;
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

function formatQuoteDaysInput(value) {
    const digits = getInputDigits(value, 4).replace(/^0+(?=\d)/, '');
    if (!digits) return '';

    const days = Number(digits);
    return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

function setQuoteMaskedFieldValidity(input, type) {
    if (!input) return true;

    const value = input.value.trim();
    let isValid = true;
    let message = '';

    if (value && type === 'date' && !isValidQuoteDate(value)) {
        isValid = false;
        message = 'Informe uma data valida no formato DD/MM/AAAA.';
    }

    if (value && type === 'datetime' && !isValidQuoteDateTime(value)) {
        isValid = false;
        message = 'Informe uma data e horario validos no formato DD/MM/AAAA às HH:MM.';
    }

    if (value && type === 'daterange' && !isValidQuoteDateRange(value)) {
        isValid = false;
        message = 'Informe o periodo no formato DD/MM/AAAA ate DD/MM/AAAA. A segunda data nao pode ser anterior a primeira.';
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

    ['quoteFinalTotal'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input || input.dataset.maskReady === 'true') return;

        input.dataset.maskReady = 'true';
        input.value = formatQuoteMoneyInput(input.value);
        input.addEventListener('input', () => {
            input.value = formatQuoteMoneyInput(input.value);
        });
        input.addEventListener('focus', () => {
            window.setTimeout(() => input.select(), 0);
        });
    });

    const deadlineInput = document.getElementById('quotePaymentDeadline');
    if (deadlineInput && deadlineInput.dataset.maskReady !== 'true') {
        deadlineInput.dataset.maskReady = 'true';
        deadlineInput.value = formatQuoteDaysInput(deadlineInput.value);
        deadlineInput.addEventListener('input', () => {
            deadlineInput.value = formatQuoteDaysInput(deadlineInput.value);
        });
        deadlineInput.addEventListener('focus', () => {
            window.setTimeout(() => deadlineInput.select(), 0);
        });
    }
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

function getQuoteTechniciansTotal() {
    return quoteTechnicians.reduce((sum, technician) => {
        const dailyUnits = Math.max(1, Number(technician.dailyUnits) || 1);
        const cacheValue = Number(technician.cacheValue) || 0;
        return sum + (dailyUnits * cacheValue);
    }, 0);
}

function getQuoteSubtotal() {
    const equipmentTotal = quoteItems.reduce((sum, item) => sum + (Number(item.internalTotal) || 0), 0);
    return equipmentTotal + getQuoteTechniciansTotal();
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

function renderQuoteItems() {
    const tbody = document.querySelector('#quoteItemsTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (quoteItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Nenhum item adicionado.</td></tr>';
        updateQuoteTotals();
        return;
    }

    quoteItems.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(item.description)}</td>
            <td>${escapeHtml(item.dailyUnits)}</td>
            <td>${escapeHtml(formatMoney(item.internalUnitPrice))}</td>
            <td>${escapeHtml(formatMoney(item.internalTotal))}</td>
            <td><button type="button" class="btn-danger btn-delete-mini" onclick="removeQuoteItem(${index})">Remover</button></td>
        `;
        tbody.appendChild(row);
    });

    updateQuoteTotals();
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
        option.label = `Cache: ${formatMoney(operator.cacheValue || 0)}`;
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
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Nenhum tecnico adicionado.</td></tr>';
        updateQuoteTotals();
        return;
    }

    quoteTechnicians.forEach((technician, index) => {
        const dailyUnits = Math.max(1, Number(technician.dailyUnits) || 1);
        const cacheValue = Number(technician.cacheValue) || 0;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(technician.operatorName || technician.fullName || 'Tecnico')}</td>
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
        alert('Digite o nome do tecnico.');
        nameInput?.focus();
        return;
    }

    const operator = await findQuoteTechnicianByName(name);
    if (!operator) {
        alert('Selecione um tecnico cadastrado.');
        nameInput?.focus();
        return;
    }

    const operatorId = Number(operator.id);
    if (quoteTechnicians.some((technician) => Number(technician.operatorId) === operatorId)) {
        alert('Este tecnico ja foi adicionado ao orcamento.');
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

function renderQuoteEquipmentResults(equipments = quoteEquipmentSuggestions) {
    const container = document.getElementById('quoteEquipmentResults');
    if (!container) return;

    const search = String(document.getElementById('quoteItemDescription')?.value || '').trim();
    container.innerHTML = '';

    if (!search) {
        return;
    }

    if (!equipments.length) {
        container.innerHTML = '<p class="quote-equipment-empty">Nenhum equipamento disponivel encontrado.</p>';
        return;
    }

    equipments.forEach((equipment) => {
        const equipmentId = Number(equipment.id);
        const alreadyAdded = quoteItems.some((item) => Number(item.equipmentId) === equipmentId);
        const unitPrice = Number(equipment.unitPrice ?? equipment.unit_price ?? 0) || 0;
        const row = document.createElement('div');
        row.className = `quote-equipment-result ${alreadyAdded ? 'scheduled' : ''}`.trim();
        row.innerHTML = `
            <div class="quote-equipment-info">
                <strong>
                    ${escapeHtml(equipment.name)}
                    ${alreadyAdded ? '<span class="status-badge badge-scheduled quote-equipment-status">Agendado</span>' : ''}
                </strong>
                <span>Codigo: ${escapeHtml(equipment.barcode || '-')} | Categoria: ${escapeHtml(equipment.category || 'Outros')} | Preco: ${escapeHtml(formatMoney(unitPrice))}</span>
            </div>
            <button type="button" class="btn-primary btn-small" onclick="addQuoteEquipment(${equipmentId})" ${alreadyAdded ? 'disabled' : ''}>
                ${alreadyAdded ? 'Agendado' : 'Acrescentar'}
            </button>
        `;
        container.appendChild(row);
    });
}

async function searchQuoteEquipments() {
    const input = document.getElementById('quoteItemDescription');
    const search = String(input?.value || '').trim();

    if (!search) {
        quoteEquipmentSuggestions = [];
        renderQuoteEquipmentResults([]);
        return;
    }

    try {
        const response = await fetch(`/api/orcamentos/equipamentos-disponiveis?search=${encodeURIComponent(search)}`, {
            credentials: 'include'
        });

        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            quoteEquipmentSuggestions = [];
            renderQuoteEquipmentResults([]);
            return;
        }

        quoteEquipmentSuggestions = Array.isArray(data.equipments) ? data.equipments : [];
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
}

async function setQuoteEquipmentSchedule(equipmentId, action) {
    const response = await fetch(`/api/orcamentos/equipamentos/${Number(equipmentId)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            eventDatetime: document.getElementById('quoteEventDatetime')?.value || '',
            quoteId: editingQuoteId || null
        })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(data.error || data.message || 'Nao foi possivel atualizar o equipamento.');
        error.code = data.code || '';
        error.conflict = data.conflict || null;
        throw error;
    }

    return data.equipment || {};
}

async function addQuoteEquipment(equipmentId) {
    const scrollTop = window.scrollY;
    const scrollLeft = window.scrollX;
    const equipment = quoteEquipmentSuggestions.find((item) => Number(item.id) === Number(equipmentId));
    if (!equipment) {
        alert('Equipamento nao encontrado na busca.');
        return;
    }

    if (quoteItems.some((item) => Number(item.equipmentId) === Number(equipmentId))) {
        alert('Este equipamento ja foi acrescentado ao orcamento.');
        return;
    }

    const eventInput = document.getElementById('quoteEventDatetime');
    if (!setQuoteMaskedFieldValidity(eventInput, 'daterange')) {
        eventInput?.focus();
        eventInput?.reportValidity();
        return;
    }

    try {
        const scheduledEquipment = await setQuoteEquipmentSchedule(equipmentId, 'agendar');
        const selectedEquipment = { ...equipment, ...scheduledEquipment };
        const dailyUnits = getQuoteDailyUnits();
        const internalUnitPrice = Number(selectedEquipment.unitPrice ?? selectedEquipment.unit_price ?? 0) || 0;

        quoteItems.push({
            equipmentId: Number(selectedEquipment.id || equipmentId),
            category: 'transmissao',
            description: selectedEquipment.name || equipment.name,
            quantity: 1,
            dailyUnits,
            internalUnitPrice,
            internalTotal: dailyUnits * internalUnitPrice
        });

        quoteScheduledEquipmentIds.add(Number(selectedEquipment.id || equipmentId));
        quoteEquipmentSuggestions = quoteEquipmentSuggestions.map((item) => (
            Number(item.id) === Number(equipmentId)
                ? { ...item, ...selectedEquipment, currentStatus: 'Agendado' }
                : item
        ));

        renderQuoteEquipmentResults(quoteEquipmentSuggestions);
        renderQuoteItems();
        restorePageScroll(scrollTop, scrollLeft);
    } catch (error) {
        console.error(error);
        if (showAvailabilityConflictModal(error.conflict)) {
            await searchQuoteEquipments();
            restorePageScroll(scrollTop, scrollLeft);
            return;
        }
        alert(error.message || 'Nao foi possivel acrescentar o equipamento.');
        await searchQuoteEquipments();
        restorePageScroll(scrollTop, scrollLeft);
    }
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

function initializeQuoteForm(forceReset = false) {
    const dateInput = document.getElementById('quoteProposalDate');
    if (dateInput && (!dateInput.value || forceReset)) {
        dateInput.value = formatQuoteDateFromDate();
    }
    const finalInput = document.getElementById('quoteFinalTotal');
    const deadlineInput = document.getElementById('quotePaymentDeadline');
    if (finalInput) finalInput.value = formatQuoteMoneyInput(finalInput.value);
    if (deadlineInput) deadlineInput.value = formatQuoteDaysInput(deadlineInput.value);
    const title = document.getElementById('quoteFormTitle');
    const submitButton = document.getElementById('quoteSubmitButton');
    if (title) title.textContent = editingQuoteId ? 'Editar Orcamento' : 'Criar Orcamento';
    if (submitButton) submitButton.textContent = editingQuoteId ? 'Salvar alteracoes' : 'Gerar PDF';
    setupQuoteEquipmentSearch();
    setupQuoteTechnicianSearch();
    loadQuoteTechnicianOptions('');
    renderQuoteItems();
    renderQuoteTechnicians();
    renderQuoteEquipmentResults([]);
}

function resetQuoteForm() {
    document.getElementById('quoteForm')?.reset();
    quoteItems = [];
    quoteTechnicians = [];
    quoteEquipmentSuggestions = [];
    quoteTechnicianSuggestions = [];
    editingQuoteId = null;
    quoteFinalEdited = false;
    initializeQuoteForm(true);
}

async function openQuoteCreate() {
    await releasePendingQuoteEquipments();
    resetQuoteForm();
    showSection('orcamentoCriar');
}

async function cancelQuoteForm() {
    await releasePendingQuoteEquipments();
    resetQuoteForm();
    showSection('orcamentos');
}

function populateQuoteForm(quote) {
    editingQuoteId = Number(quote.id);
    quoteEquipmentSuggestions = [];
    quoteItems = (Array.isArray(quote.items) ? quote.items : []).map((item, index) => ({
        equipmentId: Number(item.equipmentId) || null,
        category: item.category || 'transmissao',
        description: item.description || '',
        quantity: 1,
        dailyUnits: Math.max(1, Number(item.dailyUnits) || 1),
        internalUnitPrice: Number(item.internalUnitPrice) || 0,
        internalTotal: Number(item.internalTotal) || 0,
        sortOrder: Number(item.sortOrder) || index + 1
    }));
    quoteTechnicians = (Array.isArray(quote.technicians) ? quote.technicians : []).map((technician, index) => ({
        id: Number(technician.id) || null,
        operatorId: Number(technician.operatorId) || null,
        operatorName: technician.operatorName || '',
        dailyUnits: Math.max(1, Number(technician.dailyUnits) || 1),
        cacheValue: Number(technician.cacheValue) || 0,
        paymentTotal: Number(technician.paymentTotal) || ((Number(technician.dailyUnits) || 1) * (Number(technician.cacheValue) || 0)),
        sortOrder: Number(technician.sortOrder) || index + 1
    }));
    const computedTotal = getQuoteSubtotal();
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
    setQuoteTextInput('quoteItemDescription', '');
    setQuoteTextInput('quoteItemDailyUnits', '1');
    setQuoteTextInput('quoteTechnicianName', '');
    setQuoteTextInput('quoteTechnicianDailyUnits', '1');
    setQuoteTextInput('quoteFinalTotal', formatMoney(quote.finalTotal || computedTotal));
    const showItemPricesInput = document.getElementById('quoteShowItemPrices');
    if (showItemPricesInput) {
        showItemPricesInput.checked = !!quote.showItemPrices;
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
            alert(data.error || 'Nao foi possivel carregar o orcamento.');
            return;
        }

        if (data.quote?.status && data.quote.status !== 'pending') {
            alert('Somente orcamentos pendentes podem ser editados.');
            return;
        }

        quoteScheduledEquipmentIds.clear();
        populateQuoteForm(data.quote || {});
        showSection('orcamentoCriar');
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
        finalTotal: parseQuoteMoneyInput(document.getElementById('quoteFinalTotal')?.value),
        showItemPrices: !!document.getElementById('quoteShowItemPrices')?.checked,
        notes: document.getElementById('quoteNotes')?.value || '',
        items: quoteItems,
        technicians: quoteTechnicians
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
        grid.innerHTML = `<p class="empty-state">${escapeHtml(options.emptyMessage || 'Nenhum orcamento encontrado.')}</p>`;
        return;
    }

    filtered.forEach((quote) => {
        const quoteId = Number(quote.id);
        const approvedInfo = options.approved
            ? `<span class="card-date">Aprovado em ${escapeHtml(formatDateTime(quote.approvedAt))}</span>`
            : '';
        const editButton = options.approved
            ? ''
            : `<button type="button" onclick="editQuote(${quoteId})" class="btn-secondary">Editar</button>`;
        const readyButton = options.approved
            ? ''
            : `<button type="button" onclick="markQuoteReady(${quoteId})" class="btn-success">Pronto</button>`;
        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = `
            <div class="card-top">
                <h3>${escapeHtml(quote.eventName || 'Orcamento')}</h3>
                <div class="event-meta">
                    <span class="card-date">${escapeHtml(formatMoney(quote.finalTotal))}</span>
                    <span class="card-date">${escapeHtml(formatDateTime(quote.createdAt))}</span>
                    ${approvedInfo}
                </div>
            </div>
            <p>${escapeHtml(quote.clientName || '-')}</p>
            <p>${escapeHtml(quote.eventLocation || '-')}</p>
            <div class="event-actions quote-actions">
                <button type="button" onclick="window.open('/api/orcamentos/${quoteId}/pdf', '_blank')" class="btn-primary">PDF</button>
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
        emptyMessage: 'Nenhum orcamento encontrado.',
        approved: false
    });
}

function renderManagedApprovedQuotes(quotes = allApprovedQuotes, search = '') {
    renderQuoteList(quotes, search, {
        gridId: 'managedApprovedQuotesGrid',
        emptyMessage: 'Nenhum orcamento aprovado encontrado.',
        approved: true
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
            <span>${entriesForDay.length} ${entriesForDay.length === 1 ? 'marcacao' : 'marcacoes'}</span>
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
                <h3>${escapeHtml(quote.eventName || 'Orcamento')}</h3>
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
                <button type="button" onclick="window.open('/api/orcamentos/${quoteId}/pdf', '_blank')" class="btn-primary">PDF</button>
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

function getPaymentEntriesByDate(entries = allPaymentEntries) {
    return entries.reduce((groups, entry) => {
        if (!entry.paymentDate) return groups;
        if (!groups.has(entry.paymentDate)) groups.set(entry.paymentDate, []);
        groups.get(entry.paymentDate).push(entry);
        return groups;
    }, new Map());
}

function getPaymentQuoteGroups(entries = []) {
    const groups = new Map();

    entries.forEach((entry) => {
        const quoteId = Number(entry.quoteId);
        if (!groups.has(quoteId)) {
            groups.set(quoteId, {
                quoteId,
                eventName: entry.eventName || 'Evento',
                clientName: entry.clientName || '',
                eventLocation: entry.eventLocation || '',
                eventDatetime: entry.eventDatetime || '',
                disassemblyDatetime: entry.disassemblyDatetime || '',
                paymentDateLabel: entry.paymentDateLabel || getApprovedDateLabel(entry.paymentDate),
                payments: []
            });
        }
        groups.get(quoteId).payments.push(entry);
    });

    return Array.from(groups.values());
}

function getPaymentEntriesTotal(entries = []) {
    return entries.reduce((sum, entry) => sum + (Number(entry.paymentTotal) || 0), 0);
}

function renderPaymentCalendarDayDetails(dateKey, entriesForDay = []) {
    const details = document.getElementById('paymentCalendarDayDetails');
    if (!details) return;

    if (!dateKey) {
        details.innerHTML = '<p class="empty-state">Clique em um dia vermelho ou verde para ver os pagamentos dos tecnicos.</p>';
        return;
    }

    if (!entriesForDay.length) {
        details.innerHTML = `<p class="empty-state">Nenhum pagamento em ${escapeHtml(getApprovedDateLabel(dateKey))}.</p>`;
        return;
    }

    const quoteGroups = getPaymentQuoteGroups(entriesForDay);
    const pendingCount = entriesForDay.filter((entry) => !entry.paidAt).length;
    const total = getPaymentEntriesTotal(entriesForDay);

    details.innerHTML = `
        <div class="approved-day-header payment-day-header">
            <h2>${escapeHtml(getApprovedDateLabel(dateKey))}</h2>
            <span>${escapeHtml(formatMoney(total))} | ${pendingCount} ${pendingCount === 1 ? 'pendente' : 'pendentes'}</span>
        </div>
        <div class="payment-day-events"></div>
    `;

    const container = details.querySelector('.payment-day-events');
    quoteGroups.forEach((group) => {
        const eventPaid = group.payments.every((payment) => payment.paidAt);
        const card = document.createElement('div');
        card.className = `event-card payment-event-card ${eventPaid ? 'paid' : ''}`.trim();
        card.innerHTML = `
            <div class="card-top">
                <h3>${escapeHtml(group.eventName)}</h3>
                <div class="event-meta">
                    <span class="card-date">${escapeHtml(eventPaid ? 'Pago' : 'Pendente')}</span>
                    <span class="card-date">${escapeHtml(formatMoney(getPaymentEntriesTotal(group.payments)))}</span>
                </div>
            </div>
            <p>${escapeHtml(group.clientName || '-')}</p>
            <p>${escapeHtml(group.eventLocation || '-')}</p>
            <div class="approved-day-dates">
                <span><strong>Evento:</strong> ${escapeHtml(group.eventDatetime || '-')}</span>
                <span><strong>Desmontagem:</strong> ${escapeHtml(group.disassemblyDatetime || '-')}</span>
            </div>
            <div class="payment-technician-list"></div>
        `;

        const list = card.querySelector('.payment-technician-list');
        group.payments.forEach((payment) => {
            const paid = !!payment.paidAt;
            const row = document.createElement('div');
            row.className = `payment-technician-row ${paid ? 'paid' : ''}`.trim();
            row.innerHTML = `
                <div class="payment-technician-info">
                    <strong>${escapeHtml(payment.operatorName || 'Tecnico')}</strong>
                    <span>${escapeHtml(payment.dailyUnits)} ${Number(payment.dailyUnits) === 1 ? 'diaria' : 'diarias'} x ${escapeHtml(formatMoney(payment.cacheValue))}</span>
                </div>
                <strong class="payment-technician-total">${escapeHtml(formatMoney(payment.paymentTotal))}</strong>
                <div class="payment-technician-actions">
                    <button type="button" class="btn-success btn-small" onclick="markTechnicianPaymentPaid(${Number(payment.id)})" ${paid ? 'disabled' : ''}>Pago</button>
                    <button type="button" class="btn-secondary btn-small" onclick="correctTechnicianPayment(${Number(payment.id)})" ${paid ? '' : 'disabled'}>Corrigir</button>
                </div>
            `;
            list.appendChild(row);
        });

        container.appendChild(card);
    });
}

function renderPaymentCalendar() {
    const calendar = document.getElementById('paymentCalendar');
    const title = document.getElementById('paymentCalendarTitle');
    if (!calendar || !title) return;

    const year = paymentCalendarDate.getFullYear();
    const month = paymentCalendarDate.getMonth();
    const entriesByDate = getPaymentEntriesByDate();
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
        const hasPayment = entriesForDay.length > 0;
        const allPaid = hasPayment && entriesForDay.every((entry) => entry.paidAt);
        const statusClass = hasPayment ? (allPaid ? 'payment-paid' : 'payment-unpaid') : '';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `approved-calendar-day payment-calendar-day ${statusClass} ${selectedPaymentDateKey === dateKey ? 'selected' : ''}`.trim();
        button.innerHTML = `
            <span class="approved-calendar-number">${day}</span>
            ${hasPayment ? `<span class="approved-calendar-count">${entriesForDay.length}</span>` : ''}
            ${hasPayment ? `
                <span class="approved-calendar-labels">
                    <span class="${allPaid ? 'calendar-label-payment-paid' : 'calendar-label-payment-unpaid'}">${allPaid ? 'Pago' : 'Pendente'}</span>
                </span>
            ` : ''}
        `;
        button.addEventListener('click', () => {
            selectedPaymentDateKey = dateKey;
            renderPaymentCalendar();
            renderPaymentCalendarDayDetails(dateKey, entriesForDay);
        });
        calendar.appendChild(button);
    }

    if (selectedPaymentDateKey) {
        renderPaymentCalendarDayDetails(selectedPaymentDateKey, entriesByDate.get(selectedPaymentDateKey) || []);
    } else {
        renderPaymentCalendarDayDetails('', []);
    }
}

function changePaymentCalendarMonth(offset) {
    paymentCalendarDate = new Date(
        paymentCalendarDate.getFullYear(),
        paymentCalendarDate.getMonth() + Number(offset || 0),
        1
    );
    selectedPaymentDateKey = '';
    renderPaymentCalendar();
}

async function loadPaymentCalendar(options = {}) {
    if (!canAccessPaymentCalendar()) return;

    try {
        const response = await fetch('/api/orcamentos/pagamentos', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Nao foi possivel carregar o calendario de pagamento.');
            return;
        }

        allPaymentEntries = Array.isArray(data.payments) ? data.payments : [];
        const currentMonth = `${paymentCalendarDate.getFullYear()}-${String(paymentCalendarDate.getMonth() + 1).padStart(2, '0')}`;
        const paymentDateKeys = allPaymentEntries.map((entry) => entry.paymentDate).filter(Boolean);
        const hasPaymentInCurrentMonth = paymentDateKeys.some((dateKey) => dateKey.startsWith(currentMonth));
        if (!options.preserveMonth && !hasPaymentInCurrentMonth) {
            const firstPaymentDateKey = paymentDateKeys.sort()[0];
            const match = firstPaymentDateKey?.match(/^(\d{4})-(\d{2})-/);
            if (match) {
                paymentCalendarDate = new Date(Number(match[1]), Number(match[2]) - 1, 1);
            }
        }
        renderPaymentCalendar();
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

async function markTechnicianPaymentPaid(paymentId) {
    const normalizedId = Number(paymentId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) return;

    try {
        const response = await fetch(`/api/orcamentos/pagamentos/${normalizedId}/pago`, {
            method: 'PATCH',
            credentials: 'include'
        });
        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            alert('Sessao expirada. Entre novamente para marcar o pagamento.');
            window.location.href = '/login.html';
            return;
        }

        if (!response.ok) {
            alert(data.error || 'Nao foi possivel marcar o pagamento como pago.');
            return;
        }

        await loadPaymentCalendar({ preserveMonth: true });
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

async function correctTechnicianPayment(paymentId) {
    const normalizedId = Number(paymentId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) return;

    try {
        const response = await fetch(`/api/orcamentos/pagamentos/${normalizedId}/corrigir`, {
            method: 'PATCH',
            credentials: 'include'
        });
        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            alert('Sessao expirada. Entre novamente para corrigir o pagamento.');
            window.location.href = '/login.html';
            return;
        }

        if (!response.ok) {
            alert(data.error || 'Nao foi possivel corrigir o pagamento.');
            return;
        }

        await loadPaymentCalendar({ preserveMonth: true });
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
            alert(data.error || 'Nao foi possivel carregar os orcamentos.');
            return;
        }

        allQuotes = Array.isArray(data.quotes) ? data.quotes : [];
        renderQuotes(allQuotes, getQuoteSearchValue());
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
            alert(data.error || 'Nao foi possivel carregar os orcamentos aprovados.');
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
        alert('Erro de conexao.');
    }
}

async function markQuoteReady(quoteId) {
    if (!confirm('Mover este orcamento para orcamentos aprovados?')) return;

    try {
        const response = await fetch(`/api/orcamentos/${Number(quoteId)}/pronto`, {
            method: 'PATCH',
            credentials: 'include'
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            alert(data.error || 'Nao foi possivel aprovar o orcamento.');
            return;
        }

        await loadQuotes();
        await loadApprovedQuotes();
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

async function deleteQuote(quoteId, approved = false) {
    const message = approved
        ? 'Excluir este orcamento aprovado? Os equipamentos agendados voltarao para disponivel.'
        : 'Excluir este orcamento? Os equipamentos agendados voltarao para disponivel.';
    if (!confirm(message)) return;

    try {
        const response = await fetch(`/api/orcamentos/${Number(quoteId)}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            alert(data.error || 'Nao foi possivel excluir o orcamento.');
            return;
        }

        await loadQuotes();
        await loadApprovedQuotes();
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
            : `${firstDateLabel} ate ${lastDateLabel}`;
        const conflictLines = conflicts.slice(0, 5).map((quote) => {
            const status = quote.status === 'approved' ? 'aprovado' : 'pendente';
            const dates = [...new Set(quote.conflictDates || [])]
                .map((dateKey) => getApprovedDateLabel(dateKey))
                .join(', ');
            return `- ${quote.eventName || 'Orcamento'} | Cliente: ${quote.clientName || '-'} | Data(s): ${dates || dateLabel} | ${status}`;
        }).join('\n');
        const extraCount = conflicts.length > 5
            ? `\n... e mais ${conflicts.length - 5} orcamento(s).`
            : '';
        const conflictText = conflicts.length === 1
            ? 'ja existe 1 evento'
            : `ja existem ${conflicts.length} eventos`;

        return confirm(
            `Atencao: ${conflictText} no periodo ${dateLabel}.\n\n` +
            `${conflictLines}${extraCount}\n\n` +
            'Pode haver montagem no mesmo dia em que estiver acontecendo outro evento. Este aviso e apenas para eventos na mesma data.\n\n' +
            'Deseja continuar criando este orcamento?'
        );
    } catch (error) {
        console.error(error);
        return true;
    }
}

async function createQuote() {
    if (!validateQuoteMaskedFields()) {
        return;
    }

    if (quoteItems.length === 0) {
        alert('Adicione pelo menos um item ao orcamento.');
        return;
    }

    const isEditing = Number.isInteger(Number(editingQuoteId)) && Number(editingQuoteId) > 0;
    const pdfWindow = window.open('', '_blank');
    const canContinue = await confirmQuoteEventDateConflict();
    if (!canContinue) {
        if (pdfWindow) pdfWindow.close();
        return;
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
            if (pdfWindow) pdfWindow.close();
            if (showAvailabilityConflictModal(data.conflict)) {
                return;
            }
            alert(data.error || 'Nao foi possivel gerar o orcamento.');
            return;
        }

        if (pdfWindow) {
            pdfWindow.location.href = `/api/orcamentos/${Number(data.id)}/pdf`;
        }

        quoteScheduledEquipmentIds.clear();
        resetQuoteForm();
        showSection('orcamentos');
        await loadQuotes();
    } catch (error) {
        if (pdfWindow) pdfWindow.close();
        console.error(error);
        alert('Erro de conexao.');
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
            : '<li>Itens com saida pendente nesta locação.</li>';

        return `
            <div class="rental-alert-event">
                <div class="rental-alert-event-title">
                    <span>${escapeHtml(event.name)}</span>
                    <span>Devolucao: ${escapeHtml(formatDate(event.return_date))}</span>
                </div>
                <ul class="rental-alert-items">${pendingHtml}</ul>
                <button type="button" class="btn-primary btn-small" onclick="window.location.href='/event.html?id=${Number(event.id)}&type=rental'">Gerenciar</button>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="rental-return-alert-header">
            <div>
                <h2>Data de devolucao de locação chegou</h2>
                <p>Existem equipamentos ou itens com saida pendente em locação vencida ou vencendo hoje.</p>
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
        title.textContent = currentUser?.isCommercial ? `${baseTitle} - Precos` : baseTitle;
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

function renderEvents(events, search = '') {
    const grid = document.getElementById('eventsGrid');
    if (!grid) return;

    const normalizedSearch = search.toLowerCase();
    const filtered = events.filter((event) => {
        if (!normalizedSearch) return true;
        return (
            String(event.name || '').toLowerCase().includes(normalizedSearch) ||
            String(formatEventPeriod(event.date, event.end_date || event.endDate)).toLowerCase().includes(normalizedSearch)
        );
    });

    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = '<p class="empty-state">Nenhum evento encontrado.</p>';
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
                    <span class="card-date">${escapeHtml(formatEventPeriod(event.date, event.end_date || event.endDate))}</span>
                </div>
            </div>
            <div class="event-actions">
                <button onclick="window.location.href='/event.html?id=${event.id}'" class="btn-primary">Gerenciar</button>
                <button onclick="deleteEvent(${event.id})" class="btn-danger">Excluir</button>
            </div>`;
        grid.appendChild(card);
    });
}

async function loadEvents() {
    try {
        const response = await fetch('/api/events', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        allEvents = await response.json();
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
    const name = String(operator?.fullName || 'Tecnico');
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
            operator.cpf,
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
        grid.innerHTML = '<p class="empty-state">Nenhum tecnico encontrado.</p>';
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
                    <p>Area: ${escapeHtml(operator.area || '-')}</p>
                    <p>CPF: ${escapeHtml(operator.cpf)}</p>
                    <p>Celular: ${escapeHtml(operator.phone)}</p>
                    <p>Automovel: ${operator.hasVehicle ? 'Sim' : 'Nao'}</p>
                    <p>Cache: ${escapeHtml(formatMoney(operator.cacheValue))}</p>
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
            alert(data.error || 'Nao foi possivel carregar os tecnicos.');
            return;
        }

        allOperators = Array.isArray(data.operators) ? data.operators : [];
        renderOperators(allOperators, getOperatorSearchValue());
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

function updateOperatorPhotoPreview(photo) {
    const preview = document.getElementById('operatorPhotoPreview');
    if (!preview) return;

    if (photo) {
        preview.classList.remove('empty');
        preview.innerHTML = `<img src="${escapeHtml(photo)}" alt="Foto do tecnico">`;
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
            reject(new Error('Nao foi possivel ler essa imagem.'));
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
        alert(error.message || 'Nao foi possivel carregar a foto.');
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
    document.getElementById('operatorFormTitle').textContent = editingOperatorId ? 'Editar tecnico' : 'Cadastrar tecnico';
    document.getElementById('operatorSubmitButton').textContent = editingOperatorId ? 'Salvar alteracoes' : 'Salvar tecnico';

    document.getElementById('operatorFullName').value = operator?.fullName || '';
    document.getElementById('operatorArea').value = operator?.area || '';
    document.getElementById('operatorCpf').value = formatCpfInput(operator?.cpf || '');
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

    const photo = document.getElementById('operatorPhotoData')?.value || '';
    if (!photo) {
        alert('Selecione uma foto do tecnico.');
        return;
    }

    const cpfDigits = getOnlyDigits(document.getElementById('operatorCpf')?.value, 11);
    const phoneDigits = getOnlyDigits(document.getElementById('operatorPhone')?.value, 11);

    if (cpfDigits.length !== 11) {
        alert('Digite os 11 numeros do CPF.');
        document.getElementById('operatorCpf')?.focus();
        return;
    }

    if (phoneDigits.length !== 11) {
        alert('Digite os 11 numeros do celular com DDD.');
        document.getElementById('operatorPhone')?.focus();
        return;
    }

    const payload = {
        fullName: document.getElementById('operatorFullName')?.value.trim(),
        area: document.getElementById('operatorArea')?.value.trim(),
        cpf: formatCpfInput(cpfDigits),
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
            alert(data.error || 'Nao foi possivel salvar o tecnico.');
            return;
        }

        closeOperatorFormModal();
        await loadOperators();
        alert(wasEditing ? 'Tecnico atualizado com sucesso.' : 'Tecnico cadastrado com sucesso.');
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
            alert(data.error || 'Tecnico nao encontrado.');
            return;
        }
    } catch (error) {
        console.error(error);
        if (!operator) {
            alert('Erro de conexao.');
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
            <div class="operator-detail-item">
                <span class="operator-detail-label">Area</span>
                <div class="operator-detail-value">${escapeHtml(operator.area || '-')}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">CPF</span>
                <div class="operator-detail-value">${escapeHtml(operator.cpf)}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">Data de nascimento</span>
                <div class="operator-detail-value">${escapeHtml(formatDate(operator.birthDate))}</div>
            </div>
            <div class="operator-detail-item full">
                <span class="operator-detail-label">Endereco</span>
                <div class="operator-detail-value">${escapeHtml(operator.address)}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">Email</span>
                <div class="operator-detail-value">${escapeHtml(operator.email)}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">Numero de celular</span>
                <div class="operator-detail-value">${escapeHtml(operator.phone)}</div>
            </div>
            <div class="operator-detail-item">
                <span class="operator-detail-label">Possui automovel</span>
                <div class="operator-detail-value">${operator.hasVehicle ? 'Sim' : 'Nao'}</div>
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
                <span class="operator-detail-label">Valor cache</span>
                <div class="operator-detail-value">${escapeHtml(formatMoney(operator.cacheValue))}</div>
            </div>
            <div class="form-actions operator-details-actions">
                <button type="button" class="btn-danger" onclick="deleteOperator(${Number(operator.id)})">Excluir tecnico</button>
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
        alert('Tecnico nao encontrado.');
        return;
    }

    if (!confirm(`Excluir o tecnico ${operator.fullName}?`)) return;

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
            alert(data.error || 'Nao foi possivel excluir o tecnico.');
            return;
        }

        allOperators = allOperators.filter((item) => Number(item.id) !== normalizedId);
        renderOperators(allOperators, getOperatorSearchValue());
        closeOperatorDetailsModal();
        alert('Tecnico excluido.');
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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

function renderScheduledEvents(events, search = '') {
    const grid = document.getElementById('scheduledEventsGrid');
    if (!grid) return;

    const normalizedSearch = String(search || '').trim().toLowerCase();
    const filtered = events.filter((event) => {
        if (!normalizedSearch) return true;
        return [
            event.name,
            event.quoteEventName,
            event.clientName,
            event.status,
            formatEventPeriod(event.date, event.endDate)
        ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });

    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = '<p class="empty-state">Nenhum evento agendado encontrado.</p>';
        return;
    }

    filtered.forEach((event) => {
        const card = document.createElement('div');
        card.className = 'event-card scheduled-event-card';
        card.innerHTML = `
            <div class="card-top">
                <h3>${escapeHtml(event.name || 'Evento agendado')}</h3>
                <div class="event-meta">
                    <span class="status-badge badge-scheduled">${escapeHtml(event.status || 'Agendado')}</span>
                    <span class="card-date">${escapeHtml(formatEventPeriod(event.date, event.endDate))}</span>
                </div>
            </div>
            <p><strong>Orcamento:</strong> ${escapeHtml(event.quoteEventName || `#${event.quoteId}`)}</p>
            <p><strong>Cliente:</strong> ${escapeHtml(event.clientName || '-')}</p>
            <div class="event-actions">
                <button onclick="window.location.href='/event.html?id=${Number(event.id)}'" class="btn-primary">Gerenciar</button>
                <button type="button" onclick="window.open('/api/orcamentos/${Number(event.quoteId)}/pdf', '_blank')" class="btn-secondary">PDF</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function loadScheduledEvents() {
    if (!canAccessScheduledEvents()) return;

    try {
        const response = await fetch('/api/scheduled-events', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Nao foi possivel carregar os eventos agendados.');
            return;
        }

        allScheduledEvents = Array.isArray(data.events) ? data.events : [];
        renderScheduledEvents(allScheduledEvents, getScheduledEventSearchValue());
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
                    <span class="card-date">Devolucao: ${escapeHtml(formatDate(event.return_date))}</span>
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
            <span class="card-date">Devolucao: ${escapeHtml(formatDate(event.return_date))}</span>
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
                aria-label="Preco de ${escapeHtml(item.name)}"
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
        throw new Error(data.error || 'Nao foi possivel carregar os precos.');
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
        alert('Informe um preco valido.');
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
            alert(data.error || 'Nao foi possivel salvar o preco.');
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
        alert('Erro de conexao.');
    } finally {
        if (button) button.disabled = false;
    }
}

function renderQuoteDatabaseEquipments(equipments) {
    const tbody = document.querySelector('#quoteEquipmentsTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!equipments.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Nenhum equipamento encontrado.</td></tr>';
        return;
    }

    const groupedEquipments = new Map();
    equipments.forEach((equipment) => {
        const category = equipment.category || 'Outros';
        if (!groupedEquipments.has(category)) {
            groupedEquipments.set(category, []);
        }
        groupedEquipments.get(category).push(equipment);
    });

    Array.from(groupedEquipments.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
        .forEach(([category, items]) => {
            const categoryRow = document.createElement('tr');
            categoryRow.className = 'category-row';
            categoryRow.innerHTML = `<td colspan="7">${escapeHtml(category)}</td>`;
            tbody.appendChild(categoryRow);

            items
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
                .forEach((equipment) => {
                    const hidden = !!equipment.hiddenFromQuotes;
                    const displayStatus = getEquipmentStatusDisplay(equipment.currentStatus);
                    const visibilityClass = hidden ? 'badge-unavailable' : 'badge-available';
                    const visibilityText = hidden ? 'Oculto' : 'Visivel';
                    const actionButton = hidden
                        ? `<button type="button" class="btn-primary btn-delete-mini" onclick="restoreQuoteEquipment(${Number(equipment.id)}, '${escapeJsString(equipment.name)}')">Restaurar</button>`
                        : `<button type="button" class="btn-danger btn-delete-mini" onclick="hideQuoteEquipment(${Number(equipment.id)}, '${escapeJsString(equipment.name)}')">Ocultar</button>`;
                    const row = document.createElement('tr');
                    row.className = hidden ? 'quote-equipment-hidden-row' : '';
                    row.innerHTML = `
                        <td>${escapeHtml(equipment.name)}</td>
                        <td>${escapeHtml(equipment.barcode || '-')}</td>
                        <td>${escapeHtml(equipment.category || 'Outros')}</td>
                        <td><span class="status-badge ${displayStatus.className}">${escapeHtml(displayStatus.text)}</span></td>
                        <td>${getPriceEditorHtml('equipment', equipment, 'quote')}</td>
                        <td><span class="status-badge ${visibilityClass}">${visibilityText}</span></td>
                        <td><div class="table-action-buttons">${actionButton}</div></td>
                    `;
                    tbody.appendChild(row);
                });
        });
}

async function loadQuoteDatabaseEquipments(search = '') {
    if (!canManageQuoteDatabase()) return;

    try {
        const response = await fetch(`/api/orcamentos/equipamentos-banco?search=${encodeURIComponent(search)}`, {
            credentials: 'include'
        });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Nao foi possivel carregar o banco de orcamentos.');
            return;
        }

        quoteDatabaseEquipments = Array.isArray(data.equipments) ? data.equipments : [];
        renderQuoteDatabaseEquipments(quoteDatabaseEquipments);
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

async function setQuoteEquipmentDatabaseVisibility(equipmentId, hidden, name) {
    if (!canManageQuoteDatabase()) return;

    const action = hidden ? 'ocultar' : 'restaurar';
    const confirmMessage = hidden
        ? `Ocultar "${name}" da busca de equipamentos do orcamento? Ele continuara no banco de eventos.`
        : `Restaurar "${name}" na busca de equipamentos do orcamento?`;
    if (!confirm(confirmMessage)) return;

    try {
        const response = await fetch(`/api/orcamentos/equipamentos/${Number(equipmentId)}/${action}`, {
            method: 'POST',
            credentials: 'include'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Nao foi possivel atualizar a visibilidade do equipamento.');
            return;
        }

        await loadQuoteDatabaseEquipments(getQuoteDatabaseSearchValue());
        if (document.getElementById('quoteItemDescription')?.value.trim()) {
            await searchQuoteEquipments();
        }
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

function hideQuoteEquipment(equipmentId, name) {
    setQuoteEquipmentDatabaseVisibility(equipmentId, true, name);
}

function restoreQuoteEquipment(equipmentId, name) {
    setQuoteEquipmentDatabaseVisibility(equipmentId, false, name);
}

function renderEquipments(equipments) {
    const tbody = document.querySelector('#equipmentsTable tbody');
    const theadRow = document.querySelector('#equipmentsTable thead tr');
    if (!tbody || !theadRow) return;

    const relacaoEventId = localStorage.getItem('relacao_event_id');
    const showPrices = canManagePrices() && !relacaoEventId;
    const commercialPriceView = !!currentUser?.isCommercial;
    const columnCount = commercialPriceView ? 4 : (showPrices ? 6 : 5);

    theadRow.innerHTML = commercialPriceView
        ? '<th>Nome</th><th>Categoria</th><th>Preco</th><th></th>'
        : `
            <th>Nome</th>
            <th>Codigo de Barras</th>
            <th>Status</th>
            <th>Evento</th>
            ${showPrices ? '<th>Preco</th>' : ''}
            <th>Acoes</th>
        `;

    tbody.innerHTML = '';

    if (equipments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columnCount}" class="empty-row">Nenhum equipamento encontrado.</td></tr>`;
        return;
    }

    const groupedEquipments = new Map();

    equipments.forEach((eq) => {
        const category = eq.category || 'Outros';
        if (!groupedEquipments.has(category)) {
            groupedEquipments.set(category, []);
        }
        groupedEquipments.get(category).push(eq);
    });

    Array.from(groupedEquipments.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
        .forEach(([category, items]) => {
            const categoryRow = document.createElement('tr');
            categoryRow.className = 'category-row';
            categoryRow.innerHTML = `<td colspan="${columnCount}">${escapeHtml(category)}</td>`;
            tbody.appendChild(categoryRow);

            items
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
                .forEach((eq) => {
                    const row = document.createElement('tr');
                    if (commercialPriceView) {
                        row.innerHTML = `
                            <td>${escapeHtml(eq.name)}</td>
                            <td>${escapeHtml(eq.category || 'Outros')}</td>
                            <td>${escapeHtml(formatMoney(eq.unitPrice ?? 1))}</td>
                            <td>${getPriceEditorHtml('equipment', eq)}</td>
                        `;
                        tbody.appendChild(row);
                        return;
                    }

                    const statusRaw = String(eq.current_status || '').toLowerCase();
                    const isDisponivel = !statusRaw || statusRaw === 'disponÃ­vel' || statusRaw === 'disponivel';
                    const isPreSeparado = statusRaw === 'pre separado';
                    const isRelacao = statusRaw === 'relaÃ§Ã£o' || statusRaw === 'relacao';
                    const isManutencao = statusRaw.includes('manut');
                    const statusText = isPreSeparado ? 'Pre separado' : (isRelacao ? 'RelaÃ§Ã£o' : (isManutencao ? 'Em Manutencao' : (isDisponivel ? 'Disponivel' : 'Indisponivel')));
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
                        actionButtons.push(`<button onclick="deleteEquipment(${eq.id}, '${escapeJsString(eq.name)}')" class="btn-danger btn-delete-mini">Excluir</button>`);
                    }

                    row.innerHTML = `
                        <td>${escapeHtml(eq.name)}${warningButton}</td>
                        <td>${escapeHtml(eq.barcode)}</td>
                        <td><span class="status-badge ${displayStatus.className}">${escapeHtml(displayStatus.text)}</span></td>
                        <td>${escapeHtml(eq.current_event_name || '-')}</td>
                        ${showPrices ? `<td>${getPriceEditorHtml('equipment', eq)}</td>` : ''}
                        <td>${actionButtons.join(' ')}</td>`;
                    tbody.appendChild(row);
                });
        });
}

async function loadEquipments(search = '') {
    try {
        if (currentUser?.isCommercial) {
            allEquipments = await loadItemPrices('equipment', search);
            renderEquipments(allEquipments);
            return;
        }

        const response = await fetch(`/api/equipments?search=${encodeURIComponent(search)}`, { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const equipments = await response.json().catch(() => []);
        if (!response.ok || !Array.isArray(equipments)) {
            renderEquipments([]);
            return;
        }

        allEquipments = equipments;
        if (currentUser?.isAdmin) {
            try {
                allEquipments = mergeItemsWithPrices(equipments, await loadItemPrices('equipment', search));
            } catch (priceError) {
                console.error(priceError);
                allEquipments = equipments.map((item) => ({
                    ...item,
                    unitPrice: Number(item.unitPrice ?? item.unit_price ?? 1) || 1
                }));
            }
        }
        renderEquipments(allEquipments);
    } catch (error) {
        console.error(error);
        renderEquipments([]);
    }
}

function renderMaintenanceList(equipments) {
    const list = document.getElementById('maintenanceList');
    const count = document.getElementById('maintenanceCount');
    if (!list || !count) return;

    count.textContent = `${equipments.length} ${equipments.length === 1 ? 'item' : 'itens'}`;
    list.innerHTML = '';

    if (equipments.length === 0) {
        list.innerHTML = '<p class="empty-state">Nenhum equipamento em manutencao.</p>';
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
                    <p class="maintenance-meta">Codigo: ${escapeHtml(equipment.barcode)} | Categoria: ${escapeHtml(equipment.category || 'Outros')}</p>
                    <p class="maintenance-problem"><strong>Problema:</strong> ${escapeHtml(equipment.maintenance_description || 'Sem descricao.')}</p>
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
        alert('Erro de conexao.');
    }
}

async function deleteEvent(id) {
    if (!confirm('Deseja excluir este evento?')) return;

    try {
        const pendingKey = `pending_items_${id}`;
        const pendingOtherKey = `pending_other_items_${id}`;
        const pendingItems = JSON.parse(localStorage.getItem(pendingKey) || '[]');

        if (pendingItems.length > 0) {
            await Promise.allSettled(
                pendingItems.map((item) =>
                    fetch(`/api/equipments/${Number(item.id)}/status`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'Disponivel' }),
                        credentials: 'include'
                    })
                )
            );
        }

        const response = await fetch(`/api/events/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) {
            alert('Nao foi possivel excluir o evento.');
            return;
        }

        localStorage.removeItem(pendingKey);
        localStorage.removeItem(pendingOtherKey);
        clearRelacaoContext();
        await loadEvents();
        await loadEquipments(getEquipmentSearchValue());
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

function renderCables(cables) {
    const tbody = document.querySelector('#cablesTable tbody');
    if (!tbody) return;
    const relacaoEventId = localStorage.getItem('relacao_event_id');
    const showInitialQuantityEdit = !relacaoEventId && canEditInitialQuantity();
    const showPrices = canManagePrices() && !relacaoEventId;
    const commercialPriceView = !!currentUser?.isCommercial;
    const theadRow = document.querySelector('#cablesTable thead tr');
    const columnCount = commercialPriceView ? 4 : (showPrices ? 5 : 4);

    if (theadRow) {
        theadRow.innerHTML = commercialPriceView
            ? '<th>Nome</th><th>Categoria</th><th>Preco</th><th></th>'
            : `
                <th>Nome</th>
                <th class="cable-quantity-column">Quantidade Inicial</th>
                <th class="cable-quantity-column">Quantidade Disponivel</th>
                ${showPrices ? '<th>Preco</th>' : ''}
                <th></th>
            `;
    }

    tbody.innerHTML = '';

    if (cables.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columnCount}" class="empty-row">Nenhum cabo encontrado.</td></tr>`;
        return;
    }

    const groupedCables = new Map();
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
                categoryRow.innerHTML = `<td colspan="${columnCount}">${escapeHtml(category)}</td>`;
                tbody.appendChild(categoryRow);
            }

            items
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
                .forEach((cable) => {
                    if (commercialPriceView) {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${escapeHtml(cable.name)}</td>
                            <td>${escapeHtml(cable.category || 'Outros')}</td>
                            <td>${escapeHtml(formatMoney(cable.unitPrice ?? 1))}</td>
                            <td>${getPriceEditorHtml('cable', cable)}</td>
                        `;
                        tbody.appendChild(row);
                        return;
                    }

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
                        <td class="cable-quantity-cell cable-quantity-column">${escapeHtml(cable.quantity)}</td>
                        <td class="cable-quantity-cell cable-quantity-column cable-available-quantity-cell" style="color: #2ecc71;">${escapeHtml(cable.available_quantity)}</td>
                        ${showPrices ? `<td>${getPriceEditorHtml('cable', cable)}</td>` : ''}
                        <td><div class="table-action-buttons">${actionButtons.join('')}</div></td>
                    `;
                    tbody.appendChild(row);
                });
        });
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
        alert('Quantidade invalida.');
        return null;
    }

    return quantity;
}

async function editCableInitialQuantity(id, name, currentQuantity) {
    if (!canEditInitialQuantity()) {
        alert('Apenas o usuario Arthur pode editar a quantidade inicial.');
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
            alert(error.message || 'Nao foi possivel editar a quantidade inicial.');
            return;
        }

        await Promise.all([loadCables(getEquipmentSearchValue()), loadMaintenanceCables()]);
        alert('Quantidade inicial atualizada.');
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

async function editOtherItemInitialQuantity(id, name, currentQuantity) {
    if (!canEditInitialQuantity()) {
        alert('Apenas o usuario Arthur pode editar a quantidade inicial.');
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
            alert(error.message || 'Nao foi possivel editar a quantidade inicial.');
            return;
        }

        await loadOtherItems(getEquipmentSearchValue());
        alert('Quantidade inicial atualizada.');
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
            alert(error.message || 'Nao foi possivel excluir a locação.');
            return;
        }

        await loadRentalEvents();
        await loadRentalReturnAlerts();
        alert(`${name} excluido com sucesso.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
            alert(error.message || 'Nao foi possivel excluir o equipamento.');
            return;
        }

        await Promise.all([loadEquipments(getEquipmentSearchValue()), loadMaintenanceEquipments()]);
        alert(`${name} excluido com sucesso.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
            alert(error.message || 'Nao foi possivel excluir o cabo.');
            return;
        }

        await Promise.all([loadCables(getEquipmentSearchValue()), loadMaintenanceCables()]);
        alert(`${name} excluido com sucesso.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
            alert(error.message || 'Nao foi possivel excluir o item.');
            return;
        }

        await loadOtherItems(getEquipmentSearchValue());
        alert(`${name} excluido com sucesso.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

function renderCableMaintenanceList(cables) {
    const list = document.getElementById('maintenanceCableList');
    const count = document.getElementById('maintenanceCableCount');
    if (!list || !count) return;

    count.textContent = `${cables.length} ${cables.length === 1 ? 'item' : 'itens'}`;
    list.innerHTML = '';

    if (cables.length === 0) {
        list.innerHTML = '<p class="empty-state">Nenhum cabo em manutencao.</p>';
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
                    <p class="maintenance-meta">Quantidade: ${escapeHtml(cable.quantity)} | Atualizado em: ${escapeHtml(formatDateTime(cable.updated_at || cable.created_at))}</p>
                    <p class="maintenance-problem"><strong>Problema:</strong> ${escapeHtml(cable.maintenance_description || 'Sem descricao.')}</p>
                </div>
                <button type="button" class="btn-ready" onclick="markCableMaintenanceReady(${cable.id})">Pronto</button>
            `;
            list.appendChild(item);
        });
}

async function loadCables(search = '') {
    try {
        if (currentUser?.isCommercial) {
            allCables = await loadItemPrices('cable', search);
            renderCables(allCables);
            return;
        }

        const response = await fetch(`/api/cables?search=${encodeURIComponent(search)}`, { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const cables = await response.json();
        allCables = currentUser?.isAdmin
            ? mergeItemsWithPrices(cables, await loadItemPrices('cable', search))
            : cables;
        populateCableCategoryOptions(allCables);
        renderCables(allCables);
    } catch (error) {
        console.error(error);
    }
}

function renderOtherItems(items) {
    const tbody = document.querySelector('#otherItemsTable tbody');
    if (!tbody) return;
    const relacaoEventId = localStorage.getItem('relacao_event_id');
    const showInitialQuantityEdit = !relacaoEventId && canEditInitialQuantity();
    const showPrices = canManagePrices() && !relacaoEventId;
    const commercialPriceView = !!currentUser?.isCommercial;
    const theadRow = document.querySelector('#otherItemsTable thead tr');
    const columnCount = commercialPriceView ? 3 : (showPrices ? 5 : 4);

    if (theadRow) {
        theadRow.innerHTML = commercialPriceView
            ? '<th>Nome</th><th>Preco</th><th></th>'
            : `
                <th>Nome</th>
                <th class="cable-quantity-column">Quantidade Inicial</th>
                <th class="cable-quantity-column">Quantidade Disponivel</th>
                ${showPrices ? '<th>Preco</th>' : ''}
                <th></th>
            `;
    }

    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columnCount}" class="empty-row">Nenhum item encontrado.</td></tr>`;
        return;
    }

    items
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
        .forEach((item) => {
            if (commercialPriceView) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${escapeHtml(item.name)}</td>
                    <td>${escapeHtml(formatMoney(item.unitPrice ?? 1))}</td>
                    <td>${getPriceEditorHtml('other', item)}</td>
                `;
                tbody.appendChild(row);
                return;
            }

            const actionButtons = relacaoEventId
                ? [`<button type="button" class="btn-primary btn-small" onclick="adicionarOutroARelacao(${item.id}, '${escapeJsString(item.name)}', ${Number(item.available_quantity) || 0})">Adicionar</button>`]
                : [
                    showInitialQuantityEdit ? `<button type="button" class="btn-primary btn-delete-mini" onclick="editOtherItemInitialQuantity(${item.id}, '${escapeJsString(item.name)}', ${Number(item.quantity) || 0})">Editar</button>` : '',
                    `<button type="button" class="btn-danger btn-delete-mini" onclick="deleteOtherItem(${item.id}, '${escapeJsString(item.name)}')">Excluir</button>`
                ].filter(Boolean);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(item.name)}</td>
                <td class="cable-quantity-cell cable-quantity-column">${escapeHtml(item.quantity)}</td>
                <td class="cable-quantity-cell cable-quantity-column cable-available-quantity-cell" style="color: #2ecc71;">${escapeHtml(item.available_quantity)}</td>
                ${showPrices ? `<td>${getPriceEditorHtml('other', item)}</td>` : ''}
                <td><div class="table-action-buttons">${actionButtons.join('')}</div></td>
            `;
            tbody.appendChild(row);
        });
}

function adicionarOutroARelacao(id, name, availableQuantity) {
    const eventId = localStorage.getItem('relacao_event_id');
    if (!eventId) return;

    const maxQuantity = Number(availableQuantity) || 0;
    if (maxQuantity <= 0) {
        alert('Este item nao possui quantidade disponivel.');
        return;
    }

    const input = prompt(`Quantidade de ${name}:`, '1');
    if (input === null) return;

    const quantity = Number(input);
    if (!Number.isInteger(quantity) || quantity <= 0) {
        alert('Quantidade invalida.');
        return;
    }

    if (quantity > maxQuantity) {
        alert('Quantidade maior que a disponivel.');
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
    try {
        if (currentUser?.isCommercial) {
            allOtherItems = await loadItemPrices('other', search);
            renderOtherItems(allOtherItems);
            return;
        }

        const response = await fetch(`/api/other-items?search=${encodeURIComponent(search)}`, { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const items = await response.json();
        allOtherItems = currentUser?.isAdmin
            ? mergeItemsWithPrices(items, await loadItemPrices('other', search))
            : items;
        renderOtherItems(allOtherItems);
    } catch (error) {
        console.error(error);
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
        maintenanceCables = cables.filter((cable) => !!cable.maintenance_description);
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
            alert('Nao foi possivel encerrar a sessao.');
            return;
        }

        clearPendingItems();
        clearRelacaoContext();
        window.location.href = '/login.html';
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
    if (!isEquip && !isEvent && !isCable && !isOtherItem && !isRental && !isQuote) return;

    if (isQuote) {
        await createQuote();
        return;
    }

    const data = isEquip
        ? {
            name: document.getElementById('equipmentName').value.trim(),
            barcode: document.getElementById('equipmentBarcode').value.trim(),
            category: document.getElementById('equipmentCategory').value
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
        alert('A data final nao pode ser anterior a data inicial.');
        return;
    }

    if (isRental && data.returnDate < data.withdrawalDate) {
        alert('A data de devolucao nao pode ser anterior a data de retirada.');
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
            alert(error.error || 'Nao foi possivel salvar.');
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
        alert('Erro de conexao.');
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
            alert('Nao foi possivel buscar o equipamento.');
            return;
        }

        const equipments = await response.json();
        const equipment = equipments.find((item) => item.barcode === barcode) || equipments[0];

        if (!equipment) {
            alert('Equipamento nao encontrado.');
            clearMaintenance();
            return;
        }

        selectedMaintenanceItem = equipment;
        selectedMaintenanceType = 'equipamento';
        openMaintenanceModal('create', equipment, 'equipamento');
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

async function searchMaintenanceCable() {
    const cableName = document.getElementById('maintenanceCableName')?.value.trim();
    if (!cableName) return;

    try {
        const response = await fetch(`/api/cables?search=${encodeURIComponent(cableName)}`, { credentials: 'include' });
        if (!response.ok) {
            alert('Nao foi possivel buscar o cabo.');
            return;
        }

        const cables = await response.json();
        const normalizedName = cableName.toLowerCase();
        const cable = cables.find((item) => String(item.name || '').toLowerCase() === normalizedName) || cables[0];

        if (!cable) {
            alert('Cabo nao encontrado.');
            clearMaintenance();
            return;
        }

        selectedMaintenanceItem = cable;
        selectedMaintenanceType = 'cabo';
        openMaintenanceModal('create', cable, 'cabo');
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
        setTimeout(() => input.focus(), 0);
        return modal.style.display = 'flex';
    }

    title.textContent = `Problema do ${itemType === 'cabo' ? 'cabo' : 'equipamento'}`;
    subtitle.textContent = `${itemLabel}: ${item.name}`;
    label.textContent = 'Descricao';
    input.value = item.maintenance_description || 'Sem descricao.';
    input.readOnly = true;
    action.style.display = 'none';
    modal.style.display = 'flex';
}

function closeMaintenanceModal() {
    const modal = document.getElementById('maintenanceModal');
    const input = document.getElementById('maintenanceModalInput');
    if (modal) modal.style.display = 'none';
    if (input) {
        input.value = '';
        input.readOnly = false;
    }
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

    if (input) {
        input.addEventListener('keypress', handleMaintenanceModalKeyPress);
    }
}

function openMaintenanceDetails(equipmentId) {
    const equipment = allEquipments.find((item) => Number(item.id) === Number(equipmentId));
    if (!equipment) {
        alert('Equipamento nao encontrado.');
        return;
    }

    openMaintenanceModal('view', equipment, 'equipamento');
}

function openCableMaintenanceDetails(cableId) {
    const cable = allCables.find((item) => Number(item.id) === Number(cableId));
    if (!cable) {
        alert('Cabo nao encontrado.');
        return;
    }

    openMaintenanceModal('view', cable, 'cabo');
}

async function submitMaintenanceModal() {
    if (maintenanceModalMode !== 'create') return;
    await saveMaintenance();
}

async function saveMaintenance() {
    if (!selectedMaintenanceItem) {
        alert(`Busque um ${selectedMaintenanceType === 'cabo' ? 'cabo' : 'equipamento'} antes de registrar a manutencao.`);
        return;
    }

    const description = document.getElementById('maintenanceModalInput')?.value.trim();
    if (!description) {
        alert('Descreva o problema antes de salvar.');
        return;
    }

    try {
        const response = await fetch(selectedMaintenanceType === 'cabo' ? '/api/cable-maintenances' : '/api/maintenances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(
                selectedMaintenanceType === 'cabo'
                    ? { cableId: selectedMaintenanceItem.id, description }
                    : { equipmentId: selectedMaintenanceItem.id, description }
            )
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Nao foi possivel registrar a manutencao.');
            return;
        }

        alert('Manutencao registrada com sucesso.');
        closeMaintenanceModal();
        clearMaintenance();
        if (selectedMaintenanceType === 'cabo') {
            await Promise.all([loadCables(getEquipmentSearchValue()), loadMaintenanceCables()]);
        } else {
            await Promise.all([loadEquipments(getEquipmentSearchValue()), loadMaintenanceEquipments()]);
        }
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

async function markMaintenanceReady(equipmentId) {
    const equipment = maintenanceEquipments.find((item) => Number(item.id) === Number(equipmentId));
    if (!equipment) {
        alert('Equipamento nao encontrado.');
        return;
    }

    try {
        const response = await fetch(`/api/maintenances/${Number(equipmentId)}/ready`, {
            method: 'PATCH',
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Nao foi possivel finalizar a manutencao.');
            return;
        }

        await loadMaintenanceEquipments();
        await loadEquipments(getEquipmentSearchValue());
        alert(`${equipment.name} marcado como disponivel.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

async function markCableMaintenanceReady(cableId) {
    const cable = maintenanceCables.find((item) => Number(item.id) === Number(cableId));
    if (!cable) {
        alert('Cabo nao encontrado.');
        return;
    }

    try {
        const response = await fetch(`/api/cable-maintenances/${Number(cableId)}/ready`, {
            method: 'PATCH',
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Nao foi possivel finalizar a manutencao do cabo.');
            return;
        }

        await Promise.all([loadMaintenanceCables(), loadCables(getEquipmentSearchValue())]);
        alert(`${cable.name} marcado como pronto.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
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
    return end && end !== start ? `${start} ate ${end}` : start;
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
        if (isCommercial) {
            item.style.display = ['quotesMenuItem', 'approvedQuotesMenuItem', 'paymentCalendarMenuItem', 'manageQuotesMenuItem', 'operatorsMenuItem'].includes(item.id) ? '' : 'none';
            return;
        }

        if (!['usersMenuItem', 'quotesMenuItem', 'approvedQuotesMenuItem', 'paymentCalendarMenuItem', 'manageQuotesMenuItem', 'quoteDatabaseMenuItem', 'scheduledEventsMenuItem', 'operatorsMenuItem'].includes(item.id)) {
            item.style.display = '';
        }
    });

    const usersMenuItem = document.getElementById('usersMenuItem');
    if (usersMenuItem) {
        usersMenuItem.style.display = currentUser?.isAdmin && !isCommercial ? '' : 'none';
    }

    const quoteDatabaseMenuItem = document.getElementById('quoteDatabaseMenuItem');
    if (quoteDatabaseMenuItem) {
        quoteDatabaseMenuItem.style.display = canManageQuoteDatabase() ? '' : 'none';
    }

    const scheduledEventsMenuItem = document.getElementById('scheduledEventsMenuItem');
    if (scheduledEventsMenuItem) {
        scheduledEventsMenuItem.style.display = canAccessScheduledEvents() ? '' : 'none';
    }

    const quotesMenuItem = document.getElementById('quotesMenuItem');
    if (quotesMenuItem) {
        quotesMenuItem.style.display = canAccessQuotes() ? '' : 'none';
    }

    const approvedQuotesMenuItem = document.getElementById('approvedQuotesMenuItem');
    if (approvedQuotesMenuItem) {
        approvedQuotesMenuItem.style.display = canAccessQuotes() ? '' : 'none';
    }

    const paymentCalendarMenuItem = document.getElementById('paymentCalendarMenuItem');
    if (paymentCalendarMenuItem) {
        paymentCalendarMenuItem.style.display = canAccessPaymentCalendar() ? '' : 'none';
    }

    const manageQuotesMenuItem = document.getElementById('manageQuotesMenuItem');
    if (manageQuotesMenuItem) {
        manageQuotesMenuItem.style.display = canAccessQuotes() ? '' : 'none';
    }

    const operatorsMenuItem = document.getElementById('operatorsMenuItem');
    if (operatorsMenuItem) {
        operatorsMenuItem.style.display = canAccessOperators() ? '' : 'none';
    }
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
            setUsersMessage(data.error || 'Nao foi possivel carregar os usuarios.', 'error');
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
        setUsersMessage('Erro de conexao.', 'error');
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
            setUsersMessage(data.error || 'Nao foi possivel alterar a senha.', 'error');
            return;
        }

        input.value = '';
        setUsersMessage('Senha atualizada com seguranca.', 'success');
    } catch (error) {
        console.error(error);
        setUsersMessage('Erro de conexao.', 'error');
    }
}

async function createLoginUser(event) {
    event.preventDefault();
    if (!canChangeUserPasswords || !currentUser?.isAdmin) {
        setUsersMessage('Apenas administradores podem cadastrar usuarios.', 'error');
        return;
    }

    const username = String(document.getElementById('newUsername')?.value || '').trim();
    const password = String(document.getElementById('newUserPassword')?.value || '');
    const role = String(document.getElementById('newUserRole')?.value || 'user').trim();

    if (!username) {
        setUsersMessage('Informe o usuario.', 'error');
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
            setUsersMessage(data.error || 'Nao foi possivel cadastrar o usuario.', 'error');
            return;
        }

        toggleCreateUserForm(false);
        await loadLoginUsers();
        setUsersMessage('Usuario cadastrado com seguranca.', 'success');
    } catch (error) {
        console.error(error);
        setUsersMessage('Erro de conexao.', 'error');
    }
}

async function deleteLoginUser(userId) {
    const user = loginUsers.find((item) => Number(item.id) === Number(userId));
    if (!user) {
        setUsersMessage('Usuario nao encontrado.', 'error');
        return;
    }

    if (Number(user.id) === Number(currentUser?.userId)) {
        setUsersMessage('Voce nao pode excluir seu proprio usuario.', 'error');
        return;
    }

    const confirmed = window.confirm(`Excluir o usuario ${user.username}?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/users/${Number(userId)}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setUsersMessage(data.error || 'Nao foi possivel excluir o usuario.', 'error');
            return;
        }

        await loadLoginUsers();
        setUsersMessage('Usuario excluido.', 'success');
    } catch (error) {
        console.error(error);
        setUsersMessage('Erro de conexao.', 'error');
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
                canEditInitialQuantity: data.canEditInitialQuantity ?? String(data.username || '').trim().toLowerCase() === 'arthur'
            }
            : null;
        applyLoginManagementVisibility();
    } catch (error) {
        window.location.href = '/login.html';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
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
    const allowedSections = ['home', 'eventosAgendados', 'cadastro', 'banco', 'bancoOrcamentos', 'eventos', 'historico', 'manutencao', 'locacao', 'usuarios', 'operadores', 'orcamentos', 'orcamentosAprovados', 'calendarioPagamento', 'gerenciarOrcamentos', 'orcamentoCriar'];
    const section = currentUser?.isCommercial
        ? (['operadores', 'orcamentosAprovados', 'calendarioPagamento', 'gerenciarOrcamentos', 'orcamentoCriar'].includes(requestedSection) ? requestedSection : 'orcamentos')
        : (allowedSections.includes(requestedSection) ? requestedSection : 'home');
    showSection(section);
});

