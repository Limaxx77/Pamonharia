import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import clsx from 'clsx';
import { Ban, Check, Copy, Download, ExternalLink, History, Nfc, Plus, RefreshCw, Search, ShieldOff, TriangleAlert, Undo2 } from 'lucide-react';
import { api, errorMessage, post } from '../../lib/api';
import { brl, CARD_STATUS, dateTime, padTab, padTable } from '../../lib/format';
import { EVT, useLiveQueries } from '../../lib/realtime';
import type { CardStatus } from '../../lib/types';
import { Badge, Button, ConfirmDialog, Field, Input, PageHeader, Segmented, Sheet, Spinner, useToast } from '../../components/ui';

interface CardInfo {
  id: string;
  token: string;
  status: CardStatus;
  label: string | null;
  statusReason: string | null;
  issuedAt: string;
  statusChangedAt: string | null;
  lastUsedAt: string | null;
  url: string;
}
interface TabRow {
  id: string;
  number: number;
  active: boolean;
  currentCard: CardInfo | null;
  cardsIssued: number;
  openSession: { id: string; openedAt: string; table: { number: number } | null } | null;
  sessionsCount: number;
}

type Filter = 'all' | 'ACTIVE' | 'issues' | 'open';

export default function Cards() {
  useLiveQueries([EVT.CARDS_UPDATED, EVT.SESSION_UPDATED], [['admin', 'cards']]);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'cards'], queryFn: () => api<{ tabs: TabRow[] }>('/cards').then((r) => r.tabs) });
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<TabRow | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useMemo(
    () =>
      (data ?? []).filter((t) => {
        if (q && !padTab(t.number).includes(q)) return false;
        if (filter === 'ACTIVE') return t.currentCard?.status === 'ACTIVE';
        if (filter === 'issues') return !t.currentCard || t.currentCard.status !== 'ACTIVE';
        if (filter === 'open') return !!t.openSession;
        return true;
      }),
    [data, filter, q],
  );
  const current = selected ? data?.find((t) => t.id === selected.id) ?? selected : null;

  return (
    <div>
      <PageHeader
        title="Cartões NFC"
        subtitle="Cada comanda tem um link secreto gravado no cartão. Bloqueie, reemita e acompanhe o uso."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-5" /> Cadastrar comandas
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[200px_1fr]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-marrom-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Nº comanda" className="pl-9" aria-label="Buscar comanda" />
        </label>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'ACTIVE', label: 'Ativos' },
            { value: 'open', label: 'Em uso' },
            { value: 'issues', label: 'Bloqueados/perdidos' },
          ]}
        />
      </div>
      {isLoading && <Spinner />}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {list.map((t) => {
          const st = t.currentCard ? CARD_STATUS[t.currentCard.status] : null;
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className={clsx(
                'flex flex-col items-start rounded-2xl border-2 bg-white p-3 text-left shadow-card transition-transform active:scale-[0.98]',
                t.currentCard?.status === 'ACTIVE' ? 'border-transparent' : 'border-rose-200',
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span className="font-display text-xl font-bold">{padTab(t.number)}</span>
                <Nfc className={clsx('size-4', t.openSession ? 'text-verde-600' : 'text-marrom-300')} />
              </span>
              {st ? <Badge tone={st.tone}>{st.label}</Badge> : <Badge tone="red">Sem cartão</Badge>}
              <span className="mt-1 text-xs text-marrom-500">{t.openSession ? `Em uso${t.openSession.table ? ` · mesa ${padTable(t.openSession.table.number)}` : ''}` : 'Livre'}</span>
            </button>
          );
        })}
      </div>
      {current && <CardSheet tab={current} onClose={() => setSelected(null)} />}
      <CreateSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CardSheet({ tab, onClose }: { tab: TabRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const card = tab.currentCard;
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<null | 'block' | 'lost' | 'reactivate' | 'revoke' | 'reissue'>(null);
  const [showHistory, setShowHistory] = useState(false);
  const history = useQuery({
    queryKey: ['card-history', tab.id],
    queryFn: () =>
      api<{
        cards: CardInfo[];
        sessions: { id: string; status: string; openedAt: string; closedAt: string | null; tableNumber: number | null; orders: number; consumedCents: number; paidCents: number }[];
        logs: { id: string; action: string; createdAt: string; user: { name: string } | null; data: { reason?: string } | null }[];
      }>(`/cards/tabs/${tab.id}/history`),
    enabled: showHistory,
  });

  useEffect(() => {
    if (!card) return setQr('');
    QRCode.toDataURL(card.url, { width: 480, margin: 2, color: { dark: '#2C4524', light: '#FFFFFF' }, errorCorrectionLevel: 'M' }).then(setQr);
  }, [card?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = card.url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const run = async (action: NonNullable<typeof confirm>, reason: string) => {
    try {
      if (action === 'reissue') await post(`/cards/tabs/${tab.id}/reissue`, { reason: reason || 'Reemissão' });
      else await post(`/cards/${card!.id}/${action}`, { reason: reason || null });
    } catch (e) {
      throw new Error(errorMessage(e));
    }
    toast.success(action === 'reissue' ? 'Novo link gerado. Grave-o no cartão.' : 'Cartão atualizado');
    qc.invalidateQueries({ queryKey: ['admin', 'cards'] });
    qc.invalidateQueries({ queryKey: ['card-history', tab.id] });
  };

  const labels = {
    block: { title: 'Bloquear cartão', msg: 'O link deixa de abrir a comanda e de aceitar pedidos até ser reativado.', btn: 'Bloquear', danger: true },
    lost: { title: 'Marcar como perdido', msg: 'O link deixa de funcionar. Se o cartão for encontrado, reative-o; senão, reemita.', btn: 'Marcar perdido', danger: true },
    reactivate: { title: 'Reativar cartão', msg: 'O link volta a funcionar normalmente.', btn: 'Reativar', danger: false },
    revoke: { title: 'Revogar link', msg: 'Revogação é definitiva: este link nunca mais funcionará. Use quando o link vazou.', btn: 'Revogar', danger: true },
    reissue: { title: 'Reemitir cartão', msg: 'Gera um NOVO link e revoga o anterior. Depois, grave o novo link no cartão (ou em um cartão novo).', btn: 'Gerar novo link', danger: false },
  };

  return (
    <Sheet open onClose={onClose} title={`Comanda ${padTab(tab.number)}`} wide>
      {card ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[220px_1fr]">
          <div className="flex flex-col items-center">
            {qr ? <img src={qr} alt={`QR Code da comanda ${padTab(tab.number)}`} className="w-full max-w-56 rounded-2xl border border-marrom-100 bg-white p-2" /> : <Spinner />}
            {qr && card.status === 'ACTIVE' && (
              <a href={qr} download={`comanda-${padTab(tab.number)}-qrcode.png`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-verde-700">
                <Download className="size-4" /> Baixar QR Code
              </a>
            )}
            <p className="mt-1 text-center text-xs text-marrom-500">QR Code alternativo para aparelhos sem NFC (imprima no verso do cartão).</p>
          </div>
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={CARD_STATUS[card.status].tone}>{CARD_STATUS[card.status].label}</Badge>
              {card.statusReason && <span className="text-sm text-marrom-500">Motivo: {card.statusReason}</span>}
            </div>
            <Field label="URL para gravar na tag NFC (registro URI)">
              <div className="flex gap-2">
                <code className="block min-w-0 flex-1 break-all rounded-xl bg-white px-3 py-2.5 text-xs text-marrom-800">{card.url}</code>
                <Button variant="secondary" onClick={copy} aria-label="Copiar URL">
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </Field>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-white p-3">
                <dt className="text-xs font-bold text-marrom-500">Emitido</dt>
                <dd>{dateTime(card.issuedAt)}</dd>
              </div>
              <div className="rounded-xl bg-white p-3">
                <dt className="text-xs font-bold text-marrom-500">Último acesso</dt>
                <dd>{card.lastUsedAt ? dateTime(card.lastUsedAt) : '—'}</dd>
              </div>
              <div className="rounded-xl bg-white p-3">
                <dt className="text-xs font-bold text-marrom-500">Cartões emitidos</dt>
                <dd>{tab.cardsIssued}</dd>
              </div>
              <div className="rounded-xl bg-white p-3">
                <dt className="text-xs font-bold text-marrom-500">Atendimentos</dt>
                <dd>{tab.sessionsCount}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              {card.status === 'ACTIVE' && (
                <a href={card.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-marrom-100 bg-white px-3 text-sm font-bold text-marrom-700">
                  <ExternalLink className="size-4" /> Testar link
                </a>
              )}
              {card.status === 'ACTIVE' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setConfirm('block')}>
                    <Ban className="size-4" /> Bloquear
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirm('lost')}>
                    <TriangleAlert className="size-4" /> Perdido
                  </Button>
                </>
              )}
              {(card.status === 'BLOCKED' || card.status === 'LOST') && (
                <Button size="sm" variant="secondary" onClick={() => setConfirm('reactivate')}>
                  <Undo2 className="size-4" /> Reativar
                </Button>
              )}
              {card.status !== 'REVOKED' && (
                <Button size="sm" variant="outline" className="text-rose-700" onClick={() => setConfirm('revoke')}>
                  <ShieldOff className="size-4" /> Revogar link
                </Button>
              )}
              <Button size="sm" onClick={() => setConfirm('reissue')}>
                <RefreshCw className="size-4" /> Reemitir
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-6 text-center">
          <p className="text-marrom-600">Esta comanda não possui cartão ativo.</p>
          <Button className="mt-3" onClick={() => setConfirm('reissue')}>
            <RefreshCw className="size-4" /> Emitir cartão
          </Button>
        </div>
      )}

      <div className="mt-6">
        <Button variant="ghost" size="sm" onClick={() => setShowHistory((s) => !s)}>
          <History className="size-4" /> {showHistory ? 'Ocultar histórico' : 'Ver histórico'}
        </Button>
        {showHistory && (history.isLoading ? <Spinner /> : history.data && (
          <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-extrabold text-marrom-600">Atendimentos</p>
              <ul className="divide-y divide-marrom-50 rounded-xl bg-white text-sm">
                {history.data.sessions.length === 0 && <li className="p-3 text-marrom-500">Nenhum atendimento.</li>}
                {history.data.sessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap gap-x-2 p-2.5">
                    <span className="font-semibold">{dateTime(s.openedAt)}</span>
                    <span className="text-marrom-500">{s.tableNumber ? `mesa ${padTable(s.tableNumber)}` : 'balcão'} · {s.orders} pedidos</span>
                    <span className="tabular ml-auto font-bold">{brl(s.consumedCents)}</span>
                    <Badge tone={s.status === 'OPEN' ? 'green' : 'gray'}>{s.status === 'OPEN' ? 'aberto' : s.status === 'CLOSED' ? 'fechado' : 'cancelado'}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-sm font-extrabold text-marrom-600">Cartões e auditoria</p>
              <ul className="divide-y divide-marrom-50 rounded-xl bg-white text-sm">
                {history.data.cards.map((c) => (
                  <li key={c.id} className="flex flex-wrap gap-x-2 p-2.5">
                    <span>Cartão …{c.token.slice(-6)}</span>
                    <Badge tone={CARD_STATUS[c.status].tone}>{CARD_STATUS[c.status].label}</Badge>
                    <span className="ml-auto text-xs text-marrom-500">{dateTime(c.issuedAt)}</span>
                  </li>
                ))}
                {history.data.logs.slice(0, 15).map((l) => (
                  <li key={l.id} className="p-2.5 text-xs text-marrom-600">
                    {dateTime(l.createdAt)} · <strong>{l.action}</strong> {l.user ? `por ${l.user.name}` : ''} {l.data?.reason ? `— ${l.data.reason}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {confirm && (
        <ConfirmDialog
          open
          title={labels[confirm].title}
          message={labels[confirm].msg}
          danger={labels[confirm].danger}
          confirmLabel={labels[confirm].btn}
          reason={confirm === 'reactivate' ? undefined : { label: 'Motivo (opcional)' }}
          onClose={() => setConfirm(null)}
          onConfirm={(r) => run(confirm, r)}
        />
      )}
    </Sheet>
  );
}

function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    const a = Number(from);
    const b = to ? Number(to) : undefined;
    if (!a) return setErr('Informe o número inicial');
    setBusy(true);
    try {
      const r = await post<{ created: number[]; skipped: number[] }>('/cards', { from: a, to: b });
      toast.success(`${r.created.length} comanda(s) criada(s)${r.skipped.length ? ` · ${r.skipped.length} já existiam` : ''}`);
      qc.invalidateQueries({ queryKey: ['admin', 'cards'] });
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Cadastrar comandas" footer={<Button block size="lg" loading={busy} onClick={submit}>Cadastrar e gerar links</Button>}>
      <p className="mb-3 text-sm text-marrom-600">Informe um número ou um intervalo (ex.: 31 a 50). Cada comanda recebe um link seguro e aleatório para gravar no cartão NFC.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="De" htmlFor="cf">
          <Input id="cf" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Até (opcional)" htmlFor="ct">
          <Input id="ct" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} />
        </Field>
      </div>
      {err && <p className="mt-3 text-sm font-semibold text-rose-700">{err}</p>}
    </Sheet>
  );
}
