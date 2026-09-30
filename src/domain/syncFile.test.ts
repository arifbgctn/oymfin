import { describe, expect, it } from 'vitest';
import { emptyDataset } from './merge';
import { DEFAULT_CATEGORIES } from './seed';
import { buildSyncFile, parseSyncFile } from './syncFile';
import type { Dataset } from './types';

function sample(): Dataset {
  return {
    ...emptyDataset(),
    categories: DEFAULT_CATEGORIES,
    transactions: [
      { id: 't1', type: 'expense', amountKurus: 123456, categoryId: 'cat-market', description: 'Market', date: '2026-09-10', month: '2026-09', createdAt: 1, updatedAt: 1 },
    ],
    budgets: [{ id: 'cat-market|2026-09', categoryId: 'cat-market', effectiveFrom: '2026-09', amountKurus: 500000, updatedAt: 1 }],
    recurring: [
      { id: 'r1', type: 'expense', amountKurus: 1000, categoryId: 'cat-kira', description: 'Kira', dayOfMonth: 31, startMonth: '2026-01', active: true, lastGeneratedMonth: '2026-09', createdAt: 1, updatedAt: 1 },
    ],
    assets: [{ id: 'a1', name: 'Gram Altın', kind: 'gold', symbol: 'XAU_GRAM', priceSource: 'auto', archived: false, createdAt: 1, updatedAt: 1 }],
    trades: [{ id: 'tr1', assetId: 'a1', side: 'buy', quantity: 10.5, unitPriceKurus: 600000, feeKurus: 0, date: '2026-09-01', createdAt: 1, updatedAt: 1 }],
    tombstones: [{ key: 'transactions:old', table: 'transactions', id: 'old', deletedAt: 5 }],
  };
}

const text = (o: unknown) => JSON.stringify(o);

describe('sync file', () => {
  it('round-trips', () => {
    const file = buildSyncFile(sample(), 'iPhone', 1234);
    const r = parseSyncFile(text(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deviceName).toBe('iPhone');
    expect(r.exportedAt).toBe(1234);
    expect(r.dataset).toEqual(sample());
  });

  it('recomputes month from date', () => {
    const file = buildSyncFile(sample(), 'Mac', 1);
    file.transactions[0]!.month = '1999-01';
    const r = parseSyncFile(text(file));
    expect(r.ok && r.dataset.transactions[0]!.month).toBe('2026-09');
  });

  const bad: [string, (f: ReturnType<typeof buildSyncFile>) => unknown, RegExp][] = [
    ['wrong app', (f) => ({ ...f, app: 'other' }), /oymfin senkron dosyası değil/],
    ['newer schema', (f) => ({ ...f, schemaVersion: 99 }), /daha yeni/],
    ['float amount', (f) => { f.transactions[0]!.amountKurus = 12.5; return f; }, /işlem kaydı.*amountKurus/],
    ['zero amount', (f) => { f.transactions[0]!.amountKurus = 0; return f; }, /amountKurus/],
    ['bad date', (f) => { f.transactions[0]!.date = '2026-02-30'; return f; }, /date/],
    ['dangling category', (f) => { f.transactions[0]!.categoryId = 'nope'; return f; }, /kategorisi dosyada yok/],
    ['dangling asset', (f) => { f.trades[0]!.assetId = 'nope'; return f; }, /varlığı dosyada yok/],
    ['duplicate id', (f) => { f.transactions.push({ ...f.transactions[0]! }); return f; }, /iki kez/],
    ['missing table', (f) => ({ ...f, trades: undefined }), /alım\/satım listesi yok/],
    ['bad tombstone', (f) => { f.tombstones[0]!.key = 'x'; return f; }, /silme kaydı/],
    ['bad recurring day', (f) => { f.recurring[0]!.dayOfMonth = 32; return f; }, /dayOfMonth/],
    ['non-object', () => [1, 2], /oymfin senkron dosyası değil/],
  ];

  it.each(bad)('rejects %s', (_name, mutate, msg) => {
    const r = parseSyncFile(text(mutate(buildSyncFile(sample(), 'x', 1))));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });

  it('rejects invalid JSON', () => {
    const r = parseSyncFile('{not json');
    expect(r).toEqual({ ok: false, error: 'Dosya okunamadı: geçerli bir JSON değil' });
  });
});
