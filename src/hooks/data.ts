import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import { addMonths } from '../domain/month';
import { compareTr } from '../domain/text';
import { sortAccounts } from '../domain/accounts';
import type { Account, Asset, Budget, Category, MonthKey, PriceQuote, RecurringRule, Trade, Transaction, Transfer } from '../domain/types';

const EMPTY: never[] = [];

export function useCategories(): Category[] | undefined {
  return useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
}

export function useCategoryMap(): Map<string, Category> {
  const cats = useCategories();
  return useMemo(() => new Map((cats ?? EMPTY).map((c) => [c.id, c])), [cats]);
}

export function useMonthTransactions(month: MonthKey): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.where('month').equals(month).toArray(), [month]);
}

/** `endMonth` dahil son `n` ayın işlemleri (trend ve karşılaştırma için). */
export function useTransactionsLastMonths(endMonth: MonthKey, n: number): Transaction[] | undefined {
  return useLiveQuery(
    () => db.transactions.where('month').between(addMonths(endMonth, -(n - 1)), endMonth, true, true).toArray(),
    [endMonth, n],
  );
}

export function useBudgets(): Budget[] | undefined {
  return useLiveQuery(() => db.budgets.toArray(), []);
}

export function useRecurring(): RecurringRule[] | undefined {
  return useLiveQuery(async () => (await db.recurring.toArray()).sort((a, b) => a.dayOfMonth - b.dayOfMonth || compareTr(a.description, b.description)), []);
}

export function useAssets(): Asset[] | undefined {
  return useLiveQuery(async () => (await db.assets.toArray()).sort((a, b) => a.createdAt - b.createdAt), []);
}

export function useTrades(assetId?: string): Trade[] | undefined {
  return useLiveQuery(() => (assetId ? db.trades.where('assetId').equals(assetId).toArray() : db.trades.toArray()), [assetId]);
}

export function usePriceMap(): Map<string, PriceQuote> {
  const rows = useLiveQuery(() => db.prices.toArray(), []);
  return useMemo(() => new Map((rows ?? EMPTY).map((p) => [p.symbol, p])), [rows]);
}

export function useMeta<T>(key: string): T | undefined {
  return useLiveQuery(async () => (await db.meta.get(key))?.value as T | undefined, [key]);
}

/** Varlığın geçerli fiyatı: elle girilmişse o, değilse önbellekteki canlı fiyat. */
export function priceOf(asset: Asset, prices: Map<string, PriceQuote>): number | null {
  if (asset.priceSource === 'manual') return asset.manualPriceKurus ?? null;
  return prices.get(asset.symbol)?.priceKurus ?? null;
}

export function useAccounts(): Account[] | undefined {
  return useLiveQuery(async () => sortAccounts(await db.accounts.toArray()), []);
}

export function useAccountMap(): Map<string, Account> {
  const list = useAccounts();
  return useMemo(() => new Map((list ?? EMPTY).map((a) => [a.id, a])), [list]);
}

export function useTransfers(): Transfer[] | undefined {
  return useLiveQuery(() => db.transfers.toArray(), []);
}

/** Bakiye hesabı için tüm işlemler (hesabı olanlar). */
export function useAccountTransactions(): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.where('accountId').above('').toArray(), []);
}
