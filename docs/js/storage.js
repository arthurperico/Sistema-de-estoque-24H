/**
 * Storage wrapper that uses localStorage for guest mode and API for regular users
 */

class DataStorage {
    constructor() {
        this.isGuest = false;
        this.storagePrefix = 'guest_';
    }

    setGuestMode(isGuest) {
        this.isGuest = isGuest;
    }

    // Generic localStorage operations
    _saveToLocalStorage(key, data) {
        try {
            localStorage.setItem(this.storagePrefix + key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Error saving to localStorage:', e);
            return false;
        }
    }

    _loadFromLocalStorage(key) {
        try {
            const data = localStorage.getItem(this.storagePrefix + key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Error loading from localStorage:', e);
            return null;
        }
    }

    _deleteFromLocalStorage(key) {
        try {
            localStorage.removeItem(this.storagePrefix + key);
            return true;
        } catch (e) {
            console.error('Error deleting from localStorage:', e);
            return false;
        }
    }

    // Events API
    async getEvents() {
        if (this.isGuest) {
            return this._loadFromLocalStorage('events') || [];
        }
        const response = await fetch('api/events');
        return response.json();
    }

    async createEvent(event) {
        if (this.isGuest) {
            const events = this._loadFromLocalStorage('events') || [];
            event.id = Date.now();
            events.push(event);
            this._saveToLocalStorage('events', events);
            return { success: true, event };
        }
        const response = await fetch('api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
        });
        return response.json();
    }

    async updateEvent(id, updates) {
        if (this.isGuest) {
            const events = this._loadFromLocalStorage('events') || [];
            const index = events.findIndex(e => e.id === id);
            if (index !== -1) {
                events[index] = { ...events[index], ...updates };
                this._saveToLocalStorage('events', events);
                return { success: true };
            }
            return { success: false, error: 'Event not found' };
        }
        const response = await fetch(`api/events/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        return response.json();
    }

    async deleteEvent(id) {
        if (this.isGuest) {
            let events = this._loadFromLocalStorage('events') || [];
            events = events.filter(e => e.id !== id);
            this._saveToLocalStorage('events', events);
            return { success: true };
        }
        const response = await fetch(`api/events/${id}`, {
            method: 'DELETE'
        });
        return response.json();
    }

    // Equipment API
    async getEquipments() {
        if (this.isGuest) {
            return this._loadFromLocalStorage('equipments') || [];
        }
        const response = await fetch('api/equipments');
        return response.json();
    }

    async createEquipment(equipment) {
        if (this.isGuest) {
            const equipments = this._loadFromLocalStorage('equipments') || [];
            equipment.id = Date.now();
            equipments.push(equipment);
            this._saveToLocalStorage('equipments', equipments);
            return { success: true, equipment };
        }
        const response = await fetch('api/equipments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(equipment)
        });
        return response.json();
    }

    async updateEquipment(id, updates) {
        if (this.isGuest) {
            const equipments = this._loadFromLocalStorage('equipments') || [];
            const index = equipments.findIndex(e => e.id === id);
            if (index !== -1) {
                equipments[index] = { ...equipments[index], ...updates };
                this._saveToLocalStorage('equipments', equipments);
                return { success: true };
            }
            return { success: false, error: 'Equipment not found' };
        }
        const response = await fetch(`api/equipments/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        return response.json();
    }

    async deleteEquipment(id) {
        if (this.isGuest) {
            let equipments = this._loadFromLocalStorage('equipments') || [];
            equipments = equipments.filter(e => e.id !== id);
            this._saveToLocalStorage('equipments', equipments);
            return { success: true };
        }
        const response = await fetch(`api/equipments/${id}`, {
            method: 'DELETE'
        });
        return response.json();
    }

    // Cables API
    async getCables() {
        if (this.isGuest) {
            return this._loadFromLocalStorage('cables') || [];
        }
        const response = await fetch('api/cables');
        return response.json();
    }

    async createCable(cable) {
        if (this.isGuest) {
            const cables = this._loadFromLocalStorage('cables') || [];
            cable.id = Date.now();
            cables.push(cable);
            this._saveToLocalStorage('cables', cables);
            return { success: true, cable };
        }
        const response = await fetch('api/cables', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cable)
        });
        return response.json();
    }

