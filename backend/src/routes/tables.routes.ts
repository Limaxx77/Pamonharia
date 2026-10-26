import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';
import { clientIp, idParam, parseBody } from '../middleware/validate.js';
import { serializeSession, sessionInclude, type SessionDTO } from '../services/session.service.js';
import { emitStaff, RT } from '../realtime/io.js';

export const tableRoutes = Router();

export type TableState = 'FREE' | 'OCCUPIED' | 'WAITING_ORDER' | 'PREPARING' | 'WAITING_PAYMENT';

/** Estado visual da mesa a partir dos atendimentos abertos (ordem de prioridade). */
export function tableState(sessions: SessionDTO[]): TableState {
  if (sessions.length === 0) return 'FREE';
  if (sessions.some((s) => s.billRequestedAt)) return 'WAITING_PAYMENT';
  const live = sessions.flatMap((s) => s.orders).filter((o) => o.status !== 'CANCELLED');
  if (live.some((o) => o.status === 'RECEIVED' || o.status === 'PREPARING')) return 'PREPARING';
  if (live.length === 0) return 'WAITING_ORDER';
  return 'OCCUPIED';
}

function consolidate(sessions: SessionDTO[]) {
  return sessions.reduce(
    (acc, s) => ({
      subtotalCents: acc.subtotalCents + s.totals.subtotalCents,
      totalCents: acc.totalCents + s.totals.totalCents,
      paidCents: acc.paidCents + s.totals.paidCents,
      remainingCents: acc.remainingCents + s.totals.remainingCents,
      itemsCount: acc.itemsCount + s.totals.itemsCount,
    }),
    { subtotalCents: 0, totalCents: 0, paidCents: 0, remainingCents: 0, itemsCount: 0 },
  );
}

tableRoutes.get('/', requireRole('WAITER', 'CASHIER'), async (req, res) => {
  const includeInactive = req.query.all === '1' && req.user!.role === 'ADMIN';
  const tables = await prisma.diningTable.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { number: 'asc' },
    include: { sessions: { where: { status: 'OPEN' }, include: sessionInclude, orderBy: { openedAt: 'asc' } } },
  });
  res.json({
    tables: tables.map((t) => {
      const sessions = t.sessions.map(serializeSession);
      const live = sessions.flatMap((s) => s.orders).filter((o) => o.status !== 'CANCELLED');
      return {
        id: t.id,
        number: t.number,
        label: t.label,
        seats: t.seats,
        active: t.active,
        state: tableState(sessions),
        openedAt: sessions[0]?.openedAt ?? null,
        waiter: sessions.find((s) => s.waiter)?.waiter ?? null,
        readyOrders: live.filter((o) => o.status === 'READY').length,
        tabs: sessions.map((s) => ({
          sessionId: s.id,
          tabNumber: s.tab.number,
          customerName: s.customerName,
          totalCents: s.totals.totalCents,
        })),
        totals: consolidate(sessions),
      };
    }),
  });
});

tableRoutes.get('/:id', requireRole('WAITER', 'CASHIER'), async (req, res) => {
  const t = await prisma.diningTable.findUnique({
    where: { id: idParam(req) },
    include: { sessions: { where: { status: 'OPEN' }, include: sessionInclude, orderBy: { openedAt: 'asc' } } },
  });
  if (!t) throw notFound('Mesa não encontrada');
  const sessions = t.sessions.map(serializeSession);
  res.json({
    table: { id: t.id, number: t.number, label: t.label, seats: t.seats, active: t.active },
    state: tableState(sessions),
    sessions,
    totals: consolidate(sessions),
  });
});

const tableSchema = z.object({
  number: z.number().int().min(1).max(9999),
  label: z.string().trim().max(40).optional().nullable(),
  seats: z.number().int().min(1).max(50).default(4),
  active: z.boolean().optional(),
});

tableRoutes.post('/', requireRole(), async (req, res) => {
  const data = parseBody(tableSchema, req);
  if (await prisma.diningTable.findUnique({ where: { number: data.number } })) {
    throw conflict('TABLE_EXISTS', `A mesa ${data.number} já existe`);
  }
  const table = await prisma.diningTable.create({ data });
  await audit({ userId: req.user!.id, action: 'table.create', entity: 'table', entityId: table.id, data, ip: clientIp(req) });
  emitStaff(RT.TABLES_UPDATED, {});
  res.status(201).json({ table });
});

tableRoutes.patch('/:id', requireRole(), async (req, res) => {
  const id = idParam(req);
  const data = parseBody(tableSchema.partial(), req);
  if (data.active === false) {
    const open = await prisma.tabSession.count({ where: { tableId: id, status: 'OPEN' } });
    if (open > 0) throw conflict('TABLE_IN_USE', 'Não é possível desativar uma mesa com comandas abertas');
  }
  const table = await prisma.diningTable.update({ where: { id }, data });
  await audit({ userId: req.user!.id, action: 'table.update', entity: 'table', entityId: id, data, ip: clientIp(req) });
  emitStaff(RT.TABLES_UPDATED, {});
  res.json({ table });
});
