import { validateTransfer } from '../domain/accounts';
import { budgetId } from '../domain/budget';
import { isDateKey, isMonthKey, toMonthKey } from '../domain/month';
import { MAX_KURUS } from '../domain/money';
import { round8, validateTradeChange, validateTradeDelete } from '../domain/portfolio';
import { foldTr, newId } from '../domain/text';
import type {
  Account,
  AccountType,
  Asset,
  AssetKind,
  Budget,
  Category,
  MonthKey,
  PriceSource,
  RecurringRule,
  SyncTable,
  Trade,
  TradeSide,
  Transaction,
  Transfer,
  TxType,
} from '../domain/types';
import { db, getMeta, setMeta } from './db';

/** Kullanıcıya gösterilebilir (Türkçe) hata. */
export class RepoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepoError';
  }
}

const now = () => Date.now();

async function markDirty(t = now()): Promise<void> {
  if ((await getMeta<number>('dirtySince')) === undefined) await setMeta('dirtySince', t);
}

async function writeTombstone(table: SyncTable, id: string, t = now()): Promise<void> {
  await db.tombstones.put({ key: `${table}:${id}`, table, id, deletedAt: t });
}

function checkAmount(k: number, allowZero = false): void {
  if (!Number.isInteger(k) || k > MAX_KURUS || (allowZero ? k < 0 : k <= 0)) throw new RepoError('Geçerli bir tutar girin');
}

async function requireCategory(id: string, type: TxType): Promise<Category> {
  const c = await db.categories.get(id);
  if (!c) throw new RepoError('Kategori seçin');
  if (c.type !== type) throw new RepoError('Kategori türü işlem türüyle uyuşmuyor');
  return c;
}

/** Hesap seçildiyse var olmalı; arşivli hesaba yeni kayıt girilemez (mevcut kaydın hesabı korunabilir). */
async function requireAccount(id: string | undefined, keepId?: string): Promise<void> {
  if (!id) return;
  const a = await db.accounts.get(id);
  if (!a) throw new RepoError('Hesap bulunamadı');
  if (a.archived && id !== keepId) throw new RepoError('Arşivlenmiş hesaba işlem girilemez');
}

// ───────────────────────── İşlemler ─────────────────────────

export interface TxInput {
  type: TxType;
  amountKurus: number;
  categoryId: string;
  description: string;
  note?: string;
  date: string;
  accountId?: string;
}

function cleanTx(input: TxInput) {
  checkAmount(input.amountKurus);
  if (!isDateKey(input.date)) throw new RepoError('Geçerli bir tarih girin');
  const note = input.note?.trim();
  return {
    type: input.type,
    amountKurus: input.amountKurus,
    categoryId: input.categoryId,
    description: input.description.trim(),
    note: note ? note : undefined,
    date: input.date,
    month: toMonthKey(input.date),
    accountId: input.accountId || undefined,
  };
}

export async function addTransaction(input: TxInput): Promise<Transaction> {
  const clean = cleanTx(input);
  return db.transaction('rw', [db.transactions, db.categories, db.accounts, db.meta], async () => {
    await requireCategory(clean.categoryId, clean.type);
    await requireAccount(clean.accountId);
    const t = now();
    const tx: Transaction = { id: newId(), ...clean, createdAt: t, updatedAt: t };
    if (!clean.accountId) delete tx.accountId;
    await db.transactions.add(tx);
    await markDirty(t);
    return tx;
  });
}

