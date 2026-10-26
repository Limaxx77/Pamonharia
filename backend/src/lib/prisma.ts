import { PrismaClient } from '@prisma/client';

// Erros de consulta são propagados e registrados pelo errorHandler; conflitos esperados
// (ex.: chave de idempotência repetida) são tratados nos serviços e não devem poluir o log.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn'] : [],
});

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
