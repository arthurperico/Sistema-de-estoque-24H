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
    const items = conferenciaEquipments
        .slice()
        .sort((a, b) => {
            if (Boolean(a.checked) !== Boolean(b.checked)) return Number(a.checked) - Number(b.checked);
            return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
        });
    const completed = items.filter((item) => item.checked).length;
    count.textContent = `${completed}/${items.length}`;

    if (items.length === 0) {
        list.innerHTML = '<p class="service-order-empty">Nenhum patrimonio na ordem de servico.</p>';
        return;
    }

    list.innerHTML = '';
    items.forEach((item) => {
        const row = document.createElement('div');
        row.className = `service-order-item ${item.checked ? 'complete' : ''}`;
        row.innerHTML = `
            <div class="service-order-info">
                <strong>${escapeHtml(item.name || 'Patrimonio')}</strong>
                <span>Cod: ${escapeHtml(item.barcode || '-')}</span>
                ${normalizeSpaceId(item.space_id) ? `<span>${escapeHtml(getSpaceName(item.space_id))}</span>` : ''}
            </div>
            <span class="service-order-status" title="${item.checked ? 'Saida registrada' : 'Saida pendente'}">${item.checked ? '✅' : '❌'}</span>
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
    if (!dateValue) return '--';
    return new Date(dateValue).toLocaleDateString('pt-BR');
}

function formatEventPeriod(startDate, endDate = startDate) {
    const start = formatEventDate(startDate);
    const end = formatEventDate(endDate || startDate);
    return end && end !== start ? `${start} ate ${end}` : start;
}

async function loadImageAsDataUrl(url) {
    const response = await fetch(url);
    const blob = await response.blob();

    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

async function presentPdfToUser(blob, fileName) {
    if (!isMobileDevice() && window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{
                description: 'PDF',
                accept: {
                    'application/pdf': ['.pdf']
                }
            }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return 'saved';
    }

    if (isMobileDevice() && navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: fileName
            });
            return 'shared';
        }
    }

    if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{
                description: 'PDF',
                accept: {
                    'application/pdf': ['.pdf']
                }
            }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return 'saved';
    }

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

async function loadEventSpaces() {
    if (!eventId) return;

    try {
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
            showMsg(msgEl, error.error || 'Nao foi possivel criar o espaço', 'error');
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
        showMsg(msgEl, 'Erro de conexao', 'error');
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
            if (name) groups.get(key).equipments.push(name);
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

async function generateSaidaPdf() {
    const { jsPDF } = window.jspdf || {};
    const msgEl = document.getElementById('saidaMessage');

    if (!jsPDF || !currentEvent) {
        showMsg(msgEl, 'Nao foi possivel gerar o PDF', 'error');
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
        const logoDataUrl = await loadImageAsDataUrl('/logo.PNG');
        const pdfGroups = buildSaidaPdfGroups();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginX = 18;
        const filePrefix = eventType === 'rental' ? 'romaneio-locacao' : 'romaneio';
        const fileName = `${filePrefix}-${String(currentEvent.name || 'evento').replace(/[^\w-]+/g, '_')}.pdf`;
        let cursorY = 20;

        const ensurePageSpace = (requiredHeight = 10) => {
            if (cursorY + requiredHeight <= pageHeight - 18) return;
            doc.addPage();
            cursorY = 20;
        };

        doc.addImage(logoDataUrl, 'PNG', (pageWidth - 76) / 2, cursorY, 76, 44);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text(eventType === 'rental' ? 'Romaneio de Locação' : 'Romaneio de Saida', pageWidth / 2, cursorY + 54, { align: 'center' });
        cursorY += 66;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(`Cliente: ${currentEvent.name || 'Cliente'}`, marginX, cursorY);
        cursorY += 7;
        if (eventType === 'rental') {
            doc.text(`Data de retirada: ${formatEventDate(currentEvent.withdrawal_date || currentEvent.date)}`, marginX, cursorY);
            cursorY += 7;
            doc.text(`Data de devolucao: ${formatEventDate(currentEvent.return_date)}`, marginX, cursorY);
            cursorY += 7;
        } else {
            doc.text(`Data do evento: ${formatEventDate(currentEvent.date)}`, marginX, cursorY);
            cursorY += 7;
        }
        cursorY += 5;

        const renderPdfSection = (title, items, emptyText, formatter) => {
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
            if (index > 0) cursorY += 4;
            ensurePageSpace(18);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(15);
            doc.text(group.name, marginX, cursorY);
            cursorY += 8;

            renderPdfSection('Equipamentos', group.equipments, 'Nenhum equipamento em saida', (name) => name);
            renderPdfSection('Cabos', group.cables, 'Nenhum cabo em saida', (cable) => `${cable.name} (${cable.quantity})`);
            renderPdfSection('Outros', group.otherItems, 'Nenhum item em saida', (item) => `${item.name} (${item.quantity})`);
        });

        const pdfBlob = doc.output('blob');
        const result = await presentPdfToUser(pdfBlob, fileName);
        const successMessage = result === 'shared'
            ? 'PDF gerado e aberto para compartilhar'
            : 'PDF gerado com sucesso';
        showMsg(msgEl, successMessage, 'success');
    } catch (error) {
        if (error?.name === 'AbortError') {
            return;
        }
        console.error(error);
        showMsg(msgEl, 'Erro ao gerar PDF', 'error');
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
        document.getElementById('eventName').textContent = currentEvent.name;
        document.getElementById('eventDate').textContent = eventType === 'rental'
            ? `Retirada: ${formatEventDate(currentEvent.withdrawal_date || currentEvent.date)} | Devolucao: ${formatEventDate(currentEvent.return_date)}`
            : `Periodo: ${formatEventPeriod(currentEvent.date, currentEvent.end_date || currentEvent.endDate || currentEvent.date)}`;

        const backButton = document.querySelector('.btn-close');
        const rentalPdfButton = document.getElementById('rentalPdfButton');
        if (rentalPdfButton) {
            rentalPdfButton.style.display = eventType === 'rental' ? '' : 'none';
        }

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
        const res = await fetch(`/api/events/${eventId}/history`);
        if (!res.ok) return;

        const history = await res.json();
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

    renderList('saidaList', filteredSaidaEquipments, 'Em Saida', false, false, true);
}

async function loadCableSaidaHistory() {
    try {
        const res = await fetch(`/api/events/${eventId}/cable-summary`);
        if (!res.ok) return;

        saidaCables = await res.json();
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
        ? '<p style="color:#888;text-align:center;width:100%">Nenhum cabo com saida registrada.</p>'
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
                    : '<span class="status-dot"></span><span class="status-text">Em Saida</span>'}
            </div>`;
        container.appendChild(card);
    });
}