export async function updateTransaction(id: string, input: TxInput): Promise<Transaction> {
  const clean = cleanTx(input);
  return db.transaction('rw', [db.transactions, db.categories, db.accounts, db.meta], async () => {
    const existing = await db.transactions.get(id);
    if (!existing) throw new RepoError('İşlem bulunamadı');
    await requireCategory(clean.categoryId, clean.type);
    await requireAccount(clean.accountId, existing.accountId);
    const t = Math.max(now(), existing.updatedAt + 1);
    const tx: Transaction = { ...existing, ...clean, updatedAt: t };
    if (!clean.note) delete tx.note;
    if (!clean.accountId) delete tx.accountId;
    await db.transactions.put(tx);
    await markDirty(t);
    return tx;
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.tombstones, db.meta, async () => {
    const t = now();
    await db.transactions.delete(id);
    await writeTombstone('transactions', id, t);
    await markDirty(t);
  });
}

// ───────────────────────── Kategoriler ─────────────────────────

export interface CategoryInput {
  name: string;
  type: TxType;
  color: string;
  emoji: string;
}

async function assertUniqueName(name: string, type: TxType, exceptId?: string): Promise<void> {
  const key = foldTr(name.trim());
  const same = await db.categories.where('type').equals(type).toArray();
  if (same.some((c) => c.id !== exceptId && foldTr(c.name) === key)) throw new RepoError('Bu isimde bir kategori zaten var');
}

export async function isCategoryUsed(id: string): Promise<boolean> {
  const tx = await db.transactions.where('categoryId').equals(id).count();
  if (tx > 0) return true;
  return (await db.recurring.filter((r) => r.categoryId === id).count()) > 0;
}

export async function addCategory(input: CategoryInput): Promise<Category> {
  const name = input.name.trim();
  if (!name) throw new RepoError('Kategori adı girin');
  return db.transaction('rw', db.categories, db.meta, async () => {
    await assertUniqueName(name, input.type);
    const maxOrder = (await db.categories.orderBy('order').last())?.order ?? 0;
    const c: Category = {
      id: newId(),
      name,
      type: input.type,
      color: input.color,
      emoji: input.emoji || '📦',
      archived: false,
      order: maxOrder + 1,
      isDefault: false,
      updatedAt: now(),
    };
    await db.categories.add(c);
    await markDirty(c.updatedAt);
    return c;
  });
}

export async function updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'color' | 'emoji' | 'archived' | 'type'>>): Promise<Category> {
  return db.transaction('rw', db.categories, db.transactions, db.recurring, db.meta, async () => {
    const c = await db.categories.get(id);
    if (!c) throw new RepoError('Kategori bulunamadı');
    const next: Category = { ...c, ...patch, updatedAt: Math.max(now(), c.updatedAt + 1) };
    next.name = next.name.trim();
    if (!next.name) throw new RepoError('Kategori adı girin');
    if (patch.type && patch.type !== c.type && (await isCategoryUsed(id))) {
      throw new RepoError('Kullanılan bir kategorinin türü değiştirilemez');
    }
    if (next.name !== c.name || next.type !== c.type) await assertUniqueName(next.name, next.type, id);
    await db.categories.put(next);
    await markDirty(next.updatedAt);
    return next;
  });
}

export async function deleteCategory(id: string): Promise<void> {
  await db.transaction('rw', [db.categories, db.transactions, db.recurring, db.budgets, db.tombstones, db.meta], async () => {
    if (await isCategoryUsed(id)) throw new RepoError('Bu kategori kullanılıyor. Silmek yerine arşivleyebilirsiniz.');
    const t = now();
    const budgets = await db.budgets.where('categoryId').equals(id).toArray();
    for (const b of budgets) await writeTombstone('budgets', b.id, t);
    await db.budgets.bulkDelete(budgets.map((b) => b.id));
    await db.categories.delete(id);
    await writeTombstone('categories', id, t);
    await markDirty(t);
  });
}

// ───────────────────────── Bütçeler ─────────────────────────

