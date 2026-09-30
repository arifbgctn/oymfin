import { describe, expect, it } from 'vitest';
import { emptyDataset, mergeDatasets, stableStringify } from './merge';
import { buildRecurringTx, planRecurring } from './recurring';
import { DEFAULT_CATEGORIES } from './seed';
import type { Category, Dataset, RecurringRule, Transaction } from './types';

const base = (): Dataset => ({ ...emptyDataset(), categories: [...DEFAULT_CATEGORIES] });

const tx = (id: string, updatedAt: number, p: Partial<Transaction> = {}): Transaction => ({
  id,
  type: 'expense',
  amountKurus: 1000,
  categoryId: 'cat-market',
  description: id,
  date: '2026-09-10',
  month: '2026-09',
  createdAt: 1,
  updatedAt,
  ...p,
});

const tomb = (table: 'transactions' | 'categories' | 'assets' | 'trades', id: string, deletedAt: number) => ({
  key: `${table}:${id}`,
  table,
  id,
  deletedAt,
});

describe('mergeDatasets', () => {
  it('unions records from both sides', () => {
    const a = { ...base(), transactions: [tx('a', 1)] };
    const b = { ...base(), transactions: [tx('b', 2)] };
    const { dataset, stats } = mergeDatasets(a, b);
    expect(dataset.transactions.map((t) => t.id)).toEqual(['a', 'b']);
    expect(stats).toEqual({ added: 1, updated: 0, deleted: 0 });
  });

  it('newest edit wins', () => {
    const a = { ...base(), transactions: [tx('x', 5, { amountKurus: 500 })] };
    const b = { ...base(), transactions: [tx('x', 9, { amountKurus: 900 })] };
    expect(mergeDatasets(a, b).dataset.transactions[0]!.amountKurus).toBe(900);
    expect(mergeDatasets(b, a).dataset.transactions[0]!.amountKurus).toBe(900);
    expect(mergeDatasets(a, b).stats).toEqual({ added: 0, updated: 1, deleted: 0 });
  });

  it('breaks updatedAt ties deterministically', () => {
    const a = { ...base(), transactions: [tx('x', 5, { amountKurus: 500 })] };
    const b = { ...base(), transactions: [tx('x', 5, { amountKurus: 900 })] };
    expect(mergeDatasets(a, b).dataset).toEqual(mergeDatasets(b, a).dataset);
  });

  it('deletion on one device removes the older record on the other', () => {
    const phone = { ...base(), tombstones: [tomb('transactions', 'x', 10)] };
    const mac = { ...base(), transactions: [tx('x', 5)] };
    const r = mergeDatasets(mac, phone);
    expect(r.dataset.transactions).toEqual([]);
    expect(r.dataset.tombstones).toHaveLength(1);
    expect(r.stats.deleted).toBe(1);
  });

  it('record edited after deletion survives and tombstone is dropped', () => {
    const phone = { ...base(), tombstones: [tomb('transactions', 'x', 10)] };
    const mac = { ...base(), transactions: [tx('x', 20)] };
    const r = mergeDatasets(phone, mac);
    expect(r.dataset.transactions.map((t) => t.id)).toEqual(['x']);
    expect(r.dataset.tombstones).toEqual([]);
  });

  it('keeps the newest tombstone', () => {
    const a = { ...base(), tombstones: [tomb('transactions', 'x', 10)] };
    const b = { ...base(), tombstones: [tomb('transactions', 'x', 30)] };
    expect(mergeDatasets(a, b).dataset.tombstones[0]!.deletedAt).toBe(30);
  });

  it('same recurring instance generated on both devices becomes one record', () => {
    const rule: RecurringRule = {
      id: 'r1', type: 'expense', amountKurus: 1500000, categoryId: 'cat-kira', description: 'Kira',
      dayOfMonth: 1, startMonth: '2026-09', active: true, createdAt: 1, updatedAt: 1,
    };
    const inst = buildRecurringTx(rule, planRecurring(rule, '2026-09')[0]!);
    const phone = { ...base(), recurring: [{ ...rule, lastGeneratedMonth: '2026-09' }], transactions: [inst] };
    const mac = { ...base(), recurring: [{ ...rule, lastGeneratedMonth: '2026-09' }], transactions: [{ ...inst }] };
    const r = mergeDatasets(phone, mac);
    expect(r.dataset.transactions).toHaveLength(1);
    expect(r.stats).toEqual({ added: 0, updated: 0, deleted: 0 });
  });

  it('recurring cursor takes the max regardless of winner', () => {
    const rule: RecurringRule = {
      id: 'r1', type: 'expense', amountKurus: 1, categoryId: 'cat-kira', description: 'Kira',
      dayOfMonth: 1, startMonth: '2026-01', active: true, createdAt: 1, updatedAt: 1,
    };
    const a = { ...base(), recurring: [{ ...rule, updatedAt: 50, amountKurus: 2, lastGeneratedMonth: '2026-07' }] };
    const b = { ...base(), recurring: [{ ...rule, updatedAt: 10, lastGeneratedMonth: '2026-09' }] };
    const [merged] = mergeDatasets(a, b).dataset.recurring;
    expect(merged).toMatchObject({ amountKurus: 2, lastGeneratedMonth: '2026-09' });
    expect(mergeDatasets(b, a).dataset.recurring[0]).toEqual(merged);
  });

  it('budgets merge by composite id', () => {
    const bud = (amountKurus: number, updatedAt: number) => ({ id: 'cat-market|2026-09', categoryId: 'cat-market', effectiveFrom: '2026-09', amountKurus, updatedAt });
    const a = { ...base(), budgets: [bud(100, 1)] };
    const b = { ...base(), budgets: [bud(200, 2), { ...bud(300, 1), id: 'cat-market|2026-10', effectiveFrom: '2026-10' }] };
    const r = mergeDatasets(a, b).dataset.budgets;
    expect(r.map((x) => [x.id, x.amountKurus])).toEqual([
      ['cat-market|2026-09', 200],
      ['cat-market|2026-10', 300],
    ]);
  });

  it('revives a deleted category still used by a transaction from the other device', () => {
    const custom: Category = { id: 'c-x', name: 'Kedi', type: 'expense', color: '#000', emoji: '🐾', archived: false, order: 30, isDefault: false, updatedAt: 1 };
    const phone = { ...base(), tombstones: [{ key: 'categories:c-x', table: 'categories' as const, id: 'c-x', deletedAt: 10 }] };
    const mac = { ...base(), categories: [...DEFAULT_CATEGORIES, custom], transactions: [tx('t', 20, { categoryId: 'c-x' })] };
    const r = mergeDatasets(phone, mac).dataset;
    expect(r.categories.some((c) => c.id === 'c-x')).toBe(true);
    expect(r.tombstones).toEqual([]);
  });

  it('revives a deleted asset that still has trades', () => {
    const asset = { id: 'a1', name: 'USD', kind: 'fx' as const, symbol: 'USD', priceSource: 'auto' as const, archived: false, createdAt: 1, updatedAt: 1 };
    const trade = { id: 'tr', assetId: 'a1', side: 'buy' as const, quantity: 1, unitPriceKurus: 1, feeKurus: 0, date: '2026-09-01', createdAt: 50, updatedAt: 50 };
    const phone = { ...base(), tombstones: [tomb('assets', 'a1', 10), tomb('trades', 'old', 10)] };
    const mac = { ...base(), assets: [asset], trades: [trade] };
    const r = mergeDatasets(phone, mac).dataset;
    expect(r.assets.map((a) => a.id)).toEqual(['a1']);
    expect(r.tombstones.map((t) => t.key)).toEqual(['trades:old']);
  });

  it('is idempotent and commutative', () => {
    const a: Dataset = {
      ...base(),
      transactions: [tx('a', 1), tx('shared', 5, { amountKurus: 5 })],
      tombstones: [tomb('transactions', 'z', 3)],
    };
    const b: Dataset = {
      ...base(),
      transactions: [tx('b', 2), tx('shared', 7, { amountKurus: 7 }), tx('z', 1)],
      tombstones: [tomb('transactions', 'gone', 3)],
    };
    const ab = mergeDatasets(a, b).dataset;
    const ba = mergeDatasets(b, a).dataset;
    expect(stableStringify(ab)).toBe(stableStringify(ba));
    const again = mergeDatasets(ab, ab);
    expect(again.dataset).toEqual(ab);
    expect(again.stats).toEqual({ added: 0, updated: 0, deleted: 0 });
    // Birleşmiş veriyi tekrar karşı tarafla birleştirmek değişiklik yaratmaz.
    expect(mergeDatasets(ab, b).dataset).toEqual(ab);
  });

  it('stableStringify ignores key order and undefined', () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe(stableStringify({ a: [1, { d: 2 }], b: 1 }));
  });
});
