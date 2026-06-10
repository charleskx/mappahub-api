# Deploy no Coolify — Guia Passo a Passo

Este guia cobre o deploy completo da MappaHub API no Coolify, incluindo banco PostgreSQL, Redis, a API principal e o worker de filas.

---

## Pré-requisitos

- Servidor com Coolify instalado (VPS, Hetzner, DigitalOcean, etc.)
- Acesso ao painel Coolify (`https://seu-coolify.com`)
- Repositório da API acessível (GitHub, GitLab, Gitea)
- Domínio configurado apontando para o servidor

---

## 1. Criar um novo Project

1. No painel Coolify, clique em **Projects** → **New Project**
2. Dê o nome `atlasync` e clique em **Create**
3. Dentro do projeto, clique em **New Environment** → `production`

---

## 2. Provisionar o PostgreSQL

A API armazena coordenadas como colunas `latitude` e `longitude` do tipo `float`, portanto o **PostgreSQL padrão** que o Coolify oferece é suficiente — não é necessário usar PostGIS.

1. Em `production`, clique em **New Resource** → **Database** → **PostgreSQL**
2. Deixe a imagem padrão (`postgres:15` ou a que o Coolify sugerir)
3. Defina:
   - **Database Name**: `atlasync`
   - **Username**: `atlasync`
   - **Password**: (gere uma senha forte, ex.: `openssl rand -base64 32`)
4. Clique em **Save** e depois em **Start**
5. Aguarde o container ficar **Running**
6. Na aba **Connection**, copie a **Internal URL** — ela terá o formato:
   ```
   postgresql://atlasync:SENHA@postgresql-XXXXX:5432/atlasync
   ```
   Guarde essa URL, será usada como `DATABASE_URL`.

> **Importante**: use a URL **interna** (não a pública) para que a API se comunique com o banco pela rede interna do Docker, sem passar pela internet.

---

## 3. Provisionar o Redis

1. Em `production`, clique em **New Resource** → **Database** → **Redis**
2. Deixe as configurações padrão ou defina uma senha
3. Clique em **Save** e depois em **Start**
4. Copie a **Internal URL**:
   ```
   redis://default:SENHA@redis-XXXXX:6379
   ```
   Guarde essa URL como `REDIS_URL`.

---

## 4. Deploy da API (servidor principal)

### 4.1 Criar o serviço

1. Em `production`, clique em **New Resource** → **Application**
2. Selecione o provedor (GitHub, GitLab, etc.) e autorize o acesso ao repositório
3. Selecione o repositório `atlasync_api` e a branch `main`
4. Clique em **Continue**

### 4.2 Configurar o Build

Na tela de configuração do serviço:

- **Build Pack**: `Nixpacks` (detecta Node.js automaticamente)
- **Install Command**:
  ```
  npm ci
  ```
- **Build Command**:
  ```
  npm run build
  ```
- **Start Command**:
  ```
  node dist/server.js
  ```
- **Port**: `3000`

### 4.3 Configurar as variáveis de ambiente

Vá na aba **Environment Variables** e adicione todas as variáveis abaixo. Clique em **+ Add** para cada uma.

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://atlasync:SENHA@postgresql-XXXXX:5432/atlasync
REDIS_URL=redis://default:SENHA@redis-XXXXX:6379
JWT_SECRET=GERE_UMA_STRING_ALEATORIA_DE_64_CHARS
APP_URL=https://api.mappahub.com.br
CORS_ORIGIN=https://app.mappahub.com.br,https://mappahub.com.br
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
GOOGLE_MAPS_API_KEY=AIza...
GOOGLE_CLIENT_ID=XXXXXXXXXX.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
SENTRY_DSN=https://...@sentry.io/...
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_...
SMTP_FROM=MappaHub <noreply@mappahub.com.br>
```

> **SMTP**: a API usa SMTP padrão, compatível com qualquer provedor. O exemplo acima usa o [Resend](https://resend.com) (recomendado). Para outros provedores, ajuste `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` e `SMTP_PASS` conforme a documentação do serviço. Use porta `587` com STARTTLS (padrão) ou `465` para SSL direto.

Para gerar o `JWT_SECRET`:
```bash
openssl rand -base64 48
```

> **`CORS_ORIGIN`**: lista de origens permitidas separadas por vírgula. Em desenvolvimento (sem essa variável) a API aceita qualquer origem. Em produção, restrinja sempre aos domínios reais. Se adicionar mais subdomínios no futuro, basta incluí-los na lista sem precisar de novo deploy — apenas reinicie o serviço após alterar a variável.

### 4.4 Configurar o domínio

1. Vá na aba **Domains**
2. Adicione o domínio: `api.seudominio.com`
3. Habilite **HTTPS** (Coolify provisiona o certificado Let's Encrypt automaticamente)

### 4.5 Configurar o Health Check

O health check permite que o Coolify detecte quando a API travou ou parou de responder.

Em **Advanced** → **Health Check**:

- **Path**: `/health`
- **Interval**: `30s`
- **Timeout**: `10s`
- **Retries**: `3`
- **Start Period**: `30s` _(tempo de tolerância na inicialização antes de contar falhas)_

### 4.6 Deploy

1. Clique em **Save** e depois em **Deploy**
2. Acompanhe os logs em tempo real na aba **Deployments**
3. Quando aparecer `Server listening at http://0.0.0.0:3000`, o serviço está no ar

