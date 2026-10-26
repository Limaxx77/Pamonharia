import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';
import { clientIp, idParam, parseBody, parseQuery } from '../middleware/validate.js';
import {
  closeIfSettled,
  computeTotals,
  findOpenSession,
  getSessionDetail,
  listSessions,
  lockSession,
  lockTab,
  openSession,
  sessionInclude,
  transferSession,
} from '../services/session.service.js';
import { createOrder, createOrderSchema } from '../services/order.service.js';
import { paymentSchema, registerPayment, voidPayment } from '../services/payment.service.js';
import { notifySession } from '../realtime/io.js';

export const sessionRoutes = Router();
export const paymentRoutes = Router();

const listQuery = z.object({
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']).optional(),
  tab: z.coerce.number().int().positive().optional(),
  tableId: z.string().max(64).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
});

sessionRoutes.get('/', requireRole('WAITER', 'CASHIER'), async (req, res) => {
  const q = parseQuery(listQuery, req);
  const where: Prisma.TabSessionWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.tab) where.tab = { number: q.tab };
  if (q.tableId) where.tableId = q.tableId;
  res.json({ sessions: await listSessions(where, q.take) });
});

/** Busca por número de comanda: retorna a comanda e o atendimento aberto (se houver). */
sessionRoutes.get('/lookup', requireRole('WAITER', 'CASHIER'), async (req, res) => {
  const { tab } = parseQuery(z.object({ tab: z.coerce.number().int().positive() }), req);
  const t = await prisma.tab.findUnique({
    where: { number: tab },
    include: { cards: { where: { status: 'ACTIVE' }, select: { id: true } } },
  });
  if (!t) throw notFound(`Comanda ${tab} não cadastrada`);
  const open = await findOpenSession(t.id);
  res.json({
    tab: { id: t.id, number: t.number, active: t.active, hasActiveCard: t.cards.length > 0 },
    session: open ? await getSessionDetail(open.id) : null,
  });
});

const openSchema = z.object({
  tabNumber: z.number().int().positive(),
  tableId: z.string().max(64).optional().nullable(),
  customerName: z.string().trim().max(60).optional().nullable(),
});

sessionRoutes.post('/', requireRole('WAITER', 'CASHIER'), async (req, res) => {
  const body = parseBody(openSchema, req);
  const tab = await prisma.tab.findUnique({ where: { number: body.tabNumber } });
  if (!tab) throw notFound(`Comanda ${body.tabNumber} não cadastrada`);
  const session = await openSession({
    tabId: tab.id,
    tableId: body.tableId ?? null,
    customerName: body.customerName ?? null,
    waiterId: req.user!.role === 'WAITER' ? req.user!.id : null,
    openedById: req.user!.id,
    openedVia: 'STAFF',
    ip: clientIp(req),
  });
  notifySession(session.id);
  res.status(201).json({ session: await getSessionDetail(session.id) });
});

sessionRoutes.get('/:id', requireRole('WAITER', 'CASHIER', 'KITCHEN'), async (req, res) => {
  res.json({ session: await getSessionDetail(idParam(req)) });
});

/** Pedido registrado pelo garçom — mesma rotina e mesma comanda dos pedidos NFC. */
sessionRoutes.post('/:id/orders', requireRole('WAITER'), async (req, res) => {
  const id = idParam(req);
  const input = parseBody(createOrderSchema, req);
  const { order, duplicate } = await createOrder({ sessionId: id, source: 'WAITER', userId: req.user!.id, input });
  // O garçom que lança o pedido passa a ser o responsável, se ainda não houver um.
  if (!duplicate && req.user!.role === 'WAITER') {
    await prisma.tabSession.updateMany({ where: { id, waiterId: null }, data: { waiterId: req.user!.id } });
  }
  res.status(duplicate ? 200 : 201).json({ orderId: order.id, number: order.number, duplicate });
});

const patchSchema = z.object({
  customerName: z.string().trim().max(60).nullable().optional(),
  waiterId: z.string().max(64).nullable().optional(),
});

sessionRoutes.patch('/:id', requireRole('WAITER', 'CASHIER'), async (req, res) => {
  const id = idParam(req);
  const data = parseBody(patchSchema, req);
  const s = await prisma.tabSession.findUnique({ where: { id } });
  if (!s) throw notFound();
  if (s.status !== 'OPEN') throw conflict('SESSION_CLOSED', 'Atendimento encerrado');
  if (data.waiterId) {
    const w = await prisma.user.findUnique({ where: { id: data.waiterId } });
    if (!w || !w.active) throw badRequest('INVALID_WAITER', 'Funcionário inválido');
  }
  await prisma.tabSession.update({ where: { id }, data });
  notifySession(id);
  res.json({ session: await getSessionDetail(id) });
});

sessionRoutes.post('/:id/transfer', requireRole('WAITER', 'CASHIER'), async (req, res) => {
  const id = idParam(req);
  const { tableId } = parseBody(z.object({ tableId: z.string().max(64).nullable() }), req);
  await transferSession(id, tableId, req.user!.id, clientIp(req));
  notifySession(id);
  res.json({ session: await getSessionDetail(id) });
});

sessionRoutes.post('/:id/request-bill', requireRole('WAITER', 'CASHIER'), async (req, res) => {
  const id = idParam(req);
  const { requested } = parseBody(z.object({ requested: z.boolean().default(true) }), req);
  const s = await prisma.tabSession.findUnique({ where: { id } });
  if (!s || s.status !== 'OPEN') throw conflict('SESSION_CLOSED', 'Atendimento encerrado');
  await prisma.tabSession.update({ where: { id }, data: { billRequestedAt: requested ? new Date() : null } });
  notifySession(id);
  res.json({ ok: true });
});

