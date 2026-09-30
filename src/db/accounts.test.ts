import { describe, expect, it } from 'vitest';
import { accountBalance } from '../domain/accounts';
import { emptyDataset, mergeDatasets } from '../domain/merge';
import { buildRecurringTx, planRecurring } from '../domain/recurring';
import { DEFAULT_CATEGORIES } from '../domain/seed';
import { buildSyncFile, parseSyncFile } from '../domain/syncFile';
import type { Account } from '../domain/types';
import { seedIfNeeded } from './bootstrap';
import { db } from './db';
import {
  addAccount,
  addRecurring,
  addTransaction,
  addTransfer,
  deleteAccount,
  deleteTransfer,
  setAccountArchived,
  updateAccount,
  updateTransaction,
  updateTransfer,
} from './repo';
import { runRecurring } from './recurringRunner';

const bankInput = { name: 'Ziraat', type: 'bank' as const, openingKurus: 1000000, openingDate: '2026-09-01' };
const ccInput = { name: 'Bonus', type: 'credit' as const, openingKurus: -250000, openingDate: '2026-09-01', creditLimitKurus: 2000000 };

async function balances() {
  const [accounts, txs, transfers] = await Promise.all([db.accounts.toArray(), db.transactions.toArray(), db.transfers.toArray()]);
  return Object.fromEntries(accounts.map((a) => [a.name, accountBalance(a, txs, transfers)]));
}

describe('accounts repo', () => {
  it('first account becomes default; setting another default clears the first', async () => {
    const a = await addAccount(bankInput);
    expect(a.isDefault).toBe(true);
    const b = await addAccount({ ...ccInput, isDefault: true });
    expect(b.isDefault).toBe(true);
    expect((await db.accounts.get(a.id))?.isDefault).toBe(false);
    const c = await addAccount({ name: 'Cüzdan', type: 'cash', openingKurus: 0, openingDate: '2026-09-01' });
    expect(c.isDefault).toBe(false);
    expect(b.creditLimitKurus).toBe(2000000);
    expect(c.creditLimitKurus).toBeUndefined();
  });

  it('validates input', async () => {
    await expect(addAccount({ ...bankInput, name: ' ' })).rejects.toThrow('Hesap adı');
    await expect(addAccount({ ...bankInput, openingKurus: 1.5 })).rejects.toThrow('bakiye');
    await expect(addAccount({ ...bankInput, openingDate: '2026-02-30' })).rejects.toThrow('tarih');
  });

  it('balances follow transactions and transfers', async () => {
    await seedIfNeeded();
    const bank = await addAccount(bankInput);
    const cc = await addAccount(ccInput);
    await addTransaction({ type: 'income', amountKurus: 2500000, categoryId: 'cat-maas', description: 'Maaş', date: '2026-09-01', accountId: bank.id });
    const t = await addTransaction({ type: 'expense', amountKurus: 120000, categoryId: 'cat-market', description: 'Market', date: '2026-09-10', accountId: cc.id });
    expect(await balances()).toEqual({ Ziraat: 3500000, Bonus: -370000 });

    const tr = await addTransfer({ fromAccountId: bank.id, toAccountId: cc.id, amountKurus: 370000, date: '2026-09-20' });
    expect(await balances()).toEqual({ Ziraat: 3130000, Bonus: 0 });

    // İşlemin hesabı değişince iki bakiye de güncellenir
    await updateTransaction(t.id, { type: 'expense', amountKurus: 120000, categoryId: 'cat-market', description: 'Market', date: '2026-09-10', accountId: bank.id });
    expect(await balances()).toEqual({ Ziraat: 3010000, Bonus: 120000 });
    // Hesap kaldırılabilir
    const u = await updateTransaction(t.id, { type: 'expense', amountKurus: 120000, categoryId: 'cat-market', description: 'Market', date: '2026-09-10' });
    expect(u.accountId).toBeUndefined();

    await updateTransfer(tr.id, { fromAccountId: bank.id, toAccountId: cc.id, amountKurus: 100000, date: '2026-09-20', note: 'ekstre' });
    await deleteTransfer(tr.id);
    expect(await db.tombstones.get(`transfers:${tr.id}`)).toBeTruthy();
  });

  it('rejects invalid transfers and archived accounts for new records', async () => {
    await seedIfNeeded();
    const bank = await addAccount(bankInput);
    const cc = await addAccount(ccInput);
    await expect(addTransfer({ fromAccountId: bank.id, toAccountId: bank.id, amountKurus: 1, date: '2026-09-01' })).rejects.toThrow('Aynı hesaba');
    await expect(addTransfer({ fromAccountId: bank.id, toAccountId: 'nope', amountKurus: 1, date: '2026-09-01' })).rejects.toThrow('bulunamadı');
    const t = await addTransaction({ type: 'expense', amountKurus: 100, categoryId: 'cat-market', description: '', date: '2026-09-01', accountId: cc.id });
    await setAccountArchived(cc.id, true);
    await expect(addTransaction({ type: 'expense', amountKurus: 100, categoryId: 'cat-market', description: '', date: '2026-09-01', accountId: cc.id })).rejects.toThrow('Arşivlenmiş');
    // Mevcut kaydı arşivli hesabıyla düzenlemek serbest
    await updateTransaction(t.id, { type: 'expense', amountKurus: 200, categoryId: 'cat-market', description: '', date: '2026-09-01', accountId: cc.id });
    expect((await db.accounts.get(cc.id))?.isDefault).toBe(false);
  });

  it('blocks deleting or retyping a used account', async () => {
    await seedIfNeeded();
    const bank = await addAccount(bankInput);
    const empty = await addAccount({ ...bankInput, name: 'Boş' });
    await addTransaction({ type: 'expense', amountKurus: 100, categoryId: 'cat-market', description: '', date: '2026-09-01', accountId: bank.id });
    await expect(deleteAccount(bank.id)).rejects.toThrow('arşivleyebilirsiniz');
    await expect(updateAccount(bank.id, { ...bankInput, type: 'cash' })).rejects.toThrow('türü değiştirilemez');
    await updateAccount(bank.id, { ...bankInput, name: 'Ziraat Bankkart', openingKurus: 5 });
    expect((await db.accounts.get(bank.id))?.name).toBe('Ziraat Bankkart');
    await deleteAccount(empty.id);
    expect(await db.tombstones.get(`accounts:${empty.id}`)).toBeTruthy();
  });

  it('recurring rules carry the account to generated transactions', async () => {
    await seedIfNeeded();
    const bank = await addAccount(bankInput);
    const r = await addRecurring({ type: 'expense', amountKurus: 1500000, categoryId: 'cat-kira', description: 'Kira', dayOfMonth: 1, startMonth: '2026-09', accountId: bank.id });
    expect(r.accountId).toBe(bank.id);
    await runRecurring('2026-09');
    expect((await db.transactions.toArray())[0]?.accountId).toBe(bank.id);
    expect(buildRecurringTx({ ...r, accountId: undefined }, planRecurring(r, '2026-09')[0]!).accountId).toBeUndefined();
  });
});

