# Sistema de Estoque 24H

Projeto adaptado para deploy em Cloudflare Workers + D1, mantendo o front-end organizado em `html/`, `css/`, `javascript/` e `fotos/`, com as rotas da API no Worker.

## Estrutura principal

```text
html/                    Páginas HTML
css/                     Estilos do front-end
javascript/              JavaScript do front-end
fotos/                   Imagens usadas pelo site
src/worker.mjs           API e autenticação no Cloudflare Worker
banco de dados/database.db
banco de dados/migrations/0001_initial.sql
scripts/export-sqlite-to-d1.js
wrangler.toml
```

## Comandos

```bash
npm install
npm run dev
npm run deploy
npm run export:d1
npm run backup:sqlite
```

## O que foi preparado

- `wrangler.toml` com assets + binding D1
- `src/worker.mjs` substituindo o backend Express no Cloudflare
- `banco de dados/migrations/0001_initial.sql` com a estrutura do banco no D1
- `scripts/export-sqlite-to-d1.js` para exportar os dados atuais de `banco de dados/database.db`

## Passo a passo de deploy

1. Instale dependências:

```bash
npm install
```

2. Faça login no Cloudflare:

```bash
npx wrangler login
```

3. Crie o banco D1:

```bash
npx wrangler d1 create sistema-estoque-24h
```

4. Copie o `database_id` retornado e substitua em `wrangler.toml`.

5. Crie o segredo da sessão:

```bash
npx wrangler secret put SESSION_SECRET
```

Use uma senha longa e aleatória.

6. Aplique a migration:

```bash
npx wrangler d1 migrations apply sistema-estoque-24h --remote
```

7. Se quiser levar os dados do SQLite atual para o D1, gere o arquivo de importação:

```bash
npm run export:d1
```

8. Importe os dados gerados:

```bash
npx wrangler d1 execute sistema-estoque-24h --remote --file "banco de dados/d1-export.sql"
```

9. Publice o projeto:

```bash
npm run deploy
```

Esse comando cria um export completo do D1, aplica as migrations pendentes,
instala atomicamente os gatilhos de integridade, sincroniza os assets e só então
publica o Worker.

Os gatilhos ficam em `banco de dados/d1-integrity-triggers.sql` fora da pasta de
migrations porque o endpoint de migrations da D1 não interpreta corretamente
corpos de `CREATE TRIGGER`. O comando `guard:d1:remote` usa a importação atômica
da própria D1: em qualquer falha, o banco volta automaticamente ao estado
anterior e o deploy é interrompido.

## Login padrão

- Use um usuário cadastrado no banco.

## Segurança e backup

- O banco SQLite local principal fica em `banco de dados/database.db`.
- Os backups locais novos vão para `backups/sqlite/`.
- O servidor local cria um backup automático ao iniciar e outro antes de excluir cabo ou equipamento.
- Você também pode criar um backup manual com:

```bash
npm run backup:sqlite
```

- Para o D1 de produção, gere um export completo com:

```bash
npm run backup:d1
```

Os exports são gravados em `backups/d1/`, acompanhados de tamanho e SHA-256. O comando `npm run deploy` faz esse backup automaticamente antes de publicar.

- Em uma recuperação de emergência, consulte primeiro o ponto do Time Travel sem alterar o banco:

```bash
npx wrangler d1 time-travel info sistema-estoque-24h --timestamp="2026-08-05T12:00:00Z"
```

O comando de restauração informado pelo Wrangler altera produção; só deve ser executado depois de conferir o horário e preservar um export atual.

- Para proteger as sessões no backend local, defina `SESSION_SECRET`.
- Para proteger a senha de exclusão sem deixá-la no código, defina `DELETE_PASSWORD_HASH`.
- Gere o hash com:

```bash
npm run hash:secret -- SUA_SENHA_DE_EXCLUSAO
```

- Exemplo de `.env`:

```env
SESSION_SECRET=troque-por-um-segredo-longo-e-aleatorio
DELETE_PASSWORD_HASH=cole-aqui-o-hash-gerado
```

- No Cloudflare Worker, configure também o segredo `DELETE_PASSWORD_HASH`, além do `SESSION_SECRET`.

## PDF de orçamentos no Cloudflare

A geração usa `pdf-lib` e é uma operação intensiva de CPU. O Workers Free limita
cada requisição a 10 ms e pode responder com erro 1102. Para produção, ative o
plano **Workers Paid** da conta (separado dos planos Free/Pro/Business do domínio);
o limite padrão passa a 30 segundos. Não é necessário contratar um plano mais
caro do site.

O Worker mantém cada PDF em cache por uma impressão digital do conteúdo e usa
ETag no navegador. Assim, somente a primeira abertura de uma versão do orçamento
gera o arquivo; alterações no orçamento invalidam o cache automaticamente.

Referências oficiais:

- https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1102/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/

## Observação importante

O arquivo `server.js` continua no repositório como referência do backend antigo em Node/Express, mas o deploy para Cloudflare usa `src/worker.mjs`.
