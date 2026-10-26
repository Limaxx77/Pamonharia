import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlarmClock, ArrowLeft, BellRing, CheckCheck, ChefHat, Clock, Flame, PackageCheck, PackageX, Volume2, VolumeX } from 'lucide-react';
import { api, errorMessage, patch } from '../../lib/api';
import { elapsedLabel, hhmm, minutesSince, padTab, padTable } from '../../lib/format';
import { useKitchen } from '../../lib/queries';
import { EVT, useSocketEvent } from '../../lib/realtime';
import { audioEnabled, chime, unlockAudio } from '../../lib/sound';
import type { KitchenOrder, OrderStatus } from '../../lib/types';
import { SourceBadge } from '../../components/orders';
import { Button, EmptyState, ErrorBox, PageHeader, Segmented, Sheet, Spinner, Toggle, useToast } from '../../components/ui';
import { ProductImage } from '../../components/menu';

const COLUMNS: { status: OrderStatus; label: string; icon: typeof Clock; head: string }[] = [
  { status: 'RECEIVED', label: 'Recebidos', icon: BellRing, head: 'bg-sky-600' },
  { status: 'PREPARING', label: 'Em preparo', icon: Flame, head: 'bg-milho-500' },
  { status: 'READY', label: 'Prontos', icon: CheckCheck, head: 'bg-verde-600' },
];