    async updateCable(id, updates) {
        if (this.isGuest) {
            const cables = this._loadFromLocalStorage('cables') || [];
            const index = cables.findIndex(c => c.id === id);
            if (index !== -1) {
                cables[index] = { ...cables[index], ...updates };
                this._saveToLocalStorage('cables', cables);
                return { success: true };
            }
            return { success: false, error: 'Cable not found' };
        }
        const response = await fetch(`api/cables/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        return response.json();
    }

    async deleteCable(id) {
        if (this.isGuest) {
            let cables = this._loadFromLocalStorage('cables') || [];
            cables = cables.filter(c => c.id !== id);
            this._saveToLocalStorage('cables', cables);
            return { success: true };
        }
        const response = await fetch(`api/cables/${id}`, {
            method: 'DELETE'
        });
        return response.json();
    }

    // Other Items API
    async getOtherItems() {
        if (this.isGuest) {
            return this._loadFromLocalStorage('otherItems') || [];
        }
        const response = await fetch('api/other-items');
        return response.json();
    }

    async createOtherItem(item) {
        if (this.isGuest) {
            const items = this._loadFromLocalStorage('otherItems') || [];
            item.id = Date.now();
            items.push(item);
            this._saveToLocalStorage('otherItems', items);
            return { success: true, item };
        }
        const response = await fetch('api/other-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
        });
        return response.json();
    }

    async updateOtherItem(id, updates) {
        if (this.isGuest) {
            const items = this._loadFromLocalStorage('otherItems') || [];
            const index = items.findIndex(i => i.id === id);
            if (index !== -1) {
                items[index] = { ...items[index], ...updates };
                this._saveToLocalStorage('otherItems', items);
                return { success: true };
            }
            return { success: false, error: 'Item not found' };
        }
        const response = await fetch(`api/other-items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        return response.json();
    }

    async deleteOtherItem(id) {
        if (this.isGuest) {
            let items = this._loadFromLocalStorage('otherItems') || [];
            items = items.filter(i => i.id !== id);
            this._saveToLocalStorage('otherItems', items);
            return { success: true };
        }
        const response = await fetch(`api/other-items/${id}`, {
            method: 'DELETE'
        });
        return response.json();
    }

    // Users API (only for admin, guests can still add users to localStorage)
    async getUsers() {
        if (this.isGuest) {
            return this._loadFromLocalStorage('users') || [];
        }
        const response = await fetch('api/users');
        if (!response.ok) return [];
        return response.json();
    }

    async createUser(user) {
        if (this.isGuest) {
            const users = this._loadFromLocalStorage('users') || [];
            user.id = Date.now();
            users.push(user);
            this._saveToLocalStorage('users', users);
            return { success: true, user };
        }
        const response = await fetch('api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        });
        return response.json();
    }

    async updateUserPassword(userId, newPassword) {
        if (this.isGuest) {
            const users = this._loadFromLocalStorage('users') || [];
            const index = users.findIndex(u => u.id === userId);
            if (index !== -1) {
                // Note: In guest mode, passwords are stored in localStorage for demo purposes only.
                // This is intentional as guest data is temporary and local to the browser.
                // In production mode (non-guest), passwords are handled securely by the server.
                users[index].password = newPassword;
                this._saveToLocalStorage('users', users);
                return { success: true };
            }
            return { success: false, error: 'User not found' };
        }
        const response = await fetch(`api/users/${userId}/password`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ password: newPassword })
        });
        return response.json();
    }

    async updateUser(userId, updates) {
        if (this.isGuest) {
            const users = this._loadFromLocalStorage('users') || [];
            const index = users.findIndex(u => Number(u.id) === Number(userId));
            if (index !== -1) {
                users[index] = { ...users[index], ...updates };
                this._saveToLocalStorage('users', users);
                return { success: true, user: users[index] };
            }
            return { success: false, error: 'User not found' };
        }
        const response = await fetch(`api/users/${userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates)
        });
        return response.json();
    }

    async deleteUser(userId) {
        if (this.isGuest) {
            let users = this._loadFromLocalStorage('users') || [];
            users = users.filter(u => u.id !== userId);
            this._saveToLocalStorage('users', users);
            return { success: true };
        }
        const response = await fetch(`api/users/${userId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        return response.json();
    }

    _getGuestDemoDate(offsetDays) {
        const date = new Date();
        date.setDate(date.getDate() + offsetDays);
        return date.toISOString().slice(0, 10);
    }

    _getGuestOverdueRental() {
        return {
            id: 5,
            name: 'Locacao Demonstracao Atrasada',
            event_type: 'rental',
            created_by_username: 'convidado',
            withdrawal_date: this._getGuestDemoDate(-5),
            return_date: this._getGuestDemoDate(-2)
        };
    }

    _ensureGuestOverdueRental() {
        const events = this._loadFromLocalStorage('events');
        if (!Array.isArray(events)) return;

        const overdueRental = this._getGuestOverdueRental();
        const existingIndex = events.findIndex((event) => (
            Number(event.id) === Number(overdueRental.id) ||
            String(event.name || '') === overdueRental.name
        ));

        if (existingIndex >= 0) {
            events[existingIndex] = { ...events[existingIndex], ...overdueRental };
        } else {
            events.push(overdueRental);
        }

        this._saveToLocalStorage('events', events);
    }

    // Pre-populate guest mode with demo data and keep required demo rentals available.
    seedGuestData() {
        const hasCompanies = this._loadFromLocalStorage('companies');
        const hasEvents = this._loadFromLocalStorage('events');
        if (hasCompanies && hasEvents) {
            this._ensureGuestOverdueRental();
            return;
        }

        const companies = [
            {
                id: 1, cnpj: '12345678000195', name: 'TechSystem Gestão',
                legal_name: 'TechSystem Soluções em Gestão LTDA', trade_name: 'TechSystem',
                state_registration: '123.456.789.112', municipal_registration: '987654321',
                phone: '(11) 3000-0001', phone2: '(11) 99000-0001',
                email: 'contato@techsystem.com.br', website: 'https://techsystem.com.br',
                zip_code: '01310-100', address: 'Av. Paulista', address_number: '1000',
                address_complement: 'Sala 501', neighborhood: 'Bela Vista',
                city: 'São Paulo', state: 'SP', country: 'Brasil',
                legal_representative: 'Ricardo Souza',
                accounting_email: 'contabil@techsystem.com.br',
                system_admin_email: 'ti@techsystem.com.br',
                company_admin_email: 'admin@techsystem.com.br',
                is_owner: 1, plan: 'ultra', created_at: '2024-01-01T00:00:00.000Z'
            },
            {
                id: 2, cnpj: '98765432000155', name: 'Eventos Luz & Som',
                legal_name: 'Luz e Som Produções e Eventos EIRELI', trade_name: 'Luz & Som Eventos',
                state_registration: '654.321.987.000', municipal_registration: '123456789',
                phone: '(21) 3200-4500', phone2: '(21) 98200-4500',
                email: 'contato@luzsom.com.br', website: 'https://luzsom.com.br',
                zip_code: '20040-020', address: 'Rua da Assembleia', address_number: '50',
                address_complement: 'Andar 8', neighborhood: 'Centro',
                city: 'Rio de Janeiro', state: 'RJ', country: 'Brasil',
                legal_representative: 'Fernanda Lima',
                accounting_email: 'financeiro@luzsom.com.br',
                system_admin_email: 'sistema@luzsom.com.br',
                company_admin_email: 'admin@luzsom.com.br',
                is_owner: 0, plan: 'pro', created_at: '2024-03-15T00:00:00.000Z'
            },
            {
                id: 3, cnpj: '11222333000181', name: 'MultiShow Produções',
                legal_name: 'MultiShow Entretenimento LTDA', trade_name: 'MultiShow',
                state_registration: '111.222.333.000', municipal_registration: '111222333',
                phone: '(31) 3300-7700', email: 'contato@multishow.com.br',
                zip_code: '30112-010', address: 'Av. Afonso Pena', address_number: '1500',
                neighborhood: 'Centro', city: 'Belo Horizonte', state: 'MG', country: 'Brasil',
                legal_representative: 'Paulo Mendes',
                accounting_email: 'financeiro@multishow.com.br',
                is_owner: 0, plan: 'start', created_at: '2024-05-10T00:00:00.000Z'
            },
            {
                id: 4, cnpj: '44555666000173', name: 'SomPro Locações',
                legal_name: 'SomPro Equipamentos e Locações LTDA', trade_name: 'SomPro',
                state_registration: '444.555.666.777', municipal_registration: '444555666',
                phone: '(41) 3100-5500', email: 'contato@sompro.com.br',
                website: 'https://sompro.com.br',
                zip_code: '80010-010', address: 'Rua XV de Novembro', address_number: '800',
                neighborhood: 'Centro', city: 'Curitiba', state: 'PR', country: 'Brasil',
                legal_representative: 'Gustavo Alves',
                accounting_email: 'financeiro@sompro.com.br',
                is_owner: 0, plan: 'pro', created_at: '2024-07-20T00:00:00.000Z'
            }
        ];

        const users = [
            { id: 101, username: 'convidado',       role: 'admin', company_id: 2, company_name: 'Eventos Luz & Som', created_at: '2024-03-15T00:00:00.000Z' },
            { id: 102, username: 'carlos.oliveira', role: 'user',  company_id: 2, company_name: 'Eventos Luz & Som', created_at: '2024-03-16T00:00:00.000Z' },
            { id: 103, username: 'ana.santos',      role: 'user',  company_id: 2, company_name: 'Eventos Luz & Som', created_at: '2024-04-01T00:00:00.000Z' },
            { id: 104, username: 'lucas.ferreira',  role: 'user',  company_id: 2, company_name: 'Eventos Luz & Som', created_at: '2024-04-10T00:00:00.000Z' },
            { id: 105, username: 'mariana.costa',   role: 'user',  company_id: 2, company_name: 'Eventos Luz & Som', created_at: '2024-05-05T00:00:00.000Z' }
        ];

        this._saveToLocalStorage('companies', companies);
        this._saveToLocalStorage('users', users);

        const events = [
            { id: 1, name: 'Show da Banda Metallix', date: '2026-06-15', event_type: 'event', created_by_username: 'convidado' },
            { id: 2, name: 'Casamento Fernanda & Lucas', event_type: 'rental', created_by_username: 'convidado', withdrawal_date: '2026-06-21', return_date: '2026-06-23' },
            { id: 3, name: 'Festival de Verão 2026', date: '2026-07-04', event_type: 'event', created_by_username: 'convidado' },
            { id: 4, name: 'Evento Corporativo TechConf', event_type: 'rental', created_by_username: 'convidado', withdrawal_date: this._getGuestDemoDate(2), return_date: this._getGuestDemoDate(5) },
            this._getGuestOverdueRental()
        ];

        const equipments = [
            { id: 1, name: 'Caixa de Som JBL 15"', barcode: 'DEMO-EQ-001', current_status: 'Disponivel', category: 'Som' },
            { id: 2, name: 'Mesa de Som Yamaha 24ch', barcode: 'DEMO-EQ-002', current_status: 'Disponivel', category: 'Som' },
            { id: 3, name: 'Microfone Shure SM58', barcode: 'DEMO-EQ-003', current_status: 'Pre separado', category: 'Som' },
            { id: 4, name: 'Projetor Epson 5000lm', barcode: 'DEMO-EQ-004', current_status: 'Pre separado', category: 'Video' },
            { id: 5, name: 'Moving Head LED 150W', barcode: 'DEMO-EQ-005', current_status: 'Disponivel', category: 'Iluminacao' },
            { id: 6, name: 'Par LED RGBW 54 Cores', barcode: 'DEMO-EQ-006', current_status: 'Disponivel', category: 'Iluminacao' },
            { id: 7, name: 'Tripe de Caixa', barcode: 'DEMO-EQ-007', current_status: 'Em manutencao', category: 'Som', maintenance_description: 'Pe quebrado' },
            { id: 8, name: 'Mesa DJ Pioneer XDJ-RX', barcode: 'DEMO-EQ-008', current_status: 'Pre separado', category: 'Som' }
        ];

        const cables = [
            { id: 1, name: 'Cabo XLR M/F 5m', quantity: 20, available_quantity: 12, category: 'Audio' },
            { id: 2, name: 'Cabo P10-P10 3m', quantity: 15, available_quantity: 11, category: 'Audio' },
            { id: 3, name: 'Cabo HDMI 5m', quantity: 8, available_quantity: 7, category: 'Video' },
            { id: 4, name: 'Cabo de Forca 3m', quantity: 30, available_quantity: 20, category: 'Eletrico' },
            { id: 5, name: 'Cabo de Rede Cat6 10m', quantity: 10, available_quantity: 10, category: 'Rede' },
            { id: 6, name: 'Cabo Speakon 10m', quantity: 12, available_quantity: 10, category: 'Audio' }
        ];

        const otherItems = [
            { id: 1, name: 'Pedestal de Microfone', quantity: 6, available_quantity: 6, category: 'Acessorios' },
            { id: 2, name: 'Direct Box Passivo', quantity: 4, available_quantity: 3, category: 'Audio' },
            { id: 3, name: 'Extensao Eletrica 10m', quantity: 8, available_quantity: 5, category: 'Eletrico' }
        ];

        this._saveToLocalStorage('events', events);
        this._saveToLocalStorage('equipments', equipments);
        this._saveToLocalStorage('cables', cables);
        this._saveToLocalStorage('otherItems', otherItems);

        const historyEvents = [
            { id: 10, name: 'Rock in Rio 2025', date: '2025-11-15', event_type: 'event', created_by_username: 'carlos.oliveira' },
            { id: 11, name: 'Formatura UFRJ 2025', date: '2025-12-10', event_type: 'event', created_by_username: 'ana.santos' }
        ];
        const historyRentals = [
            { id: 20, name: 'Casamento Silva & Rocha', event_type: 'rental', created_by_username: 'lucas.ferreira', withdrawal_date: '2025-10-05', return_date: '2025-10-07' }
        ];
        this._saveToLocalStorage('historyEvents', historyEvents);
        this._saveToLocalStorage('historyRentals', historyRentals);

        // Pre-assign equipment to events (pending_items_* stored without guest_ prefix)
        if (!localStorage.getItem('pending_items_1')) {
            localStorage.setItem('pending_items_1', JSON.stringify([
                { id: 3, name: 'Microfone Shure SM58', barcode: 'DEMO-EQ-003' },
                { id: 4, name: 'Projetor Epson 5000lm', barcode: 'DEMO-EQ-004' }
            ]));
        }
        if (!localStorage.getItem('pending_items_2')) {
            localStorage.setItem('pending_items_2', JSON.stringify([
                { id: 8, name: 'Mesa DJ Pioneer XDJ-RX', barcode: 'DEMO-EQ-008' }
            ]));
        }
    }

    // Clear all guest data (and re-seed demo data)
    clearGuestData() {
        const keys = ['events', 'equipments', 'cables', 'otherItems', 'users', 'companies', 'historyEvents', 'historyRentals'];
        keys.forEach(key => this._deleteFromLocalStorage(key));
        Object.keys(localStorage).forEach((key) => {
            if (
                key.startsWith('pending_items_') ||
                key.startsWith('pending_other_items_') ||
                key.startsWith('dismissed_notifications') ||
                key.startsWith('dismissed_rental_return_alerts') ||
                key === 'notification-settings'
            ) {
                localStorage.removeItem(key);
            }
        });
        this.seedGuestData();
    }

    async getHistoryData() {
        if (this.isGuest) {
            return {
                events: this._loadFromLocalStorage('historyEvents') || [],
                rentals: this._loadFromLocalStorage('historyRentals') || []
            };
        }
        return { events: [], rentals: [] };
    }

    // Companies API
    async getCompanies() {
        if (this.isGuest) {
            return this._loadFromLocalStorage('companies') || [];
        }
        const response = await fetch('api/companies', { credentials: 'include' });
        if (!response.ok) return [];
        const data = await response.json().catch(() => ({}));
        return Array.isArray(data.companies) ? data.companies : [];
    }

    async getCompany(id) {
        if (this.isGuest) {
            const companies = this._loadFromLocalStorage('companies') || [];
            return companies.find(c => c.id === id) || null;
        }
        const response = await fetch(`api/companies/${id}`, { credentials: 'include' });
        if (!response.ok) return null;
        const data = await response.json().catch(() => ({}));
        return data.company || data;
    }

    async createCompany(company) {
        if (this.isGuest) {
            const companies = this._loadFromLocalStorage('companies') || [];
            company.id = Date.now();
            company.is_owner = 0;
            companies.push(company);
            this._saveToLocalStorage('companies', companies);
            return { success: true, company };
        }
        const response = await fetch('api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(company)
        });
        return response.json();
    }

    async updateCompany(id, updates) {
        if (this.isGuest) {
            const companies = this._loadFromLocalStorage('companies') || [];
            const index = companies.findIndex(c => c.id === id);
            if (index !== -1) {
                companies[index] = { ...companies[index], ...updates };
                this._saveToLocalStorage('companies', companies);
                return { success: true };
            }
            return { success: false, error: 'Company not found' };
        }
        const response = await fetch(`api/companies/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updates)
        });
        return response.json();
    }

    async deleteCompany(id) {
        if (this.isGuest) {
            let companies = this._loadFromLocalStorage('companies') || [];
            companies = companies.filter(c => c.id !== id);
            this._saveToLocalStorage('companies', companies);
            return { success: true };
        }
        const response = await fetch(`api/companies/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        return response.json();
    }
}

// Export global instance
const storage = new DataStorage();
