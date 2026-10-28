let eventId = null;
let currentEvent = null;
let eventType = 'event';
let saidaEquipments = [];
let filteredSaidaEquipments = [];
let saidaCables = [];
let saidaOtherItems = [];
let entradaEquipments = [];
let entradaCables = [];
let entradaOtherItems = [];
let conferenciaEquipments = [];
let filteredConferenciaEquipments = [];
let equipmentRequirements = [];
let availableCables = [];
let availableOtherItems = [];
let conferenciaOtherItems = [];
let activeSaidaTab = 'equipamentos';
let activeEntradaTab = 'equipamentos';
let equipmentScanQueue = [];
let processingEquipmentScanQueue = false;
let movementRefreshTimer = null;
let eventSpaces = [];
let activeSaidaSpaceId = null;
let activeEntradaSpaceId = null;
let availabilityWarningResolver = null;
let selectedTransferTarget = null;
let selectedTransferCategories = [];
const inFlightJsonRequests = new Map();
const MOVEMENT_REQUEST_MAX_ATTEMPTS = 3;
const MOVEMENT_RETRY_BASE_DELAY_MS = 250;
const MOVEMENT_RETRY_MAX_DELAY_MS = 2000;
const MOVEMENT_AUDIO_STORAGE_KEY = 'event_movement_audio_preferences';
const movementAudioPreferences = loadMovementAudioPreferences();

function loadMovementAudioPreferences() {
    const defaults = { saida: true, entrada: true };
    if (typeof localStorage === 'undefined') return defaults;

    try {
        const saved = JSON.parse(localStorage.getItem(MOVEMENT_AUDIO_STORAGE_KEY) || '{}');
        return {
            saida: typeof saved.saida === 'boolean' ? saved.saida : defaults.saida,
            entrada: typeof saved.entrada === 'boolean' ? saved.entrada : defaults.entrada
        };
    } catch (error) {
        console.warn('Não foi possível carregar as preferências de áudio.', error);
        return defaults;
    }
}

function saveMovementAudioPreferences() {
    if (typeof localStorage === 'undefined') return;

    try {
        localStorage.setItem(MOVEMENT_AUDIO_STORAGE_KEY, JSON.stringify(movementAudioPreferences));
    } catch (error) {
        console.warn('Não foi possível salvar as preferências de áudio.', error);
    }
}

function supportsMovementAudio() {
    return typeof window !== 'undefined'
        && 'speechSynthesis' in window
        && typeof SpeechSynthesisUtterance !== 'undefined';
}

function updateMovementAudioButton(type) {
    const button = document.getElementById(`${type}AudioToggle`);
    const icon = document.getElementById(`${type}AudioToggleIcon`);
    if (!button || !icon) return;

    const label = type === 'saida' ? 'saída' : 'entrada';
    const supported = supportsMovementAudio();
    const enabled = supported && movementAudioPreferences[type] === true;

    icon.textContent = enabled ? '🔊' : '🔇';
    button.disabled = !supported;
    button.classList.toggle('is-enabled', enabled);
    button.classList.toggle('is-muted', !enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', supported
        ? `${enabled ? 'Desativar' : 'Ativar'} áudio de ${label}`
        : 'Áudio indisponível neste navegador');
    button.title = button.getAttribute('aria-label');
}

function initializeMovementAudio() {
    updateMovementAudioButton('saida');
    updateMovementAudioButton('entrada');
}

function toggleMovementAudio(type) {
    if (!['saida', 'entrada'].includes(type) || !supportsMovementAudio()) return;

    movementAudioPreferences[type] = !movementAudioPreferences[type];
    saveMovementAudioPreferences();
    updateMovementAudioButton(type);

    if (!movementAudioPreferences[type]) {
        window.speechSynthesis.cancel();
    }
}

function speakEquipmentMovement(type, equipmentName) {
    const name = String(equipmentName || '').trim();
    if (!name || !movementAudioPreferences[type] || !supportsMovementAudio()) return;

    const label = type === 'saida' ? 'Saída' : 'Entrada';
    const utterance = new SpeechSynthesisUtterance(`${label}: ${name}`);
    utterance.lang = 'pt-BR';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    const portugueseVoice = window.speechSynthesis.getVoices()
        .find((voice) => String(voice.lang || '').toLowerCase().startsWith('pt-br'));
    if (portugueseVoice) utterance.voice = portugueseVoice;

    window.speechSynthesis.speak(utterance);
}

function waitForMovementRetry(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function getMovementRetryAfterMs(response) {
    const retryAfter = String(response?.headers?.get('Retry-After') || '').trim();
    if (!retryAfter) return null;

    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(MOVEMENT_RETRY_MAX_DELAY_MS, Math.ceil(seconds * 1000));
    }

    const retryDate = Date.parse(retryAfter);
    if (!Number.isFinite(retryDate)) return null;
    return Math.min(MOVEMENT_RETRY_MAX_DELAY_MS, Math.max(0, retryDate - Date.now()));
}

function getMovementBackoffMs(attempt) {
    const exponentialDelay = Math.min(
        MOVEMENT_RETRY_MAX_DELAY_MS,
        MOVEMENT_RETRY_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1))
    );
    const jitter = Math.floor(Math.random() * MOVEMENT_RETRY_BASE_DELAY_MS);
    return Math.min(MOVEMENT_RETRY_MAX_DELAY_MS, exponentialDelay + jitter);
}

function canRetryAmbiguousMovementNetworkFailure() {
    return typeof window !== 'undefined' && window.location?.protocol === 'https:';
}

async function fetchMovementWithRetry(url, options) {
    const idempotencyKey = crypto.randomUUID();
    const headers = new Headers(options?.headers || {});
    headers.set('Idempotency-Key', idempotencyKey);
    const requestOptions = { ...options, headers };

    for (let attempt = 1; attempt <= MOVEMENT_REQUEST_MAX_ATTEMPTS; attempt += 1) {
        try {
            const response = await fetch(url, requestOptions);
            if (response.status !== 503) return response;

            const payload = await response.clone().json().catch(() => null);
            if (payload?.retryable !== true || attempt >= MOVEMENT_REQUEST_MAX_ATTEMPTS) {
                return response;
            }

            await waitForMovementRetry(
                getMovementRetryAfterMs(response) ?? getMovementBackoffMs(attempt)
            );
        } catch (error) {
            if (
                !(error instanceof TypeError)
                || !canRetryAmbiguousMovementNetworkFailure()
                || attempt >= MOVEMENT_REQUEST_MAX_ATTEMPTS
            ) {
                throw error;
            }
            await waitForMovementRetry(getMovementBackoffMs(attempt));
        }
    }

    throw new Error('Falha inesperada ao registrar movimentacao');
}

function fetchSharedJson(url) {
    const requestKey = `GET:${url}`;
    const pendingRequest = inFlightJsonRequests.get(requestKey);
    if (pendingRequest) return pendingRequest;

    const request = fetch(url)
        .then(async (response) => ({
            ok: response.ok,
            status: response.status,
            data: response.ok ? await response.json() : null
        }))
        .finally(() => {
            inFlightJsonRequests.delete(requestKey);
        });

    inFlightJsonRequests.set(requestKey, request);
    return request;
}

