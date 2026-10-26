import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FlaskConical } from 'lucide-react';
import { api } from '../../lib/api';
import { brl, dateTime, isoDay, padTab, padTable, PAYMENT_METHOD } from '../../lib/format';
import { shortDay, useSummary } from '../../lib/reports';
import { BarList, ChartCard, ColumnChart } from '../../components/charts';
import { Button, Card, ErrorBox, Field, Input, PageHeader, Segmented, Spinner, StatTile } from '../../components/ui';

type Preset = 'today' | '7' | '30' | 'month' | 'custom';

function range(p: Preset, custom: { from: string; to: string }) {
  const today = isoDay();
  if (p === 'today') return { from: today, to: today };
  if (p === '7') return { from: isoDay(new Date(Date.now() - 6 * 86400000)), to: today };
  if (p === '30') return { from: isoDay(new Date(Date.now() - 29 * 86400000)), to: today };
  if (p === 'month') return { from: today.slice(0, 8) + '01', to: today };
  return custom;
}

interface ClosedRow {
  id: string;
  tabNumber: number;
  tableNumber: number | null;
  openedAt: string;
  closedAt: string;
  discountCents: number;
  paidCents: number;
  methods: string[];
  closedBy: string | null;
}

export default function Reports() {
  const [preset, setPreset] = useState<Preset>('30');
  const [custom, setCustom] = useState({ from: isoDay(new Date(Date.now() - 6 * 86400000)), to: isoDay() });
  const { from, to } = range(preset, custom);
  const { data: s, isLoading, error, refetch, isFetching } = useSummary(from, to);
  const closed = useQuery({
    queryKey: ['closed', from, to],
    queryFn: () => api<{ sessions: ClosedRow[] }>(`/admin/reports/sessions?from=${from}&to=${to}`).then((r) => r.sessions),
  });

  const exportCsv = () => {
    if (!closed.data) return;
    const head = ['comanda', 'mesa', 'abertura', 'fechamento', 'desconto', 'pago', 'formas', 'fechado_por'];
    const rows = closed.data.map((r) => [
      padTab(r.tabNumber),
      r.tableNumber ?? 'balcão',
      new Date(r.openedAt).toLocaleString('pt-BR'),
      new Date(r.closedAt).toLocaleString('pt-BR'),
      (r.discountCents / 100).toFixed(2).replace('.', ','),
      (r.paidCents / 100).toFixed(2).replace('.', ','),
      r.methods.map((m) => PAYMENT_METHOD[m as keyof typeof PAYMENT_METHOD]).join(' + '),
      r.closedBy ?? '',
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `comandas_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Relatórios financeiros"
        subtitle={`Período: ${shortDay(from)} a ${shortDay(to)}${isFetching ? ' · atualizando…' : ''}`}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!closed.data?.length}>
            <Download className="size-4" /> Exportar CSV
          </Button>
        }
      />
      <div className="space-y-3">
        <Segmented
          value={preset}
          onChange={setPreset}
          options={[
            { value: 'today', label: 'Hoje' },
            { value: '7', label: '7 dias' },
            { value: '30', label: '30 dias' },
            { value: 'month', label: 'Este mês' },
            { value: 'custom', label: 'Período' },
          ]}
        />
        {preset === 'custom' && (
          <div className="grid max-w-md grid-cols-2 gap-3">
            <Field label="De" htmlFor="from">
              <Input id="from" type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </Field>
            <Field label="Até" htmlFor="to">
              <Input id="to" type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </Field>
          </div>
        )}
      </div>

      {s?.demoMode && (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-milho-100 px-4 py-3 text-sm font-semibold text-marrom-800">
          <FlaskConical className="size-4 shrink-0" /> Banco de demonstração: valores fictícios, que não representam vendas reais.
        </p>
      )}
      {isLoading && <Spinner />}
      {error && <ErrorBox onRetry={() => refetch()}>Não foi possível carregar o relatório.</ErrorBox>}

      {s && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Faturamento" value={brl(s.revenueCents)} hint={`${s.paymentsCount} pagamentos`} />
            <StatTile label="Pedidos" value={s.ordersCount} hint={`${s.cancelledOrders} cancelados`} tone="brown" />
            <StatTile label="Comandas fechadas" value={s.closedSessions} tone="corn" />
            <StatTile label="Ticket médio" value={brl(s.avgTicketCents)} tone="blue" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Faturamento por dia">
              <ColumnChart data={s.daily} x="day" y="revenueCents" money xFormat={shortDay} />
            </ChartCard>
            <ChartCard title="Pedidos por horário" subtitle="Movimento ao longo do dia">
              <ColumnChart data={s.hourly.map((h) => ({ ...h, label: `${h.hour}h` }))} x="label" y="orders" unit="pedidos" />
            </ChartCard>
            <ChartCard title="Produtos mais vendidos">
              <BarList rows={s.topProducts.map((p) => ({ label: p.name, value: p.quantity, hint: `un. · ${brl(p.totalCents)}` }))} />
            </ChartCard>
            <div className="space-y-4">
              <ChartCard title="Vendas por categoria">
                <BarList money rows={s.byCategory.map((c) => ({ label: c.name, value: c.totalCents }))} />
              </ChartCard>
              <ChartCard title="Formas de pagamento">
                <BarList money rows={s.byPaymentMethod.map((p) => ({ label: `${PAYMENT_METHOD[p.method]} (${p.count})`, value: p.totalCents }))} />
              </ChartCard>
              <ChartCard title="Origem dos pedidos">
                <BarList rows={[{ label: 'Cartão NFC (cliente)', value: s.ordersBySource.NFC }, { label: 'Garçom', value: s.ordersBySource.WAITER }]} />
              </ChartCard>
            </div>
          </div>
        </>
      )}

      <Card className="mt-4 overflow-hidden">
        <h3 className="px-4 pt-4 font-sans text-base font-extrabold">Comandas fechadas no período</h3>
        {closed.isLoading ? (
          <Spinner />
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-marrom-50 text-left text-xs uppercase tracking-wide text-marrom-500">
                <tr>
                  <th className="px-4 py-2">Comanda</th>
                  <th className="px-4 py-2">Mesa</th>
                  <th className="px-4 py-2">Fechamento</th>
                  <th className="px-4 py-2">Formas</th>
                  <th className="px-4 py-2 text-right">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-marrom-50">
                {closed.data?.slice(0, 100).map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-bold">{padTab(r.tabNumber)}</td>
                    <td className="px-4 py-2">{r.tableNumber ? padTable(r.tableNumber) : 'Balcão'}</td>
                    <td className="px-4 py-2 text-marrom-600">{dateTime(r.closedAt)}</td>
                    <td className="px-4 py-2">{r.methods.map((m) => PAYMENT_METHOD[m as keyof typeof PAYMENT_METHOD]).join(' + ')}</td>
                    <td className="tabular px-4 py-2 text-right font-bold">{brl(r.paidCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {closed.data && closed.data.length > 100 && <p className="px-4 py-2 text-xs text-marrom-500">Mostrando 100 de {closed.data.length}. Exporte o CSV para ver todas.</p>}
            {closed.data?.length === 0 && <p className="px-4 py-6 text-center text-marrom-500">Nenhuma comanda fechada no período.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
