import Dexie, { type Table } from 'dexie';
import type { Account, Asset, Budget, Category, PriceQuote, RecurringRule, Tombstone, Trade, Transaction, Transfer } from '../domain/types';

export interface MetaRow {
  key: string;
  value: unknown;
}

export class OymfinDB extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  budgets!: Table<Budget, string>;
  recurring!: Table<RecurringRule, string>;
  assets!: Table<Asset, string>;
  trades!: Table<Trade, string>;
  accounts!: Table<Account, string>;
  transfers!: Table<Transfer, string>;
  prices!: Table<PriceQuote, string>;
  tombstones!: Table<Tombstone, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'oymfin') {
    super(name);
    this.version(1).stores({
      transactions: 'id, month, date, type, categoryId, recurringId',
      categories: 'id, type, order',
      budgets: 'id, categoryId, effectiveFrom',
      recurring: 'id',
      assets: 'id, kind',
      trades: 'id, assetId, date',
      prices: 'symbol',
      tombstones: 'key, table, deletedAt',
      meta: 'key',
    });
    // v2: hesaplar (nakit / banka / kredi kartı) ve hesaplar arası aktarımlar
    this.version(2).stores({
      transactions: 'id, month, date, type, categoryId, recurringId, accountId',
      accounts: 'id, type, order',
      transfers: 'id, date, fromAccountId, toAccountId',
    });
  }
}

export const db = new OymfinDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Testler ve "tüm verileri sil" için. */
export async function clearAllTables(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
