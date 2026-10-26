import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, errorMessage, post } from '../lib/api';
import { padTable } from '../lib/format';
import { useAuth } from '../lib/auth';
import type { Session, TableSummary } from '../lib/types';
import { Button, Field, Input, Select, useToast } from './ui';

/**
 * Abre um atendimento numa comanda (ou localiza o já aberto) e segue para o pedido.
 * Se a comanda já estiver aberta, apenas navega até ela — nunca cria um controle paralelo.
 */
export function OpenTabForm({ tables, defaultTableId, defaultTabNumber, onDone }: { tables?: TableSummary[]; defaultTableId?: string; defaultTabNumber?: number; onDone?: () => void }) {
  const [tabNumber, setTabNumber] = useState(defaultTabNumber ? String(defaultTabNumber) : '');
  const [tableId, setTableId] = useState(defaultTableId ?? '');
  // Enquanto a mesa não for escolhida à mão, segue a regra "comanda N = mesa N"
  const [tableTouched, setTableTouched] = useState(!!defaultTableId);
  const onTabNumber = (v: string) => {
    setTabNumber(v);
    if (!tableTouched) setTableId(tables?.find((t) => t.number === Number(v))?.id ?? '');
  };
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(tabNumber);
    if (!Number.isInteger(n) || n <= 0) {
      setError('Informe o número da comanda');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await post<{ session: Session }>('/sessions', { tabNumber: n, tableId: tableId || null, customerName: name.trim() || null });
      toast.success(`Comanda ${String(n).padStart(3, '0')} aberta`);
      qc.invalidateQueries({ queryKey: ['tables'] });
      onDone?.();
      nav(can('WAITER') ? `/app/comandas/${r.session.id}/pedido` : `/app/comandas/${r.session.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SESSION_ALREADY_OPEN') {
        const found = await api<{ session: Session | null }>(`/sessions/lookup?tab=${n}`).catch(() => null);
        if (found?.session) {
          toast.info('Esta comanda já está aberta — abrindo o atendimento atual.');
          onDone?.();
          nav(`/app/comandas/${found.session.id}`);
          return;
        }
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Comanda nº" htmlFor="tabn">
          <Input id="tabn" inputMode="numeric" pattern="[0-9]*" value={tabNumber} onChange={(e) => onTabNumber(e.target.value.replace(/\D/g, ''))} placeholder="001" autoFocus />
        </Field>
        <Field label="Mesa" htmlFor="tbl">
          <Select
            id="tbl"
            value={tableId}
            onChange={(e) => {
              setTableId(e.target.value);
              setTableTouched(true);
            }}
          >
            <option value="">Balcão</option>
            {tables?.map((t) => (
              <option key={t.id} value={t.id}>
                Mesa {padTable(t.number)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Nome do cliente (opcional)" htmlFor="cname">
        <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" />
      </Field>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
      <Button type="submit" block size="lg" loading={busy}>
        Abrir comanda
      </Button>
    </form>
  );
}