function isScheduledEvent() {
    return Number(currentEvent?.orcamento_id || currentEvent?.orcamentoId) > 0;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatTransferEventPeriod(event) {
    const start = event.withdrawal_date || event.date;
    const end = event.return_date || event.end_date || start;
    return formatEventPeriod(start, end);
}

function closeTransferModal() {
    const modal = document.getElementById('transferModal');
    if (modal) modal.style.display = 'none';
}

function closeTransferConfirmModal() {
    const modal = document.getElementById('transferConfirmModal');
    if (modal) modal.style.display = 'none';
    selectedTransferTarget = null;
    selectedTransferCategories = [];
}

function getSelectedTransferCategories() {
    return [...document.querySelectorAll('input[name="transferCategory"]:checked')]
        .map((input) => input.value)
        .filter((category) => ['equipment', 'cable', 'other'].includes(category));
}

function formatTransferCategories(categories) {
    const labels = { equipment: 'equipamentos', cable: 'cabos', other: 'outros' };
    const names = categories.map((category) => labels[category]).filter(Boolean);
    if (names.length <= 1) return names[0] || 'itens';
    if (names.length === 2) return `${names[0]} e ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

function formatTransferredSummary(transferred) {
    const labels = { equipment: 'equipamento(s)', cable: 'cabo(s)', other: 'outro(s) item(ns)' };
    return Object.entries(transferred || {})
        .filter(([, quantity]) => Number(quantity) > 0)
        .map(([category, quantity]) => `${Number(quantity)} ${labels[category] || 'item(ns)'}`)
        .join(', ');
}

async function openTransferModal() {
    if (!eventId) return;
    const modal = document.getElementById('transferModal');
    const list = document.getElementById('transferEventList');
    const message = document.getElementById('transferMessage');
    if (!modal || !list) return;

    modal.style.display = 'flex';
    list.innerHTML = '<p class="transfer-event-empty">Carregando eventos...</p>';
    if (message) message.textContent = '';

    try {
        const response = await fetch(`/api/events/${eventId}/transfer-targets`);
        const events = await response.json().catch(() => []);
        if (!response.ok) throw new Error(events?.error || 'Não foi possível carregar os eventos');

        if (!events.length) {
            list.innerHTML = '<p class="transfer-event-empty">Não há outro evento disponível para receber a transferência.</p>';
            return;
        }

        list.innerHTML = events.map((event) => `
            <button type="button" class="transfer-event-option" data-event-id="${Number(event.id)}">
                <strong>${escapeHtml(event.name)}</strong>
                <span>${escapeHtml(formatTransferEventPeriod(event))}${Number(event.orcamento_id) ? ' · Evento de orçamento' : ''}</span>
            </button>
        `).join('');
        list.querySelectorAll('.transfer-event-option').forEach((button) => {
            button.addEventListener('click', () => {
                const categories = getSelectedTransferCategories();
                if (!categories.length) {
                    if (message) {
                        message.textContent = 'Selecione ao menos um tipo de item para transferir.';
                        message.className = 'message error';
                    }
                    return;
                }
                const target = events.find((event) => Number(event.id) === Number(button.dataset.eventId));
                if (target) openTransferConfirmation(target, categories);
            });
        });
    } catch (error) {
        list.innerHTML = '';
        if (message) {
            message.textContent = error.message || 'Não foi possível carregar os eventos';
            message.className = 'message error';
        }
    }
}

function openTransferConfirmation(target, categories) {
    selectedTransferTarget = target;
    selectedTransferCategories = categories;
    const confirmModal = document.getElementById('transferConfirmModal');
    const confirmText = document.getElementById('transferConfirmText');
    if (!confirmModal || !confirmText) return;

    closeTransferModal();
    confirmText.innerHTML = `Transferir todos os equipamentos sem entrada do evento <strong>${escapeHtml(currentEvent?.name || '')}</strong> para <strong>${escapeHtml(target.name)}</strong>?`;
    confirmText.innerHTML = `Transferir todos os ${escapeHtml(formatTransferCategories(categories))} com saída pendente do evento <strong>${escapeHtml(currentEvent?.name || '')}</strong> para <strong>${escapeHtml(target.name)}</strong>?`;
    confirmModal.style.display = 'flex';
}

async function confirmTransfer() {
    if (!selectedTransferTarget || !eventId || !selectedTransferCategories.length) return;
    const button = document.getElementById('confirmTransferButton');
    const target = selectedTransferTarget;
    if (button) button.disabled = true;

    try {
        const response = await fetchMovementWithRetry(`/api/events/${eventId}/transfer-outstanding`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetEventId: target.id, categories: selectedTransferCategories })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || result.message || 'Não foi possível transferir os equipamentos');

        closeTransferConfirmModal();
        const message = document.getElementById('saidaMessage');
        if (message) {
            message.textContent = `${result.transferredCount || 0} equipamento(s) transferido(s) para ${target.name}.`;
            const summary = formatTransferredSummary(result.transferred);
            message.textContent = summary
                ? `${summary} transferido(s) para ${target.name}.`
                : `Transferência concluída para ${target.name}.`;
            message.className = 'message success';
        }
        await Promise.all([loadSaidaEquipments(), loadEntradaEquipments(), loadConferenciaEquipments()]);
    } catch (error) {
        const confirmText = document.getElementById('transferConfirmText');
        if (confirmText) confirmText.textContent = error.message || 'Não foi possível transferir os equipamentos';
    } finally {
        if (button) button.disabled = false;
    }
}

function closeAvailabilityConflictModal(confirmed = false) {
    const modal = document.getElementById('availabilityConflictModal');
    if (modal) modal.style.display = 'none';
    if (availabilityWarningResolver) {
        const resolve = availabilityWarningResolver;
        availabilityWarningResolver = null;
        resolve(Boolean(confirmed));
    }
}

function confirmFutureAvailabilityWarning(warning, warnings = []) {
    const modal = document.getElementById('availabilityConflictModal');
    const title = document.getElementById('availabilityConflictTitle');
    const subtitle = modal?.querySelector('.modal-subtitle');
    const details = document.getElementById('availabilityConflictDetails');
    const okButton = document.getElementById('availabilityConflictOkButton');
    const cancelButton = document.getElementById('availabilityWarningCancelButton');
    const continueButton = document.getElementById('availabilityWarningContinueButton');
    if (!modal || !details) return Promise.resolve(false);

    const affected = (Array.isArray(warning?.affectedDemands) ? warning.affectedDemands : [])
        .concat((Array.isArray(warnings) ? warnings : []).flatMap((item) => (
            Array.isArray(item?.affectedDemands) ? item.affectedDemands : []
        )));
    const uniqueAffected = affected.filter((item, index, list) => (
        list.findIndex((candidate) => `${candidate.eventId || 0}:${candidate.quoteId || 0}:${candidate.eventName || ''}`
            === `${item.eventId || 0}:${item.quoteId || 0}:${item.eventName || ''}`) === index
    ));
    const primary = uniqueAffected[0] || {};
    const deficit = Math.max(0, Number(primary.deficitAfter ?? warning?.deficit) || 0);
    const availableAfter = Math.max(0, Number(primary.availableAfterCheckout ?? warning?.availableQuantity) || 0);

    modal.classList.add('availability-warning-modal');
    if (title) title.textContent = 'Atenção: disponibilidade futura';
    if (subtitle) subtitle.textContent = 'A saída pode continuar, mas poderá aumentar o déficit de outra demanda.';
    details.innerHTML = `
        <div class="availability-conflict-item full">
            <span class="availability-conflict-label">Aviso</span>
            <div class="availability-conflict-value">Esta é uma advertência de planejamento, não um bloqueio físico do patrimônio.</div>
        </div>
        <div class="availability-conflict-item">
            <span class="availability-conflict-label">Equipamento</span>
            <div class="availability-conflict-value">${escapeHtml(warning?.equipmentName || 'Equipamento')}</div>
        </div>
        <div class="availability-conflict-item">
            <span class="availability-conflict-label">Evento afetado</span>
            <div class="availability-conflict-value">${escapeHtml(primary.eventName || warning?.blockingEventName || 'Demanda futura')}</div>
        </div>
        <div class="availability-conflict-item">
            <span class="availability-conflict-label">Necessário</span>
            <div class="availability-conflict-value">${Math.max(0, Number(primary.necessaryQuantity) || 0)}</div>
        </div>
        <div class="availability-conflict-item">
            <span class="availability-conflict-label">Disponível após a saída</span>
            <div class="availability-conflict-value">${availableAfter}</div>
        </div>
        <div class="availability-conflict-item">
            <span class="availability-conflict-label">Déficit previsto</span>
            <div class="availability-conflict-value">${deficit}</div>
        </div>
        <div class="availability-conflict-item">
            <span class="availability-conflict-label">Período afetado</span>
            <div class="availability-conflict-value">${escapeHtml(primary.startLabel || '-')} até ${escapeHtml(primary.endLabel || '-')}</div>
        </div>
        ${uniqueAffected.length > 1 ? `
            <div class="availability-conflict-item full">
                <span class="availability-conflict-label">Outras demandas afetadas</span>
                <div class="availability-conflict-value">${uniqueAffected.slice(1).map((item) => escapeHtml(item.eventName || 'Demanda')).join(', ')}</div>
            </div>
        ` : ''}
    `;
    if (okButton) okButton.style.display = 'none';
    if (cancelButton) cancelButton.style.display = '';
    if (continueButton) continueButton.style.display = '';
    modal.style.display = 'flex';

    return new Promise((resolve) => {
        availabilityWarningResolver = resolve;
    });
}

function showAvailabilityConflictModal(conflict) {
    if (!conflict) return false;

    const modal = document.getElementById('availabilityConflictModal');
    const details = document.getElementById('availabilityConflictDetails');
    if (!modal || !details) return false;

    modal.classList.remove('availability-warning-modal');
    const title = document.getElementById('availabilityConflictTitle');
    const okButton = document.getElementById('availabilityConflictOkButton');
    const cancelButton = document.getElementById('availabilityWarningCancelButton');
    const continueButton = document.getElementById('availabilityWarningContinueButton');
    if (title) title.textContent = 'Conflito de disponibilidade';
    if (okButton) okButton.style.display = '';
    if (cancelButton) cancelButton.style.display = 'none';
    if (continueButton) continueButton.style.display = 'none';

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
            || 'A saída reduziria o estoque abaixo da quantidade reservada para um orçamento no mesmo período.'
        ).trim();

        if (subtitle) {
            subtitle.textContent = 'Não há quantidade suficiente deste equipamento para o período do evento.';
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
                <span class="availability-conflict-label">Período do evento atual</span>
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
        subtitle.textContent = 'Este patrimônio não pode ser utilizado no período deste evento.';
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

function normalizeSpaceId(value) {
    if (value === undefined || value === null || value === '') return null;
    const spaceId = Number(value);
    return Number.isInteger(spaceId) && spaceId > 0 ? spaceId : null;
}

function getSpaceKey(spaceId) {
    return String(normalizeSpaceId(spaceId) || 0);
}

function isSameSpace(firstSpaceId, secondSpaceId) {
    return getSpaceKey(firstSpaceId) === getSpaceKey(secondSpaceId);
}

function getSpaceName(spaceId) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    if (!normalizedSpaceId) return 'Evento geral';

    const space = eventSpaces.find((item) => Number(item.id) === normalizedSpaceId);
    return space?.name || 'Espaço';
}

function getSpaceArg(spaceId) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    return normalizedSpaceId || 'null';
}

function applyScheduledEventMode() {
    const scheduled = isScheduledEvent();
    document.body.classList.toggle('scheduled-event-mode', scheduled);

    document.querySelectorAll('.rental-print-action').forEach((button) => {
        button.hidden = eventType !== 'rental';
    });

    const serviceOrderPanel = document.getElementById('serviceOrderPanel');
    if (serviceOrderPanel) serviceOrderPanel.style.display = scheduled ? 'grid' : 'none';

    const conferenciaButton = document.querySelector('.event-actions [data-section="conferencia"]');
    if (conferenciaButton) conferenciaButton.style.display = scheduled ? 'none' : '';

    const conferenciaSection = document.getElementById('conferencia');
    if (scheduled && conferenciaSection?.classList.contains('active')) {
        showSection('saida');
    }

    renderServiceOrderList();
}

function updateConferenciaEquipmentStatus(equipmentId, spaceId, checked) {
    const normalizedEquipmentId = Number(equipmentId);
    if (!Number.isInteger(normalizedEquipmentId) || normalizedEquipmentId <= 0) return;

    const normalizedSpaceId = normalizeSpaceId(spaceId);
    let updatedExactMatch = false;

    conferenciaEquipments = conferenciaEquipments.map((item) => {
        if (Number(item.id) !== normalizedEquipmentId || !isSameSpace(item.space_id, normalizedSpaceId)) {
            return item;
        }

        updatedExactMatch = true;
        return {
            ...item,
            checked,
            space_id: normalizedSpaceId,
            space_name: getSpaceName(normalizedSpaceId)
        };
    });

    if (!updatedExactMatch && checked) {
        conferenciaEquipments = conferenciaEquipments.map((item) => {
            if (Number(item.id) !== normalizedEquipmentId || normalizeSpaceId(item.space_id) !== null) {
                return item;
            }

            return {
                ...item,
                checked: true,
                space_id: normalizedSpaceId,
                space_name: getSpaceName(normalizedSpaceId)
            };
        });
    }

    renderServiceOrderList();
}

function normalizeEquipmentRequirementName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function updateEquipmentRequirementProgress(equipmentName, quantity = 1, equipmentCategory = '') {
    if (!isScheduledEvent()) return;

    const nameKey = normalizeEquipmentRequirementName(equipmentName);
    const topicKey = normalizeEquipmentRequirementName(equipmentCategory);
    const increment = Math.max(0, Number(quantity) || 0);
    if ((!nameKey && !topicKey) || increment <= 0) return;

    let updated = false;
    equipmentRequirements = equipmentRequirements.map((item) => {
        const itemTopicKey = normalizeEquipmentRequirementName(item.name);
        const equipmentNameKeys = Array.isArray(item.equipmentNameKeys) ? item.equipmentNameKeys : [];
        const matchesTopic = topicKey && itemTopicKey === topicKey;
        const matchesSelectedEquipment = nameKey && equipmentNameKeys.includes(nameKey);
        if (updated || (!matchesTopic && !matchesSelectedEquipment)) return item;

        updated = true;
        const requestedQuantity = Math.max(0, Number(item.requestedQuantity) || 0);
        const outgoingQuantity = Math.max(0, Number(item.separatedQuantity ?? item.outgoingQuantity) || 0) + increment;
        const warehouseAvailableQuantity = Math.max(0, (Number(item.warehouseAvailableQuantity) || 0) - increment);
        const pendingQuantity = Math.max(0, requestedQuantity - outgoingQuantity);
        return {
            ...item,
            outgoingQuantity,
            separatedQuantity: outgoingQuantity,
            warehouseAvailableQuantity,
            pendingQuantity,
            deficit: Math.max(0, pendingQuantity - warehouseAvailableQuantity),
            extraQuantity: Math.max(0, outgoingQuantity - requestedQuantity),
            completed: requestedQuantity > 0 && outgoingQuantity >= requestedQuantity
        };
    });

    if (updated) renderServiceOrderList();
}

function renderServiceOrderList() {
    const panel = document.getElementById('serviceOrderPanel');
    const list = document.getElementById('serviceOrderList');
    const count = document.getElementById('serviceOrderCount');
    if (!panel || !list || !count) return;

    if (!isScheduledEvent()) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'grid';
    const items = equipmentRequirements
        .slice()
        .sort((a, b) => {
            if (Boolean(a.completed) !== Boolean(b.completed)) return Number(a.completed) - Number(b.completed);
            return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
        });
    const totalRequested = items.reduce((total, item) => total + Math.max(0, Number(item.requestedQuantity) || 0), 0);
    const totalOutgoing = items.reduce((total, item) => {
        const requested = Math.max(0, Number(item.requestedQuantity) || 0);
        const outgoing = Math.max(0, Number(item.outgoingQuantity) || 0);
        return total + Math.min(requested, outgoing);
    }, 0);
    count.textContent = `${totalOutgoing}/${totalRequested}`;

    if (items.length === 0) {
        list.innerHTML = '<p class="service-order-empty">Nenhum equipamento solicitado na ordem de serviço.</p>';
        return;
    }

    list.innerHTML = '';
    items.forEach((item) => {
        const requestedQuantity = Math.max(0, Number(item.requestedQuantity) || 0);
        const outgoingQuantity = Math.max(0, Number(item.separatedQuantity ?? item.outgoingQuantity) || 0);
        const pendingQuantity = Math.max(0, requestedQuantity - outgoingQuantity);
        const warehouseAvailableQuantity = Math.max(0, Number(item.warehouseAvailableQuantity) || 0);
        const deficit = Math.max(0, Number(item.deficit) || 0);
        const predictedDeficit = Math.max(0, Number(item.predictedDeficit) || 0);
        const extraQuantity = Math.max(0, Number(item.extraQuantity) || (outgoingQuantity - requestedQuantity));
        const completed = Boolean(item.completed) || (requestedQuantity > 0 && outgoingQuantity >= requestedQuantity);
        const requestedLabel = String(requestedQuantity).padStart(2, '0');
        const row = document.createElement('div');
        row.className = `service-order-item ${completed ? 'complete' : ''} ${deficit > 0 || predictedDeficit > 0 ? 'has-deficit' : ''}`;
        row.innerHTML = `
            <div class="service-order-info">
                <strong>${escapeHtml(`${requestedLabel} ${(item.name || 'EQUIPAMENTO').toLocaleUpperCase('pt-BR')}`)}</strong>
                <span>Separado: ${outgoingQuantity} • Falta separar: ${pendingQuantity}</span>
                <span>Disponíveis no galpão: ${warehouseAvailableQuantity}</span>
                ${extraQuantity > 0 ? `<span class="service-order-extra">${requestedQuantity}/${requestedQuantity} solicitado • +${extraQuantity} extra</span>` : ''}
                ${deficit > 0 ? `<span class="service-order-deficit">Atenção: falta ${deficit} unidade${deficit === 1 ? '' : 's'} no estoque atual.</span>` : ''}
                ${predictedDeficit > deficit ? `<span class="service-order-forecast-deficit">Déficit previsto no período: ${predictedDeficit}</span>` : ''}
            </div>
            <span class="service-order-status" title="${deficit > 0 ? 'Estoque insuficiente' : (completed ? 'Quantidade solicitada atendida' : 'Saída pendente')}">${deficit > 0 ? '⚠️' : (completed ? '✅' : '⏳')}</span>
        `;
        list.appendChild(row);
    });
}

function getRenderableSpaces() {
    return [
        { id: null, name: 'Evento geral', isDefault: true },
        ...eventSpaces.map((space) => ({
            id: Number(space.id),
            name: space.name || 'Espaço',
            isDefault: false
        }))
    ];
}

function movementKey(spaceId, itemId) {
    return `${getSpaceKey(spaceId)}:${Number(itemId)}`;
}

function formatEventDate(dateValue) {
    const value = String(dateValue || '').trim();
    if (!value) return '--';

    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
        return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}/${dateOnlyMatch[1]}`;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '--' : date.toLocaleDateString('pt-BR');
}

function formatEventPeriod(startDate, endDate = startDate) {
    const start = formatEventDate(startDate);
    const end = formatEventDate(endDate || startDate);
    return end && end !== start ? `${start} até ${end}` : start;
}

function getEventDateRange(event = currentEvent) {
    const startDate = eventType === 'rental'
        ? event?.withdrawal_date || event?.withdrawalDate || event?.date
        : event?.date;
    const endDate = eventType === 'rental'
        ? event?.return_date || event?.returnDate || startDate
        : event?.end_date || event?.endDate || startDate;

    return {
        start: formatEventDate(startDate),
        end: formatEventDate(endDate || startDate)
    };
}

async function trimTransparentImageDataUrl(dataUrl, options = {}) {
    const removeNearBlackBackground = options.removeNearBlackBackground === true;
    return await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            try {
                const sourceCanvas = document.createElement('canvas');
                sourceCanvas.width = image.naturalWidth;
                sourceCanvas.height = image.naturalHeight;
                const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
                sourceContext.drawImage(image, 0, 0);

                const sourceImage = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
                const pixels = sourceImage.data;
                let minX = sourceCanvas.width;
                let minY = sourceCanvas.height;
                let maxX = -1;
                let maxY = -1;

                for (let y = 0; y < sourceCanvas.height; y += 1) {
                    for (let x = 0; x < sourceCanvas.width; x += 1) {
                        const pixelIndex = ((y * sourceCanvas.width) + x) * 4;
                        const red = pixels[pixelIndex];
                        const green = pixels[pixelIndex + 1];
                        const blue = pixels[pixelIndex + 2];
                        const alpha = pixels[pixelIndex + 3];
                        const isNearBlackBackground = removeNearBlackBackground
                            && red <= 18 && green <= 18 && blue <= 18;
                        if (alpha <= 8 || isNearBlackBackground) continue;
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    }
                }

                if (maxX < minX || maxY < minY) {
                    resolve(dataUrl);
                    return;
                }

                const visibleWidth = maxX - minX + 1;
                const visibleHeight = maxY - minY + 1;
                const padding = Math.max(2, Math.ceil(Math.max(visibleWidth, visibleHeight) * 0.015));
                const outputCanvas = document.createElement('canvas');
                outputCanvas.width = visibleWidth + (padding * 2);
                outputCanvas.height = visibleHeight + (padding * 2);
                const outputContext = outputCanvas.getContext('2d');
                const outputImage = outputContext.createImageData(outputCanvas.width, outputCanvas.height);

                for (let y = minY; y <= maxY; y += 1) {
                    for (let x = minX; x <= maxX; x += 1) {
                        const sourceIndex = ((y * sourceCanvas.width) + x) * 4;
                        const targetX = x - minX + padding;
                        const targetY = y - minY + padding;
                        const targetIndex = ((targetY * outputCanvas.width) + targetX) * 4;
                        const red = pixels[sourceIndex];
                        const green = pixels[sourceIndex + 1];
                        const blue = pixels[sourceIndex + 2];
                        const isNearBlackBackground = removeNearBlackBackground
                            && red <= 18 && green <= 18 && blue <= 18;

                        outputImage.data[targetIndex] = red;
                        outputImage.data[targetIndex + 1] = green;
                        outputImage.data[targetIndex + 2] = blue;
                        outputImage.data[targetIndex + 3] = isNearBlackBackground
                            ? 0
                            : pixels[sourceIndex + 3];
                    }
                }

                outputContext.putImageData(outputImage, 0, 0);
                resolve(outputCanvas.toDataURL('image/png'));
            } catch (error) {
                console.warn('Não foi possível recortar a transparência da logo do PDF.', error);
                resolve(dataUrl);
            }
        };
        image.onerror = () => resolve(dataUrl);
        image.src = dataUrl;
    });
}

