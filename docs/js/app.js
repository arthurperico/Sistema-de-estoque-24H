function darkenHex(hex, amount = 15) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map((char) => char + char).join('');
    }
    const r = Math.max(0, Math.min(255, Math.round(parseInt(hex.substr(0, 2), 16) * (1 - amount / 100))));
    const g = Math.max(0, Math.min(255, Math.round(parseInt(hex.substr(2, 2), 16) * (1 - amount / 100))));
    const b = Math.max(0, Math.min(255, Math.round(parseInt(hex.substr(4, 2), 16) * (1 - amount / 100))));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgba(hex, alpha = 0.18) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyIndicatorColors(colors) {
    const root = document.documentElement;
    const { warningColor, badgeAvailableColor, badgeMaintenanceColor, badgeRelationColor, btnReadyColor } = colors;
    if (warningColor) root.style.setProperty('--warning-color', warningColor);
    if (badgeAvailableColor) {
        root.style.setProperty('--badge-available-color', badgeAvailableColor);
        root.style.setProperty('--badge-available-bg', hexToRgba(badgeAvailableColor, 0.18));
    }
    if (badgeMaintenanceColor) {
        root.style.setProperty('--badge-maintenance-color', badgeMaintenanceColor);
        root.style.setProperty('--badge-maintenance-bg', hexToRgba(badgeMaintenanceColor, 0.18));
    }
    if (badgeRelationColor) {
        root.style.setProperty('--badge-relation-color', badgeRelationColor);
        root.style.setProperty('--badge-relation-bg', hexToRgba(badgeRelationColor, 0.18));
    }
    if (btnReadyColor) {
        root.style.setProperty('--btn-ready-color', btnReadyColor);
        root.style.setProperty('--btn-ready-color-2', darkenHex(btnReadyColor, 25));
        root.style.setProperty('--btn-ready-color-3', darkenHex(btnReadyColor, 38));
    }
}

// ── Custom Color Picker ──────────────────────────────────────────────────────
let _colorPickerOriginal = {};

function openColorPopover(id) {
    // Close any already-open popover
    document.querySelectorAll('.color-popover.open').forEach(p => {
        if (p.id !== id + 'Popover') p.classList.remove('open');
    });
    const mainInput = document.getElementById(id);
    const popover   = document.getElementById(id + 'Popover');
    if (!mainInput || !popover) return;

    _colorPickerOriginal[id] = mainInput.value;
    const pColor = document.getElementById(id + 'PopoverColor');
    const pHex   = document.getElementById(id + 'PopoverHex');
    if (pColor) pColor.value = mainInput.value;
    if (pHex)   pHex.value   = mainInput.value;

    popover.classList.toggle('open');
}

function syncPickerToHex(id) {
    const pColor = document.getElementById(id + 'PopoverColor');
    const pHex   = document.getElementById(id + 'PopoverHex');
    if (pColor && pHex) pHex.value = pColor.value;
}

function syncPopoverHexToColor(id) {
    const pHex   = document.getElementById(id + 'PopoverHex');
    const pColor = document.getElementById(id + 'PopoverColor');
    if (pHex && pColor && /^#[0-9a-fA-F]{6}$/.test(pHex.value)) {
        pColor.value = pHex.value;
    }
}

function confirmColorPopover(id) {
    const pColor = document.getElementById(id + 'PopoverColor');
    if (!pColor) return;
    setColorValue(id, pColor.value);
    document.getElementById(id + 'Popover')?.classList.remove('open');
}

function cancelColorPopover(id) {
    const original = _colorPickerOriginal[id];
    if (original) {
        const pColor = document.getElementById(id + 'PopoverColor');
        const pHex   = document.getElementById(id + 'PopoverHex');
        if (pColor) pColor.value = original;
        if (pHex)   pHex.value   = original;
    }
    document.getElementById(id + 'Popover')?.classList.remove('open');
}

function setColorValue(id, value) {
    const mainInput = document.getElementById(id);
    const swatch    = document.getElementById(id + 'Swatch');
    const hexDisplay = document.getElementById(id + 'Hex');
    if (mainInput)   mainInput.value          = value;
    if (swatch)      swatch.style.background  = value;
    if (hexDisplay)  hexDisplay.value         = value;
}
// ────────────────────────────────────────────────────────────────────────────

async function initializeLottieIcons() {
    // Icons are now inline SVGs — no initialization needed
}

function reloadLottieAnimations(_primaryColor, _secondaryColor) {
    // Icon colors update automatically via CSS variable --primary
}

// Theme and customization from localStorage
function applyCustomTheme() {
    const primaryColor = localStorage.getItem('theme-primary-color') || '#ff3333';
    const secondaryColor = localStorage.getItem('theme-secondary-color') || '#cc0000';
    const warningColor = localStorage.getItem('theme-warning-color') || '#ff0000';
    const customLogo = localStorage.getItem('custom-logo');
    const customFavicon = localStorage.getItem('custom-favicon');

    // Apply colors
    document.documentElement.style.setProperty('--primary', primaryColor);
    document.documentElement.style.setProperty('--primary-2', secondaryColor);
    document.documentElement.style.setProperty('--primary-3', darkenHex(secondaryColor, 18));
    document.documentElement.style.setProperty('--component-bg', 'transparent');

    applyIndicatorColors({
        warningColor,
        badgeAvailableColor:    localStorage.getItem('theme-badge-available-color')    || '#2ecc71',
        badgeMaintenanceColor:  localStorage.getItem('theme-badge-maintenance-color')  || '#f1c40f',
        badgeRelationColor:     localStorage.getItem('theme-badge-relation-color')     || '#f1c40f',
        btnReadyColor:          localStorage.getItem('theme-btn-ready-color')          || '#1ea85c',
    });

    // Apply custom logo if exists
    if (customLogo) {
        const logoImg = document.getElementById('customLogo');
        if (logoImg) {
            logoImg.src = customLogo;
        }
    }

    // Apply custom favicon if exists, otherwise use default
    if (customFavicon) {
        updateFavicon(customFavicon);
    } else {
        // Ensure default favicon is loaded if no custom one exists
        updateFavicon('assets/images/favicon.webp');
    }

    // Update Lottie animation colors dynamically
    reloadLottieAnimations(primaryColor, secondaryColor);
}

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
let allRentalEvents = [];
let allHistoryEvents = [];
let allHistoryRentals = [];
let rentalReturnAlerts = [];
let allEquipments = [];
let allCables = [];
let allOtherItems = [];
let maintenanceEquipments = [];
let maintenanceCables = [];
let selectedMaintenanceItem = null;
let selectedMaintenanceType = 'equipamento';
let maintenanceModalMode = null;
let activeBancoTab = 'equipamentos';
let activeCadastroTab = 'equipamentos';
let activeMaintenanceTab = 'equipamentos';
let allNotifications = [];
let notificationSelectionMode = false;
let selectedNotificationIds = new Set();
let readNotificationIds = new Set();
let sharedNotificationSettings = null;
let sharedDismissedNotificationIds = new Set();
let currentUser = null;
let loginUsers = [];
let canChangeUserPasswords = false;
let editingRentalEventId = null;
const sortState = {
    events: 'created_desc',
    rentals: 'return_asc',
    history: 'completed_desc',
    database: 'name_asc'
};

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

function getTimeValue(value) {
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
}

function getCreatedValue(item) {
    const explicitDate = getTimeValue(item.created_at || item.createdAt || item.created_on);
    if (explicitDate !== null) return explicitDate;
    const id = Number(item.id);
    return Number.isFinite(id) ? id : 0;
}

function getComparableDate(item, context) {
    if (context === 'rentals') return getTimeValue(item.return_date || item.date);
    if (context === 'history') return getTimeValue(item.return_date || item.date || item.finished_at || item.completed_at);
    return getTimeValue(item.date || item.return_date);
}

function compareText(a, b, direction = 'asc') {
    const result = String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });
    return direction === 'desc' ? -result : result;
}

function compareNumbers(a, b, direction = 'asc') {
    const aMissing = a === null || a === undefined || Number.isNaN(a);
    const bMissing = b === null || b === undefined || Number.isNaN(b);
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    return direction === 'desc' ? b - a : a - b;
}

function sortItems(items, mode, context) {
    const [field, direction = 'asc'] = String(mode || '').split('_');
    return [...items].sort((a, b) => {
        let result = 0;
        if (field === 'name') {
            result = compareText(a.name, b.name, direction);
        } else if (field === 'created') {
            result = compareNumbers(getCreatedValue(a), getCreatedValue(b), direction);
        } else if (field === 'return') {
            result = compareNumbers(getTimeValue(a.return_date || a.date), getTimeValue(b.return_date || b.date), direction);
        } else if (field === 'date' || field === 'completed') {
            result = compareNumbers(getComparableDate(a, context), getComparableDate(b, context), direction);
        }

        if (result === 0) {
            result = compareNumbers(Number(a.id) || 0, Number(b.id) || 0, direction === 'asc' ? 'asc' : 'desc');
        }
        return result;
    });
}

function closeFilterMenus(exceptId = '') {
    document.querySelectorAll('.filter-menu.open').forEach((menu) => {
        if (menu.id === exceptId) return;
        menu.classList.remove('open');
        const button = document.querySelector(`[aria-controls="${menu.id}"]`);
        if (button) button.setAttribute('aria-expanded', 'false');
    });
}

function updateSortMenuState() {
    document.querySelectorAll('[data-sort-option]').forEach((button) => {
        const [scope, mode] = String(button.dataset.sortOption || '').split(':');
        button.classList.toggle('active', sortState[scope] === mode);
    });
}

function toggleFilterMenu(menuId, trigger) {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    const willOpen = !menu.classList.contains('open');
    closeFilterMenus(menuId);
    menu.classList.toggle('open', willOpen);
    if (trigger) trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    updateSortMenuState();
    updateNotificationFilterMenuState();
}

function setSortMode(scope, mode) {
    if (!Object.prototype.hasOwnProperty.call(sortState, scope)) return;
    sortState[scope] = mode;
    updateSortMenuState();
    closeFilterMenus();

    if (scope === 'events') return renderEvents(allEvents, getEventSearchValue());
    if (scope === 'rentals') return renderRentalEvents(allRentalEvents, getRentalSearchValue());
    if (scope === 'history') return renderHistoryEvents(allHistoryEvents, allHistoryRentals, getHistorySearchValue());
    if (scope === 'database') {
        if (activeBancoTab === 'cabos') return renderCables(allCables);
        if (activeBancoTab === 'outros') return renderOtherItems(allOtherItems);
        return renderEquipments(allEquipments);
    }
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

function normalizeSectionId(sectionId) {
    return sectionId === 'banco' ? 'inventario' : sectionId;
}

function showSection(sectionId) {
    sectionId = normalizeSectionId(sectionId);

    if (sectionId === 'eventos') {
        showSection('home');
        openEventModal();
        return;
    }

    if (sectionId === 'cadastro') {
        showSection('inventario');
        openCadastroModal(activeCadastroTab);
        return;
    }

    // no redirect needed for config — role-based tabs handle access

    // Close sidebar on mobile navigation (sidebar is overlay on mobile)
    if (window.innerWidth <= 768) {
        closeMobileSidebar();
    }

    if (sectionId !== 'inventario') {
        clearRelacaoContext();
    }

    closeCreationModals();

    document.querySelectorAll('.section').forEach((section) => {
        section.classList.remove('active');
    });

    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    } else {
        // Fallback: show home to prevent blank screen if section doesn't exist
        sectionId = 'home';
        document.getElementById('home')?.classList.add('active');
    }

    document.querySelectorAll('.menu-item').forEach((item) => {
        item.classList.remove('active');
        const onclick = item.getAttribute('onclick') || '';
        if (onclick.includes(sectionId)) {
            item.classList.add('active');
        }
    });

    if (sectionId === 'home') {
        loadEvents();
        loadRentalReturnAlerts();
    }
    if (sectionId === 'inventario') setBancoTab(activeBancoTab);
    if (sectionId === 'notificacoes') loadNotifications();
    if (sectionId === 'historico') loadHistoryEvents();
    if (sectionId === 'usuarios') loadLoginUsers();
    if (sectionId === 'config') {
        const isAdmin = currentUser?.isAdmin || currentUser?.isGestorAdmin;
        if (isAdmin) loadLoginUsers();
        if (currentUser?.isGestorAdmin || currentUser?.isAdmin) loadCompanies();
    }
    if (sectionId === 'manutencao') setMaintenanceTab(activeMaintenanceTab);
    if (sectionId === 'locacao') {
        loadRentalEvents();
        loadRentalReturnAlerts();
    }
    if (!['home', 'locacao'].includes(sectionId)) loadRentalReturnAlerts();

    const floatingBtnHome = document.getElementById('floatingBtnHome');
    const floatingBtnInventario = document.getElementById('floatingBtnInventario');
    const floatingBtnLocacao = document.getElementById('floatingBtnLocacao');
    if (floatingBtnHome) floatingBtnHome.style.display = sectionId === 'home' ? '' : 'none';
    if (floatingBtnInventario) floatingBtnInventario.style.display = sectionId === 'inventario' ? '' : 'none';
    if (floatingBtnLocacao) floatingBtnLocacao.style.display = sectionId === 'locacao' ? '' : 'none';

    // Always scroll to top of content area on section change
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTop = 0;
    window.scrollTo(0, 0);
}

function clearRelacaoContext() {
    localStorage.removeItem('relacao_event_id');
    localStorage.removeItem('relacao_event_name');
    localStorage.removeItem('relacao_event_type');
    localStorage.removeItem('relacao_withdrawal_date');
    localStorage.removeItem('relacao_return_date');
}

function gerenciarEvento(id, name) {
    localStorage.setItem('relacao_event_id', String(id));
    localStorage.setItem('relacao_event_name', name);
    localStorage.setItem('relacao_event_type', 'event');
    localStorage.removeItem('relacao_withdrawal_date');
    localStorage.removeItem('relacao_return_date');
    showSection('inventario');
}

function gerenciarLocacao(id, name, withdrawalDate = '', returnDate = '') {
    localStorage.setItem('relacao_event_id', String(id));
    localStorage.setItem('relacao_event_name', name);
    localStorage.setItem('relacao_event_type', 'rental');
    localStorage.setItem('relacao_withdrawal_date', withdrawalDate || '');
    localStorage.setItem('relacao_return_date', returnDate || '');
    showSection('inventario');
}

function clearPendingItems() {
    Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('pending_items_') || key.startsWith('pending_other_items_')) {
            localStorage.removeItem(key);
        }
    });
}