---

---

## 5. Aplicar o schema no banco (primeira vez)

Após o primeiro deploy, você precisa criar as tabelas. A maneira mais simples é adicionar um **Pre-Deploy Command** que roda automaticamente a cada deploy:

Em **General** → **Pre-Deploy Command**:
```
npm run db:push
```

Isso garante que o schema é sincronizado automaticamente a cada deploy, sem precisar acessar o terminal manualmente.

**Alternativa manual** (via terminal do container):
```bash
npx drizzle-kit push
```

### Limpar toda a base de dados (reset completo)

> ⚠️ **Irreversível.** Apaga todas as tabelas e dados. Use apenas em ambiente de testes ou quando precisar recomeçar do zero.

No terminal do container da **API** (Coolify → mappahub-api → Terminal), rode o comando abaixo. **A ordem importa** — as tabelas filhas devem ser removidas antes das tabelas pai para não violar as foreign keys:

```bash
node -e "
require('dotenv/config');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  TRUNCATE TABLE
    ticket_messages, tickets,
    geocoding_logs, import_jobs,
    partner_values, partner_columns,
    maps, partners, pin_types,
    refresh_tokens, totp_recovery_codes, users,
    subscriptions, tenant_settings, tenants
  CASCADE
\`).then(() => { console.log('Banco limpo'); process.exit(0) })
  .catch(e => { console.error(e); process.exit(1) })
"
```

Após concluir, recrie o schema com:

```bash
npm run db:push
```

---

## 6. Criar o Super Admin (primeira vez)

Após aplicar o schema, crie o usuário super admin para acessar o painel administrativo. O script lê as credenciais via variáveis de ambiente e é idempotente — se o e-mail já existir, ele não faz nada.

### No terminal do container da API (via Coolify → Terminal):

```bash
SUPER_ADMIN_EMAIL=seu@email.com SUPER_ADMIN_PASSWORD=SenhaForte123 npm run db:seed-super-admin
```

Ou, se preferir definir as variáveis separadamente:

```bash
export SUPER_ADMIN_EMAIL=seu@email.com
export SUPER_ADMIN_PASSWORD=SenhaForte123
npm run db:seed-super-admin
```

> **O script cria automaticamente:**
> - Um tenant interno `mappahub-internal` (se ainda não existir)
> - Uma assinatura anual ativa para esse tenant
> - O usuário com role `super_admin` e e-mail já verificado

Após criado, acesse o painel com as credenciais definidas. O super admin tem acesso irrestrito a todos os tenants, importações e configurações do sistema.

---

## 7. Deploy do Worker de Filas

O worker processa jobs de importação e geocoding em background. Ele roda como uma **aplicação separada no mesmo repositório**, com um start command diferente.

> **Por que serviço separado?** O Coolify executa um único start command por aplicação. Para rodar `server.js` e `worker.js` simultaneamente, seria necessário um script de orquestração — o que mistura logs, recursos e ciclos de deploy. Manter dois serviços independentes facilita o diagnóstico de problemas e permite escalar cada um separadamente.

### 6.1 Criar o serviço