export default function Kitchen() {
  const { data, isLoading, error, refetch } = useKitchen();
  const [tab, setTab] = useState<OrderStatus>('RECEIVED');
  const [sound, setSound] = useState(audioEnabled());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState(false);
  const [, tick] = useState(0);
  const wide = useMediaQuery('(min-width: 1024px)');
  const qc = useQueryClient();
  const toast = useToast();

  // Atualiza o tempo decorrido a cada 20s
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, []);

  // Novo pedido: alerta sonoro (se autorizado) e destaque visual por alguns segundos
  useSocketEvent<{ orderId: string; number: number }>(EVT.ORDER_NEW, (p) => {
    chime('new');
    setFresh((s) => new Set(s).add(p.orderId));
    setTimeout(() => setFresh((s) => {
      const n = new Set(s);
      n.delete(p.orderId);
      return n;
    }), 12_000);
    toast.info(`Novo pedido #${p.number}`, 2500);
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Novo pedido', { body: `Pedido #${p.number}`, icon: '/icon-192.png' });
    }
  });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => patch(`/orders/${id}/status`, { status }),
    onMutate: async ({ id, status }) => {
      // Atualização otimista: a cozinha não espera a rede para ver o card andar
      await qc.cancelQueries({ queryKey: ['kitchen'] });
      const prev = qc.getQueryData(['kitchen']);
      qc.setQueryData(['kitchen'], (old: typeof data) =>
        old ? { ...old, orders: old.orders.map((o) => (o.id === id ? { ...o, status, statusChangedAt: new Date().toISOString() } : o)).filter((o) => o.status !== 'DELIVERED') } : old,
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData(['kitchen'], ctx?.prev);
      toast.error(errorMessage(e));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['kitchen'] }),
  });

  const byStatus = useMemo(() => {
    const m: Record<string, KitchenOrder[]> = { RECEIVED: [], PREPARING: [], READY: [] };
    data?.orders.forEach((o) => m[o.status]?.push(o));
    return m;
  }, [data]);

  const enableSound = () => {
    const ok = unlockAudio();
    setSound(ok);
    if (ok) chime('ready');
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
  };

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorBox onRetry={() => refetch()}>Não foi possível carregar os pedidos.</ErrorBox>;
  const late = data.orders.filter((o) => o.status !== 'READY' && minutesSince(o.createdAt) >= data.lateMinutes).length;

  const column = (status: OrderStatus) => {
    const list = byStatus[status] ?? [];
    if (list.length === 0) return <EmptyState icon={<ChefHat className="size-10" />} title="Nada por aqui" />;
    return list.map((o) => <Ticket key={o.id} order={o} lateMinutes={data.lateMinutes} isNew={fresh.has(o.id)} onMove={(st) => move.mutate({ id: o.id, status: st })} />);
  };

  return (
    <div>
      <PageHeader
        title="Cozinha"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3">
            <span>{data.orders.length} pedidos em andamento</span>
            {late > 0 && (
              <span className="flex items-center gap-1 font-bold text-rose-700">
                <AlarmClock className="size-4" /> {late} atrasado{late > 1 ? 's' : ''} (+{data.lateMinutes} min)
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button variant={sound ? 'secondary' : 'accent'} size="sm" onClick={enableSound}>
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} {sound ? 'Som ativo' : 'Ativar som'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAvailability(true)}>
              <PackageX className="size-4" /> Disponibilidade
            </Button>
          </>
        }
      />

      {/* Celular: uma coluna por vez · Tablet/desktop: quadro com as três colunas */}
      {!wide ? (
      <div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={COLUMNS.map((c) => ({
            value: c.status,
            label: (
              <>
                {c.label} <span className="tabular rounded-full bg-marrom-100 px-1.5 text-xs">{byStatus[c.status]?.length ?? 0}</span>
              </>
            ),
          }))}
        />
        <div className="mt-3 space-y-3">{column(tab)}</div>
      </div>
      ) : (
      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map((c) => (
          <section key={c.status} className="flex min-h-[60vh] flex-col rounded-3xl bg-marrom-50/70 p-3">
            <h2 className={clsx('mb-3 flex items-center gap-2 rounded-2xl px-4 py-2.5 font-sans text-base font-extrabold text-white', c.head)}>
              <c.icon className="size-5" /> {c.label}
              <span className="tabular ml-auto rounded-full bg-white/25 px-2">{byStatus[c.status]?.length ?? 0}</span>
            </h2>
            <div className="space-y-3">{column(c.status)}</div>
          </section>
        ))}
      </div>
      )}

      {data.recentlyDelivered.length > 0 && (
        <details className="mt-6 rounded-2xl bg-white p-4 shadow-card">
          <summary className="cursor-pointer font-bold text-marrom-700">Entregues na última hora ({data.recentlyDelivered.length})</summary>
          <ul className="mt-2 divide-y divide-marrom-50 text-sm">
            {data.recentlyDelivered.map((o) => (
              <li key={o.id} className="flex flex-wrap gap-x-3 py-2">
                <span className="font-bold">#{o.number}</span>
                <span>Comanda {padTab(o.tabNumber)}</span>
                <span className="text-marrom-500">{o.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}</span>
                <span className="ml-auto text-marrom-400">{hhmm(o.statusChangedAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <AvailabilitySheet open={availability} onClose={() => setAvailability(false)} />
    </div>
  );
}

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setMatch(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return match;
}

function Ticket({ order: o, lateMinutes, isNew, onMove }: { order: KitchenOrder; lateMinutes: number; isNew: boolean; onMove: (s: OrderStatus) => void }) {
  const age = minutesSince(o.createdAt);
  const late = o.status !== 'READY' && age >= lateMinutes;
  const next: Record<string, { to: OrderStatus; label: string; icon: typeof Flame; variant: 'primary' | 'accent' }> = {
    RECEIVED: { to: 'PREPARING', label: 'Iniciar preparo', icon: Flame, variant: 'accent' },
    PREPARING: { to: 'READY', label: 'Marcar pronto', icon: CheckCheck, variant: 'primary' },
    READY: { to: 'DELIVERED', label: 'Entregue', icon: PackageCheck, variant: 'primary' },
  };
  const prev: Partial<Record<OrderStatus, OrderStatus>> = { PREPARING: 'RECEIVED', READY: 'PREPARING' };
  const action = next[o.status];
  return (
    <article
      className={clsx(
        'rounded-2xl border-2 bg-white p-4 shadow-card transition-colors',
        late ? 'animate-pulse-ring border-rose-400' : isNew ? 'border-sky-400 bg-sky-50' : 'border-transparent',
      )}
      aria-label={`Pedido ${o.number}`}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-display text-2xl font-bold">#{o.number}</span>
        {isNew && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-extrabold text-white">NOVO</span>}
        <SourceBadge source={o.source} />
        <span className={clsx('ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-extrabold', late ? 'bg-rose-600 text-white' : 'bg-marrom-50 text-marrom-700')}>
          <Clock className="size-3.5" /> {elapsedLabel(age)}
        </span>
      </header>
      <p className="mt-1 text-sm font-bold text-marrom-600">
        Comanda {padTab(o.tabNumber)} · {o.tableNumber ? `Mesa ${padTable(o.tableNumber)}` : 'Balcão'}
        {o.customerName ? ` · ${o.customerName}` : ''}
        <span className="font-normal text-marrom-400"> · {hhmm(o.createdAt)}</span>
      </p>
      <ul className="mt-3 space-y-2">
        {o.items.map((i) => (
          <li key={i.id} className="flex gap-2.5">
            <span className="tabular flex h-8 min-w-8 items-center justify-center rounded-lg bg-verde-600 px-1.5 font-extrabold text-white">{i.quantity}</span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[17px] font-extrabold leading-tight">{i.productName}</p>
              {i.addons.length > 0 && <p className="text-sm font-semibold text-verde-700">+ {i.addons.join(', ')}</p>}
              {i.note && <p className="mt-0.5 rounded-md bg-milho-200 px-1.5 py-0.5 text-sm font-bold text-marrom-900">⚠ {i.note}</p>}
            </div>
          </li>
        ))}
      </ul>
      {o.note && <p className="mt-2 rounded-lg bg-milho-100 px-2 py-1 text-sm font-semibold">Obs.: {o.note}</p>}
      <div className="mt-4 flex gap-2">
        {prev[o.status] && (
          <Button variant="outline" aria-label="Voltar etapa" onClick={() => onMove(prev[o.status]!)}>
            <ArrowLeft className="size-4" />
          </Button>
        )}
        {action && (
          <Button block size="lg" variant={action.variant} onClick={() => onMove(action.to)}>
            <action.icon className="size-5" /> {action.label}
          </Button>
        )}
      </div>
    </article>
  );
}

function AvailabilitySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['availability'],
    queryFn: () => api<{ products: { id: string; name: string; available: boolean; imageUrl: string | null; category: { name: string } }[] }>('/catalog/availability').then((r) => r.products),
    enabled: open,
  });
  const pending = useRef(new Set<string>());
  const toggle = async (id: string, available: boolean) => {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    try {
      await patch(`/catalog/products/${id}/availability`, { available });
      qc.invalidateQueries({ queryKey: ['availability'] });
      qc.invalidateQueries({ queryKey: ['menu'] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      pending.current.delete(id);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Disponibilidade dos produtos">
      <p className="mb-3 text-sm text-marrom-600">Desligue o que acabou. O cardápio dos clientes e garçons é atualizado na hora.</p>
      {!data ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-marrom-100 rounded-2xl bg-white">
          {data.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <ProductImage src={p.imageUrl} alt="" className="size-11 rounded-lg" sizes="44px" />
              <div className="min-w-0 flex-1">
                <p className={clsx('truncate font-bold', !p.available && 'text-marrom-400 line-through')}>{p.name}</p>
                <p className="text-xs text-marrom-500">{p.category.name}</p>
              </div>
              <Toggle checked={p.available} onChange={(v) => toggle(p.id, v)} label={`${p.name} disponível`} />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
