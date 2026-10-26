import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Pencil, Plus, ScrollText, Store, Table2 } from 'lucide-react';
import { api, errorMessage, patch, post, put } from '../../lib/api';
import { dateTime, padTable } from '../../lib/format';
import { Badge, Button, Card, Field, Input, PageHeader, Segmented, Sheet, Spinner, Toggle, useToast } from '../../components/ui';

type Tab = 'store' | 'tables' | 'audit';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('store');
  return (
    <div>
      <PageHeader title="Configurações" subtitle="Estabelecimento, mesas e auditoria" />
      <div className="mb-4 max-w-lg">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'store', label: (<><Store className="size-4" /> Estabelecimento</>) },
            { value: 'tables', label: (<><Table2 className="size-4" /> Mesas</>) },
            { value: 'audit', label: (<><ScrollText className="size-4" /> Auditoria</>) },
          ]}
        />
      </div>
      {tab === 'store' && <StoreSettings />}
      {tab === 'tables' && <TablesSettings />}
      {tab === 'audit' && <AuditLog />}
    </div>
  );
}

interface S {
  name: string;
  tagline: string;
  phone: string;
  address: string;
  openingHours: string;
  serviceFeePercent: number;
  allowSelfOpen: boolean;
  kitchenLateMinutes: number;
  demoMode: boolean;
}

function StoreSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<{ settings: S }>('/admin/settings').then((r) => r.settings) });
  const [f, setF] = useState<S | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setF(data);
  }, [data]);
  if (!f) return <Spinner />;
  const set = <K extends keyof S>(k: K, v: S[K]) => setF((s) => (s ? { ...s, [k]: v } : s));
  const save = async () => {
    setBusy(true);
    try {
      const { demoMode: _d, ...body } = f;
      await put('/admin/settings', { ...body, serviceFeePercent: Number(f.serviceFeePercent) || 0, kitchenLateMinutes: Number(f.kitchenLateMinutes) || 20 });
      toast.success('Configurações salvas');
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-bold">Dados do estabelecimento</h2>
        <Field label="Nome" htmlFor="sn">
          <Input id="sn" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Frase de apresentação" htmlFor="st">
          <Input id="st" value={f.tagline} onChange={(e) => set('tagline', e.target.value)} />
        </Field>
        <Field label="Telefone" htmlFor="sp">
          <Input id="sp" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Endereço" htmlFor="sa">
          <Input id="sa" value={f.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Horário de funcionamento" htmlFor="sh">
          <Input id="sh" value={f.openingHours} onChange={(e) => set('openingHours', e.target.value)} />
        </Field>
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-bold">Operação</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Taxa de serviço (%)" htmlFor="sf" hint="Padrão para novas comandas">
            <Input id="sf" inputMode="decimal" value={String(f.serviceFeePercent)} onChange={(e) => set('serviceFeePercent', e.target.value.replace(',', '.') as unknown as number)} />
          </Field>
          <Field label="Pedido atrasado após (min)" htmlFor="sl">
            <Input id="sl" inputMode="numeric" value={String(f.kitchenLateMinutes)} onChange={(e) => set('kitchenLateMinutes', e.target.value.replace(/\D/g, '') as unknown as number)} />
          </Field>
        </div>
        <label className="flex items-start justify-between gap-4 rounded-2xl bg-creme p-4">
          <span>
            <span className="block font-bold">Cliente inicia o atendimento pelo cartão</span>
            <span className="text-sm text-marrom-600">
              Ligado: ao aproximar o celular de uma comanda livre, o cliente abre o atendimento sozinho. Desligado (mais seguro): um funcionário precisa abrir a comanda antes.
            </span>
          </span>
          <Toggle checked={f.allowSelfOpen} onChange={(v) => set('allowSelfOpen', v)} label="Auto-abertura pelo cartão" />
        </label>
        {f.demoMode && <Badge tone="corn">Este banco está marcado como DEMONSTRAÇÃO</Badge>}
        <Button size="lg" block loading={busy} onClick={save}>
          Salvar configurações
        </Button>
      </Card>
    </div>
  );
}

interface T {
  id: string;
  number: number;
  label: string | null;
  seats: number;
  active: boolean;
  state: string;
}

function TablesSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'tables'], queryFn: () => api<{ tables: T[] }>('/tables?all=1').then((r) => r.tables) });
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  return (
    <div>
      <Button onClick={() => setEditing('new')} className="mb-3">
        <Plus className="size-5" /> Nova mesa
      </Button>
      {!data ? (
        <Spinner />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {data.map((t) => (
            <li key={t.id} className={clsx('flex items-center gap-2 rounded-2xl bg-white p-3 shadow-card', !t.active && 'opacity-50')}>
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-bold">{padTable(t.number)}</p>
                <p className="truncate text-xs text-marrom-500">
                  {t.seats} lugares{t.label ? ` · ${t.label}` : ''}
                  {!t.active ? ' · inativa' : ''}
                </p>
              </div>
              <button onClick={() => setEditing(t)} aria-label={`Editar mesa ${t.number}`} className="rounded-lg p-2 text-verde-700 hover:bg-verde-50">
                <Pencil className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <TableEditor
          table={editing === 'new' ? null : editing}
          next={(data?.reduce((m, t) => Math.max(m, t.number), 0) ?? 0) + 1}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin', 'tables'] });
            qc.invalidateQueries({ queryKey: ['tables'] });
          }}
        />
      )}
    </div>
  );
}

