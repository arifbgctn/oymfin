import { AlertTriangle, CheckCircle2, OctagonAlert } from 'lucide-react';
import type { BudgetRow } from '../domain/budget';
import { formatPercent, formatTRY } from '../domain/money';

const STYLE = {
  ok: { bar: 'bg-[#0ca30c]', text: 'text-income', label: 'Yolunda', Icon: CheckCircle2 },
  warning: { bar: 'bg-[#fab219]', text: 'text-warn', label: 'Sınıra yakın', Icon: AlertTriangle },
  over: { bar: 'bg-[#d03b3b]', text: 'text-expense', label: 'Aşıldı', Icon: OctagonAlert },
} as const;

export function BudgetBar({ row, onClick }: { row: BudgetRow; onClick?: () => void }) {
  const st = STYLE[row.status];
  const pct = Math.round(row.ratio * 100);
  return (
    <button type="button" onClick={onClick} className="w-full rounded-xl p-2 text-left hover:bg-surface-2" data-testid="budget-row" data-status={row.status}>
      <div className="mb-1.5 flex items-center gap-2">
        <span aria-hidden>{row.category.emoji}</span>
        <span className="flex-1 truncate font-medium">{row.category.name}</span>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${st.text}`}>
          <st.Icon size={14} aria-hidden /> {st.label}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${row.category.name} bütçesi`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        aria-valuetext={`${formatPercent(row.ratio * 100, 0)} kullanıldı`}
        className="h-2.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${Math.min(100, row.ratio * 100)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted tabular">
        <span>
          {formatTRY(row.spent)} / {formatTRY(row.limit)}
        </span>
        <span className={row.remaining < 0 ? 'font-semibold text-expense' : ''}>
          {row.remaining < 0 ? `${formatTRY(-row.remaining)} fazla` : `${formatTRY(row.remaining)} kaldı`} · {formatPercent(row.ratio * 100, 0)}
        </span>
      </div>
    </button>
  );
}
