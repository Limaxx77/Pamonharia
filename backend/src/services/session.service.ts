import { Prisma, type SessionStatus } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';

export const sessionInclude = {
  tab: { select: { id: true, number: true } },
  table: { select: { id: true, number: true, label: true } },
  waiter: { select: { id: true, name: true } },
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  orders: {
    orderBy: { createdAt: 'asc' },
    include: {
      createdBy: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
      items: { include: { addons: true, paymentItems: { include: { payment: { select: { status: true } } } } } },
    },
  },
  payments: {
    orderBy: { createdAt: 'asc' },
    include: { createdBy: { select: { id: true, name: true } }, items: true },
  },
} satisfies Prisma.TabSessionInclude;

type SessionWithAll = Prisma.TabSessionGetPayload<{ include: typeof sessionInclude }>;

export interface Totals {
  subtotalCents: number;
  serviceFeeCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  itemsCount: number;
}

/** Cálculo único de totais — usado pelo cliente, garçom, caixa e relatórios. */
export function computeTotals(s: {
  serviceFeePercent: Prisma.Decimal | number;
  discountCents: number;
  orders: { status: string; items: { totalCents: number; quantity: number }[] }[];
  payments: { status: string; amountCents: number }[];
}): Totals {
  let subtotal = 0;
  let count = 0;
  for (const o of s.orders) {
    if (o.status === 'CANCELLED') continue;
    for (const i of o.items) {
      subtotal += i.totalCents;
      count += i.quantity;
    }
  }
  const pct = Number(s.serviceFeePercent);
  const serviceFee = Math.round((subtotal * pct) / 100);
  const discount = Math.min(s.discountCents, subtotal + serviceFee);
  const total = subtotal + serviceFee - discount;
  const paid = s.payments.filter((p) => p.status === 'REGISTERED').reduce((a, p) => a + p.amountCents, 0);
  return {
    subtotalCents: subtotal,
    serviceFeeCents: serviceFee,
    discountCents: discount,
    totalCents: total,
    paidCents: paid,
    remainingCents: Math.max(0, total - paid),
    itemsCount: count,
  };
}

export function serializeSession(s: SessionWithAll) {
  return {
    id: s.id,
    status: s.status,
    tab: s.tab,
    table: s.table,
    customerName: s.customerName,
    waiter: s.waiter,
    openedBy: s.openedBy,
    closedBy: s.closedBy,
    openedVia: s.openedVia,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    reopenedAt: s.reopenedAt,
    billRequestedAt: s.billRequestedAt,
    serviceFeePercent: Number(s.serviceFeePercent),
    discountCents: s.discountCents,
    discountReason: s.discountReason,
    orders: s.orders.map((o) => ({
      id: o.id,
      number: o.number,
      source: o.source,
      status: o.status,
      note: o.note,
      totalCents: o.totalCents,
      createdAt: o.createdAt,
      statusChangedAt: o.statusChangedAt,
      createdBy: o.createdBy,
      cancelReason: o.cancelReason,
      cancelledBy: o.cancelledBy,
      cancelledAt: o.cancelledAt,
      items: o.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
        totalCents: i.totalCents,
        note: i.note,
        addons: i.addons.map((a) => ({ name: a.name, priceCents: a.priceCents })),
        paidQuantity: i.paymentItems
          .filter((p) => p.payment.status === 'REGISTERED')
          .reduce((a, p) => a + p.quantity, 0),
      })),
    })),
    payments: s.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amountCents: p.amountCents,
      receivedCents: p.receivedCents,
      changeCents: p.receivedCents != null ? Math.max(0, p.receivedCents - p.amountCents) : null,
      status: p.status,
      payerName: p.payerName,
      note: p.note,
      voidReason: p.voidReason,
      createdAt: p.createdAt,
      createdBy: p.createdBy,
      items: p.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity, amountCents: i.amountCents })),
    })),
    totals: computeTotals(s),
  };
}

export type SessionDTO = ReturnType<typeof serializeSession>;

export async function getSessionDetail(id: string, tx: Tx | typeof prisma = prisma) {
  const s = await tx.tabSession.findUnique({ where: { id }, include: sessionInclude });
  if (!s) throw notFound('Atendimento não encontrado');
  return serializeSession(s);
}