async function loadOtherItemSaidaHistory() {
    try {
        const res = await fetch(`/api/events/${eventId}/other-item-summary`);
        if (!res.ok) return;

        saidaOtherItems = await res.json();
        renderOtherItemSaidaList();
        renderSpaceControls();
    } catch (error) {
        console.error(error);
    }
}

function renderOtherItemSaidaList() {
    const container = document.getElementById('saidaOtherItemList');
    if (!container) return;

    const visibleItems = saidaOtherItems.filter((item) => isSameSpace(item.space_id, activeSaidaSpaceId));

    container.innerHTML = visibleItems.length === 0
        ? '<p style="color:#888;text-align:center;width:100%">Nenhum item com saida registrada.</p>'
        : '';

    visibleItems.forEach((item) => {
        const isReturned = Number(item.final) <= 0;
        const quantity = Number(item.saida ?? item.quantity) || 0;
        const pendingQuantity = Number(item.final) || 0;
        const itemId = Number(item.item_id);
        const spaceArg = getSpaceArg(item.space_id);
        const card = document.createElement('div');
        card.className = 'equipment-card saida-removable-card';
        card.innerHTML = `
            <button type="button" class="btn-delete-mini" onclick="deleteSaidaOtherItem(${itemId}, ${spaceArg})">Excluir</button>
            <div class="equipment-info">
                <h4>${escapeHtml(item.name)}</h4>
                <p>Quantidade: ${pendingQuantity || quantity}</p>
            </div>
            <div class="status-indicator">
                ${isReturned
                    ? '<span class="status-text emoji-status returned">✅</span>'
                    : '<span class="status-dot"></span><span class="status-text">Em Saida</span>'}
            </div>`;
        container.appendChild(card);
    });
}

