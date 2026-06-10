# Relatório de Segurança — MappaHub API

**Data:** 2026-06-10
**Escopo:** Backend completo (`src/`) + dependências
**Branch:** `main`

Auditoria de varredura completa. A maioria dos vetores clássicos já estava mitigada
pela auditoria de 2026-05-20 (hash de tokens, 2FA em Redis, criptografia de TOTP,
rate limits, helmet, CORS, isolamento de tenant). Esta varredura encontrou **2 falhas
de controle de acesso ainda abertas** (módulo de geocoding) e **vulnerabilidades de
dependências**.

| # | Severidade | Falha | Local |
|---|---|---|---|
| 1 | **Alta** | IDOR cross-tenant — leitura de logs de geocoding de qualquer tenant | `geocoding-logs.routes.ts:19` |
| 2 | **Média** | Broken access control — `employee` altera endereço/coordenadas de parceiro | `geocoding-logs.routes.ts:26` |
| 3 | **Média** | Dependências vulneráveis em produção (`tmp`, `qs`, `uuid`/`exceljs`) | `package.json` |
| 4 | **Baixa** | Rotas de geocoding sem `subscriptionGuard` | `geocoding-logs.routes.ts` |

---

## 1. IDOR cross-tenant em `GET /geocoding-logs/partner/:partnerId` — ALTA

### Onde
- Rota: [`src/modules/geocoding/geocoding-logs.routes.ts:19`](src/modules/geocoding/geocoding-logs.routes.ts)
- Query: [`src/modules/geocoding/geocoding-logs.repository.ts:35`](src/modules/geocoding/geocoding-logs.repository.ts)

```ts
// routes — só exige authenticate, NÃO valida o tenant do partner
app.get('/geocoding-logs/partner/:partnerId', async (req, reply) => {
  const { partnerId } = req.params as { partnerId: string }
  const logs = await geocodingLogsRepository.findByPartner(partnerId)
  return reply.send(logs)
})

// repository — filtra SÓ por partnerId, sem tenantId
async findByPartner(partnerId: string) {
  return db.select({ ... address, status, lat, lng, ... })
    .from(geocodingLogs)
    .where(eq(geocodingLogs.partnerId, partnerId))   // ← sem eq(tenantId)
    ...
}
```

### Como a falha é explorada
Qualquer usuário autenticado (até um `employee` de um workspace de trial) pode chamar:

```
GET /geocoding-logs/partner/<UUID-de-outro-tenant>
Authorization: Bearer <token-válido-do-atacante>
```

Como a query não amarra ao `req.tenantId`, o endpoint devolve os logs de geocoding
de **qualquer** parceiro do sistema — incluindo o **endereço completo** (`address`),
coordenadas (`lat`/`lng`) e motivo de erro. Bastando enumerar/obter `partnerId`s de
outros clientes (UUIDs vazam em respostas de outras rotas, exports, etc.), o atacante
extrai a base de endereços de concorrentes. É um vazamento de dados entre tenants
(quebra de isolamento multi-tenant).

### Como corrigir
Amarrar a consulta ao tenant do requisitante — mesmo padrão já usado no
`fix-address` logo abaixo (que valida `partner.tenantId !== req.tenantId`).

```ts
// routes
app.get('/geocoding-logs/partner/:partnerId', async (req, reply) => {
  const { partnerId } = req.params as { partnerId: string }
  const logs = await geocodingLogsRepository.findByPartner(partnerId, req.tenantId)
  return reply.send(logs)
})

// repository
async findByPartner(partnerId: string, tenantId: string) {
  return db.select({ ... })
    .from(geocodingLogs)
    .where(and(
      eq(geocodingLogs.partnerId, partnerId),
      eq(geocodingLogs.tenantId, tenantId),   // ← isolamento de tenant
    ))
    .orderBy(desc(geocodingLogs.attemptedAt))
    .limit(50)
}
```
(`tenantId` já existe na tabela `geocoding_logs` — ver `repository.create`.)

---

## 2. Broken access control em `POST /geocoding-logs/fix-address/:partnerId` — MÉDIA

### Onde
[`src/modules/geocoding/geocoding-logs.routes.ts:26`](src/modules/geocoding/geocoding-logs.routes.ts)

```ts
app.post('/geocoding-logs/fix-address/:partnerId', async (req, reply) => {
  ...
  await db.update(partners).set({
    address: address.trim(), lat: geo.lat, lng: geo.lng,
    city: geo.city, state: geo.state, geocodeStatus: 'done', ...
  }).where(eq(partners.id, partnerId))
  ...
})
```

