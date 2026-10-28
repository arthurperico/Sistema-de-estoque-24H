# Relatório de organização do projeto

Data: 2026-07-06

## Resumo

A organização foi feita de forma conservadora para não quebrar caminhos internos. Como os arquivos existentes não poderiam ter imports, links, rotas ou configurações atualizados, os arquivos principais do front-end, servidor local e Cloudflare/D1 foram mantidos nos locais onde o projeto já espera encontrá-los.

Não houve exclusão de arquivos e nenhum arquivo existente teve seu conteúdo alterado.

## Mapeamento resumido encontrado

- `server.js`: entrada do servidor Node local, apontada por `package.json`.
- `public/`: front-end estático usado pelo servidor local e pelo Cloudflare Assets em `wrangler.toml`.
- `src/worker.mjs`: entrada do Worker Cloudflare, apontada por `wrangler.toml`.
- `migrations/`: migrations D1, apontadas por `migrations_dir = "./migrations"` em `wrangler.toml`.
- `database.db`: banco SQLite local usado por `server.js` e scripts.
- `backups/`: backups locais, incluindo `backups/sqlite`, usado pelo servidor e scripts.
- `scripts/`: scripts Node chamados por `package.json`.
- `data/`: arquivos auxiliares locais; parte dela é usada por scripts/servidor.
- `.wrangler/`, `node_modules/`, `.git/` e arquivos de configuração: mantidos intactos.

## Pastas criadas

- `css`
- `html`
- `javascript`
- `javascript/servidor`
- `banco de dados`
- `fotos`
- `irrelevante`
- `irrelevante/logs`
- `irrelevante/logs/raiz`
- `irrelevante/logs/data`
- `irrelevante/dados-antigos`

Observação: `css`, `html`, `javascript/servidor` e `banco de dados` ficaram sem arquivos porque mover os arquivos ativos para elas quebraria caminhos atuais. Pastas vazias podem não aparecer em um commit Git sem um arquivo marcador.

## Arquivos movidos

### Para `fotos`

- `logo.PNG` -> `fotos/logo.PNG`
  - Motivo: era uma cópia idêntica de `public/logo.PNG`; a versão usada pelo site continua em `public/logo.PNG`.
- `data/orcamento-template-chrome.png` -> `fotos/orcamento-template-chrome.png`
  - Motivo: imagem solta fora do front-end ativo, sem referências encontradas.
- `data/orcamento-template-chrome2.png` -> `fotos/orcamento-template-chrome2.png`
  - Motivo: imagem solta fora do front-end ativo, sem referências encontradas.

### Para `irrelevante/dados-antigos`

- `data/products.json` -> `irrelevante/dados-antigos/products.json`
  - Motivo: arquivo de dados antigo/demo; a busca encontrou referência apenas em `.gitignore`, não no servidor, Worker, front-end ativo, scripts ou configuração de deploy.

### Para `irrelevante`

- `data/emergency-server-20260703-135500` -> `irrelevante/emergency-server-20260703-135500`
  - Motivo: pasta de backup/emergência com cópia de servidor, public, banco e logs; não havia referências a ela no runtime local, front-end, Node.js, D1 ou Cloudflare.

### Para `irrelevante/logs/raiz`

- `server-local-20260624-123943.err.log`
- `server-local-20260624-123943.out.log`
- `server-local-20260625-101148.err.log`
- `server-local-20260625-101148.out.log`
- `server-local-20260625-110102.err.log`
- `server-local-20260625-110102.out.log`
- `server-local-20260625-114549.err.log`
- `server-local-20260625-114549.out.log`
- `server-local-20260630-100651.err.log`
- `server-local-20260630-100651.out.log`
- `server-local-20260701-123038.err.log`
- `server-local-20260701-123038.out.log`
- `server-local-20260701-130147.err.log`
- `server-local-20260701-130147.out.log`
- `server-local-20260701-131522.err.log`
- `server-local-20260701-131522.out.log`
- `server-local-20260701-131650.err.log`
- `server-local-20260701-131650.out.log`
- `server-local-20260701-172059.err.log`
- `server-local-20260701-172059.out.log`
- `server-local-20260701-172632.err.log`
- `server-local-20260701-172632.out.log`
- `wrangler-preview-20260520-132218.err.log`
- `wrangler-preview-20260520-132218.out.log`
- `wrangler-preview.err.log`
- `wrangler-preview.out.log`

Motivo: logs antigos de execução local/preview, sem uso por servidor, front-end, Node.js, D1 ou deploy.

### Para `irrelevante/logs/data`

