import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { brl } from '../lib/format';
import { Card } from './ui';

// Uma série por gráfico, uma cor (verde da marca): a identidade vem do título, não da cor.
const BAR = '#4f7d40';
const GRID = '#eedfcf';
const AXIS = '#9a6a3e';

const compactBRL = (cents: number) =>
  cents >= 100_000_00 ? `R$ ${(cents / 100_000_00).toFixed(1)}mi` : cents >= 1000_00 ? `R$ ${Math.round(cents / 1000_00)}mil` : `R$ ${Math.round(cents / 100)}`;

function TooltipBox({ active, payload, label, money, unit }: { active?: boolean; payload?: { value: number }[]; label?: string; money?: boolean; unit?: string }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="rounded-xl border border-marrom-100 bg-white px-3 py-2 text-sm shadow-float">
      <p className="font-bold text-marrom-700">{label}</p>
      <p className="tabular font-extrabold text-marrom-900">{money ? brl(v) : `${v} ${unit ?? ''}`}</p>
    </div>
  );
}

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="font-sans text-base font-extrabold text-marrom-900">{title}</h3>
      {subtitle && <p className="text-xs text-marrom-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </Card>
  );
}

/** Colunas verticais (série temporal ou horas). */
export function ColumnChart<T extends Record<string, unknown>>({ data, x, y, money, unit, height = 220, xFormat }: { data: T[]; x: keyof T; y: keyof T; money?: boolean; unit?: string; height?: number; xFormat?: (v: string) => string }) {
  return (
    <div style={{ height }} role="img" aria-label="Gráfico de colunas">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={x as string} tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={xFormat} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} width={money ? 58 : 32} tickFormatter={(v) => (money ? compactBRL(v) : String(v))} allowDecimals={false} />
          <Tooltip cursor={{ fill: 'rgb(79 125 64 / 0.08)' }} content={<TooltipBox money={money} unit={unit} />} labelFormatter={(l) => (xFormat ? xFormat(String(l)) : String(l))} />
          <Bar dataKey={y as string} fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontais em HTML (rótulos longos legíveis no celular, sem rolagem lateral). */
export function BarList({ rows, money }: { rows: { label: string; value: number; hint?: string }[]; money?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-marrom-500">Sem dados no período.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="group" title={`${r.label}: ${money ? brl(r.value) : r.value}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold text-marrom-800">{r.label}</span>
            <span className="tabular shrink-0 font-bold text-marrom-900">
              {money ? brl(r.value) : r.value}
              {r.hint && <span className="ml-1 font-normal text-marrom-500">{r.hint}</span>}
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-marrom-50">
            <div className="h-full rounded-full bg-verde-500 transition-[width] group-hover:bg-verde-600" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
