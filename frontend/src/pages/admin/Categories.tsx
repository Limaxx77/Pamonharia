import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, del, errorMessage, patch, post } from '../../lib/api';
import { ProductImage } from '../../components/menu';
import { ImageField } from '../../components/ImageField';
import { Badge, Button, ConfirmDialog, Field, Input, PageHeader, Sheet, Spinner, Toggle, useToast } from '../../components/ui';

interface Cat {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
  _count: { products: number };
}

export default function Categories() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api<{ categories: Cat[] }>('/catalog/categories').then((r) => r.categories) });
  const [editing, setEditing] = useState<Cat | 'new' | null>(null);
  const [removing, setRemoving] = useState<Cat | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
    qc.invalidateQueries({ queryKey: ['menu'] });
  };

  return (
    <div>
      <PageHeader
        title="Categorias"
        subtitle="A ordem define a sequência no cardápio"
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-5" /> Nova categoria
          </Button>
        }
      />
      {isLoading && <Spinner />}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card">
            <ProductImage src={c.imageUrl} alt="" className="size-16 shrink-0 rounded-xl" sizes="64px" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold">{c.name}</p>
              <p className="text-xs text-marrom-500">
                Ordem {c.sortOrder} · {c._count.products} produtos
              </p>
              {!c.active && <Badge className="mt-1">Inativa</Badge>}
            </div>
            <button onClick={() => setEditing(c)} aria-label={`Editar ${c.name}`} className="rounded-lg p-2 text-verde-700 hover:bg-verde-50">
              <Pencil className="size-4" />
            </button>
            <button onClick={() => setRemoving(c)} aria-label={`Excluir ${c.name}`} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {editing && <CategoryEditor cat={editing === 'new' ? null : editing} nextOrder={data?.length ?? 0} onClose={() => setEditing(null)} onSaved={refresh} />}
      <ConfirmDialog
        open={!!removing}
        title={`Excluir ${removing?.name}?`}
        message={removing?._count.products ? 'Categorias com produtos não podem ser excluídas. Mova os produtos ou desative a categoria.' : 'A categoria será excluída.'}
        danger
        confirmLabel="Excluir"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          try {
            await del(`/catalog/categories/${removing!.id}`);
          } catch (e) {
            throw new Error(errorMessage(e));
          }
          refresh();
        }}
      />
    </div>
  );
}

function CategoryEditor({ cat, nextOrder, onClose, onSaved }: { cat: Cat | null; nextOrder: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(cat?.name ?? '');
  const [description, setDescription] = useState(cat?.description ?? '');
  const [imageUrl, setImageUrl] = useState(cat?.imageUrl ?? '');
  const [sortOrder, setSortOrder] = useState(String(cat?.sortOrder ?? nextOrder));
  const [active, setActive] = useState(cat?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true);
    setErr('');
    const body = { name: name.trim(), description: description.trim() || null, imageUrl, sortOrder: Number(sortOrder) || 0, active };
    try {
      if (cat) await patch(`/catalog/categories/${cat.id}`, body);
      else await post('/catalog/categories', body);
      toast.success('Categoria salva');
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={cat ? 'Editar categoria' : 'Nova categoria'} footer={<Button block size="lg" loading={busy} onClick={save}>Salvar</Button>}>
      <div className="space-y-4">
        <Field label="Nome" htmlFor="cn">
          <Input id="cn" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Descrição" htmlFor="cd">
          <Input id="cd" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Ordem no cardápio" htmlFor="co">
          <Input id="co" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <ImageField value={imageUrl} onChange={setImageUrl} />
        <label className="flex items-center justify-between rounded-2xl bg-white p-4 text-sm font-semibold">
          Ativa no cardápio <Toggle checked={active} onChange={setActive} label="Ativa" />
        </label>
        {err && <p className="text-sm font-semibold text-rose-700">{err}</p>}
      </div>
    </Sheet>
  );
}
