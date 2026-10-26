import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Clock, Flame, Plus, Search, ShoppingBag, Trash2, WifiOff, X } from 'lucide-react';
import { brl } from '../lib/format';
import { effectivePrice, unitPrice, type Cart } from '../lib/cart';
import type { Addon, Category, Product } from '../lib/types';
import { Badge, Button, Field, Sheet, Stepper, Textarea } from './ui';
import { API_BASE } from '../lib/api';

export const FALLBACK_IMG = '/images/fallback.svg';

function resolve(url: string | null) {
  if (!url) return FALLBACK_IMG;
  if (url.startsWith('/uploads/')) return `${API_BASE}${url}`;
  return url;
}

/** Imagem com versões responsivas (quando disponíveis) e fallback se o endereço falhar. */
export function ProductImage({ src, alt, className, sizes = '(max-width: 640px) 40vw, 320px', eager }: { src: string | null; alt: string; className?: string; sizes?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const url = failed ? FALLBACK_IMG : resolve(src);
  const srcSet = !failed && url.endsWith('-960.jpg') ? `${url.replace('-960.jpg', '-500.jpg')} 500w, ${url} 960w` : undefined;
  return (
    <img
      src={url}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={clsx('bg-creme-escuro object-cover', className)}
    />
  );
}

export function Price({ product, className }: { product: Pick<Product, 'priceCents' | 'promoPriceCents'>; className?: string }) {
  if (product.promoPriceCents != null) {
    return (
      <span className={clsx('flex flex-wrap items-baseline gap-x-1.5', className)}>
        <span className="tabular font-extrabold text-verde-700">{brl(product.promoPriceCents)}</span>
        <span className="tabular text-xs text-marrom-400 line-through">{brl(product.priceCents)}</span>
      </span>
    );
  }
  return <span className={clsx('tabular font-extrabold text-marrom-900', className)}>{brl(product.priceCents)}</span>;
}

export function ProductCard({ product, onOpen, canOrder }: { product: Product; onOpen: () => void; canOrder: boolean }) {
  const off = !product.available;
  return (
    <article
      className={clsx(
        'group relative flex overflow-hidden rounded-2xl border border-marrom-100/70 bg-white shadow-card transition-shadow hover:shadow-lg sm:flex-col',
        off && 'opacity-70',
      )}
    >
      <button type="button" onClick={onOpen} className="absolute inset-0 z-10" aria-label={`Ver detalhes de ${product.name}`} />
      <div className="relative w-28 shrink-0 sm:w-full">
        <ProductImage src={product.imageUrl} alt={product.name} className="h-full min-h-28 w-full sm:aspect-[4/3] sm:h-auto" />
        {product.promoPriceCents != null && (
          <span className="absolute left-2 top-2 rounded-full bg-milho-400 px-2 py-0.5 text-[11px] font-extrabold text-marrom-900 shadow">Promo</span>
        )}
        {off && (
          <span className="absolute inset-0 flex items-center justify-center bg-marrom-900/45 text-xs font-extrabold uppercase tracking-wide text-white">Indisponível</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
        <h3 className="font-sans text-[15px] font-extrabold leading-snug text-marrom-900">{product.name}</h3>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-marrom-500">{product.description}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <Price product={product} />
          {canOrder && (
            <span
              aria-hidden
              className={clsx(
                'relative z-0 inline-flex size-9 items-center justify-center rounded-full shadow-sm transition-transform group-active:scale-90',
                off ? 'bg-stone-200 text-stone-500' : 'bg-verde-600 text-white',
              )}
            >
              <Plus className="size-5" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** Detalhes do produto, adicionais, quantidade e observação. */
export function ProductSheet({ product, onClose, onAdd }: { product: Product | null; onClose: () => void; onAdd?: (p: Product, qty: number, addons: Addon[], note: string) => void }) {
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  useEffect(() => {
    setQty(1);
    setSelected([]);
    setNote('');
  }, [product?.id]);
  if (!product) return null;
  const addons = product.addons.filter((a) => selected.includes(a.id));
  const unit = effectivePrice(product) + addons.reduce((s, a) => s + a.priceCents, 0);
  const canAdd = !!onAdd && product.available;

  return (
    <Sheet
      open={!!product}
      onClose={onClose}
      footer={
        onAdd ? (
          <div className="flex items-center gap-3">
            <Stepper value={qty} onChange={setQty} min={1} />
            <Button
              block
              size="lg"
              disabled={!canAdd}
              onClick={() => {
                onAdd(product, qty, addons, note.trim());
                onClose();
              }}
            >
              {product.available ? (
                <>
                  Adicionar <span className="tabular ml-auto opacity-90">{brl(unit * qty)}</span>
                </>
              ) : (
                'Indisponível no momento'
              )}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="-mx-5 -mt-1 mb-4 overflow-hidden sm:mx-0 sm:mt-2 sm:rounded-2xl">
        <ProductImage src={product.imageUrl} alt={product.name} className="aspect-[16/10] w-full" sizes="(max-width: 640px) 100vw, 512px" eager />
      </div>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-bold">{product.name}</h2>
        <button onClick={onClose} aria-label="Fechar" className="-mr-1 -mt-1 rounded-full p-2 text-marrom-500 hover:bg-marrom-50">
          <X className="size-5" />
        </button>
      </div>
      <Price product={product} className="mt-1 text-lg" />
      <p className="mt-3 text-marrom-700">{product.description}</p>
      {product.ingredients && (
        <p className="mt-2 text-sm text-marrom-500">
          <span className="font-bold text-marrom-600">Ingredientes:</span> {product.ingredients}
        </p>
      )}
      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-marrom-500">
        <Clock className="size-3.5" /> Preparo médio: {product.prepMinutes} min
      </p>

      {onAdd && product.addons.length > 0 && (
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-extrabold uppercase tracking-wide text-marrom-600">Adicionais</legend>
          <div className="divide-y divide-marrom-100 overflow-hidden rounded-2xl border border-marrom-100 bg-white">
            {product.addons.map((a) => {
              const on = selected.includes(a.id);
              return (
                <label key={a.id} className="flex min-h-13 cursor-pointer items-center gap-3 px-4 py-3 hover:bg-verde-50/50">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setSelected((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]))}
                    className="size-5 accent-verde-600"
                  />
                  <span className="flex-1 font-semibold">{a.name}</span>
                  <span className="tabular text-sm font-bold text-verde-700">+ {brl(a.priceCents)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      {onAdd && (
        <div className="mt-5">
          <Field label="Observações" htmlFor="obs" hint="Ex.: sem cebola, bem quente, para viagem">
            <Textarea id="obs" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} placeholder="Alguma preferência?" />
          </Field>
        </div>
      )}
    </Sheet>
  );
}

/** Cardápio navegável: busca, categorias fixas no topo, destaques e lista de produtos. */
export function MenuBrowser({ categories, onSelect, canOrder, header, stickyTop = 0 }: { categories: Category[]; onSelect: (p: Product) => void; canOrder: boolean; header?: ReactNode; stickyTop?: number }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState<string | undefined>(categories[0]?.id);
  const sections = useRef<Record<string, HTMLElement | null>>({});
  const chipBar = useRef<HTMLDivElement>(null);
  const clickScrolling = useRef(false);

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const filtered = useMemo(() => {
    if (!q.trim()) return categories;
    const n = norm(q);
    return categories
      .map((c) => ({ ...c, products: c.products.filter((p) => norm(`${p.name} ${p.description} ${p.ingredients}`).includes(n)) }))
      .filter((c) => c.products.length > 0);
  }, [categories, q]);
  const featured = useMemo(() => categories.flatMap((c) => c.products).filter((p) => p.featured && p.available), [categories]);

  // Destaca a categoria visível durante a rolagem
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        if (clickScrolling.current) return;
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.getAttribute('data-cat') ?? undefined);
      },
      { rootMargin: `-${stickyTop + 120}px 0px -55% 0px` },
    );
    Object.values(sections.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [filtered, stickyTop]);

  useEffect(() => {
    const chip = chipBar.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    chip?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [active]);

  const goTo = (id: string) => {
    setActive(id);
    const el = sections.current[id];
    if (!el) return;
    clickScrolling.current = true;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - stickyTop - 110, behavior: 'smooth' });
    setTimeout(() => (clickScrolling.current = false), 700);
  };

  return (
    <div>
      {header}
      <div className="sticky z-20 -mx-4 bg-creme/95 px-4 pb-2 pt-2 backdrop-blur sm:mx-0 sm:px-0" style={{ top: stickyTop }}>
        <label className="relative block">
          <span className="sr-only">Buscar no cardápio</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-marrom-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar pamonha, curau, suco..."
            className="h-12 w-full rounded-2xl border border-marrom-100 bg-white pl-11 pr-4 shadow-sm placeholder:text-marrom-300 focus:border-verde-500 focus:outline-none focus:ring-2 focus:ring-verde-500/25"
          />
        </label>
        <div ref={chipBar} className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {filtered.map((c) => (
            <button
              key={c.id}
              data-chip={c.id}
              onClick={() => goTo(c.id)}
              className={clsx(
                'h-10 shrink-0 rounded-full px-4 text-sm font-bold transition-colors',
                active === c.id ? 'bg-verde-600 text-white shadow-sm' : 'border border-marrom-100 bg-white text-marrom-700 hover:bg-verde-50',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {!q && featured.length > 0 && (
        <section className="mt-3" aria-label="Destaques">
          <h2 className="mb-2 flex items-center gap-1.5 text-lg font-bold">
            <Flame className="size-5 text-milho-600" /> Mais pedidos
          </h2>
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {featured.map((p) => (
              <button key={p.id} onClick={() => onSelect(p)} className="w-44 shrink-0 snap-start overflow-hidden rounded-2xl border border-marrom-100/70 bg-white text-left shadow-card transition-transform active:scale-[0.98]">
                <ProductImage src={p.imageUrl} alt={p.name} className="aspect-[4/3] w-full" sizes="176px" />
                <div className="p-3">
                  <p className="line-clamp-1 text-sm font-extrabold">{p.name}</p>
                  <Price product={p} className="text-sm" />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && <p className="py-12 text-center text-marrom-500">Nenhum item encontrado para “{q}”.</p>}

      {filtered.map((c) => (
        <section key={c.id} data-cat={c.id} ref={(el) => void (sections.current[c.id] = el)} className="mt-6 scroll-mt-40" aria-labelledby={`cat-${c.id}`}>
          <div className="mb-3">
            <h2 id={`cat-${c.id}`} className="text-xl font-bold">
              {c.name}
            </h2>
            {c.description && <p className="text-sm text-marrom-500">{c.description}</p>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {c.products.map((p) => (
              <ProductCard key={p.id} product={p} canOrder={canOrder} onOpen={() => onSelect(p)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Barra flutuante do carrinho */
export function CartBar({ cart, onOpen, bottom = 0 }: { cart: Cart; onOpen: () => void; bottom?: number }) {
  if (cart.count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-30 px-4" style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom) + 12px)` }}>
      <button
        onClick={onOpen}
        className="pointer-events-auto mx-auto flex h-14 w-full max-w-md animate-pop items-center gap-3 rounded-2xl bg-verde-700 px-4 text-white shadow-float transition-transform active:scale-[0.98]"
      >
        <span className="relative">
          <ShoppingBag className="size-6" />
          <span className="tabular absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-milho-400 text-[11px] font-extrabold text-marrom-900">{cart.count}</span>
        </span>
        <span className="font-extrabold">Ver carrinho</span>
        <span className="tabular ml-auto font-extrabold">{brl(cart.subtotal)}</span>
      </button>
    </div>
  );
}

/** Carrinho: editar quantidades e observações e confirmar o pedido. */
export function CartSheet({
  open,
  onClose,
  cart,
  onConfirm,
  submitting,
  error,
  title = 'Seu pedido',
  confirmLabel = 'Confirmar pedido',
  context,
}: {
  open: boolean;
  onClose: () => void;
  cart: Cart;
  onConfirm: () => void;
  submitting: boolean;
  error?: string | null;
  title?: string;
  confirmLabel?: string;
  context?: ReactNode;
}) {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        cart.count > 0 && (
          <div className="space-y-2">
            {!online && (
              <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                <WifiOff className="size-4" /> Sem internet. O pedido só é enviado com conexão.
              </p>
            )}
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}
            <Button block size="lg" loading={submitting} disabled={!online} onClick={onConfirm}>
              {confirmLabel} <span className="tabular ml-auto">{brl(cart.subtotal)}</span>
            </Button>
          </div>
        )
      }
    >
      {context}
      {cart.lines.length === 0 ? (
        <div className="py-10 text-center text-marrom-500">
          <ShoppingBag className="mx-auto mb-2 size-10 text-marrom-200" />
          Seu carrinho está vazio.
        </div>
      ) : (
        <ul className="divide-y divide-marrom-100">
          {cart.lines.map((l) => (
            <li key={l.key} className="flex gap-3 py-3">
              <ProductImage src={l.imageUrl} alt="" className="size-16 shrink-0 rounded-xl" sizes="64px" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-extrabold leading-tight">{l.name}</p>
                  <button onClick={() => cart.remove(l.key)} aria-label={`Remover ${l.name}`} className="-mr-1 -mt-1 rounded-full p-1.5 text-marrom-400 hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {l.addons.length > 0 && <p className="text-xs text-marrom-500">+ {l.addons.map((a) => a.name).join(', ')}</p>}
                <input
                  value={l.note}
                  onChange={(e) => cart.setNote(l.key, e.target.value)}
                  maxLength={200}
                  placeholder="Adicionar observação"
                  aria-label={`Observação para ${l.name}`}
                  className="mt-1 w-full rounded-lg border border-transparent bg-marrom-50/60 px-2 py-1 text-sm placeholder:text-marrom-300 focus:border-verde-400 focus:bg-white focus:outline-none"
                />
                <div className="mt-2 flex items-center justify-between">
                  <Stepper size="sm" value={l.quantity} onChange={(v) => cart.setQty(l.key, v)} />
                  <span className="tabular font-extrabold">{brl(unitPrice(l) * l.quantity)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {cart.count > 0 && (
        <div className="mt-2 flex items-center justify-between rounded-xl bg-white px-4 py-3">
          <span className="font-bold text-marrom-600">Subtotal ({cart.count} {cart.count === 1 ? 'item' : 'itens'})</span>
          <span className="tabular text-lg font-extrabold">{brl(cart.subtotal)}</span>
        </div>
      )}
    </Sheet>
  );
}

export function AvailabilityNotice() {
  return (
    <Badge tone="amber">
      <AlertTriangle className="size-3" /> Itens indisponíveis aparecem esmaecidos
    </Badge>
  );
}
