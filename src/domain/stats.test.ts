import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from './seed';
import { categoryTrends, cumulativeDaily, paceComparison, rangeStats } from './stats';
import type { Transaction } from './types';

let seq = 0;
const tx = (type: 'income' | 'expense', amountKurus: number, date: string, categoryId = type === 'income' ? 'cat-maas' : 'cat-market'): Transaction => ({
  id: `t${++seq}`,
  type,
  amountKurus,
  categoryId,
  description: '',
  date,
  month: date.slice(0, 7),
  createdAt: seq,
  updatedAt: seq,
});

describe('rangeStats', () => {
  const txs = [
    tx('income', 10000, '2026-07-01'),
    tx('expense', 4000, '2026-07-10'),
    tx('income', 10000, '2026-08-01'),
    tx('expense', 12000, '2026-08-10'),
    tx('income', 12000, '2026-09-01'),
    tx('expense', 3000, '2026-09-10'),
    tx('expense', 99999, '2026-01-01'), // aralık dışı
  ];

  it('computes totals, averages and extremes over active months', () => {
    const s = rangeStats(txs, '2026-09', 6);
    expect(s.months).toHaveLength(6);
    expect(s.activeMonths).toBe(3);
    expect(s.totalIncome).toBe(32000);
    expect(s.totalExpense).toBe(19000);
    expect(s.totalNet).toBe(13000);
    expect(s.avgIncome).toBeCloseTo(32000 / 3);
    expect(s.avgExpense).toBeCloseTo(19000 / 3);
    expect(s.avgSavingsRate).toBeCloseTo((60 + -20 + 75) / 3);
    expect(s.bestMonth?.month).toBe('2026-09');
    expect(s.worstMonth?.month).toBe('2026-08');
    expect(s.maxExpenseMonth?.month).toBe('2026-08');
    expect(s.minExpenseMonth?.month).toBe('2026-09');
    expect(s.months[5]).toMatchObject({ month: '2026-09', net: 9000, savingsRate: 75 });
    expect(s.months[0]).toMatchObject({ month: '2026-04', income: 0, expense: 0, savingsRate: null });
  });

  it('handles an empty range', () => {
    const s = rangeStats([], '2026-09', 3);
    expect(s).toMatchObject({ activeMonths: 0, avgExpense: 0, avgSavingsRate: null, bestMonth: null, maxExpenseMonth: null });
  });
});

describe('categoryTrends', () => {
  it('builds per-category monthly series and change vs prior average', () => {
    const txs = [
      tx('expense', 1000, '2026-07-05'),
      tx('expense', 3000, '2026-08-05'),
      tx('expense', 4000, '2026-09-05'),
      tx('expense', 500, '2026-09-06', 'cat-eglence'),
      tx('income', 9999, '2026-09-01'),
    ];
    const [market, eglence] = categoryTrends(txs, DEFAULT_CATEGORIES, '2026-09', 3);
    expect(market).toMatchObject({ categoryId: 'cat-market', series: [1000, 3000, 4000], total: 8000, current: 4000, changeVsAverage: 100 });
    expect(market!.average).toBeCloseTo(8000 / 3);
    expect(market!.category?.name).toBe('Market');
    expect(eglence).toMatchObject({ series: [0, 0, 500], changeVsAverage: null });
  });

  it('ignores months without any transactions in averages', () => {
    const txs = [tx('expense', 8000, '2026-08-05'), tx('expense', 4000, '2026-09-05')];
    const [market] = categoryTrends(txs, DEFAULT_CATEGORIES, '2026-09', 6);
    expect(market).toMatchObject({ average: 6000, changeVsAverage: -50 });
  });

  it('can target income and a single month', () => {
    const t = categoryTrends([tx('income', 100, '2026-09-01')], DEFAULT_CATEGORIES, '2026-09', 1, 'income');
    expect(t[0]).toMatchObject({ series: [100], changeVsAverage: null });
  });
});

describe('cumulativeDaily & pace', () => {
  const txs = [
    tx('expense', 100, '2026-09-01'),
    tx('expense', 200, '2026-09-03'),
    tx('income', 999, '2026-09-02'),
    tx('expense', 50, '2026-08-01'),
    tx('expense', 350, '2026-08-02'),
  ];

  it('accumulates by day and stops at uptoDay', () => {
    const c = cumulativeDaily(txs, '2026-09', 3);
    expect(c).toHaveLength(30);
    expect(c.slice(0, 4)).toEqual([100, 100, 300, null]);
    expect(cumulativeDaily(txs, '2026-09').at(-1)).toBe(300);
  });

  it('compares with the same day last month', () => {
    expect(paceComparison(txs, '2026-09', 3)).toEqual({ current: 300, previous: 400, change: -25 });
    // 31 Ekim → 30 Eylül'e kısılır
    expect(paceComparison(txs, '2026-10', 31)).toEqual({ current: 0, previous: 300, change: -100 });
  });
});
