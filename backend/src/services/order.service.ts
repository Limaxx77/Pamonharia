import { z } from 'zod';
import type { OrderSource, OrderStatus, Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { isUniqueViolation, lockSession } from './session.service.js';
import { emitSession, emitStaff, notifySession, RT } from '../realtime/io.js';

export const orderItemsSchema = z
  .array(
    z.object({
      productId: z.string().min(1).max(64),
      quantity: z.number().int().min(1).max(50),
      addonIds: z.array(z.string().min(1).max(64)).max(10).default([]),
      note: z.string().trim().max(200).optional().nullable(),
    }),
  )
  .min(1, 'O pedido precisa ter pelo menos um item')
  .max(40);

export const createOrderSchema = z.object({
  items: orderItemsSchema,
  note: z.string().trim().max(300).optional().nullable(),
  idempotencyKey: z.string().min(8).max(100),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderInclude = {
  items: { include: { addons: true } },
  session: {
    select: {
      id: true,
      customerName: true,
      tab: { select: { number: true } },
      table: { select: { number: true } },
    },
  },
  createdBy: { select: { id: true, name: true } },
} as const;

/**
 * Cria um pedido em um atendimento. É a ÚNICA rotina de criação de pedidos:
 * pedidos via cartão NFC e via garçom passam por aqui e alimentam a mesma comanda.
 *
 * - Idempotente: a mesma idempotencyKey retorna o pedido já criado (cliques repetidos, reenvio).
 * - Concorrência: a sessão é bloqueada (FOR UPDATE) e o status é verificado dentro da transação,
 *   então um pedido nunca entra num atendimento que acabou de ser fechado.
 * - Preços: o preço vigente é copiado para o item (snapshot).
 */
export async function createOrder(params: {
  sessionId: string;
  source: OrderSource;
  userId?: string | null;
  input: CreateOrderInput;
}) {
  const { sessionId, source, userId, input } = params;

  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: orderInclude });
  if (existing) {
    if (existing.sessionId !== sessionId) throw conflict('IDEMPOTENCY_MISMATCH', 'Chave de pedido já utilizada');
    return { order: existing, duplicate: true };
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const locked = await lockSession(tx, sessionId);
      if (locked.status !== 'OPEN') {
        throw conflict('SESSION_CLOSED', 'Este atendimento está encerrado e não aceita novos pedidos');
      }

      const productIds = [...new Set(input.items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        include: { addons: true, category: { select: { name: true, active: true } } },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      const items = input.items.map((it) => {
        const p = byId.get(it.productId);
        if (!p || !p.active || !p.category.active) throw badRequest('PRODUCT_NOT_FOUND', 'Produto não encontrado no cardápio');
        if (!p.available) throw conflict('PRODUCT_UNAVAILABLE', `${p.name} está indisponível no momento`);
        const addonIds = [...new Set(it.addonIds)];
        const addons = addonIds.map((aid) => {
          const a = p.addons.find((x) => x.id === aid);
          if (!a || !a.active) throw badRequest('ADDON_NOT_FOUND', `Adicional inválido para ${p.name}`);
          return a;
        });
        const base = p.promoPriceCents ?? p.priceCents;
        const unit = base + addons.reduce((s, a) => s + a.priceCents, 0);
        return {
          productId: p.id,
          productName: p.name,
          categoryName: p.category.name,
          unitPriceCents: unit,
          quantity: it.quantity,
          totalCents: unit * it.quantity,
          note: it.note || null,
          addons: { create: addons.map((a) => ({ addonId: a.id, name: a.name, priceCents: a.priceCents })) },
        };
      });

      const total = items.reduce((s, i) => s + i.totalCents, 0);
      const created = await tx.order.create({
        data: {
          sessionId,
          source,
          note: input.note || null,
          idempotencyKey: input.idempotencyKey,
          createdById: userId ?? null,
          totalCents: total,
          items: { create: items },
        },
        include: orderInclude,
      });

      // Um novo pedido indica que o cliente continua consumindo: limpa o "pediu a conta".
      await tx.tabSession.update({ where: { id: sessionId }, data: { billRequestedAt: null } });
      return created;
    });

    emitStaff(RT.ORDER_NEW, { orderId: order.id, sessionId, number: order.number, source });
    emitSession(sessionId, RT.ORDER_UPDATED, { orderId: order.id, sessionId });
    notifySession(sessionId);
    return { order, duplicate: false };
  } catch (e) {
    // Duas requisições simultâneas com a mesma chave: a segunda falha no índice único.
    if (isUniqueViolation(e)) {
      const dup = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: orderInclude });
      if (dup && dup.sessionId === sessionId) return { order: dup, duplicate: true };
    }
    throw e;
  }
}

