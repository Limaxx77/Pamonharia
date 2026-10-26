import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from './prisma.js';

export interface AuditInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  data?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Registra uma operação sensível. Aceita uma transação para gravar junto com a operação. */
export function audit(input: AuditInput, tx: Tx | typeof prisma = prisma) {
  return tx.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      data: input.data,
      ip: input.ip ?? null,
    },
  });
}
