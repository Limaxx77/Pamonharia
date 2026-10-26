import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { EVT, useLiveQueries } from './realtime';

export interface Summary {
  period: { from: string; to: string };
  revenueCents: number;
  paymentsCount: number;
  todayRevenueCents: number;
  monthRevenueCents: number;
  ordersCount: number;
  cancelledOrders: number;
  ordersBySource: { NFC: number; WAITER: number };
  closedSessions: number;
  openSessions: number;
  occupiedTables: number;
  totalTables: number;
  avgTicketCents: number;
  topProducts: { name: string; quantity: number; totalCents: number }[];
  byCategory: { name: string; quantity: number; totalCents: number }[];
  byPaymentMethod: { method: 'PIX' | 'CASH' | 'DEBIT' | 'CREDIT'; count: number; totalCents: number }[];
  daily: { day: string; revenueCents: number; orders: number }[];
  hourly: { hour: number; orders: number }[];
  demoMode: boolean;
}

export function useSummary(from: string, to: string) {
  useLiveQueries([EVT.SESSION_UPDATED, EVT.ORDER_NEW], [['summary', from, to]]);
  return useQuery({
    queryKey: ['summary', from, to],
    queryFn: () => api<Summary>(`/admin/reports/summary?from=${from}&to=${to}`),
    placeholderData: (prev) => prev,
  });
}

export const shortDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