function shouldPreserveAppearanceKey(key) {
    return key === 'appTheme'
        || key === 'custom-logo'
        || key === 'custom-favicon'
        || key.startsWith('theme-');
}

function clearLocalDataExceptAppearance() {
    try {
        Object.keys(localStorage).forEach((key) => {
            if (!shouldPreserveAppearanceKey(key)) {
                localStorage.removeItem(key);
            }
        });
        sessionStorage.clear();
    } catch (error) {
        console.error('Erro ao limpar dados locais:', error);
    }
}

function resetLocalBrowserData() {
    if (!confirm('Apagar os dados locais deste navegador para esta pagina?')) return;
    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (error) {
        console.error('Erro ao resetar dados locais:', error);
    }
    window.location.href = 'login/';
}

function getEventSearchValue() {
    return (document.getElementById('searchEventInput')?.value || '').trim();
}

function getEquipmentSearchValue() {
    return (document.getElementById('searchInput')?.value || '').trim();
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

function rentalShouldPulse(event) {
    const daysUntilReturn = getDaysBetween(event?.return_date);
    return daysUntilReturn !== null && daysUntilReturn <= 0;
}

function setRentalMenuAlertStateFromRentals(rentals = []) {
    setRentalMenuAlertState(Array.isArray(rentals) && rentals.some(rentalShouldPulse));
}

async function refreshRentalMenuPulseState() {
    if (currentUser?.isGuest) {
        const rentals = (await storage.getEvents()).filter((event) => event.event_type === 'rental');
        setRentalMenuAlertStateFromRentals(rentals);
        return;
    }

    try {
        const response = await fetch('api/rental-events', { credentials: 'include' });
        if (!response.ok) return;
        const rentals = await response.json();
        setRentalMenuAlertStateFromRentals(rentals);
    } catch (error) {
        console.error(error);
    }
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
                <button type="button" class="btn-primary btn-small" onclick="showSection('locacao')">Gerenciar</button>
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
    if (currentUser?.isGuest) {
        await refreshRentalMenuPulseState();
        return;
    }
    try {
        const today = getLocalDateString();
        const response = await fetch(`api/rental-return-alerts?today=${encodeURIComponent(today)}`, {
            credentials: 'include'
        });
        if (response.status === 401) {
            window.location.href = 'login/';
            return;
        }
        if (!response.ok) return;

        rentalReturnAlerts = await response.json();
        renderRentalReturnAlert();
        await refreshRentalMenuPulseState();
    } catch (error) {
        console.error(error);
    }
}

const DEFAULT_NOTIFICATION_SETTINGS = {
    enabled: true,
    daysBefore: [7, 5, 3, 1, 0],
    includeOverdue: true,
    maxNotices: 20,
    repeatMode: 'daily',
    allowUserDismiss: true
};

function parseLocalDate(value) {
    if (!value) return null;
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function getDaysBetween(dateString, todayString = getLocalDateString()) {
    const target = parseLocalDate(dateString);
    const today = parseLocalDate(todayString);
    if (!target || !today) return null;
    return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function parseNotificationDays(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(',');
    const days = raw
        .map((item) => Number(String(item).trim()))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 365);
    return [...new Set(days)].sort((a, b) => b - a);
}

function getNotificationSettings() {
    try {
        const saved = sharedNotificationSettings || JSON.parse(localStorage.getItem('notification-settings') || '{}');
        const daysBefore = parseNotificationDays(saved.daysBefore || DEFAULT_NOTIFICATION_SETTINGS.daysBefore);
        return {
            ...DEFAULT_NOTIFICATION_SETTINGS,
            ...saved,
            daysBefore: daysBefore.length ? daysBefore : DEFAULT_NOTIFICATION_SETTINGS.daysBefore,
            maxNotices: Math.max(1, Math.min(50, Number(saved.maxNotices) || DEFAULT_NOTIFICATION_SETTINGS.maxNotices)),
            includeOverdue: saved.includeOverdue !== false,
            enabled: saved.enabled !== false,
            repeatMode: saved.repeatMode === 'once' ? 'once' : 'daily',
            allowUserDismiss: saved.allowUserDismiss !== false
        };
    } catch {
        return { ...DEFAULT_NOTIFICATION_SETTINGS };
    }
}

function getDismissedNotificationKey(today = getLocalDateString()) {
    return getNotificationSettings().repeatMode === 'once'
        ? 'dismissed_notifications_permanent'
        : `dismissed_notifications_${today}`;
}

function getDismissedNotificationIds(today = getLocalDateString()) {
    if (currentUser && !currentUser.isGuest) {
        const settings = getNotificationSettings();
        if (settings.repeatMode === 'once') return [...sharedDismissedNotificationIds];
        const prefix = `${today}:`;
        return [...sharedDismissedNotificationIds]
            .filter((id) => id.startsWith(prefix))
            .map((id) => id.slice(prefix.length));
    }

    try {
        const parsed = JSON.parse(localStorage.getItem(getDismissedNotificationKey(today)) || '[]');
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

function setDismissedNotificationIds(ids, today = getLocalDateString()) {
    localStorage.setItem(getDismissedNotificationKey(today), JSON.stringify([...new Set(ids.map(String))]));
}

function getSharedDismissalId(id, today = getLocalDateString()) {
    return getNotificationSettings().repeatMode === 'once' ? String(id) : `${today}:${id}`;
}

function canDismissNotifications() {
    const settings = getNotificationSettings();
    return !!(currentUser?.isAdmin || currentUser?.isGestorAdmin || currentUser?.isGuest || settings.allowUserDismiss !== false);
}

async function syncNotificationSettingsFromServer() {
    if (!currentUser || currentUser.isGuest) {
        sharedNotificationSettings = null;
        return;
    }

    try {
        const response = await fetch('api/notification-settings', { credentials: 'include' });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        sharedNotificationSettings = data.settings || null;
    } catch (error) {
        console.error(error);
    }
}

async function loadNotificationDismissalsFromServer() {
    if (!currentUser || currentUser.isGuest) {
        sharedDismissedNotificationIds = new Set();
        return;
    }

    try {
        const response = await fetch('api/notification-dismissals', { credentials: 'include' });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        sharedDismissedNotificationIds = new Set(Array.isArray(data.ids) ? data.ids.map(String) : []);
    } catch (error) {
        console.error(error);
    }
}

async function dismissNotifications(ids) {
    const cleanIds = [...new Set((ids || []).map(String).filter(Boolean))];
    if (cleanIds.length === 0) return true;

    if (!currentUser || currentUser.isGuest) {
        const dismissed = getDismissedNotificationIds();
        setDismissedNotificationIds([...dismissed, ...cleanIds]);
        return true;
    }

    try {
        const sharedIds = cleanIds.map((id) => getSharedDismissalId(id));
        const response = await fetch('api/notification-dismissals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ids: sharedIds })
        });

        if (response.status === 403) {
            alert('O administrador bloqueou a remoção de notificações para usuários.');
            return false;
        }

        if (!response.ok) {
            alert('Nao foi possivel marcar as notificações como lidas.');
            return false;
        }

        sharedIds.forEach((id) => sharedDismissedNotificationIds.add(id));
        return true;
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
        return false;
    }
}

function getRentalNotificationTitle(event, daysUntilReturn) {
    const name = event.name || 'Locação sem nome';
    return `Locação em Aberto — ${name}`;
}

function getRentalNotificationStatus(daysUntilReturn) {
    if (daysUntilReturn < 0) return { className: 'overdue', label: 'Atrasada' };
    if (daysUntilReturn === 0) return { className: 'today', label: 'Hoje' };
    return { className: 'upcoming', label: 'Próxima' };
}

function buildRentalNotifications(rentals = []) {
    const settings = getNotificationSettings();
    if (!settings.enabled) return [];

    const dismissed = new Set(getDismissedNotificationIds());
    const daysBefore = new Set(settings.daysBefore);
    const notifications = [];

    rentals.forEach((event) => {
        const daysUntilReturn = getDaysBetween(event.return_date);
        if (daysUntilReturn === null) return;

        const shouldNotify = daysUntilReturn < 0
            ? settings.includeOverdue
            : daysBefore.has(daysUntilReturn);
        if (!shouldNotify) return;

        const id = `rental-${event.id}-${event.return_date}`;
        if (dismissed.has(id)) return;

        const status = getRentalNotificationStatus(daysUntilReturn);
        notifications.push({
            id,
            type: 'rental',
            eventId: event.id,
            title: getRentalNotificationTitle(event, daysUntilReturn),
            message: `Devolução prevista para ${formatDate(event.return_date)}. Retirada em ${formatDate(event.withdrawal_date)}.`,
            date: event.return_date,
            daysUntilReturn,
            statusClass: status.className,
            statusLabel: status.label
        });
    });

    notifications.sort((a, b) => {
        const aBucket = a.daysUntilReturn < 0 ? 0 : (a.daysUntilReturn === 0 ? 1 : 2);
        const bBucket = b.daysUntilReturn < 0 ? 0 : (b.daysUntilReturn === 0 ? 1 : 2);
        if (aBucket !== bBucket) return aBucket - bBucket;
        return a.daysUntilReturn - b.daysUntilReturn;
    });

    return notifications.slice(0, settings.maxNotices);
}

function buildGuestSystemNotifications() {
    if (!currentUser?.isGuest) return [];
    const dismissed = new Set(getDismissedNotificationIds());
    const notifications = [
        {
            id: 'guest-sys-welcome',
            type: 'system',
            title: 'Bem-vindo ao EquipTrack!',
            message: 'Você está no modo demonstração. Crie uma conta para salvar seus dados e ter acesso completo ao sistema.',
            date: null,
            daysUntilReturn: null,
            statusClass: 'system',
            statusLabel: 'Sistema'
        },
        {
            id: 'guest-bill-pending',
            type: 'rental',
            title: 'Locação em Aberto — Casamento Fernanda & Lucas',
            message: 'Equipamentos do evento "Casamento Fernanda & Lucas" aguardam confirmação de devolução.',
            date: null,
            daysUntilReturn: null,
            statusClass: 'upcoming',
            statusLabel: 'Locação'
        }
    ];

    return notifications.filter(n => !dismissed.has(n.id));
}

function filterNotifications(notifications = []) {
    const filter = document.getElementById('notificationDateFilter')?.value || 'all';
    const customDate = document.getElementById('notificationCustomDate')?.value || '';

    return notifications.filter((item) => {
        if (item.daysUntilReturn === null || item.daysUntilReturn === undefined) return filter === 'all';
        if (filter === 'overdue') return item.daysUntilReturn < 0;
        if (filter === 'today') return item.daysUntilReturn === 0;
        if (filter === 'next3') return item.daysUntilReturn >= 0 && item.daysUntilReturn <= 3;
        if (filter === 'next7') return item.daysUntilReturn >= 0 && item.daysUntilReturn <= 7;
        if (filter === 'custom') return customDate && item.date === customDate;
        return true;
    });
}

function updateNotificationBadge(count = allNotifications.length) {
    const badge = document.getElementById('notificationBadge');
    const button = document.querySelector('.btn-notification-icon');
    if (badge) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = count > 0 ? '' : 'none';
    }
    if (button) button.classList.toggle('rental-return-pulse', count > 0);
}

function renderNotifications() {
    const list = document.getElementById('notificationsList');
    const selectToggle = document.getElementById('notificationSelectToggle');
    const selectionBar = document.getElementById('notificationSelectionBar');
    if (!list) return;

    const canDismiss = canDismissNotifications();
    if (!canDismiss && notificationSelectionMode) {
        notificationSelectionMode = false;
        selectedNotificationIds.clear();
    }

    const filtered = filterNotifications(allNotifications);
    list.classList.toggle('notifications-selecting', notificationSelectionMode);
    if (selectionBar) selectionBar.style.display = notificationSelectionMode ? '' : 'none';
    if (selectToggle) {
        selectToggle.textContent = notificationSelectionMode ? 'Cancelar' : 'Selecionar';
        selectToggle.style.display = canDismiss ? '' : 'none';
    }
    updateNotificationFilterMenuState();

    const selectAll = document.getElementById('notificationSelectAll');
    if (selectAll) {
        selectAll.checked = filtered.length > 0 && filtered.every((item) => selectedNotificationIds.has(item.id));
        selectAll.indeterminate = filtered.some((item) => selectedNotificationIds.has(item.id)) && !selectAll.checked;
    }

    if (filtered.length === 0) {
        list.innerHTML = '<p class="empty-state">Nenhuma notificação encontrada.</p>';
        updateNotificationBadge();
        return;
    }

    const unreadCount = filtered.filter((item) => !readNotificationIds.has(item.id)).length;

    list.innerHTML = filtered.map((item) => {
        const isRead = readNotificationIds.has(item.id);
        return `
        <article class="notification-card rental-${escapeHtml(item.statusClass)}${isRead ? ' notification-read' : ''}">
            <input type="checkbox" class="notification-card-checkbox" ${selectedNotificationIds.has(item.id) ? 'checked' : ''} onchange="toggleNotificationSelection('${escapeJsString(item.id)}', this.checked)" aria-label="Selecionar notificação">
            <div>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.message)}</p>
                <div class="notification-meta">${item.type === 'system' ? 'Sistema' : 'Locação'}</div>
            </div>
            <span class="notification-status ${escapeHtml(item.statusClass)}">${escapeHtml(item.statusLabel)}</span>
        </article>
    `;
    }).join('');

    updateNotificationBadge(unreadCount);
}

function toggleNotificationSelectionMode(force) {
    notificationSelectionMode = typeof force === 'boolean' ? force : !notificationSelectionMode;
    if (!notificationSelectionMode) selectedNotificationIds.clear();
    renderNotifications();
}

function toggleNotificationSelection(id, checked) {
    if (checked) selectedNotificationIds.add(String(id));
    else selectedNotificationIds.delete(String(id));
    renderNotifications();
}

function toggleAllNotifications(checked) {
    filterNotifications(allNotifications).forEach((item) => {
        if (checked) selectedNotificationIds.add(item.id);
        else selectedNotificationIds.delete(item.id);
    });
    renderNotifications();
}

function clearNotificationSelection() {
    selectedNotificationIds.clear();
    renderNotifications();
}

async function markSelectedNotificationsRead() {
    if (selectedNotificationIds.size === 0) return;
    // Mark as read: notifications turn grey and stop counting in the badge
    selectedNotificationIds.forEach((id) => readNotificationIds.add(id));
    selectedNotificationIds.clear();
    renderNotifications();
}

async function deleteSelectedNotifications() {
    if (selectedNotificationIds.size === 0) return;
    if (!canDismissNotifications()) {
        alert('O administrador bloqueou a remoção de notificações para usuários.');
        return;
    }

    const idsToDelete = [...selectedNotificationIds];
    const dismissed = await dismissNotifications(idsToDelete);
    if (!dismissed) return;

    // Remove from both the main list and the read set
    idsToDelete.forEach((id) => readNotificationIds.delete(id));
    selectedNotificationIds.clear();
    allNotifications = allNotifications.filter((item) => !getDismissedNotificationIds().includes(item.id));
    renderNotifications();
}

function handleNotificationFilterChange() {
    selectedNotificationIds.clear();
    renderNotifications();
}

function setNotificationDateFilter(value) {
    const filter = document.getElementById('notificationDateFilter');
    if (filter) filter.value = value;
    if (value !== 'custom') {
        const customDate = document.getElementById('notificationCustomDate');
        if (customDate) customDate.value = '';
    }
    handleNotificationFilterChange();
    closeFilterMenus();
}

function updateNotificationFilterMenuState() {
    const current = document.getElementById('notificationDateFilter')?.value || 'all';
    document.querySelectorAll('[data-notification-filter-option]').forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-notification-filter-option') === current);
    });
}