async function loadEntradaEquipments() {
    try {
        const res = await fetch(`/api/events/${eventId}/history`);
        if (!res.ok) return;

        const history = await res.json();
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
        const res = await fetch(`/api/events/${eventId}/cable-summary`);
        if (!res.ok) return;

        entradaCables = await res.json();
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
        tbody.innerHTML = '<tr><td colspan="6" style="color:#888;text-align:center;padding:24px;">Nenhum cabo com saida registrada.</td></tr>';
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
                    ? '<span class="cable-entry-done" title="Entrada concluida">✅</span>'
                    : `<button type="button" class="btn-primary" onclick="registerCableEntrada(${cable.cable_id}, ${spaceArg})">Registrar</button>`}
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function loadEntradaOtherItems() {
    try {
        const res = await fetch(`/api/events/${eventId}/other-item-summary`);
        if (!res.ok) return;

        entradaOtherItems = await res.json();
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
        tbody.innerHTML = '<tr><td colspan="6" style="color:#888;text-align:center;padding:24px;">Nenhum item com saida registrada.</td></tr>';
        return;
    }

    entradaOtherItems.forEach((item) => {
        const finalQuantity = Number(item.final);
        const isComplete = finalQuantity <= 0;
        const inputId = `entradaOtherItemQty_${item.item_id}_${getSpaceKey(item.space_id)}`;
        const spaceArg = getSpaceArg(item.space_id);
        const spaceName = getSpaceName(item.space_id);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(item.name)}<br><small style="color:#888;">${escapeHtml(spaceName)}</small></td>
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
                    ${isComplete ? 'disabled' : ''}
                >
            </td>
            <td>
                ${isComplete
                    ? '<span class="cable-entry-done" title="Entrada concluida">✅</span>'
                    : `<button type="button" class="btn-primary" onclick="registerOtherItemEntrada(${item.item_id}, ${spaceArg})">Registrar</button>`}
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function loadConferenciaEquipments() {
    try {
        const [historyRes, reservedRes] = await Promise.all([
            fetch(`/api/events/${eventId}/history`),
            fetch(`/api/events/${eventId}/reserved-equipments`)
        ]);
        if (!historyRes.ok) return;

        const history = await historyRes.json();
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
        const res = await fetch(`/api/events/${eventId}/other-item-summary`);
        const summary = res.ok ? await res.json() : [];
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
                    : `<button type="button" class="btn-primary" onclick="registerConferenciaOtherItemSaida(${item.id}, ${spaceArg})">Registrar Saida</button>`}
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

            showMsg(document.getElementById('conferenciaMessage'), 'Equipamento excluido da conferencia', 'success');
            await loadConferenciaEquipments();
            return;
        }

        if (targetEquipment.checked) {
            const response = await fetch('/api/equipment-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ equipmentId: Number(equipmentId), eventId, spaceId: normalizedSpaceId })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(document.getElementById('conferenciaMessage'), error.message || 'Nao foi possivel excluir', 'error');
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

        showMsg(document.getElementById('conferenciaMessage'), 'Equipamento excluido da conferencia', 'success');
        await Promise.all([loadSaidaEquipments(), loadEntradaEquipments(), loadConferenciaEquipments()]);
    } catch (error) {
        console.error(error);
        showMsg(document.getElementById('conferenciaMessage'), 'Erro de conexao', 'error');
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
        showMsg(msgEl, error.message || 'Nao foi possivel excluir da saida', 'error');
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
            const response = await fetch('/api/equipment-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ equipmentId: Number(equipmentId), eventId, spaceId: normalizedSpaceId })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(msgEl, error.message || 'Nao foi possivel excluir da saida', 'error');
                return;
            }
        }

        if (!(await hideSaidaItem('equipment', equipmentId, password, msgEl, normalizedSpaceId))) return;

        showMsg(msgEl, 'Equipamento excluido da saida', 'success');
        await refreshSaidaAfterDelete();
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexao', 'error');
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
            const response = await fetch('/api/cable-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cableId: Number(cableId), eventId, quantity, spaceId: normalizedSpaceId })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(msgEl, error.message || 'Nao foi possivel excluir da saida', 'error');
                return;
            }
        }

        if (!(await hideSaidaItem('cable', cableId, password, msgEl, normalizedSpaceId))) return;

        showMsg(msgEl, 'Cabo excluido da saida', 'success');
        await refreshSaidaAfterDelete();
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexao', 'error');
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
            const response = await fetch('/api/other-item-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: Number(itemId), eventId, quantity, spaceId: normalizedSpaceId })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(msgEl, error.message || 'Nao foi possivel excluir da saida', 'error');
                return;
            }
        }

        if (!(await hideSaidaItem('other', itemId, password, msgEl, normalizedSpaceId))) return;

        showMsg(msgEl, 'Item excluido da saida', 'success');
        await refreshSaidaAfterDelete();
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexao', 'error');
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
    enqueueEquipmentScan('saida', document.getElementById('conferenciaBarcode'), 'conferenciaMessage', 'Indisponivel no estoque');
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
            loadConferenciaEquipments(),
            loadAvailableOtherItems(),
            loadOtherItemSaidaHistory(),
            loadEntradaOtherItems(),
            loadConferenciaOtherItems()
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
        updateConferenciaEquipmentStatus(equipmentId, normalizedSpaceId, true);
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
        const save = await fetch(`/api/equipment-events/${type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode, eventId, spaceId })
        });

        if (!save.ok) {
            const error = await save.json().catch(() => ({}));
            if (showAvailabilityConflictModal(error.conflict)) {
                showMsg(msgEl, 'Conflito de datas encontrado.', 'error');
                return;
            }
            showMsg(msgEl, error.message || 'Operacao nao permitida', 'error');
            return;
        }

        const result = await save.json().catch(() => ({}));
        const eq = result.equipment || {};
        showMsg(msgEl, successMessage || `Sucesso: ${eq.name}`, 'success');
        applyOptimisticEquipmentMovement(type, eq, spaceId);
        scheduleMovementRefresh();
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexao', 'error');
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
        showMsg(msgEl, 'Digite uma quantidade valida', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/cables?search=${encodeURIComponent(cableName)}`);
        const cables = await res.json();
        const normalizedName = cableName.toLowerCase();
        const cable = cables.find((item) => String(item.name || '').toLowerCase() === normalizedName) || cables[0];

        if (!cable) {
            showMsg(msgEl, 'Cabo nao encontrado', 'error');
            return;
        }

        const save = await fetch('/api/cable-events/saida', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cableId: cable.id, eventId, quantity, spaceId: activeSaidaSpaceId })
        });

        if (!save.ok) {
            const error = await save.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Operacao nao permitida', 'error');
            return;
        }

        showMsg(msgEl, `Sucesso: ${cable.name} x${quantity}`, 'success');
        nameInput.value = '';
        quantityInput.value = '';
        await Promise.all([loadAvailableCables(), loadCableSaidaHistory(), loadEntradaCables()]);
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexao', 'error');
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
        showMsg(msgEl, 'Digite uma quantidade valida', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/other-items?search=${encodeURIComponent(itemName)}`);
        const items = await res.json();
        const normalizedName = itemName.toLowerCase();
        const item = items.find((entry) => String(entry.name || '').toLowerCase() === normalizedName) || items[0];

        if (!item) {
            showMsg(msgEl, 'Item nao encontrado', 'error');
            return;
        }

        const save = await fetch('/api/other-item-events/saida', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: item.id, eventId, quantity, spaceId: activeSaidaSpaceId })
        });

        if (!save.ok) {
            const error = await save.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Operacao nao permitida', 'error');
            return;
        }

        showMsg(msgEl, `Sucesso: ${item.name} x${quantity}`, 'success');
        nameInput.value = '';
        quantityInput.value = '';
        await Promise.all([loadAvailableOtherItems(), loadOtherItemSaidaHistory(), loadEntradaOtherItems(), loadConferenciaOtherItems()]);
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexao', 'error');
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
        showMsg(msgEl, 'Cabo nao encontrado.', 'error');
        return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        showMsg(msgEl, 'Digite uma quantidade valida.', 'error');
        return;
    }

    if (quantity > Number(cable.final)) {
        showMsg(msgEl, 'A quantidade informada e maior que o saldo pendente.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/cable-events/entrada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cableId: Number(cableId), eventId, quantity, spaceId: normalizedSpaceId })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Nao foi possivel registrar a entrada.', 'error');
            return;
        }

        if (quantityInput) quantityInput.value = '';
        showMsg(msgEl, `Entrada registrada: ${cable.name} x${quantity}`, 'success');
        await Promise.all([loadAvailableCables(), loadCableSaidaHistory(), loadEntradaCables()]);
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexao', 'error');
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
        showMsg(msgEl, 'Item nao encontrado.', 'error');
        return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        showMsg(msgEl, 'Digite uma quantidade valida.', 'error');
        return;
    }

    if (quantity > Number(item.final)) {
        showMsg(msgEl, 'A quantidade informada e maior que o saldo pendente.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/other-item-events/entrada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: Number(itemId), eventId, quantity, spaceId: normalizedSpaceId })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Nao foi possivel registrar a entrada.', 'error');
            return;
        }

        if (quantityInput) quantityInput.value = '';
        showMsg(msgEl, `Entrada registrada: ${item.name} x${quantity}`, 'success');
        await Promise.all([loadAvailableOtherItems(), loadOtherItemSaidaHistory(), loadEntradaOtherItems(), loadConferenciaOtherItems()]);
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexao', 'error');
    }
}

async function registerConferenciaOtherItemSaida(itemId, spaceId = null) {
    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const msgEl = document.getElementById('conferenciaOtherItemMessage');
    const item = conferenciaOtherItems.find((entry) => (
        Number(entry.id) === Number(itemId) && isSameSpace(entry.space_id, normalizedSpaceId)
    ));

    if (!item) {
        showMsg(msgEl, 'Item nao encontrado.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/other-item-events/saida', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: Number(itemId), eventId, quantity: Number(item.quantity), spaceId: normalizedSpaceId })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Nao foi possivel registrar a saida.', 'error');
            return;
        }

        showMsg(msgEl, `Saida registrada: ${item.name} x${item.quantity}`, 'success');
        await Promise.all([loadAvailableOtherItems(), loadOtherItemSaidaHistory(), loadEntradaOtherItems(), loadConferenciaOtherItems()]);
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexao', 'error');
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
            const response = await fetch('/api/other-item-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: Number(itemId), eventId, quantity: Number(targetItem.quantity), spaceId: normalizedSpaceId })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(document.getElementById('conferenciaOtherItemMessage'), error.message || 'Nao foi possivel excluir', 'error');
                return;
            }
        }

        if (updatedItems.length === 0) {
            localStorage.removeItem(pendingKey);
        } else {
            localStorage.setItem(pendingKey, JSON.stringify(updatedItems));
        }

        showMsg(document.getElementById('conferenciaOtherItemMessage'), 'Item excluido da conferencia', 'success');
        await Promise.all([loadAvailableOtherItems(), loadOtherItemSaidaHistory(), loadEntradaOtherItems(), loadConferenciaOtherItems()]);
    } catch (error) {
        console.error(error);
        showMsg(document.getElementById('conferenciaOtherItemMessage'), 'Erro de conexao', 'error');
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
            showMsg(document.getElementById('conferenciaMessage'), 'Nao foi possivel encerrar a sessao', 'error');
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
        showMsg(document.getElementById('conferenciaMessage'), 'Erro de conexao', 'error');
    }
}

document.addEventListener('DOMContentLoaded', loadEvent);