/** Bu aydan itibaren geçerli bütçe. 0 → bu aydan itibaren bütçe yok. */
export async function setBudget(categoryId: string, month: MonthKey, amountKurus: number): Promise<Budget> {
  checkAmount(amountKurus, true);
  if (!isMonthKey(month)) throw new RepoError('Geçersiz ay');
  return db.transaction('rw', db.budgets, db.categories, db.meta, async () => {
    await requireCategory(categoryId, 'expense');
    const id = budgetId(categoryId, month);
    const prev = await db.budgets.get(id);
    const b: Budget = { id, categoryId, effectiveFrom: month, amountKurus, updatedAt: Math.max(now(), (prev?.updatedAt ?? 0) + 1) };
    await db.budgets.put(b);
    await markDirty(b.updatedAt);
    return b;
  });
}

// ───────────────────────── Düzenli işlemler ─────────────────────────

export interface RecurringInput {
  type: TxType;
  amountKurus: number;
  categoryId: string;
  description: string;
  dayOfMonth: number;
  startMonth: MonthKey;
  endMonth?: MonthKey;
  accountId?: string;
}

function cleanRecurring(input: RecurringInput) {
  checkAmount(input.amountKurus);
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31) throw new RepoError('Ayın günü 1 ile 31 arasında olmalı');
  if (!isMonthKey(input.startMonth)) throw new RepoError('Başlangıç ayı geçersiz');
  if (input.endMonth !== undefined && (!isMonthKey(input.endMonth) || input.endMonth < input.startMonth)) {
    throw new RepoError('Bitiş ayı başlangıçtan önce olamaz');
  }
  if (!input.description.trim()) throw new RepoError('Açıklama girin');
  return { ...input, description: input.description.trim(), accountId: input.accountId || undefined };
}

export async function addRecurring(input: RecurringInput): Promise<RecurringRule> {
  const clean = cleanRecurring(input);
  return db.transaction('rw', [db.recurring, db.categories, db.accounts, db.meta], async () => {
    await requireCategory(clean.categoryId, clean.type);
    await requireAccount(clean.accountId);
    const t = now();
    const r: RecurringRule = { id: newId(), ...clean, active: true, createdAt: t, updatedAt: t };
    if (r.endMonth === undefined) delete r.endMonth;
    if (r.accountId === undefined) delete r.accountId;
    await db.recurring.add(r);
    await markDirty(t);
    return r;
  });
}

/** Kural değişiklikleri yalnızca henüz üretilmemiş (gelecek) ayları etkiler. */
export async function updateRecurring(id: string, input: RecurringInput): Promise<RecurringRule> {
  const clean = cleanRecurring(input);
  return db.transaction('rw', [db.recurring, db.categories, db.accounts, db.meta], async () => {
    const r = await db.recurring.get(id);
    if (!r) throw new RepoError('Düzenli işlem bulunamadı');
    await requireCategory(clean.categoryId, clean.type);
    await requireAccount(clean.accountId, r.accountId);
    const next: RecurringRule = { ...r, ...clean, updatedAt: Math.max(now(), r.updatedAt + 1) };
    if (clean.endMonth === undefined) delete next.endMonth;
    if (clean.accountId === undefined) delete next.accountId;
    await db.recurring.put(next);
    await markDirty(next.updatedAt);
    return next;
  });
}

export async function setRecurringActive(id: string, active: boolean): Promise<void> {
  await db.transaction('rw', db.recurring, db.meta, async () => {
    const r = await db.recurring.get(id);
    if (!r) throw new RepoError('Düzenli işlem bulunamadı');
    const t = Math.max(now(), r.updatedAt + 1);
    await db.recurring.put({ ...r, active, updatedAt: t });
    await markDirty(t);
  });
}

/** Kural silinir; daha önce eklenmiş işlemler kalır. */
export async function deleteRecurring(id: string): Promise<void> {
  await db.transaction('rw', db.recurring, db.tombstones, db.meta, async () => {
    const t = now();
    await db.recurring.delete(id);
    await writeTombstone('recurring', id, t);
    await markDirty(t);
  });
}

// ───────────────────────── Yatırımlar ─────────────────────────