- `data/cpf-phone-mask-server.err.log`
- `data/cpf-phone-mask-server.out.log`
- `data/delete-technician-server.err.log`
- `data/delete-technician-server.out.log`
- `data/local-server.err.log`
- `data/local-server.out.log`
- `data/operator-test-server.err.log`
- `data/operator-test-server.out.log`
- `data/tail-login.err.log`
- `data/tail-login.out.log`
- `data/technicians-test-server.err.log`
- `data/technicians-test-server.out.log`

Motivo: logs antigos dentro de `data/`, sem uso por servidor, front-end, Node.js, D1 ou deploy.

### Arquivos novos de verificação

- `irrelevante/logs/verificacao-npm-start.out.log`
- `irrelevante/logs/verificacao-npm-start.err.log`

Motivo: logs gerados ao validar que o servidor local inicia. Não fazem parte do código do sistema.

## Arquivos mantidos no lugar original

- `package.json` e `package-lock.json`
  - Mantidos por serem configuração essencial Node/build.
- `wrangler.toml`
  - Mantido por ser configuração essencial Cloudflare/D1.
- `.git`, `.gitignore`, `.env.example`, `.wrangler`, `node_modules`, `README.md`
  - Mantidos por serem sensíveis, essenciais ou de configuração/documentação.
- `server.js`
  - Mantido porque `package.json` aponta `main`, `start` e `dev` para `server.js`.
- `src/worker.mjs`
  - Mantido porque `wrangler.toml` aponta `main = "src/worker.mjs"`.
- `public/*.html`, `public/*.css`, `public/*.js` e imagens de `public/`
  - Mantidos porque `wrangler.toml` usa `directory = "./public"`, `server.js` serve `public/`, e os HTMLs usam links relativos como `dashboard.css`, `dashboard.js`, `event.css`, `event.js`, `login.css`, `login.js` e URLs como `/logo.PNG`.
- `public/quote-header.png` e `public/quote-signature.png`
  - Mantidos porque `server.js` usa esses caminhos diretamente para gerar orçamentos/PDFs.
- `migrations/*.sql`
  - Mantidos porque `wrangler.toml` aponta `migrations_dir = "./migrations"`.
- `database.db`
  - Mantido porque `server.js` e scripts usam `database.db` na raiz.
- `database.head.db`
  - Mantido por ser arquivo de banco sensível/ignorado e possivelmente auxiliar local.
- `d1-export.sql`
  - Mantido porque README e `scripts/export-sqlite-to-d1.js` usam esse nome/caminho como padrão.
- `restore-cables-from-local.sql`
  - Mantido por ser SQL de restauração manual e estar protegido pelo padrão atual do `.gitignore`.
- `backups/`
  - Mantido porque `server.js`, scripts e README apontam para `backups/sqlite`.
- `data/import-cables-from-pdf.sql`
  - Mantido porque `scripts/import-cables-from-pdf.js` usa esse caminho como saída.
- `data/test-sessions`
  - Mantido porque `server.js` usa `data/test-sessions`.
- `data/tools/cloudflared.exe`
  - Mantido por poder ser ferramenta manual/local relacionada a Cloudflare; não havia certeza suficiente para mover.
- `scripts/*.js`
  - Mantidos porque `package.json` chama esses scripts diretamente.

## Arquivos colocados em `irrelevante` e motivo

- Logs antigos de servidor local e Wrangler Preview: não são usados pelo runtime.
- Logs antigos de `data/`: não são usados pelo runtime.
- `data/products.json`: dado antigo/demo sem referências no código ativo.
- `data/emergency-server-20260703-135500`: cópia de emergência/backup sem referências no projeto ativo.

## Arquivos com duvida ou mantidos por cautela

- `public/script.js` e `public/style.css`: parecem legados, mas ficaram em `public/` porque qualquer arquivo dentro de `public` pode ser acessado em produção e mover sem alterar links poderia quebrar uso manual ou rota direta.
- `restore-cables-from-local.sql`: não foi encontrada referência automática, mas parece arquivo manual de restauração; mantido.
- `database.head.db`: não foi encontrada referência direta no código, mas é arquivo de banco/local sensível; mantido.
- `data/tools/cloudflared.exe`: pode ser ferramenta manual de tunnel/Cloudflare; mantido.
- `backups/**`: há muitos backups antigos, mas a pasta `backups/sqlite` é caminho esperado pelo servidor e scripts; mantida.
- `.wrangler/**`: estado local do Wrangler/Miniflare; mantido intacto.

## Risco de quebra

Risco baixo para servidor local e produção, porque os caminhos ativos não foram movidos:

- `server.js` continua na raiz.
- `public/` continua na raiz.
- `src/worker.mjs` continua em `src/`.
- `migrations/` continua na raiz.
- `database.db` continua na raiz.
- `backups/sqlite` continua no local esperado.

Risco residual:

