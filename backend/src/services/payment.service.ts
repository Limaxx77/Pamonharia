import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { closeIfSettled, computeTotals, isUniqueViolation, lockSession, sessionInclude } from './session.service.js';
import { notifySession } from '../realtime/io.js';

export const paymentSchema = z.object({
  method: z.enum(['PIX', 'CASH', 'DEBIT', 'CREDIT']),
  amountCents: z.number().int().positive().max(10_000_000),
  /** Somente dinheiro: valor entregue pelo cliente, para cálculo do troco */
  receivedCents: z.number().int().positive().max(10_000_000).optional().nullable(),
  payerName: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
  /** Divisão por itens: quais itens (e quantas unidades) este pagamento quita */
  items: z
    .array(z.object({ orderItemId: z.string().min(1).max(64), quantity: z.number().int().positive().max(50) }))
    .max(100)
    .optional(),
  idempotencyKey: z.string().min(8).max(100),
});

export type PaymentInput = z.infer<typeof paymentSchema>;

/**
 * Registra um pagamento (operacional — NÃO confirma transação em adquirente/PIX).
 * Quando o saldo chega a zero, o atendimento é fechado na mesma transação.
 */
export async function registerPayment(sessionId: string, input: PaymentInput, userId: string, ip: string | null) {
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.sessionId !== sessionId) throw conflict('IDEMPOTENCY_MISMATCH', 'Chave de pagamento já utilizada');
    return { payment: existing, closed: false, duplicate: true };
  }

  if (input.method !== 'CASH' && input.receivedCents != null) {
    throw badRequest('INVALID_RECEIVED', 'Valor recebido só se aplica a pagamentos em dinheiro');
  }
  if (input.receivedCents != null && input.receivedCents < input.amountCents) {
    throw badRequest('INSUFFICIENT_CASH', 'Valor recebido menor que o valor do pagamento');
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await lockSession(tx, sessionId);
      if (locked.status !== 'OPEN') throw conflict('SESSION_CLOSED', 'Este atendimento já está encerrado');

      const s = await tx.tabSession.findUniqueOrThrow({ where: { id: sessionId }, include: sessionInclude });
      const totals = computeTotals(s);
      if (totals.itemsCount === 0) throw conflict('EMPTY_SESSION', 'Não há consumo para pagar');
      if (input.amountCents > totals.remainingCents) {
        throw badRequest(
          'AMOUNT_EXCEEDS_BALANCE',
          `Valor maior que o saldo pendente (${(totals.remainingCents / 100).toFixed(2)})`,
        );
      }

      // Validação da divisão por itens: não permitir pagar mais unidades do que existem.
      if (input.items?.length) {
        const itemsById = new Map(
          s.orders.filter((o) => o.status !== 'CANCELLED').flatMap((o) => o.items.map((i) => [i.id, i] as const)),
        );
        for (const sel of input.items) {
          const item = itemsById.get(sel.orderItemId);
          if (!item) throw badRequest('INVALID_ITEM', 'Item não pertence a este atendimento');
          const alreadyPaid = item.paymentItems
            .filter((p) => p.payment.status === 'REGISTERED')
            .reduce((a, p) => a + p.quantity, 0);
          if (alreadyPaid + sel.quantity > item.quantity) {
            throw conflict('ITEM_ALREADY_PAID', `${item.productName}: quantidade já paga`);
          }
        }
      }

      const itemsById = new Map(s.orders.flatMap((o) => o.items.map((i) => [i.id, i] as const)));
      const payment = await tx.payment.create({
        data: {
          sessionId,
          method: input.method,
          amountCents: input.amountCents,
          receivedCents: input.method === 'CASH' ? (input.receivedCents ?? null) : null,
          payerName: input.payerName || null,
          note: input.note || null,
          idempotencyKey: input.idempotencyKey,
          createdById: userId,
          items: input.items?.length
            ? {
                create: input.items.map((i) => ({
                  orderItemId: i.orderItemId,
                  quantity: i.quantity,
                  amountCents: (itemsById.get(i.orderItemId)?.unitPriceCents ?? 0) * i.quantity,
                })),
              }
            : undefined,
        },
      });
      await audit(
        {
          userId,
          action: 'payment.register',
          entity: 'payment',
          entityId: payment.id,
          data: { sessionId, method: input.method, amountCents: input.amountCents },
          ip,
        },
        tx,
      );
      const closed = await closeIfSettled(tx, sessionId, userId);
      return { payment, closed };
    });
    notifySession(sessionId, { closed: result.closed });
    return { ...result, duplicate: false };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const dup = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (dup && dup.sessionId === sessionId) return { payment: dup, closed: false, duplicate: true };
    }
    throw e;
  }
}

/** Estorno de registro (somente administrador, atendimento aberto). Mantém o histórico. */
export async function voidPayment(paymentId: string, reason: string, userId: string, ip: string | null) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw notFound('Pagamento não encontrado');
  await prisma.$transaction(async (tx) => {
    const locked = await lockSession(tx, payment.sessionId);
    if (locked.status !== 'OPEN') {
      throw conflict('SESSION_CLOSED', 'Reabra o atendimento antes de estornar um pagamento');
    }
    const fresh = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (fresh.status === 'VOIDED') throw conflict('ALREADY_VOIDED', 'Pagamento já estornado');
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'VOIDED', voidedById: userId, voidReason: reason },
    });
    await audit(
      { userId, action: 'payment.void', entity: 'payment', entityId: paymentId, data: { reason, amountCents: fresh.amountCents }, ip },
      tx,
    );
  });
  notifySession(payment.sessionId);
}
