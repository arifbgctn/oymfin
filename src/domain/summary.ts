import { addMonths } from './month';
import { formatAmountInput } from './money';
import { compareTr, includesTr } from './text';
import type { Category, MonthKey, Transaction, TxType } from './types';

export interface MonthSummary {
  income: number;
  expense: number;
  net: number;
  /** net / gelir × 100; gelir yoksa null */
  savingsRate: number | null;
}

export function monthSummary(txs: Transaction[]): MonthSummary {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amountKurus;
    else expense += t.amountKurus;
  }
  const net = income - expense;
  return { income, expense, net, savingsRate: income > 0 ? (net / income) * 100 : null };
}

/** Yüzde değişim. İkisi de 0 → 0; yalnızca önceki 0 → null ("—"). */
export function pctChange(cur: number, prev: number): number | null {
  if (cur === 0 && prev === 0) return 0;
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export interface SummaryWithChange {
  current: MonthSummary;
  previous: MonthSummary;
  incomeChange: number | null;
  expenseChange: number | null;
  netChange: number | null;
  /** Tasarruf oranındaki puan farkı */
  savingsRateDelta: number | null;
}

export function summaryWithChange(cur: Transaction[], prev: Transaction[]): SummaryWithChange {
  const current = monthSummary(cur);
  const previous = monthSummary(prev);
  return {
    current,
    previous,
    incomeChange: pctChange(current.income, previous.income),
    expenseChange: pctChange(current.expense, previous.expense),
    netChange: pctChange(current.net, previous.net),
    savingsRateDelta:
      current.savingsRate !== null && previous.savingsRate !== null ? current.savingsRate - previous.savingsRate : null,
  };
}

export interface BreakdownSlice {
  id: string;
  name: string;
  color: string;
  emoji: string;
  value: number;
  share: number;
}

export const OTHER_SLICE_COLOR = '#64748b';

/** Kategori dağılımı: büyükten küçüğe ilk `top` kategori, kalanlar "Diğer". */
export function categoryBreakdown(txs: Transaction[], categories: Category[], type: TxType, top = 5): BreakdownSlice[] {
  const byCat = new Map<string, number>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== type) continue;
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amountKurus);
    total += t.amountKurus;
  }
  if (total === 0) return [];
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const slices: BreakdownSlice[] = sorted.slice(0, top).map(([id, value]) => {
    const c = catMap.get(id);
    return {
      id,
      name: c?.name ?? 'Kategorisiz',
      color: c?.color ?? OTHER_SLICE_COLOR,
      emoji: c?.emoji ?? '❔',
      value,
      share: value / total,
    };
  });
  const rest = sorted.slice(top).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) slices.push({ id: '__other', name: 'Diğer', color: OTHER_SLICE_COLOR, emoji: '•', value: rest, share: rest / total });
  return slices;
}

export interface TrendPoint {
  month: MonthKey;
  income: number;
  expense: number;
}

/** `endMonth` dahil son `n` ay; işlem olmayan aylar 0. */
export function trend(txs: Transaction[], endMonth: MonthKey, n = 6): TrendPoint[] {
  const points: TrendPoint[] = [];
  const idx = new Map<MonthKey, TrendPoint>();
  for (let i = n - 1; i >= 0; i--) {
    const p = { month: addMonths(endMonth, -i), income: 0, expense: 0 };
    points.push(p);
    idx.set(p.month, p);
  }
  for (const t of txs) {
    const p = idx.get(t.month);
    if (!p) continue;
    if (t.type === 'income') p.income += t.amountKurus;
    else p.expense += t.amountKurus;
  }
  return points;
}

export type SortKey = 'date' | 'amount' | 'description';
export type SortDir = 'asc' | 'desc';

export function sortTransactions(list: Transaction[], key: SortKey, dir: SortDir): Transaction[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    let c =
      key === 'date'
        ? a.date < b.date ? -1 : a.date > b.date ? 1 : 0
        : key === 'amount'
          ? a.amountKurus - b.amountKurus
          : compareTr(a.description, b.description);
    if (c === 0) c = a.createdAt - b.createdAt;
    if (c === 0) c = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return c * m;
  });
}

export interface TxFilter {
  type: 'all' | TxType;
  q: string;
}

export function filterTransactions(list: Transaction[], filter: TxFilter, categories: Category[]): Transaction[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const q = filter.q.trim();
  return list.filter((t) => {
    if (filter.type !== 'all' && t.type !== filter.type) return false;
    if (!q) return true;
    return (
      includesTr(t.description, q) ||
      includesTr(t.note ?? '', q) ||
      includesTr(names.get(t.categoryId) ?? '', q) ||
      formatAmountInput(t.amountKurus).includes(q)
    );
  });
}

/** Tarihe göre gruplar (yeni tarih önce), grup içi sıra korunur. */
export function groupByDate(list: Transaction[]): { date: string; items: Transaction[] }[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of list) {
    const g = groups.get(t.date);
    if (g) g.push(t);
    else groups.set(t.date, [t]);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, items }));
}
