import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { ApiError, errorMessage, post } from '../../lib/api';
import { brl, padTab, padTable } from '../../lib/format';
import { useCart } from '../../lib/cart';
import { useSession } from '../../lib/queries';
import type { Product } from '../../lib/types';
import { useMenu } from '../../components/brand';
import { CartBar, CartSheet, MenuBrowser, ProductSheet } from '../../components/menu';
import { ErrorBox, Spinner, useToast } from '../../components/ui';

/** Pedido lançado pelo garçom: mesmo cardápio e mesma comanda usados pelo cartão NFC. */
export default function WaiterOrder() {
  const { id = '' } = useParams();
  const { data: s, isLoading, error } = useSession(id);
  const menu = useMenu();
  const cart = useCart(`pm.waiter-cart.${id}`);
  const [selected, setSelected] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();

  const send = useMutation({
    mutationFn: () => post<{ number: number }>(`/sessions/${id}/orders`, { items: cart.payload(), idempotencyKey: cart.checkoutKey() }),
    onSuccess: (r) => {
      toast.success(`Pedido #${r.number} enviado para a cozinha`);
      cart.clear();
      setCartOpen(false);
      qc.invalidateQueries({ queryKey: ['session', id] });
      nav(s?.table ? `/app/mesas/${s.table.id}` : `/app/comandas/${id}`);
    },
    onError: (e) => {
      setSubmitError(errorMessage(e));
      if (e instanceof ApiError && e.code === 'PRODUCT_UNAVAILABLE') qc.invalidateQueries({ queryKey: ['menu'] });
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !s) return <ErrorBox>Comanda não encontrada.</ErrorBox>;
  if (s.status !== 'OPEN') return <ErrorBox>Esta comanda está encerrada e não aceita novos pedidos.</ErrorBox>;

  return (
    <div className="pb-24">
      <div className="mb-2 flex items-center gap-2">
        <Link to={`/app/comandas/${id}`} aria-label="Voltar" className="-ml-2 rounded-full p-2 text-verde-700 hover:bg-verde-50">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">
            Comanda {padTab(s.tab.number)} · {s.table ? `Mesa ${padTable(s.table.number)}` : 'Balcão'}
          </h1>
          <p className="text-sm text-marrom-500">
            Consumo atual {brl(s.totals.totalCents)}
            {s.customerName ? ` · ${s.customerName}` : ''}
          </p>
        </div>
      </div>
      {menu.isLoading && <Spinner />}
      {menu.data && <MenuBrowser categories={menu.data} canOrder onSelect={setSelected} stickyTop={56} />}

      <CartBar cart={cart} onOpen={() => setCartOpen(true)} bottom={64} />
      <ProductSheet product={selected} onClose={() => setSelected(null)} onAdd={(p, q, a, n) => cart.add(p, q, a, n)} />
      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        title={`Pedido · Comanda ${padTab(s.tab.number)}`}
        confirmLabel="Enviar para a cozinha"
        submitting={send.isPending}
        error={submitError}
        onConfirm={() => {
          setSubmitError(null);
          send.mutate();
        }}
      />
    </div>
  );
}
