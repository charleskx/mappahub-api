# MappaHub API

## Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Fastify 5
- **ORM:** Drizzle ORM (PostgreSQL)
- **Queue:** BullMQ + Redis
- **Auth:** JWT (access 15 min / refresh 7 dias)

## Comandos

```bash
npm run dev          # dev com hot-reload
npm run build        # compila para dist/
npm run db:generate  # gera migration a partir do schema
npm run db:migrate   # aplica migrations pendentes
npm run db:push      # push direto (dev only)
npm run db:studio    # Drizzle Studio
```

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

| Variável | Obrigatório | Descrição |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_SECRET` | ✅ | Mínimo 32 caracteres |
| `APP_URL` | ✅ | URL pública do frontend (usado em e-mails) |
| `SMTP_*` | ✅ prod | Configuração SMTP para envio de e-mails |
| `STRIPE_*` | ⚠️ | Necessário para faturamento |
| `GOOGLE_MAPS_API_KEY` | ⚠️ | Necessário para geocoding |
| `R2_*` | ⚠️ | Necessário para upload de logo no mapa público |

## Cloudflare R2 (upload de logo)

O upload de logo do mapa público usa **Cloudflare R2** (S3-compatible, free tier: 10 GB + 1 M ops/mês).

### Como configurar

1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage**
2. Crie um bucket (ex: `mappahub-assets`)
3. Em **Settings** do bucket, habilite **Public Access** (ou configure um domínio customizado)
4. Vá em **Manage R2 API Tokens** → crie um token com permissão `Object Read & Write` restrito ao bucket
5. Copie as credenciais e preencha no `.env`:

```env
R2_ACCOUNT_ID=seu_account_id          # encontrado em dash.cloudflare.com (canto inferior esquerdo)
R2_ACCESS_KEY_ID=sua_access_key
R2_SECRET_ACCESS_KEY=seu_secret
R2_BUCKET_NAME=mappahub-assets
R2_PUBLIC_URL=https://pub-<hash>.r2.dev  # URL pública do bucket (ou domínio customizado)
```

> Se as variáveis R2 não estiverem configuradas, o endpoint `POST /tenant/upload/logo` retorna 503.  
> Os demais campos de branding (nome, cor, site, rodapé) funcionam independentemente do R2.

### Endpoint

```
POST /tenant/upload/logo
Content-Type: multipart/form-data
Authorization: Bearer <token>

campo: file (JPG, PNG, WebP ou SVG — máx. 2 MB)

Resposta: { "url": "https://pub-xxx.r2.dev/logos/<tenantId>.png" }
```

## Migrações

As migrations ficam em `src/db/migrations/`. Após alterar o schema em `src/db/schema/`, gere a migration:

```bash
npm run db:generate
npm run db:migrate
```

## Permissões (CASL)

O arquivo `src/shared/permissions.ts` define as abilities por role:
- `owner` / `admin` → podem atualizar Settings, gerenciar usuários, etc.
- `employee` → acesso somente leitura à maioria dos recursos

## Estrutura de módulos

```
src/modules/
  auth/       # login, registro, 2FA, convites
  tenant/     # configurações do workspace + upload de logo
  map/        # mapas internos e públicos
  partner/    # parceiros (pins)
  user/       # gestão de colaboradores
  billing/    # Stripe
  import/     # importação de planilhas
  export/     # exportação
  ...
```
