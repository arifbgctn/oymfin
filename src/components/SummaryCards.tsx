import { formatPercent, formatSignedTRY, formatTRY } from '../domain/money';
import type { SummaryWithChange } from '../domain/summary';

function Change({ value, goodWhenUp, points }: { value: number | null; goodWhenUp: boolean; points?: boolean }) {
  if (value === null) return <span className="text-xs text-muted" title="Geçen ay veri yok">— geçen ay</span>;
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return <span className="text-xs text-muted">= geçen ay</span>;
  const up = rounded > 0;
  const good = up === goodWhenUp;
  const text = points ? `${Math.abs(rounded).toFixed(1).replace('.', ',')} puan` : formatPercent(Math.abs(rounded));
  return (
    <span className={`text-xs font-semibold ${good ? 'text-income' : 'text-expense'}`}>
      <span aria-hidden>{up ? '▲' : '▼'}</span> {text}
      <span className="sr-only"> {up ? 'artış' : 'azalış'} geçen aya göre</span>
    </span>
  );
}

export function StatCard({ label, value, change, testId }: { label: string; value: string; change: React.ReactNode; testId: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3.5" data-testid={testId}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-lg font-bold leading-tight tracking-tight" data-testid={`${testId}-value`}>
        {value}
      </div>
      <div className="mt-1">{change}</div>
    </div>
  );
}

export function SummaryCards({ s }: { s: SummaryWithChange }) {
  const { current } = s;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard testId="card-income" label="Gelir" value={formatTRY(current.income)} change={<Change value={s.incomeChange} goodWhenUp />} />
      <StatCard testId="card-expense" label="Gider" value={formatTRY(current.expense)} change={<Change value={s.expenseChange} goodWhenUp={false} />} />
      <StatCard
        testId="card-net"
        label="Net"
        value={current.net === 0 ? formatTRY(0) : formatSignedTRY(current.net)}
        change={<Change value={s.netChange} goodWhenUp />}
      />
      <StatCard
        testId="card-savings"
        label="Tasarruf Oranı"
        value={current.savingsRate === null ? '—' : formatPercent(current.savingsRate)}
        change={<Change value={s.savingsRateDelta} goodWhenUp points />}
      />
    </div>
  );
}