/** Bloqueia a linha do atendimento até o fim da transação (SELECT ... FOR UPDATE). */
export async function lockSession(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string; status: SessionStatus; tab_id: string }[]>`
    SELECT id, status, tab_id FROM tab_sessions WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw notFound('Atendimento não encontrado');
  return rows[0];
}

export async function lockTab(tx: Tx, tabId: string) {
  await tx.$queryRaw`SELECT id FROM tabs WHERE id = ${tabId} FOR UPDATE`;
}

export async function findOpenSession(tabId: string, tx: Tx | typeof prisma = prisma) {
  return tx.tabSession.findFirst({ where: { tabId, status: 'OPEN' } });
}

interface OpenSessionInput {
  tabId: string;
  tableId?: string | null;
  customerName?: string | null;
  waiterId?: string | null;
  openedById?: string | null;
  openedVia: 'STAFF' | 'NFC';
  ip?: string | null;
}

/**
 * Abre um novo atendimento para a comanda. Garante (com lock da comanda + índice único parcial)
 * que exista no máximo um atendimento aberto por comanda.
 */
export async function openSession(input: OpenSessionInput) {
  return prisma.$transaction(async (tx) => {
    const tab = await tx.tab.findUnique({ where: { id: input.tabId } });
    if (!tab) throw notFound('Comanda não encontrada');
    if (!tab.active) throw conflict('TAB_INACTIVE', 'Comanda desativada');
    await lockTab(tx, tab.id);

    const existing = await findOpenSession(tab.id, tx);
    if (existing) throw conflict('SESSION_ALREADY_OPEN', `A comanda ${tab.number} já possui um atendimento aberto`);

    if (input.tableId) {
      const table = await tx.diningTable.findUnique({ where: { id: input.tableId } });
      if (!table || !table.active) throw badRequest('INVALID_TABLE', 'Mesa inválida');
    }

    const settings = await tx.settings.findUnique({ where: { id: 1 } });
    const session = await tx.tabSession.create({
      data: {
        tabId: tab.id,
        tableId: input.tableId ?? null,
        customerName: input.customerName ?? null,
        waiterId: input.waiterId ?? null,
        openedById: input.openedById ?? null,
        openedVia: input.openedVia,
        serviceFeePercent: settings?.serviceFeePercent ?? 10,
      },
    });
    await audit(
      {
        userId: input.openedById,
        action: 'session.open',
        entity: 'tab_session',
        entityId: session.id,
        data: { tabNumber: tab.number, tableId: input.tableId ?? null, via: input.openedVia },
        ip: input.ip,
      },
      tx,
    );
    return session;
  });
}

export async function transferSession(sessionId: string, tableId: string | null, userId: string, ip: string | null) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockSession(tx, sessionId);
    if (locked.status !== 'OPEN') throw conflict('SESSION_CLOSED', 'Somente atendimentos abertos podem ser transferidos');
    const before = await tx.tabSession.findUniqueOrThrow({ where: { id: sessionId }, include: { table: true } });
    let toNumber: number | null = null;
    if (tableId) {
      const table = await tx.diningTable.findUnique({ where: { id: tableId } });
      if (!table || !table.active) throw badRequest('INVALID_TABLE', 'Mesa inválida');
      toNumber = table.number;
    }
    await tx.tabSession.update({ where: { id: sessionId }, data: { tableId } });
    await audit(
      {
        userId,
        action: 'session.transfer',
        entity: 'tab_session',
        entityId: sessionId,
        data: { fromTable: before.table?.number ?? null, toTable: toNumber },
        ip,
      },
      tx,
    );
    return { fromTableId: before.tableId, toTableId: tableId };
  });
}

/**
 * Fecha o atendimento se não houver saldo pendente. Chamado após registrar pagamentos
 * ou aplicar descontos. Deve rodar dentro de uma transação que já bloqueou a sessão.
 */
export async function closeIfSettled(tx: Tx, sessionId: string, userId: string | null) {
  const s = await tx.tabSession.findUniqueOrThrow({ where: { id: sessionId }, include: sessionInclude });
  const totals = computeTotals(s);
  if (totals.itemsCount > 0 && totals.remainingCents === 0) {
    await tx.tabSession.update({
      where: { id: sessionId },
      data: { status: 'CLOSED', closedAt: new Date(), closedById: userId },
    });
    await audit({ userId, action: 'session.close', entity: 'tab_session', entityId: sessionId, data: { ...totals } }, tx);
    return true;
  }
  return false;
}

export async function listSessions(where: Prisma.TabSessionWhereInput, take = 50) {
  const rows = await prisma.tabSession.findMany({
    where,
    include: sessionInclude,
    orderBy: { openedAt: 'desc' },
    take,
  });
  return rows.map(serializeSession);
}

export function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}