async function loadImageAsDataUrl(url, options = {}) {
    const response = await fetch(url);
    const blob = await response.blob();

    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    return options.trimTransparent
        ? trimTransparentImageDataUrl(dataUrl, options)
        : dataUrl;
}

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

async function presentPdfToUser(blob, fileName, options = {}) {
    if (!options.skipFilePicker && isMobileDevice() && navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: fileName
            });
            return 'shared';
        }
    }

    // A geração reúne dados do evento de forma assíncrona. Por isso, abrir o
    // seletor nativo aqui pode perder a ativação do clique e ser bloqueado pelo
    // navegador. O download por link funciona de forma consistente em desktop.
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
}

function appendPdfCopies(doc, totalCopies = 2) {
    const normalizedCopies = Math.max(1, Math.floor(Number(totalCopies) || 1));
    if (normalizedCopies === 1) return;

    const originalPageCount = doc.getNumberOfPages();
    const originalPages = Array.from(
        { length: originalPageCount },
        (_, index) => [...doc.internal.pages[index + 1]]
    );

    for (let copyIndex = 1; copyIndex < normalizedCopies; copyIndex += 1) {
        originalPages.forEach((pageCommands) => {
            doc.addPage();
            doc.internal.pages[doc.getNumberOfPages()] = [...pageCommands];
        });
    }
}

async function presentPdfForPrinting(blob, fileName) {
    const pdfUrl = URL.createObjectURL(blob);
    const printFrame = document.createElement('iframe');
    printFrame.title = `Impressão de ${fileName}`;
    printFrame.setAttribute('aria-hidden', 'true');
    Object.assign(printFrame.style, {
        position: 'fixed',
        right: '0',
        bottom: '0',
        width: '1px',
        height: '1px',
        border: '0',
        opacity: '0',
        pointerEvents: 'none'
    });

    return await new Promise((resolve, reject) => {
        let printStarted = false;
        const cleanup = () => {
            printFrame.remove();
            URL.revokeObjectURL(pdfUrl);
        };
        const loadTimeout = setTimeout(() => {
            if (printStarted) return;
            cleanup();
            reject(new Error('A impressão demorou para abrir. Tente novamente.'));
        }, 20000);

        printFrame.onload = () => {
            if (printStarted) return;
            printStarted = true;
            clearTimeout(loadTimeout);
            setTimeout(() => {
                try {
                    const frameWindow = printFrame.contentWindow;
                    if (!frameWindow) throw new Error('Janela de impressão indisponível.');
                    frameWindow.focus();
                    frameWindow.print();
                    resolve('printing');
                    setTimeout(cleanup, 5 * 60 * 1000);
                } catch (error) {
                    cleanup();
                    reject(error);
                }
            }, 600);
        };

        printFrame.src = pdfUrl;
        document.body.appendChild(printFrame);
    });
}

async function loadEventSpaces() {
    if (!eventId) return;

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const response = await fetch(`/api/events/${eventId}/spaces`);
        if (!response.ok) return;

        eventSpaces = await response.json();

        const validSpaceIds = new Set(eventSpaces.map((space) => Number(space.id)));
        if (activeSaidaSpaceId && !validSpaceIds.has(Number(activeSaidaSpaceId))) {
            activeSaidaSpaceId = null;
        }
        if (activeEntradaSpaceId && !validSpaceIds.has(Number(activeEntradaSpaceId))) {
            activeEntradaSpaceId = null;
        }

        renderSpaceControls();

        if (urlParams.get('agsPdf') === '1') {
            showSection('saida');
            urlParams.delete('agsPdf');
            const nextQuery = urlParams.toString();
            window.history.replaceState(null, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
            setTimeout(() => generateAgsPdf({ automatic: true }), 250);
        }
    } catch (error) {
        console.error(error);
    }
}

function getSpaceCompletion(spaceId) {
    let total = 0;
    let pending = 0;

    saidaEquipments.forEach((item) => {
        if (!isSameSpace(item.space_id, spaceId)) return;
        total += 1;
        if (!item.returned) pending += 1;
    });

    saidaCables.forEach((item) => {
        if (!isSameSpace(item.space_id, spaceId)) return;
        if (Number(item.saida) > 0) total += Number(item.saida) || 1;
        pending += Math.max(Number(item.final) || 0, 0);
    });

    saidaOtherItems.forEach((item) => {
        if (!isSameSpace(item.space_id, spaceId)) return;
        if (Number(item.saida) > 0) total += Number(item.saida) || 1;
        pending += Math.max(Number(item.final) || 0, 0);
    });

    return {
        total,
        pending,
        complete: total > 0 && pending <= 0
    };
}

function renderSpaceControls() {
    const spaces = getRenderableSpaces();
    const saidaContainer = document.getElementById('saidaSpaceButtons');
    const entradaContainer = document.getElementById('entradaSpaceButtons');

    if (saidaContainer) {
        saidaContainer.innerHTML = '';
        spaces.forEach((space) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `space-button ${isSameSpace(space.id, activeSaidaSpaceId) ? 'active' : ''}`;
            button.textContent = space.name;
            button.onclick = () => selectSaidaSpace(space.id);
            saidaContainer.appendChild(button);
        });
    }

    if (entradaContainer) {
        entradaContainer.innerHTML = '';
        spaces.forEach((space) => {
            const completion = getSpaceCompletion(space.id);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `space-button ${isSameSpace(space.id, activeEntradaSpaceId) ? 'active' : ''} ${completion.complete ? 'complete' : ''}`;
            button.textContent = `${completion.complete ? '✅ ' : ''}${space.name}`;
            button.onclick = () => selectEntradaSpace(space.id);
            entradaContainer.appendChild(button);
        });
    }
}

function selectSaidaSpace(spaceId) {
    activeSaidaSpaceId = normalizeSpaceId(spaceId);
    filterSaidaList();
    renderCableSaidaList();
    renderOtherItemSaidaList();
    renderSpaceControls();
}

function selectEntradaSpace(spaceId) {
    activeEntradaSpaceId = normalizeSpaceId(spaceId);
    renderEntradaEquipmentList();
    renderEntradaCableTable();
    renderEntradaOtherItemTable();
    renderSpaceControls();
}

