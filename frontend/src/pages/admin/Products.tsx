import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { api, del, errorMessage, patch, post } from '../../lib/api';
import { brl, centsToInput, parseMoney } from '../../lib/format';
import { ProductImage } from '../../components/menu';
import { ImageField } from '../../components/ImageField';
import { Badge, Button, ConfirmDialog, Field, Input, PageHeader, Select, Sheet, Spinner, Textarea, Toggle, useToast } from '../../components/ui';

interface AdminProduct {
  id: string;
  categoryId: string;
  category: { id: string; name: string };
  name: string;
  description: string;
  ingredients: string;
  priceCents: number;
  promoPriceCents: number | null;
  imageUrl: string | null;
  available: boolean;
  active: boolean;
  featured: boolean;
  prepMinutes: number;
  sortOrder: number;
  addons: { id: string; name: string; priceCents: number; active: boolean }[];
  _count: { orderItems: number };
}
interface AdminCategory {
  id: string;
  name: string;
  active: boolean;
}

export default function Products() {
  const qc = useQueryClient();
  const toast = useToast();
  const products = useQuery({ queryKey: ['admin', 'products'], queryFn: () => api<{ products: AdminProduct[] }>('/catalog/products').then((r) => r.products) });
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api<{ categories: AdminCategory[] }>('/catalog/categories').then((r) => r.categories) });
  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null);
  const [removing, setRemoving] = useState<AdminProduct | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    qc.invalidateQueries({ queryKey: ['menu'] });
  };

  const list = useMemo(
    () =>
      (products.data ?? []).filter(
        (p) => (showInactive || p.active) && (!cat || p.categoryId === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())),
      ),
    [products.data, q, cat, showInactive],
  );

  const quick = async (p: AdminProduct, body: Partial<AdminProduct>) => {
    try {
      if ('available' in body) await patch(`/catalog/products/${p.id}/availability`, { available: body.available });
      else await patch(`/catalog/products/${p.id}`, body);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="Produtos"
        subtitle={products.data ? `${products.data.filter((p) => p.active).length} ativos no cardápio` : undefined}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-5" /> Novo produto
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-marrom-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto" className="pl-9" aria-label="Buscar produto" />
        </label>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm font-semibold text-marrom-700">
          <Toggle checked={showInactive} onChange={setShowInactive} label="Mostrar desativados" /> Desativados
        </label>
      </div>

      {products.isLoading && <Spinner />}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => (
          <li key={p.id} className={clsx('flex gap-3 rounded-2xl border border-marrom-100/70 bg-white p-3 shadow-card', !p.active && 'opacity-60')}>
            <ProductImage src={p.imageUrl} alt="" className="size-20 shrink-0 rounded-xl" sizes="80px" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-1">
                <p className="min-w-0 flex-1 font-extrabold leading-tight">{p.name}</p>
                <button onClick={() => quick(p, { featured: !p.featured })} aria-label={p.featured ? 'Remover destaque' : 'Destacar'} className="rounded-lg p-1">
                  <Star className={clsx('size-4', p.featured ? 'fill-milho-400 text-milho-500' : 'text-marrom-300')} />
                </button>
              </div>
              <p className="text-xs text-marrom-500">{p.category.name}</p>
              <p className="mt-0.5 text-sm">
                {p.promoPriceCents != null ? (
                  <>
                    <strong className="text-verde-700">{brl(p.promoPriceCents)}</strong> <s className="text-marrom-400">{brl(p.priceCents)}</s>
                  </>
                ) : (
                  <strong>{brl(p.priceCents)}</strong>
                )}
                {p.addons.filter((a) => a.active).length > 0 && <span className="text-xs text-marrom-500"> · {p.addons.filter((a) => a.active).length} adicionais</span>}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-marrom-600">
                  <Toggle checked={p.available} onChange={(v) => quick(p, { available: v })} label={`${p.name} disponível`} disabled={!p.active} />
                  {p.available ? 'Disponível' : 'Indisponível'}
                </label>
                {!p.active && <Badge>Desativado</Badge>}
                <span className="ml-auto flex gap-1">
                  <button onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`} className="rounded-lg p-2 text-verde-700 hover:bg-verde-50">
                    <Pencil className="size-4" />
                  </button>
                  {p.active && (
                    <button onClick={() => setRemoving(p)} aria-label={`Excluir ${p.name}`} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {editing && <ProductEditor product={editing === 'new' ? null : editing} categories={categories.data ?? []} onClose={() => setEditing(null)} onSaved={refresh} />}
      <ConfirmDialog
        open={!!removing}
        title={`Excluir ${removing?.name}?`}
        message={
          removing?._count.orderItems
            ? 'Este produto já foi vendido: ele será DESATIVADO (sai do cardápio) para preservar o histórico de vendas.'
            : 'O produto nunca foi vendido e será excluído definitivamente.'
        }
        danger
        confirmLabel={removing?._count.orderItems ? 'Desativar' : 'Excluir'}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          try {
            await del(`/catalog/products/${removing!.id}`);
          } catch (e) {
            throw new Error(errorMessage(e));
          }
          refresh();
        }}
      />
    </div>
  );
}

type AddonDraft = { id?: string; name: string; price: string; active: boolean };

function ProductEditor({ product, categories, onClose, onSaved }: { product: AdminProduct | null; categories: AdminCategory[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? categories[0]?.id ?? '',
    description: product?.description ?? '',
    ingredients: product?.ingredients ?? '',
    price: product ? centsToInput(product.priceCents) : '',
    promo: product?.promoPriceCents != null ? centsToInput(product.promoPriceCents) : '',
    imageUrl: product?.imageUrl ?? '',
    prepMinutes: String(product?.prepMinutes ?? 10),
    available: product?.available ?? true,
    active: product?.active ?? true,
    featured: product?.featured ?? false,
  });
  const [addons, setAddons] = useState<AddonDraft[]>(
    product?.addons.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name, price: centsToInput(a.priceCents), active: a.active })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setErr('');
    const priceCents = parseMoney(f.price);
    const promoPriceCents = f.promo ? parseMoney(f.promo) : null;
    if (f.name.trim().length < 2) return setErr('Informe o nome do produto');
    if (priceCents == null) return setErr('Preço inválido');
    if (f.promo && promoPriceCents == null) return setErr('Preço promocional inválido');
    if (promoPriceCents != null && promoPriceCents >= priceCents) return setErr('O preço promocional deve ser menor que o preço normal');
    const parsedAddons = addons.filter((a) => a.name.trim()).map((a) => ({ id: a.id, name: a.name.trim(), priceCents: parseMoney(a.price || '0'), active: a.active }));
    if (parsedAddons.some((a) => a.priceCents == null)) return setErr('Preço de adicional inválido');
    const body = {
      name: f.name.trim(),
      categoryId: f.categoryId,
      description: f.description.trim(),
      ingredients: f.ingredients.trim(),
      priceCents,
      promoPriceCents,
      imageUrl: f.imageUrl.trim(),
      prepMinutes: Number(f.prepMinutes) || 0,
      available: f.available,
      active: f.active,
      featured: f.featured,
      addons: parsedAddons,
    };
    setBusy(true);
    try {
      if (product) await patch(`/catalog/products/${product.id}`, body);
      else await post('/catalog/products', body);
      toast.success(product ? 'Produto atualizado' : 'Produto cadastrado');
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={product ? 'Editar produto' : 'Novo produto'}
      footer={
        <div className="space-y-2">
          {err && <p className="text-sm font-semibold text-rose-700">{err}</p>}
          <Button block size="lg" loading={busy} onClick={save}>
            Salvar
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <Field label="Nome" htmlFor="pn">
            <Input id="pn" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
          </Field>
          <Field label="Categoria" htmlFor="pc">
            <Select id="pc" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.active ? ' (inativa)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Preço (R$)" htmlFor="pp">
              <Input id="pp" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="15,00" />
            </Field>
            <Field label="Promoção" htmlFor="ppr">
              <Input id="ppr" inputMode="decimal" value={f.promo} onChange={(e) => set('promo', e.target.value)} placeholder="—" />
            </Field>
            <Field label="Preparo (min)" htmlFor="pt">
              <Input id="pt" inputMode="numeric" value={f.prepMinutes} onChange={(e) => set('prepMinutes', e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-marrom-500">Mudanças de preço valem só para novos pedidos — vendas anteriores mantêm o preço praticado.</p>
          <Field label="Descrição" htmlFor="pd">
            <Textarea id="pd" value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={400} rows={3} />
          </Field>
          <Field label="Ingredientes" htmlFor="pi">
            <Input id="pi" value={f.ingredients} onChange={(e) => set('ingredients', e.target.value)} maxLength={400} />
          </Field>
        </div>
        <div className="space-y-4">
          <ImageField value={f.imageUrl} onChange={(v) => set('imageUrl', v)} />
          <div className="space-y-3 rounded-2xl bg-white p-4">
            {(
              [
                ['available', 'Disponível agora'],
                ['featured', 'Destacar em “Mais pedidos”'],
                ['active', 'Ativo no cardápio'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center justify-between gap-3 text-sm font-semibold">
                {label}
                <Toggle checked={f[k]} onChange={(v) => set(k, v)} label={label} />
              </label>
            ))}
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-marrom-700">Adicionais</p>
            <div className="space-y-2">
              {addons.map((a, i) => (
                <div key={a.id ?? i} className="flex gap-2">
                  <Input value={a.name} onChange={(e) => setAddons((s) => s.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Ex.: Queijo extra" className="h-11" aria-label="Nome do adicional" />
                  <Input value={a.price} onChange={(e) => setAddons((s) => s.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} placeholder="0,00" inputMode="decimal" className="h-11 w-24 shrink-0" aria-label="Preço do adicional" />
                  <button type="button" onClick={() => setAddons((s) => s.filter((_, j) => j !== i))} aria-label="Remover adicional" className="shrink-0 rounded-xl px-2 text-rose-600 hover:bg-rose-50">
                    <X className="size-5" />
                  </button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setAddons((s) => [...s, { name: '', price: '', active: true }])}>
                <Plus className="size-4" /> Adicional
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
