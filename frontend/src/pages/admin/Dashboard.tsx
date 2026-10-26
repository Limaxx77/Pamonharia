import { Link } from 'react-router-dom';
import { Ban, CalendarDays, ClipboardList, DollarSign, LayoutGrid, Receipt, ReceiptText, TrendingUp } from 'lucide-react';
import { brl, isoDay, padTable, PAYMENT_METHOD, TABLE_STATE } from '../../lib/format';
import { shortDay, useSummary } from '../../lib/reports';
import { useTables } from '../../lib/queries';
import { BarList, ChartCard, ColumnChart } from '../../components/charts';
import { Badge, ErrorBox, PageHeader, Spinner, StatTile } from '../../components/ui';

export default function Dashboard() {
  const today = isoDay();
  const from30 = isoDay(new Date(Date.now() - 29 * 86400000));
  const day = useSummary(today, today);
  const month = useSummary(from30, today);
  const { data: tables } = useTables();

  if (day.isLoading || month.isLoading) return <Spinner />;
  if (day.error || !day.data || !month.data) return <ErrorBox onRetry={() => day.refetch()}>Não foi possível carregar os indicadores.</ErrorBox>;
  const d = day.data;
  const m = month.data;

  return (
    <div>
      <PageHeader
        title="Painel"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            Hoje, {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            {d.demoMode && <Badge tone="corn">Dados fictícios de demonstração</Badge>}
          </span>
        }
        actions={
          <Link to="/app/relatorios" className="inline-flex h-11 items-center gap-2 rounded-xl border border-marrom-100 bg-white px-4 font-bold text-marrom-700 hover:bg-marrom-50">
            <CalendarDays className="size-4" /> Relatórios
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Faturamento hoje" value={brl(d.todayRevenueCents)} icon={<DollarSign className="size-4" />} hint={`${d.paymentsCount} pagamentos`} />
        <StatTile label="Faturamento do mês" value={brl(d.monthRevenueCents)} icon={<TrendingUp className="size-4" />} tone="corn" hint="desde o dia 1º" />
        <StatTile label="Pedidos hoje" value={d.ordersCount} icon={<ClipboardList className="size-4" />} tone="brown" hint={`${d.ordersBySource.NFC} NFC · ${d.ordersBySource.WAITER} garçom`} />
        <StatTile label="Ticket médio (30 dias)" value={brl(m.avgTicketCents)} icon={<Receipt className="size-4" />} tone="blue" hint={`${m.closedSessions} comandas fechadas`} />
        <StatTile label="Comandas abertas" value={d.openSessions} icon={<ReceiptText className="size-4" />} />
        <StatTile label="Comandas fechadas hoje" value={d.closedSessions} icon={<ReceiptText className="size-4" />} tone="brown" />
        <StatTile label="Mesas ocupadas" value={`${d.occupiedTables}/${d.totalTables}`} icon={<LayoutGrid className="size-4" />} tone="corn" />
        <StatTile label="Cancelamentos hoje" value={d.cancelledOrders} icon={<Ban className="size-4" />} tone="blue" hint="pedidos cancelados" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Faturamento por dia" subtitle="Últimos 30 dias · pagamentos registrados">
            <ColumnChart data={m.daily} x="day" y="revenueCents" money xFormat={shortDay} />
          </ChartCard>
        </div>
        <ChartCard title="Mais vendidos" subtitle="Últimos 30 dias · unidades">
          <BarList rows={m.topProducts.slice(0, 6).map((p) => ({ label: p.name, value: p.quantity, hint: 'un.' }))} />
        </ChartCard>
        <ChartCard title="Vendas por categoria" subtitle="Últimos 30 dias">
          <BarList money rows={m.byCategory.map((c) => ({ label: c.name, value: c.totalCents }))} />
        </ChartCard>
        <ChartCard title="Formas de pagamento" subtitle="Últimos 30 dias">
          <BarList money rows={m.byPaymentMethod.map((p) => ({ label: `${PAYMENT_METHOD[p.method]} (${p.count})`, value: p.totalCents }))} />
        </ChartCard>
        <ChartCard title="Mesas agora" subtitle="Toque para abrir">
          <div className="grid grid-cols-5 gap-1.5">
            {tables?.map((t) => (
              <Link key={t.id} to={`/app/mesas/${t.id}`} title={TABLE_STATE[t.state].label} className={`flex aspect-square items-center justify-center rounded-lg border-2 font-display text-sm font-bold ${TABLE_STATE[t.state].card}`}>
                {padTable(t.number)}
              </Link>
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-marrom-600">
            {Object.entries(TABLE_STATE).map(([k, v]) => (
              <li key={k} className="flex items-center gap-1">
                <span className={`size-2 rounded-full ${v.dot}`} /> {v.label}
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>
    </div>
  );
}
