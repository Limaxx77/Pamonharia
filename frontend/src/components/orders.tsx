import clsx from 'clsx';
import { ChefHat, CircleCheck, Clock, PackageCheck, Smartphone, UserRound, XCircle } from 'lucide-react';
import { brl, hhmm, ORDER_STATUS, PAYMENT_METHOD } from '../lib/format';
import type { Order, OrderSource, OrderStatus, Payment, Totals } from '../lib/types';
import { Badge } from './ui';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function SourceBadge({ source }: { source: OrderSource }) {
  return source === 'NFC' ? (
    <Badge tone="corn">
      <Smartphone className="size-3" /> NFC
    </Badge>
  ) : (
    <Badge tone="brown">
      <UserRound className="size-3" /> Garçom
    </Badge>
  );
}

const STEPS: { status: OrderStatus; label: string; icon: typeof Clock }[] = [
  { status: 'RECEIVED', label: 'Recebido', icon: Clock },
  { status: 'PREPARING', label: 'Em preparo', icon: ChefHat },
  { status: 'READY', label: 'Pronto', icon: CircleCheck },
  { status: 'DELIVERED', label: 'Entregue', icon: PackageCheck },
];

/** Linha do tempo de status (acompanhamento do cliente) */
export function OrderProgress({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED') return null;
  const idx = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="Andamento do pedido">
      {STEPS.map((s, i) => {
        const done = i <= idx;
        const Icon = s.icon;
        return (
          <li key={s.status} className="flex flex-col items-center gap-1 text-center">
            <span className={clsx('flex h-1.5 w-full rounded-full', done ? 'bg-verde-500' : 'bg-marrom-100')} />
            <Icon className={clsx('mt-1 size-4', done ? 'text-verde-600' : 'text-marrom-300', i === idx && status !== 'DELIVERED' && 'animate-pulse')} />
            <span className={clsx('text-[11px] font-bold leading-tight', done ? 'text-verde-700' : 'text-marrom-400')}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderCard({ order, showProgress, showAuthor, actions }: { order: Order; showProgress?: boolean; showAuthor?: boolean; actions?: React.ReactNode }) {
  const cancelled = order.status === 'CANCELLED';
  return (
    <div className={clsx('rounded-2xl border bg-white p-4 shadow-card', cancelled ? 'border-rose-100 opacity-80' : 'border-marrom-100/70')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-lg font-bold">Pedido #{order.number}</span>
        <OrderStatusBadge status={order.status} />
        <SourceBadge source={order.source} />
        <span className="ml-auto text-xs font-semibold text-marrom-500">{hhmm(order.createdAt)}</span>
      </div>
      {showAuthor && order.createdBy && <p className="mt-0.5 text-xs text-marrom-500">Lançado por {order.createdBy.name}</p>}
      <ul className={clsx('mt-2 space-y-1.5 text-sm', cancelled && 'line-through decoration-rose-400')}>
        {order.items.map((i) => (
          <li key={i.id} className="flex gap-2">
            <span className="tabular w-7 shrink-0 font-extrabold text-verde-700">{i.quantity}×</span>
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{i.productName}</span>
              {i.addons.length > 0 && <span className="block text-xs text-marrom-500">+ {i.addons.map((a) => a.name).join(', ')}</span>}
              {i.note && <span className="block text-xs italic text-milho-700">“{i.note}”</span>}
            </div>
            <span className="tabular shrink-0 font-semibold text-marrom-700">{brl(i.totalCents)}</span>
          </li>
        ))}
      </ul>
      {cancelled && order.cancelReason && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700">
          <XCircle className="mt-px size-3.5 shrink-0" /> Cancelado{order.cancelledBy ? ` por ${order.cancelledBy.name}` : ''}: {order.cancelReason}
        </p>
      )}
      {showProgress && <OrderProgress status={order.status} />}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function TotalsBox({ totals, serviceFeePercent, payments, compact }: { totals: Totals; serviceFeePercent: number; payments?: Payment[]; compact?: boolean }) {
  const row = 'flex items-center justify-between gap-3';
  return (
    <div className={clsx('space-y-1.5 rounded-2xl bg-white p-4 text-sm shadow-card', compact && 'p-3')}>
      <div className={row}>
        <span className="text-marrom-600">Subtotal ({totals.itemsCount} {totals.itemsCount === 1 ? 'item' : 'itens'})</span>
        <span className="tabular font-semibold">{brl(totals.subtotalCents)}</span>
      </div>
      <div className={row}>
        <span className="text-marrom-600">Taxa de serviço ({serviceFeePercent.toLocaleString('pt-BR')}%)</span>
        <span className="tabular font-semibold">{brl(totals.serviceFeeCents)}</span>
      </div>
      {totals.discountCents > 0 && (
        <div className={clsx(row, 'text-verde-700')}>
          <span>Desconto</span>
          <span className="tabular font-semibold">− {brl(totals.discountCents)}</span>
        </div>
      )}
      <div className={clsx(row, 'border-t border-dashed border-marrom-100 pt-2 text-base')}>
        <span className="font-extrabold">Total</span>
        <span className="tabular font-display text-xl font-bold">{brl(totals.totalCents)}</span>
      </div>
      {payments && payments.filter((p) => p.status !== 'VOIDED').length > 0 && (
        <>
          {payments
            .filter((p) => p.status !== 'VOIDED')
            .map((p) => (
              <div key={p.id} className={clsx(row, 'text-verde-700')}>
                <span>Pago · {PAYMENT_METHOD[p.method]}</span>
                <span className="tabular font-semibold">− {brl(p.amountCents)}</span>
              </div>
            ))}
          <div className={clsx(row, 'border-t border-marrom-100 pt-2')}>
            <span className="font-extrabold">Restante</span>
            <span className="tabular font-extrabold text-rose-700">{brl(totals.remainingCents)}</span>
          </div>
        </>
      )}
    </div>
  );
}