const FLOW: Record<OrderStatus, OrderStatus[]> = {
  RECEIVED: ['PREPARING', 'READY'],
  PREPARING: ['READY', 'RECEIVED'],
  READY: ['DELIVERED', 'PREPARING'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Quem pode mover o pedido para cada status. */
const STATUS_ROLES: Record<OrderStatus, Role[]> = {
  RECEIVED: ['KITCHEN'],
  PREPARING: ['KITCHEN'],
  READY: ['KITCHEN'],
  DELIVERED: ['KITCHEN', 'WAITER'],
  CANCELLED: [],
};

export async function updateOrderStatus(orderId: string, status: OrderStatus, user: { id: string; role: Role }) {
  if (user.role !== 'ADMIN' && !STATUS_ROLES[status].includes(user.role)) throw forbidden();
  const order = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
    const current = await tx.order.findUnique({ where: { id: orderId } });
    if (!current) throw notFound('Pedido não encontrado');
    if (!FLOW[current.status].includes(status)) {
      throw conflict('INVALID_STATUS', `Não é possível mudar de ${current.status} para ${status}`);
    }
    return tx.order.update({
      where: { id: orderId },
      data: { status, statusChangedAt: new Date() },
      include: orderInclude,
    });
  });
  emitStaff(RT.ORDER_UPDATED, { orderId, sessionId: order.sessionId, status });
  emitSession(order.sessionId, RT.ORDER_UPDATED, { orderId, sessionId: order.sessionId, status });
  notifySession(order.sessionId);
  return order;
}

/**
 * Cancela um pedido mantendo-o no histórico, com motivo e responsável.
 * Garçom só cancela pedidos ainda não iniciados; caixa e administrador cancelam qualquer pedido não entregue
 * de um atendimento aberto.
 */
export async function cancelOrder(orderId: string, reason: string, user: { id: string; role: Role }, ip: string | null) {
  const order = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id: orderId } });
    if (!current) throw notFound('Pedido não encontrado');
    const locked = await lockSession(tx, current.sessionId);
    if (locked.status !== 'OPEN') throw conflict('SESSION_CLOSED', 'O atendimento está encerrado');
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (fresh.status === 'CANCELLED') throw conflict('ALREADY_CANCELLED', 'Pedido já cancelado');
    if (user.role === 'WAITER' && fresh.status !== 'RECEIVED') {
      throw forbidden('O garçom só pode cancelar pedidos que ainda não entraram em preparo');
    }
    if (user.role === 'KITCHEN') throw forbidden();
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        cancelReason: reason,
        cancelledById: user.id,
        cancelledAt: new Date(),
        statusChangedAt: new Date(),
      },
      include: orderInclude,
    });
    await audit(
      {
        userId: user.id,
        action: 'order.cancel',
        entity: 'order',
        entityId: orderId,
        data: { reason, previousStatus: fresh.status, totalCents: fresh.totalCents },
        ip,
      },
      tx,
    );
    return updated;
  });
  emitStaff(RT.ORDER_UPDATED, { orderId, sessionId: order.sessionId, status: 'CANCELLED' });
  emitSession(order.sessionId, RT.ORDER_UPDATED, { orderId, sessionId: order.sessionId, status: 'CANCELLED' });
  notifySession(order.sessionId);
  return order;
}

export function serializeKitchenOrder(o: Awaited<ReturnType<typeof listKitchenOrders>>[number]) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    source: o.source,
    note: o.note,
    createdAt: o.createdAt,
    statusChangedAt: o.statusChangedAt,
    sessionId: o.sessionId,
    tabNumber: o.session.tab.number,
    tableNumber: o.session.table?.number ?? null,
    customerName: o.session.customerName,
    createdBy: o.createdBy,
    items: o.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      quantity: i.quantity,
      note: i.note,
      addons: i.addons.map((a) => a.name),
    })),
  };
}

export function listKitchenOrders(statuses: OrderStatus[], since?: Date) {
  return prisma.order.findMany({
    where: { status: { in: statuses }, ...(since ? { statusChangedAt: { gte: since } } : {}) },
    include: orderInclude,
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
}
