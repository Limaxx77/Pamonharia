import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRightLeft, Ban, Clock, ReceiptText, ShoppingBag, Smartphone, UserRound, Wallet } from 'lucide-react';
import { errorMessage, post } from '../../lib/api';
import { dateTime, padTab, padTable } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { useSession } from '../../lib/queries';
import type { Order } from '../../lib/types';
import { OrderCard, TotalsBox } from '../../components/orders';
import { TransferSheet } from '../../components/TransferSheet';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorBox, Spinner, useToast } from '../../components/ui';

export default function SessionDetail() {
  const { id = '' } = useParams();
  const { data: s, isLoading, error, refetch } = useSession(id);
  const { user, can } = useAuth();
  const [transfer, setTransfer] = useState(false);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();

  if (isLoading) return <Spinner />;
  if (error || !s) return <ErrorBox onRetry={() => refetch()}>Comanda não encontrada.</ErrorBox>;
  const open = s.status === 'OPEN';

  // Mesma regra do backend: garçom cancela só o que ainda não entrou em preparo; caixa/admin, qualquer pedido.
  const canCancel = (o: Order) => {
    if (!open || o.status === 'CANCELLED') return false;
    if (user?.role === 'WAITER') return o.status === 'RECEIVED';
    return can('CASHIER');
  };

  const toggleBill = async () => {
    try {
      await post(`/sessions/${s.id}/request-bill`, { requested: !s.billRequestedAt });
      qc.invalidateQueries({ queryKey: ['session', id] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => nav(-1)} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-verde-700">
        <ArrowLeft className="size-4" /> Voltar
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-3xl font-bold">Comanda {padTab(s.tab.number)}</h1>
        {open ? <Badge tone="green">Aberta</Badge> : <Badge tone="gray">{s.status === 'CLOSED' ? 'Fechada' : 'Cancelada'}</Badge>}
        {s.billRequestedAt && open && <Badge tone="red">Pediu a conta</Badge>}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-marrom-600">
        <span>{s.table ? <Link className="font-bold text-verde-700 underline" to={`/app/mesas/${s.table.id}`}>Mesa {padTable(s.table.number)}</Link> : 'Balcão'}</span>
        {s.customerName && <span>{s.customerName}</span>}
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" /> Aberta {dateTime(s.openedAt)}
        </span>
        <span className="flex items-center gap-1">
          {s.openedVia === 'NFC' ? <Smartphone className="size-3.5" /> : <UserRound className="size-3.5" />}
          {s.openedVia === 'NFC' ? 'Aberta pelo cliente (NFC)' : `Aberta por ${s.openedBy?.name ?? '—'}`}
        </span>
        {s.waiter && <span>Garçom: {s.waiter.name}</span>}
        {s.closedAt && <span>Fechada {dateTime(s.closedAt)}{s.closedBy ? ` por ${s.closedBy.name}` : ''}</span>}
      </p>

      {open && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {can('WAITER') && (
            <Link to={`/app/comandas/${s.id}/pedido`} className="col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-verde-600 px-5 font-bold text-white shadow-sm">
              <ShoppingBag className="size-5" /> Novo pedido
            </Link>
          )}
          <Button variant="outline" size="md" onClick={() => setTransfer(true)}>
            <ArrowRightLeft className="size-4" /> Transferir
          </Button>
          <Button variant="outline" size="md" onClick={toggleBill}>
            <ReceiptText className="size-4" /> {s.billRequestedAt ? 'Cancelar pedido de conta' : 'Marcar: pediu a conta'}
          </Button>
          {can('CASHIER') && (
            <Link to={`/app/caixa/${s.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-milho-400 px-4 font-bold text-marrom-900">
              <Wallet className="size-4" /> Caixa
            </Link>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Pedidos</h2>
          {s.orders.length === 0 && <EmptyState title="Nenhum pedido nesta comanda" />}
          {[...s.orders].reverse().map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              showAuthor
              actions={
                canCancel(o) && (
                  <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => setCancelling(o)}>
                    <Ban className="size-4" /> Cancelar pedido
                  </Button>
                )
              }
            />
          ))}
        </section>
        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-xl font-bold">Consumo</h2>
          <TotalsBox totals={s.totals} serviceFeePercent={s.serviceFeePercent} payments={s.payments} />
        </aside>
      </div>

      <TransferSheet session={s} open={transfer} onClose={() => setTransfer(false)} />
      <ConfirmDialog
        open={!!cancelling}
        title={`Cancelar pedido #${cancelling?.number}`}
        message="O pedido continua no histórico, marcado como cancelado, e deixa de ser cobrado."
        danger
        confirmLabel="Cancelar pedido"
        reason={{ label: 'Motivo do cancelamento', required: true, placeholder: 'Ex.: cliente desistiu, lançado errado' }}
        onClose={() => setCancelling(null)}
        onConfirm={async (reason) => {
          try {
            await post(`/orders/${cancelling!.id}/cancel`, { reason });
          } catch (e) {
            throw new Error(errorMessage(e));
          }
          toast.success('Pedido cancelado');
          qc.invalidateQueries({ queryKey: ['session', id] });
        }}
      />
    </div>
  );
}