async function getRentalEventsForNotifications() {
    if (currentUser?.isGuest) {
        return (await storage.getEvents()).filter((event) => event.event_type === 'rental');
    }

    const response = await fetch('api/rental-events', { credentials: 'include' });
    if (response.status === 401) {
        window.location.href = 'login/';
        return [];
    }
    if (!response.ok) return [];
    return response.json();
}

async function loadNotifications() {
    try {
        await syncNotificationSettingsFromServer();
        await loadNotificationDismissalsFromServer();
        const rentals = await getRentalEventsForNotifications();
        const rentalNotifs = buildRentalNotifications(rentals);
        const staticNotifs = buildGuestSystemNotifications();
        allNotifications = [...staticNotifs, ...rentalNotifs];
        renderNotifications();
    } catch (error) {
        console.error(error);
    }
}

function searchEquipments() {
    searchDatabase();
}

function openCadastroFromInventario() {
    setCadastroTab(activeBancoTab);
    openCadastroModal(activeBancoTab);
}

function openCadastroModal(tab = activeCadastroTab) {
    setCadastroTab(tab);
    const modal = document.getElementById('cadastro');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('active');
    }
}

function closeCadastroModal() {
    document.getElementById('equipmentForm')?.reset();
    document.getElementById('cableForm')?.reset();
    document.getElementById('otherItemForm')?.reset();
    const cableQuantity = document.getElementById('cableQuantity');
    if (cableQuantity) cableQuantity.value = '';
    const otherQuantity = document.getElementById('otherItemQuantity');
    if (otherQuantity) otherQuantity.value = '';
    populateCategoryOptions();
    populateCableCategoryOptions();
    const modal = document.getElementById('cadastro');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

function openEventModal() {
    document.getElementById('eventForm')?.reset();
    const modal = document.getElementById('eventos');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('active');
    }
}

function closeEventModal() {
    document.getElementById('eventForm')?.reset();
    const modal = document.getElementById('eventos');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

function closeCreationModals() {
    const cadastroModal = document.getElementById('cadastro');
    if (cadastroModal) {
        cadastroModal.style.display = 'none';
        cadastroModal.classList.remove('active');
    }
    const eventModal = document.getElementById('eventos');
    if (eventModal) {
        eventModal.style.display = 'none';
        eventModal.classList.remove('active');
    }
    toggleCreateUserForm(false);
    closeUserManageModal();
    toggleCreateCompanyForm(false);
    closeCompanyEdit();
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
            : (activeCadastroTab === 'outros' ? 'Cadastro de Outros Itens' : 'Cadastro do Inventário');
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
    const rentalDatesButton = document.getElementById('relacaoRentalDatesButton');
    const equipmentView = document.getElementById('equipamentosDatabaseView');
    const cableView = document.getElementById('cabosDatabaseView');
    const otherView = document.getElementById('outrosDatabaseView');

    if (title) {
        const relacaoEventName = localStorage.getItem('relacao_event_name');
        if (relacaoEventName) {
            title.textContent = `Gerenciar: ${relacaoEventName}`;
        } else {
            title.textContent = 'Inventário';
        }
    }

    if (rentalDatesButton) {
        rentalDatesButton.style.display = localStorage.getItem('relacao_event_type') === 'rental' ? '' : 'none';
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
    const equipmentSearch = document.getElementById('maintenanceEquipamentosSearch');
    const cableSearch = document.getElementById('maintenanceCabosSearch');

    if (equipmentButton) equipmentButton.classList.toggle('active', activeMaintenanceTab === 'equipamentos');
    if (cableButton) cableButton.classList.toggle('active', activeMaintenanceTab === 'cabos');
    if (equipmentView) equipmentView.classList.toggle('active', activeMaintenanceTab === 'equipamentos');
    if (cableView) cableView.classList.toggle('active', activeMaintenanceTab === 'cabos');
    if (equipmentSearch) equipmentSearch.classList.toggle('active', activeMaintenanceTab === 'equipamentos');
    if (cableSearch) cableSearch.classList.toggle('active', activeMaintenanceTab === 'cabos');

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
    closeCadastroModal();
}

function cancelEventForm() {
    closeEventModal();
}

function openRentalModal() {
    editingRentalEventId = null;
    const form = document.getElementById('rentalForm');
    form?.reset();
    const nameInput = document.getElementById('rentalEventName');
    if (nameInput) {
        nameInput.readOnly = false;
        nameInput.value = '';
    }
    const title = document.getElementById('rentalModalTitle');
    const subtitle = document.getElementById('rentalModalSubtitle');
    const submit = document.getElementById('rentalModalSubmit');
    if (title) title.textContent = 'Criar evento de locação';
    if (subtitle) subtitle.textContent = 'Informe as datas de retirada e devolucao.';
    if (submit) submit.textContent = 'Criar Evento';
    const modal = document.getElementById('rentalModal');
    if (modal) modal.style.display = 'flex';
}

function openRentalDateModal(id, name, withdrawalDate, returnDate) {
    editingRentalEventId = Number(id);
    const title = document.getElementById('rentalModalTitle');
    const subtitle = document.getElementById('rentalModalSubtitle');
    const submit = document.getElementById('rentalModalSubmit');
    const nameInput = document.getElementById('rentalEventName');
    const withdrawalInput = document.getElementById('rentalWithdrawalDate');
    const returnInput = document.getElementById('rentalReturnDate');

    if (title) title.textContent = 'Alterar dados da locação';
    if (subtitle) subtitle.textContent = 'Atualize a data de retirada e a data de devolucao.';
    if (submit) submit.textContent = 'Salvar datas';
    if (nameInput) {
        nameInput.value = name || '';
        nameInput.readOnly = true;
    }
    if (withdrawalInput) withdrawalInput.value = withdrawalDate || '';
    if (returnInput) returnInput.value = returnDate || '';

    const modal = document.getElementById('rentalModal');
    if (modal) modal.style.display = 'flex';
}

async function openManagedRentalDateModal() {
    const eventId = Number(localStorage.getItem('relacao_event_id'));
    if (!eventId || localStorage.getItem('relacao_event_type') !== 'rental') return;

    let rental = {
        id: eventId,
        name: localStorage.getItem('relacao_event_name') || '',
        withdrawal_date: localStorage.getItem('relacao_withdrawal_date') || '',
        return_date: localStorage.getItem('relacao_return_date') || ''
    };

    const cachedRental = allRentalEvents.find((event) => Number(event.id) === eventId);
    if (cachedRental) {
        rental = { ...rental, ...cachedRental };
    } else if (currentUser?.isGuest) {
        const events = await storage.getEvents();
        const guestRental = events.find((event) => Number(event.id) === eventId && event.event_type === 'rental');
        if (guestRental) rental = { ...rental, ...guestRental };
    } else {
        try {
            const response = await fetch(`api/rental-events/${eventId}`, { credentials: 'include' });
            if (response.ok) {
                rental = { ...rental, ...(await response.json()) };
            }
        } catch (error) {
            console.error(error);
        }
    }

    openRentalDateModal(rental.id, rental.name, rental.withdrawal_date, rental.return_date);
}

function closeRentalModal() {
    document.getElementById('rentalForm')?.reset();
    editingRentalEventId = null;
    const nameInput = document.getElementById('rentalEventName');
    if (nameInput) nameInput.readOnly = false;
    const modal = document.getElementById('rentalModal');
    if (modal) modal.style.display = 'none';
}

function cancelCableForm() {
    document.getElementById('cableForm')?.reset();
    const quantityInput = document.getElementById('cableQuantity');
    if (quantityInput) quantityInput.value = '';
    populateCableCategoryOptions();
    closeCadastroModal();
    setCadastroTab('cabos');
}

function cancelOtherItemForm() {
    document.getElementById('otherItemForm')?.reset();
    const quantityInput = document.getElementById('otherItemQuantity');
    if (quantityInput) quantityInput.value = '';
    closeCadastroModal();
    setCadastroTab('outros');
}

function renderEvents(events, search = '') {
    const grid = document.getElementById('eventsGrid');
    if (!grid) return;

    const normalizedSearch = search.toLowerCase();
    const filtered = sortItems(events.filter((event) => {
        if (!normalizedSearch) return true;
        return (
            String(event.name || '').toLowerCase().includes(normalizedSearch) ||
            String(formatDate(event.date)).toLowerCase().includes(normalizedSearch)
        );
    }), sortState.events, 'events');

    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = '<p class="empty-state">Nenhum evento encontrado.</p>';
        return;
    }

    filtered.forEach((event) => {
        const card = document.createElement('div');
        const daysUntilReturn = getDaysBetween(event.return_date);
        card.className = `event-card${daysUntilReturn !== null && daysUntilReturn <= 0 ? ' rental-due-alert' : ''}`;
        card.innerHTML = `
            <div class="card-top">
                <h3>${escapeHtml(event.name)}</h3>
                <div class="event-meta">
                    ${event.created_by_username ? `<span class="event-created-by">${escapeHtml(event.created_by_username)}</span>` : ''}
                    <span class="card-date">${escapeHtml(formatDate(event.date))}</span>
                </div>
            </div>
            <div class="event-actions">
                <button onclick="gerenciarEvento(${event.id}, '${escapeJsString(event.name)}')" class="btn-primary">Gerenciar</button>
                <button onclick="deleteEvent(${event.id})" class="btn-danger">Excluir</button>
            </div>`;
        grid.appendChild(card);
    });
}

async function loadEvents() {
    if (currentUser?.isGuest) {
        allEvents = (await storage.getEvents()).filter(e => e.event_type !== 'rental');
        renderEvents(allEvents, getEventSearchValue());
        return;
    }
    try {
        const response = await fetch('api/events', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = 'login/';
            return;
        }

        allEvents = await response.json();
        renderEvents(allEvents, getEventSearchValue());
    } catch (error) {
        console.error(error);
    }
}

function renderRentalEvents(events, search = '') {
    const grid = document.getElementById('rentalEventsGrid');
    if (!grid) return;
    setRentalMenuAlertStateFromRentals(events);

    const normalizedSearch = search.toLowerCase();
    const filtered = sortItems(events.filter((event) => {
        if (!normalizedSearch) return true;
        return (
            String(event.name || '').toLowerCase().includes(normalizedSearch) ||
            String(formatDate(event.withdrawal_date)).toLowerCase().includes(normalizedSearch) ||
            String(formatDate(event.return_date)).toLowerCase().includes(normalizedSearch)
        );
    }), sortState.rentals, 'rentals');

    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = '<p class="empty-state">Nenhuma locação encontrada.</p>';
        return;
    }

    filtered.forEach((event) => {
        const card = document.createElement('div');
        card.className = `event-card${rentalShouldPulse(event) ? ' rental-due-alert' : ''}`;
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
                <button onclick="gerenciarLocacao(${event.id}, '${escapeJsString(event.name)}', '${escapeJsString(event.withdrawal_date || '')}', '${escapeJsString(event.return_date || '')}')" class="btn-primary">Gerenciar</button>
                <button onclick="deleteRentalEvent(${event.id}, '${escapeJsString(event.name)}')" class="btn-danger">Excluir</button>
            </div>`;
        grid.appendChild(card);
    });
}

async function loadRentalEvents() {
    if (currentUser?.isGuest) {
        allRentalEvents = (await storage.getEvents()).filter(e => e.event_type === 'rental');
        renderRentalEvents(allRentalEvents, getRentalSearchValue());
        return;
    }
    try {
        const response = await fetch('api/rental-events', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = 'login/';
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
            ${isRental
                ? `<button onclick="gerenciarLocacao(${event.id}, '${escapeJsString(event.name)}', '${escapeJsString(event.withdrawal_date || '')}', '${escapeJsString(event.return_date || '')}')" class="btn-primary">Gerenciar</button>`
                : `<button onclick="gerenciarEvento(${event.id}, '${escapeJsString(event.name)}')" class="btn-primary">Gerenciar</button>`
            }
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
    const filteredEvents = sortItems(events.filter((event) => historyMatchesSearch(event, search, false)), sortState.history, 'history');
    const filteredRentals = sortItems(rentals.filter((event) => historyMatchesSearch(event, search, true)), sortState.history, 'history');

    renderHistoryGrid('historyEventsGrid', 'historyEventsCount', filteredEvents, 'Nenhum evento finalizado encontrado.', false);
    renderHistoryGrid('historyRentalsGrid', 'historyRentalsCount', filteredRentals, 'Nenhuma locação finalizada encontrada.', true);
}

async function loadHistoryEvents() {
    if (currentUser?.isGuest) {
        const data = await storage.getHistoryData();
        allHistoryEvents = data.events;
        allHistoryRentals = data.rentals;
        renderHistoryEvents(allHistoryEvents, allHistoryRentals, getHistorySearchValue());
        return;
    }
    try {
        const response = await fetch('api/history-events', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = 'login/';
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

function renderEquipments(equipments) {
    const tbody = document.querySelector('#equipmentsTable tbody');
    const theadRow = document.querySelector('#equipmentsTable thead tr');
    if (!tbody || !theadRow) return;

    const relacaoEventId = localStorage.getItem('relacao_event_id');
    const actionHeader = theadRow.querySelector('th:last-child');
    if (actionHeader) {
        actionHeader.textContent = '';
    }

    tbody.innerHTML = '';

    if (equipments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Nenhum equipamento encontrado.</td></tr>';
        return;
    }

    const orderedEquipments = sortItems(equipments, sortState.database, 'database');
    const groupedEquipments = new Map();

    orderedEquipments.forEach((eq) => {
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
            categoryRow.innerHTML = '<td colspan="5">' + escapeHtml(category) + '</td>';
            tbody.appendChild(categoryRow);

            items
                .forEach((eq) => {
                    const row = document.createElement('tr');
                    const statusRaw = String(eq.current_status || '').toLowerCase();
                    const isDisponivel = !statusRaw || statusRaw === 'disponÃ­vel' || statusRaw === 'disponivel';
                    const isPreSeparado = statusRaw === 'pre separado';
                    const isRelacao = statusRaw === 'relaÃ§Ã£o' || statusRaw === 'relacao';
                    const isManutencao = statusRaw.includes('manut');
                    const statusText = isPreSeparado ? 'Pre separado' : (isRelacao ? 'RelaÃ§Ã£o' : (isManutencao ? 'Em Manutencao' : (isDisponivel ? 'Disponivel' : 'Indisponivel')));
                    const statusClass = (isPreSeparado || isRelacao) ? 'badge-relation' : (isManutencao ? 'badge-maintenance' : (isDisponivel ? 'badge-available' : 'badge-unavailable'));
                    const warningButton = isManutencao && eq.maintenance_description
                        ? `<button type="button" class="warning-button" onclick="openMaintenanceDetails(${eq.id})" title="Ver problema"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></button>`
                        : '';

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
                        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td>${escapeHtml(eq.current_event_name || '-')}</td>
                        <td>${actionButtons.join(' ')}</td>`;
                    tbody.appendChild(row);
                });
        });
}

