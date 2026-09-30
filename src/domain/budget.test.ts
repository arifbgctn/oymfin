import { describe, expect, it } from 'vitest';
import { budgetId, budgetRows, budgetStatus, resolveBudget } from './budget';
import { DEFAULT_CATEGORIES } from './seed';
import type { Budget, Transaction } from './types';

const b = (categoryId: string, effectiveFrom: string, amountKurus: number): Budget => ({
  id: budgetId(categoryId, effectiveFrom),
  categoryId,
  effectiveFrom,
  amountKurus,
  updatedAt: 1,
});

describe('budgetStatus thresholds', () => {
  it.each([
    [7999, 'ok'],
    [8000, 'warning'],
    [10000, 'warning'],
    [10001, 'over'],
    [0, 'ok'],
  ])('spent %d of 10000 → %s', (spent, status) => {
    expect(budgetStatus(spent, 10000)?.status).toBe(status);
  });

  it('computes remaining and returns null for zero limit', () => {
    expect(budgetStatus(2500, 10000)).toEqual({ ratio: 0.25, status: 'ok', remaining: 7500 });
    expect(budgetStatus(100, 0)).toBeNull();
  });
});

describe('resolveBudget (carry forward)', () => {
  const budgets = [b('cat-market', '2026-03', 500000), b('cat-market', '2026-07', 600000), b('cat-market', '2026-10', 0), b('cat-kira', '2026-01', 1)];

  it('uses the latest effective row up to the month', () => {
    expect(resolveBudget(budgets, 'cat-market', '2026-02')).toBeNull();
    expect(resolveBudget(budgets, 'cat-market', '2026-03')).toBe(500000);
    expect(resolveBudget(budgets, 'cat-market', '2026-06')).toBe(500000);
    expect(resolveBudget(budgets, 'cat-market', '2026-09')).toBe(600000);
    expect(resolveBudget(budgets, 'cat-market', '2026-10')).toBeNull();
    expect(resolveBudget(budgets, 'cat-market', '2027-05')).toBeNull();
    expect(resolveBudget(budgets, 'cat-eglence', '2026-09')).toBeNull();
  });
});

describe('budgetRows', () => {
  it('builds rows for expense categories with budgets, sorted by ratio', () => {
    const txs = [
      { id: '1', type: 'expense', amountKurus: 85000, categoryId: 'cat-market', month: '2026-09' },
      { id: '2', type: 'expense', amountKurus: 20000, categoryId: 'cat-eglence', month: '2026-09' },
      { id: '3', type: 'income', amountKurus: 99999, categoryId: 'cat-maas', month: '2026-09' },
    ] as Transaction[];
    const rows = budgetRows([b('cat-market', '2026-01', 100000), b('cat-eglence', '2026-09', 100000), b('cat-maas', '2026-01', 5)], DEFAULT_CATEGORIES, txs, '2026-09');
    expect(rows.map((r) => [r.category.id, r.spent, r.status])).toEqual([
      ['cat-market', 85000, 'warning'],
      ['cat-eglence', 20000, 'ok'],
    ]);
  });
});
