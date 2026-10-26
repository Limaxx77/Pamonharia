import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, CheckCheck, ChevronRight, Search, Plus, ReceiptText, Volume2 } from 'lucide-react';
import { api, errorMessage, patch } from '../../lib/api';
import { brl, elapsedLabel, minutesSince, padTab, padTable, TABLE_STATE } from '../../lib/format';
import { useKitchen, useTables } from '../../lib/queries';
import { useAuth } from '../../lib/auth';
import { chime, unlockAudio, audioEnabled } from '../../lib/sound';
import type { Session } from '../../lib/types';
import { OpenTabForm } from '../../components/OpenTabForm';
import { SourceBadge } from '../../components/orders';
import { Button, Card, EmptyState, Input, PageHeader, Sheet, useToast } from '../../components/ui';

export default function Waiter() {
  const { user } = useAuth();
  const { data: tables } = useTables();
  const { data: kitchen } = useKitchen();
  const [openForm, setOpenForm] = useState(false);
  const [sound, setSound] = useState(audioEnabled());
  const [lookup, setLookup] = useState('');
  const [lookupErr, setLookupErr] = useState('');
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const ready = kitchen?.orders.filter((o) => o.status === 'READY') ?? [];
  const attention = tables?.filter((t) => t.state === 'WAITING_PAYMENT') ?? [];

  // Alerta quando aparece um novo pedido pronto
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!kitchen) return;
    const ids = new Set(ready.map((o) => o.id));
    if (seen.current) {
      const fresh = ready.filter((o) => !seen.current!.has(o.id));
      if (fresh.length) {
        chime('ready');
        toast.success(`Pedido pronto: comanda ${padTab(fresh[0].tabNumber)}${fresh[0].tableNumber ? ` · mesa ${padTable(fresh[0].tableNumber)}` : ''}`);
      }
    }
    seen.current = ids;
  }, [kitchen]); // eslint-disable-line react-hooks/exhaustive-deps

  const deliver = useMutation({
    mutationFn: (id: string) => patch(`/orders/${id}/status`, { status: 'DELIVERED' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kitchen'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const find = async (e: FormEvent) => {
    e.preventDefault();
    setLookupErr('');
    const n = Number(lookup);
    if (!n) return;
    try {
      const r = await api<{ session: Session | null }>(`/sessions/lookup?tab=${n}`);
      if (r.session) nav(`/app/comandas/${r.session.id}`);
      else setLookupErr(`Comanda ${padTab(n)} não está aberta. Use "Abrir comanda".`);
    } catch (err) {
      setLookupErr(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title={`Olá, ${user?.name.split(' ')[0]}`}
        subtitle="Pedidos prontos, chamados e acesso rápido às comandas"
        actions={
          !sound && (
            <Button variant="outline" size="sm" onClick={() => setSound(unlockAudio())}>
              <Volume2 className="size-4" /> Ativar som
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button size="lg" onClick={() => setOpenForm(true)}>
          <Plus className="size-5" /> Abrir comanda
        </Button>
        <form onSubmit={find} className="flex gap-2">
          <Input inputMode="numeric" pattern="[0-9]*" value={lookup} onChange={(e) => setLookup(e.target.value.replace(/\D/g, ''))} placeholder="Nº da comanda" aria-label="Buscar comanda pelo número" className="h-14" />
          <Button type="submit" size="lg" variant="secondary" aria-label="Buscar">
            <Search className="size-5" />
          </Button>
        </form>
      </div>
      {lookupErr && <p className="mt-2 text-sm font-semibold text-rose-700">{lookupErr}</p>}

      <section className="mt-6">
        <h2 className="mb-2 flex items-center gap-2 text-xl font-bold">
          <CheckCheck className="size-5 text-verde-600" /> Prontos para entregar
          {ready.length > 0 && <span className="tabular rounded-full bg-verde-600 px-2 py-0.5 text-sm text-white">{ready.length}</span>}
        </h2>
        {ready.length === 0 ? (
          <Card>
            <EmptyState title="Nenhum pedido aguardando entrega" />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {ready.map((o) => (
              <Card key={o.id} className="border-verde-300 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-lg font-bold">
                    {o.tableNumber ? `Mesa ${padTable(o.tableNumber)}` : 'Balcão'} · Comanda {padTab(o.tabNumber)}
                  </span>
                  <SourceBadge source={o.source} />
                  <span className="ml-auto text-xs font-semibold text-marrom-500">pronto há {elapsedLabel(minutesSince(o.statusChangedAt))}</span>
                </div>
                <ul className="mt-2 text-sm">
                  {o.items.map((i) => (
                    <li key={i.id}>
                      <strong className="tabular text-verde-700">{i.quantity}×</strong> {i.productName}
                      {i.addons.length > 0 && <span className="text-marrom-500"> (+ {i.addons.join(', ')})</span>}
                    </li>
                  ))}
                </ul>
                <Button className="mt-3" block onClick={() => deliver.mutate(o.id)} loading={deliver.isPending && deliver.variables === o.id}>
                  <CheckCheck className="size-5" /> Marcar como entregue
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {attention.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold">
            <ReceiptText className="size-5 text-rose-600" /> Pediram a conta
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {attention.map((t) => (
              <Link key={t.id} to={`/app/mesas/${t.id}`} className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <BellRing className="size-5 text-rose-600" />
                <span className="font-bold">Mesa {padTable(t.number)}</span>
                <span className="tabular ml-auto font-bold">{brl(t.totals.remainingCents)}</span>
                <ChevronRight className="size-4 text-marrom-400" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-xl font-bold">Mesas ocupadas</h2>
          <Link to="/app/mesas" className="text-sm font-bold text-verde-700">
            Ver todas
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tables
            ?.filter((t) => t.state !== 'FREE')
            .map((t) => (
              <Link key={t.id} to={`/app/mesas/${t.id}`} className={`rounded-2xl border-2 p-3 ${TABLE_STATE[t.state].card}`}>
                <p className="font-display text-xl font-bold">Mesa {padTable(t.number)}</p>
                <p className="flex items-center gap-1.5 text-xs font-bold text-marrom-600">
                  <span className={`size-2 rounded-full ${TABLE_STATE[t.state].dot}`} /> {TABLE_STATE[t.state].label}
                </p>
                <p className="tabular mt-1 text-sm font-bold">{brl(t.totals.totalCents)}</p>
              </Link>
            ))}
        </div>
      </section>

      <Sheet open={openForm} onClose={() => setOpenForm(false)} title="Abrir comanda">
        <OpenTabForm tables={tables} onDone={() => setOpenForm(false)} />
      </Sheet>
    </div>
  );
}