export interface AssetInput {
  name: string;
  kind: AssetKind;
  symbol: string;
  priceSource: PriceSource;
  manualPriceKurus?: number;
}

export async function addAsset(input: AssetInput): Promise<Asset> {
  const name = input.name.trim();
  if (!name) throw new RepoError('Varlık adı girin');
  if (input.priceSource === 'manual' && input.manualPriceKurus !== undefined) checkAmount(input.manualPriceKurus, true);
  return db.transaction('rw', db.assets, db.meta, async () => {
    const t = now();
    const a: Asset = {
      id: newId(),
      name,
      kind: input.kind,
      symbol: input.symbol,
      priceSource: input.priceSource,
      archived: false,
      createdAt: t,
      updatedAt: t,
    };
    if (input.manualPriceKurus !== undefined) {
      a.manualPriceKurus = input.manualPriceKurus;
      a.manualPriceAt = t;
    }
    await db.assets.add(a);
    await markDirty(t);
    return a;
  });
}

export async function updateAsset(id: string, patch: Partial<Pick<Asset, 'name' | 'priceSource' | 'archived'>>): Promise<Asset> {
  return db.transaction('rw', db.assets, db.meta, async () => {
    const a = await db.assets.get(id);
    if (!a) throw new RepoError('Varlık bulunamadı');
    const next: Asset = { ...a, ...patch, updatedAt: Math.max(now(), a.updatedAt + 1) };
    next.name = next.name.trim();
    if (!next.name) throw new RepoError('Varlık adı girin');
    await db.assets.put(next);
    await markDirty(next.updatedAt);
    return next;
  });
}

export async function setManualPrice(id: string, priceKurus: number): Promise<void> {
  checkAmount(priceKurus, true);
  await db.transaction('rw', db.assets, db.meta, async () => {
    const a = await db.assets.get(id);
    if (!a) throw new RepoError('Varlık bulunamadı');
    const t = Math.max(now(), a.updatedAt + 1);
    await db.assets.put({ ...a, manualPriceKurus: priceKurus, manualPriceAt: t, updatedAt: t });
    await markDirty(t);
  });
}

/** Varlık ve tüm alım/satımları silinir. */
export async function deleteAsset(id: string): Promise<void> {
  await db.transaction('rw', db.assets, db.trades, db.tombstones, db.meta, async () => {
    const t = now();
    const trades = await db.trades.where('assetId').equals(id).toArray();
    for (const tr of trades) await writeTombstone('trades', tr.id, t);
    await db.trades.bulkDelete(trades.map((tr) => tr.id));
    await db.assets.delete(id);
    await writeTombstone('assets', id, t);
    await markDirty(t);
  });
}

export interface TradeInput {
  assetId: string;
  side: TradeSide;
  quantity: number;
  unitPriceKurus: number;
  feeKurus: number;
  date: string;
  note?: string;
}

function cleanTrade(input: TradeInput) {
  if (!isDateKey(input.date)) throw new RepoError('Geçerli bir tarih girin');
  checkAmount(input.unitPriceKurus, true);
  checkAmount(input.feeKurus, true);
  const note = input.note?.trim();
  return { ...input, quantity: round8(input.quantity), note: note ? note : undefined };
}

export async function addTrade(input: TradeInput): Promise<Trade> {
  const clean = cleanTrade(input);
  return db.transaction('rw', db.trades, db.assets, db.meta, async () => {
    if (!(await db.assets.get(clean.assetId))) throw new RepoError('Varlık bulunamadı');
    const t = now();
    const trade: Trade = { id: newId(), ...clean, createdAt: t, updatedAt: t };
    if (!trade.note) delete trade.note;
    const existing = await db.trades.where('assetId').equals(clean.assetId).toArray();
    const err = validateTradeChange(existing, trade);
    if (err) throw new RepoError(err);
    await db.trades.add(trade);
    await markDirty(t);
    return trade;
  });
}

