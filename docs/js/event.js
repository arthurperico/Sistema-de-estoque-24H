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

function formatEventDate(dateValue) {
    if (!dateValue) return '--';
    return new Date(dateValue).toLocaleDateString('pt-BR');
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
        const logoDataUrl = await loadImageAsDataUrl('/logo.webp');
        const equipments = saidaEquipments
            .filter((item) => !item.returned)
            .map((item) => String(item.equipment_name || item.name || '').trim())
            .filter(Boolean);
        const cables = saidaCables
            .map((item) => ({
                name: String(item.name || '').trim(),
                quantity: Number(item.final ?? item.saida ?? item.quantity) || 0
            }))
            .filter((item) => item.name && item.quantity > 0);
        const otherItems = saidaOtherItems
            .map((item) => ({
                name: String(item.name || '').trim(),
                quantity: Number(item.final ?? item.saida ?? item.quantity) || 0
            }))
            .filter((item) => item.name && item.quantity > 0);
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

        doc.addImage(logoDataUrl, 'WEBP', (pageWidth - 76) / 2, cursorY, 76, 44);
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

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Equipamentos', marginX, cursorY);
        cursorY += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        if (equipments.length === 0) {
            doc.text('- Nenhum equipamento em saida', marginX, cursorY);
            cursorY += 8;
        } else {
            equipments.forEach((name) => {
                ensurePageSpace(8);
                const lines = doc.splitTextToSize(`- ${name}`, pageWidth - (marginX * 2));
                doc.text(lines, marginX, cursorY);
                cursorY += lines.length * 6;
            });
        }

        cursorY += 4;
        ensurePageSpace(14);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Cabos', marginX, cursorY);
        cursorY += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        if (cables.length === 0) {
            doc.text('- Nenhum cabo em saida', marginX, cursorY);
            cursorY += 8;
        } else {
            cables.forEach((cable) => {
                ensurePageSpace(8);
                const lines = doc.splitTextToSize(`- ${cable.name} (${cable.quantity})`, pageWidth - (marginX * 2));
                doc.text(lines, marginX, cursorY);
                cursorY += lines.length * 6;
            });
        }

        cursorY += 4;
        ensurePageSpace(14);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Outros', marginX, cursorY);
        cursorY += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        if (otherItems.length === 0) {
            doc.text('- Nenhum item em saida', marginX, cursorY);
        } else {
            otherItems.forEach((item) => {
                ensurePageSpace(8);
                const lines = doc.splitTextToSize(`- ${item.name} (${item.quantity})`, pageWidth - (marginX * 2));
                doc.text(lines, marginX, cursorY);
                cursorY += lines.length * 6;
            });
        }

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
    window.location.href = '/?section=banco';
}

function showSection(sectionId) {
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
        document.getElementById('eventName').textContent = currentEvent.name;
        document.getElementById('eventDate').textContent = eventType === 'rental'
            ? `Retirada: ${formatEventDate(currentEvent.withdrawal_date || currentEvent.date)} | Devolucao: ${formatEventDate(currentEvent.return_date)}`
            : `Data: ${formatEventDate(currentEvent.date)}`;

        const backButton = document.querySelector('.btn-close');
        const rentalPdfButton = document.getElementById('rentalPdfButton');
        if (rentalPdfButton) {
            rentalPdfButton.style.display = eventType === 'rental' ? '' : 'none';
        }

        if (backButton && eventType === 'rental') {
            backButton.onclick = () => {
                window.location.href = '/?section=locacao';
            };
        }

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
            if (item.action_type === 'saida') {
                equipmentMap.set(item.equipment_id, {
                    ...item,
                    returned: false,
                    returned_by_username: ''
                });
            } else if (item.action_type === 'entrada') {
                const equipment = equipmentMap.get(item.equipment_id);
                if (equipment) {
                    equipmentMap.set(item.equipment_id, {
                        ...equipment,
                        returned: true,
                        returned_by_username: item.performed_by_username || ''
                    });
                }
            }
        });

        saidaEquipments = Array.from(equipmentMap.values());
        filterSaidaList();
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
    } catch (error) {
        console.error(error);
    }
}

