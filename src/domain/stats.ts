import { addMonths, daysInMonth, monthRange } from './month';
import { pctChange, trend, type TrendPoint } from './summary';
import type { Category, MonthKey, Transaction, TxType } from './types';

export interface MonthStat extends TrendPoint {
  net: number;
  /** Gelir yoksa null */
  savingsRate: number | null;
}

export interface RangeStats {
  months: MonthStat[];
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
  avgIncome: number;
  avgExpense: number;
  avgNet: number;
  /** Geliri olan ayların tasarruf oranı ortalaması */
  avgSavingsRate: number | null;
  /** En yüksek / en düşük net (yalnızca verisi olan aylar) */
  bestMonth: MonthStat | null;
  worstMonth: MonthStat | null;
  /** En çok / en az harcanan ay (gideri olan aylar) */
  maxExpenseMonth: MonthStat | null;
  minExpenseMonth: MonthStat | null;
  /** İşlemi olan ay sayısı */
  activeMonths: number;
}

/** `endMonth` dahil son `n` ayın istatistikleri. Ortalamalar işlemi olan aylar üzerinden. */
export function rangeStats(txs: Transaction[], endMonth: MonthKey, n: number): RangeStats {
  const months: MonthStat[] = trend(txs, endMonth, n).map((p) => ({
    ...p,
    net: p.income - p.expense,
    savingsRate: p.income > 0 ? ((p.income - p.expense) / p.income) * 100 : null,
  }));
  const active = months.filter((m) => m.income > 0 || m.expense > 0);
  const withExpense = active.filter((m) => m.expense > 0);
  const rates = active.map((m) => m.savingsRate).filter((r): r is number => r !== null);
  const totalIncome = months.reduce((s, m) => s + m.income, 0);
  const totalExpense = months.reduce((s, m) => s + m.expense, 0);
  const div = Math.max(active.length, 1);
  const pick = (list: MonthStat[], f: (m: MonthStat) => number, dir: 1 | -1) =>
    list.length ? list.reduce((best, m) => (f(m) * dir > f(best) * dir ? m : best)) : null;
  return {
    months,
    totalIncome,
    totalExpense,
    totalNet: totalIncome - totalExpense,
    avgIncome: totalIncome / div,
    avgExpense: totalExpense / div,
    avgNet: (totalIncome - totalExpense) / div,
    avgSavingsRate: rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null,
    bestMonth: pick(active, (m) => m.net, 1),
    worstMonth: pick(active, (m) => m.net, -1),
    maxExpenseMonth: pick(withExpense, (m) => m.expense, 1),
    minExpenseMonth: pick(withExpense, (m) => m.expense, -1),
    activeMonths: active.length,
  };
}

export interface CategoryTrend {
  category: Category | undefined;
  categoryId: string;
  /** Aylara göre tutarlar (eski → yeni) */
  series: number[];
  total: number;
  /** Aylık ortalama (işlem girilmiş aylar üzerinden) */
  average: number;
  /** Son ayın tutarı */
  current: number;
  /** Son ayın, önceki (işlem girilmiş) ayların ortalamasına göre % farkı */
  changeVsAverage: number | null;
}

/** Kategori başına aylık seri; toplamı büyükten küçüğe. */
export function categoryTrends(txs: Transaction[], categories: Category[], endMonth: MonthKey, n: number, type: TxType = 'expense'): CategoryTrend[] {
  const months = monthRange(addMonths(endMonth, -(n - 1)), endMonth);
  const idx = new Map(months.map((m, i) => [m, i]));
  const byCat = new Map<string, number[]>();
  for (const t of txs) {
    if (t.type !== type) continue;
    const i = idx.get(t.month);
    if (i === undefined) continue;
    let s = byCat.get(t.categoryId);
    if (!s) byCat.set(t.categoryId, (s = months.map(() => 0)));
    s[i]! += t.amountKurus;
  }
  // Hiç işlem girilmemiş aylar (ör. uygulamayı kullanmaya başlamadan önceki aylar) ortalamaya katılmaz.
  const active = new Set<number>();
  for (const t of txs) {
    const i = idx.get(t.month);
    if (i !== undefined) active.add(i);
  }
  const last = months.length - 1;
  const priorIdx = [...active].filter((i) => i !== last);
  const catMap = new Map(categories.map((c) => [c.id, c]));
  return [...byCat.entries()]
    .map(([categoryId, series]) => {
      const total = series.reduce((a, b) => a + b, 0);
      const current = series[last]!;
      const priorAvg = priorIdx.length ? priorIdx.reduce((a, i) => a + series[i]!, 0) / priorIdx.length : 0;
      return {
        category: catMap.get(categoryId),
        categoryId,
        series,
        total,
        average: total / Math.max(active.size, 1),
        current,
        changeVsAverage: priorIdx.length ? pctChange(current, priorAvg) : null,
      };
    })
    .sort((a, b) => b.total - a.total || a.categoryId.localeCompare(b.categoryId));
}

/**
 * Ay içinde güne göre kümülatif gider. `uptoDay` verilirse o günden sonrası null
 * (içinde bulunulan ayda gelecek günler çizilmez).
 */
export function cumulativeDaily(txs: Transaction[], month: MonthKey, uptoDay?: number): (number | null)[] {
  const days = daysInMonth(month);
  const perDay = Array.from({ length: days }, () => 0);
  for (const t of txs) {
    if (t.month !== month || t.type !== 'expense') continue;
    const d = Number(t.date.slice(8, 10));
    perDay[d - 1]! += t.amountKurus;
  }
  let run = 0;
  return perDay.map((v, i) => {
    run += v;
    return uptoDay !== undefined && i + 1 > uptoDay ? null : run;
  });
}

/** Aynı gün itibarıyla bu ay ile geçen ayın kümülatif gider karşılaştırması. */
export function paceComparison(txs: Transaction[], month: MonthKey, day: number): { current: number; previous: number; change: number | null } {
  const cur = cumulativeDaily(txs, month);
  const prevMonth = addMonths(month, -1);
  const prev = cumulativeDaily(txs, prevMonth);
  const current = cur[Math.min(day, cur.length) - 1] ?? 0;
  const previous = prev[Math.min(day, prev.length) - 1] ?? 0;
  return { current: current ?? 0, previous: previous ?? 0, change: pctChange(current ?? 0, previous ?? 0) };
}
