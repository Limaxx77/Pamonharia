import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, Banknote, CheckCircle2, CreditCard, Divide, Info, ListChecks, Percent, QrCode, RotateCcw, Tag, Undo2, Wallet } from 'lucide-react';
import { errorMessage, newKey, post } from '../../lib/api';
import { brl, centsToInput, dateTime, padTab, padTable, parseMoney, PAYMENT_METHOD } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { useSession } from '../../lib/queries';
import type { PaymentMethod, Session } from '../../lib/types';
import { TotalsBox } from '../../components/orders';
import { Badge, Button, Card, ConfirmDialog, ErrorBox, Field, Input, Segmented, Sheet, Spinner, Stepper, Textarea, useToast } from '../../components/ui';

const METHODS: { value: PaymentMethod; label: string; icon: typeof QrCode }[] = [
  { value: 'PIX', label: 'PIX', icon: QrCode },
  { value: 'CASH', label: 'Dinheiro', icon: Banknote },
  { value: 'DEBIT', label: 'Débito', icon: CreditCard },
  { value: 'CREDIT', label: 'Crédito', icon: Wallet },
];

type Mode = 'total' | 'equal' | 'items';

export default function Checkout() {
  const { id = '' } = useParams();
  const { data: s, isLoading, error, refetch } = useSession(id);
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reopen, setReopen] = useState(false);
  const [discount, setDiscount] = useState(false);

  if (isLoading) return <Spinner />;
  if (error || !s) return <ErrorBox onRetry={() => refetch()}>Comanda não encontrada.</ErrorBox>;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['session', id] });
    qc.invalidateQueries({ queryKey: ['sessions'] });
    qc.invalidateQueries({ queryKey: ['tables'] });
  };
  const open = s.status === 'OPEN';

  const toggleFee = async () => {
    try {
      await post(`/sessions/${id}/service-fee`, { percent: s.serviceFeePercent > 0 ? 0 : 10 });
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/app/caixa" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-verde-700">
        <ArrowLeft className="size-4" /> Caixa
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-3xl font-bold">Comanda {padTab(s.tab.number)}</h1>
        <span className="font-semibold text-marrom-600">{s.table ? `Mesa ${padTable(s.table.number)}` : 'Balcão'}</span>
        {s.customerName && <Badge tone="brown">{s.customerName}</Badge>}
        {open ? <Badge tone="green">Aberta</Badge> : <Badge tone="gray">{s.status === 'CLOSED' ? 'Fechada' : 'Cancelada'}</Badge>}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <ItemsTable session={s} />
          {s.payments.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-2 font-sans text-sm font-extrabold uppercase tracking-wide text-marrom-500">Pagamentos registrados</h2>
              <ul className="divide-y divide-marrom-100 text-sm">
                {s.payments.map((p) => (
                  <li key={p.id} className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 py-2', p.status === 'VOIDED' && 'opacity-60')}>
                    <span className="font-bold">{PAYMENT_METHOD[p.method]}</span>
                    {p.payerName && <span className="text-marrom-500">{p.payerName}</span>}
                    <span className="text-xs text-marrom-400">
                      {dateTime(p.createdAt)} · {p.createdBy?.name}
                    </span>
                    {p.changeCents ? <span className="text-xs text-marrom-500">troco {brl(p.changeCents)}</span> : null}
                    <span className={clsx('tabular ml-auto font-extrabold', p.status === 'VOIDED' && 'line-through')}>{brl(p.amountCents)}</span>
                    {p.status === 'VOIDED' && <Badge tone="red">Estornado: {p.voidReason}</Badge>}
                    {p.status !== 'VOIDED' && open && can() && (
                      <button onClick={() => setVoiding(p.id)} className="flex items-center gap-1 text-xs font-bold text-rose-700 hover:underline">
                        <Undo2 className="size-3.5" /> Estornar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <TotalsBox totals={s.totals} serviceFeePercent={s.serviceFeePercent} />
          {s.discountReason && s.totals.discountCents > 0 && <p className="-mt-2 px-1 text-xs text-marrom-500">Desconto: {s.discountReason}</p>}
          {open ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={toggleFee}>
                  <Percent className="size-4" /> {s.serviceFeePercent > 0 ? 'Retirar taxa' : 'Incluir taxa 10%'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDiscount(true)}>
                  <Tag className="size-4" /> Desconto
                </Button>
              </div>
              <PaymentPanel session={s} onDone={refresh} />
            </>
          ) : (
            <Card className="p-5 text-center">
              <CheckCircle2 className="mx-auto size-12 text-verde-600" />
              <p className="mt-2 font-display text-xl font-bold">{s.status === 'CLOSED' ? 'Comanda fechada' : 'Atendimento cancelado'}</p>
              {s.closedAt && <p className="text-sm text-marrom-500">{dateTime(s.closedAt)}{s.closedBy ? ` · ${s.closedBy.name}` : ''}</p>}
              <p className="mt-2 text-sm text-marrom-600">Novos pedidos neste atendimento estão bloqueados. O cartão pode ser usado em um novo atendimento.</p>
              {can() && s.status === 'CLOSED' && (
                <Button variant="outline" className="mt-4" onClick={() => setReopen(true)}>
                  <RotateCcw className="size-4" /> Reabrir (administrador)
                </Button>
              )}
            </Card>
          )}
          <p className="flex items-start gap-1.5 px-1 text-xs text-marrom-500">
            <Info className="mt-0.5 size-3.5 shrink-0" /> O registro aqui é operacional. Confirme a transação na maquininha ou no aplicativo do banco antes de registrar.
          </p>
        </aside>
      </div>

      <DiscountSheet session={s} open={discount} onClose={() => setDiscount(false)} onDone={refresh} />
      <ConfirmDialog
        open={!!voiding}
        title="Estornar pagamento"
        message="O registro continua no histórico, marcado como estornado, e o saldo volta a ficar pendente."
        danger
        confirmLabel="Estornar"
        reason={{ label: 'Motivo do estorno', required: true }}
        onClose={() => setVoiding(null)}
        onConfirm={async (reason) => {
          try {
            await post(`/payments/${voiding}/void`, { reason });
          } catch (e) {
            throw new Error(errorMessage(e));
          }
          toast.success('Pagamento estornado');
          refresh();
        }}
      />
      <ConfirmDialog
        open={reopen}
        title="Reabrir comanda"
        message="A reabertura fica registrada na auditoria com o seu usuário. Só é possível se o cartão não estiver em outro atendimento."
        confirmLabel="Reabrir"
        reason={{ label: 'Motivo da reabertura', required: true }}
        onClose={() => setReopen(false)}
        onConfirm={async (reason) => {
          try {
            await post(`/sessions/${id}/reopen`, { reason });
          } catch (e) {
            throw new Error(errorMessage(e));
          }
          toast.success('Comanda reaberta');
          refresh();
        }}
      />
    </div>
  );
}

function ItemsTable({ session: s }: { session: Session }) {
  const items = s.orders.filter((o) => o.status !== 'CANCELLED').flatMap((o) => o.items.map((i) => ({ ...i, order: o.number })));
  const cancelled = s.orders.filter((o) => o.status === 'CANCELLED');
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="font-sans text-sm font-extrabold uppercase tracking-wide text-marrom-500">Itens consumidos</h2>
        <span className="text-xs text-marrom-400">{s.orders.length} pedidos</span>
      </div>
      {/* Lista adaptada ao celular (sem tabela larga) */}
      <ul className="divide-y divide-marrom-50 text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex gap-3 px-4 py-2.5">
            <span className="tabular w-8 shrink-0 font-extrabold text-verde-700">{i.quantity}×</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{i.productName}</p>
              <p className="text-xs text-marrom-500">
                Pedido #{i.order} · {brl(i.unitPriceCents)} un.
                {i.addons.length > 0 && ` · + ${i.addons.map((a) => a.name).join(', ')}`}
              </p>
              {!!i.paidQuantity && <Badge tone="green" className="mt-1">{i.paidQuantity} pago(s) por item</Badge>}
            </div>
            <span className="tabular shrink-0 font-bold">{brl(i.totalCents)}</span>
          </li>
        ))}
      </ul>
      {cancelled.length > 0 && (
        <p className="border-t border-marrom-100 px-4 py-2 text-xs text-marrom-500">
          {cancelled.length} pedido(s) cancelado(s) não cobrados: {cancelled.map((o) => `#${o.number} (${o.cancelReason})`).join(', ')}
        </p>
      )}
    </Card>
  );
}

function PaymentPanel({ session: s, onDone }: { session: Session; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('total');
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [amount, setAmount] = useState('');
  const [received, setReceived] = useState('');
  const [payer, setPayer] = useState('');
  const [parts, setParts] = useState(2);
  const [itemsSel, setItemsSel] = useState<Record<string, number>>({});
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const remaining = s.totals.remainingCents;

  const items = useMemo(() => s.orders.filter((o) => o.status !== 'CANCELLED').flatMap((o) => o.items), [s.orders]);
  const feeFactor = 1 + s.serviceFeePercent / 100;
  const itemsAmount = useMemo(() => {
    const sub = items.reduce((acc, i) => acc + (itemsSel[i.id] ?? 0) * i.unitPriceCents, 0);
    return Math.min(remaining, Math.round(sub * feeFactor));
  }, [items, itemsSel, feeFactor, remaining]);

  // Valor sugerido conforme o modo de divisão
  useEffect(() => {
    if (mode === 'total') setAmount(centsToInput(remaining));
    if (mode === 'equal') setAmount(centsToInput(Math.min(remaining, Math.ceil(s.totals.totalCents / parts))));
    if (mode === 'items') setAmount(centsToInput(itemsAmount));
  }, [mode, parts, remaining, itemsAmount, s.totals.totalCents]);

  // Qualquer alteração no formulário gera um novo registro (nova chave de idempotência)
  useEffect(() => setKey(newKey()), [method, amount, received, payer, mode]);

  const amountCents = parseMoney(amount) ?? 0;
  const receivedCents = method === 'CASH' ? parseMoney(received) : null;
  const change = receivedCents != null ? receivedCents - amountCents : null;

  const submit = async () => {
    setErr('');
    if (amountCents <= 0) return setErr('Informe o valor');
    if (amountCents > remaining) return setErr(`Valor maior que o saldo (${brl(remaining)})`);
    if (method === 'CASH' && receivedCents != null && receivedCents < amountCents) return setErr('Valor recebido menor que o valor a pagar');
    setBusy(true);
    try {
      const r = await post<{ closed: boolean }>(`/sessions/${s.id}/payments`, {
        method,
        amountCents,
        receivedCents: method === 'CASH' && receivedCents ? receivedCents : null,
        payerName: payer.trim() || null,
        items:
          mode === 'items'
            ? Object.entries(itemsSel)
                .filter(([, q]) => q > 0)
                .map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
            : undefined,
        idempotencyKey: key,
      });
      toast.success(r.closed ? 'Pagamento registrado. Comanda fechada!' : `Pagamento de ${brl(amountCents)} registrado`);
      setReceived('');
      setPayer('');
      setItemsSel({});
      setKey(newKey()); // próximo pagamento (mesmo que de igual valor) é um novo registro
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (remaining === 0) {
    return (
      <Card className="p-4 text-center text-sm text-marrom-600">
        {s.totals.itemsCount === 0 ? 'Sem consumo para cobrar.' : 'Saldo quitado.'}
        <CloseEmpty session={s} onDone={onDone} />
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <h2 className="font-display text-xl font-bold">Registrar pagamento</h2>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'total', label: 'Total' },
          { value: 'equal', label: (<><Divide className="size-4" /> Dividir</>) },
          { value: 'items', label: (<><ListChecks className="size-4" /> Por itens</>) },
        ]}
      />
      {mode === 'equal' && (
        <div className="flex items-center justify-between rounded-xl bg-marrom-50 px-3 py-2">
          <span className="text-sm font-semibold">Dividir saldo em</span>
          <Stepper value={parts} onChange={setParts} min={2} max={20} size="sm" />
        </div>
      )}
      {mode === 'items' && (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-marrom-50 p-2">
          {items.map((i) => {
            const free = i.quantity - (i.paidQuantity ?? 0);
            if (free <= 0) return null;
            return (
              <div key={i.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{i.productName}</span>
                <span className="tabular text-xs text-marrom-500">{brl(i.unitPriceCents)}</span>
                <Stepper size="sm" value={itemsSel[i.id] ?? 0} max={free} onChange={(v) => setItemsSel((m) => ({ ...m, [i.id]: v }))} />
              </div>
            );
          })}
          <p className="px-1 pt-1 text-xs text-marrom-500">Inclui a taxa de serviço proporcional ({s.serviceFeePercent}%).</p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Forma de pagamento">
        {METHODS.map((m) => (
          <button
            key={m.value}
            role="radio"
            aria-checked={method === m.value}
            onClick={() => setMethod(m.value)}
            className={clsx(
              'flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 text-xs font-bold',
              method === m.value ? 'border-verde-600 bg-verde-50 text-verde-800' : 'border-marrom-100 bg-white text-marrom-600',
            )}
          >
            <m.icon className="size-5" /> {m.label}
          </button>
        ))}
      </div>

      <Field label="Valor deste pagamento" htmlFor="amt" hint={`Saldo pendente: ${brl(remaining)}`}>
        <Input id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ''))} className="tabular text-lg font-bold" />
      </Field>
      {method === 'CASH' && (
        <Field label="Valor recebido (para troco)" htmlFor="rcv">
          <Input id="rcv" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="Opcional" className="tabular" />
          {change != null && change >= 0 && <p className="mt-1 text-sm font-bold text-verde-700">Troco: {brl(change)}</p>}
        </Field>
      )}
      <Field label="Pagante (opcional)" htmlFor="payer">
        <Input id="payer" value={payer} onChange={(e) => setPayer(e.target.value)} maxLength={80} placeholder="Ex.: Cliente A" />
      </Field>
      {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p>}
      <Button block size="lg" loading={busy} onClick={submit} disabled={amountCents <= 0}>
        Registrar {brl(amountCents)}
      </Button>
    </Card>
  );
}

function CloseEmpty({ session: s, onDone }: { session: Session; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (s.status !== 'OPEN') return null;
  return (
    <Button
      className="mt-3"
      block
      variant={s.totals.itemsCount === 0 ? 'outline' : 'primary'}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await post(`/sessions/${s.id}/close`);
          toast.success(s.totals.itemsCount === 0 ? 'Atendimento cancelado (sem consumo)' : 'Comanda fechada');
          onDone();
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {s.totals.itemsCount === 0 ? 'Encerrar atendimento sem consumo' : 'Fechar comanda'}
    </Button>
  );
}

function DiscountSheet({ session: s, open, onClose, onDone }: { session: Session; open: boolean; onClose: () => void; onDone: () => void }) {
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toast = useToast();
  useEffect(() => {
    if (open) {
      setValue(s.discountCents ? centsToInput(s.discountCents) : '');
      setReason(s.discountReason ?? '');
      setErr('');
    }
  }, [open, s.discountCents, s.discountReason]);
  const submit = async () => {
    const cents = parseMoney(value || '0');
    if (cents == null) return setErr('Valor inválido');
    if (reason.trim().length < 3) return setErr('Informe o motivo do desconto');
    setBusy(true);
    try {
      await post(`/sessions/${s.id}/discount`, { discountCents: cents, reason: reason.trim() });
      toast.success(cents ? `Desconto de ${brl(cents)} aplicado` : 'Desconto removido');
      onDone();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Desconto autorizado" footer={<Button block size="lg" loading={busy} onClick={submit}>Aplicar desconto</Button>}>
      <div className="space-y-3">
        <Field label="Valor do desconto (R$)" htmlFor="disc" hint="Use 0 para remover. O desconto fica registrado na auditoria.">
          <Input id="disc" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="0,00" />
        </Field>
        <Field label="Motivo" htmlFor="dreason">
          <Textarea id="dreason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ex.: cortesia da casa, item com problema" />
        </Field>
        {err && <p className="text-sm font-semibold text-rose-700">{err}</p>}
      </div>
    </Sheet>
  );
}
