import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { conflict, HttpError, notFound } from '../lib/errors.js';
import { clientIp, idParam, parseBody } from '../middleware/validate.js';
import { getPublicMenu, getSettings, publicSettings } from '../services/menu.service.js';
import { findOpenSession, getSessionDetail, openSession, type SessionDTO } from '../services/session.service.js';
import { createOrder, createOrderSchema } from '../services/order.service.js';
import { emitStaff, notifySession, RT } from '../realtime/io.js';
import { padTab } from '../lib/tokens.js';

export const publicRoutes = Router();

const isTest = () => process.env.NODE_ENV === 'test';

const cardLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: isTest,
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Muitas requisições. Aguarde um instante.' } },
  skip: isTest,
});

publicRoutes.get('/settings', async (_req, res) => {
  res.json(publicSettings(await getSettings()));
});

publicRoutes.get('/menu', async (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json({ categories: await getPublicMenu() });
});

/** Valida o token do cartão. Cartões bloqueados, perdidos ou revogados nunca autorizam pedidos. */
async function resolveCard(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw notFound('Cartão não encontrado');
  const card = await prisma.nfcCard.findUnique({ where: { token }, include: { tab: true } });
  if (!card) throw notFound('Cartão não encontrado');
  if (card.status !== 'ACTIVE') {
    throw new HttpError(403, 'CARD_' + card.status, 'Este cartão não está ativo. Procure um atendente.');
  }
  if (!card.tab.active) throw new HttpError(403, 'TAB_INACTIVE', 'Comanda desativada. Procure um atendente.');
  return card;
}

/** Visão do cliente: sem nomes de funcionários. */
function toCustomerView(s: SessionDTO) {
  return {
    id: s.id,
    status: s.status,
    tabNumber: s.tab.number,
    tableNumber: s.table?.number ?? null,
    customerName: s.customerName,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    billRequestedAt: s.billRequestedAt,
    serviceFeePercent: s.serviceFeePercent,
    orders: s.orders.map((o) => ({
      id: o.id,
      number: o.number,
      source: o.source,
      status: o.status,
      note: o.note,
      totalCents: o.totalCents,
      createdAt: o.createdAt,
      statusChangedAt: o.statusChangedAt,
      cancelReason: o.cancelReason,
      items: o.items.map((i) => ({
        id: i.id,
        productName: i.productName,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        totalCents: i.totalCents,
        note: i.note,
        addons: i.addons,
      })),
    })),
    payments: s.payments
      .filter((p) => p.status === 'REGISTERED')
      .map((p) => ({ id: p.id, method: p.method, amountCents: p.amountCents, createdAt: p.createdAt })),
    totals: s.totals,
  };
}

const RECENT_CLOSED_MS = 2 * 60 * 60 * 1000;

/**
 * Estado do cartão. `session` é sempre o atendimento ABERTO atual (ou null): assim que a conta é
 * fechada, o cartão fica livre para um novo atendimento. O atendimento recém-encerrado vem à parte
 * (`lastClosed`), apenas para o aparelho que o acompanhava (informa o próprio sessionId) e por pouco
 * tempo — o próximo cliente que usar o cartão não vê o consumo do anterior.
 */
publicRoutes.get('/cards/:token', cardLimiter, async (req, res) => {
  const card = await resolveCard(idParam(req, 'token'));
  await prisma.nfcCard.update({ where: { id: card.id }, data: { lastUsedAt: new Date() } });
  const settings = await getSettings();
  const open = await findOpenSession(card.tabId);
  const session = open ? toCustomerView(await getSessionDetail(open.id)) : null;

  let lastClosed = null;
  const known = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
  if (known && !open) {
    const prev = await prisma.tabSession.findFirst({ where: { id: known, tabId: card.tabId, status: 'CLOSED' } });
    if (prev?.closedAt && Date.now() - prev.closedAt.getTime() < RECENT_CLOSED_MS) {
      lastClosed = toCustomerView(await getSessionDetail(prev.id));
    }
  }

  res.json({
    tab: { number: card.tab.number, label: padTab(card.tab.number) },
    session,
    lastClosed,
    canSelfOpen: !open && settings.allowSelfOpen,
    settings: publicSettings(settings),
  });
});

/** Cliente inicia o atendimento pelo cartão (somente se permitido nas configurações). */
publicRoutes.post('/cards/:token/open', orderLimiter, async (req, res) => {
  const card = await resolveCard(idParam(req, 'token'));
  const settings = await getSettings();
  if (!settings.allowSelfOpen) {
    throw new HttpError(403, 'SELF_OPEN_DISABLED', 'Solicite a abertura da comanda a um atendente.');
  }
  const body = parseBody(z.object({ customerName: z.string().trim().max(60).optional().nullable() }), req);
  // A mesa não é informada pelo cliente: a comanda N fica na mesa N (vínculo automático no serviço).
  const session = await openSession({
    tabId: card.tabId,
    customerName: body.customerName || null,
    openedVia: 'NFC',
    ip: clientIp(req),
  });
  notifySession(session.id);
  res.status(201).json({ session: toCustomerView(await getSessionDetail(session.id)) });
});

const nfcOrderSchema = createOrderSchema.extend({ sessionId: z.string().min(1).max(64) });

/**
 * Pedido pelo cartão NFC. O dispositivo precisa informar o atendimento que está vendo (sessionId):
 * um carrinho montado em um atendimento antigo nunca é lançado no atendimento seguinte.
 */
publicRoutes.post('/cards/:token/orders', orderLimiter, async (req, res) => {
  const card = await resolveCard(idParam(req, 'token'));
  const body = parseBody(nfcOrderSchema, req);
  const open = await findOpenSession(card.tabId);
  if (!open) throw conflict('NO_OPEN_SESSION', 'Esta comanda não possui atendimento aberto. Procure um atendente.');
  if (open.id !== body.sessionId) {
    throw conflict('SESSION_CHANGED', 'O atendimento desta comanda mudou. Atualize a página e confira seu pedido.');
  }
  const { order, duplicate } = await createOrder({ sessionId: open.id, source: 'NFC', input: body });
  res.status(duplicate ? 200 : 201).json({ orderId: order.id, number: order.number, duplicate });
});

publicRoutes.post('/cards/:token/request-bill', orderLimiter, async (req, res) => {
  const card = await resolveCard(idParam(req, 'token'));
  const open = await findOpenSession(card.tabId);
  if (!open) throw conflict('NO_OPEN_SESSION', 'Esta comanda não possui atendimento aberto.');
  await prisma.tabSession.update({ where: { id: open.id }, data: { billRequestedAt: new Date() } });
  notifySession(open.id);
  emitStaff(RT.WAITER_CALL, { kind: 'bill', sessionId: open.id, tabNumber: card.tab.number, tableId: open.tableId });
  res.json({ ok: true });
});

publicRoutes.post('/cards/:token/call-waiter', orderLimiter, async (req, res) => {
  const card = await resolveCard(idParam(req, 'token'));
  const open = await findOpenSession(card.tabId);
  const table = open?.tableId ? await prisma.diningTable.findUnique({ where: { id: open.tableId } }) : null;
  emitStaff(RT.WAITER_CALL, {
    kind: 'call',
    sessionId: open?.id ?? null,
    tabNumber: card.tab.number,
    tableNumber: table?.number ?? null,
  });
  res.json({ ok: true });
});