function TableEditor({ table, next, onClose, onSaved }: { table: T | null; next: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [number, setNumber] = useState(String(table?.number ?? next));
  const [label, setLabel] = useState(table?.label ?? '');
  const [seats, setSeats] = useState(String(table?.seats ?? 4));
  const [active, setActive] = useState(table?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true);
    setErr('');
    const body = { number: Number(number), label: label.trim() || null, seats: Number(seats) || 4, active };
    try {
      if (table) await patch(`/tables/${table.id}`, body);
      else await post('/tables', body);
      toast.success('Mesa salva');
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={table ? `Mesa ${padTable(table.number)}` : 'Nova mesa'} footer={<Button block size="lg" loading={busy} onClick={save}>Salvar</Button>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Número" htmlFor="tn">
            <Input id="tn" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Lugares" htmlFor="ts">
            <Input id="ts" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>
        <Field label="Identificação (opcional)" htmlFor="tl" hint="Ex.: Varanda, Salão 2">
          <Input id="tl" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />
        </Field>
        {table && (
          <label className="flex items-center justify-between rounded-2xl bg-white p-4 text-sm font-semibold">
            Mesa ativa <Toggle checked={active} onChange={setActive} label="Ativa" />
          </label>
        )}
        {err && <p className="text-sm font-semibold text-rose-700">{err}</p>}
      </div>
    </Sheet>
  );
}

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Login',
  'auth.login_failed': 'Login recusado',
  'session.open': 'Comanda aberta',
  'session.close': 'Comanda fechada',
  'session.reopen': 'Comanda reaberta',
  'session.transfer': 'Transferência de mesa',
  'session.set_table': 'Mesa informada pelo cliente',
  'session.discount': 'Desconto',
  'session.service_fee': 'Taxa de serviço',
  'session.cancel_empty': 'Atendimento sem consumo encerrado',
  'order.cancel': 'Pedido cancelado',
  'payment.register': 'Pagamento',
  'payment.void': 'Estorno',
  'product.update': 'Produto alterado',
  'product.create': 'Produto criado',
  'product.availability': 'Disponibilidade',
  'card.block': 'Cartão bloqueado',
  'card.lost': 'Cartão perdido',
  'card.reactivate': 'Cartão reativado',
  'card.revoke': 'Link revogado',
  'card.reissue': 'Cartão reemitido',
  'user.create': 'Funcionário criado',
  'user.update': 'Funcionário alterado',
  'settings.update': 'Configurações',
};

function AuditLog() {
  const [entity, setEntity] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['audit', entity],
    queryFn: () =>
      api<{ logs: { id: string; action: string; entity: string; entityId: string | null; createdAt: string; ip: string | null; data: Record<string, unknown> | null; user: { name: string } | null }[] }>(
        `/admin/audit?take=150${entity ? `&entity=${entity}` : ''}`,
      ).then((r) => r.logs),
  });
  return (
    <div>
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
        {[
          ['', 'Tudo'],
          ['tab_session', 'Comandas'],
          ['order', 'Pedidos'],
          ['payment', 'Pagamentos'],
          ['nfc_card', 'Cartões'],
          ['product', 'Produtos'],
          ['user', 'Usuários'],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setEntity(v)} className={clsx('h-9 shrink-0 rounded-full px-3 text-sm font-bold', entity === v ? 'bg-verde-600 text-white' : 'border border-marrom-100 bg-white')}>
            {l}
          </button>
        ))}
      </div>
      {isLoading && <Spinner />}
      <ul className="divide-y divide-marrom-50 overflow-hidden rounded-2xl bg-white shadow-card">
        {data?.map((l) => (
          <li key={l.id} className="px-4 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-x-2">
              <strong>{ACTION_LABEL[l.action] ?? l.action}</strong>
              <span className="text-marrom-500">{l.user ? `por ${l.user.name}` : 'pelo cliente/sistema'}</span>
              <span className="ml-auto text-xs text-marrom-400">{dateTime(l.createdAt)}</span>
            </div>
            {l.data && Object.keys(l.data).length > 0 && (
              <p className="mt-0.5 break-all font-mono text-[11px] text-marrom-500">{JSON.stringify(l.data).slice(0, 220)}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
