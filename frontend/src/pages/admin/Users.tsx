import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Pencil, Plus } from 'lucide-react';
import { api, errorMessage, patch, post } from '../../lib/api';
import { ROLE } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import type { Role, User } from '../../lib/types';
import { Badge, Button, Field, Input, PageHeader, Select, Sheet, Spinner, Toggle, useToast } from '../../components/ui';

const ROLE_HELP: Record<Role, string> = {
  ADMIN: 'Acesso completo',
  WAITER: 'Mesas, comandas e pedidos',
  KITCHEN: 'Pedidos e preparação',
  CASHIER: 'Pagamentos e fechamento',
};

export default function Users() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<{ users: User[] }>('/users').then((r) => r.users) });
  const [editing, setEditing] = useState<User | 'new' | null>(null);

  return (
    <div>
      <PageHeader
        title="Funcionários"
        subtitle="Perfis: administrador, garçom, cozinha e caixa"
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-5" /> Novo funcionário
          </Button>
        }
      />
      {isLoading && <Spinner />}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((u) => (
          <li key={u.id} className={clsx('flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card', !u.active && 'opacity-60')}>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-verde-100 font-display text-lg font-bold text-verde-800">{u.name[0]}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold">
                {u.name} {u.id === me?.id && <span className="text-xs font-semibold text-marrom-400">(você)</span>}
              </p>
              <p className="truncate text-xs text-marrom-500">{u.email}</p>
              <div className="mt-1 flex gap-1">
                <Badge tone={u.role === 'ADMIN' ? 'corn' : 'green'}>{ROLE[u.role]}</Badge>
                {!u.active && <Badge tone="red">Inativo</Badge>}
              </div>
            </div>
            <button onClick={() => setEditing(u)} aria-label={`Editar ${u.name}`} className="rounded-lg p-2 text-verde-700 hover:bg-verde-50">
              <Pencil className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {editing && <UserEditor user={editing === 'new' ? null : editing} self={editing !== 'new' && editing.id === me?.id} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['admin', 'users'] })} />}
    </div>
  );
}

function UserEditor({ user, self, onClose, onSaved }: { user: User | null; self: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'WAITER');
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    if (!user && password.length < 8) return setErr('A senha deve ter pelo menos 8 caracteres');
    if (user && password && password.length < 8) return setErr('A nova senha deve ter pelo menos 8 caracteres');
    setBusy(true);
    try {
      if (user) await patch(`/users/${user.id}`, { name, email, role, active, ...(password ? { password } : {}) });
      else await post('/users', { name, email, role, password });
      toast.success('Funcionário salvo');
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={user ? 'Editar funcionário' : 'Novo funcionário'} footer={<Button block size="lg" loading={busy} onClick={save}>Salvar</Button>}>
      <div className="space-y-4">
        <Field label="Nome" htmlFor="un">
          <Input id="un" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="E-mail (login)" htmlFor="ue">
          <Input id="ue" type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Perfil" htmlFor="ur" hint={ROLE_HELP[role]}>
          <Select id="ur" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={self}>
            {(Object.keys(ROLE) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={user ? 'Nova senha (opcional)' : 'Senha'} htmlFor="up" hint="Mínimo 8 caracteres. Trocar a senha encerra as sessões abertas do funcionário.">
          <Input id="up" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        {user && !self && (
          <label className="flex items-center justify-between rounded-2xl bg-white p-4 text-sm font-semibold">
            Acesso ativo <Toggle checked={active} onChange={setActive} label="Ativo" />
          </label>
        )}
        {err && <p className="text-sm font-semibold text-rose-700">{err}</p>}
      </div>
    </Sheet>
  );
}
