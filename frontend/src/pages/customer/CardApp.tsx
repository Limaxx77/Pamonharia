import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { BellRing, CheckCircle2, CircleSlash, ClipboardList, Nfc, ReceiptText, ShieldAlert, UtensilsCrossed } from 'lucide-react';
import { api, ApiError, errorMessage, post } from '../../lib/api';
import { brl, padTab, padTable } from '../../lib/format';
import { useCart } from '../../lib/cart';
import { EVT, getSocket, useLiveQueries } from '../../lib/realtime';
import type { CustomerSession, Product, Settings } from '../../lib/types';
import { DemoBanner, Logo, useMenu } from '../../components/brand';
import { CartBar, CartSheet, MenuBrowser, ProductSheet } from '../../components/menu';
import { OrderCard, TotalsBox } from '../../components/orders';
import { Button, EmptyState, ErrorBox, Field, Input, Spinner, useToast } from '../../components/ui';

interface CardState {
  tab: { number: number; label: string };
  session: CustomerSession | null;
  canSelfOpen: boolean;
  settings: Settings;
}

type View = 'menu' | 'orders' | 'bill';

const storage = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* indisponível */
    }
  },
};

export function CardApp() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const sessionKey = `pm.card.${token}.session`;
  const [view, setView] = useState<View>('menu');
  const [selected, setSelected] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<number | null>(null);

  const cardQuery = useQuery({
    queryKey: ['card', token],
    queryFn: () => {
      const known = storage.get(sessionKey);
      return api<CardState>(`/public/cards/${encodeURIComponent(token)}${known ? `?sessionId=${encodeURIComponent(known)}` : ''}`);
    },
    refetchInterval: 60_000, // segurança extra caso o tempo real caia
  });
  const menu = useMenu();
  const card = cardQuery.data;
  const session = card?.session ?? null;
  const open = session?.status === 'OPEN';

  // Lembra o atendimento deste aparelho (permite ver o resumo logo após o fechamento)
  useEffect(() => {
    if (session?.id) storage.set(sessionKey, session.id);
  }, [session?.id, sessionKey]);

  // Tempo real: entra na sala do atendimento do cartão
  useEffect(() => {
    const s = getSocket();
    const join = () => s.emit('join:card', token);
    join();
    s.on('connect', join);
    return () => {
      s.off('connect', join);
    };
  }, [token, session?.id]);
  useLiveQueries([EVT.ORDER_UPDATED, EVT.SESSION_UPDATED], [['card', token]]);

  // Avisa quando um pedido fica pronto
  const prevStatuses = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!session) return;
    for (const o of session.orders) {
      const before = prevStatuses.current[o.id];
      if (before && before !== o.status && o.status === 'READY') {
        toast.success(`Pedido #${o.number} está pronto! Já vai chegar na sua mesa.`, 6000);
        navigator.vibrate?.([100, 50, 100]);
      }
      prevStatuses.current[o.id] = o.status;
    }
  }, [session, toast]);

  // Carrinho separado por atendimento: um carrinho antigo nunca vai para outro atendimento
  const cart = useCart(`pm.cart.${token}.${session?.id ?? 'none'}`);

  const send = useMutation({
    mutationFn: () =>
      post<{ orderId: string; number: number; duplicate: boolean }>(`/public/cards/${encodeURIComponent(token)}/orders`, {
        sessionId: session!.id,
        items: cart.payload(),
        idempotencyKey: cart.checkoutKey(),
      }),
    onSuccess: (r) => {
      cart.clear();
      setCartOpen(false);
      setSubmitError(null);
      setConfirmed(r.number);
      setView('orders');
      window.scrollTo({ top: 0 });
      qc.invalidateQueries({ queryKey: ['card', token] });
      setTimeout(() => setConfirmed(null), 2600);
    },
    onError: (e) => {
      setSubmitError(errorMessage(e));
      if (e instanceof ApiError && ['SESSION_CHANGED', 'NO_OPEN_SESSION', 'SESSION_CLOSED', 'PRODUCT_UNAVAILABLE'].includes(e.code)) {
        qc.invalidateQueries({ queryKey: ['card', token] });
        qc.invalidateQueries({ queryKey: ['menu'] });
      }
    },
  });

  const callWaiter = useMutation({
    mutationFn: () => post(`/public/cards/${encodeURIComponent(token)}/call-waiter`),
    onSuccess: () => toast.success('Garçom chamado! Já já alguém vem até você.'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const requestBill = useMutation({
    mutationFn: () => post(`/public/cards/${encodeURIComponent(token)}/request-bill`),
    onSuccess: () => {
      toast.success('Conta solicitada. Dirija-se ao caixa ou aguarde o atendente.');
      qc.invalidateQueries({ queryKey: ['card', token] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // ---------------------------------------------------------------- estados de erro / sem atendimento
  if (cardQuery.isLoading) return <Spinner className="min-h-dvh" />;
  if (cardQuery.error) {
    const e = cardQuery.error;
    const blocked = e instanceof ApiError && e.status === 403;
    return (
      <Shell>
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-rose-100 text-rose-600">{blocked ? <ShieldAlert className="size-8" /> : <CircleSlash className="size-8" />}</div>
          <h1 className="mt-4 text-2xl font-bold">{blocked ? 'Cartão indisponível' : e instanceof ApiError && e.status === 404 ? 'Cartão não reconhecido' : 'Não foi possível abrir a comanda'}</h1>
          <p className="mt-2 text-marrom-600">{blocked ? 'Este cartão está bloqueado ou foi substituído. Procure um atendente para receber uma nova comanda.' : errorMessage(e)}</p>
          {!blocked && (
            <Button className="mt-6" onClick={() => cardQuery.refetch()}>
              Tentar de novo
            </Button>
          )}
        </div>
      </Shell>
    );
  }
  if (!card) return null;

  if (!session) {
    return (
      <Shell tabLabel={card.tab.label}>
        <NoSession token={token} card={card} />
        {menu.data && (
          <div className="mx-auto max-w-5xl px-4 pb-12">
            <MenuBrowser categories={menu.data} canOrder={false} onSelect={setSelected} stickyTop={64} />
          </div>
        )}
        <ProductSheet product={selected} onClose={() => setSelected(null)} />
      </Shell>
    );
  }

  if (!open) {
    return (
      <Shell tabLabel={card.tab.label}>
        <div className="mx-auto max-w-md px-4 py-10">
          <div className="text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-verde-100 text-verde-700">
              <CheckCircle2 className="size-9" />
            </div>
            <h1 className="mt-4 text-2xl font-bold">Atendimento encerrado</h1>
            <p className="mt-1 text-marrom-600">Obrigado pela visita! Esta comanda não aceita novos pedidos.</p>
          </div>
          <div className="mt-6">
            <TotalsBox totals={session.totals} serviceFeePercent={session.serviceFeePercent} payments={session.payments} />
          </div>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------- atendimento aberto
  return (
    <Shell tabLabel={card.tab.label} tableNumber={session.tableNumber} total={session.totals.totalCents} onBill={() => setView('bill')}>
      <main className="mx-auto max-w-5xl px-4 pb-44">
        {view === 'menu' && menu.data && <MenuBrowser categories={menu.data} canOrder onSelect={setSelected} stickyTop={64} />}
        {view === 'menu' && menu.isLoading && <Spinner />}
        {view === 'orders' && <OrdersView session={session} onMenu={() => setView('menu')} />}
        {view === 'bill' && (
          <BillView session={session} onCall={() => callWaiter.mutate()} calling={callWaiter.isPending} onRequestBill={() => requestBill.mutate()} requesting={requestBill.isPending} />
        )}
      </main>

      {view === 'menu' && <CartBar cart={cart} onOpen={() => setCartOpen(true)} bottom={64} />}

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-marrom-100 bg-white/95 backdrop-blur" aria-label="Navegação da comanda">
        <div className="mx-auto flex max-w-lg">
          {(
            [
              { v: 'menu', label: 'Cardápio', icon: UtensilsCrossed },
              { v: 'orders', label: 'Pedidos', icon: ClipboardList, badge: session.orders.filter((o) => ['RECEIVED', 'PREPARING', 'READY'].includes(o.status)).length },
              { v: 'bill', label: 'Conta', icon: ReceiptText },
            ] as const
          ).map((t) => (
            <button
              key={t.v}
              onClick={() => {
                setView(t.v);
                window.scrollTo({ top: 0 });
              }}
              aria-current={view === t.v ? 'page' : undefined}
              className={clsx('relative flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold', view === t.v ? 'text-verde-700' : 'text-marrom-400')}
            >
              <span className={clsx('flex h-8 w-14 items-center justify-center rounded-full', view === t.v && 'bg-verde-100')}>
                <t.icon className="size-5" />
              </span>
              {t.label}
              {'badge' in t && t.badge > 0 && (
                <span className="tabular absolute right-[calc(50%-26px)] top-1.5 flex size-5 items-center justify-center rounded-full bg-milho-400 text-[11px] font-extrabold text-marrom-900">{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <ProductSheet product={selected} onClose={() => setSelected(null)} onAdd={(p, q, a, n) => {
        cart.add(p, q, a, n);
        toast.info(`${q}× ${p.name} no carrinho`, 1800);
      }} />
      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        submitting={send.isPending}
        error={submitError}
        onConfirm={() => {
          setSubmitError(null);
          send.mutate();
        }}
        context={
          <p className="mb-2 rounded-xl bg-verde-50 px-3 py-2 text-sm font-semibold text-verde-800">
            Será lançado na comanda {card.tab.label}
            {session.tableNumber ? ` · Mesa ${padTable(session.tableNumber)}` : ''}
          </p>
        }
      />

      {confirmed != null && (
        <div role="status" className="fixed inset-0 z-[70] flex animate-fade-in items-center justify-center bg-verde-800/90 px-6 text-center text-white">
          <div className="animate-pop">
            <CheckCircle2 className="mx-auto size-20 text-milho-300" />
            <p className="mt-4 font-display text-3xl font-bold">Pedido #{confirmed} enviado!</p>
            <p className="mt-1 text-verde-100">A cozinha já recebeu. Acompanhe o preparo por aqui.</p>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, tabLabel, tableNumber, total, onBill }: { children: React.ReactNode; tabLabel?: string; tableNumber?: number | null; total?: number; onBill?: () => void }) {
  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-40 bg-verde-800 text-white shadow-md">
        <DemoBanner />
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Logo light className="[&>span]:hidden min-[400px]:[&>span]:inline" />
          {tabLabel && (
            <div className="ml-auto flex items-center gap-2">
              <div className="text-right leading-tight">
                <p className="flex items-center justify-end gap-1 text-[11px] font-bold uppercase tracking-wide text-verde-200">
                  <Nfc className="size-3" /> Comanda {tabLabel}
                  {tableNumber ? ` · Mesa ${padTable(tableNumber)}` : ''}
                </p>
                {total != null && (
                  <button onClick={onBill} className="tabular font-display text-lg font-bold text-milho-300">
                    {brl(total)}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}

function NoSession({ token, card }: { token: string; card: CardState }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const openMut = useMutation({
    mutationFn: () => post(`/public/cards/${encodeURIComponent(token)}/open`, { customerName: name.trim() || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card', token] }),
  });
  return (
    <div className="mx-auto max-w-md px-4 pt-8 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-milho-200 text-verde-800">
        <Nfc className="size-8" />
      </div>
      <h1 className="mt-4 text-2xl font-bold">Comanda {padTab(card.tab.number)}</h1>
      {card.canSelfOpen ? (
        <>
          <p className="mt-1 text-marrom-600">Bem-vindo(a)! Inicie seu atendimento para fazer pedidos por esta comanda.</p>
          <form
            className="mt-5 space-y-3 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              openMut.mutate();
            }}
          >
            <Field label="Seu nome (opcional)" htmlFor="cn">
              <Input id="cn" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" placeholder="Como podemos te chamar?" />
            </Field>
            {openMut.error && <ErrorBox>{errorMessage(openMut.error)}</ErrorBox>}
            <Button type="submit" size="lg" block loading={openMut.isPending}>
              Iniciar atendimento
            </Button>
          </form>
        </>
      ) : (
        <p className="mt-2 rounded-2xl bg-white p-4 text-marrom-700 shadow-card">
          Esta comanda ainda não foi aberta. <strong>Peça a um atendente para ativá-la</strong> — enquanto isso, confira o cardápio abaixo.
        </p>
      )}
      <h2 className="mt-10 text-left text-xl font-bold">Cardápio</h2>
    </div>
  );
}

function OrdersView({ session, onMenu }: { session: CustomerSession; onMenu: () => void }) {
  const orders = useMemo(() => [...session.orders].reverse(), [session.orders]);
  if (orders.length === 0) {
    return (
      <EmptyState icon={<ClipboardList className="size-12" />} title="Nenhum pedido ainda">
        <Button className="mt-4" onClick={onMenu}>
          Ver cardápio
        </Button>
      </EmptyState>
    );
  }
  return (
    <div className="space-y-3 pt-4">
      <h1 className="text-2xl font-bold">Seus pedidos</h1>
      <p className="-mt-2 text-sm text-marrom-500">Inclui pedidos feitos pelo garçom nesta comanda. Atualiza sozinho.</p>
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} showProgress />
      ))}
    </div>
  );
}

function BillView({ session, onCall, calling, onRequestBill, requesting }: { session: CustomerSession; onCall: () => void; calling: boolean; onRequestBill: () => void; requesting: boolean }) {
  // Consumo consolidado por produto
  const lines = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; total: number }>();
    for (const o of session.orders) {
      if (o.status === 'CANCELLED') continue;
      for (const i of o.items) {
        const k = `${i.productName}|${i.addons.map((a) => a.name).join(',')}|${i.unitPriceCents}`;
        const name = i.addons.length ? `${i.productName} (+ ${i.addons.map((a) => a.name).join(', ')})` : i.productName;
        const cur = map.get(k) ?? { name, qty: 0, total: 0 };
        cur.qty += i.quantity;
        cur.total += i.totalCents;
        map.set(k, cur);
      }
    }
    return [...map.values()];
  }, [session.orders]);

  return (
    <div className="space-y-4 pt-4">
      <h1 className="text-2xl font-bold">Sua conta</h1>
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <p className="text-sm font-extrabold uppercase tracking-wide text-marrom-500">Consumo</p>
        {lines.length === 0 ? (
          <p className="py-4 text-center text-marrom-500">Nenhum item consumido ainda.</p>
        ) : (
          <ul className="mt-2 divide-y divide-marrom-50 text-sm">
            {lines.map((l) => (
              <li key={l.name} className="flex gap-2 py-2">
                <span className="tabular w-7 shrink-0 font-extrabold text-verde-700">{l.qty}×</span>
                <span className="flex-1">{l.name}</span>
                <span className="tabular font-semibold">{brl(l.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <TotalsBox totals={session.totals} serviceFeePercent={session.serviceFeePercent} payments={session.payments} />
      <p className="text-xs text-marrom-500">Valor parcial, atualizado automaticamente. O pagamento é feito no caixa ou com o atendente.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="outline" size="lg" onClick={onCall} loading={calling}>
          <BellRing className="size-5" /> Chamar garçom
        </Button>
        <Button variant="accent" size="lg" onClick={onRequestBill} loading={requesting} disabled={!!session.billRequestedAt || session.totals.itemsCount === 0}>
          <ReceiptText className="size-5" /> {session.billRequestedAt ? 'Conta solicitada' : 'Pedir a conta'}
        </Button>
      </div>
    </div>
  );
}
