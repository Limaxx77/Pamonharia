import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRightLeft, ChevronRight, Clock, Plus, ShoppingBag, UserRound, Wallet } from 'lucide-react';
import { brl, elapsedLabel, hhmm, minutesSince, padTab, padTable, TABLE_STATE } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { useTable, useTables } from '../../lib/queries';
import type { Session } from '../../lib/types';
import { OpenTabForm } from '../../components/OpenTabForm';
import { TransferSheet } from '../../components/TransferSheet';
import { OrderStatusBadge } from '../../components/orders';
import { Badge, Button, Card, EmptyState, ErrorBox, Sheet, Spinner } from '../../components/ui';

export default function TableDetail() {
  const { id = '' } = useParams();
  const { data, isLoading, error, refetch } = useTable(id);
  const { data: tables } = useTables();
  const { can } = useAuth();
  const [openForm, setOpenForm] = useState(false);
  const [transfer, setTransfer] = useState<Session | null>(null);

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorBox onRetry={() => refetch()}>Mesa não encontrada.</ErrorBox>;
  const st = TABLE_STATE[data.state];

  return (
    <div>
      <Link to="/app/mesas" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-verde-700">
        <ArrowLeft className="size-4" /> Mesas
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">Mesa {padTable(data.table.number)}</h1>
        <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm font-bold shadow-sm">
          <span className={`size-2.5 rounded-full ${st.dot}`} /> {st.label}
        </span>
      </div>
      {data.table.label && <p className="text-marrom-500">{data.table.label}</p>}

      {data.sessions.length > 0 && (
        <Card className="mt-4 grid grid-cols-3 divide-x divide-marrom-100 p-0 text-center">
          <div className="p-3">
            <p className="text-xs font-bold uppercase text-marrom-500">Comandas</p>
            <p className="tabular font-display text-2xl font-bold">{data.sessions.length}</p>
          </div>
          <div className="p-3">
            <p className="text-xs font-bold uppercase text-marrom-500">Total mesa</p>
            <p className="tabular font-display text-xl font-bold sm:text-2xl">{brl(data.totals.totalCents)}</p>
          </div>
          <div className="p-3">
            <p className="text-xs font-bold uppercase text-marrom-500">A pagar</p>
            <p className="tabular font-display text-xl font-bold text-rose-700 sm:text-2xl">{brl(data.totals.remainingCents)}</p>
          </div>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => setOpenForm(true)}>
          <Plus className="size-5" /> Nova comanda nesta mesa
        </Button>
      </div>

      {data.sessions.length === 0 ? (
        <Card className="mt-4">
          <EmptyState title="Mesa livre">Abra uma comanda para começar o atendimento.</EmptyState>
        </Card>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.sessions.map((s) => {
            const live = s.orders.filter((o) => o.status !== 'CANCELLED');
            const pending = live.filter((o) => o.status !== 'DELIVERED');
            return (
              <Card key={s.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/app/comandas/${s.id}`} className="font-display text-xl font-bold hover:underline">
                    Comanda {padTab(s.tab.number)}
                  </Link>
                  {s.customerName && <Badge tone="brown">{s.customerName}</Badge>}
                  {s.billRequestedAt && <Badge tone="red">Pediu a conta</Badge>}
                  <span className="tabular ml-auto font-display text-xl font-bold">{brl(s.totals.totalCents)}</span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-marrom-500">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" /> Aberta às {hhmm(s.openedAt)} ({elapsedLabel(minutesSince(s.openedAt))})
                  </span>
                  {s.waiter && (
                    <span className="flex items-center gap-1">
                      <UserRound className="size-3.5" /> {s.waiter.name}
                    </span>
                  )}
                  <span>
                    {live.length} {live.length === 1 ? 'pedido' : 'pedidos'} · {s.totals.itemsCount} itens
                  </span>
                </p>
                {pending.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pending.map((o) => (
                      <span key={o.id} className="flex items-center gap-1 text-xs font-semibold">
                        #{o.number} <OrderStatusBadge status={o.status} />
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {can('WAITER') && (
                    <Link to={`/app/comandas/${s.id}/pedido`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-verde-600 px-4 text-[15px] font-bold text-white">
                      <ShoppingBag className="size-4" /> Pedir
                    </Link>
                  )}
                  <Button variant="outline" onClick={() => setTransfer(s)}>
                    <ArrowRightLeft className="size-4" /> Transferir
                  </Button>
                  {can('CASHIER') && (
                    <Link to={`/app/caixa/${s.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-milho-400 px-4 text-[15px] font-bold text-marrom-900">
                      <Wallet className="size-4" /> Fechar conta
                    </Link>
                  )}
                  <Link to={`/app/comandas/${s.id}`} className="inline-flex h-11 items-center justify-center gap-1 rounded-xl px-3 text-[15px] font-bold text-verde-700 hover:bg-verde-50">
                    Detalhes <ChevronRight className="size-4" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={openForm} onClose={() => setOpenForm(false)} title={`Nova comanda · Mesa ${padTable(data.table.number)}`}>
        <OpenTabForm tables={tables} defaultTableId={data.table.id} onDone={() => setOpenForm(false)} />
      </Sheet>
      {transfer && <TransferSheet session={transfer} open onClose={() => setTransfer(null)} />}
    </div>
  );
}
