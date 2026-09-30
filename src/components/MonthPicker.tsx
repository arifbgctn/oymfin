import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, currentMonth, monthLabel } from '../domain/month';
import { useApp } from '../state/AppContext';
import { IconButton } from './ui';

export function MonthPicker() {
  const { month, setMonth } = useApp();
  const isCurrent = month === currentMonth();
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Önceki ay" onClick={() => setMonth(addMonths(month, -1))}>
        <ChevronLeft size={22} />
      </IconButton>
      <button
        type="button"
        className="min-w-32 rounded-lg px-2 py-1 text-center text-[17px] font-bold"
        onClick={() => setMonth(currentMonth())}
        aria-live="polite"
        title={isCurrent ? undefined : 'Bu aya dön'}
      >
        <span data-testid="month-label">{monthLabel(month)}</span>
        {!isCurrent && <span className="block text-[11px] font-medium text-accent">Bu aya dön</span>}
      </button>
      <IconButton label="Sonraki ay" onClick={() => setMonth(addMonths(month, 1))}>
        <ChevronRight size={22} />
      </IconButton>
    </div>
  );
}
