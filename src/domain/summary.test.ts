import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from './seed';
import {
  categoryBreakdown,
  filterTransactions,
  groupByDate,
  monthSummary,
  pctChange,
  sortTransactions,
  summaryWithChange,
  trend,
} from './summary';
import { foldTr, includesTr } from './text';
import type { Transaction } from './types';

let seq = 0;
function tx(p: Partial<Transaction>): Transaction {
  seq++;
  const date = p.date ?? '2026-09-10';
  return {
    id: p.id ?? `t${seq}`,
    type: 'expense',
    amountKurus: 1000,
    categoryId: 'cat-market',
    description: '',
    createdAt: seq,
    updatedAt: seq,
    ...p,
    date,
    month: date.slice(0, 7),
  };
}

describe('monthSummary', () => {
  it('computes income, expense, net and savings rate', () => {
    const s = monthSummary([
      tx({ type: 'income', amountKurus: 2500000 }),
      tx({ type: 'expense', amountKurus: 123456 }),
    ]);
    expect(s).toEqual({ income: 2500000, expense: 123456, net: 2376544, savingsRate: (2376544 / 2500000) * 100 });
  });

  it('returns null savings rate without income', () => {
    expect(monthSummary([tx({ amountKurus: 500 })]).savingsRate).toBeNull();
    expect(monthSummary([])).toEqual({ income: 0, expense: 0, net: 0, savingsRate: null });
  });
});

describe('pctChange', () => {
  it('handles zero and negative baselines', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(50, 0)).toBeNull();
    expect(pctChange(-50, -100)).toBe(50);
  });

  it('summaryWithChange reports deltas', () => {
    const cur = [tx({ type: 'income', amountKurus: 1000 }), tx({ amountKurus: 500 })];
    const prev = [tx({ type: 'income', amountKurus: 1000, date: '2026-08-01' }), tx({ amountKurus: 250, date: '2026-08-02' })];
    const s = summaryWithChange(cur, prev);
    expect(s.incomeChange).toBe(0);
    expect(s.expenseChange).toBe(100);
    expect(s.savingsRateDelta).toBeCloseTo(-25);
    expect(summaryWithChange(cur, []).savingsRateDelta).toBeNull();
  });
});

describe('categoryBreakdown', () => {
  it('sorts, limits to top N and groups the rest as Diğer', () => {
    const ids = ['cat-market', 'cat-kira', 'cat-faturalar', 'cat-ulasim', 'cat-yeme-icme', 'cat-eglence', 'cat-saglik'];
    const txs = ids.map((id, i) => tx({ categoryId: id, amountKurus: (i + 1) * 100 }));
    txs.push(tx({ type: 'income', amountKurus: 99999, categoryId: 'cat-maas' }));
    const slices = categoryBreakdown(txs, DEFAULT_CATEGORIES, 'expense', 5);
    expect(slices).toHaveLength(6);
    expect(slices[0]!.id).toBe('cat-saglik');
    expect(slices[5]).toMatchObject({ id: '__other', name: 'Diğer', value: 300 });
    expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1);
  });

  it('handles unknown categories and empty input', () => {
    expect(categoryBreakdown([], DEFAULT_CATEGORIES, 'expense')).toEqual([]);
    const [s] = categoryBreakdown([tx({ categoryId: 'gone' })], DEFAULT_CATEGORIES, 'expense');
    expect(s).toMatchObject({ name: 'Kategorisiz', share: 1 });
  });
});

describe('trend', () => {
  it('zero-fills months and crosses years', () => {
    const t = trend(
      [tx({ type: 'income', amountKurus: 500, date: '2025-12-05' }), tx({ amountKurus: 200, date: '2026-02-01' }), tx({ date: '2025-01-01' })],
      '2026-02',
      4,
    );
    expect(t).toEqual([
      { month: '2025-11', income: 0, expense: 0 },
      { month: '2025-12', income: 500, expense: 0 },
      { month: '2026-01', income: 0, expense: 0 },
      { month: '2026-02', income: 0, expense: 200 },
    ]);
  });
});

describe('sorting and filtering', () => {
  const a = tx({ id: 'a', description: 'Su Faturası', amountKurus: 30000, date: '2026-09-02', categoryId: 'cat-faturalar' });
  const b = tx({ id: 'b', description: 'İstanbul kart', amountKurus: 10000, date: '2026-09-05', categoryId: 'cat-ulasim' });
  const c = tx({ id: 'c', description: 'ISPANAK', amountKurus: 10000, date: '2026-09-05', note: 'pazar' });
  const d = tx({ id: 'd', type: 'income', description: 'Maaş', amountKurus: 2500000, date: '2026-09-01', categoryId: 'cat-maas' });
  const all = [a, b, c, d];

  it('sorts by date, amount and description with stable ties', () => {
    expect(sortTransactions(all, 'date', 'desc').map((t) => t.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(sortTransactions(all, 'amount', 'asc').map((t) => t.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(sortTransactions(all, 'description', 'asc').map((t) => t.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('filters by type and Turkish-insensitive search', () => {
    expect(filterTransactions(all, { type: 'income', q: '' }, DEFAULT_CATEGORIES).map((t) => t.id)).toEqual(['d']);
    expect(filterTransactions(all, { type: 'all', q: 'ist' }, DEFAULT_CATEGORIES).map((t) => t.id)).toEqual(['b']);
    expect(filterTransactions(all, { type: 'all', q: 'ıspanak' }, DEFAULT_CATEGORIES).map((t) => t.id)).toEqual(['c']);
    expect(filterTransactions(all, { type: 'all', q: 'ispanak' }, DEFAULT_CATEGORIES).map((t) => t.id)).toEqual(['c']);
    expect(filterTransactions(all, { type: 'all', q: 'su' }, DEFAULT_CATEGORIES).map((t) => t.id)).toEqual(['a']);
    expect(filterTransactions(all, { type: 'expense', q: 'ulaşım' }, DEFAULT_CATEGORIES).map((t) => t.id)).toEqual(['b']);
    expect(filterTransactions(all, { type: 'all', q: 'PAZAR' }, DEFAULT_CATEGORIES).map((t) => t.id)).toEqual(['c']);
    expect(filterTransactions(all, { type: 'all', q: '25.000' }, DEFAULT_CATEGORIES).map((t) => t.id)).toEqual(['d']);
  });

  it('groups by date keeping order', () => {
    const g = groupByDate(sortTransactions(all, 'date', 'desc'));
    expect(g.map((x) => [x.date, x.items.length])).toEqual([
      ['2026-09-05', 2],
      ['2026-09-02', 1],
      ['2026-09-01', 1],
    ]);
  });

  it('folds Turkish characters', () => {
    expect(foldTr('ŞÇĞÜÖİI')).toBe('scguoiı'.replace('ı', 'i'));
    expect(includesTr('Yeme-İçme', 'icme')).toBe(true);
  });
});
