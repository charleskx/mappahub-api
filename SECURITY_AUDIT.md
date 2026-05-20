# Auditoria de seguranca do backend MappaHub API

Data: 2026-05-20

Escopo revisado: codigo TypeScript em `src/`, schemas Drizzle, rotas Fastify, auth, imports/exports, upload R2, billing, Places/Geocoding, permissoes e dependencias via `npm audit`.

Observacao: esta revisao e estatica, com build/lint/audit local. Ela nao substitui pentest dinamico, DAST, revisao de infraestrutura, regras do bucket R2, configuracao real de CORS, segredos em runtime ou politicas do Google/Stripe/Redis/Postgres.

## Resumo executivo

Foram encontradas vulnerabilidades e fragilidades relevantes em autenticacao, armazenamento de tokens, uploads, importacao/exportacao de planilhas, controle de custo/abuso em APIs externas, hardening HTTP e dependencias. Os itens mais urgentes sao:

1. Tokens sensiveis em texto puro no banco.
2. Falta de rate limit especifico em endpoints de 2FA, refresh, reset, cadastro e Google login.
3. Upload de SVG publico sem sanitizacao.
4. CSV/XLSX formula injection em exportacoes.
5. Importacao de planilhas em memoria, com risco de DoS.
6. Bug de integridade em import full que pode apagar parceiros indevidamente.

## Achados

### Alta - Tokens de refresh, reset, verificacao e convite ficam em texto puro

Evidencia:
- `src/db/schema/refresh_tokens.ts:15` armazena `refresh_tokens.token` diretamente.
- `src/db/schema/users.ts:19-22` armazena `emailVerifyToken` e `resetPasswordToken` diretamente.
- `src/modules/auth/auth.service.ts:70-75`, `197-202`, `354-359` persistem refresh tokens em texto puro.
- `src/modules/auth/auth.service.ts:393-417` persiste tokens de verificacao/reset em texto puro.

Impacto: qualquer vazamento de banco permite reutilizar refresh tokens ativos, aceitar convites ou redefinir senhas enquanto os tokens nao expirarem/revogarem.

Como corrigir:
- Armazenar somente hash dos tokens, por exemplo `sha256(token + pepper)` ou Argon2 para tokens de baixa entropia.
- Retornar/enviar o token original apenas uma vez.
- Renomear colunas para `token_hash`, `reset_password_token_hash`, `email_verify_token_hash`.
- Comparar usando hash constante e adicionar indices nas colunas hash.
- Rotacionar todos os tokens existentes na migracao ou invalidar sessoes/reset/convites antigos.

### Alta - Endpoints sensiveis sem rate limit dedicado

Evidencia:
- Apenas `/auth/login` tem rate limit especifico em `src/modules/auth/auth.routes.ts:40-42`.
- `/auth/2fa/login` e `/auth/2fa/recover` nao tem rate limit dedicado em `src/modules/auth/auth.routes.ts:66-79` e `93-106`.
- `/auth/refresh`, `/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/accept-invite` e `/auth/google` nao tem limite especifico em `src/modules/auth/auth.routes.ts:116-208`.

Impacto: facilita brute force de TOTP/recovery code, enumeracao por timing/custo, abuso de envio de e-mails e tentativa massiva de tokens.

Como corrigir:
- Aplicar rate limit por IP + identificador logico: email, `tempToken`, refresh token hash, user id quando autenticado.
- Sugerido:
  - login: manter 10/15 min, mas tambem por email.
  - 2FA e recovery: 5 tentativas/10 min por `tempToken`.
  - forgot/resend: 3-5/hora por email + IP.
  - refresh: 30/min por IP e detectar reuse de token revogado.
  - register/google: limites proprios por IP.
- Invalidar `tempToken` apos muitas falhas.

### Alta - Upload permite SVG publico sem sanitizacao

Evidencia:
- `src/modules/tenant/tenant.service.ts:12` permite `image/svg+xml`.
- `src/modules/tenant/tenant.service.ts:35-59` valida pelo `mimetype` informado e publica o arquivo no R2.