1. Em `production`, clique em **New Resource** → **Application**
2. Selecione o **mesmo repositório** e a branch `main`
3. Dê o nome `mappahub-worker` para diferenciar da API

### 6.2 Configurar o Build

- **Build Pack**: `Nixpacks`
- **Install Command**: `npm ci`
- **Build Command**: `npm run build`
- **Start Command**: `npx pm2-runtime dist/worker.js`
- **Port**: `3001`

> O worker usa **PM2 como process manager** (`pm2-runtime`) para garantir que o processo Node.js reinicie automaticamente caso encerre inesperadamente — seja por crash, erro não tratado ou OOM. O `pm2-runtime` mantém o processo em foreground (necessário para o Docker), então o container continua de pé mesmo que o worker interno reinicie.

> A porta `3001` é exigida pelo Coolify para subir a aplicação, mas o worker não serve tráfego HTTP — ela é apenas para satisfazer o requisito da plataforma. O domínio gerado automaticamente pelo Coolify pode ser ignorado.

### 6.3 Variáveis de ambiente

Adicione as **mesmas variáveis de ambiente** da API — o worker compartilha a mesma base de código e pode disparar e-mails, integrar com serviços externos e executar queries. Todas as variáveis obrigatórias da API também são obrigatórias aqui:

```env
NODE_ENV=production
DATABASE_URL=postgresql://atlasync:SENHA@postgresql-XXXXX:5432/atlasync
REDIS_URL=redis://default:SENHA@redis-XXXXX:6379
JWT_SECRET=O_MESMO_VALOR_DA_API
GOOGLE_MAPS_API_KEY=AIza...
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_...
SMTP_FROM=MappaHub <noreply@mappahub.com.br>
SENTRY_DSN=https://...@sentry.io/...
R2_ACCOUNT_ID=seu_account_id
R2_ACCESS_KEY_ID=sua_access_key
R2_SECRET_ACCESS_KEY=seu_secret
R2_BUCKET_NAME=mappahub-assets
R2_PUBLIC_URL=https://pub-<hash>.r2.dev
```

> **`JWT_SECRET`** é obrigatório — o código da API valida essa variável na inicialização, mesmo no worker.

> **`R2_*`** são obrigatórios para o worker processar importações. O fluxo de importação faz upload do arquivo para o R2 na API e o worker faz o download a partir dali — sem essas variáveis, todos os jobs de importação falham com `Error: R2 não configurado`. Use os **mesmos valores** configurados no serviço da API.

### 6.4 Domínio

O Coolify gera um domínio automaticamente para o worker. Você pode ignorá-lo — o worker não serve tráfego HTTP público.

### 6.5 Deploy

1. Clique em **Save** e depois em **Deploy**
2. Nos logs, você deve ver:
   ```
   [PM2] Starting /app/dist/worker.js
   [worker] Import worker iniciado
   [worker] Geocoding worker iniciado
   ```
3. O worker está pronto quando não aparecerem erros de conexão com Redis ou banco

> **Verificando o PM2**: no terminal do container do worker (Coolify → mappahub-worker → Terminal), rode `npx pm2 list` para ver o status do processo e `npx pm2 logs` para ver os logs em tempo real.

---

## 8. Verificar o Auto-restart do Worker

Para confirmar que o PM2 está reiniciando o worker corretamente:

1. No painel Coolify, vá ao serviço **mappahub-worker** → **Terminal**
2. Execute:
   ```bash
   npx pm2 list
   ```
   Você deve ver o processo `worker` com status `online` e o campo `restarts` indicando quantas vezes ele foi reiniciado.
3. Para forçar um crash e testar o restart:
   ```bash
   npx pm2 stop worker
   npx pm2 start worker
   ```

> O container do worker fica de pé enquanto o PM2 estiver rodando. Se o processo Node.js cair, o PM2 o reinicia automaticamente sem derrubar o container.

---

## 9. Configurar o Webhook do Stripe

Para que os eventos do Stripe cheguem à API:

