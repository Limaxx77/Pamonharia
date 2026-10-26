import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { API_BASE } from './api';

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_BASE || undefined, { path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}

/** Reconecta para que o servidor reconheça o novo cookie de sessão (login/logout). */
export function resetSocket() {
  socket?.disconnect();
  socket = null;
}

export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = getSocket();
    const fn = (p: T) => ref.current(p);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [event]);
}

/** Invalida consultas quando qualquer um dos eventos chegar (o servidor envia só "algo mudou"). */
export function useLiveQueries(events: string[], keys: QueryKey[]) {
  const qc = useQueryClient();
  const keysRef = useRef(keys);
  keysRef.current = keys;
  useEffect(() => {
    const s = getSocket();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fn = () => {
      // agrupa rajadas de eventos em uma única atualização
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => keysRef.current.forEach((k) => qc.invalidateQueries({ queryKey: k })), 120);
    };
    const onReconnect = () => fn();
    events.forEach((e) => s.on(e, fn));
    s.on('connect', onReconnect);
    return () => {
      events.forEach((e) => s.off(e, fn));
      s.off('connect', onReconnect);
      if (timer) clearTimeout(timer);
    };
  }, [events.join('|'), qc]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useConnectionStatus() {
  const [online, setOnline] = useState(() => getSocket().connected);
  useEffect(() => {
    const s = getSocket();
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    s.on('connect', up);
    s.on('disconnect', down);
    return () => {
      s.off('connect', up);
      s.off('disconnect', down);
    };
  }, []);
  return online;
}

export const EVT = {
  ORDER_NEW: 'order:new',
  ORDER_UPDATED: 'order:updated',
  SESSION_UPDATED: 'session:updated',
  TABLES_UPDATED: 'tables:updated',
  MENU_UPDATED: 'menu:updated',
  CARDS_UPDATED: 'cards:updated',
  WAITER_CALL: 'waiter:call',
} as const;
