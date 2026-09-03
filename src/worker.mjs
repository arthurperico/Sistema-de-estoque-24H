import bcrypt from 'bcryptjs';

// ── Skylet RAG Knowledge Base ───────────────────────────────────────────────
const EQUIPTRACK_KNOWLEDGE_BASE = `
Você é a Skylet, assistente virtual do sistema de gestão de estoque para empresas de eventos.
Responda sempre em português brasileiro, de forma clara, objetiva e prática.
Nunca mencione nenhum nome de sistema ou produto. Quando precisar se identificar, diga apenas que é a Skylet.
Foque em ajudar o usuário a entender e usar o sistema. Não invente funcionalidades que não existem.

SISTEMA — VISÃO GERAL
- URL de produção: https://estoque.24hlocacoes.com/
- Finalidade: controle de estoque de equipamentos de som, luz, vídeo, cabos, mobiliário e outros itens para empresas de locação/eventos.
- Plataforma: web, responsiva, hospedada na Cloudflare (Worker + D1 SQLite).
- Idioma da interface: português brasileiro.

SEÇÕES DA INTERFACE (menu lateral):
1. Eventos — lista e gestão de eventos ativos (festas, shows, feiras etc.)
2. Locação — lista e gestão de locações (evento com datas de retirada e devolução)
3. Manutenção — registra e resolve manutenções de equipamentos e cabos
4. Banco de Dados — tabelas de equipamentos, cabos e outros itens cadastrados
5. Cadastrar Equipamento — formulário para adicionar novos itens ao estoque
6. Histórico — eventos e locações já finalizados (concluídos)
7. Configurações (ícone de engrenagem) — gerenciar usuários, empresas e tema visual

TIPOS DE EVENTO:
- Evento (event_type = 'event'): evento pontual com data; equipamentos saem e voltam no mesmo evento.
- Locação (event_type = 'rental'): tem data de retirada (withdrawalDate) e data de devolução (returnDate); usada para aluguéis onde o cliente leva o item.

FLUXO DE SAÍDA E ENTRADA (movimentação):
- Saída (saida): equipamento ou cabo sai do estoque para um evento. Status muda para "Indisponivel".
- Entrada (entrada): equipamento ou cabo retorna ao estoque. Status volta para "Disponivel".
- Equipamentos usam código de barras para identificação; um equipamento por registro.
- Cabos e Outros Itens usam quantidade (podem sair múltiplas unidades de uma vez).
- Um equipamento só pode sair se estiver "Disponivel" (não em manutenção, não em evento).
- Para registrar saída de equipamento via leitor de código de barras, basta escanear na tela do evento.

EQUIPAMENTOS:
- Campos: nome, código de barras (único), categoria, status (Disponivel / Indisponivel / Em manutencao).
- Status gerenciado automaticamente pelo sistema ao registrar saídas/entradas/manutenções.
- Categorias são livres (ex: Som, Luz, Vídeo, Mobiliário).
- Para excluir um equipamento é necessária a senha de exclusão (configurada nas configurações).
- O histórico de movimentações fica registrado por evento.

CABOS:
- Campos: nome, quantidade total, quantidade disponível, categoria.
- Quantidade disponível é atualizada automaticamente a cada saída/entrada.
- Pode entrar em manutenção (registra descrição; resolvida pelo botão "Resolver").
- Para editar quantidade ou excluir, requer senha de exclusão.

OUTROS ITENS (other_items):
- Funcionam igual aos cabos: têm quantidade total e disponível.
- Usados para itens de buffet, EPIs, mobiliário ou qualquer item contado em quantidade.
- Não possuem manutenção; apenas saída/entrada por evento.

MANUTENÇÃO:
- Equipamentos: ao registrar manutenção, o status muda para "Em manutencao" e o item fica indisponível. Ao resolver, volta para "Disponivel".
- Cabos: a manutenção é informativa (registra descrição); a quantidade disponível não muda automaticamente por manutenção de cabo.
- Histórico de manutenção visível na seção Manutenção, com filtro por equipamentos e cabos.

ALERTAS DE DEVOLUÇÃO:
- O sistema exibe um alerta na tela de Eventos quando locações têm data de devolução igual ou anterior à data atual.
- Objetivo: prevenir que o usuário esqueça de cobrar a devolução de equipamentos locados.

HISTÓRICO (concluído):
- Eventos e locações finalizados aparecem na seção Histórico.
- Um evento é "concluído" quando todos os equipamentos com saída registrada têm entrada registrada de volta.
- Locações concluídas também ficam no histórico.
- O histórico mostra o resumo de cabos, equipamentos e outros itens movimentados.

SISTEMA DE USUÁRIOS E PERMISSÕES:
Roles (funções):
  - user: acesso básico; pode registrar saídas/entradas, criar eventos, ver estoque. Não acessa configurações de usuários/empresas.
  - admin: tudo do user + gerenciar usuários e configurações da própria empresa.
  - gestor_admin: acesso total; gerencia todas as empresas e todos os usuários do sistema; não está vinculado a uma empresa específica.

MULTI-EMPRESA (isolamento por company_id):
- O sistema suporta múltiplas empresas isoladas.
- Usuários common (user/admin) veem apenas dados da própria empresa.
- gestor_admin vê todos os dados de todas as empresas.
- Cada empresa tem seu próprio estoque, eventos, usuários.

PLANOS DE EMPRESA:
- start: plano básico.
- pro: plano intermediário (padrão ao criar empresa).
- ultra: plano completo.

CONFIGURAÇÕES (acessível pelo ícone de engrenagem):
- Gerenciar usuários: criar, editar senha, excluir.
- Gerenciar empresas (gestor_admin): criar, editar, excluir empresas; definir plano.
- Tema visual: personalizar cores primárias e elementos visuais da interface.
- Senha de exclusão: senha necessária para deletar equipamentos, cabos, eventos e locações.
- Logo personalizada: possível trocar o logo exibido no menu.

SENHA DE EXCLUSÃO (delete password):
- Configurada nas configurações pelo administrador.
- Obrigatória ao excluir: equipamentos, cabos, outros itens, locações, e ao ocultar itens do histórico de saída.

PREVENÇÃO DE OVERBOOKING:
- O sistema impede que o mesmo equipamento seja marcado como "saída" em dois eventos simultâneos.
- Para cabos e outros itens, o sistema verifica se há quantidade disponível antes de permitir a saída.

COMO USAR — FLUXO TÍPICO:
1. Cadastre equipamentos em "Cadastrar Equipamento" (nome, código de barras, categoria).
2. Crie um evento em "Eventos" (nome + data) ou uma locação em "Locação" (nome + datas).
3. Abra o evento → registre saída dos equipamentos que vão para o evento.
4. Quando os equipamentos voltarem, registre a entrada.
5. O evento vai para "Histórico" quando todos os itens retornarem.

COMO USAR — LOCAÇÃO:
1. Crie locação em "Locação" com nome, data de retirada e data de devolução.
2. Registre saída dos itens na data de retirada.
3. Na data de devolução, registre entrada dos itens. O alerta aparece na tela para lembrar.
4. Locação vai para Histórico após todos os itens retornarem.

COMO CADASTRAR CABO:
- Vá em "Cadastrar Equipamento" → aba "Cabos".
- Preencha nome, quantidade inicial e categoria.

COMO CADASTRAR OUTRO ITEM:
- Vá em "Cadastrar Equipamento" → aba "Outros".
- Preencha nome e quantidade inicial.

COMO EDITAR QUANTIDADE DE CABO OU OUTRO ITEM:
- Vá em "Banco de Dados" → aba "Cabos" ou "Outros".
- Clique em editar, insira nova quantidade, confirme.

OCULTAR ITEM DO RESUMO DE SAÍDA:
- No histórico de saída de um evento, é possível ocultar itens específicos (requer senha de exclusão).
- Útil para corrigir registros de saída equivocados sem apagar o evento inteiro.

INFORMAÇÕES TÉCNICAS:
- Backend: Cloudflare Worker (Node.js compat)
- Banco de dados: Cloudflare D1 (SQLite)
- Autenticação: sessão via cookie (sessao24h), duração 24 horas
- Proteção contra brute-force: lockout progressivo no login (3 tentativas → 3 min, crescendo até 1 ano)
- Frontend: HTML/CSS/JS puro, sem frameworks
`.trim();

async function buildChatDbContext(env, session) {
    const cid = session.company_id ? Number(session.company_id) : null;
    const p = cid !== null ? [cid] : [];
    const f = cid !== null ? ' AND company_id = ?' : '';
    try {
        const [equip, equipAvail, cables, otherItems, events, rentals, users, company] = await Promise.all([
            queryFirst(env, `SELECT COUNT(*) AS n FROM equipments WHERE 1=1${f}`, p),
            queryFirst(env, `SELECT COUNT(*) AS n FROM equipments WHERE current_status = 'Disponivel'${f}`, p),
            queryFirst(env, `SELECT COUNT(*) AS n FROM cables WHERE 1=1${f}`, p),
            queryFirst(env, `SELECT COUNT(*) AS n FROM other_items WHERE 1=1${f}`, p),
            queryFirst(env, `SELECT COUNT(*) AS n FROM events WHERE COALESCE(event_type,'event') = 'event'${f}`, p),
            queryFirst(env, `SELECT COUNT(*) AS n FROM events WHERE event_type = 'rental'${f}`, p),
            queryFirst(env, `SELECT COUNT(*) AS n FROM users WHERE ${cid !== null ? 'company_id = ?' : '1=1'}`, p),
            cid ? queryFirst(env, 'SELECT name, plan FROM companies WHERE id = ?', [cid]) : Promise.resolve(null),
        ]);
        let ctx = '\n\nDADOS ATUAIS DA SUA CONTA (use para responder perguntas sobre o estoque):'
        if (company) ctx += `\n- Empresa: ${company.name} (Plano: ${company.plan})`;
        ctx += `\n- Equipamentos: ${equip?.n ?? 0} cadastrados, ${equipAvail?.n ?? 0} disponíveis`;
        ctx += `\n- Tipos de cabo: ${cables?.n ?? 0}`;
        ctx += `\n- Outros itens: ${otherItems?.n ?? 0}`;
        ctx += `\n- Eventos ativos: ${events?.n ?? 0} eventos, ${rentals?.n ?? 0} locações`;
        ctx += `\n- Usuários cadastrados: ${users?.n ?? 0}`;
        return ctx;
    } catch (_) {
        return '';
    }
}