### Como a falha é explorada
O endpoint exige apenas `authenticate` — **nenhuma verificação de role (CASL)**. Pelas
permissões em [`permissions.ts`](src/shared/permissions.ts), o role `employee` tem
somente `read`/`create` em `Partner`; a rota oficial `PATCH /partners/:id` chama
`partnerService.update`, que exige `ability.can('update','Partner')` e **bloqueia o
employee**. Mas `fix-address` escreve direto no banco, contornando essa checagem: um
`employee` consegue **reescrever endereço e coordenadas** de qualquer parceiro do seu
tenant — capacidade que a política de permissões nega. É um escalonamento horizontal
de privilégio (bypass do CASL). O tenant em si é validado, então não cruza tenants,
mas viola o modelo de papéis.

### Como corrigir
Aplicar a mesma checagem de habilidade da rota de update de parceiro:

```ts
import { defineAbilityFor } from '../../shared/permissions'

app.post('/geocoding-logs/fix-address/:partnerId', async (req, reply) => {
  if (!defineAbilityFor({ role: req.userRole }).can('update', 'Partner')) {
    throw new AppError('FORBIDDEN', 403, 'Sem permissão')
  }
  ...
})
```

---

## 3. Dependências vulneráveis em produção — MÉDIA

`npm audit` (apenas deps de produção):

| Pacote | Severidade | CVE/Advisory | Impacto |
|---|---|---|---|
| `tmp` (<0.2.6) | **Alta** | GHSA-ph9p-34f9-6g65 | Path traversal via prefix/postfix não sanitizado |
| `qs` (6.11.1–6.15.1) | Moderada | GHSA-q8mj-m7cp-5q26 | DoS remoto em `qs.stringify` |
| `uuid` (<11.1.1) via `exceljs` | Moderada | GHSA-w5hq-g745-h8pq | Falta de checagem de bounds de buffer |

Dev-only (não vão para produção, mas vale atualizar): `vitest` (crítica,
GHSA-5xrq-8626-4rwp — exec arbitrário com a UI ligada), `ws`/`pm2` (moderada).

### Como corrigir
```bash
npm audit fix          # resolve tmp, qs, vitest sem breaking change
```
Para `uuid`/`exceljs` (a correção automática rebaixa `exceljs` — breaking):
avaliar atualizar `exceljs` para a maior versão estável que traga `uuid >= 11.1.1`,
ou aceitar o risco (o vetor exige `buf` controlado pelo atacante, improvável no fluxo
de export atual). `pm2`/`ws` já estão em `devDependencies` — sem exposição em produção.

---

## 4. Rotas de geocoding sem `subscriptionGuard` — BAIXA

[`geocoding-logs.routes.ts:12`](src/modules/geocoding/geocoding-logs.routes.ts) registra
apenas `authenticate` como hook. Todas as outras rotas de negócio (partner, map, import,
export) usam `[authenticate, subscriptionGuard]`. Resultado: um tenant **bloqueado ou
com assinatura vencida** ainda lista falhas de geocoding e dispara o provedor de
geocoding via `fix-address` (consumo de quota/custo Google/Nominatim).

### Como corrigir
```ts
import { subscriptionGuard } from '../../middlewares/subscription-guard'
app.addHook('preHandler', authenticate)
app.addHook('preHandler', subscriptionGuard)
```
(opcional: adicionar `config: { rateLimit: { max: 30, timeWindow: '1 minute' } }` ao
`fix-address`, que hoje não tem rate limit dedicado.)

---

## Verificado e SEM problemas

- **Auth/tokens:** refresh/reset/verify/invite armazenados como HMAC-SHA256; rotação de
  refresh com detecção de reuse por `familyId`; 2FA em Redis com TTL e limite de
  tentativas; `totpSecret` cifrado com AES-256-GCM.
- **Stripe webhook:** valida assinatura com `constructEvent`; body raw isolado.
- **Isolamento de tenant:** partner, map, user, import, export, tickets, notifications,
  billing — todos amarram `tenantId`. Admin valida `super_admin` no service.
- **SQL injection:** Drizzle parametrizado em todas as queries (inclusive filtros
  públicos `city`/`state`/`pinTypeId`).
- **Upload:** logo valida MIME + magic bytes + tamanho (sem SVG); import valida extensão
  e limite de 50 MB com rate limit.
- **CSV/XLSX export:** `neutralizeFormula()` aplicado (anti formula injection).
- **SSE:** auth via header (sem token em URL), escopo por tenant.
- **CORS/Helmet:** boot falha em produção sem `CORS_ORIGIN`; helmet ativo.
- **Mass assignment:** `updateUserSchema` restringe a `name`/`role`; troca de role só
  por owner/super_admin; owner protegido.