- Se algum processo externo/manual usava `logo.PNG` na raiz, agora ele está em `fotos/logo.PNG`. O site continua usando `public/logo.PNG`.
- Se algum processo externo/manual usava os logs ou a pasta `data/emergency-server-20260703-135500`, esses itens agora estão em `irrelevante/`.
- `irrelevante/` contém cópia antiga de servidor e bancos de backup; revisar antes de decidir se essa pasta deve entrar no Git.

## Verificações executadas

- Conferidos caminhos principais:
  - `server.js`: existe.
  - `package.json`: existe.
  - `wrangler.toml`: existe.
  - `src/worker.mjs`: existe.
  - `public/`: existe.
  - `migrations/`: existe.
  - `database.db`: existe.
  - `backups/sqlite`: existe.
- `node --check server.js`: OK.
- `node --check src/worker.mjs`: OK.
- Script local equivalente a `npm start` validado:
  - `package.json` define `start` como `node server.js`.
  - O servidor iniciou em `http://localhost:3000`.
  - `http://127.0.0.1:3000/login.html` respondeu HTTP 200.
  - `http://127.0.0.1:3000/logo.PNG` respondeu HTTP 200.
  - O processo temporário foi encerrado após a verificação.
- Cloudflare/D1:
  - `wrangler.toml` ainda aponta para `src/worker.mjs`, `public` e `migrations`.
  - Existem 17 arquivos `.sql` em `migrations/`.
  - Existem 17 arquivos principais em `public/`.
  - Não foi feito deploy.

Observação da verificação: ao iniciar o servidor, a rotina normal de startup criou o backup `backups/sqlite/database-2026-07-06T12-35-51-043Z-startup.db`. Esse arquivo foi gerado pelo próprio sistema durante o teste e não por reorganização manual.

## Revisão manual recomendada antes de commit ou deploy

- Revisar `git status` com atenção: já havia várias alterações antes da organização e elas foram preservadas.
- `fotos/logo.PNG` agora é a logo organizada usada pelo projeto; `public/fotos/logo.PNG` é o espelho de deploy.
- Decidir se a pasta `irrelevante/` deve entrar no Git. Ela contém logs, dados antigos e uma cópia de emergência com banco/servidor antigo.
- `public/` agora é um espelho de deploy; não edite manualmente sem rodar `npm run sync:assets` depois.
- Evitar mover `server.js`, `src/worker.mjs`, `banco de dados/database.db`, `banco de dados/migrations` ou `backups/` sem uma tarefa futura que também atualize caminhos internos.
- Antes de deploy, abrir o site localmente e conferir login, dashboard, eventos e geração de orçamentos/PDFs.

## Etapa funcional executada depois

Data: 2026-07-06

Esta etapa foi feita após autorização para reorganizar funcionalmente por etapas, com backup antes.

### Backup criado

- `backups/organizacao-funcional-20260706-094925`

Itens copiados para esse backup antes das alteracoes:

- `database.db`
- `database.head.db`
- `d1-export.sql`
- `restore-cables-from-local.sql`
- `server.js`
- `wrangler.toml`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `README.md`
- `RELATORIO_ORGANIZACAO.md`
- `public/`
- `migrations/`
- `scripts/`
- `src/`

### Nova organização funcional

- `html/`: páginas HTML reais do front-end.
- `css/`: arquivos CSS reais do front-end.
- `javascript/`: arquivos JavaScript reais do front-end.
- `javascript/servidor/`: mantida reservada para JS de servidor, sem publicar no deploy.
- `fotos/`: imagens reais usadas pelo site e pelos PDFs.
- `banco de dados/`: banco SQLite local, SQLs auxiliares e migrations D1.
- `public/`: espelho seguro de deploy do Cloudflare, gerado a partir das pastas organizadas.

### Arquivos movidos na etapa funcional

- `public/*.html` -> `html/`
- `public/*.css` -> `css/`
- `public/*.js` -> `javascript/`
- `public/quote-header.png` -> `fotos/quote-header.png`
- `public/quote-signature.png` -> `fotos/quote-signature.png`
- `public/logo.PNG` -> `irrelevante/duplicados/public-logo.PNG`
  - Motivo: era duplicado idêntico de `fotos/logo.PNG`.
- `database.db` -> `banco de dados/database.db`
- `database.head.db` -> `banco de dados/database.head.db`
- `d1-export.sql` -> `banco de dados/d1-export.sql`
- `restore-cables-from-local.sql` -> `banco de dados/restore-cables-from-local.sql`
- `data/import-cables-from-pdf.sql` -> `banco de dados/import-cables-from-pdf.sql`
- `migrations/` -> `banco de dados/migrations/`

### Arquivos alterados para manter compatibilidade

- `server.js`
  - Passou a usar `banco de dados/database.db`.
  - Passou a servir `html/`, `css/`, `javascript/` e `fotos/`.
  - Manteve aliases antigos como `/logo.PNG`, `/dashboard.css`, `/dashboard.js`, etc.
  - Passou a buscar imagens de orçamento/PDF em `fotos/`.