Impacto: SVG pode carregar scripts, links externos ou payloads inesperados quando servido como `image/svg+xml`, dependendo do contexto de uso no frontend/CDN. Tambem ha risco de MIME spoofing porque a validacao nao inspeciona assinatura/magic bytes.

Como corrigir:
- Remover SVG da lista permitida ou sanitizar com biblioteca robusta antes do upload.
- Validar magic bytes para PNG/JPEG/WebP.
- Forcar `Content-Disposition: inline` apenas para imagens raster confiaveis e considerar `X-Content-Type-Options: nosniff` no dominio publico.
- Reprocessar imagens para PNG/WebP no backend, descartando metadados e conteudo ativo.

### Alta - Formula injection em exportacoes CSV/XLSX

Evidencia:
- `src/modules/export/export.service.ts:20-24` escapa somente CSV estrutural.
- `src/modules/export/export.service.ts:90-120` escreve valores de usuarios direto em CSV/XLSX.

Impacto: se um parceiro ou campo dinamico comecar com `=`, `+`, `-`, `@`, tab ou carriage return, o Excel/LibreOffice pode interpretar como formula quando o arquivo for aberto. Isso pode induzir exfiltracao via formulas externas ou execucao de recursos perigosos em clientes vulneraveis.

Como corrigir:
- Neutralizar celulas iniciadas por caracteres de formula prefixando `'` ou tab seguro antes de exportar.
- Aplicar a sanitizacao em headers, fixed fields e dynamic values.
- Para XLSX, gravar valores como texto explicitamente e neutralizar tambem.
- Adicionar testes com valores como `=HYPERLINK("https://...")`, `+cmd`, `@SUM(1,1)`.

### Alta - Importacao de planilha carrega arquivo inteiro em memoria

Evidencia:
- `src/app.ts:66-68` limite global multipart de 10 MB.
- `src/modules/import/import.routes.ts:28` usa `data.toBuffer()`.
- `src/modules/import/import.service.ts:20` parseia antes de enfileirar.
- `src/modules/import/import.parser.ts` carrega workbook inteiro via ExcelJS.

Impacto: usuarios autenticados podem enviar arquivos compactados XLSX que expandem muito ou CSVs grandes ate o limite, consumindo memoria/CPU no processo web antes da fila. Isso pode causar DoS e degradar todos os tenants.

Como corrigir:
- Reduzir limite por rota de importacao e validar tamanho antes do buffer.
- Usar parsing streaming para CSV e XLSX quando possivel.
- Limitar linhas, colunas, tamanho de celula e quantidade de dynamic fields.
- Enfileirar arquivo em storage temporario e processar no worker, nao no processo HTTP.
- Adicionar timeout e rejeicao de XLSX com zip ratio suspeito.

### Alta - Bug em import full pode apagar registros indevidamente

Evidencia:
- `src/modules/import/import.worker.ts:54` cria `processedIds`.
- `src/modules/import/import.worker.ts:87` e `105` adicionam ids de parceiros.
- `src/modules/import/import.worker.ts:207-213` chama parametros como `processedKeys`.
- `src/modules/partner/partner.repository.ts:224-239` faz `id NOT IN (...)`, mas comentarios e `findAllImportedKeys` falam em `externalKey`.

Impacto: em modo full, a logica mistura `id` e `externalKey`, e `findAllImportedKeys` e comparado contra ids. O contador `removed` fica incorreto e a manutencao futura pode transformar isso em delecao em massa acidental. Alem disso `softDeleteByExternalKeys` apaga qualquer parceiro do tenant quando `keepIds` esta vazio, nao apenas `source = import`.

Como corrigir:
- Escolher uma chave unica: ids ou external keys. Renomear funcoes e variaveis.
- Se a regra e substituir somente importados, adicionar `eq(partners.source, 'import')` no update de delecao.
- Cobrir com teste de import full mantendo parceiros manuais e importados presentes.
- Fazer dry-run/preview antes de delecoes em massa.

### Media - CORS pode abrir credenciais para qualquer origem se `CORS_ORIGIN` faltar