function renderCableSaidaList() {
    const container = document.getElementById('saidaCableList');
    if (!container) return;

    container.innerHTML = saidaCables.length === 0
        ? '<p style="color:#888;text-align:center;width:100%">Nenhum cabo com saida registrada.</p>'
        : '';

    saidaCables.forEach((cable) => {
        const isReturned = Number(cable.final) <= 0;
        const quantity = Number(cable.saida ?? cable.quantity) || 0;
        const pendingQuantity = Number(cable.final) || 0;
        const cableId = Number(cable.cable_id);
        const card = document.createElement('div');
        card.className = 'equipment-card saida-removable-card';
        card.innerHTML = `
            <button type="button" class="btn-delete-mini" onclick="deleteSaidaCable(${cableId})">Excluir</button>
            <div class="equipment-info">
                <h4>${cable.name}</h4>
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
    } catch (error) {
        console.error(error);
    }
}

function renderOtherItemSaidaList() {
    const container = document.getElementById('saidaOtherItemList');
    if (!container) return;

    container.innerHTML = saidaOtherItems.length === 0
        ? '<p style="color:#888;text-align:center;width:100%">Nenhum item com saida registrada.</p>'
        : '';

    saidaOtherItems.forEach((item) => {
        const isReturned = Number(item.final) <= 0;
        const quantity = Number(item.saida ?? item.quantity) || 0;
        const pendingQuantity = Number(item.final) || 0;
        const itemId = Number(item.item_id);
        const card = document.createElement('div');
        card.className = 'equipment-card saida-removable-card';
        card.innerHTML = `
            <button type="button" class="btn-delete-mini" onclick="deleteSaidaOtherItem(${itemId})">Excluir</button>
            <div class="equipment-info">
                <h4>${item.name}</h4>
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
            if (!map.has(item.equipment_id)) {
                map.set(item.equipment_id, {
                    id: item.equipment_id,
                    name: item.equipment_name,
                    barcode: item.barcode,
                    action: item.action_type,
                    returned: false
                });
            } else if (item.action_type === 'entrada') {
                map.get(item.equipment_id).returned = true;
            }
        });

        entradaEquipments = Array.from(map.values()).filter((eq) => eq.action === 'saida' && !eq.returned);
        renderList('entradaList', entradaEquipments, 'Pendente', true);
    } catch (error) {
        console.error(error);
    }
}