describe('sync with accounts', () => {
  const account: Account = { id: 'acc', name: 'Ziraat', type: 'bank', openingKurus: 0, openingDate: '2026-09-01', isDefault: true, archived: false, order: 1, createdAt: 1, updatedAt: 1 };

  it('accepts version 1 files without account tables', () => {
    const file = { ...buildSyncFile({ ...emptyDataset(), categories: DEFAULT_CATEGORIES }, 'Mac', 1), schemaVersion: 1 } as Record<string, unknown>;
    delete file.accounts;
    delete file.transfers;
    const r = parseSyncFile(JSON.stringify(file));
    expect(r.ok && r.dataset.accounts).toEqual([]);
  });

  it('rejects dangling account references', () => {
    const ds = {
      ...emptyDataset(),
      categories: DEFAULT_CATEGORIES,
      transfers: [{ id: 't', fromAccountId: 'x', toAccountId: 'y', amountKurus: 1, date: '2026-09-01', createdAt: 1, updatedAt: 1 }],
    };
    const r = parseSyncFile(JSON.stringify(buildSyncFile(ds, 'Mac', 1)));
    expect(r).toMatchObject({ ok: false, error: 'Bir aktarımın hesabı dosyada yok' });
  });

  it('revives a deleted account still used on the other device', () => {
    const phone = { ...emptyDataset(), categories: DEFAULT_CATEGORIES, tombstones: [{ key: 'accounts:acc', table: 'accounts' as const, id: 'acc', deletedAt: 5 }] };
    const mac = {
      ...emptyDataset(),
      categories: DEFAULT_CATEGORIES,
      accounts: [account],
      transactions: [{ id: 't', type: 'expense' as const, amountKurus: 1, categoryId: 'cat-market', description: '', date: '2026-09-02', month: '2026-09', accountId: 'acc', createdAt: 9, updatedAt: 9 }],
    };
    const r = mergeDatasets(phone, mac).dataset;
    expect(r.accounts.map((a) => a.id)).toEqual(['acc']);
    expect(r.tombstones).toEqual([]);
  });
});