export async function updateTrade(id: string, input: TradeInput): Promise<Trade> {
  const clean = cleanTrade(input);
  return db.transaction('rw', db.trades, db.meta, async () => {
    const prev = await db.trades.get(id);
    if (!prev) throw new RepoError('İşlem bulunamadı');
    const trade: Trade = { ...prev, ...clean, assetId: prev.assetId, updatedAt: Math.max(now(), prev.updatedAt + 1) };
    if (!trade.note) delete trade.note;
    const existing = await db.trades.where('assetId').equals(prev.assetId).toArray();
    const err = validateTradeChange(existing, trade);
    if (err) throw new RepoError(err);
    await db.trades.put(trade);
    await markDirty(trade.updatedAt);
    return trade;
  });
}

export async function deleteTrade(id: string): Promise<void> {
  await db.transaction('rw', db.trades, db.tombstones, db.meta, async () => {
    const tr = await db.trades.get(id);
    if (!tr) return;
    const existing = await db.trades.where('assetId').equals(tr.assetId).toArray();
    const err = validateTradeDelete(existing, id);
    if (err) throw new RepoError(err);
    const t = now();
    await db.trades.delete(id);
    await writeTombstone('trades', id, t);
    await markDirty(t);
  });
}

// ───────────────────────── Hesaplar ─────────────────────────

export interface AccountInput {
  name: string;
  type: AccountType;
  /** Saklanan biçim: kredi kartında borç eksi (bkz. openingFromInput) */
  openingKurus: number;
  openingDate: string;
  creditLimitKurus?: number;
  isDefault?: boolean;
}

function cleanAccount(input: AccountInput) {
  const name = input.name.trim();
  if (!name) throw new RepoError('Hesap adı girin');
  if (!Number.isInteger(input.openingKurus) || Math.abs(input.openingKurus) > MAX_KURUS) throw new RepoError('Geçerli bir bakiye girin');
  if (!isDateKey(input.openingDate)) throw new RepoError('Geçerli bir bakiye tarihi girin');
  if (input.creditLimitKurus !== undefined) checkAmount(input.creditLimitKurus, true);
  return {
    name,
    type: input.type,
    openingKurus: input.openingKurus,
    openingDate: input.openingDate,
    creditLimitKurus: input.type === 'credit' && input.creditLimitKurus ? input.creditLimitKurus : undefined,
  };
}

/** Diğer hesapların varsayılan işaretini kaldırır. */
async function clearOtherDefaults(keepId: string, t: number): Promise<void> {
  const others = await db.accounts.filter((a) => a.isDefault && a.id !== keepId).toArray();
  for (const o of others) await db.accounts.put({ ...o, isDefault: false, updatedAt: Math.max(t, o.updatedAt + 1) });
}