const SESSION_COOKIE_NAME = 'sessao24h';
const SESSION_DURATION_SECONDS = 60 * 60 * 24;
const LOGIN_PAGES = new Set(['/login/', '/login/index.html']);
const DEFAULT_NOTIFICATION_SETTINGS = {
    enabled: true,
    daysBefore: [7, 5, 3, 1, 0],
    includeOverdue: true,
    maxNotices: 20,
    repeatMode: 'daily',
    allowUserDismiss: true
};

// Lockout durations in seconds for each tier (groups of 3 failures)
const LOCKOUT_TIERS = [
    180,      // tier 0 — 3 failures  → 3 minutes
    300,      // tier 1 — 6 failures  → 5 minutes
    600,      // tier 2 — 9 failures  → 10 minutes
    3600,     // tier 3 — 12 failures → 60 minutes
    86400,    // tier 4 — 15 failures → 1 day
    604800,   // tier 5 — 18 failures → 1 week
    2592000,  // tier 6 — 21 failures → 1 month (30 days)
    7776000,  // tier 7 — 24 failures → 3 months (90 days)
];
const YEAR_SECONDS = 365 * 24 * 3600; // tier 8+ → 1 year per extra tier

// Returns the lockout duration in seconds for the given cumulative failure count.
// Every multiple of 3 failures advances to the next tier.
function getLockoutSeconds(failedCount) {
    if (failedCount <= 0) return 0;
    const tier = Math.floor(failedCount / 3) - 1;
    if (tier < 0) return 0;
    if (tier < LOCKOUT_TIERS.length) return LOCKOUT_TIERS[tier];
    return (tier - LOCKOUT_TIERS.length + 1) * YEAR_SECONDS;
}

export default {
    async fetch(request, env) {
        try {
            const url = new URL(request.url);

            if (url.pathname.startsWith('/api/')) {
                return handleApiRequest(request, env);
            }

            return handlePageRequest(request, env);
        } catch (error) {
            console.error('Worker error:', error);
            return json({ error: 'Erro interno do servidor' }, 500);
        }
    }
};

async function handlePageRequest(request, env) {
    const url = new URL(request.url);
    const session = await getSessionFromRequest(request, env);

    // Redirect authenticated users away from the login page
    if (LOGIN_PAGES.has(url.pathname) && session) {
        return Response.redirect(new URL('/', url.origin), 302);
    }

    return env.ASSETS.fetch(request);
}