Evidencia:
- `src/app.ts:42-49` usa `origin: true` quando `CORS_ORIGIN` nao esta definido e `credentials: true`.

Impacto: em producao mal configurada, qualquer origem pode chamar a API com credenciais permitidas pelo browser. Hoje os tokens parecem trafegar no corpo/Authorization, mas o projeto registra cookies e `credentials: true`, entao isso aumenta o impacto de qualquer mudanca futura para cookies.

Como corrigir:
- Exigir `CORS_ORIGIN` em producao no schema de env.
- Em producao, falhar o boot se a lista estiver vazia.
- Separar defaults: desenvolvimento permissivo, producao estrita.

### Media - Nao ha headers HTTP de hardening

Evidencia:
- `src/app.ts` registra CORS, cookie, JWT, rate limit e multipart, mas nao registra `@fastify/helmet`.

Impacto: faltam headers como `X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy`, `Frame-Options`/`frame-ancestors` quando aplicavel. Para API pura o risco e menor, mas endpoints publicos, arquivos e embeds tornam esse hardening mais importante.

Como corrigir:
- Adicionar `@fastify/helmet`.
- Configurar CSP/frame-ancestors de acordo com a necessidade de embed.
- Garantir `nosniff` e politica de referrer.

### Media - Rotas Places usam chave do servidor sem `subscriptionGuard` nem limite especifico

Evidencia:
- `src/modules/places/places.routes.ts:29` e `92` usam apenas `authenticate`.
- `src/modules/places/places.routes.ts:47-54` e `107-112` fazem chamadas pagas ao Google Places.

Impacto: qualquer usuario autenticado, mesmo sem assinatura ativa, pode consumir quota/custo da chave do servidor. O rate limit global de 100/min e alto para chamadas pagas.

Como corrigir:
- Aplicar `subscriptionGuard`.
- Adicionar rate limit baixo por usuario/tenant para autocomplete/details.
- Validar formato/tamanho de `sessiontoken` e `placeId`.
- Registrar metricas por tenant para bloqueio de abuso.

### Media - Dados sensiveis de Google Places aparecem em logs

Evidencia:
- `src/modules/places/places.routes.ts:75-77` loga primeiro resultado com `placeId`.
- `src/modules/places/places.routes.ts:105` loga URL de details completa.
- `src/modules/places/places.routes.ts:114-116` loga erro com `placeId`.

Impacto: logs podem conter enderecos pesquisados, identificadores de lugares e metadados de uso. Isso pode criar risco de privacidade e aumentar superficie em incidentes de log.

Como corrigir:
- Remover logs em producao ou mascarar `placeId`/query.
- Usar logger estruturado com redaction.
- Logar apenas status, tenant/user anonimizados e categoria de erro.

### Media - `APP_URL` e URLs de callback nao sao validados

Evidencia:
- `src/config/env.ts:14` aceita qualquer string como `APP_URL`.
- `src/modules/billing/billing.service.ts:50-51` usa `APP_URL` para `success_url` e `cancel_url`.
- E-mails usam `APP_URL` para links de reset/verificacao em `src/modules/auth/auth.service.ts:80-84`, `401-424`.

Impacto: erro de configuracao pode enviar usuarios para dominios incorretos ou maliciosos e quebrar fluxos sensiveis. Nao e exploravel diretamente por usuario comum, mas e uma fragilidade operacional relevante.

Como corrigir:
- Validar `APP_URL` com `z.string().url()`.
- Em producao, exigir HTTPS e dominio esperado.
- Separar `PUBLIC_APP_URL` e `API_URL` se necessario.

### Media - Refresh token rotation sem deteccao de reuse

Evidencia:
- `src/modules/auth/auth.service.ts:336-362` revoga o token e emite outro, mas se um token ja revogado for reutilizado apenas retorna 401.

Impacto: se um refresh token for roubado e usado em corrida, o sistema nao detecta comprometimento nem revoga a familia inteira de sessoes.