async function addEventSpace() {
    const msgEl = document.getElementById('spaceMessage');
    const name = String(window.prompt('Nome do espaço:') || '').trim();

    if (!name) return;

    try {
        const response = await fetch(`/api/events/${eventId}/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            showMsg(msgEl, error.error || 'Não foi possível criar o espaço', 'error');
            return;
        }

        const createdSpace = await response.json();
        await loadEventSpaces();
        activeSaidaSpaceId = normalizeSpaceId(createdSpace.id);
        activeEntradaSpaceId = normalizeSpaceId(createdSpace.id);
        selectSaidaSpace(createdSpace.id);
        selectEntradaSpace(createdSpace.id);
        showMsg(msgEl, 'Espaço adicionado', 'success');
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexão', 'error');
    }
}

function buildSaidaPdfGroups() {
    const groups = new Map();

    getRenderableSpaces().forEach((space) => {
        groups.set(getSpaceKey(space.id), {
            ...space,
            equipments: [],
            cables: [],
            otherItems: []
        });
    });

    saidaEquipments
        .filter((item) => !item.returned)
        .forEach((item) => {
            const key = getSpaceKey(item.space_id);
            if (!groups.has(key)) {
                groups.set(key, {
                    id: normalizeSpaceId(item.space_id),
                    name: item.space_name || getSpaceName(item.space_id),
                    isDefault: !normalizeSpaceId(item.space_id),
                    equipments: [],
                    cables: [],
                    otherItems: []
                });
            }

            const name = String(item.equipment_name || item.name || '').trim();
            const patrimonio = String(item.barcode || '').trim();
            const rawObservation = String(item.observation || '').trim();
            const observation = rawObservation === '-' ? '' : rawObservation;
            if (name) groups.get(key).equipments.push({ name, observation, patrimonio });
        });

    saidaCables.forEach((item) => {
        const quantity = Number(item.final ?? item.saida ?? item.quantity) || 0;
        const name = String(item.name || '').trim();
        if (!name || quantity <= 0) return;

        const key = getSpaceKey(item.space_id);
        if (!groups.has(key)) {
            groups.set(key, {
                id: normalizeSpaceId(item.space_id),
                name: item.space_name || getSpaceName(item.space_id),
                isDefault: !normalizeSpaceId(item.space_id),
                equipments: [],
                cables: [],
                otherItems: []
            });
        }
        groups.get(key).cables.push({ name, quantity });
    });

    saidaOtherItems.forEach((item) => {
        const quantity = Number(item.final ?? item.saida ?? item.quantity) || 0;
        const name = String(item.name || '').trim();
        if (!name || quantity <= 0) return;

        const key = getSpaceKey(item.space_id);
        if (!groups.has(key)) {
            groups.set(key, {
                id: normalizeSpaceId(item.space_id),
                name: item.space_name || getSpaceName(item.space_id),
                isDefault: !normalizeSpaceId(item.space_id),
                equipments: [],
                cables: [],
                otherItems: []
            });
        }
        groups.get(key).otherItems.push({ name, quantity });
    });

    const groupsWithContent = Array.from(groups.values()).filter((group) => (
        group.equipments.length > 0 || group.cables.length > 0 || group.otherItems.length > 0
    ));

    return groupsWithContent.length > 0
        ? groupsWithContent
        : [groups.get('0')];
}

async function generateSaidaPdf(options = {}) {
    const { jsPDF } = window.jspdf || {};
    const msgEl = document.getElementById('saidaMessage');
    const isAgsPdf = options.brand === 'ags';
    const isRentalPdf = eventType === 'rental';

    if (!jsPDF || !currentEvent) {
        showMsg(msgEl, 'Não foi possível gerar o PDF', 'error');
        return;
    }

    try {
        await Promise.all([
            loadSaidaEquipments(),
            loadCableSaidaHistory(),
            loadOtherItemSaidaHistory()
        ]);

        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        const logoDataUrl = await loadImageAsDataUrl(
            isAgsPdf ? '/fotos/ags-logo-transparent.png' : '/fotos/logo-24h.png',
            {
                trimTransparent: true,
                removeNearBlackBackground: !isAgsPdf
            }
        );
        const pdfGroups = buildSaidaPdfGroups();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageContentBottom = isRentalPdf ? pageHeight - 50 : pageHeight - 18;
        const marginX = isRentalPdf ? 10 : 18;
        const filePrefix = isAgsPdf ? 'romaneio-locacao-ags' : (eventType === 'rental' ? 'romaneio-locacao' : 'romaneio');
        const fileName = `${filePrefix}-${String(currentEvent.name || 'evento').replace(/[^\w-]+/g, '_')}.pdf`;
        const logoFormat = 'PNG';
        const logoWidth = isRentalPdf ? (isAgsPdf ? 84 : 88) : (isAgsPdf ? 118 : 88);
        const logoHeight = isRentalPdf ? (isAgsPdf ? 38.5 : 19) : (isAgsPdf ? 57 : 19);
        const titleOffset = isAgsPdf ? 67 : 31;
        const initialOffset = isAgsPdf ? 79 : 43;
        let cursorY = 20;

        const ensurePageSpace = (requiredHeight = 10) => {
            if (cursorY + requiredHeight <= pageContentBottom) return;
            doc.addPage();
            cursorY = 20;
        };

        const logoX = (pageWidth - logoWidth) / 2;
        const logoY = isRentalPdf ? (isAgsPdf ? 8 : 10) : cursorY;

        doc.addImage(logoDataUrl, logoFormat, logoX, logoY, logoWidth, logoHeight);
        if (!isAgsPdf && !isRentalPdf) {
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.2);
            doc.rect(logoX, logoY, logoWidth, logoHeight);
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(isRentalPdf ? 20 : 18);
        const titleY = isRentalPdf ? logoY + logoHeight + 10 : cursorY + titleOffset;
        doc.text(isAgsPdf ? 'Romaneio de Locação' : (eventType === 'rental' ? 'Romaneio de Locação' : 'Romaneio de Saída'), pageWidth / 2, titleY, { align: 'center' });
        cursorY = isRentalPdf ? titleY + 12 : cursorY + initialOffset;

        const eventDateRange = getEventDateRange();

        if (isRentalPdf) {
            const tableWidth = pageWidth - (marginX * 2);
            const labelWidth = 50;
            const valueWidth = tableWidth - labelWidth;
            const infoRows = [
                ['Cliente', currentEvent.name || 'Cliente'],
                ['Data inicial', eventDateRange.start],
                ['Data final', eventDateRange.end]
            ];

            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.2);
            doc.setFontSize(12.5);

            infoRows.forEach(([label, value]) => {
                const valueLines = doc.splitTextToSize(String(value || '-'), valueWidth - 6);
                const rowHeight = Math.max(11, (valueLines.length * 5.8) + 4.5);

                doc.rect(marginX, cursorY, tableWidth, rowHeight);
                doc.line(marginX + labelWidth, cursorY, marginX + labelWidth, cursorY + rowHeight);
                doc.setFont('helvetica', 'bold');
                doc.text(label, marginX + 3, cursorY + 6);
                doc.setFont('helvetica', 'normal');
                doc.text(valueLines, marginX + labelWidth + 3, cursorY + 6);
                cursorY += rowHeight;
            });
            cursorY += 7;
        } else {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.text(`Cliente: ${currentEvent.name || 'Cliente'}`, marginX, cursorY);
            cursorY += 7;
            doc.text(`Data inicial: ${eventDateRange.start}`, marginX, cursorY);
            cursorY += 7;
            doc.text(`Data final: ${eventDateRange.end}`, marginX, cursorY);
            cursorY += 12;
        }

        const renderPdfSection = (title, items, emptyText, formatter, columns = null) => {
            if (isRentalPdf) {
                const tableWidth = pageWidth - (marginX * 2);
                const headerHeight = 10.5;
                const lineHeight = 5.8;
                const rows = items.length > 0 ? items : [null];
                const columnWidths = columns
                    ? columns.ratios.map((ratio) => tableWidth * ratio)
                    : null;

                const renderHeader = () => {
                    ensurePageSpace(headerHeight + 10);
                    doc.setDrawColor(0, 0, 0);
                    doc.setLineWidth(0.2);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(12);
                    doc.rect(marginX, cursorY, tableWidth, headerHeight);
                    if (columns) {
                        let columnX = marginX;
                        columns.headers.forEach((header, columnIndex) => {
                            if (columnIndex > 0) {
                                doc.line(columnX, cursorY, columnX, cursorY + headerHeight);
                            }
                            doc.text(header, columnX + (columnWidths[columnIndex] / 2), cursorY + 7, { align: 'center' });
                            columnX += columnWidths[columnIndex];
                        });
                    } else {
                        doc.text(title, marginX + 3.5, cursorY + 7);
                    }
                    cursorY += headerHeight;
                };

                renderHeader();
                rows.forEach((item) => {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(11.5);
                    const cellValues = columns
                        ? (item
                            ? columns.formatter(item)
                            : [emptyText, ...columns.headers.slice(1).map(() => '')])
                        : [item ? formatter(item) : emptyText];
                    const cellLines = cellValues.map((value, columnIndex) => doc.splitTextToSize(
                        String(value ?? ''),
                        (columnWidths ? columnWidths[columnIndex] : tableWidth) - 7
                    ));
                    const rowHeight = Math.max(
                        9.5,
                        (Math.max(...cellLines.map((lines) => lines.length)) * lineHeight) + 4
                    );

                    if (cursorY + rowHeight > pageContentBottom) {
                        doc.addPage();
                        cursorY = 20;
                        renderHeader();
                    }

                    doc.rect(marginX, cursorY, tableWidth, rowHeight);
                    if (columns) {
                        let columnX = marginX;
                        cellLines.forEach((lines, columnIndex) => {
                            if (columnIndex > 0) {
                                doc.line(columnX, cursorY, columnX, cursorY + rowHeight);
                            }
                            doc.text(lines, columnX + 3.5, cursorY + 6.4);
                            columnX += columnWidths[columnIndex];
                        });
                    } else {
                        doc.text(cellLines[0], marginX + 3.5, cursorY + 6.4);
                    }
                    cursorY += rowHeight;
                });
                cursorY += 5;
                return;
            }

            ensurePageSpace(14);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text(title, marginX + 4, cursorY);
            cursorY += 7;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);

            if (items.length === 0) {
                doc.text(`- ${emptyText}`, marginX + 4, cursorY);
                cursorY += 7;
                return;
            }

            items.forEach((item) => {
                ensurePageSpace(8);
                const lines = doc.splitTextToSize(`- ${formatter(item)}`, pageWidth - (marginX * 2) - 4);
                doc.text(lines, marginX + 4, cursorY);
                cursorY += lines.length * 6;
            });
        };

        pdfGroups.forEach((group, index) => {
            const shouldRenderGroupHeading = !isRentalPdf || !group.isDefault;

            if (shouldRenderGroupHeading) {
                if (index > 0) cursorY += 4;
                ensurePageSpace(isRentalPdf ? 36 : 18);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(isRentalPdf ? 16 : 15);
                if (isRentalPdf) {
                    const groupWidth = pageWidth - (marginX * 2);
                    doc.setDrawColor(0, 0, 0);
                    doc.setLineWidth(0.35);
                    doc.rect(marginX, cursorY, groupWidth, 11.5);
                    doc.text(group.name, pageWidth / 2, cursorY + 7.8, { align: 'center' });
                    cursorY += 17;
                } else {
                    doc.text(group.name, marginX, cursorY);
                    cursorY += 8;
                }
            }

            renderPdfSection(
                'Equipamentos',
                group.equipments,
                'Nenhum equipamento em saída',
                (equipment) => equipment.patrimonio
                    ? `${equipment.name} - Patrimônio: ${equipment.patrimonio}`
                    : equipment.name,
                {
                    headers: ['Equipamentos', 'Observação', 'Patrimônios'],
                    ratios: [0.45, 0.35, 0.20],
                    formatter: (equipment) => [equipment.name, equipment.observation, equipment.patrimonio || '-']
                }
            );
            renderPdfSection('Cabos', group.cables, 'Nenhum cabo em saída', (cable) => `${cable.name} (${cable.quantity})`);
            renderPdfSection('Outros', group.otherItems, 'Nenhum item em saída', (item) => `${item.name} (${item.quantity})`);
        });

        if (isRentalPdf) {
            const signatureLineY = pageHeight - 30;
            const signatureWidth = 90;

            if (cursorY > signatureLineY - 12) {
                doc.addPage();
            }

            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.3);
            doc.line(
                (pageWidth - signatureWidth) / 2,
                signatureLineY,
                (pageWidth + signatureWidth) / 2,
                signatureLineY
            );
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.text('Assinatura do responsável', pageWidth / 2, signatureLineY + 6, { align: 'center' });
        }

        let result;
        if (options.print === true) {
            appendPdfCopies(doc, 2);
            const pdfBlob = doc.output('blob');
            result = await presentPdfForPrinting(pdfBlob, fileName);
        } else {
            const pdfBlob = doc.output('blob');
            result = await presentPdfToUser(pdfBlob, fileName, {
                skipFilePicker: !!options.automatic
            });
        }
        const successMessage = result === 'shared'
            ? 'PDF gerado e aberto para compartilhar'
            : (result === 'printing'
                ? `Impressão ${isAgsPdf ? 'AGS' : '24H'} preparada com duas vias`
                : (isAgsPdf ? 'PDF AGS gerado com sucesso' : 'PDF gerado com sucesso'));
        showMsg(msgEl, successMessage, 'success');
    } catch (error) {
        if (error?.name === 'AbortError') {
            return;
        }
        console.error(error);
        showMsg(msgEl, error?.message || 'Erro ao gerar PDF', 'error');
    }
}

function generateAgsPdf(options = {}) {
    return generateSaidaPdf({ ...options, brand: 'ags' });
}

async function printRentalPdf(brand = '24h') {
    const msgEl = document.getElementById('saidaMessage');
    if (eventType !== 'rental') {
        showMsg(msgEl, 'A impressão em duas vias está disponível somente para locações.', 'error');
        return;
    }

    const printButtons = document.querySelectorAll('.rental-print-action');
    printButtons.forEach((button) => {
        button.disabled = true;
    });

    try {
        await generateSaidaPdf({
            brand: brand === 'ags' ? 'ags' : '24h',
            print: true
        });
    } finally {
        printButtons.forEach((button) => {
            button.disabled = false;
        });
    }
}

function iniciarRelacao() {
    if (!eventId) return;

    localStorage.setItem('relacao_event_id', eventId);
    localStorage.setItem('relacao_event_name', currentEvent ? currentEvent.name : 'Evento');
    const spaceId = normalizeSpaceId(activeSaidaSpaceId);
    localStorage.setItem('relacao_space_id', spaceId ? String(spaceId) : '');
    localStorage.setItem('relacao_space_name', getSpaceName(spaceId));
    window.location.href = '/dashboard.html?section=banco';
}

function showSection(sectionId) {
    if (sectionId === 'conferencia' && isScheduledEvent()) {
        sectionId = 'saida';
    }

    document.querySelectorAll('.section').forEach((section) => {
        section.classList.remove('active');
    });

    const target = document.getElementById(sectionId);
    if (target) target.classList.add('active');

    const buttons = document.querySelectorAll('.event-header .event-actions button');
    buttons.forEach((btn) => {
        if (!btn.classList.contains('btn-close')) {
            btn.classList.remove('active');
        }
    });

    buttons.forEach((btn) => {
        if (btn.dataset.section === sectionId) {
            btn.classList.add('active');
        }
    });
}

function setSaidaTab(tab) {
    activeSaidaTab = ['cabos', 'outros'].includes(tab) ? tab : 'equipamentos';

    const equipmentButton = document.getElementById('saidaEquipamentosTabButton');
    const cableButton = document.getElementById('saidaCabosTabButton');
    const otherButton = document.getElementById('saidaOutrosTabButton');
    const equipmentView = document.getElementById('saidaEquipamentosView');
    const cableView = document.getElementById('saidaCabosView');
    const otherView = document.getElementById('saidaOutrosView');

    if (equipmentButton) equipmentButton.classList.toggle('active', activeSaidaTab === 'equipamentos');
    if (cableButton) cableButton.classList.toggle('active', activeSaidaTab === 'cabos');
    if (otherButton) otherButton.classList.toggle('active', activeSaidaTab === 'outros');
    if (equipmentView) equipmentView.classList.toggle('active', activeSaidaTab === 'equipamentos');
    if (cableView) cableView.classList.toggle('active', activeSaidaTab === 'cabos');
    if (otherView) otherView.classList.toggle('active', activeSaidaTab === 'outros');
}

function setEntradaTab(tab) {
    activeEntradaTab = ['cabos', 'outros'].includes(tab) ? tab : 'equipamentos';

    const equipmentButton = document.getElementById('entradaEquipamentosTabButton');
    const cableButton = document.getElementById('entradaCabosTabButton');
    const otherButton = document.getElementById('entradaOutrosTabButton');
    const equipmentView = document.getElementById('entradaEquipamentosView');
    const cableView = document.getElementById('entradaCabosView');
    const otherView = document.getElementById('entradaOutrosView');

    if (equipmentButton) equipmentButton.classList.toggle('active', activeEntradaTab === 'equipamentos');
    if (cableButton) cableButton.classList.toggle('active', activeEntradaTab === 'cabos');
    if (otherButton) otherButton.classList.toggle('active', activeEntradaTab === 'outros');
    if (equipmentView) equipmentView.classList.toggle('active', activeEntradaTab === 'equipamentos');
    if (cableView) cableView.classList.toggle('active', activeEntradaTab === 'cabos');
    if (otherView) otherView.classList.toggle('active', activeEntradaTab === 'outros');
}

async function loadEvent() {
    const urlParams = new URLSearchParams(window.location.search);
    eventId = urlParams.get('id');
    eventType = urlParams.get('type') === 'rental' ? 'rental' : 'event';
    if (!eventId) return;

    try {
        const response = await fetch(`/api/events/${eventId}`);
        if (!response.ok) return;

        currentEvent = await response.json();
        eventType = currentEvent.event_type === 'rental' ? 'rental' : eventType;
        applyScheduledEventMode();
        const eventDateRange = getEventDateRange();
        document.getElementById('eventName').textContent = currentEvent.name;
        document.getElementById('eventDate').textContent = `Data inicial: ${eventDateRange.start} | Data final: ${eventDateRange.end}`;

        const backButton = document.querySelector('.btn-close');

        if (backButton && eventType === 'rental') {
            backButton.onclick = () => {
                window.location.href = '/dashboard.html?section=locacao';
            };
        }

        if (String(localStorage.getItem('relacao_event_id') || '') === String(eventId)) {
            const storedSpaceId = normalizeSpaceId(localStorage.getItem('relacao_space_id'));
            activeSaidaSpaceId = storedSpaceId;
            activeEntradaSpaceId = storedSpaceId;
        }

        await loadEventSpaces();
        await processarItensAdicionados();
        await Promise.all([
            loadAvailableCables(),
            loadAvailableOtherItems(),
            loadSaidaEquipments(),
            loadCableSaidaHistory(),
            loadOtherItemSaidaHistory(),
            loadEntradaEquipments(),
            loadEntradaCables(),
            loadEntradaOtherItems(),
            loadConferenciaEquipments(),
            loadConferenciaOtherItems()
        ]);
        renderSpaceControls();
    } catch (error) {
        console.error(error);
    }
}

async function processarItensAdicionados() {
    return;
}

async function loadSaidaEquipments() {
    try {
        const historyResult = await fetchSharedJson(`/api/events/${eventId}/history`);
        if (!historyResult.ok) return;

        const history = historyResult.data;
        const equipmentMap = new Map();

        history.forEach((item) => {
            const key = movementKey(item.space_id, item.equipment_id);
            if (item.action_type === 'saida') {
                equipmentMap.set(key, {
                    ...item,
                    returned: false,
                    returned_by_username: ''
                });
            } else if (item.action_type === 'entrada') {
                const equipment = equipmentMap.get(key);
                if (equipment) {
                    equipmentMap.set(key, {
                        ...equipment,
                        returned: true,
                        returned_by_username: item.performed_by_username || ''
                    });
                }
            }
        });

        saidaEquipments = Array.from(equipmentMap.values());
        filterSaidaList();
        renderSpaceControls();
    } catch (error) {
        console.error(error);
    }
}

async function loadAvailableCables() {
    try {
        const response = await fetch('/api/cables');
        if (!response.ok) return;

        availableCables = await response.json();
        populateCableOptions();
    } catch (error) {
        console.error(error);
    }
}

function populateCableOptions() {
    const list = document.getElementById('saidaCableOptions');
    if (!list) return;

    list.innerHTML = '';
    availableCables
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
        .forEach((cable) => {
            const option = document.createElement('option');
            option.value = cable.name;
            list.appendChild(option);
        });
}

async function loadAvailableOtherItems() {
    try {
        const response = await fetch('/api/other-items');
        if (!response.ok) return;

        availableOtherItems = await response.json();
        populateOtherItemOptions();
    } catch (error) {
        console.error(error);
    }
}

function populateOtherItemOptions() {
    const list = document.getElementById('saidaOtherItemOptions');
    if (!list) return;

    list.innerHTML = '';
    availableOtherItems
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
        .forEach((item) => {
            const option = document.createElement('option');
            option.value = item.name;
            list.appendChild(option);
        });
}

function filterSaidaList() {
    const search = (document.getElementById('saidaSearch')?.value || '').trim().toLowerCase();

    filteredSaidaEquipments = saidaEquipments.filter((eq) => {
        if (!isSameSpace(eq.space_id, activeSaidaSpaceId)) return false;
        if (!search) return true;
        return String(eq.equipment_name || eq.name || '').toLowerCase().includes(search)
            || String(eq.barcode || '').toLowerCase().includes(search);
    });

    renderList('saidaList', filteredSaidaEquipments, 'Em Saída', false, false, true);
}

async function loadCableSaidaHistory() {
    try {
        const summaryResult = await fetchSharedJson(`/api/events/${eventId}/cable-summary`);
        if (!summaryResult.ok) return;

        saidaCables = summaryResult.data;
        renderCableSaidaList();
        renderSpaceControls();
    } catch (error) {
        console.error(error);
    }
}

function renderCableSaidaList() {
    const container = document.getElementById('saidaCableList');
    if (!container) return;

    const visibleCables = saidaCables.filter((cable) => isSameSpace(cable.space_id, activeSaidaSpaceId));

    container.innerHTML = visibleCables.length === 0
        ? '<p style="color:#888;text-align:center;width:100%">Nenhum cabo com saída registrada.</p>'
        : '';

    visibleCables.forEach((cable) => {
        const isReturned = Number(cable.final) <= 0;
        const quantity = Number(cable.saida ?? cable.quantity) || 0;
        const pendingQuantity = Number(cable.final) || 0;
        const cableId = Number(cable.cable_id);
        const spaceArg = getSpaceArg(cable.space_id);
        const card = document.createElement('div');
        card.className = 'equipment-card saida-removable-card';
        card.innerHTML = `
            <button type="button" class="btn-delete-mini" onclick="deleteSaidaCable(${cableId}, ${spaceArg})">Excluir</button>
            <div class="equipment-info">
                <h4>${escapeHtml(cable.name)}</h4>
                <p>Quantidade: ${pendingQuantity || quantity}</p>
            </div>
            <div class="status-indicator">
                ${isReturned
                    ? '<span class="status-text emoji-status returned">✅</span>'
                    : '<span class="status-dot"></span><span class="status-text">Em Saída</span>'}
            </div>`;
        container.appendChild(card);
    });
}

async function loadOtherItemSaidaHistory() {
    try {
        const [inventoryResult, quoteResult] = await Promise.all([
            fetchSharedJson(`/api/events/${eventId}/other-item-summary`),
            fetchSharedJson(`/api/events/${eventId}/quote-other-item-summary`)
        ]);
        if (!inventoryResult.ok) return;

        const inventoryItems = inventoryResult.data;
        const quoteItems = quoteResult.ok ? quoteResult.data : [];
        saidaOtherItems = [
            ...inventoryItems.map((item) => ({ ...item, source: 'inventory' })),
            ...quoteItems.map((item) => ({ ...item, source: 'quote' }))
        ];
        renderOtherItemSaidaList();
        renderSpaceControls();
    } catch (error) {
        console.error(error);
    }
}

function renderOtherItemSaidaList() {
    const container = document.getElementById('saidaOtherItemList');
    if (!container) return;

    const visibleItems = saidaOtherItems.filter((item) => (
        item.source === 'quote' && Number(item.final) <= 0
            ? true
            : isSameSpace(item.space_id, activeSaidaSpaceId)
    ));

    container.innerHTML = visibleItems.length === 0
        ? '<p style="color:#888;text-align:center;width:100%">Nenhum item com saída registrada.</p>'
        : '';

    visibleItems.forEach((item) => {
        const isQuoteItem = item.source === 'quote';
        const isAwaitingSaida = isQuoteItem && Number(item.final) <= 0;
        const isReturned = Number(item.final) <= 0;
        const quantity = Number(item.saida ?? item.quantity ?? item.requested_quantity) || Number(item.requested_quantity) || 0;
        const pendingQuantity = Number(item.final) || 0;
        const itemId = Number(item.item_id);
        const quoteItemId = Number(item.quote_item_id);
        const movementSpaceId = isAwaitingSaida ? activeSaidaSpaceId : item.space_id;
        const spaceArg = getSpaceArg(movementSpaceId);
        const card = document.createElement('div');
        card.className = 'equipment-card saida-removable-card';
        card.innerHTML = `
            ${isQuoteItem ? '' : `<button type="button" class="btn-delete-mini" onclick="deleteSaidaOtherItem(${itemId}, ${spaceArg})">Excluir</button>`}
            <div class="equipment-info">
                <h4>${escapeHtml(item.name)}</h4>
                <p>Quantidade: ${pendingQuantity || quantity}</p>
                ${isQuoteItem ? '<p>Item avulso do orçamento</p>' : ''}
            </div>
            <div class="status-indicator">
                ${isAwaitingSaida
                    ? `<button type="button" class="btn-primary" onclick="registerQuoteOtherItemSaida(${quoteItemId}, ${spaceArg})">Registrar Saída</button>`
                    : isReturned
                    ? '<span class="status-text emoji-status returned">✅</span>'
                    : '<span class="status-dot"></span><span class="status-text">Em Saída</span>'}
            </div>`;
        container.appendChild(card);
    });
}

async function loadEntradaEquipments() {
    try {
        const historyResult = await fetchSharedJson(`/api/events/${eventId}/history`);
        if (!historyResult.ok) return;

        const history = historyResult.data;
        const map = new Map();

        history.forEach((item) => {
            const key = movementKey(item.space_id, item.equipment_id);
            if (item.action_type === 'saida') {
                map.set(key, {
                    id: item.equipment_id,
                    name: item.equipment_name,
                    barcode: item.barcode,
                    space_id: item.space_id,
                    space_name: item.space_name,
                    action: item.action_type,
                    returned: false
                });
            } else if (item.action_type === 'entrada') {
                const equipment = map.get(key);
                if (equipment) equipment.returned = true;
            }
        });

        entradaEquipments = Array.from(map.values()).filter((eq) => eq.action === 'saida' && !eq.returned);
        renderEntradaEquipmentList();
        renderSpaceControls();
    } catch (error) {
        console.error(error);
    }
}

function renderEntradaEquipmentList() {
    renderList('entradaList', entradaEquipments, 'Pendente', true);
}

async function loadEntradaCables() {
    try {
        const summaryResult = await fetchSharedJson(`/api/events/${eventId}/cable-summary`);
        if (!summaryResult.ok) return;

        entradaCables = summaryResult.data;
        renderEntradaCableTable();
        renderSpaceControls();
    } catch (error) {
        console.error(error);
    }
}

function renderEntradaCableTable() {
    const tbody = document.getElementById('entradaCableTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (entradaCables.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:#888;text-align:center;padding:24px;">Nenhum cabo com saída registrada.</td></tr>';
        return;
    }

    entradaCables.forEach((cable) => {
        const finalQuantity = Number(cable.final);
        const isComplete = finalQuantity <= 0;
        const inputId = `entradaCableQty_${cable.cable_id}_${getSpaceKey(cable.space_id)}`;
        const spaceArg = getSpaceArg(cable.space_id);
        const spaceName = getSpaceName(cable.space_id);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(cable.name)}<br><small style="color:#888;">${escapeHtml(spaceName)}</small></td>
            <td>${cable.saida}</td>
            <td>${cable.entrada}</td>
            <td>${cable.final}</td>
            <td>
                <input
                    type="number"
                    min="1"
                    max="${Math.max(finalQuantity, 1)}"
                    step="1"
                    id="${inputId}"
                    placeholder="0"
                    ${isComplete ? 'disabled' : ''}
                >
            </td>
            <td>
                ${isComplete
                    ? '<span class="cable-entry-done" title="Entrada concluída">✅</span>'
                    : `<button type="button" class="btn-primary" onclick="registerCableEntrada(${cable.cable_id}, ${spaceArg})">Registrar</button>`}
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function loadEntradaOtherItems() {
    try {
        const [inventoryResult, quoteResult] = await Promise.all([
            fetchSharedJson(`/api/events/${eventId}/other-item-summary`),
            fetchSharedJson(`/api/events/${eventId}/quote-other-item-summary`)
        ]);
        if (!inventoryResult.ok) return;

        const inventoryItems = inventoryResult.data;
        const quoteItems = quoteResult.ok ? quoteResult.data : [];
        entradaOtherItems = [
            ...inventoryItems.map((item) => ({ ...item, source: 'inventory' })),
            ...quoteItems.map((item) => ({ ...item, source: 'quote' }))
        ];
        renderEntradaOtherItemTable();
        renderSpaceControls();
    } catch (error) {
        console.error(error);
    }
}

function renderEntradaOtherItemTable() {
    const tbody = document.getElementById('entradaOtherItemTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (entradaOtherItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:#888;text-align:center;padding:24px;">Nenhum item com saída registrada.</td></tr>';
        return;
    }

    entradaOtherItems.forEach((item) => {
        const isQuoteItem = item.source === 'quote';
        const isAwaitingSaida = isQuoteItem && Number(item.saida) <= 0;
        const finalQuantity = Number(item.final);
        const isComplete = !isAwaitingSaida && finalQuantity <= 0;
        const itemReference = isQuoteItem ? `quote_${item.quote_item_id}` : item.item_id;
        const inputId = `entradaOtherItemQty_${itemReference}_${getSpaceKey(item.space_id)}`;
        const spaceArg = getSpaceArg(item.space_id);
        const spaceName = getSpaceName(item.space_id);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(item.name)}${isQuoteItem ? '<br><small style="color:#7fc8ff;">Item avulso do orçamento</small>' : ''}<br><small style="color:#888;">${escapeHtml(spaceName)}</small></td>
            <td>${item.saida}</td>
            <td>${item.entrada}</td>
            <td>${item.final}</td>
            <td>
                <input
                    type="number"
                    min="1"
                    max="${Math.max(finalQuantity, 1)}"
                    step="1"
                    id="${inputId}"
                    placeholder="0"
                    ${isComplete || isAwaitingSaida ? 'disabled' : ''}
                >
            </td>
            <td>
                ${isAwaitingSaida
                    ? '<span class="status-text">Aguardando saída</span>'
                    : isComplete
                    ? '<span class="cable-entry-done" title="Entrada concluída">✅</span>'
                    : isQuoteItem
                        ? `<button type="button" class="btn-primary" onclick="registerQuoteOtherItemEntrada(${item.quote_item_id}, ${spaceArg})">Registrar</button>`
                        : `<button type="button" class="btn-primary" onclick="registerOtherItemEntrada(${item.item_id}, ${spaceArg})">Registrar</button>`}
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function loadConferenciaEquipments() {
    if (isScheduledEvent()) {
        try {
            const response = await fetch(`/api/events/${eventId}/equipment-requirements`, {
                credentials: 'include'
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                equipmentRequirements = [];
                renderServiceOrderList();
                return;
            }

            equipmentRequirements = (Array.isArray(data.requirements) ? data.requirements : [])
                .map((item) => {
                    const requestedQuantity = Math.max(0, Number(item.requestedQuantity) || 0);
                    const outgoingQuantity = Math.max(0, Number(item.separatedQuantity ?? item.outgoingQuantity) || 0);
                    return {
                        name: String(item.name || '').trim(),
                        equipmentNameKeys: (Array.isArray(item.equipmentNameKeys) ? item.equipmentNameKeys : [])
                            .map((value) => normalizeEquipmentRequirementName(value))
                            .filter(Boolean),
                        requestedQuantity,
                        outgoingQuantity,
                        separatedQuantity: outgoingQuantity,
                        pendingQuantity: Math.max(0, Number(item.pendingQuantity) || (requestedQuantity - outgoingQuantity)),
                        warehouseAvailableQuantity: Math.max(0, Number(item.warehouseAvailableQuantity) || 0),
                        usableStockQuantity: Math.max(0, Number(item.usableStockQuantity) || 0),
                        deficit: Math.max(0, Number(item.deficit) || 0),
                        confirmedFutureAvailableQuantity: Math.max(0, Number(item.confirmedFutureAvailableQuantity) || 0),
                        forecastFutureAvailableQuantity: Math.max(0, Number(item.forecastFutureAvailableQuantity) || 0),
                        predictedDeficit: Math.max(0, Number(item.predictedDeficit) || 0),
                        extraQuantity: Math.max(0, Number(item.extraQuantity) || 0),
                        completed: Boolean(item.completed) || (requestedQuantity > 0 && outgoingQuantity >= requestedQuantity)
                    };
                })
                .filter((item) => item.name && item.requestedQuantity > 0);
            conferenciaEquipments = [];
            filteredConferenciaEquipments = [];
            renderServiceOrderList();
        } catch (error) {
            console.error(error);
            equipmentRequirements = [];
            renderServiceOrderList();
        }
        return;
    }

    equipmentRequirements = [];
    try {
        const [historyResult, reservedRes] = await Promise.all([
            fetchSharedJson(`/api/events/${eventId}/history`),
            fetch(`/api/events/${eventId}/reserved-equipments`)
        ]);
        if (!historyResult.ok) return;

        const history = historyResult.data;
        const reservedEquipments = reservedRes.ok ? await reservedRes.json() : [];
        const pendingKey = `pending_items_${eventId}`;
        const selectedItems = JSON.parse(localStorage.getItem(pendingKey) || '[]');
        const map = new Map();

        reservedEquipments.forEach((item) => {
            map.set(movementKey(null, item.id), {
                id: Number(item.id),
                name: item.name,
                barcode: item.barcode,
                space_id: null,
                space_name: getSpaceName(null),
                checked: false,
                source: 'reserved'
            });
        });

        selectedItems.forEach((item) => {
            const spaceId = normalizeSpaceId(item.spaceId);
            map.set(movementKey(spaceId, item.id), {
                id: Number(item.id),
                name: item.name,
                barcode: item.barcode,
                space_id: spaceId,
                space_name: getSpaceName(spaceId),
                checked: false,
                source: 'conference'
            });
        });

        history.forEach((item) => {
            const equipmentId = Number(item.equipment_id);
            const key = movementKey(item.space_id, equipmentId);
            if (item.action_type === 'saida') {
                const equipment = map.get(key);
                if (equipment) {
                    map.set(key, {
                        ...equipment,
                        name: item.equipment_name,
                        barcode: item.barcode,
                        space_id: item.space_id,
                        space_name: item.space_name || getSpaceName(item.space_id),
                        checked: true
                    });
                    return;
                }

                map.forEach((reservedEquipment, reservedKey) => {
                    if (
                        Number(reservedEquipment.id) === equipmentId
                        && reservedEquipment.source === 'reserved'
                        && normalizeSpaceId(reservedEquipment.space_id) === null
                    ) {
                        map.set(reservedKey, {
                            ...reservedEquipment,
                            name: item.equipment_name,
                            barcode: item.barcode,
                            space_id: item.space_id,
                            space_name: item.space_name || getSpaceName(item.space_id),
                            checked: true
                        });
                    }
                });
            }
        });

        conferenciaEquipments = Array.from(map.values());
        filterConferenciaList();
        renderServiceOrderList();
    } catch (error) {
        console.error(error);
    }
}

async function loadConferenciaOtherItems() {
    try {
        const pendingKey = `pending_other_items_${eventId}`;
        const selectedItems = JSON.parse(localStorage.getItem(pendingKey) || '[]');
        const summaryResult = await fetchSharedJson(`/api/events/${eventId}/other-item-summary`);
        const summary = summaryResult.ok ? summaryResult.data : [];
        const summaryMap = new Map(summary.map((item) => [movementKey(item.space_id, item.item_id), item]));

        conferenciaOtherItems = selectedItems.map((item) => {
            const spaceId = normalizeSpaceId(item.spaceId);
            const saved = summaryMap.get(movementKey(spaceId, item.id));
            const requestedQuantity = Number(item.quantity) || 0;
            const saidaQuantity = Number(saved?.saida) || 0;
            return {
                id: Number(item.id),
                name: item.name,
                quantity: requestedQuantity,
                space_id: spaceId,
                space_name: getSpaceName(spaceId),
                checked: saidaQuantity >= requestedQuantity && requestedQuantity > 0,
                saida: saidaQuantity
            };
        });

        renderConferenciaOtherItems();
    } catch (error) {
        console.error(error);
    }
}

function renderConferenciaOtherItems() {
    const container = document.getElementById('conferenciaOtherItemList');
    if (!container) return;

    container.innerHTML = conferenciaOtherItems.length === 0
        ? '<p style="color:#888;text-align:center;width:100%">Vazio</p>'
        : '';

    conferenciaOtherItems.forEach((item) => {
        const spaceArg = getSpaceArg(item.space_id);
        const card = document.createElement('div');
        card.className = 'equipment-card conference-card';
        card.innerHTML = `
            <button onclick="removeConferenciaOtherItem(${item.id}, ${spaceArg})" class="btn-delete-mini">Excluir</button>
            <div class="equipment-info">
                <h4>${escapeHtml(item.name)}</h4>
                <p>Quantidade: ${item.quantity}</p>
            </div>
            <div class="status-indicator">
                ${item.checked
                    ? '<span class="status-text emoji-status returned">✅</span>'
                    : `<button type="button" class="btn-primary" onclick="registerConferenciaOtherItemSaida(${item.id}, ${spaceArg})">Registrar Saída</button>`}
            </div>`;
        container.appendChild(card);
    });
}

function filterConferenciaList() {
    const search = (document.getElementById('conferenciaSearch')?.value || '').trim().toLowerCase();

    filteredConferenciaEquipments = conferenciaEquipments.filter((eq) => {
        if (!search) return true;
        return String(eq.name || '').toLowerCase().includes(search)
            || String(eq.barcode || '').toLowerCase().includes(search);
    });

    renderList('conferenciaList', filteredConferenciaEquipments, '', true, true);
}

function renderList(id, list, status, isEntrada = false, useDynamicStatus = false, showReturnedStatus = false) {
    const container = document.getElementById(id);
    if (!container) return;

    container.innerHTML = list.length === 0 ? '<p style="color:#888;text-align:center;width:100%">Vazio</p>' : '';

    list.forEach((eq) => {
        const displayStatus = useDynamicStatus ? (eq.checked ? '✅' : '❌') : status;
        const isReturned = useDynamicStatus ? eq.checked : Boolean(showReturnedStatus && eq.returned);
        const returnedByUsername = String(eq.returned_by_username || '').trim();
        const equipmentId = Number(eq.equipment_id || eq.id);
        const showSaidaDelete = id === 'saidaList' && Number.isFinite(equipmentId);
        const spaceArg = getSpaceArg(eq.space_id);
        const spaceLine = id === 'entradaList'
            ? `<p>Espaço: ${escapeHtml(getSpaceName(eq.space_id))}</p>`
            : '';
        const card = document.createElement('div');
        card.className = `equipment-card ${useDynamicStatus ? 'conference-card' : ''} ${showSaidaDelete ? 'saida-removable-card' : ''}`;
        card.innerHTML = `
            ${useDynamicStatus ? `<button onclick="removeConferenciaEquipment(${eq.id}, ${spaceArg})" class="btn-delete-mini">Excluir</button>` : ''}
            ${showSaidaDelete ? `<button type="button" class="btn-delete-mini" onclick="deleteSaidaEquipment(${equipmentId}, ${spaceArg})">Excluir</button>` : ''}
            <div class="equipment-info">
                <h4>${escapeHtml(isEntrada ? eq.name : eq.equipment_name)}</h4>
                <p>Cod: ${escapeHtml(eq.barcode)}</p>
                ${spaceLine}
            </div>
            <div class="status-indicator">
                ${showReturnedStatus && isReturned && returnedByUsername ? `<span class="status-user">${returnedByUsername}</span>` : ''}
                ${(useDynamicStatus || isReturned)
                    ? `<span class="status-text emoji-status ${isReturned ? 'returned' : ''}">${isReturned ? '✅' : displayStatus}</span>`
                    : `<span class="status-dot ${isReturned ? 'returned' : ''}"></span><span class="status-text ${isReturned ? 'returned' : ''}">${displayStatus}</span>`}
            </div>`;
        container.appendChild(card);
    });
}

async function removeConferenciaEquipment(equipmentId, spaceId = null) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const pendingKey = `pending_items_${eventId}`;
    const selectedItems = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    const targetEquipment = conferenciaEquipments.find((eq) => (
        Number(eq.id) === Number(equipmentId) && isSameSpace(eq.space_id, normalizedSpaceId)
    ));

    try {
        if (!targetEquipment?.checked) {
            const updatedItems = selectedItems.filter((item) => (
                Number(item.id) !== Number(equipmentId) || !isSameSpace(item.spaceId, normalizedSpaceId)
            ));
            if (updatedItems.length === 0) {
                localStorage.removeItem(pendingKey);
            } else {
                localStorage.setItem(pendingKey, JSON.stringify(updatedItems));
            }

            await fetch(`/api/equipments/${Number(equipmentId)}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Disponivel' })
            });

            showMsg(document.getElementById('conferenciaMessage'), 'Equipamento excluído da conferência', 'success');
            await loadConferenciaEquipments();
            return;
        }

        if (targetEquipment.checked) {
            const response = await fetchMovementWithRetry('/api/equipment-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ equipmentId: Number(equipmentId), eventId, spaceId: normalizedSpaceId })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(document.getElementById('conferenciaMessage'), error.message || 'Não foi possível excluir', 'error');
                return;
            }
        }

        const updatedItems = selectedItems.filter((item) => (
            Number(item.id) !== Number(equipmentId) || !isSameSpace(item.spaceId, normalizedSpaceId)
        ));
        if (updatedItems.length === 0) {
            localStorage.removeItem(pendingKey);
        } else {
            localStorage.setItem(pendingKey, JSON.stringify(updatedItems));
        }

        showMsg(document.getElementById('conferenciaMessage'), 'Equipamento excluído da conferência', 'success');
        await Promise.all([loadSaidaEquipments(), loadEntradaEquipments(), loadConferenciaEquipments()]);
    } catch (error) {
        console.error(error);
        showMsg(document.getElementById('conferenciaMessage'), 'Erro de conexão', 'error');
    }
}

