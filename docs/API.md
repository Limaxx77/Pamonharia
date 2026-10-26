# API REST

Base: `/api`. Corpo e respostas em JSON. Valores monetários em **centavos** (inteiros).

**Autenticação:** `POST /api/auth/login` grava o cookie `pm_session` (httpOnly, SameSite=Lax, 12 h). As rotas internas exigem esse cookie; as permissões são verificadas no backend. O perfil `ADMIN` tem acesso a tudo.

**Erros:** `{ "error": { "code": "SESSION_CLOSED", "message": "...", "details": ... } }`
Códigos HTTP: 400 dados inválidos · 401 não autenticado · 403 sem permissão / cartão inativo · 404 não encontrado · 409 conflito de estado · 429 limite de requisições.

**Idempotência:** pedidos e pagamentos exigem `idempotencyKey` (UUID gerado pelo cliente). Repetir a mesma chave retorna o registro original (`duplicate: true`) em vez de criar outro.

## Autenticação

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → `{ user }` + cookie. Limite: 20 tentativas falhas / 15 min por IP |
| POST | `/auth/logout` | Remove o cookie |
| GET | `/auth/me` | `{ user }` ou `{ user: null }` |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` — encerra as demais sessões |

## Público (cliente / cartão NFC)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/public/settings` | Nome, endereço, taxa de serviço, `demoMode`, `allowSelfOpen` |
| GET | `/public/menu` | Categorias ativas com produtos e adicionais |
| GET | `/public/cards/:token?sessionId=` | Estado do cartão: `{ tab, session, canSelfOpen, settings }`. Só devolve o atendimento **aberto**; um atendimento recém-fechado só é devolvido ao aparelho que informar o próprio `sessionId` (até 2 h) |
| POST | `/public/cards/:token/open` | Cliente inicia o atendimento (somente se `allowSelfOpen`) |
| POST | `/public/cards/:token/orders` | `{ sessionId, items[], note?, idempotencyKey }` — `sessionId` precisa ser o atendimento aberto atual (senão `409 SESSION_CHANGED`) |
| POST | `/public/cards/:token/request-bill` | Marca “pediu a conta” e avisa a equipe |
| POST | `/public/cards/:token/call-waiter` | Chama o garçom |

Item de pedido: `{ productId, quantity (1–50), addonIds: string[], note?: string }`.
Cartão `BLOCKED`/`LOST`/`REVOKED` → `403 CARD_BLOCKED | CARD_LOST | CARD_REVOKED`. Limite: 15 pedidos/min por IP.

## Mesas — `WAITER`, `CASHIER`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/tables` | Mesas com estado (`FREE`, `WAITING_ORDER`, `PREPARING`, `OCCUPIED`, `WAITING_PAYMENT`), comandas e totais consolidados. `?all=1` (admin) inclui inativas |
| GET | `/tables/:id` | Mesa + atendimentos abertos completos + total consolidado |
| POST / PATCH | `/tables`, `/tables/:id` | `ADMIN`: cadastrar/editar/desativar |

## Comandas (atendimentos)

| Método | Rota | Perfis | Descrição |
|---|---|---|---|
| GET | `/sessions?status=&tab=&tableId=` | garçom, caixa | Lista atendimentos |
| GET | `/sessions/lookup?tab=25` | garçom, caixa | Comanda pelo número + atendimento aberto |
| POST | `/sessions` | garçom, caixa | `{ tabNumber, tableId?, customerName? }` — `409 SESSION_ALREADY_OPEN` se já houver um aberto |
| GET | `/sessions/:id` | garçom, caixa, cozinha | Detalhe com pedidos, pagamentos e `totals` |
| POST | `/sessions/:id/orders` | garçom | Pedido do garçom (mesmo formato do NFC, sem `sessionId`) |
| PATCH | `/sessions/:id` | garçom, caixa | `{ customerName?, waiterId? }` |
| POST | `/sessions/:id/transfer` | garçom, caixa | `{ tableId | null }` — mantém o histórico, auditado |
| POST | `/sessions/:id/request-bill` | garçom, caixa | `{ requested: boolean }` |
| POST | `/sessions/:id/discount` | caixa | `{ discountCents, reason }` — auditado |
| POST | `/sessions/:id/service-fee` | caixa | `{ percent }` |
| POST | `/sessions/:id/payments` | caixa | `{ method: PIX|CASH|DEBIT|CREDIT, amountCents, receivedCents?, payerName?, items?: [{orderItemId, quantity}], idempotencyKey }` → `{ closed }` |
| POST | `/sessions/:id/close` | caixa | Fecha se quitado; sem consumo → `CANCELLED` |
| POST | `/sessions/:id/reopen` | admin | `{ reason }` — auditado |
| POST | `/payments/:id/void` | admin | `{ reason }` — estorno do registro (atendimento aberto) |