Como corrigir:
- Introduzir `session_id`/`family_id`.
- Se token revogado for usado, revogar toda a familia e exigir novo login.
- Registrar evento de seguranca e notificar o usuario.

### Media - 2FA depende de tokens temporarios em memoria

Evidencia:
- `src/modules/auth/auth.service.ts:22-23` usa `Map` em memoria para `tempTokens`.

Impacto: em ambiente com mais de uma instancia, login 2FA pode falhar se o segundo passo cair em outra instancia. Em restart, tokens somem. Nao e bypass direto, mas fragiliza disponibilidade e comportamento de auth.

Como corrigir:
- Mover `tempTokens` para Redis com TTL de 5 minutos.
- Armazenar contador de tentativas por temp token.
- Apagar no sucesso, expiracao e excesso de falhas.

### Media - Segredos TOTP armazenados reversiveis

Evidencia:
- `src/db/schema/users.ts:23` armazena `totpSecret`.
- `src/modules/auth/auth.service.ts:238-242` gera e salva o segredo em claro.

Impacto: vazamento de banco permite gerar codigos TOTP dos usuarios com 2FA ativo. O 2FA deixa de proteger contra comprometimento do banco.

Como corrigir:
- Criptografar `totpSecret` em repouso com envelope encryption/KMS ou chave fora do banco.
- Rotacionar segredos apos incidente.
- Nao retornar segredo depois da etapa de setup inicial.

### Media - Schema de senha exige apenas 8 caracteres

Evidencia:
- `src/modules/auth/auth.schema.ts:6` e `27` usam `z.string().min(8)`.

Impacto: permite senhas fracas. Argon2 ajuda contra cracking offline, mas politicas fracas aumentam risco de credential stuffing e adivinhacao.

Como corrigir:
- Exigir 12+ caracteres.
- Bloquear senhas comuns com lista tipo Have I Been Pwned k-anonymity ou dicionario local.
- Considerar zxcvbn no frontend/backend.

### Media - `GET /users/:id` retorna registro completo do usuario

Evidencia:
- `src/modules/user/user.service.ts:29-32` retorna o resultado de `userRepository.findById`.
- `src/modules/user/user.repository.ts:6-12` usa `.select()` sem excluir `passwordHash`, tokens de reset/verificacao e `totpSecret`.

Impacto: usuarios autenticados do tenant podem consultar outro usuario do mesmo tenant e receber hashes/sigilos internos, dependendo do serializado pelo Fastify. Isso e vazamento sensivel.

Como corrigir:
- Usar select allowlist como em `findAll`.
- Reutilizar `sanitizeUser` tambem para `getUserById` e `updateUser`.
- Nunca retornar `passwordHash`, `totpSecret`, tokens ou timestamps de tokens.

### Media - `PATCH /users/:id` pode retornar dados sensiveis

Evidencia:
- `src/modules/user/user.service.ts:91-93` retorna `userRepository.update`.
- `src/modules/user/user.repository.ts:35-41` usa `.returning()` completo.

Impacto: apos atualizar perfil/role, a resposta pode incluir `passwordHash`, `totpSecret`, tokens de reset/verificacao e outros campos internos.

Como corrigir:
- Alterar `update` para retornar allowlist segura ou sanitizar no service.
- Adicionar teste de contrato para garantir que campos sensiveis nunca aparecem.

### Media - Billing portal acessivel para qualquer role autenticada

Evidencia:
- `src/modules/billing/billing.routes.ts:37-40` exige apenas `authenticate`.
- `src/shared/permissions.ts:35` limita `Billing` a owner, mas a rota nao usa ability.

Impacto: admins/employees podem abrir portal Stripe do tenant se estiverem logados, potencialmente visualizando dados de cobranca ou alterando assinatura dependendo da configuracao do portal.

Como corrigir:
- Exigir `owner`/`super_admin` ou `ability.can('manage', 'Billing')`.
- Aplicar isso a `/billing/checkout` e `/billing/portal`.

### Baixa - Dependencia vulneravel via `pm2 -> ws`