async function handleApiRequest(request, env) {
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
        const effectiveRole = getEffectiveRole(session);
        let companyPlan = null;
        if (session?.company_id) {
            const co = await queryFirst(env, 'SELECT plan FROM companies WHERE id = ?', [session.company_id]);
            companyPlan = co?.plan ?? null;
        }
        return json({
            authenticated: !!session,
            userId: session?.user_id || null,
            username: session?.username || null,
            role: effectiveRole,
            isAdmin: effectiveRole === 'admin' || effectiveRole === 'gestor_admin',
            isGestorAdmin: effectiveRole === 'gestor_admin',
            companyId: session?.company_id || null,
            companyPlan
        });
    }

    const session = await getSessionFromRequest(request, env);
    if (!session) {
        return json({ error: 'Nao autorizado' }, 401);
    }

    // null for gestor_admin (sees all companies); Number for company-scoped users
    const cid = session.company_id ? Number(session.company_id) : null;

    if (pathname === '/api/users' && request.method === 'GET') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        let users;
        if (isGestorAdminSession(session)) {
            users = await queryAll(
                env,
                `SELECT users.id, users.username,
                        CASE
                            WHEN COALESCE(users.role, 'user') = 'admin' AND users.company_id IS NULL THEN 'gestor_admin'
                            ELSE COALESCE(users.role, 'user')
                        END AS role,
                        users.company_id, companies.name AS company_name
                 FROM users
                 LEFT JOIN companies ON companies.id = users.company_id
                 ORDER BY lower(users.username) ASC`
            );
        } else {
            // company admin: only users of their own company
            users = await queryAll(
                env,
                `SELECT users.id, users.username, COALESCE(users.role, 'user') AS role,
                        users.company_id, companies.name AS company_name
                 FROM users
                 LEFT JOIN companies ON companies.id = users.company_id
                 WHERE users.company_id = ?
                 ORDER BY lower(users.username) ASC`,
                [session.company_id]
            );
        }
        return json({
            users,
            canChangePasswords: isAdminSession(session),
            isGestorAdmin: isGestorAdminSession(session)
        });
    }

    if (pathname === '/api/users' && request.method === 'POST') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const body = await readJson(request);
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        const bodyRole = String(body.role || 'user').trim();
        const bodyCompanyId = body.company_id ? Number(body.company_id) : null;

        // Validate role assignment
        let role;
        if (isGestorAdminSession(session)) {
            // gestor can assign any role
            const validRoles = ['user', 'admin', 'gestor_admin'];
            role = validRoles.includes(bodyRole) ? bodyRole : 'user';
        } else {
            // company admin can only assign 'user' or 'admin' within their company
            role = bodyRole === 'admin' ? 'admin' : 'user';
        }

        // Determine company_id
        let companyId;
        if (isGestorAdminSession(session)) {
            companyId = bodyCompanyId || null;
        } else {
            // company admin always creates users in their own company
            companyId = session.company_id || null;
        }

        if (!username) return json({ error: 'Usuario e obrigatorio' }, 400);
        if (password.trim().length < 4) {
            return json({ error: 'A senha deve ter pelo menos 4 caracteres' }, 400);
        }

        const existingUser = await queryFirst(env, 'SELECT id FROM users WHERE lower(username) = lower(?)', [username]);
        if (existingUser) {
            return json({ error: 'Ja existe um usuario com esse nome' }, 409);
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        const result = await execute(
            env,
            'INSERT INTO users (username, password, role, company_id) VALUES (?, ?, ?, ?)',
            [username, passwordHash, role, companyId]
        );
        return json({ id: result.meta.last_row_id, username, role, company_id: companyId, success: true });
    }

    const userEditMatch = pathname.match(/^\/api\/users\/(\d+)$/);
    if (userEditMatch && request.method === 'PATCH') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const userId = Number(userEditMatch[1]);
        const body = await readJson(request);
        const username = String(body.username || '').trim();
        const requestedRole = String(body.role || 'user').trim();
        const requestedCompanyId = body.company_id ? Number(body.company_id) : null;

        if (!userId) return json({ error: 'Usuario invalido' }, 400);
        if (!username) return json({ error: 'Nome do usuario e obrigatorio' }, 400);

        const user = await queryFirst(env, 'SELECT id, username, COALESCE(role, "user") AS role, company_id FROM users WHERE id = ?', [userId]);
        if (!user) return json({ error: 'Usuario nao encontrado' }, 404);

        let role;
        let companyId;
        if (isGestorAdminSession(session)) {
            const validRoles = ['user', 'admin', 'gestor_admin'];
            role = validRoles.includes(requestedRole) ? requestedRole : 'user';
            companyId = role === 'gestor_admin' ? null : requestedCompanyId;
        } else {
            if (Number(user.company_id) !== Number(session.company_id)) {
                return json({ error: 'Sem permissao para alterar este usuario' }, 403);
            }
            role = requestedRole === 'admin' ? 'admin' : 'user';
            companyId = session.company_id || null;
        }

        if (role !== 'gestor_admin' && !companyId) {
            return json({ error: 'Selecione uma empresa para usuarios de empresa' }, 400);
        }

        const isSelf = Number(user.id) === Number(session.user_id);
        const roleChanged = getEffectiveRole(user) !== role;
        const companyChanged = Number(user.company_id || 0) !== Number(companyId || 0);
        if (isSelf && (roleChanged || companyChanged)) {
            return json({ error: 'Voce nao pode alterar sua propria classe ou empresa' }, 400);
        }

        const existingUser = await queryFirst(env, 'SELECT id FROM users WHERE lower(username) = lower(?) AND id <> ?', [username, userId]);
        if (existingUser) {
            return json({ error: 'Ja existe um usuario com esse nome' }, 409);
        }

        const wasGestor = getEffectiveRole(user) === 'gestor_admin';
        const willGestor = role === 'gestor_admin' || (role === 'admin' && !companyId);
        if (wasGestor && !willGestor) {
            const gestorCount = await queryFirst(
                env,
                'SELECT COUNT(*) AS total FROM users WHERE (role = "gestor_admin" OR (role = "admin" AND company_id IS NULL))'
            );
            if (Number(gestorCount?.total) <= 1) {
                return json({ error: 'Nao e possivel alterar o ultimo administrador gestor' }, 400);
            }
        }

        await execute(
            env,
            'UPDATE users SET username = ?, role = ?, company_id = ? WHERE id = ?',
            [username, role, companyId, userId]
        );

        if (!isSelf && (roleChanged || companyChanged)) {
            await execute(env, 'DELETE FROM sessions WHERE user_id = ?', [userId]);
        }

        return json({ id: userId, username, role, company_id: companyId, success: true });
    }

    const userPasswordMatch = pathname.match(/^\/api\/users\/(\d+)\/password$/);
    if (userPasswordMatch && request.method === 'PATCH') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const userId = Number(userPasswordMatch[1]);
        const body = await readJson(request);
        const password = String(body.password || '');
        if (!userId) return json({ error: 'Usuario invalido' }, 400);
        if (password.trim().length < 4) {
            return json({ error: 'A senha deve ter pelo menos 4 caracteres' }, 400);
        }

        const user = await queryFirst(env, 'SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) return json({ error: 'Usuario nao encontrado' }, 404);

        const passwordHash = bcrypt.hashSync(password, 10);
        await execute(env, 'UPDATE users SET password = ? WHERE id = ?', [passwordHash, userId]);
        await execute(env, 'DELETE FROM sessions WHERE user_id = ?', [userId]);
        return json({ success: true });
    }

    const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
    if (userMatch && request.method === 'DELETE') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const userId = Number(userMatch[1]);
        if (!userId) return json({ error: 'Usuario invalido' }, 400);

        const user = await queryFirst(env, 'SELECT id, username, COALESCE(role, "user") AS role, company_id FROM users WHERE id = ?', [userId]);
        if (!user) return json({ error: 'Usuario nao encontrado' }, 404);
        if (Number(user.id) === Number(session.user_id)) {
            return json({ error: 'Voce nao pode excluir seu proprio usuario' }, 400);
        }

        // Company admin can only delete users of their own company
        if (!isGestorAdminSession(session)) {
            if (Number(user.company_id) !== Number(session.company_id)) {
                return json({ error: 'Sem permissao para excluir este usuario' }, 403);
            }
        }

        if (getEffectiveRole(user) === 'gestor_admin' || (user.role === 'admin' && !user.company_id)) {
            const gestorCount = await queryFirst(
                env,
                'SELECT COUNT(*) AS total FROM users WHERE (role = "gestor_admin" OR (role = "admin" AND company_id IS NULL))'
            );
            if (Number(gestorCount?.total) <= 1) {
                return json({ error: 'Nao e possivel excluir o ultimo administrador gestor' }, 400);
            }
        }

        await execute(env, 'DELETE FROM sessions WHERE user_id = ?', [userId]);
        await execute(env, 'DELETE FROM users WHERE id = ?', [userId]);
        return json({ success: true });
    }

    // ── Companies ────────────────────────────────────────────────────────────

    if (pathname === '/api/companies' && request.method === 'GET') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        let companies;
        if (isGestorAdminSession(session)) {
            companies = await queryAll(env, 'SELECT * FROM companies ORDER BY is_owner DESC, lower(name) ASC');
        } else {
            // company admin: only their own company
            companies = await queryAll(
                env,
                'SELECT * FROM companies WHERE id = ?',
                [session.company_id]
            );
        }
        return json(companies);
    }

    if (pathname === '/api/companies' && request.method === 'POST') {
        if (!isGestorAdminSession(session)) {
            return json({ error: 'Apenas a empresa gestora pode criar empresas' }, 403);
        }

        const body = await readJson(request);
        const cnpj = sanitizeCnpj(String(body.cnpj || ''));
        const name = String(body.name || '').trim();

        if (!name) return json({ error: 'Nome e obrigatorio' }, 400);
        if (!cnpj || !validateCnpj(cnpj)) {
            return json({ error: 'CNPJ invalido' }, 400);
        }

        const existing = await queryFirst(env, 'SELECT id FROM companies WHERE cnpj = ?', [cnpj]);
        if (existing) return json({ error: 'Ja existe uma empresa com esse CNPJ' }, 409);

        const validPlans = ['start', 'pro', 'ultra'];
        const plan = validPlans.includes(body.plan) ? body.plan : 'pro';

        const s = v => String(v || '').trim() || null;
        try {
            const result = await execute(
                env,
                `INSERT INTO companies
                 (cnpj, name, trade_name, legal_name, state_registration, municipal_registration,
                  phone, phone2, email, website, legal_representative,
                  accounting_email, system_admin_email, company_admin_email,
                  zip_code, address, address_number, address_complement,
                  neighborhood, city, state, country,
                  is_owner, plan)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    cnpj, name, s(body.trade_name), s(body.legal_name),
                    s(body.state_registration), s(body.municipal_registration),
                    s(body.phone), s(body.phone2), s(body.email), s(body.website),
                    s(body.legal_representative),
                    s(body.accounting_email), s(body.system_admin_email), s(body.company_admin_email),
                    s(body.zip_code), s(body.address), s(body.address_number), s(body.address_complement),
                    s(body.neighborhood), s(body.city), s(body.state), s(body.country) || 'Brasil',
                    body.is_owner ? 1 : 0, plan
                ]
            );
            return json({ id: result.meta.last_row_id, success: true });
        } catch (error) {
            return handleDatabaseError(error, 'Ja existe uma empresa com esse CNPJ');
        }
    }

    const companyMatch = pathname.match(/^\/api\/companies\/(\d+)$/);

    if (companyMatch && request.method === 'GET') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const companyId = Number(companyMatch[1]);
        if (!isGestorAdminSession(session) && Number(session.company_id) !== companyId) {
            return json({ error: 'Sem permissao para ver esta empresa' }, 403);
        }

        const company = await queryFirst(env, 'SELECT * FROM companies WHERE id = ?', [companyId]);
        if (!company) return json({ error: 'Empresa nao encontrada' }, 404);
        return json(company);
    }

    if (companyMatch && request.method === 'PATCH') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        const companyId = Number(companyMatch[1]);
        if (!isGestorAdminSession(session) && Number(session.company_id) !== companyId) {
            return json({ error: 'Sem permissao para editar esta empresa' }, 403);
        }

        const company = await queryFirst(env, 'SELECT * FROM companies WHERE id = ?', [companyId]);
        if (!company) return json({ error: 'Empresa nao encontrada' }, 404);

        const body = await readJson(request);
        const name = String(body.name || company.name || '').trim();
        if (!name) return json({ error: 'Nome e obrigatorio' }, 400);

        const validPlans = ['start', 'pro', 'ultra'];
        const plan = validPlans.includes(body.plan) ? body.plan : company.plan;

        // CNPJ is immutable — skip any change if provided
        const s = v => String(v || '').trim() || null;
        await execute(
            env,
            `UPDATE companies
             SET name = ?, trade_name = ?, legal_name = ?, state_registration = ?,
                 municipal_registration = ?, phone = ?, phone2 = ?, email = ?, website = ?,
                 legal_representative = ?, accounting_email = ?,
                 system_admin_email = ?, company_admin_email = ?,
                 zip_code = ?, address = ?, address_number = ?, address_complement = ?,
                 neighborhood = ?, city = ?, state = ?, country = ?, plan = ?
             WHERE id = ?`,
            [
                name, s(body.trade_name), s(body.legal_name), s(body.state_registration),
                s(body.municipal_registration), s(body.phone), s(body.phone2),
                s(body.email), s(body.website), s(body.legal_representative),
                s(body.accounting_email), s(body.system_admin_email), s(body.company_admin_email),
                s(body.zip_code), s(body.address), s(body.address_number), s(body.address_complement),
                s(body.neighborhood), s(body.city), s(body.state), s(body.country) || 'Brasil',
                plan,
                companyId
            ]
        );
        return json({ success: true });
    }

    if (companyMatch && request.method === 'DELETE') {
        if (!isGestorAdminSession(session)) {
            return json({ error: 'Apenas a empresa gestora pode excluir empresas' }, 403);
        }

        const companyId = Number(companyMatch[1]);
        const company = await queryFirst(env, 'SELECT * FROM companies WHERE id = ?', [companyId]);
        if (!company) return json({ error: 'Empresa nao encontrada' }, 404);
        if (company.is_owner) {
            return json({ error: 'Nao e possivel excluir a empresa gestora' }, 400);
        }

        // Unlink users from this company before deleting
        await execute(env, 'UPDATE users SET company_id = NULL WHERE company_id = ?', [companyId]);
        await execute(env, 'DELETE FROM companies WHERE id = ?', [companyId]);
        return json({ success: true });
    }

    // ── End Companies ────────────────────────────────────────────────────────

    if (pathname === '/api/notification-settings' && request.method === 'GET') {
        await ensureNotificationTables(env);
        const settings = await getNotificationSettingsForCompany(env, getNotificationCompanyId(session));
        return json({ settings });
    }

    if (pathname === '/api/notification-settings' && request.method === 'PUT') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }

        await ensureNotificationTables(env);
        const body = await readJson(request);
        const settings = sanitizeNotificationSettings(body);
        await execute(
            env,
            `INSERT INTO notification_settings (company_id, settings_json, updated_by_username, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(company_id) DO UPDATE SET
                settings_json = excluded.settings_json,
                updated_by_username = excluded.updated_by_username,
                updated_at = CURRENT_TIMESTAMP`,
            [getNotificationCompanyId(session), JSON.stringify(settings), session.username || null]
        );
        return json({ settings, success: true });
    }

    if (pathname === '/api/notification-dismissals' && request.method === 'GET') {
        await ensureNotificationTables(env);
        const rows = await queryAll(
            env,
            'SELECT notification_id FROM notification_dismissals WHERE company_id = ? ORDER BY dismissed_at DESC',
            [getNotificationCompanyId(session)]
        );
        return json({ ids: rows.map((row) => row.notification_id) });
    }

    if (pathname === '/api/notification-dismissals' && request.method === 'POST') {
        await ensureNotificationTables(env);
        const settings = await getNotificationSettingsForCompany(env, getNotificationCompanyId(session));
        if (!isAdminSession(session) && settings.allowUserDismiss === false) {
            return json({ error: 'O administrador bloqueou a remocao de notificacoes' }, 403);
        }

        const body = await readJson(request);
        const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id).trim()).filter(Boolean) : [];
        for (const id of [...new Set(ids)].slice(0, 100)) {
            await execute(
                env,
                `INSERT OR IGNORE INTO notification_dismissals
                 (company_id, notification_id, dismissed_by_username, dismissed_at)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                [getNotificationCompanyId(session), id, session.username || null]
            );
        }
        return json({ success: true });
    }

    // ── Company appearance (theme / logo / favicon) ───────────────────────────
    if (pathname === '/api/appearance' && request.method === 'GET') {
        const url = new URL(request.url);
        let companyId = cid;
        if (companyId === null) {
            // gestor_admin may query any company's appearance via ?company_id=X
            const qcid = url.searchParams.get('company_id');
            companyId = qcid ? Number(qcid) : null;
        }
        if (!companyId) return json({ appearance: null });
        await ensureAppearanceTable(env);
        const row = await queryFirst(
            env,
            'SELECT theme_json, logo_data, favicon_data FROM company_appearance WHERE company_id = ?',
            [companyId]
        );
        return json({ appearance: row || null });
    }

    if (pathname === '/api/appearance' && request.method === 'PUT') {
        if (!isAdminSession(session)) {
            return json({ error: 'Acesso restrito a administradores' }, 403);
        }
        const body = await readJson(request);
        // admins use their own company_id; gestor_admin must pass company_id in body
        const companyId = cid !== null ? cid : (body.company_id ? Number(body.company_id) : null);
        if (!companyId) return json({ error: 'Empresa nao identificada' }, 400);

        // Determine which fields to update (key present = update, absent = leave unchanged)
        const MAX_B64 = 1_400_000; // ~1.4 MB base64 ≈ ~1 MB raw — safe for D1 row limit
        const allowedFields = { theme: 'theme_json', logo: 'logo_data', favicon: 'favicon_data' };
        const setClauses = [];
        const values = [];
        for (const [key, col] of Object.entries(allowedFields)) {
            if (!(key in body)) continue;
            if (key === 'theme') {
                const raw = body.theme ? JSON.stringify(body.theme) : null;
                setClauses.push(`${col} = ?`);
                values.push(raw);
            } else {
                const val = body[key];
                if (val !== null && typeof val === 'string' && val.length > MAX_B64) {
                    return json({ error: `${key} excede o tamanho maximo permitido` }, 413);
                }
                setClauses.push(`${col} = ?`);
                values.push(typeof val === 'string' ? val : null);
            }
        }

        await ensureAppearanceTable(env);
        // Ensure row exists first, then update only the supplied fields
        await execute(
            env,
            'INSERT OR IGNORE INTO company_appearance (company_id, updated_by, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            [companyId, session.username || null]
        );
        if (setClauses.length > 0) {
            await execute(
                env,
                `UPDATE company_appearance SET ${setClauses.join(', ')}, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE company_id = ?`,
                [...values, session.username || null, companyId]
            );
        }
        return json({ success: true });
    }

    if (pathname === '/api/events' && request.method === 'GET') {
        const rows = await getEventsByCompletion(env, 'event', false, cid);
        return json(rows);
    }

    if (pathname === '/api/events' && request.method === 'POST') {
        const body = await readJson(request);
        const name = String(body.name || '').trim();
        const date = String(body.date || '').trim();

        if (!name || !date) {
            return json({ error: 'Nome e data sao obrigatorios' }, 400);
        }

        const result = await execute(
            env,
            "INSERT INTO events (name, date, created_by_username, event_type, company_id) VALUES (?, ?, ?, 'event', ?)",
            [name, date, session.username || null, cid]
        );
        return json({ id: result.meta.last_row_id, success: true });
    }

    if (pathname === '/api/rental-events' && request.method === 'GET') {
        const rows = await getEventsByCompletion(env, 'rental', false, cid);
        return json(rows);
    }

    if (pathname === '/api/history-events' && request.method === 'GET') {
        const [events, rentals] = await Promise.all([
            getEventsByCompletion(env, 'event', true, cid),
            getEventsByCompletion(env, 'rental', true, cid)
        ]);
        return json({ events, rentals });
    }

    if (pathname === '/api/rental-return-alerts' && request.method === 'GET') {
        const today = String(url.searchParams.get('today') || new Date().toISOString().slice(0, 10)).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
            return json({ error: 'Data invalida' }, 400);
        }

        const alerts = await getRentalReturnAlerts(env, today, cid);
        return json(alerts);
    }

    if (pathname === '/api/rental-events' && request.method === 'POST') {
        const body = await readJson(request);
        const name = String(body.name || '').trim();
        const withdrawalDate = String(body.withdrawalDate || '').trim();
        const returnDate = String(body.returnDate || '').trim();

        if (!name || !withdrawalDate || !returnDate) {
            return json({ error: 'Nome, data de retirada e data de devolucao sao obrigatorios' }, 400);
        }

        if (returnDate < withdrawalDate) {
            return json({ error: 'A data de devolucao nao pode ser anterior a data de retirada' }, 400);
        }

        const result = await execute(
            env,
            `INSERT INTO events (name, date, created_by_username, event_type, withdrawal_date, return_date, company_id)
             VALUES (?, ?, ?, 'rental', ?, ?, ?)`,
            [name, withdrawalDate, session.username || null, withdrawalDate, returnDate, cid]
        );
        return json({ id: result.meta.last_row_id, success: true });
    }

    const rentalEventMatch = pathname.match(/^\/api\/rental-events\/(\d+)$/);
    if (rentalEventMatch && request.method === 'GET') {
        const cidWhere = cid !== null ? 'AND company_id = ?' : '';
        const event = await queryFirst(
            env,
            `SELECT * FROM events WHERE id = ? AND COALESCE(event_type, 'event') = 'rental' ${cidWhere}`,
            cid !== null ? [Number(rentalEventMatch[1]), cid] : [Number(rentalEventMatch[1])]
        );
        if (!event) return json({ error: 'Locação nao encontrada' }, 404);
        return json(event);
    }

    if (rentalEventMatch && request.method === 'PATCH') {
        const body = await readJson(request);
        const withdrawalDate = String(body.withdrawalDate || '').trim();
        const returnDate = String(body.returnDate || '').trim();

        if (!withdrawalDate || !returnDate) {
            return json({ error: 'Data de retirada e data de devolucao sao obrigatorias' }, 400);
        }

        if (returnDate < withdrawalDate) {
            return json({ error: 'A data de devolucao nao pode ser anterior a data de retirada' }, 400);
        }

        const eventId = Number(rentalEventMatch[1]);
        const rentalCidWhere = cid !== null ? 'AND company_id = ?' : '';
        const event = await queryFirst(
            env,
            `SELECT id FROM events WHERE id = ? AND COALESCE(event_type, 'event') = 'rental' ${rentalCidWhere}`,
            cid !== null ? [eventId, cid] : [eventId]
        );
        if (!event) return json({ error: 'Locacao nao encontrada' }, 404);

        await execute(
            env,
            'UPDATE events SET date = ?, withdrawal_date = ?, return_date = ? WHERE id = ?',
            [withdrawalDate, withdrawalDate, returnDate, eventId]
        );
        return json({ success: true });
    }

    if (rentalEventMatch && request.method === 'DELETE') {
        const body = await readJson(request);
        const password = String(body.password || '').trim();

        if (!(await verifyDeletePassword(password, env))) {
            return json({ message: 'Senha incorreta' }, 403);
        }

        const eventId = Number(rentalEventMatch[1]);
        const rentalCidWhere = cid !== null ? 'AND company_id = ?' : '';
        const event = await queryFirst(
            env,
            `SELECT id FROM events WHERE id = ? AND COALESCE(event_type, 'event') = 'rental' ${rentalCidWhere}`,
            cid !== null ? [eventId, cid] : [eventId]
        );
        if (!event) return json({ error: 'Locação nao encontrada' }, 404);

        await deleteEventRecords(env, eventId);
        return json({ success: true });
    }

    const eventMatch = pathname.match(/^\/api\/events\/(\d+)$/);
    if (eventMatch && request.method === 'GET') {
        const cidWhere = cid !== null ? 'AND company_id = ?' : '';
        const event = await queryFirst(
            env,
            `SELECT * FROM events WHERE id = ? ${cidWhere}`,
            cid !== null ? [Number(eventMatch[1]), cid] : [Number(eventMatch[1])]
        );
        if (!event) return json({ error: 'Evento nao encontrado' }, 404);
        return json(event);
    }

    const historyMatch = pathname.match(/^\/api\/events\/(\d+)\/history$/);
    if (historyMatch && request.method === 'GET') {
        await ensureSaidaHiddenItemsTable(env);
        const rows = await queryAll(
            env,
            `SELECT
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
               AND NOT EXISTS (
                    SELECT 1
                    FROM event_saida_hidden_items hidden
                    WHERE hidden.event_id = ee.event_id
                      AND hidden.item_type = 'equipment'
                      AND hidden.item_id = ee.equipment_id
               )
             ORDER BY datetime(ee.created_at) ASC, ee.id ASC`,
            [Number(historyMatch[1])]
        );
        return json(rows);
    }

    const cableHistoryMatch = pathname.match(/^\/api\/events\/(\d+)\/cable-history$/);
    if (cableHistoryMatch && request.method === 'GET') {
        await ensureSaidaHiddenItemsTable(env);
        const rows = await queryAll(
            env,
            `SELECT
                cem.cable_id,
                c.name,
                SUM(cem.quantity) AS quantity
             FROM cable_event_movements cem
             INNER JOIN cables c ON c.id = cem.cable_id
             WHERE cem.event_id = ?
               AND cem.action_type = 'saida'
               AND NOT EXISTS (
                    SELECT 1
                    FROM event_saida_hidden_items hidden
                    WHERE hidden.event_id = cem.event_id
                      AND hidden.item_type = 'cable'
                      AND hidden.item_id = cem.cable_id
               )
             GROUP BY cem.cable_id, c.name
             ORDER BY lower(c.name) ASC, cem.cable_id ASC`,
            [Number(cableHistoryMatch[1])]
        );
        return json(rows);
    }

    const cableSummaryMatch = pathname.match(/^\/api\/events\/(\d+)\/cable-summary$/);
    if (cableSummaryMatch && request.method === 'GET') {
        await ensureSaidaHiddenItemsTable(env);
        const rows = await queryAll(
            env,
            `SELECT
                cem.cable_id,
                c.name,
                SUM(CASE WHEN cem.action_type = 'saida' THEN cem.quantity ELSE 0 END) AS saida,
                SUM(CASE WHEN cem.action_type = 'entrada' THEN cem.quantity ELSE 0 END) AS entrada,
                SUM(CASE WHEN cem.action_type = 'saida' THEN cem.quantity ELSE -cem.quantity END) AS final
             FROM cable_event_movements cem
             INNER JOIN cables c ON c.id = cem.cable_id
             WHERE cem.event_id = ?
               AND NOT EXISTS (
                    SELECT 1
                    FROM event_saida_hidden_items hidden
                    WHERE hidden.event_id = cem.event_id
                      AND hidden.item_type = 'cable'
                      AND hidden.item_id = cem.cable_id
               )
             GROUP BY cem.cable_id, c.name
             ORDER BY lower(c.name) ASC, cem.cable_id ASC`,
            [Number(cableSummaryMatch[1])]
        );
        return json(rows);
    }

    const otherItemSummaryMatch = pathname.match(/^\/api\/events\/(\d+)\/other-item-summary$/);
    if (otherItemSummaryMatch && request.method === 'GET') {
        await ensureSaidaHiddenItemsTable(env);
        const rows = await queryAll(
            env,
            `SELECT
                oiem.item_id,
                oi.name,
                SUM(CASE WHEN oiem.action_type = 'saida' THEN oiem.quantity ELSE 0 END) AS saida,
                SUM(CASE WHEN oiem.action_type = 'entrada' THEN oiem.quantity ELSE 0 END) AS entrada,
                SUM(CASE WHEN oiem.action_type = 'saida' THEN oiem.quantity ELSE -oiem.quantity END) AS final
             FROM other_item_event_movements oiem
             INNER JOIN other_items oi ON oi.id = oiem.item_id
             WHERE oiem.event_id = ?
               AND NOT EXISTS (
                    SELECT 1
                    FROM event_saida_hidden_items hidden
                    WHERE hidden.event_id = oiem.event_id
                      AND hidden.item_type = 'other'
                      AND hidden.item_id = oiem.item_id
               )
             GROUP BY oiem.item_id, oi.name
             ORDER BY lower(oi.name) ASC, oiem.item_id ASC`,
            [Number(otherItemSummaryMatch[1])]
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
            return json({ message: 'Dados invalidos para excluir da saida' }, 400);
        }

        await ensureSaidaHiddenItemsTable(env);
        await execute(
            env,
            `INSERT OR IGNORE INTO event_saida_hidden_items (event_id, item_type, item_id)
             VALUES (?, ?, ?)`,
            [eventId, itemType, itemId]
        );
        return json({ success: true });
    }

    if (eventMatch && request.method === 'DELETE') {
        const eventId = Number(eventMatch[1]);
        const eventCidWhere = cid !== null ? 'AND company_id = ?' : '';
        const eventExists = await queryFirst(
            env,
            `SELECT id FROM events WHERE id = ? ${eventCidWhere}`,
            cid !== null ? [eventId, cid] : [eventId]
        );
        if (!eventExists) return json({ error: 'Evento nao encontrado' }, 404);
        await deleteEventRecords(env, eventId);
        return json({ success: true });
    }

    if (pathname === '/api/equipments' && request.method === 'GET') {
        const search = String(url.searchParams.get('search') || '').trim();
        const cidWhere = cid !== null ? 'AND equipments.company_id = ?' : '';
        const rows = await queryAll(
            env,
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
                            AND (
                                datetime(ee2.created_at) > datetime(ee.created_at)
                                OR (
                                    datetime(ee2.created_at) = datetime(ee.created_at)
                                    AND ee2.id > ee.id
                                )
                            )
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
             WHERE (name LIKE ? OR barcode LIKE ? OR category LIKE ?)
               ${cidWhere}
             ORDER BY category ASC, name ASC`,
            cid !== null
                ? [`%${search}%`, `%${search}%`, `%${search}%`, cid]
                : [`%${search}%`, `%${search}%`, `%${search}%`]
        );
        return json(rows);
    }

    if (pathname === '/api/equipments' && request.method === 'POST') {
        const body = await readJson(request);
        const name = String(body.name || '').trim();
        const barcode = String(body.barcode || '').trim();
        const category = String(body.category || 'Outros').trim() || 'Outros';

        if (!name || !barcode) {
            return json({ error: 'Nome e codigo de barras sao obrigatorios' }, 400);
        }

        try {
            const result = await execute(
                env,
                'INSERT INTO equipments (name, barcode, current_status, category, company_id) VALUES (?, ?, ?, ?, ?)',
                [name, barcode, 'Disponivel', category, cid]
            );
            return json({ id: result.meta.last_row_id, success: true });
        } catch (error) {
            return handleDatabaseError(error, 'Ja existe um equipamento com esse codigo de barras');
        }
    }

    const equipmentStatusMatch = pathname.match(/^\/api\/equipments\/(\d+)\/status$/);
    if (equipmentStatusMatch && request.method === 'PATCH') {
        const equipmentId = Number(equipmentStatusMatch[1]);
        const body = await readJson(request);
        const status = String(body.status || '').trim();

        if (!equipmentId || !status) {
            return json({ message: 'id e status sao obrigatorios' }, 400);
        }

        const equipment = await queryFirst(env, 'SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return json({ message: 'Equipamento nao encontrado' }, 404);
        if (cid !== null && Number(equipment.company_id) !== cid) {
            return json({ error: 'Acesso negado' }, 403);
        }

        await execute(env, 'UPDATE equipments SET current_status = ? WHERE id = ?', [status, equipmentId]);
        return json({ success: true });
    }

    if (pathname === '/api/cables' && request.method === 'GET') {
        const search = String(url.searchParams.get('search') || '').trim();
        const cidWhere = cid !== null ? 'AND cables.company_id = ?' : '';
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
                ) AS maintenance_description
             FROM cables
             WHERE (name LIKE ? OR category LIKE ?)
               ${cidWhere}
             ORDER BY category ASC, name ASC`,
            cid !== null
                ? [`%${search}%`, `%${search}%`, cid]
                : [`%${search}%`, `%${search}%`]
        );
        return json(rows);
    }

    if (pathname === '/api/cables' && request.method === 'POST') {
        const body = await readJson(request);
        const name = String(body.name || '').trim();
        const quantity = Number(body.quantity);
        const category = String(body.category || 'Outros').trim() || 'Outros';

        if (!name) return json({ error: 'Nome do cabo e obrigatorio' }, 400);
        if (!Number.isInteger(quantity) || quantity < 0) {
            return json({ error: 'Quantidade invalida' }, 400);
        }

        try {
            const result = await execute(
                env,
                `INSERT INTO cables (name, quantity, available_quantity, category, company_id, updated_at)
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [name, quantity, quantity, category, cid]
            );
            return json({ id: result.meta.last_row_id, success: true });
        } catch (error) {
            return handleDatabaseError(error, 'Ja existe um cabo com esse nome');
        }
    }

    const cableMatch = pathname.match(/^\/api\/cables\/(\d+)$/);
    if (cableMatch && request.method === 'PATCH') {
        const cableId = Number(cableMatch[1]);
        const body = await readJson(request);
        const quantity = Number(body.quantity);

        if (!cableId) return json({ message: 'id do cabo e obrigatorio' }, 400);
        if (!Number.isInteger(quantity) || quantity < 0) {
            return json({ message: 'Quantidade invalida' }, 400);
        }

        const cable = await queryFirst(env, 'SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) return json({ message: 'Cabo nao encontrado' }, 404);
        if (cid !== null && Number(cable.company_id) !== cid) {
            return json({ error: 'Acesso negado' }, 403);
        }

        await execute(
            env,
            `UPDATE cables
             SET quantity = ?, available_quantity = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [quantity, quantity, cableId]
        );

        return json({ success: true });
    }

    if (cableMatch && request.method === 'DELETE') {
        const cableId = Number(cableMatch[1]);
        const body = await readJson(request);
        const password = String(body.password || '').trim();

        if (!cableId) return json({ message: 'id do cabo e obrigatorio' }, 400);
        if (!(await verifyDeletePassword(password, env))) return json({ message: 'Senha incorreta' }, 403);

        const cable = await queryFirst(env, 'SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) return json({ message: 'Cabo nao encontrado' }, 404);
        if (cid !== null && Number(cable.company_id) !== cid) {
            return json({ error: 'Acesso negado' }, 403);
        }

        await execute(env, 'DELETE FROM cable_event_movements WHERE cable_id = ?', [cableId]);
        await execute(env, 'DELETE FROM cable_maintenances WHERE cable_id = ?', [cableId]);
        await execute(env, 'DELETE FROM cables WHERE id = ?', [cableId]);
        return json({ success: true });
    }

    if (pathname === '/api/other-items' && request.method === 'GET') {
        const search = String(url.searchParams.get('search') || '').trim();
        const cidWhere = cid !== null ? 'AND company_id = ?' : '';
        const rows = await queryAll(
            env,
            `SELECT *
             FROM other_items
             WHERE (name LIKE ?)
               ${cidWhere}
             ORDER BY name ASC`,
            cid !== null ? [`%${search}%`, cid] : [`%${search}%`]
        );
        return json(rows);
    }

    if (pathname === '/api/other-items' && request.method === 'POST') {
        const body = await readJson(request);
        const name = String(body.name || '').trim();
        const quantity = Number(body.quantity);

        if (!name) return json({ error: 'Nome do item e obrigatorio' }, 400);
        if (!Number.isInteger(quantity) || quantity < 0) {
            return json({ error: 'Quantidade invalida' }, 400);
        }

        try {
            const result = await execute(
                env,
                `INSERT INTO other_items (name, quantity, available_quantity, company_id, updated_at)
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [name, quantity, quantity, cid]
            );
            return json({ id: result.meta.last_row_id, success: true });
        } catch (error) {
            return handleDatabaseError(error, 'Ja existe um item com esse nome');
        }
    }

    const otherItemMatch = pathname.match(/^\/api\/other-items\/(\d+)$/);
    if (otherItemMatch && request.method === 'PATCH') {
        const itemId = Number(otherItemMatch[1]);
        const body = await readJson(request);
        const quantity = Number(body.quantity);

        if (!itemId) return json({ message: 'id do item e obrigatorio' }, 400);
        if (!Number.isInteger(quantity) || quantity < 0) {
            return json({ message: 'Quantidade invalida' }, 400);
        }

        const item = await queryFirst(env, 'SELECT * FROM other_items WHERE id = ?', [itemId]);
        if (!item) return json({ message: 'Item nao encontrado' }, 404);
        if (cid !== null && Number(item.company_id) !== cid) {
            return json({ error: 'Acesso negado' }, 403);
        }

        await execute(
            env,
            `UPDATE other_items
             SET quantity = ?, available_quantity = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [quantity, quantity, itemId]
        );

        return json({ success: true });
    }

    if (otherItemMatch && request.method === 'DELETE') {
        const itemId = Number(otherItemMatch[1]);
        const body = await readJson(request);
        const password = String(body.password || '').trim();

        if (!itemId) return json({ message: 'id do item e obrigatorio' }, 400);
        if (!(await verifyDeletePassword(password, env))) return json({ message: 'Senha incorreta' }, 403);

        const item = await queryFirst(env, 'SELECT * FROM other_items WHERE id = ?', [itemId]);
        if (!item) return json({ message: 'Item nao encontrado' }, 404);
        if (cid !== null && Number(item.company_id) !== cid) {
            return json({ error: 'Acesso negado' }, 403);
        }

        await execute(env, 'DELETE FROM other_item_event_movements WHERE item_id = ?', [itemId]);
        await execute(env, 'DELETE FROM other_items WHERE id = ?', [itemId]);
        return json({ success: true });
    }

    const equipmentMatch = pathname.match(/^\/api\/equipments\/(\d+)$/);
    if (equipmentMatch && request.method === 'DELETE') {
        const equipmentId = Number(equipmentMatch[1]);
        const body = await readJson(request);
        const password = String(body.password || '').trim();

        if (!equipmentId) return json({ message: 'id do equipamento e obrigatorio' }, 400);
        if (!(await verifyDeletePassword(password, env))) return json({ message: 'Senha incorreta' }, 403);

        const equipment = await queryFirst(env, 'SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return json({ message: 'Equipamento nao encontrado' }, 404);
        if (cid !== null && Number(equipment.company_id) !== cid) {
            return json({ error: 'Acesso negado' }, 403);
        }

        await execute(env, 'DELETE FROM equipment_events WHERE equipment_id = ?', [equipmentId]);
        await execute(env, 'DELETE FROM maintenances WHERE equipment_id = ?', [equipmentId]);
        await execute(env, 'DELETE FROM equipments WHERE id = ?', [equipmentId]);
        return json({ success: true });
    }

    const movementMatch = pathname.match(/^\/api\/equipment-events\/(saida|entrada)$/);
    if (movementMatch && request.method === 'POST') {
        const type = movementMatch[1];
        const body = await readJson(request);
        const equipmentId = Number(body.equipmentId);
        const barcode = String(body.barcode || '').trim();
        const eventId = Number(body.eventId);
        const performedByUsername = session.username || null;

        if ((!equipmentId && !barcode) || !eventId) {
            return json({ message: 'equipmentId ou codigo de barras e eventId sao obrigatorios' }, 400);
        }

        const equipment = equipmentId
            ? await queryFirst(env, 'SELECT * FROM equipments WHERE id = ?', [equipmentId])
            : await queryFirst(env, 'SELECT * FROM equipments WHERE barcode = ?', [barcode]);
        const event = await queryFirst(env, 'SELECT * FROM events WHERE id = ?', [eventId]);
        const resolvedEquipmentId = Number(equipment?.id);

        if (!equipment) return json({ message: 'Equipamento nao encontrado' }, 404);
        if (!event) return json({ message: 'Evento nao encontrado' }, 404);
        if (cid !== null && Number(equipment.company_id) !== cid) {
            return json({ message: 'Equipamento nao pertence a sua empresa' }, 403);
        }
        if (cid !== null && Number(event.company_id) !== cid) {
            return json({ message: 'Evento nao pertence a sua empresa' }, 403);
        }

        if (type === 'saida') {
            if (!isAvailableStatus(equipment.current_status)) {
                return json({ message: 'Equipamento ja esta indisponivel' }, 409);
            }

            await execute(
                env,
                "INSERT INTO equipment_events (equipment_id, event_id, action_type, performed_by_username) VALUES (?, ?, 'saida', ?)",
                [resolvedEquipmentId, eventId, performedByUsername]
            );
            await execute(env, "UPDATE equipments SET current_status = 'Indisponivel' WHERE id = ?", [resolvedEquipmentId]);
            return json({ success: true, equipment });
        }

        const lastMovement = await queryFirst(
            env,
            `SELECT action_type
             FROM equipment_events
             WHERE equipment_id = ? AND event_id = ?
             ORDER BY datetime(created_at) DESC, id DESC
             LIMIT 1`,
            [resolvedEquipmentId, eventId]
        );

        if (!lastMovement || lastMovement.action_type !== 'saida') {
            return json({ message: 'Este equipamento nao possui saida pendente neste evento' }, 409);
        }

        await execute(
            env,
            "INSERT INTO equipment_events (equipment_id, event_id, action_type, performed_by_username) VALUES (?, ?, 'entrada', ?)",
            [resolvedEquipmentId, eventId, performedByUsername]
        );
        await execute(env, "UPDATE equipments SET current_status = 'Disponivel' WHERE id = ?", [resolvedEquipmentId]);
        return json({ success: true, equipment });
    }

    const cableMovementMatch = pathname.match(/^\/api\/cable-events\/(saida|entrada)$/);
    if (cableMovementMatch && request.method === 'POST') {
        const type = cableMovementMatch[1];
        const body = await readJson(request);
        const cableId = Number(body.cableId);
        const eventId = Number(body.eventId);
        const quantity = Number(body.quantity);

        if (!cableId || !eventId || !Number.isInteger(quantity) || quantity <= 0) {
            return json({ message: 'cableId, eventId e quantity sao obrigatorios' }, 400);
        }

        const cable = await queryFirst(env, 'SELECT * FROM cables WHERE id = ?', [cableId]);
        const event = await queryFirst(env, 'SELECT * FROM events WHERE id = ?', [eventId]);

        if (!cable) return json({ message: 'Cabo nao encontrado' }, 404);
        if (!event) return json({ message: 'Evento nao encontrado' }, 404);
        if (cid !== null && Number(cable.company_id) !== cid) {
            return json({ message: 'Cabo nao pertence a sua empresa' }, 403);
        }
        if (cid !== null && Number(event.company_id) !== cid) {
            return json({ message: 'Evento nao pertence a sua empresa' }, 403);
        }

        if (type === 'saida') {
            if (Number(cable.available_quantity) < quantity) {
                return json({ message: 'Quantidade insuficiente em estoque' }, 409);
            }

            await execute(
                env,
                "INSERT INTO cable_event_movements (cable_id, event_id, action_type, quantity) VALUES (?, ?, 'saida', ?)",
                [cableId, eventId, quantity]
            );
            await execute(
                env,
                'UPDATE cables SET available_quantity = available_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [quantity, cableId]
            );
            return json({ success: true });
        }

        const pendingMovement = await queryFirst(
            env,
            `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0) AS quantity
             FROM cable_event_movements
             WHERE cable_id = ? AND event_id = ?`,
            [cableId, eventId]
        );

        if (!pendingMovement || Number(pendingMovement.quantity) < quantity) {
            return json({ message: 'Este cabo nao possui saida pendente suficiente neste evento' }, 409);
        }

        await execute(
            env,
            "INSERT INTO cable_event_movements (cable_id, event_id, action_type, quantity) VALUES (?, ?, 'entrada', ?)",
            [cableId, eventId, quantity]
        );
        await execute(
            env,
            'UPDATE cables SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [quantity, cableId]
        );
        return json({ success: true });
    }

    const otherItemMovementMatch = pathname.match(/^\/api\/other-item-events\/(saida|entrada)$/);
    if (otherItemMovementMatch && request.method === 'POST') {
        const type = otherItemMovementMatch[1];
        const body = await readJson(request);
        const itemId = Number(body.itemId);
        const eventId = Number(body.eventId);
        const quantity = Number(body.quantity);

        if (!itemId || !eventId || !Number.isInteger(quantity) || quantity <= 0) {
            return json({ message: 'itemId, eventId e quantity sao obrigatorios' }, 400);
        }

        const item = await queryFirst(env, 'SELECT * FROM other_items WHERE id = ?', [itemId]);
        const event = await queryFirst(env, 'SELECT * FROM events WHERE id = ?', [eventId]);

        if (!item) return json({ message: 'Item nao encontrado' }, 404);
        if (!event) return json({ message: 'Evento nao encontrado' }, 404);
        if (cid !== null && Number(item.company_id) !== cid) {
            return json({ message: 'Item nao pertence a sua empresa' }, 403);
        }
        if (cid !== null && Number(event.company_id) !== cid) {
            return json({ message: 'Evento nao pertence a sua empresa' }, 403);
        }

        if (type === 'saida') {
            if (Number(item.available_quantity) < quantity) {
                return json({ message: 'Quantidade insuficiente em estoque' }, 409);
            }

            await execute(
                env,
                "INSERT INTO other_item_event_movements (item_id, event_id, action_type, quantity) VALUES (?, ?, 'saida', ?)",
                [itemId, eventId, quantity]
            );
            await execute(
                env,
                'UPDATE other_items SET available_quantity = available_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [quantity, itemId]
            );
            return json({ success: true });
        }

        const pendingMovement = await queryFirst(
            env,
            `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0) AS quantity
             FROM other_item_event_movements
             WHERE item_id = ? AND event_id = ?`,
            [itemId, eventId]
        );

        if (!pendingMovement || Number(pendingMovement.quantity) < quantity) {
            return json({ message: 'Este item nao possui saida pendente suficiente neste evento' }, 409);
        }

        await execute(
            env,
            "INSERT INTO other_item_event_movements (item_id, event_id, action_type, quantity) VALUES (?, ?, 'entrada', ?)",
            [itemId, eventId, quantity]
        );
        await execute(
            env,
            'UPDATE other_items SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [quantity, itemId]
        );
        return json({ success: true });
    }

    if (pathname === '/api/maintenances' && request.method === 'POST') {
        const body = await readJson(request);
        const equipmentId = Number(body.equipmentId);
        const description = String(body.description || '').trim();

        if (!equipmentId || !description) {
            return json({ message: 'equipmentId e description sao obrigatorios' }, 400);
        }

        const equipment = await queryFirst(env, 'SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return json({ message: 'Equipamento nao encontrado' }, 404);
        if (cid !== null && Number(equipment.company_id) !== cid) {
            return json({ error: 'Acesso negado' }, 403);
        }

        await execute(
            env,
            'INSERT INTO maintenances (equipment_id, description) VALUES (?, ?)',
            [equipmentId, description]
        );
        await execute(env, "UPDATE equipments SET current_status = 'Em manutencao' WHERE id = ?", [equipmentId]);
        return json({ success: true });
    }

    if (pathname === '/api/cable-maintenances' && request.method === 'POST') {
        const body = await readJson(request);
        const cableId = Number(body.cableId);
        const description = String(body.description || '').trim();

        if (!cableId || !description) {
            return json({ message: 'cableId e description sao obrigatorios' }, 400);
        }

        const cable = await queryFirst(env, 'SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) return json({ message: 'Cabo nao encontrado' }, 404);
        if (cid !== null && Number(cable.company_id) !== cid) {
            return json({ error: 'Acesso negado' }, 403);
        }

        await execute(
            env,
            'INSERT INTO cable_maintenances (cable_id, description) VALUES (?, ?)',
            [cableId, description]
        );
        return json({ success: true });
    }

    const maintenanceReadyMatch = pathname.match(/^\/api\/maintenances\/(\d+)\/ready$/);
    if (maintenanceReadyMatch && request.method === 'PATCH') {
        const equipmentId = Number(maintenanceReadyMatch[1]);
        if (!equipmentId) return json({ message: 'equipmentId e obrigatorio' }, 400);

        const equipment = await queryFirst(env, 'SELECT * FROM equipments WHERE id = ?', [equipmentId]);
        if (!equipment) return json({ message: 'Equipamento nao encontrado' }, 404);
        if (cid !== null && Number(equipment.company_id) !== cid) {
            return json({ error: 'Acesso negado' }, 403);
        }

        await execute(
            env,
            `UPDATE maintenances
             SET resolved_at = CURRENT_TIMESTAMP
             WHERE equipment_id = ?
               AND resolved_at IS NULL`,
            [equipmentId]
        );
        await execute(env, "UPDATE equipments SET current_status = 'Disponivel' WHERE id = ?", [equipmentId]);
        return json({ success: true });
    }

    const cableMaintenanceReadyMatch = pathname.match(/^\/api\/cable-maintenances\/(\d+)\/ready$/);
    if (cableMaintenanceReadyMatch && request.method === 'PATCH') {
        const cableId = Number(cableMaintenanceReadyMatch[1]);
        if (!cableId) return json({ message: 'cableId e obrigatorio' }, 400);

        const cable = await queryFirst(env, 'SELECT * FROM cables WHERE id = ?', [cableId]);
        if (!cable) return json({ message: 'Cabo nao encontrado' }, 404);
        if (cid !== null && Number(cable.company_id) !== cid) {
            return json({ error: 'Acesso negado' }, 403);
        }

        await execute(
            env,
            `UPDATE cable_maintenances
             SET resolved_at = CURRENT_TIMESTAMP
             WHERE cable_id = ?
               AND resolved_at IS NULL`,
            [cableId]
        );
        return json({ success: true });
    }

    // ── AI Chat ──────────────────────────────────────────────────────────────

    if (pathname === '/api/chat' && request.method === 'POST') {
        if (!env.AI) {
            return json({ error: 'Assistente IA nao disponivel neste ambiente' }, 503);
        }

        const body = await readJson(request);
        const message = String(body.message || '').trim().slice(0, 1200);
        const rawHistory = Array.isArray(body.history) ? body.history : [];

        if (!message) return json({ error: 'Mensagem obrigatoria' }, 400);

        // Keep last 20 messages and sanitise roles/content
        const history = rawHistory.slice(-20).map(h => ({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: String(h.content || '').slice(0, 600),
        }));

        const messages = [
            { role: 'system', content: EQUIPTRACK_KNOWLEDGE_BASE + (await buildChatDbContext(env, session)) },
            ...history,
            { role: 'user', content: message },
        ];

        try {
            const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages,
                max_tokens: 800,
            });
            const reply = (result?.response || '').trim() || 'Nao consegui processar sua pergunta no momento.';
            return json({ reply });
        } catch (err) {
            console.error('AI chat error:', err);
            return json({ error: 'Erro ao processar resposta da IA' }, 502);
        }
    }

    // ── End AI Chat ───────────────────────────────────────────────────────────

    return json({ error: 'Rota nao encontrada' }, 404);
}

async function login(request, env) {
    const body = await readJson(request);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!username || !password) {
        return json({ error: 'Usuario e senha sao obrigatorios' }, 400);
    }

    // Ensure the login_attempts table exists (created by migration 0016)
    await env.DB.exec(
        `CREATE TABLE IF NOT EXISTS login_attempts (
            username TEXT PRIMARY KEY,
            failed_count INTEGER NOT NULL DEFAULT 0,
            locked_until TEXT,
            last_failed_at TEXT
        )`
    );

    const nowSec = Math.floor(Date.now() / 1000);

    // Check for active lockout before verifying credentials
    const attempt = await queryFirst(
        env,
        'SELECT failed_count, locked_until FROM login_attempts WHERE username = ?',
        [username]
    );

    if (attempt && attempt.locked_until) {
        const lockedUntilSec = Math.floor(new Date(attempt.locked_until).getTime() / 1000);
        if (nowSec < lockedUntilSec) {
            const remainingSeconds = lockedUntilSec - nowSec;
            return json({ error: 'Incorreto', remainingSeconds }, 429);
        }
    }

    const user = await queryFirst(env, 'SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        const currentFailed = (attempt?.failed_count || 0) + 1;
        const lockoutSeconds = getLockoutSeconds(currentFailed);
        const lockedUntil = lockoutSeconds > 0
            ? toSqliteDate(new Date((nowSec + lockoutSeconds) * 1000))
            : null;

        await execute(
            env,
            `INSERT INTO login_attempts (username, failed_count, locked_until, last_failed_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(username) DO UPDATE SET
                 failed_count   = excluded.failed_count,
                 locked_until   = excluded.locked_until,
                 last_failed_at = excluded.last_failed_at`,
            [username, currentFailed, lockedUntil]
        );

        return json(
            { error: 'Incorreto', remainingSeconds: lockoutSeconds > 0 ? lockoutSeconds : null },
            401
        );
    }

    // Credentials correct — clear any lockout record
    await execute(env, 'DELETE FROM login_attempts WHERE username = ?', [username]);

    await cleanupExpiredSessions(env);
    await cleanupCurrentSessionBeforeLogin(request, env);

    const sessionId = crypto.randomUUID();
    const expiresAt = toSqliteDate(new Date(Date.now() + SESSION_DURATION_SECONDS * 1000));

    await execute(
        env,
        'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
        [sessionId, user.id, expiresAt]
    );

    return json(
        { success: true },
        200,
        { 'Set-Cookie': await buildSessionCookie(sessionId, request, env) }
    );
}

async function cleanupCurrentSessionBeforeLogin(request, env) {
    const currentSession = await getSessionFromRequest(request, env);
    if (!currentSession) {
        return;
    }

    await execute(env, 'DELETE FROM sessions WHERE id = ?', [currentSession.id]);
}

async function logout(request, env) {
    const session = await getSessionFromRequest(request, env);
    if (session) {
        await execute(env, 'DELETE FROM sessions WHERE id = ?', [session.id]);
    }

    return json(
        { success: true },
        200,
        { 'Set-Cookie': clearSessionCookie(request) }
    );
}

async function getSessionFromRequest(request, env) {
    const secret = env.SESSION_SECRET;
    if (!secret) {
        throw new Error('SESSION_SECRET nao configurado no Worker');
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
        `SELECT sessions.id, sessions.user_id, sessions.expires_at, users.username,
                COALESCE(users.role, 'user') AS role,
                users.company_id
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
    const role = getEffectiveRole(session);
    return role === 'admin' || role === 'gestor_admin';
}

function isGestorAdminSession(session) {
    return getEffectiveRole(session) === 'gestor_admin';
}

// Backward-compat: existing admin users with no company_id are treated as gestor_admin
function getEffectiveRole(session) {
    if (!session) return null;
    const role = session.role || 'user';
    if (role === 'admin' && !session.company_id) return 'gestor_admin';
    return role;
}

async function cleanupExpiredSessions(env) {
    await execute(env, 'DELETE FROM sessions WHERE expires_at <= ?', [toSqliteDate(new Date())]);
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
        console.warn('DELETE_PASSWORD_HASH nao configurado no Worker.');
        return false;
    }

    return bcrypt.compare(password, passwordHash);
}

async function getEventsByCompletion(env, eventType, completed, companyId = null) {
    const orderBy = eventType === 'rental'
        ? 'ORDER BY COALESCE(e.return_date, e.date) DESC, e.id DESC'
        : 'ORDER BY e.date DESC, e.id DESC';
    const completionFilter = completed
        ? 'COALESCE(movements.movement_count, 0) > 0 AND COALESCE(pending.pending_quantity, 0) = 0'
        : '(COALESCE(movements.movement_count, 0) = 0 OR COALESCE(pending.pending_quantity, 0) > 0)';
    const companyWhere = companyId !== null ? 'AND e.company_id = ?' : '';
    const params = companyId !== null ? [eventType, companyId] : [eventType];

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
           ${companyWhere}
         ${orderBy}`,
        params
    );
}

async function getRentalReturnAlerts(env, today, companyId = null) {
    const companyWhere = companyId !== null ? 'AND company_id = ?' : '';
    const rentalEvents = await queryAll(
        env,
        `SELECT *
         FROM events
         WHERE COALESCE(event_type, 'event') = 'rental'
           AND return_date IS NOT NULL
           AND return_date <= ?
           ${companyWhere}
         ORDER BY return_date ASC, id ASC`,
        companyId !== null ? [today, companyId] : [today]
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
         GROUP BY e.id, e.name, e.barcode
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
         GROUP BY c.id, c.name
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

async function deleteEventRecords(env, eventId) {
    const equipmentsInEvent = await queryAll(
        env,
        'SELECT DISTINCT equipment_id FROM equipment_events WHERE event_id = ?',
        [eventId]
    );

    if (equipmentsInEvent.length > 0) {
        const equipmentIds = equipmentsInEvent.map((row) => row.equipment_id);
        const placeholders = equipmentIds.map(() => '?').join(', ');
        await execute(
            env,
            `UPDATE equipments SET current_status = 'Disponivel' WHERE id IN (${placeholders})`,
            equipmentIds
        );
    }

    const cablesInEvent = await queryAll(
        env,
        `SELECT cable_id,
                SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS quantity
         FROM cable_event_movements
         WHERE event_id = ?
         GROUP BY cable_id
         HAVING quantity > 0`,
        [eventId]
    );

    for (const cableMovement of cablesInEvent) {
        await execute(
            env,
            'UPDATE cables SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [cableMovement.quantity, cableMovement.cable_id]
        );
    }

    const otherItemsInEvent = await queryAll(
        env,
        `SELECT item_id,
                SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS quantity
         FROM other_item_event_movements
         WHERE event_id = ?
         GROUP BY item_id
         HAVING quantity > 0`,
        [eventId]
    );

    for (const itemMovement of otherItemsInEvent) {
        await execute(
            env,
            'UPDATE other_items SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [itemMovement.quantity, itemMovement.item_id]
        );
    }

    await execute(env, 'DELETE FROM other_item_event_movements WHERE event_id = ?', [eventId]);
    await execute(env, 'DELETE FROM cable_event_movements WHERE event_id = ?', [eventId]);
    await execute(env, 'DELETE FROM equipment_events WHERE event_id = ?', [eventId]);
    await execute(env, 'DELETE FROM events WHERE id = ?', [eventId]);
}

async function ensureSaidaHiddenItemsTable(env) {
    await execute(
        env,
        `CREATE TABLE IF NOT EXISTS event_saida_hidden_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            item_type TEXT NOT NULL CHECK(item_type IN ('equipment', 'cable', 'other')),
            item_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(event_id, item_type, item_id)
        )`
    );
}

async function ensureNotificationTables(env) {
    await execute(
        env,
        `CREATE TABLE IF NOT EXISTS notification_settings (
            company_id INTEGER PRIMARY KEY,
            settings_json TEXT NOT NULL,
            updated_by_username TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
    );
    await execute(
        env,
        `CREATE TABLE IF NOT EXISTS notification_dismissals (
            company_id INTEGER NOT NULL,
            notification_id TEXT NOT NULL,
            dismissed_by_username TEXT,
            dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (company_id, notification_id)
        )`
    );
}

function getNotificationCompanyId(session) {
    return session?.company_id ? Number(session.company_id) : 0;
}

async function ensureAppearanceTable(env) {
    await execute(
        env,
        `CREATE TABLE IF NOT EXISTS company_appearance (
            company_id   INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
            theme_json   TEXT,
            logo_data    TEXT,
            favicon_data TEXT,
            updated_by   TEXT,
            updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
    );
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

async function getNotificationSettingsForCompany(env, companyId) {
    const row = await queryFirst(env, 'SELECT settings_json FROM notification_settings WHERE company_id = ?', [companyId]);
    if (!row?.settings_json) return { ...DEFAULT_NOTIFICATION_SETTINGS };

    try {
        return sanitizeNotificationSettings(JSON.parse(row.settings_json));
    } catch (_) {
        return { ...DEFAULT_NOTIFICATION_SETTINGS };
    }
}

async function queryAll(env, sql, params = []) {
    const result = await env.DB.prepare(sql).bind(...params).run();
    return result.results || [];
}

async function queryFirst(env, sql, params = []) {
    return env.DB.prepare(sql).bind(...params).first();
}

async function execute(env, sql, params = []) {
    return env.DB.prepare(sql).bind(...params).run();
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

function isAvailableStatus(status) {
    const normalized = String(status || '').toLowerCase();
    return !normalized
        || normalized === 'disponivel'
        || normalized === 'disponível'
        || normalized === 'pre separado'
        || normalized === 'relacao'
        || normalized === 'relação';
}

function handleDatabaseError(error, duplicateMessage) {
    const message = String(error?.message || error || '');
    if (message.toLowerCase().includes('unique')) {
        return json({ error: duplicateMessage }, 409);
    }

    console.error('Database error:', error);
    return json({ error: message || 'Erro no banco de dados' }, 500);
}

function sanitizeCnpj(value) {
    return String(value || '').replace(/\D/g, '');
}

function validateCnpj(cnpj) {
    cnpj = sanitizeCnpj(cnpj);
    if (cnpj.length !== 14) return false;
    if (/^(\d)\1+$/.test(cnpj)) return false;

    const calcDigit = (cnpj, weights) => {
        let sum = 0;
        for (let i = 0; i < weights.length; i++) sum += Number(cnpj[i]) * weights[i];
        const rem = sum % 11;
        return rem < 2 ? 0 : 11 - rem;
    };

    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    if (calcDigit(cnpj, w1) !== Number(cnpj[12])) return false;
    if (calcDigit(cnpj, w2) !== Number(cnpj[13])) return false;
    return true;
}