- `src/worker.mjs`
  - Passou a reescrever URLs públicas antigas, como `/login.html`, para assets físicos em `/html/login.html`.
  - Manteve aliases para assets antigos, como `/logo.PNG`.
- `wrangler.toml`
  - Manteve `main = "src/worker.mjs"`.
  - Voltou a publicar apenas `directory = "./public"` para evitar expor a raiz do projeto.
  - Passou a usar `migrations_dir = "./banco de dados/migrations"`.
- `package.json`
  - Adicionado `sync:assets`.
  - `dev:worker` e `deploy` agora rodam `npm run sync:assets` antes do Wrangler.
- `scripts/sync-public-assets.js`
  - Novo script que copia `html/`, `css/`, `javascript/` e `fotos/` para `public/`.
  - Não apaga arquivos; apenas copia/sobrescreve o espelho de deploy.
  - Ignora `javascript/servidor`.
- `scripts/create-sqlite-backup.js`
  - Origem do SQLite alterada para `banco de dados/database.db`.
- `scripts/export-sqlite-to-d1.js`
  - Origem do SQLite alterada para `banco de dados/database.db`.
  - Saída padrão alterada para `banco de dados/d1-export.sql`.
- `scripts/import-cables-from-pdf.js`
  - Origem do SQLite alterada para `banco de dados/database.db`.
  - SQL gerado alterado para `banco de dados/import-cables-from-pdf.sql`.
- `.gitignore`
  - Adicionados padrões para proteger DB/SQL dentro de `banco de dados/`.
- `README.md`
  - Atualizado para a nova estrutura.

### Observação sobre Cloudflare Assets

Foi testada uma alternativa com `directory = "."`, mas o `wrangler deploy --dry-run` leu 6534 arquivos da raiz do projeto. Essa alternativa foi descartada por risco de exposição/acoplamento com arquivos que não devem ser assets.

A configuração final usa `directory = "./public"` e o dry-run passou a ler apenas 23 arquivos do diretório de assets.

### Verificações da etapa funcional

- `node --check server.js`: OK.
- `node --check src/worker.mjs`: OK.
- `node --check scripts/*.js`: OK, incluindo `scripts/sync-public-assets.js`.
- `npm run sync:assets`: OK.
- Servidor local Node:
  - Iniciou com `node server.js`.
  - Abriu o banco em `banco de dados/database.db`.
  - `http://127.0.0.1:3000/`: HTTP 200.
  - `http://127.0.0.1:3000/login.html`: HTTP 200.
  - `http://127.0.0.1:3000/css/login.css`: HTTP 200.
  - `http://127.0.0.1:3000/javascript/login.js`: HTTP 200.
  - `http://127.0.0.1:3000/fotos/logo.PNG`: HTTP 200.
  - `http://127.0.0.1:3000/logo.PNG`: HTTP 200.
  - `http://127.0.0.1:3000/api/auth/status`: HTTP 200.
- Backup manual:
  - `node scripts/create-sqlite-backup.js verificacao-funcional`: OK.
  - Gerou `backups/sqlite/database-2026-07-06T12-53-39-133Z-verificacao-funcional.db`.
- Backup automático de startup gerado pelo servidor durante teste:
  - `backups/sqlite/database-2026-07-06T12-53-29-717Z-startup.db`.
- Cloudflare/Wrangler:
  - `npx wrangler deploy --dry-run`: OK.
  - Leu 23 arquivos em `public/`.
  - Não foi feito deploy.
- `wrangler dev --local`:
  - Assets diretos como `/css/login.css`, `/javascript/login.js` e `/fotos/logo.PNG` responderam 200.
  - Páginas que passam pelo Worker exigem `SESSION_SECRET` no ambiente local; sem esse segredo, retornam 500. Isso deve ser configurado antes de usar `npm run dev:worker` localmente.
  - Rotas sensíveis como `/server.js`, `/banco%20de%20dados/database.db` e `/package.json` não foram servidas como assets.

### Riscos e revisão manual da etapa funcional

- Antes de deploy, rode `npm run sync:assets` ou use `npm run deploy`, que já roda a sincronização automaticamente.
- Para testar Worker local, configure `SESSION_SECRET` em ambiente local apropriado antes de `npm run dev:worker`.
- Revisar o `git status`: muitos arquivos aparecem como removidos/adicionados porque foram movidos para novas pastas.
- Confirmar em uma máquina limpa que o caminho com espaço `banco de dados/` funciona nos comandos Wrangler/D1 esperados.
- Conferir manualmente login, dashboard, eventos, entrada/saída e geração de PDF antes do commit/deploy.
