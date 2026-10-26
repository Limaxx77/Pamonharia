import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { errorMessage, post } from '../lib/api';
import { padTab, padTable, TABLE_STATE } from '../lib/format';
import { useTables } from '../lib/queries';
import type { Session } from '../lib/types';
import { Button, Sheet, useToast } from './ui';

/** Transfere a comanda para outra mesa (ou balcão), mantendo todo o histórico. */
export function TransferSheet({ session, open, onClose }: { session: Session; open: boolean; onClose: () => void }) {
  const { data: tables } = useTables();
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const submit = async () => {
    if (target === undefined) return;
    setBusy(true);
    try {
      await post(`/sessions/${session.id}/transfer`, { tableId: target });
      const dest = target ? `mesa ${padTable(tables!.find((t) => t.id === target)!.number)}` : 'o balcão';
      toast.success(`Comanda ${padTab(session.tab.number)} transferida para ${dest}`);
      qc.invalidateQueries();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Transferir comanda ${padTab(session.tab.number)}`}
      footer={
        <Button block size="lg" disabled={target === undefined} loading={busy} onClick={submit}>
          Confirmar transferência
        </Button>
      }
    >
      <p className="mb-3 text-sm text-marrom-600">Pedidos, valores e histórico acompanham a comanda. A operação fica registrada na auditoria.</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        <button
          onClick={() => setTarget(null)}
          className={clsx('col-span-2 h-14 rounded-xl border-2 text-sm font-bold', target === null ? 'border-verde-600 bg-verde-50 text-verde-800' : 'border-marrom-100 bg-white')}
        >
          Balcão
        </button>
        {tables?.map((t) => {
          const current = t.id === session.table?.id;
          return (
            <button
              key={t.id}
              disabled={current}
              onClick={() => setTarget(t.id)}
              className={clsx(
                'relative h-14 rounded-xl border-2 font-display text-lg font-bold disabled:opacity-40',
                target === t.id ? 'border-verde-600 bg-verde-50 text-verde-800' : 'border-marrom-100 bg-white',
              )}
              aria-label={`Mesa ${t.number}${current ? ' (atual)' : ''}`}
            >
              {padTable(t.number)}
              <span className={clsx('absolute right-1.5 top-1.5 size-2 rounded-full', TABLE_STATE[t.state].dot)} />
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