Evidencia:
- `npm audit --audit-level=low --json` retornou 2 vulnerabilidades moderadas:
  - `ws: Uninitialized memory disclosure`, GHSA-58qx-3vcg-4xpx, `>=8.0.0 <8.20.1`.
  - Afeta `pm2@>=7.0.0`; fix sugerido pelo npm: `pm2@6.0.14` como mudanca major/downgrade.

Impacto: exposicao moderada relacionada a WebSocket transitivo. A explorabilidade depende de como `pm2` e usado em runtime.

Como corrigir:
- Avaliar remover `pm2` de `dependencies` se a plataforma de deploy nao precisa dele dentro da app.
- Se precisar, acompanhar release de `pm2` com `ws >= 8.20.1` ou aplicar override se compativel.
- Rodar `npm audit` no CI.

### Baixa - Logs de desenvolvimento incluem corpo de e-mail com tokens

Evidencia:
- `src/shared/mailer.ts:20-24` imprime os primeiros 300 caracteres do HTML do e-mail fora de producao.

Impacto: tokens de verificacao/reset podem aparecer em logs locais, previews, CI ou ambientes erroneamente marcados como development.

Como corrigir:
- Redigir query params `token=...` antes de logar.
- Logar apenas destinatario, assunto e tipo do e-mail.
- Garantir `NODE_ENV=production` em staging/prod reais.

### Baixa - Logging de `priceId` no checkout

Evidencia:
- `src/modules/billing/billing.service.ts:27` faz `console.log('priceId', priceId)`.

Impacto: `priceId` nao e segredo critico, mas e ruido operacional e pode expor detalhes internos de billing em logs.

Como corrigir:
- Remover `console.log`.
- Se precisar, usar logger estruturado em debug com redaction.

### Baixa - Falta validacao forte de limites em campos dinamicos

Evidencia:
- `src/modules/partner/partner.schema.ts:8` e `16` aceitam `z.record(z.string())` sem limite de quantidade/tamanho.
- `src/modules/partner/partner.repository.ts:291-316` cria colunas dinamicas a partir das chaves recebidas.

Impacto: usuario autenticado pode criar muitos campos dinamicos, consumir storage e degradar queries/exportacoes.

Como corrigir:
- Limitar numero de campos dinamicos por parceiro e por tenant.
- Limitar tamanho de chave/valor.
- Exigir permissao mais forte para criar novas colunas dinamicas.

### Baixa - `NODE_ENV`/SMTP tem defaults permissivos

Evidencia:
- `src/config/env.ts:5`, `25-29` define defaults para `NODE_ENV`, SMTP e `APP_URL`.

Impacto: producao mal configurada pode iniciar como development, logar e-mails em vez de enviar, usar URL local ou SMTP vazio.

Como corrigir:
- Em producao, exigir `APP_URL`, `CORS_ORIGIN`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, Stripe/R2 conforme features habilitadas.
- Criar schema condicional por `NODE_ENV`.

## Resultados dos comandos

- `npm run build`: passou.
- `npm run lint`: falhou com 19 erros de lint, principalmente `noNonNullAssertion`, imports Node sem `node:`, e ajustes de estilo. Nao sao todos vulnerabilidades, mas devem entrar no CI para evitar regressao.
- `npm audit --audit-level=low --json`: falhou inicialmente sem rede no sandbox; com rede liberada retornou 2 vulnerabilidades moderadas em `pm2/ws`.

## Prioridade sugerida de remediacao

1. Sanitizar respostas de usuario e parar vazamento de `passwordHash`, `totpSecret` e tokens.
2. Hash de refresh/reset/verificacao/convite e invalidacao dos tokens antigos.
3. Rate limits dedicados em auth/2FA/reset/email.
4. Remover/sanitizar SVG e validar magic bytes no upload.
5. Neutralizar formula injection nas exportacoes.
6. Redesenhar importacao para processamento seguro e corrigir bug do full import.
7. Fechar CORS/Helmet/env de producao.
8. Limitar Places e billing por role/assinatura.
9. Resolver dependencia `pm2/ws` e colocar `npm audit` no CI.
