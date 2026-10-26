/**
 * Testes de integração dos cenários obrigatórios (seção 17 do enunciado),
 * executados contra a API real + PostgreSQL de testes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { io as ioClient } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { initRealtime } from '../src/realtime/io.js';
import { prisma } from '../src/lib/prisma.js';
import { generateCardToken } from '../src/lib/tokens.js';

let server: Server;
let baseUrl: string;
const ids = {} as Record<string, string>;
const tokens = {} as Record<number, string>;
const agents = {} as Record<'admin' | 'waiter' | 'cashier' | 'kitchen', ReturnType<typeof request.agent>>;
const cookies = {} as Record<string, string>;

const key = () => randomUUID();

async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE payment_items, payments, order_item_addons, order_items, orders,
      tab_sessions, nfc_cards, tabs, tables, product_addons, products, categories,
      audit_logs, users, settings RESTART IDENTITY CASCADE`);
}

beforeAll(async () => {
  await resetDb();
  await prisma.settings.create({ data: { id: 1, serviceFeePercent: 10, allowSelfOpen: false } });
  const hash = await bcrypt.hash('senha-teste-123', 4);
  for (const [name, role] of [['admin', 'ADMIN'], ['waiter', 'WAITER'], ['cashier', 'CASHIER'], ['kitchen', 'KITCHEN']] as const) {
    const u = await prisma.user.create({ data: { name, email: `${name}@t.com`, role, passwordHash: hash } });
    ids[name] = u.id;
  }
  const cat = await prisma.category.create({ data: { name: 'Pamonhas', slug: 'pamonhas' } });
  const bebidas = await prisma.category.create({ data: { name: 'Bebidas', slug: 'bebidas' } });
  const queijo = await prisma.product.create({
    data: {
      categoryId: cat.id, name: 'Pamonha com queijo', priceCents: 1600,
      addons: { create: [{ name: 'Queijo extra', priceCents: 300 }] },
    },
    include: { addons: true },
  });
  ids.queijo = queijo.id;
  ids.queijoExtra = queijo.addons[0].id;
  ids.doce = (await prisma.product.create({ data: { categoryId: cat.id, name: 'Pamonha doce', priceCents: 1200 } })).id;
  ids.salgada = (await prisma.product.create({ data: { categoryId: cat.id, name: 'Pamonha salgada', priceCents: 1500 } })).id;
  ids.refri = (await prisma.product.create({ data: { categoryId: bebidas.id, name: 'Refrigerante', priceCents: 600 } })).id;
  ids.suco = (await prisma.product.create({ data: { categoryId: bebidas.id, name: 'Suco de laranja', priceCents: 900 } })).id;
  ids.esgotado = (await prisma.product.create({ data: { categoryId: cat.id, name: 'Esgotada', priceCents: 1000, available: false } })).id;

  for (const n of [5, 8]) ids[`table${n}`] = (await prisma.diningTable.create({ data: { number: n } })).id;
  for (const n of [11, 12, 13, 25]) {
    const t = generateCardToken();
    tokens[n] = t;
    const tab = await prisma.tab.create({ data: { number: n, cards: { create: { token: t } } } });
    ids[`tab${n}`] = tab.id;
  }

  const app = createApp();
  server = createServer(app);
  initRealtime(server);
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

  for (const name of ['admin', 'waiter', 'cashier', 'kitchen'] as const) {
    agents[name] = request.agent(baseUrl);
    const res = await agents[name].post('/api/auth/login').send({ email: `${name}@t.com`, password: 'senha-teste-123' });
    expect(res.status).toBe(200);
    cookies[name] = String(res.headers['set-cookie']).split(';')[0];
  }
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});

const openSession = async (tabNumber: number, tableId?: string, customerName?: string) => {
  const res = await agents.waiter.post('/api/sessions').send({ tabNumber, tableId, customerName });
  expect(res.status).toBe(201);
  return res.body.session.id as string;
};

const nfcOrder = (tabNumber: number, sessionId: string, items: object[], idempotencyKey = key()) =>
  request(baseUrl).post(`/api/public/cards/${tokens[tabNumber]}/orders`).send({ sessionId, items, idempotencyKey });

const waiterOrder = (sessionId: string, items: object[], idempotencyKey = key()) =>
  agents.waiter.post(`/api/sessions/${sessionId}/orders`).send({ items, idempotencyKey });

const sessionOf = async (id: string) => (await agents.cashier.get(`/api/sessions/${id}`)).body.session;

let s25: string;

describe('Cenário 1 — pedido pelo cartão NFC', () => {
  it('cliente abre o link do cartão 025, pede e o pedido chega na cozinha na comanda correta', async () => {
    s25 = await openSession(25, ids.table8);

    // Funcionário conectado ao tempo real recebe o novo pedido
    const socket = ioClient(baseUrl, { extraHeaders: { cookie: cookies.kitchen }, transports: ['websocket'] });
    await new Promise<void>((r) => socket.on('connect', () => r()));
    await new Promise((r) => setTimeout(r, 100));
    const received = new Promise<{ sessionId: string; source: string }>((r) => socket.on('order:new', r));

    const card = await request(baseUrl).get(`/api/public/cards/${tokens[25]}`);
    expect(card.status).toBe(200);
    expect(card.body.tab.label).toBe('025');
    expect(card.body.session.id).toBe(s25);

    const res = await nfcOrder(25, s25, [
      { productId: ids.queijo, quantity: 2 },
      { productId: ids.doce, quantity: 1 },
      { productId: ids.refri, quantity: 2 },
    ]);
    expect(res.status).toBe(201);

    const evt = await received;
    expect(evt).toMatchObject({ sessionId: s25, source: 'NFC' });
    socket.close();

    const kitchen = await agents.kitchen.get('/api/orders/kitchen');
    const order = kitchen.body.orders.find((o: { id: string }) => o.id === res.body.orderId);
    expect(order).toMatchObject({ tabNumber: 25, tableNumber: 8, source: 'NFC', status: 'RECEIVED' });
    expect(order.items).toHaveLength(3);

    const s = await sessionOf(s25);
    expect(s.totals.subtotalCents).toBe(2 * 1600 + 1200 + 2 * 600); // 5600
    expect(s.totals.serviceFeeCents).toBe(560);
    expect(s.totals.totalCents).toBe(6160);
  });

  it('adicionais são somados e o preço praticado é preservado após mudança no cardápio', async () => {
    const res = await nfcOrder(25, s25, [{ productId: ids.queijo, quantity: 1, addonIds: [ids.queijoExtra], note: 'bem quente' }]);
    expect(res.status).toBe(201);
    await agents.admin.patch(`/api/catalog/products/${ids.queijo}`).send({ priceCents: 9999 });
    const s = await sessionOf(s25);
    const item = s.orders.at(-1).items[0];
    expect(item.unitPriceCents).toBe(1900);
    expect(item.addons).toEqual([{ name: 'Queijo extra', priceCents: 300 }]);
    expect(s.totals.subtotalCents).toBe(5600 + 1900);
    await agents.admin.patch(`/api/catalog/products/${ids.queijo}`).send({ priceCents: 1600 });
  });

  it('rejeita produto indisponível', async () => {
    const res = await nfcOrder(25, s25, [{ productId: ids.esgotado, quantity: 1 }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE');
  });
});

describe('Cenário 2 — pedido pelo garçom', () => {
  it('garçom seleciona mesa 08 / comanda 025 e o consumo é acumulado na mesma comanda', async () => {
    const before = await sessionOf(s25);
    const table = await agents.waiter.get(`/api/tables/${ids.table8}`);
    expect(table.body.sessions.map((s: { id: string }) => s.id)).toContain(s25);

    const res = await waiterOrder(s25, [
      { productId: ids.salgada, quantity: 1 },
      { productId: ids.suco, quantity: 1 },
    ]);
    expect(res.status).toBe(201);

    const after = await sessionOf(s25);
    expect(after.orders).toHaveLength(before.orders.length + 1);
    expect(after.orders.at(-1).source).toBe('WAITER');
    expect(after.totals.subtotalCents).toBe(before.totals.subtotalCents + 1500 + 900);

    // O cliente vê, pelo cartão, o mesmo consumo (inclusive o pedido do garçom)
    const card = await request(baseUrl).get(`/api/public/cards/${tokens[25]}`);
    expect(card.body.session.totals.subtotalCents).toBe(after.totals.subtotalCents);
    expect(card.body.session.orders.some((o: { source: string }) => o.source === 'WAITER')).toBe(true);
  });
});

describe('Cenário 3 — mesa com múltiplas comandas', () => {
  it('cada comanda mantém o consumo individual e a mesa mostra o total consolidado', async () => {
    const a = await openSession(11, ids.table5, 'Cliente A');
    const b = await openSession(12, ids.table5, 'Cliente B');
    const c = await openSession(13, ids.table5, 'Cliente C');
    await nfcOrder(11, a, [{ productId: ids.queijo, quantity: 1 }]);
    await waiterOrder(b, [{ productId: ids.doce, quantity: 2 }]);
    await nfcOrder(13, c, [{ productId: ids.refri, quantity: 3 }]);

    const res = await agents.cashier.get(`/api/tables/${ids.table5}`);
    const subtotals = Object.fromEntries(
      res.body.sessions.map((s: { tab: { number: number }; totals: { subtotalCents: number } }) => [s.tab.number, s.totals.subtotalCents]),
    );
    expect(subtotals).toEqual({ 11: 1600, 12: 2400, 13: 1800 });
    expect(res.body.totals.subtotalCents).toBe(5800);
    expect(res.body.state).toBe('PREPARING');
  });

  it('um cartão não consegue pedir no atendimento de outra comanda', async () => {
    const t12 = await agents.waiter.get('/api/sessions/lookup?tab=12');
    const res = await nfcOrder(11, t12.body.session.id, [{ productId: ids.doce, quantity: 1 }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SESSION_CHANGED');
  });
});

describe('Cenário 4 — fechamento pelo caixa', () => {
  it('pagamento parcial mantém aberta; pagamento total fecha e bloqueia novos pedidos', async () => {
    const s = await sessionOf(s25);
    const total = s.totals.totalCents;
    const half = Math.floor(total / 2);

    const p1 = await agents.cashier.post(`/api/sessions/${s25}/payments`).send({ method: 'PIX', amountCents: half, idempotencyKey: key() });
    expect(p1.status).toBe(201);
    expect(p1.body.closed).toBe(false);

    const over = await agents.cashier.post(`/api/sessions/${s25}/payments`).send({ method: 'DEBIT', amountCents: total, idempotencyKey: key() });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('AMOUNT_EXCEEDS_BALANCE');

    const rest = total - half;
    const p2 = await agents.cashier
      .post(`/api/sessions/${s25}/payments`)
      .send({ method: 'CASH', amountCents: rest, receivedCents: rest + 1000, idempotencyKey: key() });
    expect(p2.status).toBe(201);
    expect(p2.body.closed).toBe(true);
    expect(p2.body.session.status).toBe('CLOSED');
    expect(p2.body.session.payments.at(-1).changeCents).toBe(1000);

    const nfc = await nfcOrder(25, s25, [{ productId: ids.doce, quantity: 1 }]);
    expect(nfc.status).toBe(409);
    expect(nfc.body.error.code).toBe('NO_OPEN_SESSION');

    const w = await waiterOrder(s25, [{ productId: ids.doce, quantity: 1 }]);
    expect(w.status).toBe(409);
    expect(w.body.error.code).toBe('SESSION_CLOSED');
  });

  it('perfil sem permissão não registra pagamento', async () => {
    const res = await agents.kitchen.post(`/api/sessions/${s25}/payments`).send({ method: 'PIX', amountCents: 100, idempotencyKey: key() });
    expect(res.status).toBe(403);
  });

  it('reabertura exige administrador e gera auditoria', async () => {
    const denied = await agents.cashier.post(`/api/sessions/${s25}/reopen`).send({ reason: 'teste' });
    expect(denied.status).toBe(403);
    const ok = await agents.admin.post(`/api/sessions/${s25}/reopen`).send({ reason: 'Conferência de valores' });
    expect(ok.status).toBe(200);
    expect(ok.body.session.status).toBe('OPEN');
    const log = await prisma.auditLog.findFirst({ where: { action: 'session.reopen', entityId: s25 } });
    expect(log?.userId).toBe(ids.admin);
    // fecha novamente para os próximos cenários
    const closed = await agents.cashier.post(`/api/sessions/${s25}/close`).send({});
    expect(closed.body.status).toBe('CLOSED');
  });
});

describe('Cenário 5 — reutilização do cartão', () => {
  it('novo atendimento no mesmo cartão começa zerado e preserva o histórico anterior', async () => {
    const before = await sessionOf(s25);
    const novo = await openSession(25, ids.table8);
    expect(novo).not.toBe(s25);

    const card = await request(baseUrl).get(`/api/public/cards/${tokens[25]}`);
    expect(card.body.session.id).toBe(novo);
    expect(card.body.session.orders).toHaveLength(0);
    expect(card.body.session.totals.totalCents).toBe(0);

    // Um carrinho montado no atendimento anterior não é lançado no novo
    const stale = await nfcOrder(25, s25, [{ productId: ids.doce, quantity: 1 }]);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('SESSION_CHANGED');

    const ok = await nfcOrder(25, novo, [{ productId: ids.doce, quantity: 1 }]);
    expect(ok.status).toBe(201);

    const old = await sessionOf(s25);
    expect(old.status).toBe('CLOSED');
    expect(old.totals).toEqual(before.totals);
    expect((await sessionOf(novo)).totals.subtotalCents).toBe(1200);
  });

  it('não permite dois atendimentos abertos na mesma comanda', async () => {
    const res = await agents.waiter.post('/api/sessions').send({ tabNumber: 25 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SESSION_ALREADY_OPEN');
  });
});

describe('Cenário 7 — concorrência', () => {
  it('dois dispositivos enviando pedidos simultâneos: nada se perde nem duplica', async () => {
    const t = await agents.waiter.get('/api/sessions/lookup?tab=12');
    const sid = t.body.session.id;
    const before = (await sessionOf(sid)).totals.subtotalCents;

    const reqs = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0 ? nfcOrder(12, sid, [{ productId: ids.refri, quantity: 1 }]) : waiterOrder(sid, [{ productId: ids.refri, quantity: 1 }]),
    );
    const results = await Promise.all(reqs);
    expect(results.every((r) => r.status === 201)).toBe(true);
    const numbers = new Set(results.map((r) => r.body.number));
    expect(numbers.size).toBe(10);

    const after = await sessionOf(sid);
    expect(after.totals.subtotalCents).toBe(before + 10 * 600);
  });

  it('o mesmo pedido reenviado (clique duplo / rede instável) é gravado uma única vez', async () => {
    const t = await agents.waiter.get('/api/sessions/lookup?tab=13');
    const sid = t.body.session.id;
    const before = await sessionOf(sid);
    const k = key();
    const results = await Promise.all(Array.from({ length: 6 }, () => nfcOrder(13, sid, [{ productId: ids.suco, quantity: 1 }], k)));
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.orderId)).size).toBe(1);
    const after = await sessionOf(sid);
    expect(after.orders.length).toBe(before.orders.length + 1);
  });

  it('pagamentos simultâneos do saldo total: apenas um é aceito', async () => {
    const t = await agents.waiter.get('/api/sessions/lookup?tab=11');
    const sid = t.body.session.id;
    const total = (await sessionOf(sid)).totals.remainingCents;
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        agents.cashier.post(`/api/sessions/${sid}/payments`).send({ method: 'PIX', amountCents: total, idempotencyKey: key() }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const s = await sessionOf(sid);
    expect(s.status).toBe('CLOSED');
    expect(s.totals.paidCents).toBe(total);
  });

  it('pedido e fechamento simultâneos: o pedido entra antes ou é recusado — nunca fica num atendimento fechado sem cobrança', async () => {
    const sid = await openSession(11, ids.table5);
    await waiterOrder(sid, [{ productId: ids.doce, quantity: 1 }]);
    const due = (await sessionOf(sid)).totals.remainingCents;
    const [order, pay] = await Promise.all([
      nfcOrder(11, sid, [{ productId: ids.refri, quantity: 1 }]),
      agents.cashier.post(`/api/sessions/${sid}/payments`).send({ method: 'PIX', amountCents: due, idempotencyKey: key() }),
    ]);
    const s = await sessionOf(sid);
    if (order.status === 201) {
      // O pedido entrou antes: o pagamento não quita tudo, o atendimento continua aberto com saldo
      expect(s.status).toBe('OPEN');
      expect(s.totals.remainingCents).toBeGreaterThan(0);
    } else {
      expect(pay.status).toBe(201);
      expect(s.status).toBe('CLOSED');
      expect(s.totals.remainingCents).toBe(0);
    }
  });
});

describe('Cenário 8 — segurança do cartão NFC', () => {
  it('cartão bloqueado não abre a comanda nem faz pedidos; reativado volta a funcionar', async () => {
    const card = await prisma.nfcCard.findFirstOrThrow({ where: { token: tokens[13] } });
    const t = await agents.waiter.get('/api/sessions/lookup?tab=13');
    const sid = t.body.session.id;

    expect((await agents.waiter.post(`/api/cards/${card.id}/block`).send({})).status).toBe(403); // só admin
    expect((await agents.admin.post(`/api/cards/${card.id}/block`).send({ reason: 'Teste' })).status).toBe(200);

    const get = await request(baseUrl).get(`/api/public/cards/${tokens[13]}`);
    expect(get.status).toBe(403);
    expect(get.body.error.code).toBe('CARD_BLOCKED');
    const order = await nfcOrder(13, sid, [{ productId: ids.doce, quantity: 1 }]);
    expect(order.status).toBe(403);

    // O garçom continua podendo lançar na comanda (o bloqueio é do cartão, não do atendimento)
    expect((await waiterOrder(sid, [{ productId: ids.doce, quantity: 1 }])).status).toBe(201);

    await agents.admin.post(`/api/cards/${card.id}/reactivate`).send({});
    expect((await request(baseUrl).get(`/api/public/cards/${tokens[13]}`)).status).toBe(200);
  });

  it('reemissão revoga o link antigo e o novo link assume a comanda', async () => {
    const res = await agents.admin.post(`/api/cards/tabs/${ids.tab12}/reissue`).send({ reason: 'Link vazado' });
    expect(res.status).toBe(201);
    const newToken = res.body.card.token as string;
    expect(newToken).not.toBe(tokens[12]);

    const old = await request(baseUrl).get(`/api/public/cards/${tokens[12]}`);
    expect(old.status).toBe(403);
    expect(old.body.error.code).toBe('CARD_REVOKED');

    const fresh = await request(baseUrl).get(`/api/public/cards/${newToken}`);
    expect(fresh.status).toBe(200);
    expect(fresh.body.tab.number).toBe(12);
  });

  it('token inexistente ou malformado não revela nada', async () => {
    expect((await request(baseUrl).get('/api/public/cards/abc')).status).toBe(404);
    expect((await request(baseUrl).get(`/api/public/cards/${'x'.repeat(32)}`)).status).toBe(404);
  });

  it('sem cartão aberto pelo funcionário, o cliente não abre atendimento sozinho (auto-abertura desligada)', async () => {
    const t = generateCardToken();
    await prisma.tab.create({ data: { number: 40, cards: { create: { token: t } } } });
    const get = await request(baseUrl).get(`/api/public/cards/${t}`);
    expect(get.body.session).toBeNull();
    expect(get.body.canSelfOpen).toBe(false);
    const open = await request(baseUrl).post(`/api/public/cards/${t}/open`).send({});
    expect(open.status).toBe(403);
  });

  it('APIs internas exigem autenticação e perfil adequado', async () => {
    expect((await request(baseUrl).get('/api/tables')).status).toBe(401);
    expect((await agents.waiter.get('/api/admin/reports/summary')).status).toBe(403);
    expect((await agents.kitchen.get('/api/tables')).status).toBe(403);
    expect((await agents.waiter.post('/api/users').send({})).status).toBe(403);
  });
});

describe('Cancelamentos e relatórios', () => {
  it('pedido cancelado permanece no histórico com motivo e responsável e sai do total', async () => {
    const t = await agents.waiter.get('/api/sessions/lookup?tab=13');
    const sid = t.body.session.id;
    const before = await sessionOf(sid);
    const o = await waiterOrder(sid, [{ productId: ids.salgada, quantity: 2 }]);
    const c = await agents.waiter.post(`/api/orders/${o.body.orderId}/cancel`).send({ reason: 'Pedido lançado errado' });
    expect(c.status).toBe(200);
    const after = await sessionOf(sid);
    const cancelled = after.orders.find((x: { id: string }) => x.id === o.body.orderId);
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'Pedido lançado errado', cancelledBy: { name: 'waiter' } });
    expect(after.totals.subtotalCents).toBe(before.totals.subtotalCents);
  });

  it('fluxo de status da cozinha até a entrega', async () => {
    const t = await agents.waiter.get('/api/sessions/lookup?tab=13');
    const o = await waiterOrder(t.body.session.id, [{ productId: ids.doce, quantity: 1 }]);
    const id = o.body.orderId;
    expect((await agents.waiter.patch(`/api/orders/${id}/status`).send({ status: 'PREPARING' })).status).toBe(403);
    expect((await agents.kitchen.patch(`/api/orders/${id}/status`).send({ status: 'PREPARING' })).status).toBe(200);
    expect((await agents.kitchen.patch(`/api/orders/${id}/status`).send({ status: 'READY' })).status).toBe(200);
    expect((await agents.waiter.patch(`/api/orders/${id}/status`).send({ status: 'DELIVERED' })).status).toBe(200);
    expect((await agents.kitchen.patch(`/api/orders/${id}/status`).send({ status: 'PREPARING' })).status).toBe(409);
  });

  it('relatório soma os pagamentos registrados', async () => {
    const res = await agents.admin.get('/api/admin/reports/summary');
    expect(res.status).toBe(200);
    const paid = await prisma.payment.aggregate({ _sum: { amountCents: true }, where: { status: 'REGISTERED' } });
    expect(res.body.revenueCents).toBe(paid._sum.amountCents);
    expect(res.body.topProducts.length).toBeGreaterThan(0);
  });
});