function requestDeleteSaidaPassword(msgEl) {
    const password = window.prompt('Digite a senha para excluir:');
    if (password === null) return null;

    return String(password).trim();
}

async function refreshSaidaAfterDelete() {
    await Promise.all([
        loadAvailableCables(),
        loadAvailableOtherItems(),
        loadSaidaEquipments(),
        loadCableSaidaHistory(),
        loadOtherItemSaidaHistory(),
        loadEntradaEquipments(),
        loadEntradaCables(),
        loadEntradaOtherItems(),
        loadConferenciaEquipments(),
        loadConferenciaOtherItems()
    ]);
}

async function hideSaidaItem(itemType, itemId, password, msgEl, spaceId = null) {
    const response = await fetch(`/api/events/${eventId}/saida-hidden-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType, itemId: Number(itemId), password, spaceId: normalizeSpaceId(spaceId) })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        showMsg(msgEl, error.message || 'Não foi possível excluir da saída', 'error');
        return false;
    }

    return true;
}

async function deleteSaidaEquipment(equipmentId, spaceId = null) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const msgEl = document.getElementById('saidaMessage');
    const password = requestDeleteSaidaPassword(msgEl);
    const equipment = saidaEquipments.find((item) => (
        Number(item.equipment_id || item.id) === Number(equipmentId) && isSameSpace(item.space_id, normalizedSpaceId)
    ));
    const isReturned = Boolean(equipment?.returned);
    if (!password) return;

    try {
        if (!isReturned) {
            const response = await fetchMovementWithRetry('/api/equipment-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ equipmentId: Number(equipmentId), eventId, spaceId: normalizedSpaceId })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(msgEl, error.message || 'Não foi possível excluir da saída', 'error');
                return;
            }
        }

        if (!(await hideSaidaItem('equipment', equipmentId, password, msgEl, normalizedSpaceId))) return;

        showMsg(msgEl, 'Equipamento excluído da saída', 'success');
        await refreshSaidaAfterDelete();
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexão', 'error');
    }
}

async function deleteSaidaCable(cableId, spaceId = null) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const msgEl = document.getElementById('saidaCableMessage');
    const cable = saidaCables.find((item) => (
        Number(item.cable_id) === Number(cableId) && isSameSpace(item.space_id, normalizedSpaceId)
    ));
    const quantity = Number(cable?.final) || 0;
    const password = requestDeleteSaidaPassword(msgEl);

    if (!password) return;

    try {
        if (quantity > 0) {
            const response = await fetchMovementWithRetry('/api/cable-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cableId: Number(cableId), eventId, quantity, spaceId: normalizedSpaceId })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(msgEl, error.message || 'Não foi possível excluir da saída', 'error');
                return;
            }
        }

        if (!(await hideSaidaItem('cable', cableId, password, msgEl, normalizedSpaceId))) return;

        showMsg(msgEl, 'Cabo excluído da saída', 'success');
        await refreshSaidaAfterDelete();
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexão', 'error');
    }
}

async function deleteSaidaOtherItem(itemId, spaceId = null) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const msgEl = document.getElementById('saidaOtherItemMessage');
    const item = saidaOtherItems.find((entry) => (
        Number(entry.item_id) === Number(itemId) && isSameSpace(entry.space_id, normalizedSpaceId)
    ));
    const quantity = Number(item?.final) || 0;
    const password = requestDeleteSaidaPassword(msgEl);

    if (!password) return;

    try {
        if (quantity > 0) {
            const response = await fetchMovementWithRetry('/api/other-item-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: Number(itemId), eventId, quantity, spaceId: normalizedSpaceId })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(msgEl, error.message || 'Não foi possível excluir da saída', 'error');
                return;
            }
        }

        if (!(await hideSaidaItem('other', itemId, password, msgEl, normalizedSpaceId))) return;

        showMsg(msgEl, 'Item excluído da saída', 'success');
        await refreshSaidaAfterDelete();
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexão', 'error');
    }
}

function handleSaidaKeyPress(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        enqueueEquipmentScan('saida', e.target);
    }
}

function handleSaidaButton() {
    enqueueEquipmentScan('saida', document.getElementById('saidaBarcode'));
}

async function handleCableSaidaKeyPress(e) {
    if (e.key === 'Enter') await processCableSaida();
}

async function handleCableSaidaButton() {
    await processCableSaida();
}

async function handleOtherItemSaidaKeyPress(e) {
    if (e.key === 'Enter') await processOtherItemSaida();
}

async function handleOtherItemSaidaButton() {
    await processOtherItemSaida();
}

function handleEntradaKeyPress(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        enqueueEquipmentScan('entrada', e.target);
    }
}

function handleEntradaButton() {
    enqueueEquipmentScan('entrada', document.getElementById('entradaBarcode'));
}

async function handleConferenciaKeyPress(e) {
    if (e.key === 'Enter') await processConferencia();
}

async function handleConferenciaButton() {
    await processConferencia();
}

async function processConferencia() {
    enqueueEquipmentScan('saida', document.getElementById('conferenciaBarcode'), 'conferenciaMessage', 'Indisponível no estoque');
}

function enqueueEquipmentScan(type, input, messageId = null, successMessage = null) {
    if (!input) return;
    const barcode = input.value.trim();
    if (!barcode) return;

    input.value = '';
    input.focus();
    equipmentScanQueue.push({ type, barcode, messageId, successMessage });
    processEquipmentScanQueue();
}

async function processEquipmentScanQueue() {
    if (processingEquipmentScanQueue) return;

    processingEquipmentScanQueue = true;
    while (equipmentScanQueue.length > 0) {
        const item = equipmentScanQueue.shift();
        await process(item.type, item.barcode, item.messageId, item.successMessage);
    }
    processingEquipmentScanQueue = false;
}

function scheduleMovementRefresh() {
    clearTimeout(movementRefreshTimer);
    movementRefreshTimer = setTimeout(() => {
        Promise.all([
            loadSaidaEquipments(),
            loadEntradaEquipments(),
            loadConferenciaEquipments()
        ])
            .catch((error) => console.error(error));
    }, 500);
}

function applyOptimisticEquipmentMovement(type, equipment, spaceId = null) {
    if (!equipment) return;

    const equipmentId = Number(equipment.id);
    const barcode = String(equipment.barcode || '');
    const name = String(equipment.name || equipment.equipment_name || '');
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const spaceName = getSpaceName(normalizedSpaceId);

    if (type === 'saida') {
        saidaEquipments = [
            ...saidaEquipments.filter((eq) => (
                Number(eq.equipment_id || eq.id) !== equipmentId || !isSameSpace(eq.space_id, normalizedSpaceId)
            )),
            {
                equipment_id: equipmentId,
                equipment_name: name,
                barcode,
                observation: String(equipment.observation || ''),
                space_id: normalizedSpaceId,
                space_name: spaceName,
                returned: false,
                returned_by_username: ''
            }
        ];
        entradaEquipments = [
            ...entradaEquipments.filter((eq) => (
                Number(eq.id) !== equipmentId || !isSameSpace(eq.space_id, normalizedSpaceId)
            )),
            { id: equipmentId, name, barcode, space_id: normalizedSpaceId, space_name: spaceName, action: 'saida', returned: false }
        ];
        filterSaidaList();
        renderEntradaEquipmentList();
        renderSpaceControls();
        if (isScheduledEvent()) {
            updateEquipmentRequirementProgress(name, 1, equipment.category);
        } else {
            updateConferenciaEquipmentStatus(equipmentId, normalizedSpaceId, true);
        }
        return;
    }

    saidaEquipments = saidaEquipments.map((eq) => (
        Number(eq.equipment_id || eq.id) === equipmentId && isSameSpace(eq.space_id, normalizedSpaceId)
            ? { ...eq, returned: true }
            : eq
    ));
    entradaEquipments = entradaEquipments.filter((eq) => (
        Number(eq.id) !== equipmentId || !isSameSpace(eq.space_id, normalizedSpaceId)
    ));
    filterSaidaList();
    renderEntradaEquipmentList();
    renderSpaceControls();
}

function resolveEntradaEquipmentSpaceId(barcode) {
    const normalizedBarcode = String(barcode || '').trim().toLowerCase();
    if (!normalizedBarcode) return null;

    const pendingEquipment = entradaEquipments.find((equipment) => (
        String(equipment.barcode || '').trim().toLowerCase() === normalizedBarcode
    ));

    return normalizeSpaceId(pendingEquipment?.space_id);
}

async function process(type, barcode, messageId = null, successMessage = null) {
    const msgEl = document.getElementById(messageId || `${type}Message`);
    const spaceId = type === 'entrada' ? resolveEntradaEquipmentSpaceId(barcode) : activeSaidaSpaceId;

    try {
        const movementBody = { barcode, eventId, spaceId };
        let save = await fetchMovementWithRetry(`/api/equipment-events/${type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(movementBody)
        });

        if (!save.ok) {
            const error = await save.json().catch(() => ({}));
            if (error.code === 'FUTURE_AVAILABILITY_WARNING' && error.requiresConfirmation === true) {
                const confirmed = await confirmFutureAvailabilityWarning(
                    error.warning || error.conflict,
                    error.warnings
                );
                if (!confirmed) {
                    showMsg(msgEl, 'Saída cancelada pelo operador.', 'error');
                    return;
                }
                save = await fetchMovementWithRetry(`/api/equipment-events/${type}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...movementBody, availabilityOverride: true })
                });
                if (!save.ok) {
                    const confirmedError = await save.json().catch(() => ({}));
                    showMsg(msgEl, confirmedError.message || 'Operação não permitida', 'error');
                    return;
                }
            } else {
            if (showAvailabilityConflictModal(error.conflict)) {
                showMsg(msgEl, 'Conflito de datas encontrado.', 'error');
                return;
            }
            showMsg(msgEl, error.message || 'Operação não permitida', 'error');
            return;
            }
        }

        const result = await save.json().catch(() => ({}));
        const eq = result.equipment || {};
        const movement = result.movement || {};
        const movementEventSuffix = type === 'entrada' && movement.eventName
            ? ` • devolvido do evento: ${movement.eventName}`
            : '';
        showMsg(msgEl, successMessage || `Sucesso: ${eq.name}${movementEventSuffix}`, 'success');
        speakEquipmentMovement(type, eq.name || eq.equipment_name);
        const appliedSpaceId = type === 'entrada' ? movement.spaceId : spaceId;
        applyOptimisticEquipmentMovement(type, eq, appliedSpaceId);
        scheduleMovementRefresh();
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexão', 'error');
    }
}

async function processCableSaida() {
    const nameInput = document.getElementById('saidaCableName');
    const quantityInput = document.getElementById('saidaCableQuantity');
    const msgEl = document.getElementById('saidaCableMessage');

    const cableName = String(nameInput?.value || '').trim();
    const quantity = Number(quantityInput?.value);

    if (!cableName) {
        showMsg(msgEl, 'Digite o nome do cabo', 'error');
        return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        showMsg(msgEl, 'Digite uma quantidade válida', 'error');
        return;
    }

    try {
        const normalizedName = cableName.toLowerCase();
        let cable = availableCables.find((item) => String(item.name || '').toLowerCase() === normalizedName);

        if (!cable) {
            const res = await fetch(`/api/cables?search=${encodeURIComponent(cableName)}`);
            const cables = await res.json();
            cable = cables.find((item) => String(item.name || '').toLowerCase() === normalizedName) || cables[0];
        }

        if (!cable) {
            showMsg(msgEl, 'Cabo não encontrado', 'error');
            return;
        }

        const save = await fetchMovementWithRetry('/api/cable-events/saida', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cableId: cable.id, eventId, quantity, spaceId: activeSaidaSpaceId })
        });

        if (!save.ok) {
            const error = await save.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Operação não permitida', 'error');
            return;
        }

        showMsg(msgEl, `Sucesso: ${cable.name} x${quantity}`, 'success');
        nameInput.value = '';
        quantityInput.value = '';
        await Promise.all([loadAvailableCables(), loadCableSaidaHistory(), loadEntradaCables()]);
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexão', 'error');
    }
}

async function processOtherItemSaida() {
    const nameInput = document.getElementById('saidaOtherItemName');
    const quantityInput = document.getElementById('saidaOtherItemQuantity');
    const msgEl = document.getElementById('saidaOtherItemMessage');

    const itemName = String(nameInput?.value || '').trim();
    const quantity = Number(quantityInput?.value);

    if (!itemName) {
        showMsg(msgEl, 'Digite o nome do item', 'error');
        return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        showMsg(msgEl, 'Digite uma quantidade válida', 'error');
        return;
    }

    try {
        const normalizedName = itemName.toLowerCase();
        let item = availableOtherItems.find((entry) => String(entry.name || '').toLowerCase() === normalizedName);

        if (!item) {
            const res = await fetch(`/api/other-items?search=${encodeURIComponent(itemName)}`);
            const items = await res.json();
            item = items.find((entry) => String(entry.name || '').toLowerCase() === normalizedName) || items[0];
        }

        if (!item) {
            showMsg(msgEl, 'Item não encontrado', 'error');
            return;
        }

        const save = await fetchMovementWithRetry('/api/other-item-events/saida', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: item.id, eventId, quantity, spaceId: activeSaidaSpaceId })
        });

        if (!save.ok) {
            const error = await save.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Operação não permitida', 'error');
            return;
        }

        showMsg(msgEl, `Sucesso: ${item.name} x${quantity}`, 'success');
        nameInput.value = '';
        quantityInput.value = '';
        await Promise.all([loadAvailableOtherItems(), loadOtherItemSaidaHistory(), loadEntradaOtherItems(), loadConferenciaOtherItems()]);
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexão', 'error');
    }
}

async function registerCableEntrada(cableId, spaceId = null) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const quantityInput = document.getElementById(`entradaCableQty_${cableId}_${getSpaceKey(normalizedSpaceId)}`);
    const msgEl = document.getElementById('entradaCableMessage');
    const cable = entradaCables.find((item) => (
        Number(item.cable_id) === Number(cableId) && isSameSpace(item.space_id, normalizedSpaceId)
    ));
    const quantity = Number(quantityInput?.value);

    if (!cable) {
        showMsg(msgEl, 'Cabo não encontrado.', 'error');
        return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        showMsg(msgEl, 'Digite uma quantidade válida.', 'error');
        return;
    }

    if (quantity > Number(cable.final)) {
        showMsg(msgEl, 'A quantidade informada é maior que o saldo pendente.', 'error');
        return;
    }

    try {
        const response = await fetchMovementWithRetry('/api/cable-events/entrada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cableId: Number(cableId), eventId, quantity, spaceId: normalizedSpaceId })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Não foi possível registrar a entrada.', 'error');
            return;
        }

        if (quantityInput) quantityInput.value = '';
        showMsg(msgEl, `Entrada registrada: ${cable.name} x${quantity}`, 'success');
        await Promise.all([loadAvailableCables(), loadCableSaidaHistory(), loadEntradaCables()]);
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexão', 'error');
    }
}

async function registerOtherItemEntrada(itemId, spaceId = null) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const quantityInput = document.getElementById(`entradaOtherItemQty_${itemId}_${getSpaceKey(normalizedSpaceId)}`);
    const msgEl = document.getElementById('entradaOtherItemMessage');
    const item = entradaOtherItems.find((entry) => (
        Number(entry.item_id) === Number(itemId) && isSameSpace(entry.space_id, normalizedSpaceId)
    ));
    const quantity = Number(quantityInput?.value);

    if (!item) {
        showMsg(msgEl, 'Item não encontrado.', 'error');
        return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        showMsg(msgEl, 'Digite uma quantidade válida.', 'error');
        return;
    }

    if (quantity > Number(item.final)) {
        showMsg(msgEl, 'A quantidade informada é maior que o saldo pendente.', 'error');
        return;
    }

    try {
        const response = await fetchMovementWithRetry('/api/other-item-events/entrada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: Number(itemId), eventId, quantity, spaceId: normalizedSpaceId })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Não foi possível registrar a entrada.', 'error');
            return;
        }

        if (quantityInput) quantityInput.value = '';
        showMsg(msgEl, `Entrada registrada: ${item.name} x${quantity}`, 'success');
        await Promise.all([loadAvailableOtherItems(), loadOtherItemSaidaHistory(), loadEntradaOtherItems(), loadConferenciaOtherItems()]);
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexão', 'error');
    }
}

async function registerQuoteOtherItemSaida(quoteItemId, spaceId = null) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const msgEl = document.getElementById('saidaOtherItemMessage');
    const itemRows = saidaOtherItems.filter((item) => (
        item.source === 'quote' && Number(item.quote_item_id) === Number(quoteItemId)
    ));
    const item = itemRows[0];
    const requestedQuantity = Number(item?.requested_quantity) || 0;
    const pendingQuantity = itemRows.reduce((sum, row) => sum + (Number(row.final) || 0), 0);
    const quantity = requestedQuantity - pendingQuantity;

    if (!item || quantity <= 0) {
        showMsg(msgEl, 'Este item avulso já teve a saída registrada.', 'error');
        return;
    }

    try {
        const response = await fetchMovementWithRetry('/api/quote-other-item-events/saida', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quoteItemId: Number(quoteItemId), eventId, quantity, spaceId: normalizedSpaceId })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Não foi possível registrar a saída do item avulso.', 'error');
            return;
        }

        showMsg(msgEl, `Saída registrada: ${item.name} x${quantity}`, 'success');
        await Promise.all([loadOtherItemSaidaHistory(), loadEntradaOtherItems()]);
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexão', 'error');
    }
}

async function registerQuoteOtherItemEntrada(quoteItemId, spaceId = null) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const inputId = `entradaOtherItemQty_quote_${quoteItemId}_${getSpaceKey(normalizedSpaceId)}`;
    const quantityInput = document.getElementById(inputId);
    const msgEl = document.getElementById('entradaOtherItemMessage');
    const item = entradaOtherItems.find((entry) => (
        entry.source === 'quote'
        && Number(entry.quote_item_id) === Number(quoteItemId)
        && isSameSpace(entry.space_id, normalizedSpaceId)
    ));
    const quantity = Number(quantityInput?.value);

    if (!item) {
        showMsg(msgEl, 'Item avulso não encontrado.', 'error');
        return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
        showMsg(msgEl, 'Digite uma quantidade válida.', 'error');
        return;
    }
    if (quantity > Number(item.final)) {
        showMsg(msgEl, 'A quantidade informada é maior que o saldo pendente.', 'error');
        return;
    }

    try {
        const response = await fetchMovementWithRetry('/api/quote-other-item-events/entrada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quoteItemId: Number(quoteItemId), eventId, quantity, spaceId: normalizedSpaceId })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Não foi possível registrar a entrada do item avulso.', 'error');
            return;
        }

        showMsg(msgEl, `Entrada registrada: ${item.name} x${quantity}`, 'success');
        await Promise.all([loadOtherItemSaidaHistory(), loadEntradaOtherItems()]);
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexão', 'error');
    }
}

async function registerConferenciaOtherItemSaida(itemId, spaceId = null) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const msgEl = document.getElementById('conferenciaOtherItemMessage');
    const item = conferenciaOtherItems.find((entry) => (
        Number(entry.id) === Number(itemId) && isSameSpace(entry.space_id, normalizedSpaceId)
    ));

    if (!item) {
        showMsg(msgEl, 'Item não encontrado.', 'error');
        return;
    }

    try {
        const response = await fetchMovementWithRetry('/api/other-item-events/saida', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: Number(itemId), eventId, quantity: Number(item.quantity), spaceId: normalizedSpaceId })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Não foi possível registrar a saída.', 'error');
            return;
        }

        showMsg(msgEl, `Saída registrada: ${item.name} x${item.quantity}`, 'success');
        await Promise.all([loadAvailableOtherItems(), loadOtherItemSaidaHistory(), loadEntradaOtherItems(), loadConferenciaOtherItems()]);
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexão', 'error');
    }
}

async function removeConferenciaOtherItem(itemId, spaceId = null) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const pendingKey = `pending_other_items_${eventId}`;
    const selectedItems = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    const targetItem = conferenciaOtherItems.find((item) => (
        Number(item.id) === Number(itemId) && isSameSpace(item.space_id, normalizedSpaceId)
    ));
    const updatedItems = selectedItems.filter((item) => (
        Number(item.id) !== Number(itemId) || !isSameSpace(item.spaceId, normalizedSpaceId)
    ));

    try {
        if (targetItem?.checked) {
            const response = await fetchMovementWithRetry('/api/other-item-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: Number(itemId), eventId, quantity: Number(targetItem.quantity), spaceId: normalizedSpaceId })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(document.getElementById('conferenciaOtherItemMessage'), error.message || 'Não foi possível excluir', 'error');
                return;
            }
        }

        if (updatedItems.length === 0) {
            localStorage.removeItem(pendingKey);
        } else {
            localStorage.setItem(pendingKey, JSON.stringify(updatedItems));
        }

        showMsg(document.getElementById('conferenciaOtherItemMessage'), 'Item excluído da conferência', 'success');
        await Promise.all([loadAvailableOtherItems(), loadOtherItemSaidaHistory(), loadEntradaOtherItems(), loadConferenciaOtherItems()]);
    } catch (error) {
        console.error(error);
        showMsg(document.getElementById('conferenciaOtherItemMessage'), 'Erro de conexão', 'error');
    }
}

function showMsg(el, message, type) {
    if (!el) return;

    el.textContent = message;
    el.className = `message ${type}`;

    setTimeout(() => {
        el.textContent = '';
        el.className = 'message';
    }, 3000);
}

function clearPendingItems() {
    Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('pending_items_') || key.startsWith('pending_other_items_')) {
            localStorage.removeItem(key);
        }
    });
}

async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });

        if (!response.ok) {
            showMsg(document.getElementById('conferenciaMessage'), 'Não foi possível encerrar a sessão', 'error');
            return;
        }

        clearPendingItems();
        localStorage.removeItem('relacao_event_id');
        localStorage.removeItem('relacao_event_name');
        localStorage.removeItem('relacao_space_id');
        localStorage.removeItem('relacao_space_name');
        window.location.href = '/login.html';
    } catch (error) {
        console.error(error);
        showMsg(document.getElementById('conferenciaMessage'), 'Erro de conexão', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeMovementAudio();
    loadEvent();
});