async function loadEquipments(search = '') {
    if (currentUser?.isGuest) {
        const all = await storage.getEquipments();
        allEquipments = search
            ? all.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || (e.barcode || '').toLowerCase().includes(search.toLowerCase()))
            : all;
        renderEquipments(allEquipments);
        return;
    }
    try {
        const response = await fetch(`api/equipments?search=${encodeURIComponent(search)}`, { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = 'login/';
            return;
        }

        allEquipments = await response.json();
        renderEquipments(allEquipments);
    } catch (error) {
        console.error(error);
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
    if (currentUser?.isGuest) {
        const equipments = await storage.getEquipments();
        maintenanceEquipments = equipments.filter((equipment) =>
            String(equipment.current_status || '').toLowerCase().includes('manut')
        );
        renderMaintenanceList(maintenanceEquipments);
        return;
    }
    try {
        const response = await fetch('api/equipments', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = 'login/';
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
        const alreadyAdded = pendingItems.some((item) => Number(item.id) === Number(id));

        if (!alreadyAdded) {
            pendingItems.push({
                id: Number(id),
                name,
                barcode
            });
            localStorage.setItem(pendingKey, JSON.stringify(pendingItems));

            if (currentUser?.isGuest) {
                await storage.updateEquipment(Number(id), { current_status: 'Pre separado' });
            } else {
                await fetch(`api/equipments/${Number(id)}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'Pre separado' }),
                    credentials: 'include'
                });
            }
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

    if (currentUser?.isGuest) {
        const pendingKey = `pending_items_${id}`;
        const pendingOtherKey = `pending_other_items_${id}`;
        const pendingItems = JSON.parse(localStorage.getItem(pendingKey) || '[]');
        if (pendingItems.length > 0) {
            await Promise.allSettled(pendingItems.map((item) => storage.updateEquipment(Number(item.id), { current_status: 'Disponivel' })));
        }
        await storage.deleteEvent(id);
        localStorage.removeItem(pendingKey);
        localStorage.removeItem(pendingOtherKey);
        clearRelacaoContext();
        await loadEvents();
        await loadEquipments(getEquipmentSearchValue());
        return;
    }

    try {
        const pendingKey = `pending_items_${id}`;
        const pendingOtherKey = `pending_other_items_${id}`;
        const pendingItems = JSON.parse(localStorage.getItem(pendingKey) || '[]');

        if (pendingItems.length > 0) {
            await Promise.allSettled(
                pendingItems.map((item) =>
                    fetch(`api/equipments/${Number(item.id)}/status`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'Disponivel' }),
                        credentials: 'include'
                    })
                )
            );
        }

        const response = await fetch(`api/events/${id}`, {
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
    const theadRow = document.querySelector('#cablesTable thead tr');
    const actionHeader = theadRow?.querySelector('th:last-child');

    if (actionHeader) {
        actionHeader.textContent = '';
    }

    tbody.innerHTML = '';

    if (cables.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Nenhum cabo encontrado.</td></tr>';
        return;
    }

    const groupedCables = new Map();
    const orderedCables = sortItems(cables, sortState.database, 'database');
    orderedCables.forEach((cable) => {
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
                categoryRow.innerHTML = `<td colspan="4">${escapeHtml(category)}</td>`;
                tbody.appendChild(categoryRow);
            }

            items
                .forEach((cable) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${escapeHtml(cable.name)}</td>
                        <td class="cable-quantity-cell cable-quantity-column">${escapeHtml(cable.quantity)}</td>
                        <td class="cable-quantity-cell cable-quantity-column cable-available-quantity-cell" style="color: #2ecc71;">${escapeHtml(cable.available_quantity)}</td>
                        <td>${relacaoEventId ? '' : `<button type="button" class="btn-danger btn-delete-mini" onclick="deleteCable(${cable.id}, '${escapeJsString(cable.name)}')">Excluir</button>`}</td>
                    `;
                    tbody.appendChild(row);
                });
        });
}

function requestDeletePassword() {
    const password = prompt('Digite a senha para excluir:');
    if (password === null) return null;
    return String(password).trim();
}

async function deleteRentalEvent(id, name) {
    if (!confirm('Deseja excluir esta locação?')) return;

    if (currentUser?.isGuest) {
        await storage.deleteEvent(id);
        await loadRentalEvents();
        await loadNotifications();
        alert(`${name} excluido com sucesso.`);
        return;
    }

    const password = requestDeletePassword();
    if (password === null) return;

    try {
        const response = await fetch(`api/rental-events/${Number(id)}`, {
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
        await loadNotifications();
        alert(`${name} excluido com sucesso.`);
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

async function deleteEquipment(id, name) {
    if (currentUser?.isGuest) {
        if (!confirm(`Deseja excluir "${name}"?`)) return;
        await storage.deleteEquipment(id);
        await Promise.all([loadEquipments(getEquipmentSearchValue()), loadMaintenanceEquipments()]);
        alert(`${name} excluido com sucesso.`);
        return;
    }

    const password = requestDeletePassword();
    if (password === null) return;

    try {
        const response = await fetch(`api/equipments/${Number(id)}`, {
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
    if (currentUser?.isGuest) {
        if (!confirm(`Deseja excluir "${name}"?`)) return;
        await storage.deleteCable(id);
        await Promise.all([loadCables(getEquipmentSearchValue()), loadMaintenanceCables()]);
        alert(`${name} excluido com sucesso.`);
        return;
    }

    const password = requestDeletePassword();
    if (password === null) return;

    try {
        const response = await fetch(`api/cables/${Number(id)}`, {
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
    if (currentUser?.isGuest) {
        if (!confirm(`Deseja excluir "${name}"?`)) return;
        await storage.deleteOtherItem(id);
        await loadOtherItems(getEquipmentSearchValue());
        alert(`${name} excluido com sucesso.`);
        return;
    }

    const password = requestDeletePassword();
    if (password === null) return;

    try {
        const response = await fetch(`api/other-items/${Number(id)}`, {
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
    if (currentUser?.isGuest) {
        const all = await storage.getCables();
        allCables = search ? all.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : all;
        populateCableCategoryOptions(allCables);
        renderCables(allCables);
        return;
    }
    try {
        const response = await fetch(`api/cables?search=${encodeURIComponent(search)}`, { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = 'login/';
            return;
        }

        allCables = await response.json();
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
    const theadRow = document.querySelector('#otherItemsTable thead tr');
    const actionHeader = theadRow?.querySelector('th:last-child');

    if (actionHeader) {
        actionHeader.textContent = '';
    }

    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Nenhum item encontrado.</td></tr>';
        return;
    }

    sortItems(items, sortState.database, 'database')
        .forEach((item) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(item.name)}</td>
                <td class="cable-quantity-cell cable-quantity-column">${escapeHtml(item.quantity)}</td>
                <td class="cable-quantity-cell cable-quantity-column cable-available-quantity-cell" style="color: #2ecc71;">${escapeHtml(item.available_quantity)}</td>
                <td>${relacaoEventId
                    ? `<button type="button" class="btn-primary btn-small" onclick="adicionarOutroARelacao(${item.id}, '${escapeJsString(item.name)}', ${Number(item.available_quantity) || 0})">Adicionar</button>`
                    : `<button type="button" class="btn-danger btn-delete-mini" onclick="deleteOtherItem(${item.id}, '${escapeJsString(item.name)}')">Excluir</button>`}</td>
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
    const existing = pendingItems.find((item) => Number(item.id) === Number(id));

    if (existing) {
        existing.quantity = quantity;
    } else {
        pendingItems.push({ id: Number(id), name, quantity });
    }

    localStorage.setItem(pendingKey, JSON.stringify(pendingItems));
    alert(`${name} adicionado ao evento.`);
}

async function loadOtherItems(search = '') {
    if (currentUser?.isGuest) {
        const all = await storage.getOtherItems();
        allOtherItems = search ? all.filter(i => i.name.toLowerCase().includes(search.toLowerCase())) : all;
        renderOtherItems(allOtherItems);
        return;
    }
    try {
        const response = await fetch(`api/other-items?search=${encodeURIComponent(search)}`, { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = 'login/';
            return;
        }

        allOtherItems = await response.json();
        renderOtherItems(allOtherItems);
    } catch (error) {
        console.error(error);
    }
}

async function loadMaintenanceCables() {
    if (currentUser?.isGuest) {
        const cables = await storage.getCables();
        maintenanceCables = cables.filter((cable) => !!cable.maintenance_description);
        renderCableMaintenanceList(maintenanceCables);
        return;
    }
    try {
        const response = await fetch('api/cables', { credentials: 'include' });
        if (response.status === 401) {
            window.location.href = 'login/';
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
    const isGuestMode = localStorage.getItem('isGuestMode') === 'true';
    
    if (isGuestMode) {
        clearLocalDataExceptAppearance();
        window.location.href = 'login/';
        return;
    }
    
    // Server logout for authenticated users
    try {
        const response = await fetch('api/logout', {
            method: 'POST',
            credentials: 'include'
        });

        if (!response.ok) {
            alert('Nao foi possivel encerrar a sessao.');
            return;
        }

        clearPendingItems();
        clearRelacaoContext();
        window.location.href = 'login/';
    } catch (error) {
        console.error(error);
        alert('Erro de conexao.');
    }
}

function toggleSidebar() {
    const container = document.querySelector('.app-container');
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        const isOpen = container.classList.toggle('mobile-sidebar-open');
        document.getElementById('sidebarBackdrop')?.classList.toggle('active', isOpen);
    } else {
        const isCollapsed = container.classList.toggle('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', isCollapsed ? '1' : '0');
    }
}

function closeMobileSidebar() {
    document.querySelector('.app-container')?.classList.remove('mobile-sidebar-open');
    document.getElementById('sidebarBackdrop')?.classList.remove('active');
}

document.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isEquip = e.target.id === 'equipmentForm';
    const isEvent = e.target.id === 'eventForm';
    const isCable = e.target.id === 'cableForm';
    const isOtherItem = e.target.id === 'otherItemForm';
    const isRental = e.target.id === 'rentalForm';
    if (!isEquip && !isEvent && !isCable && !isOtherItem && !isRental) return;

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
            date: document.getElementById('eventDate').value
        };

    if (isRental && data.returnDate < data.withdrawalDate) {
        alert('A data de devolucao nao pode ser anterior a data de retirada.');
        return;
    }

    if (currentUser?.isGuest) {
        try {
            if (isEquip) {
                await storage.createEquipment({ ...data, current_status: 'Disponivel' });
                e.target.reset();
                populateCategoryOptions();
                alert('Equipamento cadastrado com sucesso.');
                closeCadastroModal();
                setCadastroTab('equipamentos');
                await loadEquipments(getEquipmentSearchValue());
            } else if (isCable) {
                await storage.createCable({ ...data, available_quantity: data.quantity });
                e.target.reset();
                populateCableCategoryOptions();
                alert('Cabo cadastrado com sucesso.');
                closeCadastroModal();
                setCadastroTab('cabos');
                await loadCables();
            } else if (isOtherItem) {
                await storage.createOtherItem({ ...data, available_quantity: data.quantity });
                e.target.reset();
                alert('Item cadastrado com sucesso.');
                closeCadastroModal();
                setCadastroTab('outros');
                await loadOtherItems();
            } else if (isRental && editingRentalEventId) {
                await storage.updateEvent(editingRentalEventId, {
                    withdrawal_date: data.withdrawalDate,
                    return_date: data.returnDate,
                    date: data.withdrawalDate
                });
                if (Number(localStorage.getItem('relacao_event_id')) === Number(editingRentalEventId)) {
                    localStorage.setItem('relacao_withdrawal_date', data.withdrawalDate);
                    localStorage.setItem('relacao_return_date', data.returnDate);
                }
                alert('Datas da locação atualizadas com sucesso.');
                closeRentalModal();
                showSection('locacao');
                await loadRentalEvents();
                await loadNotifications();
            } else if (isRental) {
                await storage.createEvent({ name: data.name, event_type: 'rental', withdrawal_date: data.withdrawalDate, return_date: data.returnDate, created_by_username: currentUser?.username || 'convidado' });
                e.target.reset();
                alert('Locação criada com sucesso.');
                closeRentalModal();
                showSection('locacao');
                await loadRentalEvents();
                await loadNotifications();
            } else {
                await storage.createEvent({ name: data.name, date: data.date, event_type: 'event', created_by_username: currentUser?.username || 'convidado' });
                e.target.reset();
                alert('Evento criado com sucesso.');
                closeEventModal();
                showSection('home');
                await loadEvents();
            }
        } catch (err) {
            console.error(err);
            alert('Erro ao salvar.');
        }
        return;
    }

    try {
        if (isRental && editingRentalEventId) {
            const res = await fetch(`api/rental-events/${Number(editingRentalEventId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    withdrawalDate: data.withdrawalDate,
                    returnDate: data.returnDate
                }),
                credentials: 'include'
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                alert(error.error || 'Nao foi possivel atualizar as datas.');
                return;
            }

            alert('Datas da locação atualizadas com sucesso.');
            if (Number(localStorage.getItem('relacao_event_id')) === Number(editingRentalEventId)) {
                localStorage.setItem('relacao_withdrawal_date', data.withdrawalDate);
                localStorage.setItem('relacao_return_date', data.returnDate);
            }
            closeRentalModal();
            showSection('locacao');
            await loadRentalEvents();
            await loadRentalReturnAlerts();
            await loadNotifications();
            return;
        }

        const res = await fetch(
            isEquip ? 'api/equipments' : (isCable ? 'api/cables' : (isOtherItem ? 'api/other-items' : (isRental ? 'api/rental-events' : 'api/events'))),
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
            await loadNotifications();
        } else if (isEvent) {
            closeEventModal();
            showSection('home');
            await loadEvents();
        } else if (isCable) {
            closeCadastroModal();
            setCadastroTab('cabos');
            await loadCables();
        } else if (isOtherItem) {
            closeCadastroModal();
            setCadastroTab('outros');
            await loadOtherItems();
        } else {
            closeCadastroModal();
            setCadastroTab('equipamentos');
            await loadEquipments(getEquipmentSearchValue());
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

    if (currentUser?.isGuest) {
        const equipments = await storage.getEquipments();
        const equipment = equipments.find((item) => item.barcode === barcode);
        if (!equipment) {
            alert('Equipamento nao encontrado.');
            clearMaintenance();
            return;
        }
        selectedMaintenanceItem = equipment;
        selectedMaintenanceType = 'equipamento';
        openMaintenanceModal('create', equipment, 'equipamento');
        return;
    }

    try {
        const response = await fetch(`api/equipments?search=${encodeURIComponent(barcode)}`, { credentials: 'include' });
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

    if (currentUser?.isGuest) {
        const cables = await storage.getCables();
        const normalizedName = cableName.toLowerCase();
        const cable = cables.find((item) => String(item.name || '').toLowerCase() === normalizedName) || cables.find((item) => String(item.name || '').toLowerCase().includes(normalizedName));
        if (!cable) {
            alert('Cabo nao encontrado.');
            clearMaintenance();
            return;
        }
        selectedMaintenanceItem = cable;
        selectedMaintenanceType = 'cabo';
        openMaintenanceModal('create', cable, 'cabo');
        return;
    }

    try {
        const response = await fetch(`api/cables?search=${encodeURIComponent(cableName)}`, { credentials: 'include' });
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

    if (currentUser?.isGuest) {
        if (selectedMaintenanceType === 'cabo') {
            await storage.updateCable(selectedMaintenanceItem.id, { maintenance_description: description });
            await Promise.all([loadCables(getEquipmentSearchValue()), loadMaintenanceCables()]);
        } else {
            await storage.updateEquipment(selectedMaintenanceItem.id, { current_status: 'Em manutencao', maintenance_description: description });
            await Promise.all([loadEquipments(getEquipmentSearchValue()), loadMaintenanceEquipments()]);
        }
        alert('Manutencao registrada com sucesso.');
        closeMaintenanceModal();
        clearMaintenance();
        return;
    }

    try {
        const response = await fetch(selectedMaintenanceType === 'cabo' ? 'api/cable-maintenances' : 'api/maintenances', {
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

    if (currentUser?.isGuest) {
        await storage.updateEquipment(Number(equipmentId), { current_status: 'Disponivel', maintenance_description: null });
        await loadMaintenanceEquipments();
        await loadEquipments(getEquipmentSearchValue());
        alert(`${equipment.name} marcado como disponivel.`);
        return;
    }

    try {
        const response = await fetch(`api/maintenances/${Number(equipmentId)}/ready`, {
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

    if (currentUser?.isGuest) {
        await storage.updateCable(Number(cableId), { maintenance_description: null });
        await Promise.all([loadMaintenanceCables(), loadCables(getEquipmentSearchValue())]);
        alert(`${cable.name} marcado como pronto.`);
        return;
    }

    try {
        const response = await fetch(`api/cable-maintenances/${Number(cableId)}/ready`, {
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

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR');
}

function applyLoginManagementVisibility() {
    const role = currentUser?.role || 'user';
    const isGestor = currentUser?.isGestorAdmin;
    const isAdmin  = isGestor || currentUser?.isAdmin;

    // Users menu item (sidebar)
    const menuItem = document.getElementById('usersMenuItem');
    if (menuItem) menuItem.style.display = isAdmin ? '' : 'none';

    // Settings tabs visibility
    const tabUsers    = document.getElementById('settingsTabUsers');
    const tabTheme    = document.getElementById('settingsTabTheme');
    const tabLogo     = document.getElementById('settingsTabLogo');
    const tabEmpresas = document.getElementById('settingsTabEmpresas');
    const tabNotificacoes = document.getElementById('settingsTabNotificacoes');
    const tabSobre = document.getElementById('settingsTabSobre');
    const noAccess    = document.getElementById('settingsNoAccess');
    const tabsBar     = document.getElementById('settingsTabsBar');

    if (role === 'user' && !isAdmin) {
        // Regular users: show only the Sobre tab (no admin settings)
        if (tabsBar)     tabsBar.style.display        = '';
        if (noAccess)    noAccess.style.display        = 'none';
        if (tabUsers)    tabUsers.style.display        = 'none';
        if (tabTheme)    tabTheme.style.display        = 'none';
        if (tabLogo)     tabLogo.style.display         = 'none';
        if (tabEmpresas) tabEmpresas.style.display     = 'none';
        if (tabNotificacoes) tabNotificacoes.style.display = 'none';
        if (tabSobre)    tabSobre.style.display        = '';
        // Auto-navigate to the only available tab
        showSettingsTab('sobre');
    } else {
        if (tabsBar)  tabsBar.style.display  = '';
        if (noAccess) noAccess.style.display = 'none';
        if (tabUsers)   tabUsers.style.display   = '';
        if (tabTheme)   tabTheme.style.display   = '';
        if (tabLogo)    tabLogo.style.display    = '';
        if (tabNotificacoes) tabNotificacoes.style.display = '';
        if (tabSobre) tabSobre.style.display = '';
        // empresas tab: visible to gestor_admin and regular admins (to manage their own company)
        if (tabEmpresas) tabEmpresas.style.display = (isGestor || currentUser?.isAdmin) ? '' : 'none';
    }

    // In user creation form: show gestor option and company selector only for gestor_admin
    const roleGestorOption = document.getElementById('newUserRoleGestor');
    const manageRoleGestorOption = document.getElementById('manageUserRoleGestor');
    const companyGroup     = document.getElementById('newUserCompanyGroup');
    const manageCompanyGroup = document.getElementById('manageUserCompanyGroup');
    const companyHeader    = document.getElementById('usersTableCompanyHeader');
    if (roleGestorOption) roleGestorOption.style.display = isGestor ? '' : 'none';
    if (manageRoleGestorOption) manageRoleGestorOption.style.display = isGestor ? '' : 'none';
    if (companyGroup)     companyGroup.style.display     = isGestor ? '' : 'none';
    if (manageCompanyGroup) manageCompanyGroup.style.display = isGestor ? '' : 'none';
    if (companyHeader)    companyHeader.style.display    = '';
}

function setUsersMessage(message, type = '') {
    const messageEl = document.getElementById('usersMessage');
    if (!messageEl) return;
    messageEl.textContent = message || '';
    messageEl.className = `users-message ${type}`.trim();
}

function toggleCreateUserForm(forceOpen) {
    const modal = document.getElementById('createUserModal');
    const form = document.getElementById('createUserForm');
    if (!modal || !form) return;

    const shouldOpen = typeof forceOpen === 'boolean'
        ? forceOpen
        : modal.style.display === 'none';
    modal.style.display = shouldOpen ? 'flex' : 'none';
    form.style.display = '';

    if (!shouldOpen) {
        form.reset();
    }
}

async function loadLoginUsers() {
    if (!currentUser?.isAdmin && !currentUser?.isGestorAdmin && !currentUser?.isGuest) return;

    // Guest mode: load from localStorage
    if (currentUser?.isGuest) {
        loginUsers = await storage.getUsers();
        canChangeUserPasswords = true;
        const createButton = document.getElementById('openUserCreateButton');
        if (createButton) createButton.style.display = '';
        renderLoginUsers();
        setUsersMessage('');
        return;
    }

    try {
        const response = await fetch('api/users', { credentials: 'include' });
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

const USER_ROLE_LABELS = { gestor_admin: 'Admin Gestor', admin: 'Admin Empresa', user: 'Usuário' };
let _editingUserId = null;

function getUserRoleLabel(role) {
    return USER_ROLE_LABELS[role] || role || 'user';
}

function getCompanyNameById(companyId) {
    const company = _companiesList.find((item) => Number(item.id) === Number(companyId));
    return company?.name || company?.nome || '';
}

function getUserCompanyLabel(user) {
    if (user.company_name) return user.company_name;
    if (user.company_id) return getCompanyNameById(user.company_id) || `#${user.company_id}`;
    return user.role === 'gestor_admin' ? 'Gestora' : '—';
}

function renderLoginUsers() {
    const tbody = document.querySelector('#usersTable tbody');
    if (!tbody) return;

    const isGestor = currentUser?.isGestorAdmin || currentUser?.role === 'guest';
    const companyHeader = document.getElementById('usersTableCompanyHeader');
    if (companyHeader) companyHeader.style.display = '';

    tbody.innerHTML = '';
    loginUsers.forEach((user) => {
        const userId = Number(user.id);
        const canEdit = canChangeUserPasswords && (currentUser?.isAdmin || isGestor);
        const roleLabel = getUserRoleLabel(user.role);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(user.username)}</td>
            <td><span class="user-role-badge ${user.role === 'admin' || user.role === 'gestor_admin' ? 'admin' : ''}">${escapeHtml(roleLabel)}</span></td>
            <td class="hide-mobile">${escapeHtml(getUserCompanyLabel(user))}</td>
            <td class="user-actions-cell">
                <button type="button" class="company-edit-btn" onclick="openUserManage(${userId})" ${canEdit ? '' : 'disabled'} title="Gerenciar usuário">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function openUserManage(userId) {
    const user = loginUsers.find((item) => Number(item.id) === Number(userId));
    if (!user) {
        setUsersMessage('Usuario nao encontrado.', 'error');
        return;
    }

    _editingUserId = Number(userId);
    populateUserCompanySelect(_companiesList);

    const isGestor = currentUser?.isGestorAdmin || currentUser?.role === 'guest';
    const title = document.getElementById('userManageTitle');
    const nameInput = document.getElementById('manageUsername');
    const roleSelect = document.getElementById('manageUserRole');
    const gestorOption = document.getElementById('manageUserRoleGestor');
    const companyGroup = document.getElementById('manageUserCompanyGroup');
    const companySelect = document.getElementById('manageUserCompany');
    const passwordInput = document.getElementById('manageUserPassword');
    const deleteButton = document.getElementById('manageUserDeleteButton');

    if (title) title.textContent = `Gerenciar: ${user.username || ''}`;
    if (nameInput) nameInput.value = user.username || '';
    if (roleSelect) roleSelect.value = user.role || 'user';
    if (gestorOption) gestorOption.style.display = isGestor ? '' : 'none';
    if (companyGroup) companyGroup.style.display = isGestor ? '' : 'none';
    if (companySelect) {
        if (user.company_id && ![...companySelect.options].some((option) => Number(option.value) === Number(user.company_id))) {
            const option = document.createElement('option');
            option.value = user.company_id;
            option.textContent = getUserCompanyLabel(user);
            companySelect.appendChild(option);
        }
        companySelect.value = user.company_id || '';
    }
    if (passwordInput) passwordInput.value = '';
    if (deleteButton) {
        const canDelete = Number(user.id) !== Number(currentUser?.userId);
        deleteButton.style.display = canDelete ? '' : 'none';
    }

    const modal = document.getElementById('userManageModal');
    if (modal) modal.style.display = 'flex';
    setUsersMessage('');
}

function closeUserManageModal() {
    const modal = document.getElementById('userManageModal');
    if (modal) modal.style.display = 'none';
    document.getElementById('userManageForm')?.reset();
    _editingUserId = null;
}

async function saveManagedUser(event) {
    event.preventDefault();
    const user = loginUsers.find((item) => Number(item.id) === Number(_editingUserId));
    if (!user) {
        setUsersMessage('Usuario nao encontrado.', 'error');
        return;
    }

    const isGestor = currentUser?.isGestorAdmin || currentUser?.role === 'guest';
    const username = String(document.getElementById('manageUsername')?.value || '').trim();
    const role = String(document.getElementById('manageUserRole')?.value || 'user').trim();
    const companyIdRaw = document.getElementById('manageUserCompany')?.value || '';
    const password = String(document.getElementById('manageUserPassword')?.value || '');
    const company_id = isGestor
        ? (companyIdRaw ? Number(companyIdRaw) : null)
        : (user.company_id || currentUser?.companyId || null);

    if (!username) {
        setUsersMessage('Informe o nome do usuario.', 'error');
        return;
    }

    if (isGestor && role !== 'gestor_admin' && !company_id) {
        setUsersMessage('Selecione uma empresa para usuarios de empresa.', 'error');
        return;
    }

    if (password && password.trim().length < 4) {
        setUsersMessage('A nova senha deve ter pelo menos 4 caracteres.', 'error');
        return;
    }

    const companyObj = _companiesList.find((company) => Number(company.id) === Number(company_id));
    const payload = {
        username,
        role,
        company_id,
        company_name: companyObj?.name || companyObj?.nome || ''
    };

    try {
        if (currentUser?.isGuest) {
            await storage.updateUser(Number(_editingUserId), payload);
            if (password) await storage.updateUserPassword(Number(_editingUserId), password);
        } else {
            const response = await fetch(`api/users/${Number(_editingUserId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setUsersMessage(data.error || 'Nao foi possivel salvar o usuario.', 'error');
                return;
            }

            if (password) {
                const passwordResponse = await fetch(`api/users/${Number(_editingUserId)}/password`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ password })
                });
                const passwordData = await passwordResponse.json().catch(() => ({}));
                if (!passwordResponse.ok) {
                    setUsersMessage(passwordData.error || 'Dados salvos, mas nao foi possivel alterar a senha.', 'error');
                    return;
                }
            }
        }

        closeUserManageModal();
        await loadLoginUsers();
        setUsersMessage(password ? 'Usuario e senha atualizados com sucesso.' : 'Usuario atualizado com sucesso.', 'success');
    } catch (error) {
        console.error(error);
        setUsersMessage('Erro de conexao.', 'error');
    }
}

async function deleteManagedUser() {
    if (!_editingUserId) return;
    const userId = Number(_editingUserId);
    await deleteLoginUser(userId);
    if (!loginUsers.some((item) => Number(item.id) === userId)) {
        closeUserManageModal();
    }
}

async function changeUserPassword(userId) {
    const input = document.getElementById(`userPassword_${Number(userId)}`);
    const password = String(input?.value || '');
    if (password.trim().length < 4) {
        setUsersMessage('A senha deve ter pelo menos 4 caracteres.', 'error');
        return;
    }

    // Guest mode: update in localStorage
    if (currentUser?.isGuest) {
        await storage.updateUserPassword(Number(userId), password);
        if (input) input.value = '';
        setUsersMessage('Senha atualizada.', 'success');
        return;
    }

    try {
        const response = await fetch(`api/users/${Number(userId)}/password`, {
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
    const isGestor = currentUser?.isGestorAdmin || currentUser?.role === 'guest';
    if (!canChangeUserPasswords || (!currentUser?.isAdmin && !isGestor)) {
        setUsersMessage('Apenas administradores podem cadastrar usuarios.', 'error');
        return;
    }

    const username = String(document.getElementById('newUsername')?.value || '').trim();
    const password = String(document.getElementById('newUserPassword')?.value || '');
    const role = String(document.getElementById('newUserRole')?.value || 'user').trim();
    const companyIdRaw = document.getElementById('newUserCompany')?.value;
    const company_id = companyIdRaw ? Number(companyIdRaw) : null;

    if (!username) {
        setUsersMessage('Informe o usuario.', 'error');
        return;
    }

    if (password.trim().length < 4) {
        setUsersMessage('A senha deve ter pelo menos 4 caracteres.', 'error');
        return;
    }

    // Guest mode: save to localStorage
    if (currentUser?.isGuest) {
        const companies = await storage.getCompanies();
        const effectiveCompanyId = company_id || currentUser.companyId;
        const companyObj = companies.find(c => Number(c.id) === Number(effectiveCompanyId));
        await storage.createUser({
            username, role,
            company_id: effectiveCompanyId,
            company_name: companyObj?.name || '',
            created_at: new Date().toISOString()
        });
        toggleCreateUserForm(false);
        await loadLoginUsers();
        setUsersMessage('Usuario cadastrado com sucesso.', 'success');
        return;
    }

    try {
        const response = await fetch('api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password, role, company_id })
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

    // Guest mode: delete from localStorage
    if (currentUser?.isGuest) {
        await storage.deleteUser(Number(userId));
        await loadLoginUsers();
        setUsersMessage('Usuario excluido.', 'success');
        return;
    }

    try {
        const response = await fetch(`api/users/${Number(userId)}`, {
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

// ── Company management ───────────────────────────────────────────────────────

const PLAN_LABELS = { start: 'Start', pro: 'Pro', ultra: 'Ultra' };
const PLANS_WITH_ADS = ['start'];

function applyAdVisibility(plan) {
    const showAds = PLANS_WITH_ADS.includes(plan);
    const container = document.querySelector('.app-container');
    if (container) container.classList.toggle('has-ad', showAds);
    const banner = document.getElementById('adBanner');
    if (banner && showAds && !banner.dataset.initialized) {
        banner.dataset.initialized = '1';
        banner.innerHTML = `<div class="ad-slot"><span class="ad-label">Publicidade</span><div class="ad-image-placeholder">Espa&ccedil;o Publicit&aacute;rio</div><a class="ad-upgrade-link" href="#" onclick="showSection('config');showSettingsTab('empresas');return false;">✨ Remover an&uacute;ncios &mdash; Upgrade para Pro</a></div>`;
    }
}

function formatCnpj(raw) {
    const d = String(raw || '').replace(/\D/g, '').padStart(14, '0');
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`;
}

function setCompaniesMessage(msg, type = '') {
    const el = document.getElementById('companiesMessage');
    if (!el) return;
    el.textContent = msg || '';
    el.className = `users-message ${type}`.trim();
}

function setCompanyEditMessage(msg, type = '') {
    const el = document.getElementById('companyEditMessage');
    if (!el) return;
    el.textContent = msg || '';
    el.className = `users-message ${type}`.trim();
}

function toggleCreateCompanyForm(forceOpen) {
    const modal = document.getElementById('createCompanyModal');
    const form = document.getElementById('createCompanyForm');
    if (!modal || !form) return;
    const shouldOpen = typeof forceOpen === 'boolean'
        ? forceOpen
        : modal.style.display === 'none';
    modal.style.display = shouldOpen ? 'flex' : 'none';
    form.style.display = '';
    if (!shouldOpen) form.reset();
}

let _companiesList = [];

async function loadCompanies() {
    const isGestor = currentUser?.isGestorAdmin;
    const isAdmin  = isGestor || currentUser?.isAdmin;
    if (!isAdmin) return;

    // Hide/show create button based on role
    const createBtn = document.getElementById('openCompanyCreateButton');
    if (createBtn) createBtn.style.display = isGestor ? '' : 'none';

    try {
        if (currentUser?.isGuest) {
            _companiesList = (typeof storage !== 'undefined')
                ? (await storage.getCompanies() || [])
                : [];
        } else {
            const res = await fetch('api/companies', { credentials: 'include' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setCompaniesMessage(data.error || 'Erro ao carregar empresas.', 'error');
                return;
            }
            _companiesList = Array.isArray(data) ? data : (Array.isArray(data.companies) ? data.companies : []);
        }
        // Non-gestors see only their own company
        const visibleCompanies = isGestor
            ? _companiesList
            : _companiesList.filter(c => Number(c.id) === Number(currentUser?.companyId));
        renderCompanies(visibleCompanies, isGestor);
        populateUserCompanySelect(_companiesList);
        renderLoginUsers();
        setCompaniesMessage('');
    } catch (e) {
        console.error(e);
        setCompaniesMessage('Erro de conexao.', 'error');
    }
}

const _planBadgeClass = { start: '', pro: 'admin', ultra: 'admin' };

function renderCompanies(companies, isGestor = false) {
    const tbody = document.querySelector('#companiesTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    companies.forEach(c => {
        const planLabel = PLAN_LABELS[c.plan] || c.plan || '\u2014';
        const planClass = _planBadgeClass[c.plan] || '';
        const row = document.createElement('tr');
        const deleteBtn = isGestor
            ? `<button type="button" class="btn-danger user-password-button" onclick="deleteCompany(${Number(c.id)})" ${(c.is_owner || c.is_gestora) ? 'disabled title="Empresa gestora n\u00e3o pode ser exclu\u00edda"' : ''}>Excluir</button>`
            : '';
        row.innerHTML = `
            <td>${escapeHtml(c.name || c.nome || '\u2014')}</td>
            <td>${escapeHtml(c.cnpj ? formatCnpj(c.cnpj) : '\u2014')}</td>
            <td>${escapeHtml(c.city || '\u2014')}</td>
            <td><span class="user-role-badge ${planClass}">${planLabel}</span></td>
            <td>${(c.is_owner || c.is_gestora) ? '<span class="user-role-badge admin">Gestora</span>' : 'Cliente'}</td>
            <td class="user-actions-cell">
                <button type="button" class="company-edit-btn" onclick="openCompanyEdit(${Number(c.id)})" title="Editar empresa">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                ${deleteBtn}
            </td>
        `;
        tbody.appendChild(row);
    });
}

function openCompanyEdit(companyId) {
    const company = _companiesList.find(c => Number(c.id) === Number(companyId));
    if (!company) return;

    const panel = document.getElementById('companyEditPanel');

    const canEditPlan = currentUser?.isGestorAdmin || currentUser?.isGuest;
    const planSection = document.getElementById('editCompanyPlanSection');
    const planGroup   = document.getElementById('editCompanyPlanGroup');
    if (planSection) planSection.style.display = canEditPlan ? '' : 'none';
    if (planGroup)   planGroup.style.display   = canEditPlan ? '' : 'none';

    populateCompanyEditForm(company);
    if (panel) {
        panel.style.display = 'flex';
    }
    setCompanyEditMessage('');
}

function closeCompanyEdit() {
    const panel = document.getElementById('companyEditPanel');
    if (panel) panel.style.display = 'none';
    const form = document.getElementById('companyEditForm');
    if (form) form.reset();
    setCompanyEditMessage('');
    _editingCompanyId = null;
}

let _editingCompanyId = null;

function populateCompanyEditForm(company) {
    _editingCompanyId = company.id;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };
    set('editCompanyCnpj',              company.cnpj ? formatCnpj(company.cnpj) : '');
    set('editCompanyName',              company.name || company.nome);
    set('editCompanyLegalName',         company.legal_name || company.razao_social);
    set('editCompanyTradeName',         company.trade_name);
    set('editCompanyStateReg',          company.state_registration || company.inscricao_estadual);
    set('editCompanyMunicipalReg',      company.municipal_registration);
    set('editCompanyZipCode',           company.zip_code);
    set('editCompanyAddress',           company.address);
    set('editCompanyAddressNumber',     company.address_number);
    set('editCompanyAddressComplement', company.address_complement);
    set('editCompanyNeighborhood',      company.neighborhood);
    set('editCompanyCity',              company.city);
    set('editCompanyState',             company.state);
    set('editCompanyCountry',           company.country || 'Brasil');
    set('editCompanyPhone',             company.phone || company.telefone);
    set('editCompanyPhone2',            company.phone2);
    set('editCompanyEmail',             company.email);
    set('editCompanyWebsite',           company.website);
    set('editCompanyLegalRep',          company.legal_representative || company.representante_legal);
    set('editCompanyAccountingEmail',   company.accounting_email || company.email_contabilidade);
    set('editCompanySysAdminEmail',     company.system_admin_email || company.email_responsavel_sistema);
    set('editCompanyAdminEmail',        company.company_admin_email || company.email_responsavel_empresa);
    const planEl = document.getElementById('editCompanyPlan');
    if (planEl) planEl.value = company.plan || 'pro';
}

async function saveCompanyEdit(event) {
    event.preventDefault();
    if (!_editingCompanyId) return;

    const get = id => String(document.getElementById(id)?.value || '').trim();
    const isGestor = currentUser?.isGestorAdmin || currentUser?.role === 'guest';
    const payload = {
        name:                   get('editCompanyName'),
        legal_name:             get('editCompanyLegalName'),
        trade_name:             get('editCompanyTradeName'),
        state_registration:     get('editCompanyStateReg'),
        municipal_registration: get('editCompanyMunicipalReg'),
        zip_code:               get('editCompanyZipCode'),
        address:                get('editCompanyAddress'),
        address_number:         get('editCompanyAddressNumber'),
        address_complement:     get('editCompanyAddressComplement'),
        neighborhood:           get('editCompanyNeighborhood'),
        city:                   get('editCompanyCity'),
        state:                  get('editCompanyState'),
        country:                get('editCompanyCountry') || 'Brasil',
        phone:                  get('editCompanyPhone'),
        phone2:                 get('editCompanyPhone2'),
        email:                  get('editCompanyEmail'),
        website:                get('editCompanyWebsite'),
        legal_representative:   get('editCompanyLegalRep'),
        accounting_email:       get('editCompanyAccountingEmail'),
        system_admin_email:     get('editCompanySysAdminEmail'),
        company_admin_email:    get('editCompanyAdminEmail'),
    };
    if (isGestor) payload.plan = get('editCompanyPlan');

    if (!payload.name) {
        setCompanyEditMessage('O nome fantasia \u00e9 obrigat\u00f3rio.', 'error');
        return;
    }

    try {
        if (currentUser?.isGuest) {
            if (typeof storage !== 'undefined') await storage.updateCompany(_editingCompanyId, payload);
            const idx = _companiesList.findIndex(c => Number(c.id) === Number(_editingCompanyId));
            if (idx !== -1) _companiesList[idx] = { ..._companiesList[idx], ...payload };
            const isGestor = currentUser?.isGestorAdmin;
            const visibleCompanies = isGestor
                ? _companiesList
                : _companiesList.filter(c => Number(c.id) === Number(currentUser?.companyId));
            renderCompanies(visibleCompanies, isGestor);
            if (payload.plan && Number(_editingCompanyId) === Number(currentUser?.companyId)) {
                currentUser.companyPlan = payload.plan;
                applyAdVisibility(payload.plan);
            }
            setCompanyEditMessage('Dados salvos com sucesso.', 'success');
            return;
        }
        const res = await fetch(`api/companies/${Number(_editingCompanyId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setCompanyEditMessage(data.error || 'Erro ao salvar dados.', 'error');
            return;
        }
        await loadCompanies();
        if (payload.plan && Number(_editingCompanyId) === Number(currentUser?.companyId)) {
            currentUser.companyPlan = payload.plan;
            applyAdVisibility(payload.plan);
        }
        setCompanyEditMessage('Dados salvos com sucesso.', 'success');
    } catch (e) {
        console.error(e);
        setCompanyEditMessage('Erro de conexao.', 'error');
    }
}

function populateUserCompanySelect(companies) {
    const selects = [
        document.getElementById('newUserCompany'),
        document.getElementById('manageUserCompany')
    ].filter(Boolean);

    selects.forEach((select) => {
        const previousValue = select.value;
        select.innerHTML = '<option value="">-- Sem empresa (Gestor) --</option>';
        companies.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name || c.nome || '';
            select.appendChild(opt);
        });
        if ([...select.options].some((option) => option.value === previousValue)) {
            select.value = previousValue;
        }
    });
}

async function createCompany(event) {
    event.preventDefault();
    const isGestor = currentUser?.isGestorAdmin || currentUser?.role === 'guest';
    if (!isGestor) {
        setCompaniesMessage('Apenas o gestor pode cadastrar empresas.', 'error');
        return;
    }

    const get = id => String(document.getElementById(id)?.value || '').trim();
    const payload = {
        cnpj:                   get('newCompanyCnpj'),
        name:                   get('newCompanyName'),
        legal_name:             get('newCompanyLegalName'),
        trade_name:             get('newCompanyTradeName'),
        state_registration:     get('newCompanyStateReg'),
        municipal_registration: get('newCompanyMunicipalReg'),
        zip_code:               get('newCompanyZipCode'),
        address:                get('newCompanyAddress'),
        address_number:         get('newCompanyAddressNumber'),
        address_complement:     get('newCompanyAddressComplement'),
        neighborhood:           get('newCompanyNeighborhood'),
        city:                   get('newCompanyCity'),
        state:                  get('newCompanyState'),
        country:                get('newCompanyCountry') || 'Brasil',
        phone:                  get('newCompanyPhone'),
        phone2:                 get('newCompanyPhone2'),
        email:                  get('newCompanyEmail'),
        website:                get('newCompanyWebsite'),
        legal_representative:   get('newCompanyLegalRep'),
        accounting_email:       get('newCompanyAccountingEmail'),
        system_admin_email:     get('newCompanySysAdminEmail'),
        company_admin_email:    get('newCompanyAdminEmail'),
        plan:                   get('newCompanyPlan') || 'pro',
    };

    if (!payload.cnpj || !payload.name) {
        setCompaniesMessage('CNPJ e Nome Fantasia s\u00e3o obrigat\u00f3rios.', 'error');
        return;
    }

    try {
        if (currentUser?.isGuest) {
            if (typeof storage !== 'undefined') await storage.createCompany(payload);
            toggleCreateCompanyForm(false);
            await loadCompanies();
            setCompaniesMessage('Empresa cadastrada com sucesso.', 'success');
            return;
        }
        const res = await fetch('api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setCompaniesMessage(data.error || 'Erro ao cadastrar empresa.', 'error');
            return;
        }
        toggleCreateCompanyForm(false);
        await loadCompanies();
        setCompaniesMessage('Empresa cadastrada com sucesso.', 'success');
    } catch (e) {
        console.error(e);
        setCompaniesMessage('Erro de conexao.', 'error');
    }
}

async function deleteCompany(companyId) {
    const company = _companiesList.find(c => Number(c.id) === Number(companyId));
    if (!company) {
        setCompaniesMessage('Empresa n\u00e3o encontrada.', 'error');
        return;
    }
    if (company.is_owner || company.is_gestora) {
        setCompaniesMessage('N\u00e3o \u00e9 poss\u00edvel excluir a empresa gestora.', 'error');
        return;
    }
    if (!window.confirm(`Excluir a empresa "${company.name || company.nome}"?`)) return;

    try {
        if (currentUser?.isGuest) {
            if (typeof storage !== 'undefined') await storage.deleteCompany(companyId);
            await loadCompanies();
            setCompaniesMessage('Empresa exclu\u00edda.', 'success');
            return;
        }
        const res = await fetch(`api/companies/${Number(companyId)}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setCompaniesMessage(data.error || 'Erro ao excluir empresa.', 'error');
            return;
        }
        await loadCompanies();
        setCompaniesMessage('Empresa exclu\u00edda.', 'success');
    } catch (e) {
        console.error(e);
        setCompaniesMessage('Erro de conexao.', 'error');
    }
}
// ─────────────────────────────────────────────────────────────────────────────

async function checkAuth() {
    // Check if in guest mode from localStorage (for GitHub Pages)
    const isGuestMode = localStorage.getItem('isGuestMode') === 'true';
    
    if (isGuestMode) {
        try {
        // Guest mode - no server authentication needed
        if (typeof storage !== 'undefined') {
            storage.setGuestMode(true);
            storage.seedGuestData();
        }
        
        currentUser = { 
            userId: 101, 
            username: 'Convidado', 
            isAdmin: true,
            isGestorAdmin: false,
            isGuest: true,
            role: 'guest',
            companyId: 2,
            companyPlan: 'pro'
        };

        if (typeof storage !== 'undefined') {
            const companies = await storage.getCompanies();
            const guestCo = companies.find(c => Number(c.id) === 2);
            currentUser.companyPlan = guestCo?.plan || 'pro';
        }
        applyAdVisibility(currentUser.companyPlan);
        
        updateLogoutButton();
        applyLoginManagementVisibility();
        document.body.style.visibility = 'visible';
        } catch (e) {
            console.error('Guest mode init error:', e);
            // Corrupted localStorage — clear and reload so the user can start fresh
            localStorage.removeItem('isGuestMode');
            window.location.href = 'login/';
        }
        return;
    }
    
    // Try server authentication (only for non-GitHub Pages deployments)
    try {
        const res = await fetch('api/auth/status', { credentials: 'include' });
        const data = await res.json();
        if (!data.authenticated) {
            window.location.href = 'login/';
            return;
        }
        
        // Set guest mode in storage
        const isGuest = data.isGuest || false;
        if (typeof storage !== 'undefined') {
            storage.setGuestMode(isGuest);
        }
        
        currentUser = data.authenticated
            ? { 
                userId: data.userId || null, 
                username: data.username || '', 
                isAdmin: !!data.isAdmin,
                isGestorAdmin: !!data.isGestorAdmin,
                isGuest: isGuest,
                role: isGuest ? 'guest' : (data.role || (data.isAdmin ? 'admin' : 'user')),
                companyId: data.companyId || null,
                companyPlan: data.companyPlan || null
            }
            : null;
        applyAdVisibility(data.companyPlan || 'pro');

        // Load company appearance from server so all users of a company see
        // the same theme/logo/favicon (overwrites local localStorage cache).
        await fetchAndApplyCompanyAppearance();

        updateLogoutButton();
        applyLoginManagementVisibility();
        document.body.style.visibility = 'visible';
    } catch (error) {
        // Server not available - redirect to login
        window.location.href = 'login/';
    }
}

function updateLogoutButton() {
    const logoutText = document.getElementById('logout-user-text');
    const viewport = logoutText?.closest('.logout-name-viewport');
    if (logoutText && currentUser) {
        const username = currentUser.username || 'Usuário';
        logoutText.textContent = username;
        
        // Remove long-text class first
        logoutText.classList.remove('long-text');
        logoutText.style.removeProperty('--logout-scroll-distance');
        
        // Use requestAnimationFrame to ensure DOM layout is complete before checking dimensions
        requestAnimationFrame(() => {
            // Check if text is too long and add scrolling class
            const availableWidth = viewport?.clientWidth || logoutText.clientWidth;
            const overflow = Math.max(0, logoutText.scrollWidth - availableWidth);
            if (overflow > 4) {
                logoutText.style.setProperty('--logout-scroll-distance', `${overflow}px`);
                logoutText.classList.add('long-text');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    populateCategoryOptions();
    populateCableCategoryOptions();
    setupMaintenanceModal();
    document.getElementById('createUserForm')?.addEventListener('submit', createLoginUser);
    if (window.innerWidth > 768 && localStorage.getItem('sidebarCollapsed') === '1') {
        document.querySelector('.app-container')?.classList.add('sidebar-collapsed');
    }
    await checkAuth();
    loadThemeSettings();
    await initializeLottieIcons();
    applyCustomTheme();

    const urlParams = new URLSearchParams(window.location.search);
    const requestedSection = urlParams.get('section') || window.location.hash.replace('#', '');
    const allowedSections = ['home', 'cadastro', 'inventario', 'banco', 'eventos', 'historico', 'manutencao', 'locacao', 'notificacoes', 'config'];
    const section = allowedSections.includes(requestedSection) ? normalizeSectionId(requestedSection) : 'home';
    showSection(section);
    updateSortMenuState();
    await loadNotificationSettings();
    await loadNotifications();

    // Open sidebar after initial navigation so showSection doesn't close it
    if (window.innerWidth <= 768) {
        document.querySelector('.app-container')?.classList.add('mobile-sidebar-open');
        document.getElementById('sidebarBackdrop')?.classList.add('active');
    }

    window.addEventListener('hashchange', () => {
        const requestedHash = window.location.hash.replace('#', '');
        const targetSection = allowedSections.includes(requestedHash) ? normalizeSectionId(requestedHash) : 'home';
        showSection(targetSection);
    });

    // Close color popovers when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.color-picker-wrapper')) {
            document.querySelectorAll('.color-popover.open').forEach(p => p.classList.remove('open'));
        }
        if (!e.target.closest('.filter-control')) {
            closeFilterMenus();
        }
    });
});

function applyTheme(theme) {
    try {
        if (!theme) return;
        const root = document.documentElement;
        Object.keys(theme).forEach((key) => {
            if (!theme[key] || key === 'component-bg') return;
            root.style.setProperty(`--${key}`, theme[key]);
        });
        root.style.setProperty('--component-bg', 'transparent');
    } catch (e) {
        console.error('Erro aplicando tema', e);
    }
}

function loadThemeSettings() {
    try {
        const stored = localStorage.getItem('appTheme');
        if (!stored) return;
        const theme = JSON.parse(stored);
        if (!theme) return;
        
        if (theme['primary'])            setColorValue('primaryColor',      theme['primary']);
        if (theme['primary-2'])          setColorValue('primary2Color',     theme['primary-2']);
        if (theme['warning-color'])      setColorValue('warningColor',      theme['warning-color']);
        if (theme['badge-available-color'])   setColorValue('badgeAvailableColor',   theme['badge-available-color']);
        if (theme['badge-maintenance-color']) setColorValue('badgeMaintenanceColor', theme['badge-maintenance-color']);
        if (theme['badge-relation-color'])    setColorValue('badgeRelationColor',    theme['badge-relation-color']);
        if (theme['btn-ready-color'])         setColorValue('btnReadyColor',         theme['btn-ready-color']);
        if (theme['bg-start'])           setColorValue('bgStart',           theme['bg-start']);
        if (theme['bg-end'])             setColorValue('bgEnd',             theme['bg-end']);
        if (theme['text-color'])         setColorValue('textColor',         theme['text-color']);
        if (theme['secondary-btn-bg'])   setColorValue('secondaryBtnBg',    theme['secondary-btn-bg']);
        if (theme['secondary-btn-border']) setColorValue('secondaryBtnBorder', theme['secondary-btn-border']);
        if (theme['secondary-btn-text']) setColorValue('secondaryBtnText',  theme['secondary-btn-text']);
        if (theme['inner-component-bg']) setColorValue('innerComponentBg',  theme['inner-component-bg']);
        if (theme['input-bg'])           setColorValue('inputBg',           theme['input-bg']);
        if (theme['input-border'])       setColorValue('inputBorder',       theme['input-border']);
        if (theme['input-text'])         setColorValue('inputText',         theme['input-text']);
        
        applyTheme(theme);
    } catch (e) { console.error(e); }
}

// Settings tabs management
function showSettingsTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.settings-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab content
    const content = document.getElementById(`settings-${tabName}`);
    if (content) {
        content.classList.add('active');
    }
    
    // Mark clicked tab as active - find it by the onclick attribute
    document.querySelectorAll('.settings-tab').forEach(tab => {
        if (tab.getAttribute('onclick')?.includes(tabName)) {
            tab.classList.add('active');
        }
    });

    // Trigger data loads
    if (tabName === 'empresas') loadCompanies();
    if (tabName === 'users')    loadLoginUsers();
    if (tabName === 'notificacoes') loadNotificationSettings();
}

function setNotificationSettingsMessage(message, type = '') {
    const el = document.getElementById('notificationSettingsMessage');
    if (!el) return;
    el.textContent = message || '';
    el.className = `users-message ${type}`.trim();
}

async function loadNotificationSettings() {
    await syncNotificationSettingsFromServer();
    const settings = getNotificationSettings();
    const enabled = document.getElementById('notificationEnabled');
    const includeOverdue = document.getElementById('notificationIncludeOverdue');
    const allowUserDismiss = document.getElementById('notificationAllowUserDismiss');
    const daysBefore = document.getElementById('notificationDaysBefore');
    const maxNotices = document.getElementById('notificationMaxNotices');
    const repeatMode = document.getElementById('notificationRepeatMode');

    if (enabled) enabled.checked = settings.enabled;
    if (includeOverdue) includeOverdue.checked = settings.includeOverdue;
    if (allowUserDismiss) allowUserDismiss.checked = settings.allowUserDismiss;
    if (daysBefore) daysBefore.value = settings.daysBefore.join(', ');
    if (maxNotices) maxNotices.value = String(settings.maxNotices);
    if (repeatMode) repeatMode.value = settings.repeatMode;
    setNotificationSettingsMessage('');
}

async function saveNotificationSettings(event) {
    if (event) event.preventDefault();

    const daysInput = document.getElementById('notificationDaysBefore')?.value || '';
    const daysBefore = parseNotificationDays(daysInput);
    if (daysBefore.length === 0) {
        setNotificationSettingsMessage('Informe pelo menos um dia de aviso.', 'error');
        return;
    }

    const settings = {
        enabled: !!document.getElementById('notificationEnabled')?.checked,
        includeOverdue: !!document.getElementById('notificationIncludeOverdue')?.checked,
        allowUserDismiss: !!document.getElementById('notificationAllowUserDismiss')?.checked,
        daysBefore,
        maxNotices: Math.max(1, Math.min(50, Number(document.getElementById('notificationMaxNotices')?.value) || 20)),
        repeatMode: document.getElementById('notificationRepeatMode')?.value === 'once' ? 'once' : 'daily'
    };

    if (currentUser && !currentUser.isGuest) {
        try {
            const response = await fetch('api/notification-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(settings)
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                setNotificationSettingsMessage(error.error || 'Nao foi possivel salvar notificações.', 'error');
                return;
            }
            sharedNotificationSettings = settings;
        } catch (error) {
            console.error(error);
            setNotificationSettingsMessage('Erro de conexao.', 'error');
            return;
        }
    } else {
        localStorage.setItem('notification-settings', JSON.stringify(settings));
        sharedNotificationSettings = null;
    }

    await loadNotificationSettings();
    await loadNotifications();
    setNotificationSettingsMessage('Notificações salvas.', 'success');
}

// ── Appearance persistence helpers ───────────────────────────────────────────

/**
 * Sends a partial appearance update to the server.
 * Pass an object with any subset of { theme, logo, favicon }.
 * Passing null for a key resets that field.
 * Guest mode: no-op (localStorage only).
 */
async function saveAppearanceToServer(updates) {
    if (currentUser?.isGuest) return;
    try {
        const res = await fetch('api/appearance', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (!res.ok) {
            console.warn('Falha ao salvar aparência no servidor:', res.status);
        }
    } catch (e) {
        console.warn('Erro ao salvar aparência no servidor:', e);
    }
}

/**
 * Fetches the company's stored appearance from the server, updates localStorage,
 * then applies it. Called once after a successful login (non-guest only).
 */
async function fetchAndApplyCompanyAppearance() {
    if (currentUser?.isGuest || !currentUser?.companyId) return;
    try {
        const res = await fetch('api/appearance', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const a = data.appearance;
        if (!a) return;

        if (a.theme_json) {
            try {
                const theme = JSON.parse(a.theme_json);
                localStorage.setItem('appTheme', a.theme_json);
                if (theme['primary'])               localStorage.setItem('theme-primary-color',           theme['primary']);
                if (theme['primary-2'])             localStorage.setItem('theme-secondary-color',         theme['primary-2']);
                if (theme['warning-color'])         localStorage.setItem('theme-warning-color',           theme['warning-color']);
                if (theme['badge-available-color']) localStorage.setItem('theme-badge-available-color',   theme['badge-available-color']);
                if (theme['badge-maintenance-color']) localStorage.setItem('theme-badge-maintenance-color', theme['badge-maintenance-color']);
                if (theme['badge-relation-color'])  localStorage.setItem('theme-badge-relation-color',    theme['badge-relation-color']);
                if (theme['btn-ready-color'])       localStorage.setItem('theme-btn-ready-color',         theme['btn-ready-color']);
                if (theme['bg-start'])              localStorage.setItem('theme-bg-start',                theme['bg-start']);
                if (theme['bg-end'])                localStorage.setItem('theme-bg-end',                  theme['bg-end']);
                if (theme['text-color'])            localStorage.setItem('theme-text-color',              theme['text-color']);
                if (theme['secondary-btn-bg'])      localStorage.setItem('theme-secondary-btn-bg',        theme['secondary-btn-bg']);
                if (theme['secondary-btn-border'])  localStorage.setItem('theme-secondary-btn-border',    theme['secondary-btn-border']);
                if (theme['secondary-btn-text'])    localStorage.setItem('theme-secondary-btn-text',      theme['secondary-btn-text']);
                if (theme['inner-component-bg'])    localStorage.setItem('theme-inner-component-bg',      theme['inner-component-bg']);
                if (theme['input-bg'])              localStorage.setItem('theme-input-bg',                theme['input-bg']);
                if (theme['input-border'])          localStorage.setItem('theme-input-border',            theme['input-border']);
                if (theme['input-text'])            localStorage.setItem('theme-input-text',              theme['input-text']);
            } catch (_) { /* ignore parse errors */ }
        }

        if (a.logo_data) {
            localStorage.setItem('custom-logo', a.logo_data);
        } else {
            localStorage.removeItem('custom-logo');
        }

        if (a.favicon_data) {
            localStorage.setItem('custom-favicon', a.favicon_data);
        } else {
            localStorage.removeItem('custom-favicon');
        }
    } catch (_) {
        // Silently fall back to localStorage defaults
    }
}

// Enhanced theme settings
function saveThemeSettings() {
    const primary = document.getElementById('primaryColor')?.value || '#ff3333';
    const primary2 = document.getElementById('primary2Color')?.value || '#cc0000';
    const warningColor = document.getElementById('warningColor')?.value || '#ff0000';
    const badgeAvailableColor = document.getElementById('badgeAvailableColor')?.value || '#2ecc71';
    const badgeMaintenanceColor = document.getElementById('badgeMaintenanceColor')?.value || '#f1c40f';
    const badgeRelationColor = document.getElementById('badgeRelationColor')?.value || '#f1c40f';
    const btnReadyColor = document.getElementById('btnReadyColor')?.value || '#1ea85c';
    const bgStart = document.getElementById('bgStart')?.value || '#1a1a1a';
    const bgEnd = document.getElementById('bgEnd')?.value || '#000000';
    const textColor = document.getElementById('textColor')?.value || '#cccccc';
    const secondaryBtnBg = document.getElementById('secondaryBtnBg')?.value || '#444444';
    const secondaryBtnBorder = document.getElementById('secondaryBtnBorder')?.value || '#555555';
    const secondaryBtnText = document.getElementById('secondaryBtnText')?.value || '#cccccc';
    const innerComponentBg = document.getElementById('innerComponentBg')?.value || '#1a1a1a';
    const inputBg = document.getElementById('inputBg')?.value || '#333333';
    const inputBorder = document.getElementById('inputBorder')?.value || '#555555';
    const inputText = document.getElementById('inputText')?.value || '#ffffff';
    
    const theme = {
        'primary': primary,
        'primary-2': primary2,
        'warning-color': warningColor,
        'badge-available-color': badgeAvailableColor,
        'badge-maintenance-color': badgeMaintenanceColor,
        'badge-relation-color': badgeRelationColor,
        'btn-ready-color': btnReadyColor,
        'bg-start': bgStart,
        'bg-end': bgEnd,
        'text-color': textColor,
        'secondary-btn-bg': secondaryBtnBg,
        'secondary-btn-border': secondaryBtnBorder,
        'secondary-btn-text': secondaryBtnText,
        'inner-component-bg': innerComponentBg,
        'input-bg': inputBg,
        'input-border': inputBorder,
        'input-text': inputText
    };
    
    // Save to localStorage
    localStorage.setItem('theme-primary-color', primary);
    localStorage.setItem('theme-secondary-color', primary2);
    localStorage.setItem('theme-warning-color', warningColor);
    localStorage.setItem('theme-badge-available-color', badgeAvailableColor);
    localStorage.setItem('theme-badge-maintenance-color', badgeMaintenanceColor);
    localStorage.setItem('theme-badge-relation-color', badgeRelationColor);
    localStorage.setItem('theme-btn-ready-color', btnReadyColor);
    localStorage.setItem('theme-bg-start', bgStart);
    localStorage.setItem('theme-bg-end', bgEnd);
    localStorage.setItem('theme-text-color', textColor);
    localStorage.setItem('theme-secondary-btn-bg', secondaryBtnBg);
    localStorage.setItem('theme-secondary-btn-border', secondaryBtnBorder);
    localStorage.setItem('theme-secondary-btn-text', secondaryBtnText);
    localStorage.setItem('theme-inner-component-bg', innerComponentBg);
    localStorage.setItem('theme-input-bg', inputBg);
    localStorage.setItem('theme-input-border', inputBorder);
    localStorage.setItem('theme-input-text', inputText);
    localStorage.setItem('appTheme', JSON.stringify(theme));
    
    // Apply indicator colors immediately
    applyIndicatorColors({ warningColor, badgeAvailableColor, badgeMaintenanceColor, badgeRelationColor, btnReadyColor });
    // Apply theme immediately
    applyTheme(theme);
    applyCustomTheme();
    updateColorInputs();
    // Persist to server so all company users see the same theme
    saveAppearanceToServer({ theme });
    alert('Tema salvo com sucesso!');
}

function resetThemeSettings() {
    localStorage.removeItem('appTheme');
    localStorage.removeItem('theme-primary-color');
    localStorage.removeItem('theme-secondary-color');
    localStorage.removeItem('theme-warning-color');
    localStorage.removeItem('theme-badge-available-color');
    localStorage.removeItem('theme-badge-maintenance-color');
    localStorage.removeItem('theme-badge-relation-color');
    localStorage.removeItem('theme-btn-ready-color');
    localStorage.removeItem('theme-bg-start');
    localStorage.removeItem('theme-bg-end');
    localStorage.removeItem('theme-text-color');
    localStorage.removeItem('theme-secondary-btn-bg');
    localStorage.removeItem('theme-secondary-btn-border');
    localStorage.removeItem('theme-secondary-btn-text');
    localStorage.removeItem('theme-inner-component-bg');
    localStorage.removeItem('theme-input-bg');
    localStorage.removeItem('theme-input-border');
    localStorage.removeItem('theme-input-text');
    
    const defaultTheme = {
        'primary': '#ff3333',
        'primary-2': '#cc0000',
        'warning-color': '#ff0000',
        'bg-start': '#1a1a1a',
        'bg-end': '#000000',
        'text-color': '#cccccc',
        'secondary-btn-bg': '#444444',
        'secondary-btn-border': '#555555',
        'secondary-btn-text': '#cccccc',
        'inner-component-bg': '#1a1a1a',
        'input-bg': '#333333',
        'input-border': '#555555',
        'input-text': '#ffffff'
    };
    
    setColorValue('primaryColor',      defaultTheme['primary']);
    setColorValue('primary2Color',     defaultTheme['primary-2']);
    setColorValue('warningColor',      '#ff0000');
    setColorValue('badgeAvailableColor',   '#2ecc71');
    setColorValue('badgeMaintenanceColor', '#f1c40f');
    setColorValue('badgeRelationColor',    '#f1c40f');
    setColorValue('btnReadyColor',         '#1ea85c');
    setColorValue('bgStart',           defaultTheme['bg-start']);
    setColorValue('bgEnd',             defaultTheme['bg-end']);
    setColorValue('textColor',         defaultTheme['text-color']);
    setColorValue('secondaryBtnBg',    defaultTheme['secondary-btn-bg']);
    setColorValue('secondaryBtnBorder', defaultTheme['secondary-btn-border']);
    setColorValue('secondaryBtnText',  defaultTheme['secondary-btn-text']);
    setColorValue('innerComponentBg',  defaultTheme['inner-component-bg']);
    setColorValue('inputBg',           defaultTheme['input-bg']);
    setColorValue('inputBorder',       defaultTheme['input-border']);
    setColorValue('inputText',         defaultTheme['input-text']);
    
    applyTheme(defaultTheme);
    applyIndicatorColors({ warningColor: '#ff0000', badgeAvailableColor: '#2ecc71', badgeMaintenanceColor: '#f1c40f', badgeRelationColor: '#f1c40f', btnReadyColor: '#1ea85c' });
    // Reset server-side theme as well
    saveAppearanceToServer({ theme: null });
    alert('Tema resetado para o padrão!');
}

function updateColorInputs() {
    // Sync swatch + hex display with the hidden color input value
    ['primaryColor', 'primary2Color', 'warningColor',
     'badgeAvailableColor', 'badgeMaintenanceColor', 'badgeRelationColor', 'btnReadyColor',
     'bgStart', 'bgEnd', 'textColor',
     'secondaryBtnBg', 'secondaryBtnBorder', 'secondaryBtnText',
     'innerComponentBg', 'inputBg', 'inputBorder', 'inputText'].forEach(id => {
        const colorInput = document.getElementById(id);
        if (colorInput) setColorValue(id, colorInput.value);
    });
}

// Logo upload handling
let pendingLogoData = null;

function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
        document.getElementById('logoUploadMessage').textContent = 'Formato de arquivo invalido. Use JPG, PNG, WebP ou SVG.';
        return;
    }
    
    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        document.getElementById('logoUploadMessage').textContent = 'Arquivo muito grande. Tamanho maximo: 2MB.';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        pendingLogoData = e.target.result;
        document.getElementById('logoPreview').src = pendingLogoData;
        document.getElementById('logoUploadMessage').textContent = 'Logo carregada. Clique em "Salvar Logo" para aplicar.';
        document.getElementById('logoUploadMessage').style.color = '#4CAF50';
    };
    reader.readAsDataURL(file);
}

function saveCustomLogo() {
    if (!pendingLogoData) {
        alert('Nenhuma logo foi carregada.');
        return;
    }
    
    // Check if user is guest or admin
    const isGuest = currentUser?.role === 'guest';
    const isAdminOrGestor = currentUser?.isAdmin || currentUser?.isGestorAdmin;

    if (!isGuest && !isAdminOrGestor) {
        alert('Apenas administradores e convidados podem alterar a logo.');
        return;
    }

    // Save to localStorage and persist to server (for all company users)
    localStorage.setItem('custom-logo', pendingLogoData);
    saveAppearanceToServer({ logo: pendingLogoData });

    // Apply to sidebar logo
    const sidebarLogo = document.getElementById('customLogo');
    if (sidebarLogo) {
        sidebarLogo.src = pendingLogoData;
    }

    pendingLogoData = null;
    alert('Logo salva com sucesso!');
}

function updateFavicon(logoData) {
    // Remove existing favicon links
    const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
    existingFavicons.forEach(link => link.remove());
    
    // Create new favicon link
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/webp';
    link.href = logoData;
    document.head.appendChild(link);
}

function resetLogo() {
    localStorage.removeItem('custom-logo');
    saveAppearanceToServer({ logo: null });
    const defaultLogoSrc = 'assets/images/logo.webp';

    document.getElementById('logoPreview').src = defaultLogoSrc;
    const sidebarLogo = document.getElementById('customLogo');
    if (sidebarLogo) {
        sidebarLogo.src = defaultLogoSrc;
    }

    pendingLogoData = null;
    alert('Logo resetada para o padrão!');
}

// Favicon upload handling
let pendingFaviconData = null;

function handleFaviconUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
        document.getElementById('faviconUploadMessage').textContent = 'Formato de arquivo invalido. Use JPG, PNG, WebP ou SVG.';
        return;
    }
    
    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        document.getElementById('faviconUploadMessage').textContent = 'Arquivo muito grande. Tamanho maximo: 2MB.';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        pendingFaviconData = e.target.result;
        document.getElementById('faviconPreview').src = pendingFaviconData;
        document.getElementById('faviconUploadMessage').textContent = 'Favicon carregado. Clique em "Salvar Favicon" para aplicar.';
        document.getElementById('faviconUploadMessage').style.color = '#4CAF50';
    };
    reader.readAsDataURL(file);
}

function saveCustomFavicon() {
    if (!pendingFaviconData) {
        alert('Nenhum favicon foi carregado.');
        return;
    }
    
    // Check if user is guest or admin
    const isGuest = currentUser?.role === 'guest';
    const isAdminOrGestor = currentUser?.isAdmin || currentUser?.isGestorAdmin;

    if (!isGuest && !isAdminOrGestor) {
        alert('Apenas administradores e convidados podem alterar o favicon.');
        return;
    }

    // Save to localStorage and persist to server (for all company users)
    localStorage.setItem('custom-favicon', pendingFaviconData);
    saveAppearanceToServer({ favicon: pendingFaviconData });

    // Update favicon
    updateFavicon(pendingFaviconData);

    pendingFaviconData = null;
    alert('Favicon salvo com sucesso!');
}

function resetFavicon() {
    localStorage.removeItem('custom-favicon');
    saveAppearanceToServer({ favicon: null });
    const defaultFaviconSrc = 'assets/images/favicon.webp';

    document.getElementById('faviconPreview').src = defaultFaviconSrc;

    // Reset favicon to default
    updateFavicon(defaultFaviconSrc);

    pendingFaviconData = null;
    alert('Favicon resetado para o padrão!');
}


// Initialize color input sync
document.addEventListener('DOMContentLoaded', () => {
    // Sync color pickers with text inputs
    ['primary', 'primary2', 'bgStart', 'bgEnd', 'textColor', 'secondaryBtnBg', 'secondaryBtnBorder', 'secondaryBtnText', 'innerComponentBg', 'inputBg', 'inputBorder', 'inputText'].forEach(name => {
        const colorInput = document.getElementById(name + 'Color');
        const hexInput = document.getElementById(name + 'ColorHex');
        
        if (colorInput && hexInput) {
            colorInput.addEventListener('input', () => {
                hexInput.value = colorInput.value;
            });
            
            hexInput.addEventListener('input', () => {
                if (/^#[0-9A-F]{6}$/i.test(hexInput.value)) {
                    colorInput.value = hexInput.value;
                }
            });
        }
    });
});
