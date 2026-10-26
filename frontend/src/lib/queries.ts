import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { EVT, useLiveQueries } from './realtime';
import type { KitchenOrder, Session, TableState, TableSummary, User } from './types';

export function useTables() {
  useLiveQueries([EVT.TABLES_UPDATED, EVT.SESSION_UPDATED, EVT.ORDER_NEW, EVT.ORDER_UPDATED], [['tables']]);
  return useQuery({ queryKey: ['tables'], queryFn: () => api<{ tables: TableSummary[] }>('/tables').then((r) => r.tables) });
}

export function useTable(id: string) {
  useLiveQueries([EVT.TABLES_UPDATED, EVT.SESSION_UPDATED, EVT.ORDER_NEW, EVT.ORDER_UPDATED], [['table', id]]);
  return useQuery({
    queryKey: ['table', id],
    queryFn: () =>
      api<{ table: { id: string; number: number; label: string | null; seats: number }; state: TableState; sessions: Session[]; totals: TableSummary['totals'] }>(`/tables/${id}`),
  });
}

export function useSession(id: string) {
  useLiveQueries([EVT.SESSION_UPDATED, EVT.ORDER_NEW, EVT.ORDER_UPDATED], [['session', id]]);
  return useQuery({ queryKey: ['session', id], queryFn: () => api<{ session: Session }>(`/sessions/${id}`).then((r) => r.session) });
}

export function useOpenSessions() {
  useLiveQueries([EVT.SESSION_UPDATED, EVT.ORDER_NEW, EVT.ORDER_UPDATED], [['sessions', 'OPEN']]);
  return useQuery({
    queryKey: ['sessions', 'OPEN'],
    queryFn: () => api<{ sessions: Session[] }>('/sessions?status=OPEN&take=200').then((r) => r.sessions),
  });
}

export function useKitchen() {
  useLiveQueries([EVT.ORDER_NEW, EVT.ORDER_UPDATED], [['kitchen']]);
  return useQuery({
    queryKey: ['kitchen'],
    queryFn: () => api<{ lateMinutes: number; serverTime: string; orders: KitchenOrder[]; recentlyDelivered: KitchenOrder[] }>('/orders/kitchen'),
    refetchInterval: 30_000,
  });
}

export function useWaiters() {
  return useQuery({ queryKey: ['users', 'waiters'], queryFn: () => api<{ users: User[] }>('/users').then((r) => r.users.filter((u) => u.role === 'WAITER' && u.active !== false)), staleTime: 60_000 });
}
