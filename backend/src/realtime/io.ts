import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { corsOrigins } from '../config/env.js';
import { AUTH_COOKIE, userFromToken } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

/**
 * Salas:
 *  - "staff"            funcionários autenticados (todos os perfis)
 *  - "session:<id>"     clientes acompanhando um atendimento via cartão NFC
 * Os eventos carregam apenas identificadores; os clientes recarregam os dados pela API,
 * mantendo uma única fonte de verdade (o banco) e as regras de permissão do REST.
 */
let io: Server | null = null;

export const RT = {
  ORDER_NEW: 'order:new',
  ORDER_UPDATED: 'order:updated',
  SESSION_UPDATED: 'session:updated',
  TABLES_UPDATED: 'tables:updated',
  MENU_UPDATED: 'menu:updated',
  CARDS_UPDATED: 'cards:updated',
  WAITER_CALL: 'waiter:call',
} as const;

export function initRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: corsOrigins, credentials: true },
    path: '/socket.io',
  });

  io.on('connection', async (socket) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const user = await userFromToken(cookies[AUTH_COOKIE]);
    if (user) {
      socket.join('staff');
      socket.data.user = user;
    }

    // Cliente NFC: entra na sala do atendimento atual do cartão, se o token for válido.
    socket.on('join:card', async (token: unknown, ack?: (ok: boolean) => void) => {
      if (typeof token !== 'string' || token.length > 64) return ack?.(false);
      const card = await prisma.nfcCard.findUnique({ where: { token } });
      if (!card || card.status !== 'ACTIVE') return ack?.(false);
      const session = await prisma.tabSession.findFirst({
        where: { tabId: card.tabId, status: 'OPEN' },
        select: { id: true },
      });
      for (const room of socket.rooms) if (room.startsWith('session:')) socket.leave(room);
      if (session) socket.join(`session:${session.id}`);
      ack?.(true);
    });
  });

  return io;
}

export function emitStaff(event: string, payload: unknown) {
  io?.to('staff').emit(event, payload);
}

export function emitSession(sessionId: string, event: string, payload: unknown) {
  io?.to(`session:${sessionId}`).emit(event, payload);
}

export function emitAll(event: string, payload: unknown) {
  io?.emit(event, payload);
}

/** Notifica mudanças de um atendimento para todos os interessados. */
export function notifySession(sessionId: string, extra: Record<string, unknown> = {}) {
  const payload = { sessionId, ...extra };
  emitStaff(RT.SESSION_UPDATED, payload);
  emitStaff(RT.TABLES_UPDATED, payload);
  emitSession(sessionId, RT.SESSION_UPDATED, payload);
}