1. Acesse o [Dashboard do Stripe](https://dashboard.stripe.com/webhooks) → **Webhooks** → **Add endpoint**
2. **Endpoint URL**:
   ```
   https://api.seudominio.com/billing/webhook
   ```
3. **Events to listen**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copie o **Signing Secret** (`whsec_...`) e atualize a variável `STRIPE_WEBHOOK_SECRET` no Coolify

---

## 10. Deploy controlado por tag de versão (GitHub Actions)

O deploy **não acontece a cada push na `main`**. Ele é acionado somente ao criar e enviar uma tag de versão (ex: `v1.2.0`). Isso garante que você controla exatamente o que vai para produção e quando.

### 10.1 Desativar o Auto Deploy do Coolify

Por padrão o Coolify faz deploy a cada push na branch configurada. Desative isso:

1. No serviço **mappahub-api** → **Settings** → desative **"Auto Deploy"**
2. Repita no serviço **mappahub-worker**

### 10.2 Copiar os webhooks de deploy do Coolify

O GitHub Actions vai acionar o deploy chamando os webhooks do Coolify via HTTP.

1. No serviço **mappahub-api** → **Settings** → **Deploy Webhook** → copie a URL
2. No serviço **mappahub-worker** → **Settings** → **Deploy Webhook** → copie a URL

### 10.3 Adicionar os secrets no GitHub

No repositório do GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valor |
|--------|-------|
| `COOLIFY_WEBHOOK_API` | URL do webhook do serviço `mappahub-api` |
| `COOLIFY_WEBHOOK_WORKER` | URL do webhook do serviço `mappahub-worker` |

### 10.4 Como fazer um deploy

```bash
# 1. Certifique-se de que a main está atualizada
git checkout main
git pull origin main

# 2. Atualize o CHANGELOG.md com o que mudou na versão

# 3. Atualize a versão no package.json (opcional mas recomendado)
npm version 1.2.0 --no-git-tag-version

# 4. Commit
git add CHANGELOG.md package.json
git commit -m "chore: release v1.2.0"

# 5. Crie e envie a tag
git tag v1.2.0
git push origin main
git push origin v1.2.0
```

O GitHub Actions (`.github/workflows/deploy.yml`) irá automaticamente:
1. Extrair as notas de versão do `CHANGELOG.md`
2. Criar um **GitHub Release** com o changelog da versão
3. Acionar o deploy do `mappahub-api` via webhook do Coolify
4. Acionar o deploy do `mappahub-worker` via webhook do Coolify

### 10.5 Escrever o CHANGELOG

O `CHANGELOG.md` segue o formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/). Mantenha sempre uma seção `[Unreleased]` no topo e preencha durante o desenvolvimento:

```markdown
## [Unreleased]

### Adicionado
- Nova funcionalidade X

### Corrigido
- Bug Y na rota Z

## [1.2.0] - 2026-06-01
### Adicionado
- Suporte a webhooks customizados
```

Ao criar a tag `v1.2.0`, o workflow extrai automaticamente o bloco `## [1.2.0]` e usa como corpo do GitHub Release.

> **Ordem de deploy**: o worker é acionado logo após a API. Os dois deploys são independentes — o worker não depende da API para funcionar, pois ambos acessam diretamente o banco e o Redis.

---

## Resumo da arquitetura no Coolify

```
Coolify Project: mappahub
└── Environment: production
    ├── Database: PostgreSQL 15           ← porta 5432 (interno)
    │
    ├── Database: Redis 7                 ← porta 6379 (interno)
    │
    ├── App: mappahub-api                 ← porta 3000, domínio público
    │         start:      node dist/server.js
    │         pre-deploy: npm run db:push  (General → Pre-Deploy Command)
    │         health:     GET /health (30s interval, 3 retries)
    │
    └── App: mappahub-worker              ← porta 3001 (ignorada), domínio ignorado
              start:  npx pm2-runtime dist/worker.js
              restart automático via PM2 (process manager interno ao container)
```

---

## Troubleshooting

**Build falha com erro de TypeScript**
Verifique se o `NODE_ENV=production` está definido e rode `npm run build` localmente para confirmar que compila sem erros.

**`DATABASE_URL` não alcança o banco**
Certifique-se de usar a URL **interna** do Coolify (nome do container), não a URL pública. A URL interna só funciona entre serviços dentro da mesma network do Docker.

**Worker não processa jobs**
Verifique se o `REDIS_URL` no worker aponta para o mesmo Redis da API. Acesse a aba **Logs** do serviço worker para ver erros de conexão. Confirme também que o worker está com status **Running** (não apenas **Deployed**).

