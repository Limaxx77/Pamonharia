import type { CardStatus, OrderStatus, PaymentMethod, Role, TableState } from './types';

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (cents: number) => brlFmt.format(cents / 100);

/** Converte "12,50" / "12.50" / "12" em centavos. Retorna null se inválido. */
export function parseMoney(input: string): number | null {
  const clean = input.trim().replace(/\s|R\$/g, '');
  if (!clean) return null;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const v = Number(normalized);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100);
}

export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

export const padTab = (n: number) => String(n).padStart(3, '0');
export const padTable = (n: number) => String(n).padStart(2, '0');

const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const hhmm = (d: string | Date) => timeFmt.format(new Date(d));
export const dateTime = (d: string | Date) => dateTimeFmt.format(new Date(d));
export const dateOnly = (d: string | Date) => dateFmt.format(new Date(d));

export function minutesSince(d: string | Date, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(d).getTime()) / 60000));
}

export function elapsedLabel(min: number) {
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h${String(min % 60).padStart(2, '0')}`;
}

/** Data local AAAA-MM-DD */
export function isoDay(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'blue' | 'amber' | 'green' | 'gray' | 'red' }> = {
  RECEIVED: { label: 'Recebido', tone: 'blue' },
  PREPARING: { label: 'Em preparo', tone: 'amber' },
  READY: { label: 'Pronto', tone: 'green' },
  DELIVERED: { label: 'Entregue', tone: 'gray' },
  CANCELLED: { label: 'Cancelado', tone: 'red' },
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  CASH: 'Dinheiro',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
};

export const ROLE: Record<Role, string> = {
  ADMIN: 'Administrador',
  WAITER: 'Garçom',
  KITCHEN: 'Cozinha',
  CASHIER: 'Caixa',
};

export const TABLE_STATE: Record<TableState, { label: string; dot: string; card: string }> = {
  FREE: { label: 'Livre', dot: 'bg-verde-400', card: 'border-verde-200 bg-white' },
  OCCUPIED: { label: 'Ocupada', dot: 'bg-marrom-500', card: 'border-marrom-300 bg-marrom-50' },
  WAITING_ORDER: { label: 'Aguardando pedido', dot: 'bg-sky-500', card: 'border-sky-300 bg-sky-50' },
  PREPARING: { label: 'Pedido em preparo', dot: 'bg-milho-500', card: 'border-milho-400 bg-milho-50' },
  WAITING_PAYMENT: { label: 'Aguardando pagamento', dot: 'bg-rose-500', card: 'border-rose-300 bg-rose-50' },
};

export const CARD_STATUS: Record<CardStatus, { label: string; tone: 'green' | 'amber' | 'red' | 'gray' }> = {
  ACTIVE: { label: 'Ativo', tone: 'green' },
  BLOCKED: { label: 'Bloqueado', tone: 'red' },
  LOST: { label: 'Perdido', tone: 'amber' },
  REVOKED: { label: 'Revogado', tone: 'gray' },
};
