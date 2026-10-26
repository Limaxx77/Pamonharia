import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';

const n = (v: unknown) => (v == null ? 0 : Number(v));

/** Datas no formato YYYY-MM-DD no fuso do estabelecimento. */
export function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.APP_TIMEZONE }).format(new Date());
}

export async function getSummary(from: string, to: string) {
  const tz = env.APP_TIMEZONE;
  const today = localToday();
  const monthStart = today.slice(0, 8) + '01';

  const [revenue] = await prisma.$queryRaw<{ total: bigint | null; count: bigint }[]>`
    SELECT SUM(amount_cents) AS total, COUNT(*) AS count FROM payments
    WHERE status = 'REGISTERED'
      AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date`;

  const [todayRev] = await prisma.$queryRaw<{ total: bigint | null }[]>`
    SELECT SUM(amount_cents) AS total FROM payments
    WHERE status = 'REGISTERED' AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date = ${today}::date`;

  const [monthRev] = await prisma.$queryRaw<{ total: bigint | null }[]>`
    SELECT SUM(amount_cents) AS total FROM payments
    WHERE status = 'REGISTERED'
      AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date BETWEEN ${monthStart}::date AND ${today}::date`;

  const [orders] = await prisma.$queryRaw<{ total: bigint; cancelled: bigint; nfc: bigint; waiter: bigint }[]>`
    SELECT COUNT(*) FILTER (WHERE status <> 'CANCELLED') AS total,
           COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
           COUNT(*) FILTER (WHERE status <> 'CANCELLED' AND source = 'NFC') AS nfc,
           COUNT(*) FILTER (WHERE status <> 'CANCELLED' AND source = 'WAITER') AS waiter
    FROM orders
    WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date`;

  const [closed] = await prisma.$queryRaw<{ count: bigint; paid: bigint | null }[]>`
    SELECT COUNT(DISTINCT s.id) AS count, SUM(p.amount_cents) AS paid
    FROM tab_sessions s
    LEFT JOIN payments p ON p.session_id = s.id AND p.status = 'REGISTERED'
    WHERE s.status = 'CLOSED'
      AND (s.closed_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date`;

  const [openNow, occupiedTables, totalTables] = await Promise.all([
    prisma.tabSession.count({ where: { status: 'OPEN' } }),
    prisma.diningTable.count({ where: { active: true, sessions: { some: { status: 'OPEN' } } } }),
    prisma.diningTable.count({ where: { active: true } }),
  ]);

  const topProducts = await prisma.$queryRaw<{ name: string; quantity: bigint; total: bigint }[]>`
    SELECT i.product_name AS name, SUM(i.quantity) AS quantity, SUM(i.total_cents) AS total
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.status <> 'CANCELLED'
      AND (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY i.product_name ORDER BY quantity DESC, total DESC LIMIT 10`;

  const byCategory = await prisma.$queryRaw<{ name: string; quantity: bigint; total: bigint }[]>`
    SELECT i.category_name AS name, SUM(i.quantity) AS quantity, SUM(i.total_cents) AS total
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.status <> 'CANCELLED'
      AND (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY i.category_name ORDER BY total DESC`;

  const byMethod = await prisma.$queryRaw<{ method: string; count: bigint; total: bigint }[]>`
    SELECT method::text AS method, COUNT(*) AS count, SUM(amount_cents) AS total FROM payments
    WHERE status = 'REGISTERED'
      AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY method ORDER BY total DESC`;

  const daily = await prisma.$queryRaw<{ day: string; revenue: bigint | null; orders: bigint | null }[]>`
    WITH days AS (
      SELECT generate_series(${from}::date, ${to}::date, interval '1 day')::date AS day
    ),
    rev AS (
      SELECT (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date AS day, SUM(amount_cents) AS revenue
      FROM payments WHERE status = 'REGISTERED' GROUP BY 1
    ),
    ord AS (
      SELECT (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date AS day, COUNT(*) AS orders
      FROM orders WHERE status <> 'CANCELLED' GROUP BY 1
    )
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, rev.revenue, ord.orders
    FROM days d LEFT JOIN rev ON rev.day = d.day LEFT JOIN ord ON ord.day = d.day
    ORDER BY d.day`;

  const hourly = await prisma.$queryRaw<{ hour: number; orders: bigint }[]>`
    SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::int AS hour, COUNT(*) AS orders
    FROM orders
    WHERE status <> 'CANCELLED'
      AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY 1 ORDER BY 1`;

  const closedCount = n(closed.count);
  return {
    period: { from, to },
    revenueCents: n(revenue.total),
    paymentsCount: n(revenue.count),
    todayRevenueCents: n(todayRev.total),
    monthRevenueCents: n(monthRev.total),
    ordersCount: n(orders.total),
    cancelledOrders: n(orders.cancelled),
    ordersBySource: { NFC: n(orders.nfc), WAITER: n(orders.waiter) },
    closedSessions: closedCount,
    openSessions: openNow,
    occupiedTables,
    totalTables,
    avgTicketCents: closedCount > 0 ? Math.round(n(closed.paid) / closedCount) : 0,
    topProducts: topProducts.map((r) => ({ name: r.name, quantity: n(r.quantity), totalCents: n(r.total) })),
    byCategory: byCategory.map((r) => ({ name: r.name, quantity: n(r.quantity), totalCents: n(r.total) })),
    byPaymentMethod: byMethod.map((r) => ({ method: r.method, count: n(r.count), totalCents: n(r.total) })),
    daily: daily.map((r) => ({ day: r.day, revenueCents: n(r.revenue), orders: n(r.orders) })),
    hourly: hourly.map((r) => ({ hour: r.hour, orders: n(r.orders) })),
  };
}

/** Atendimentos encerrados no período, com totais pagos por forma de pagamento. */
export async function getClosedSessions(from: string, to: string) {
  const tz = env.APP_TIMEZONE;
  const rows = await prisma.$queryRaw<
    { id: string; tab: number; table_number: number | null; opened_at: Date; closed_at: Date; discount: number; paid: bigint | null; methods: string | null; closed_by: string | null }[]
  >`
    SELECT s.id, t.number AS tab, dt.number AS table_number, s.opened_at, s.closed_at, s.discount_cents AS discount,
           SUM(p.amount_cents) AS paid, string_agg(DISTINCT p.method::text, ',') AS methods, u.name AS closed_by
    FROM tab_sessions s
    JOIN tabs t ON t.id = s.tab_id
    LEFT JOIN tables dt ON dt.id = s.table_id
    LEFT JOIN users u ON u.id = s.closed_by_id
    LEFT JOIN payments p ON p.session_id = s.id AND p.status = 'REGISTERED'
    WHERE s.status = 'CLOSED'
      AND (s.closed_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY s.id, t.number, dt.number, u.name
    ORDER BY s.closed_at DESC
    LIMIT 500`;
  return rows.map((r) => ({
    id: r.id,
    tabNumber: r.tab,
    tableNumber: r.table_number,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    discountCents: r.discount,
    paidCents: n(r.paid),
    methods: r.methods ? r.methods.split(',') : [],
    closedBy: r.closed_by,
  }));
}