async function loadEntradaCables() {
    try {
        const res = await fetch(`/api/events/${eventId}/cable-summary`);
        if (!res.ok) return;

        entradaCables = await res.json();
        renderEntradaCableTable();
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
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${cable.name}</td>
            <td>${cable.saida}</td>
            <td>${cable.entrada}</td>
            <td>${cable.final}</td>
            <td>
                <input
                    type="number"
                    min="1"
                    max="${Math.max(finalQuantity, 1)}"
                    step="1"
                    id="entradaCableQty_${cable.cable_id}"
                    placeholder="0"
                    ${isComplete ? 'disabled' : ''}
                >
            </td>
            <td>
                ${isComplete
                    ? '<span class="cable-entry-done" title="Entrada concluida">✅</span>'
                    : `<button type="button" class="btn-primary" onclick="registerCableEntrada(${cable.cable_id})">Registrar</button>`}
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
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.name}</td>
            <td>${item.saida}</td>
            <td>${item.entrada}</td>
            <td>${item.final}</td>
            <td>
                <input
                    type="number"
                    min="1"
                    max="${Math.max(finalQuantity, 1)}"
                    step="1"
                    id="entradaOtherItemQty_${item.item_id}"
                    placeholder="0"
                    ${isComplete ? 'disabled' : ''}
                >
            </td>
            <td>
                ${isComplete
                    ? '<span class="cable-entry-done" title="Entrada concluida">✅</span>'
                    : `<button type="button" class="btn-primary" onclick="registerOtherItemEntrada(${item.item_id})">Registrar</button>`}
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function loadConferenciaEquipments() {
    try {
        const res = await fetch(`/api/events/${eventId}/history`);
        if (!res.ok) return;

        const history = await res.json();
        const pendingKey = `pending_items_${eventId}`;
        const selectedItems = JSON.parse(localStorage.getItem(pendingKey) || '[]');
        const map = new Map();

        selectedItems.forEach((item) => {
            map.set(Number(item.id), {
                id: Number(item.id),
                name: item.name,
                barcode: item.barcode,
                checked: false
            });
        });

        history.forEach((item) => {
            const equipmentId = Number(item.equipment_id);
            if (!map.has(equipmentId)) {
                return;
            }

            const equipment = map.get(equipmentId);
            if (item.action_type === 'saida') {
                map.set(equipmentId, {
                    ...equipment,
                    name: item.equipment_name,
                    barcode: item.barcode,
                    checked: true
                });
            }
        });

        conferenciaEquipments = Array.from(map.values());
        filterConferenciaList();
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
        const summaryMap = new Map(summary.map((item) => [Number(item.item_id), item]));

        conferenciaOtherItems = selectedItems.map((item) => {
            const saved = summaryMap.get(Number(item.id));
            const requestedQuantity = Number(item.quantity) || 0;
            const saidaQuantity = Number(saved?.saida) || 0;
            return {
                id: Number(item.id),
                name: item.name,
                quantity: requestedQuantity,
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
        const card = document.createElement('div');
        card.className = 'equipment-card conference-card';
        card.innerHTML = `
            <button onclick="removeConferenciaOtherItem(${item.id})" class="btn-delete-mini">Excluir</button>
            <div class="equipment-info">
                <h4>${item.name}</h4>
                <p>Quantidade: ${item.quantity}</p>
            </div>
            <div class="status-indicator">
                ${item.checked
                    ? '<span class="status-text emoji-status returned">✅</span>'
                    : `<button type="button" class="btn-primary" onclick="registerConferenciaOtherItemSaida(${item.id})">Registrar Saida</button>`}
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
        const card = document.createElement('div');
        card.className = `equipment-card ${useDynamicStatus ? 'conference-card' : ''} ${showSaidaDelete ? 'saida-removable-card' : ''}`;
        card.innerHTML = `
            ${useDynamicStatus ? `<button onclick="removeConferenciaEquipment(${eq.id})" class="btn-delete-mini">Excluir</button>` : ''}
            ${showSaidaDelete ? `<button type="button" class="btn-delete-mini" onclick="deleteSaidaEquipment(${equipmentId})">Excluir</button>` : ''}
            <div class="equipment-info">
                <h4>${isEntrada ? eq.name : eq.equipment_name}</h4>
                <p>Cod: ${eq.barcode}</p>
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

async function removeConferenciaEquipment(equipmentId) {
    const pendingKey = `pending_items_${eventId}`;
    const selectedItems = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    const targetEquipment = conferenciaEquipments.find((eq) => Number(eq.id) === Number(equipmentId));

    try {
        if (!targetEquipment?.checked) {
            const updatedItems = selectedItems.filter((item) => Number(item.id) !== Number(equipmentId));
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
                body: JSON.stringify({ equipmentId: Number(equipmentId), eventId })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(document.getElementById('conferenciaMessage'), error.message || 'Nao foi possivel excluir', 'error');
                return;
            }
        }

        const updatedItems = selectedItems.filter((item) => Number(item.id) !== Number(equipmentId));
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

async function hideSaidaItem(itemType, itemId, password, msgEl) {
    const response = await fetch(`/api/events/${eventId}/saida-hidden-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType, itemId: Number(itemId), password })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        showMsg(msgEl, error.message || 'Nao foi possivel excluir da saida', 'error');
        return false;
    }

    return true;
}

async function deleteSaidaEquipment(equipmentId) {
    const msgEl = document.getElementById('saidaMessage');
    const password = requestDeleteSaidaPassword(msgEl);
    const equipment = saidaEquipments.find((item) => Number(item.equipment_id || item.id) === Number(equipmentId));
    const isReturned = Boolean(equipment?.returned);
    if (!password) return;

    try {
        if (!isReturned) {
            const response = await fetch('/api/equipment-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ equipmentId: Number(equipmentId), eventId })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(msgEl, error.message || 'Nao foi possivel excluir da saida', 'error');
                return;
            }
        }

        if (!(await hideSaidaItem('equipment', equipmentId, password, msgEl))) return;

        showMsg(msgEl, 'Equipamento excluido da saida', 'success');
        await refreshSaidaAfterDelete();
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexao', 'error');
    }
}

async function deleteSaidaCable(cableId) {
    const msgEl = document.getElementById('saidaCableMessage');
    const cable = saidaCables.find((item) => Number(item.cable_id) === Number(cableId));
    const quantity = Number(cable?.final) || 0;
    const password = requestDeleteSaidaPassword(msgEl);

    if (!password) return;

    try {
        if (quantity > 0) {
            const response = await fetch('/api/cable-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cableId: Number(cableId), eventId, quantity })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(msgEl, error.message || 'Nao foi possivel excluir da saida', 'error');
                return;
            }
        }

        if (!(await hideSaidaItem('cable', cableId, password, msgEl))) return;

        showMsg(msgEl, 'Cabo excluido da saida', 'success');
        await refreshSaidaAfterDelete();
    } catch (error) {
        console.error(error);
        showMsg(msgEl, 'Erro de conexao', 'error');
    }
}

async function deleteSaidaOtherItem(itemId) {
    const msgEl = document.getElementById('saidaOtherItemMessage');
    const item = saidaOtherItems.find((entry) => Number(entry.item_id) === Number(itemId));
    const quantity = Number(item?.final) || 0;
    const password = requestDeleteSaidaPassword(msgEl);

    if (!password) return;

    try {
        if (quantity > 0) {
            const response = await fetch('/api/other-item-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: Number(itemId), eventId, quantity })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                showMsg(msgEl, error.message || 'Nao foi possivel excluir da saida', 'error');
                return;
            }
        }

        if (!(await hideSaidaItem('other', itemId, password, msgEl))) return;

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

function applyOptimisticEquipmentMovement(type, equipment) {
    if (!equipment) return;

    const equipmentId = Number(equipment.id);
    const barcode = String(equipment.barcode || '');
    const name = String(equipment.name || equipment.equipment_name || '');

    if (type === 'saida') {
        saidaEquipments = [
            ...saidaEquipments.filter((eq) => Number(eq.equipment_id || eq.id) !== equipmentId),
            {
                equipment_id: equipmentId,
                equipment_name: name,
                barcode,
                returned: false,
                returned_by_username: ''
            }
        ];
        entradaEquipments = [
            ...entradaEquipments.filter((eq) => Number(eq.id) !== equipmentId),
            { id: equipmentId, name, barcode, action: 'saida', returned: false }
        ];
        filterSaidaList();
        renderList('entradaList', entradaEquipments, 'Pendente', true);
        return;
    }

    saidaEquipments = saidaEquipments.map((eq) => (
        Number(eq.equipment_id || eq.id) === equipmentId ? { ...eq, returned: true } : eq
    ));
    entradaEquipments = entradaEquipments.filter((eq) => Number(eq.id) !== equipmentId);
    filterSaidaList();
    renderList('entradaList', entradaEquipments, 'Pendente', true);
}

async function process(type, barcode, messageId = null, successMessage = null) {
    const msgEl = document.getElementById(messageId || `${type}Message`);

    try {
        const save = await fetch(`/api/equipment-events/${type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode, eventId })
        });

        if (!save.ok) {
            const error = await save.json().catch(() => ({}));
            showMsg(msgEl, error.message || 'Operacao nao permitida', 'error');
            return;
        }

        const result = await save.json().catch(() => ({}));
        const eq = result.equipment || {};
        showMsg(msgEl, successMessage || `Sucesso: ${eq.name}`, 'success');
        applyOptimisticEquipmentMovement(type, eq);
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
            body: JSON.stringify({ cableId: cable.id, eventId, quantity })
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
            body: JSON.stringify({ itemId: item.id, eventId, quantity })
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

async function registerCableEntrada(cableId) {
    const quantityInput = document.getElementById(`entradaCableQty_${cableId}`);
    const msgEl = document.getElementById('entradaCableMessage');
    const cable = entradaCables.find((item) => Number(item.cable_id) === Number(cableId));
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
            body: JSON.stringify({ cableId: Number(cableId), eventId, quantity })
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

async function registerOtherItemEntrada(itemId) {
    const quantityInput = document.getElementById(`entradaOtherItemQty_${itemId}`);
    const msgEl = document.getElementById('entradaOtherItemMessage');
    const item = entradaOtherItems.find((entry) => Number(entry.item_id) === Number(itemId));
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
            body: JSON.stringify({ itemId: Number(itemId), eventId, quantity })
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

async function registerConferenciaOtherItemSaida(itemId) {
    const msgEl = document.getElementById('conferenciaOtherItemMessage');
    const item = conferenciaOtherItems.find((entry) => Number(entry.id) === Number(itemId));

    if (!item) {
        showMsg(msgEl, 'Item nao encontrado.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/other-item-events/saida', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: Number(itemId), eventId, quantity: Number(item.quantity) })
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

async function removeConferenciaOtherItem(itemId) {
    const pendingKey = `pending_other_items_${eventId}`;
    const selectedItems = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    const targetItem = conferenciaOtherItems.find((item) => Number(item.id) === Number(itemId));
    const updatedItems = selectedItems.filter((item) => Number(item.id) !== Number(itemId));

    try {
        if (targetItem?.checked) {
            const response = await fetch('/api/other-item-events/entrada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: Number(itemId), eventId, quantity: Number(targetItem.quantity) })
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
        window.location.href = '/login/';
    } catch (error) {
        console.error(error);
        showMsg(document.getElementById('conferenciaMessage'), 'Erro de conexao', 'error');
    }
}

document.addEventListener('DOMContentLoaded', loadEvent);
