import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { CheckCircle2, Clock, Plus, Store, Users } from 'lucide-react';
import { brl, elapsedLabel, minutesSince, padTab, padTable, TABLE_STATE } from '../../lib/format';
import { useOpenSessions, useTables } from '../../lib/queries';
import type { TableState } from '../../lib/types';
import { OpenTabForm } from '../../components/OpenTabForm';
import { Button, Card, ErrorBox, PageHeader, Sheet, Spinner } from '../../components/ui';

type Filter = 'ALL' | TableState;

export default function Tables() {
  const { data: tables, isLoading, error, refetch } = useTables();
  const { data: open } = useOpenSessions();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [openForm, setOpenForm] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: tables?.length ?? 0 };
    tables?.forEach((t) => (c[t.state] = (c[t.state] ?? 0) + 1));
    return c;
  }, [tables]);
  const visible = tables?.filter((t) => filter === 'ALL' || t.state === filter) ?? [];
  const counter = open?.filter((s) => !s.table) ?? [];

  return (
    <div>
      <PageHeader
        title="Mesas"
        subtitle={tables ? `${tables.filter((t) => t.state !== 'FREE').length} de ${tables.length} ocupadas` : undefined}
        actions={
          <Button onClick={() => setOpenForm(true)}>
            <Plus className="size-5" /> Abrir comanda
          </Button>
        }
      />

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filtrar por estado">
        {(['ALL', 'FREE', 'WAITING_ORDER', 'PREPARING', 'OCCUPIED', 'WAITING_PAYMENT'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={clsx(
              'flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-bold',
              filter === f ? 'border-verde-600 bg-verde-600 text-white' : 'border-marrom-100 bg-white text-marrom-700',
            )}
          >
            {f !== 'ALL' && <span className={clsx('size-2.5 rounded-full', TABLE_STATE[f].dot)} />}
            {f === 'ALL' ? 'Todas' : TABLE_STATE[f].label}
            <span className="tabular opacity-70">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {error && <ErrorBox onRetry={() => refetch()}>Não foi possível carregar as mesas.</ErrorBox>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {visible.map((t) => {
          const st = TABLE_STATE[t.state];
          return (
            <Link
              key={t.id}
              to={`/app/mesas/${t.id}`}
              className={clsx('relative flex min-h-36 flex-col rounded-2xl border-2 p-3.5 shadow-card transition-transform active:scale-[0.98]', st.card)}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-display text-2xl font-bold leading-none">{padTable(t.number)}</span>
                <span className="flex items-center gap-1 text-xs font-semibold text-marrom-500">
                  <Users className="size-3.5" />
                  {t.seats}
                </span>
              </div>
              {t.label && <span className="text-xs text-marrom-500">{t.label}</span>}
              <span className="mt-1 flex items-center gap-1.5 text-xs font-bold text-marrom-700">
                <span className={clsx('size-2 shrink-0 rounded-full', st.dot)} /> {st.label}
              </span>
              {t.state !== 'FREE' && (
                <div className="mt-auto pt-2">
                  <p className="text-xs text-marrom-500">
                    {t.tabs.length} {t.tabs.length === 1 ? 'comanda' : 'comandas'}
                    {t.openedAt && (
                      <>
                        {' · '}
                        <Clock className="inline size-3" /> {elapsedLabel(minutesSince(t.openedAt))}
                      </>
                    )}
                  </p>
                  <p className="tabular font-extrabold">{brl(t.totals.totalCents)}</p>
                </div>
              )}
              {t.readyOrders > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex items-center gap-1 rounded-full bg-verde-600 px-2 py-0.5 text-[11px] font-extrabold text-white shadow">
                  <CheckCircle2 className="size-3" /> {t.readyOrders} pronto
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {(filter === 'ALL' || filter === 'OCCUPIED') && counter.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold">
            <Store className="size-5 text-marrom-500" /> Balcão (sem mesa)
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {counter.map((s) => (
              <Link key={s.id} to={`/app/comandas/${s.id}`}>
                <Card className="flex items-center gap-3 p-4">
                  <span className="font-display text-lg font-bold">Comanda {padTab(s.tab.number)}</span>
                  {s.customerName && <span className="truncate text-sm text-marrom-500">{s.customerName}</span>}
                  <span className="tabular ml-auto font-extrabold">{brl(s.totals.totalCents)}</span>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Sheet open={openForm} onClose={() => setOpenForm(false)} title="Abrir comanda">
        <OpenTabForm tables={tables} onDone={() => setOpenForm(false)} />
      </Sheet>
    </div>
  );
}