`totals`: `subtotalCents, serviceFeeCents, discountCents, totalCents, paidCents, remainingCents, itemsCount`.

## Pedidos / cozinha

| Método | Rota | Perfis | Descrição |
|---|---|---|---|
| GET | `/orders/kitchen` | cozinha, garçom, caixa | Fila (`RECEIVED`, `PREPARING`, `READY`) por ordem de chegada + entregues na última hora + `lateMinutes` |
| PATCH | `/orders/:id/status` | cozinha (garçom só `DELIVERED`) | `{ status }` — fluxo `RECEIVED → PREPARING → READY → DELIVERED` (permite voltar uma etapa) |
| POST | `/orders/:id/cancel` | garçom (só `RECEIVED`), caixa | `{ reason }` — mantém no histórico |

## Cardápio — `ADMIN` (disponibilidade também `KITCHEN`)

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/catalog/categories` | Listar / criar |
| PATCH/DELETE | `/catalog/categories/:id` | Editar / excluir (bloqueado se tiver produtos) |
| GET/POST | `/catalog/products` | Listar (inclui inativos) / criar com `addons[]` |
| PATCH | `/catalog/products/:id` | Editar; `addons[]` substitui a lista (removidos são desativados) |
| DELETE | `/catalog/products/:id` | Exclui; se já vendido, apenas desativa |
| PATCH | `/catalog/products/:id/availability` | `{ available }` |
| GET | `/catalog/availability` | Lista enxuta para a cozinha |

## Cartões NFC — `ADMIN`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/cards` | Comandas com cartão atual (`url` pronta para gravar), uso e atendimento aberto |
| POST | `/cards` | `{ from, to?, label? }` — cadastra comandas e emite cartões (até 200 por vez) |
| POST | `/cards/:id/block` · `/lost` · `/reactivate` · `/revoke` | `{ reason? }` |
| POST | `/cards/tabs/:tabId/reissue` | Revoga os tokens anteriores e gera um novo link |
| GET | `/cards/tabs/:tabId/history` | Cartões emitidos, atendimentos e auditoria |

## Funcionários, relatórios, configurações — `ADMIN`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/users` | Lista (garçom/caixa veem apenas garçons ativos) |
| POST / PATCH | `/users`, `/users/:id` | Trocar senha, perfil ou desativar encerra as sessões do usuário |
| GET | `/admin/reports/summary?from=AAAA-MM-DD&to=` | Indicadores, mais vendidos, categorias, formas de pagamento, série diária e por hora (fuso `APP_TIMEZONE`) |
| GET | `/admin/reports/sessions?from=&to=` | Comandas fechadas no período |
| GET / PUT | `/admin/settings` | Configurações do estabelecimento |
| GET | `/admin/audit?entity=&action=&take=` | Trilha de auditoria |
| POST | `/admin/uploads` | `multipart/form-data` campo `file` (JPG/PNG/WEBP, 3 MB) → `{ url }` |

## Tempo real (Socket.IO, caminho `/socket.io`)

Os eventos levam só identificadores; as telas recarregam os dados pela API (uma única fonte de verdade).

| Evento | Quem recebe | Quando |
|---|---|---|
| `order:new` | equipe | pedido criado (NFC ou garçom) |
| `order:updated` | equipe + cliente do atendimento | mudança de status / cancelamento |
| `session:updated` | equipe + cliente do atendimento | consumo, pagamento, desconto, fechamento, transferência |
| `tables:updated` | equipe | ocupação das mesas |
| `menu:updated` | todos | produto/categoria/disponibilidade/configurações |
| `cards:updated` | equipe | mudança em cartões |
| `waiter:call` | equipe | cliente chamou o garçom ou pediu a conta |

A equipe é identificada pelo cookie na conexão. O cliente envia `join:card` com o token do cartão e entra apenas na sala do atendimento aberto daquele cartão.
