import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';
import { clientIp, idParam, parseBody } from '../middleware/validate.js';
import { cardUrl, generateCardToken } from '../lib/tokens.js';
import { emitStaff, RT } from '../realtime/io.js';

export const cardRoutes = Router();

const changed = () => emitStaff(RT.CARDS_UPDATED, {});

function serializeCard(c: { id: string; token: string; status: string; label: string | null; statusReason: string | null; issuedAt: Date; statusChangedAt: Date | null; lastUsedAt: Date | null }) {
  return { ...c, url: cardUrl(c.token) };
}

/** Lista de comandas com o cartão vigente (ou o mais recente) e o atendimento aberto. */
cardRoutes.get('/', requireRole(), async (_req, res) => {
  const tabs = await prisma.tab.findMany({
    orderBy: { number: 'asc' },
    include: {
      cards: { orderBy: { issuedAt: 'desc' } },
      sessions: { where: { status: 'OPEN' }, select: { id: true, openedAt: true, table: { select: { number: true } } } },
      _count: { select: { sessions: true } },
    },
  });
  res.json({
    tabs: tabs.map((t) => ({
      id: t.id,
      number: t.number,
      active: t.active,
      currentCard: t.cards[0] ? serializeCard(t.cards[0]) : null,
      cardsIssued: t.cards.length,
      openSession: t.sessions[0] ?? null,
      sessionsCount: t._count.sessions,
    })),
  });
});

/** Cadastra comandas (individual ou em lote) e emite um cartão para cada uma. */
cardRoutes.post('/', requireRole(), async (req, res) => {
  const { from, to, label } = parseBody(
    z
      .object({
        from: z.number().int().min(1).max(9999),
        to: z.number().int().min(1).max(9999).optional(),
        label: z.string().trim().max(40).optional().nullable(),
      })
      .refine((v) => !v.to || (v.to >= v.from && v.to - v.from < 200), 'Intervalo inválido (máx. 200 por vez)'),
    req,
  );
  const last = to ?? from;
  const created: number[] = [];
  const skipped: number[] = [];
  for (let n = from; n <= last; n++) {
    const exists = await prisma.tab.findUnique({ where: { number: n } });
    if (exists) {
      skipped.push(n);
      continue;
    }
    await prisma.tab.create({ data: { number: n, cards: { create: { token: generateCardToken(), label: label ?? null } } } });
    created.push(n);
  }
  await audit({ userId: req.user!.id, action: 'card.create', entity: 'tab', data: { created, skipped }, ip: clientIp(req) });
  changed();
  res.status(201).json({ created, skipped });
});

/** Reemite o cartão: revoga todos os tokens anteriores e gera um novo link. */
cardRoutes.post('/tabs/:tabId/reissue', requireRole(), async (req, res) => {
  const tabId = idParam(req, 'tabId');
  const { reason } = parseBody(z.object({ reason: z.string().trim().max(200).default('Reemissão') }), req);
  const card = await prisma.$transaction(async (tx) => {
    const tab = await tx.tab.findUnique({ where: { id: tabId } });
    if (!tab) throw notFound('Comanda não encontrada');
    await tx.nfcCard.updateMany({
      where: { tabId, status: { in: ['ACTIVE', 'BLOCKED', 'LOST'] } },
      data: { status: 'REVOKED', statusReason: reason, statusChangedAt: new Date() },
    });
    const c = await tx.nfcCard.create({ data: { tabId, token: generateCardToken() } });
    await audit({ userId: req.user!.id, action: 'card.reissue', entity: 'nfc_card', entityId: c.id, data: { tabNumber: tab.number, reason }, ip: clientIp(req) }, tx);
    return c;
  });
  changed();
  res.status(201).json({ card: serializeCard(card) });
});

const transitions: Record<string, { to: 'ACTIVE' | 'BLOCKED' | 'LOST' | 'REVOKED'; from: string[] }> = {
  block: { to: 'BLOCKED', from: ['ACTIVE', 'LOST'] },
  lost: { to: 'LOST', from: ['ACTIVE', 'BLOCKED'] },
  reactivate: { to: 'ACTIVE', from: ['BLOCKED', 'LOST'] },
  revoke: { to: 'REVOKED', from: ['ACTIVE', 'BLOCKED', 'LOST'] },
};

cardRoutes.post('/:id/:action', requireRole(), async (req, res) => {
  const id = idParam(req);
  const t = transitions[req.params.action as string];
  if (!t) throw badRequest('INVALID_ACTION', 'Ação inválida');
  const { reason } = parseBody(z.object({ reason: z.string().trim().max(200).optional().nullable() }), req);
  const card = await prisma.nfcCard.findUnique({ where: { id } });
  if (!card) throw notFound('Cartão não encontrado');
  if (!t.from.includes(card.status)) throw conflict('INVALID_TRANSITION', `Cartão está ${card.status}`);
  if (t.to === 'ACTIVE') {
    const other = await prisma.nfcCard.findFirst({ where: { tabId: card.tabId, status: 'ACTIVE', id: { not: id } } });
    if (other) throw conflict('ANOTHER_ACTIVE', 'Esta comanda já possui outro cartão ativo');
  }
  const updated = await prisma.nfcCard.update({
    where: { id },
    data: { status: t.to, statusReason: reason ?? null, statusChangedAt: new Date() },
  });
  await audit({ userId: req.user!.id, action: `card.${req.params.action}`, entity: 'nfc_card', entityId: id, data: { reason: reason ?? null }, ip: clientIp(req) });
  changed();
  res.json({ card: serializeCard(updated) });
});

/** Histórico do cartão/comanda: cartões emitidos, atendimentos e auditoria. */
cardRoutes.get('/tabs/:tabId/history', requireRole(), async (req, res) => {
  const tabId = idParam(req, 'tabId');
  const tab = await prisma.tab.findUnique({
    where: { id: tabId },
    include: {
      cards: { orderBy: { issuedAt: 'desc' } },
      sessions: {
        orderBy: { openedAt: 'desc' },
        take: 30,
        include: {
          table: { select: { number: true } },
          orders: { select: { status: true, totalCents: true } },
          payments: { where: { status: 'REGISTERED' }, select: { amountCents: true } },
        },
      },
    },
  });
  if (!tab) throw notFound('Comanda não encontrada');
  const logs = await prisma.auditLog.findMany({
    where: { OR: [{ entity: 'nfc_card', entityId: { in: tab.cards.map((c) => c.id) } }, { entity: 'tab_session', entityId: { in: tab.sessions.map((s) => s.id) } }] },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { user: { select: { name: true } } },
  });
  res.json({
    tab: { id: tab.id, number: tab.number },
    cards: tab.cards.map(serializeCard),
    sessions: tab.sessions.map((s) => ({
      id: s.id,
      status: s.status,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      tableNumber: s.table?.number ?? null,
      orders: s.orders.length,
      consumedCents: s.orders.filter((o) => o.status !== 'CANCELLED').reduce((a, o) => a + o.totalCents, 0),
      paidCents: s.payments.reduce((a, p) => a + p.amountCents, 0),
    })),
    logs,
  });
});