const discountSchema = z.object({
  discountCents: z.number().int().min(0).max(10_000_000),
  reason: z.string().trim().min(3, 'Informe o motivo do desconto').max(200),
});

sessionRoutes.post('/:id/discount', requireRole('CASHIER'), async (req, res) => {
  const id = idParam(req);
  const body = parseBody(discountSchema, req);
  const closed = await prisma.$transaction(async (tx) => {
    const locked = await lockSession(tx, id);
    if (locked.status !== 'OPEN') throw conflict('SESSION_CLOSED', 'Atendimento encerrado');
    const s = await tx.tabSession.findUniqueOrThrow({ where: { id }, include: sessionInclude });
    const t = computeTotals({ ...s, discountCents: 0 });
    if (body.discountCents > t.totalCents - t.paidCents) {
      throw badRequest('DISCOUNT_TOO_HIGH', 'Desconto maior que o saldo pendente');
    }
    await tx.tabSession.update({ where: { id }, data: { discountCents: body.discountCents, discountReason: body.reason } });
    await audit(
      { userId: req.user!.id, action: 'session.discount', entity: 'tab_session', entityId: id, data: body, ip: clientIp(req) },
      tx,
    );
    return closeIfSettled(tx, id, req.user!.id);
  });
  notifySession(id, { closed });
  res.json({ session: await getSessionDetail(id), closed });
});

sessionRoutes.post('/:id/service-fee', requireRole('CASHIER'), async (req, res) => {
  const id = idParam(req);
  const { percent } = parseBody(z.object({ percent: z.number().min(0).max(30) }), req);
  await prisma.$transaction(async (tx) => {
    const locked = await lockSession(tx, id);
    if (locked.status !== 'OPEN') throw conflict('SESSION_CLOSED', 'Atendimento encerrado');
    const s = await tx.tabSession.findUniqueOrThrow({ where: { id }, include: sessionInclude });
    const t = computeTotals({ ...s, serviceFeePercent: percent });
    if (t.paidCents > t.totalCents) throw conflict('BELOW_PAID', 'O total ficaria menor que o valor já pago');
    await tx.tabSession.update({ where: { id }, data: { serviceFeePercent: percent } });
    await audit(
      { userId: req.user!.id, action: 'session.service_fee', entity: 'tab_session', entityId: id, data: { percent }, ip: clientIp(req) },
      tx,
    );
  });
  notifySession(id);
  res.json({ session: await getSessionDetail(id) });
});

sessionRoutes.post('/:id/payments', requireRole('CASHIER'), async (req, res) => {
  const id = idParam(req);
  const input = parseBody(paymentSchema, req);
  const result = await registerPayment(id, input, req.user!.id, clientIp(req));
  res.status(result.duplicate ? 200 : 201).json({
    paymentId: result.payment.id,
    closed: result.closed,
    duplicate: result.duplicate,
    session: await getSessionDetail(id),
  });
});

/**
 * Encerramento manual: atendimento sem consumo é cancelado (aberto por engano);
 * com consumo, só fecha se o saldo estiver quitado.
 */
sessionRoutes.post('/:id/close', requireRole('CASHIER'), async (req, res) => {
  const id = idParam(req);
  const result = await prisma.$transaction(async (tx) => {
    const locked = await lockSession(tx, id);
    if (locked.status !== 'OPEN') throw conflict('SESSION_CLOSED', 'Atendimento já encerrado');
    const s = await tx.tabSession.findUniqueOrThrow({ where: { id }, include: sessionInclude });
    const t = computeTotals(s);
    if (t.itemsCount === 0) {
      await tx.tabSession.update({
        where: { id },
        data: { status: 'CANCELLED', closedAt: new Date(), closedById: req.user!.id },
      });
      await audit({ userId: req.user!.id, action: 'session.cancel_empty', entity: 'tab_session', entityId: id, ip: clientIp(req) }, tx);
      return 'CANCELLED';
    }
    if (t.remainingCents > 0) throw conflict('BALANCE_PENDING', 'Ainda há saldo pendente nesta comanda');
    await closeIfSettled(tx, id, req.user!.id);
    return 'CLOSED';
  });
  notifySession(id, { closed: true });
  res.json({ status: result, session: await getSessionDetail(id) });
});

/** Reabertura: somente administrador, com motivo e auditoria. */
sessionRoutes.post('/:id/reopen', requireRole(), async (req, res) => {
  const id = idParam(req);
  const { reason } = parseBody(z.object({ reason: z.string().trim().min(3).max(200) }), req);
  await prisma.$transaction(async (tx) => {
    const s = await tx.tabSession.findUnique({ where: { id } });
    if (!s) throw notFound();
    await lockTab(tx, s.tabId);
    await lockSession(tx, id);
    if (s.status !== 'CLOSED') throw conflict('NOT_CLOSED', 'Somente atendimentos fechados podem ser reabertos');
    const other = await tx.tabSession.findFirst({ where: { tabId: s.tabId, status: 'OPEN' } });
    if (other) throw conflict('TAB_IN_USE', 'A comanda já está em outro atendimento aberto');
    await tx.tabSession.update({
      where: { id },
      data: { status: 'OPEN', closedAt: null, closedById: null, reopenedAt: new Date() },
    });
    await audit(
      { userId: req.user!.id, action: 'session.reopen', entity: 'tab_session', entityId: id, data: { reason }, ip: clientIp(req) },
      tx,
    );
  });
  notifySession(id);
  res.json({ session: await getSessionDetail(id) });
});

paymentRoutes.post('/:id/void', requireRole(), async (req, res) => {
  const { reason } = parseBody(z.object({ reason: z.string().trim().min(3).max(200) }), req);
  await voidPayment(idParam(req), reason, req.user!.id, clientIp(req));
  res.json({ ok: true });
});
