export type Role = 'ADMIN' | 'WAITER' | 'KITCHEN' | 'CASHIER';
export type OrderStatus = 'RECEIVED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
export type OrderSource = 'NFC' | 'WAITER';
export type SessionStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';
export type PaymentMethod = 'PIX' | 'CASH' | 'DEBIT' | 'CREDIT';
export type TableState = 'FREE' | 'OCCUPIED' | 'WAITING_ORDER' | 'PREPARING' | 'WAITING_PAYMENT';
export type CardStatus = 'ACTIVE' | 'BLOCKED' | 'LOST' | 'REVOKED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  createdAt?: string;
}

export interface Addon {
  id: string;
  name: string;
  priceCents: number;
  active?: boolean;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  ingredients: string;
  priceCents: number;
  promoPriceCents: number | null;
  imageUrl: string | null;
  available: boolean;
  featured: boolean;
  prepMinutes: number;
  addons: Addon[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  products: Product[];
}

export interface Settings {
  name: string;
  tagline: string;
  phone: string;
  address: string;
  openingHours: string;
  serviceFeePercent: number;
  allowSelfOpen: boolean;
  demoMode: boolean;
}

export interface Totals {
  subtotalCents: number;
  serviceFeeCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  itemsCount: number;
}

export interface OrderItem {
  id: string;
  productId?: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
  note: string | null;
  addons: { name: string; priceCents: number }[];
  paidQuantity?: number;
}

export interface Order {
  id: string;
  number: number;
  source: OrderSource;
  status: OrderStatus;
  note: string | null;
  totalCents: number;
  createdAt: string;
  statusChangedAt: string;
  createdBy?: { id: string; name: string } | null;
  cancelReason: string | null;
  cancelledBy?: { id: string; name: string } | null;
  items: OrderItem[];
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  receivedCents?: number | null;
  changeCents?: number | null;
  status?: 'REGISTERED' | 'VOIDED';
  payerName?: string | null;
  voidReason?: string | null;
  createdAt: string;
  createdBy?: { id: string; name: string } | null;
}

export interface Session {
  id: string;
  status: SessionStatus;
  tab: { id: string; number: number };
  table: { id: string; number: number; label: string | null } | null;
  customerName: string | null;
  waiter: { id: string; name: string } | null;
  openedBy: { id: string; name: string } | null;
  closedBy: { id: string; name: string } | null;
  openedVia: string;
  openedAt: string;
  closedAt: string | null;
  reopenedAt: string | null;
  billRequestedAt: string | null;
  serviceFeePercent: number;
  discountCents: number;
  discountReason: string | null;
  orders: Order[];
  payments: Payment[];
  totals: Totals;
}

/** Visão do cliente (cartão NFC) */
export interface CustomerSession {
  id: string;
  status: SessionStatus;
  tabNumber: number;
  tableNumber: number | null;
  customerName: string | null;
  openedAt: string;
  closedAt: string | null;
  billRequestedAt: string | null;
  serviceFeePercent: number;
  orders: Order[];
  payments: Payment[];
  totals: Totals;
}

export interface TableSummary {
  id: string;
  number: number;
  label: string | null;
  seats: number;
  active: boolean;
  state: TableState;
  openedAt: string | null;
  waiter: { id: string; name: string } | null;
  readyOrders: number;
  tabs: { sessionId: string; tabNumber: number; customerName: string | null; totalCents: number }[];
  totals: { subtotalCents: number; totalCents: number; paidCents: number; remainingCents: number; itemsCount: number };
}

export interface KitchenOrder {
  id: string;
  number: number;
  status: OrderStatus;
  source: OrderSource;
  note: string | null;
  createdAt: string;
  statusChangedAt: string;
  sessionId: string;
  tabNumber: number;
  tableNumber: number | null;
  customerName: string | null;
  createdBy: { id: string; name: string } | null;
  items: { id: string; productName: string; quantity: number; note: string | null; addons: string[] }[];
}