**Jobs de importação falham com "R2 não configurado" ou "Importação falhou"**
O worker precisa das variáveis `R2_*` para baixar o arquivo enviado pelo usuário. No log de inicialização do worker procure a linha:
```
[worker] R2 configured: true, bucket: NOT SET
```
Se aparecer `bucket: NOT SET`, adicione `R2_BUCKET_NAME` (e todas as outras `R2_*`) nas variáveis de ambiente do serviço **mappahub-worker** no Coolify — use os mesmos valores do serviço da API. Após salvar, faça um novo deploy (ou use **Restart** se o Coolify permitir recarregar variáveis sem rebuild).

**Worker para e não reinicia automaticamente**
O worker usa `pm2-runtime` no start command para manter o processo vivo. Confirme que o start command está exatamente como `npx pm2-runtime dist/worker.js`. Se o PM2 não estiver instalado como dependência, adicione `pm2` ao `package.json`:
```bash
npm install pm2
```
No terminal do container, use `npx pm2 list` para ver o status e `npx pm2 logs` para os logs.

**Worker reinicia em loop**
Se o worker reiniciar repetidamente, há um erro na inicialização. Acesse **Logs** do serviço e procure o erro antes do restart. Causas comuns: `REDIS_URL` inválido, `DATABASE_URL` incorreto, `JWT_SECRET` faltando, ou outro erro de inicialização do módulo.