export async function addAccount(input: AccountInput): Promise<Account> {
  const clean = cleanAccount(input);
  return db.transaction('rw', db.accounts, db.meta, async () => {
    const t = now();
    const count = await db.accounts.count();
    const maxOrder = (await db.accounts.orderBy('order').last())?.order ?? 0;
    const a: Account = {
      id: newId(),
      ...clean,
      // İlk hesap otomatik varsayılan olur.
      isDefault: input.isDefault ?? count === 0,
      archived: false,
      order: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    if (a.creditLimitKurus === undefined) delete a.creditLimitKurus;
    await db.accounts.add(a);
    if (a.isDefault) await clearOtherDefaults(a.id, t);
    await markDirty(t);
    return a;
  });
}

export async function isAccountUsed(id: string): Promise<boolean> {
  if ((await db.transactions.where('accountId').equals(id).count()) > 0) return true;
  if ((await db.transfers.where('fromAccountId').equals(id).count()) > 0) return true;
  if ((await db.transfers.where('toAccountId').equals(id).count()) > 0) return true;
  return (await db.recurring.filter((r) => r.accountId === id).count()) > 0;
}

export async function updateAccount(id: string, input: AccountInput): Promise<Account> {
  const clean = cleanAccount(input);
  return db.transaction('rw', [db.accounts, db.transactions, db.transfers, db.recurring, db.meta], async () => {
    const a = await db.accounts.get(id);
    if (!a) throw new RepoError('Hesap bulunamadı');
    if (clean.type !== a.type && (await isAccountUsed(id))) throw new RepoError('Kullanılan bir hesabın türü değiştirilemez');
    const t = Math.max(now(), a.updatedAt + 1);
    const next: Account = { ...a, ...clean, isDefault: input.isDefault ?? a.isDefault, updatedAt: t };
    if (next.creditLimitKurus === undefined) delete next.creditLimitKurus;
    await db.accounts.put(next);
    if (next.isDefault) await clearOtherDefaults(id, t);
    await markDirty(t);
    return next;
  });
}

export async function setAccountArchived(id: string, archived: boolean): Promise<void> {
  await db.transaction('rw', db.accounts, db.meta, async () => {
    const a = await db.accounts.get(id);
    if (!a) throw new RepoError('Hesap bulunamadı');
    const t = Math.max(now(), a.updatedAt + 1);
    await db.accounts.put({ ...a, archived, isDefault: archived ? false : a.isDefault, updatedAt: t });
    await markDirty(t);
  });
}

export async function deleteAccount(id: string): Promise<void> {
  await db.transaction('rw', [db.accounts, db.transactions, db.transfers, db.recurring, db.tombstones, db.meta], async () => {
    if (await isAccountUsed(id)) throw new RepoError('Bu hesapta işlem var. Silmek yerine arşivleyebilirsiniz.');
    const t = now();
    await db.accounts.delete(id);
    await writeTombstone('accounts', id, t);
    await markDirty(t);
  });
}

// ───────────────────────── Aktarımlar ─────────────────────────

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amountKurus: number;
  date: string;
  note?: string;
}

function cleanTransfer(input: TransferInput) {
  const err = validateTransfer(input.fromAccountId, input.toAccountId, input.amountKurus);
  if (err) throw new RepoError(err);
  checkAmount(input.amountKurus);
  if (!isDateKey(input.date)) throw new RepoError('Geçerli bir tarih girin');
  const note = input.note?.trim();
  return { ...input, note: note ? note : undefined };
}

export async function addTransfer(input: TransferInput): Promise<Transfer> {
  const clean = cleanTransfer(input);
  return db.transaction('rw', [db.transfers, db.accounts, db.meta], async () => {
    await requireAccount(clean.fromAccountId);
    await requireAccount(clean.toAccountId);
    const t = now();
    const tr: Transfer = { id: newId(), ...clean, createdAt: t, updatedAt: t };
    if (!tr.note) delete tr.note;
    await db.transfers.add(tr);
    await markDirty(t);
    return tr;
  });
}

export async function updateTransfer(id: string, input: TransferInput): Promise<Transfer> {
  const clean = cleanTransfer(input);
  return db.transaction('rw', [db.transfers, db.accounts, db.meta], async () => {
    const prev = await db.transfers.get(id);
    if (!prev) throw new RepoError('Aktarım bulunamadı');
    await requireAccount(clean.fromAccountId, prev.fromAccountId);
    await requireAccount(clean.toAccountId, prev.toAccountId);
    const tr: Transfer = { ...prev, ...clean, updatedAt: Math.max(now(), prev.updatedAt + 1) };
    if (!tr.note) delete tr.note;
    await db.transfers.put(tr);
    await markDirty(tr.updatedAt);
    return tr;
  });
}

export async function deleteTransfer(id: string): Promise<void> {
  await db.transaction('rw', db.transfers, db.tombstones, db.meta, async () => {
    const t = now();
    await db.transfers.delete(id);
    await writeTombstone('transfers', id, t);
    await markDirty(t);
  });
}
