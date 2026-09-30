import { describe, expect, it } from 'vitest';
import { resolveBudget } from '../domain/budget';
import { bootstrap, guessDeviceName, pruneTombstones, seedIfNeeded, TOMBSTONE_TTL_MS } from './bootstrap';
import { db, getMeta } from './db';
import {
  addAsset,
  addCategory,
  addRecurring,
  addTrade,
  addTransaction,
  deleteAsset,
  deleteCategory,
  deleteRecurring,
  deleteTrade,
  deleteTransaction,
  setBudget,
  setManualPrice,
  setRecurringActive,
  updateCategory,
  updateRecurring,
  updateTrade,
  updateTransaction,
} from './repo';

const expenseInput = { type: 'expense' as const, amountKurus: 123456, categoryId: 'cat-market', description: 'Market', date: '2026-09-10' };

describe('seed & bootstrap', () => {
  it('seeds default categories once', async () => {
    expect(await seedIfNeeded()).toBe(true);
    expect(await seedIfNeeded()).toBe(false);
    await bootstrap(new Date(2026, 8, 30));
    expect(await db.categories.count()).toBe(15);
    expect(await getMeta('deviceName')).toBeTruthy();
  });

  it('guesses device names', () => {
    expect(guessDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe('iPhone');
    expect(guessDeviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('Mac');
    expect(guessDeviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('iPad');
    expect(guessDeviceName('Mozilla/5.0 (Windows NT 10.0)', 0)).toBe('Bilgisayar');
  });

  it('prunes old tombstones', async () => {
    const now = Date.now();
    await db.tombstones.bulkPut([
      { key: 'transactions:old', table: 'transactions', id: 'old', deletedAt: now - TOMBSTONE_TTL_MS - 1 },
      { key: 'transactions:new', table: 'transactions', id: 'new', deletedAt: now },
    ]);
    expect(await pruneTombstones(now)).toBe(1);
    expect((await db.tombstones.toArray()).map((t) => t.id)).toEqual(['new']);
  });
});

describe('transactions', () => {
  it('adds with derived month and marks dirty', async () => {
    await seedIfNeeded();
    const t = await addTransaction(expenseInput);
    expect(t.month).toBe('2026-09');
    expect(await getMeta('dirtySince')).toBeTypeOf('number');
  });

  it('re-derives month when the date moves', async () => {
    await seedIfNeeded();
    const t = await addTransaction(expenseInput);
    const u = await updateTransaction(t.id, { ...expenseInput, date: '2026-08-31', note: '' });
    expect(u.month).toBe('2026-08');
    expect(u.updatedAt).toBeGreaterThan(t.updatedAt);
    expect(u.note).toBeUndefined();
  });

  it('validates amount, date and category type', async () => {
    await seedIfNeeded();
    await expect(addTransaction({ ...expenseInput, amountKurus: 0 })).rejects.toThrow('Geçerli bir tutar girin');
    await expect(addTransaction({ ...expenseInput, amountKurus: 1.5 })).rejects.toThrow('Geçerli bir tutar girin');
    await expect(addTransaction({ ...expenseInput, date: '2026-02-30' })).rejects.toThrow('tarih');
    await expect(addTransaction({ ...expenseInput, categoryId: 'cat-maas' })).rejects.toThrow('uyuşmuyor');
    await expect(addTransaction({ ...expenseInput, categoryId: 'nope' })).rejects.toThrow('Kategori seçin');
  });

  it('delete writes a tombstone', async () => {
    await seedIfNeeded();
    const t = await addTransaction(expenseInput);
    await deleteTransaction(t.id);
    expect(await db.transactions.get(t.id)).toBeUndefined();
    expect(await db.tombstones.get(`transactions:${t.id}`)).toMatchObject({ table: 'transactions', id: t.id });
  });
});

describe('categories', () => {
  it('rejects duplicate names of the same type (Turkish-insensitive)', async () => {
    await seedIfNeeded();
    await expect(addCategory({ name: 'MARKET', type: 'expense', color: '#000', emoji: '🛒' })).rejects.toThrow('zaten var');
    await expect(addCategory({ name: 'Yeme-icme', type: 'expense', color: '#000', emoji: '🛒' })).rejects.toThrow('zaten var');
    const c = await addCategory({ name: 'Market', type: 'income', color: '#000', emoji: '🛒' });
    expect(c.isDefault).toBe(false);
  });

  it('blocks deleting a used category but allows archiving', async () => {
    await seedIfNeeded();
    await addTransaction(expenseInput);
    await expect(deleteCategory('cat-market')).rejects.toThrow('arşivleyebilirsiniz');
    await expect(updateCategory('cat-market', { type: 'income' })).rejects.toThrow('türü değiştirilemez');
    const c = await updateCategory('cat-market', { archived: true, name: 'Süpermarket' });
    expect(c).toMatchObject({ archived: true, name: 'Süpermarket' });
  });

  it('blocks deleting a category used by a recurring rule', async () => {
    await seedIfNeeded();
    await addRecurring({ type: 'expense', amountKurus: 100, categoryId: 'cat-kira', description: 'Kira', dayOfMonth: 1, startMonth: '2026-09' });
    await expect(deleteCategory('cat-kira')).rejects.toThrow('kullanılıyor');
  });

  it('deleting a category removes its budgets with tombstones', async () => {
    await seedIfNeeded();
    await setBudget('cat-eglence', '2026-09', 10000);
    await deleteCategory('cat-eglence');
    expect(await db.budgets.count()).toBe(0);
    expect(await db.tombstones.get('budgets:cat-eglence|2026-09')).toBeTruthy();
    expect(await db.tombstones.get('categories:cat-eglence')).toBeTruthy();
  });
});

describe('budgets', () => {
  it('carries forward and can be removed from a month on', async () => {
    await seedIfNeeded();
    await setBudget('cat-market', '2026-06', 500000);
    await setBudget('cat-market', '2026-09', 0);
    const budgets = await db.budgets.toArray();
    expect(resolveBudget(budgets, 'cat-market', '2026-05')).toBeNull();
    expect(resolveBudget(budgets, 'cat-market', '2026-08')).toBe(500000);
    expect(resolveBudget(budgets, 'cat-market', '2026-09')).toBeNull();
    await expect(setBudget('cat-maas', '2026-09', 1)).rejects.toThrow();
    await expect(setBudget('cat-market', '2026-13', 1)).rejects.toThrow('Geçersiz ay');
  });
});

describe('recurring rules', () => {
  const input = { type: 'expense' as const, amountKurus: 1500000, categoryId: 'cat-kira', description: 'Kira', dayOfMonth: 31, startMonth: '2026-07' };

  it('validates input', async () => {
    await seedIfNeeded();
    await expect(addRecurring({ ...input, dayOfMonth: 32 })).rejects.toThrow('1 ile 31');
    await expect(addRecurring({ ...input, endMonth: '2026-01' })).rejects.toThrow('Bitiş');
    await expect(addRecurring({ ...input, description: ' ' })).rejects.toThrow('Açıklama');
  });

  it('updates, toggles and deletes', async () => {
    await seedIfNeeded();
    const r = await addRecurring(input);
    const u = await updateRecurring(r.id, { ...input, amountKurus: 1600000, endMonth: '2027-01' });
    expect(u).toMatchObject({ amountKurus: 1600000, endMonth: '2027-01' });
    const u2 = await updateRecurring(r.id, input);
    expect(u2.endMonth).toBeUndefined();
    await setRecurringActive(r.id, false);
    expect((await db.recurring.get(r.id))?.active).toBe(false);
    await deleteRecurring(r.id);
    expect(await db.recurring.count()).toBe(0);
    expect(await db.tombstones.get(`recurring:${r.id}`)).toBeTruthy();
  });
});

describe('investments', () => {
  it('adds assets and trades with oversell protection', async () => {
    const a = await addAsset({ name: 'Gram Altın', kind: 'gold', symbol: 'XAU_GRAM', priceSource: 'auto' });
    const buy = await addTrade({ assetId: a.id, side: 'buy', quantity: 10, unitPriceKurus: 600000, feeKurus: 0, date: '2026-09-01' });
    await expect(addTrade({ assetId: a.id, side: 'sell', quantity: 11, unitPriceKurus: 1, feeKurus: 0, date: '2026-09-02' })).rejects.toThrow('fazla satış');
    const sell = await addTrade({ assetId: a.id, side: 'sell', quantity: 4, unitPriceKurus: 650000, feeKurus: 0, date: '2026-09-02', note: ' kuyumcu ' });
    expect(sell.note).toBe('kuyumcu');
    await expect(updateTrade(buy.id, { assetId: a.id, side: 'buy', quantity: 3, unitPriceKurus: 600000, feeKurus: 0, date: '2026-09-01' })).rejects.toThrow('fazla satış');
    await expect(deleteTrade(buy.id)).rejects.toThrow('aşar');
    await deleteTrade(sell.id);
    await deleteTrade(buy.id);
    expect(await db.trades.count()).toBe(0);
    await expect(addTrade({ assetId: 'missing', side: 'buy', quantity: 1, unitPriceKurus: 1, feeKurus: 0, date: '2026-09-01' })).rejects.toThrow('bulunamadı');
  });

  it('sets manual prices and deletes asset with its trades', async () => {
    const a = await addAsset({ name: 'THYAO', kind: 'stock', symbol: '', priceSource: 'manual', manualPriceKurus: 30000 });
    expect(a.manualPriceAt).toBeTypeOf('number');
    await setManualPrice(a.id, 31000);
    expect((await db.assets.get(a.id))?.manualPriceKurus).toBe(31000);
    const t = await addTrade({ assetId: a.id, side: 'buy', quantity: 100, unitPriceKurus: 30000, feeKurus: 500, date: '2026-09-01' });
    await deleteAsset(a.id);
    expect(await db.assets.count()).toBe(0);
    expect(await db.trades.count()).toBe(0);
    expect(await db.tombstones.get(`trades:${t.id}`)).toBeTruthy();
    expect(await db.tombstones.get(`assets:${a.id}`)).toBeTruthy();
  });
});
