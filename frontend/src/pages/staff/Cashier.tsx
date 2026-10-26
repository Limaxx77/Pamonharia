import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BellRing, ChevronRight, Search, Store } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { brl, elapsedLabel, minutesSince, padTab, padTable, TABLE_STATE } from '../../lib/format';
import { useOpenSessions, useTables } from '../../lib/queries';
import type { Session } from '../../lib/types';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Spinner } from '../../components/ui';

export default function Cashier() {
  const { data: sessions, isLoading } = useOpenSessions();
  const { data: tables } = useTables();
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const nav = useNavigate();

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    const n = Number(q);
    if (!n) return;
    try {
      const r = await api<{ session: Session | null }>(`/sessions/lookup?tab=${n}`);
      if (r.session) nav(`/app/caixa/${r.session.id}`);
      else setErr(`A comanda ${padTab(n)} não possui atendimento aberto.`);
    } catch (e2) {
      setErr(errorMessage(e2));
    }
  };

  const sorted = [...(sessions ?? [])].sort((a, b) => {
    if (!!a.billRequestedAt !== !!b.billRequestedAt) return a.billRequestedAt ? -1 : 1;
    return new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
  });
  const occupied = tables?.filter((t) => t.state !== 'FREE') ?? [];

  return (
    <div>
      <PageHeader title="Caixa" subtitle="Pesquise a comanda pelo número ou escolha uma mesa" />
      <form onSubmit={search} className="flex max-w-md gap-2">
        <Input inputMode="numeric" pattern="[0-9]*" value={q} onChange={(e) => setQ(e.target.value.replace(/\D/g, ''))} placeholder="Número da comanda" aria-label="Número da comanda" className="h-14 text-lg" autoFocus />
        <Button type="submit" size="lg">
          <Search className="size-5" /> <span className="hidden sm:inline">Buscar</span>
        </Button>
      </form>
      {err && <p className="mt-2 text-sm font-semibold text-rose-700">{err}</p>}

      {occupied.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xl font-bold">Mesas ocupadas</h2>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {occupied.map((t) => (
              <Link key={t.id} to={`/app/mesas/${t.id}`} className={`flex w-28 shrink-0 flex-col rounded-2xl border-2 p-3 ${TABLE_STATE[t.state].card}`}>
                <span className="font-display text-xl font-bold">Mesa {padTable(t.number)}</span>
                <span className="text-xs text-marrom-500">{t.tabs.length} comanda(s)</span>
                <span className="tabular text-sm font-extrabold">{brl(t.totals.remainingCents)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-xl font-bold">Comandas abertas</h2>
        {isLoading && <Spinner />}
        {sessions?.length === 0 && (
          <Card>
            <EmptyState title="Nenhuma comanda aberta" />
          </Card>
        )}
        <div className="overflow-hidden rounded-2xl bg-white shadow-card">
          <ul className="divide-y divide-marrom-100">
            {sorted.map((s) => (
              <li key={s.id}>
                <Link to={`/app/caixa/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-verde-50/60">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      Comanda {padTab(s.tab.number)}
                      <span className="flex items-center gap-1 text-sm font-semibold text-marrom-500">
                        {s.table ? `Mesa ${padTable(s.table.number)}` : (
                          <>
                            <Store className="size-3.5" /> Balcão
                          </>
                        )}
                      </span>
                      {s.billRequestedAt && (
                        <Badge tone="red">
                          <BellRing className="size-3" /> Pediu a conta
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-marrom-500">
                      {s.customerName ? `${s.customerName} · ` : ''}
                      {s.totals.itemsCount} itens · aberta há {elapsedLabel(minutesSince(s.openedAt))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-extrabold">{brl(s.totals.remainingCents)}</p>
                    {s.totals.paidCents > 0 && <p className="tabular text-xs text-verde-700">pago {brl(s.totals.paidCents)}</p>}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-marrom-300" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