**E-mails não são enviados em produção**
Verifique se as variáveis `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` e `SMTP_PASS` estão definidas. Em desenvolvimento, os e-mails são apenas logados no console — o envio real só acontece com `NODE_ENV=production`. Para testar o SMTP sem afetar usuários reais, use um serviço como [Mailtrap](https://mailtrap.io) apontando para o ambiente de staging.

**Stripe webhook retorna 400**
Confirme que o `STRIPE_WEBHOOK_SECRET` no Coolify corresponde exatamente ao secret exibido no dashboard do Stripe para aquele endpoint. O prefixo `whsec_` faz parte da string.

**API sobe mas retorna 502 Bad Gateway**
Aguarde o **Start Period** (30s) do health check antes de concluir que há problema. Se persistir, verifique se a porta `3000` está corretamente configurada no serviço e se o processo está escutando em `0.0.0.0` e não em `127.0.0.1`.

**Google Places retorna PLACES_DISABLED**
As variáveis `GOOGLE_MAPS_API_KEY`, `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` não estão configuradas no Coolify. Consulte a seção **"Configurar as APIs do Google"** abaixo.

---

## Configurar as APIs do Google

A MappaHub usa três serviços do Google que requerem chaves diferentes:

| Serviço | Para quê | Variável |
|---------|----------|----------|
| Maps JavaScript API | Renderizar o mapa no frontend | `VITE_GOOGLE_MAPS_API_KEY` |
| Geocoding API | Converter endereço em lat/lng | `GOOGLE_MAPS_API_KEY` |
| Places API | Autocomplete de endereço | `GOOGLE_MAPS_API_KEY` (mesma chave) |
| OAuth 2.0 | Login com Google | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` |

---

### Parte 1 — Criar as API Keys

Você precisará de **duas chaves separadas**: uma para o servidor (chamadas server-side) e outra para o frontend (chamadas do browser). Isso é necessário porque as restrições de segurança são diferentes para cada contexto.

#### 1a. Ativar as APIs

1. Acesse [console.cloud.google.com](https://console.cloud.google.com) e faça login com sua conta Google
2. Clique em **Select a project** → **New Project** → dê o nome `MappaHub` → **Create**
3. No menu lateral, vá em **APIs & Services** → **Library**
4. Procure e ative as três APIs abaixo (clique em cada uma → **Enable**):
   - **Maps JavaScript API** ← renderiza o mapa no browser
   - **Geocoding API** ← converte endereços em coordenadas (server-side)
   - **Places API** ← autocomplete de endereço (server-side e browser)

#### 1b. Chave do servidor (`GOOGLE_MAPS_API_KEY`)

Usada exclusivamente pelo backend (Node.js). As chamadas saem sempre do IP fixo do Coolify.

5. Vá em **APIs & Services** → **Credentials** → **+ Create Credentials** → **API Key**
6. Nomeie como `MappaHub Server`
7. Clique em **Edit API Key**:
   - Em **Application restrictions**: selecione **IP addresses** e adicione o IP público do seu servidor Coolify
     > Para descobrir o IP: no terminal do container da API (Coolify → Terminal), rode `curl ifconfig.me`
   - Em **API restrictions**: selecione **Restrict key** → marque apenas:
     - **Geocoding API** ← converte endereços em coordenadas
     - **Places API** ← autocomplete de endereço (chamado via `/places/autocomplete`)
   - Clique em **Save**
8. Cole o valor em `GOOGLE_MAPS_API_KEY` no Coolify (serviço da API)

#### 1c. Chave do frontend (`VITE_GOOGLE_MAPS_API_KEY`)

Usada pelo browser do usuário. Não pode ter restrição de IP (cada usuário tem um IP diferente) — usa HTTP referrer para restringir ao seu domínio.

9. Crie outra chave: **+ Create Credentials** → **API Key**
10. Nomeie como `MappaHub Frontend`
11. Clique em **Edit API Key**:
    - Em **Application restrictions**: selecione **HTTP referrers** e adicione:
      ```
      https://app.mappahub.com.br/*
      ```
    - Em **API restrictions**: selecione **Restrict key** → marque apenas:
      - **Maps JavaScript API** ← renderiza o mapa no browser
      - **Places API** ← autocomplete de endereço no formulário de parceiro
      > **Geocoding API não é necessária aqui** — o geocoding é feito pelo servidor, nunca pelo browser
    - Clique em **Save**
12. Cole o valor em `VITE_GOOGLE_MAPS_API_KEY` no Coolify (serviço do frontend)

> **Cobrança**: o Google oferece **$200 de crédito gratuito por mês**. Com esse crédito você tem ~40.000 geocodificações e ~70.000 buscas de autocomplete gratuitamente. Cadastre um cartão de crédito no Google Cloud — ele só é cobrado se ultrapassar o crédito.

---

### Parte 2 — Criar as credenciais OAuth (Login com Google)

1. No mesmo projeto `MappaHub`, vá em **APIs & Services** → **OAuth consent screen**
2. Selecione **External** → **Create**
3. Preencha:
   - **App name**: `MappaHub`
   - **User support email**: seu e-mail
   - **Authorized domains**: `mappahub.com.br` (ou seu domínio)
   - **Developer contact email**: seu e-mail
4. Clique em **Save and Continue** até chegar em **Summary** → **Back to Dashboard**
5. Vá em **Credentials** → **+ Create Credentials** → **OAuth 2.0 Client ID**
6. Em **Application type**: selecione **Web application**
7. Em **Authorized JavaScript origins**, adicione a URL do seu frontend:
   ```
   https://app.mappahub.com.br
   ```
8. Em **Authorized redirect URIs**, adicione a URL de callback do frontend:
   ```
   https://app.mappahub.com.br/auth/callback/google
   ```
9. Clique em **Create**
10. Copie o **Client ID** (formato `XXXXXXXXXX.apps.googleusercontent.com`) e o **Client Secret** (formato `GOCSPX-...`)
11. Cole em `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no Coolify

> **Nota**: O `@react-oauth/google` usa o fluxo de popup do Google Identity Services — não há redirect URI. A única configuração necessária é a **Authorized JavaScript origin**. O frontend recebe o ID token via callback JavaScript e o envia para `POST /auth/google` na API para validação.

---

### Parte 3 — Variáveis de ambiente do Frontend

No Coolify, no serviço do **frontend** (`mappahub-web`), adicione as seguintes variáveis em **Environment Variables**:

```env
VITE_GOOGLE_MAPS_API_KEY=AIza...
VITE_GOOGLE_CLIENT_ID=XXXXXXXXXX.apps.googleusercontent.com
```

| Variável | De onde vem |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | A mesma API Key criada na Parte 1 (usada para carregar o mapa e o autocomplete de endereços no browser) |
| `VITE_GOOGLE_CLIENT_ID` | O Client ID OAuth criado na Parte 2 (exibido no botão "Entrar com Google") |

> **Importante**: variáveis `VITE_*` são embutidas no bundle JavaScript durante o build. Após adicioná-las no Coolify, é necessário **fazer um novo deploy** do frontend para que elas sejam aplicadas.
