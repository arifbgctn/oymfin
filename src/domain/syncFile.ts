import { isCurrencyCode, type CurrencySetting } from './currency';
import { isDateKey, isMonthKey, toMonthKey } from './month';
import { SYNC_TABLES, type Dataset, type SyncTable, type Tombstone } from './types';

export const APP_ID = 'oymfin';
export const SCHEMA_VERSION = 2;
export const SYNC_FILE_NAME = 'oymfin-senkron.json';

export interface SyncFile extends Dataset {
  app: typeof APP_ID;
  schemaVersion: number;
  deviceName: string;
  exportedAt: number;
  /** Eski sürümlerin dosyalarında yok; eski sürümler bu alanı yok sayar. */
  settings?: { currency: CurrencySetting };
}

export function buildSyncFile(ds: Dataset, deviceName: string, now: number, currency?: CurrencySetting): SyncFile {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    deviceName,
    exportedAt: now,
    ...(currency ? { settings: { currency } } : {}),
    categories: ds.categories,
    transactions: ds.transactions,
    budgets: ds.budgets,
    recurring: ds.recurring,
    assets: ds.assets,
    trades: ds.trades,
    accounts: ds.accounts,
    transfers: ds.transfers,
    tombstones: ds.tombstones,
  };
}

export type ParseResult =
  | { ok: true; dataset: Dataset; deviceName: string; exportedAt: number; currency?: CurrencySetting }
  | { ok: false; error: string };

type Rec = Record<string, unknown>;
const isObj = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown) => typeof x === 'string';
const nonEmpty = (x: unknown) => typeof x === 'string' && x.trim().length > 0;
const ts = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const bool = (x: unknown) => typeof x === 'boolean';
const intMin = (min: number) => (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= min;
const optional = (f: (x: unknown) => boolean) => (x: unknown) => x === undefined || f(x);
const oneOf = (...vals: string[]) => (x: unknown) => typeof x === 'string' && vals.includes(x);
const int = (x: unknown) => typeof x === 'number' && Number.isInteger(x);
const posNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0;

const SCHEMAS: Record<SyncTable, Record<string, (x: unknown) => boolean>> = {
  categories: {
    id: nonEmpty, name: nonEmpty, type: oneOf('income', 'expense'), color: str, emoji: str,
    archived: bool, order: ts, isDefault: bool, updatedAt: ts,
  },
  transactions: {
    id: nonEmpty, type: oneOf('income', 'expense'), amountKurus: intMin(1), categoryId: nonEmpty,
    description: str, note: optional(str), date: isDateKey, recurringId: optional(nonEmpty), accountId: optional(nonEmpty),
    createdAt: ts, updatedAt: ts,
  },
  budgets: { id: nonEmpty, categoryId: nonEmpty, effectiveFrom: isMonthKey, amountKurus: intMin(0), updatedAt: ts },
  recurring: {
    id: nonEmpty, type: oneOf('income', 'expense'), amountKurus: intMin(1), categoryId: nonEmpty, description: str,
    dayOfMonth: (x) => intMin(1)(x) && (x as number) <= 31, startMonth: isMonthKey, endMonth: optional(isMonthKey),
    active: bool, accountId: optional(nonEmpty), lastGeneratedMonth: optional(isMonthKey), createdAt: ts, updatedAt: ts,
  },
  assets: {
    id: nonEmpty, name: nonEmpty,
    kind: oneOf('gold', 'silver', 'fx', 'crypto', 'stock', 'fund', 'deposit', 'other'),
    symbol: str, priceSource: oneOf('auto', 'manual'), manualPriceKurus: optional(intMin(0)),
    manualPriceAt: optional(ts), archived: bool, createdAt: ts, updatedAt: ts,
  },
  trades: {
    id: nonEmpty, assetId: nonEmpty, side: oneOf('buy', 'sell'), quantity: posNum, unitPriceKurus: intMin(0),
    feeKurus: intMin(0), date: isDateKey, note: optional(str), createdAt: ts, updatedAt: ts,
  },
  accounts: {
    id: nonEmpty, name: nonEmpty, type: oneOf('cash', 'bank', 'credit'), openingKurus: int, openingDate: isDateKey,
    creditLimitKurus: optional(intMin(0)), isDefault: bool, archived: bool, order: ts, createdAt: ts, updatedAt: ts,
  },
  transfers: {
    id: nonEmpty, fromAccountId: nonEmpty, toAccountId: nonEmpty, amountKurus: intMin(1), date: isDateKey,
    note: optional(str), createdAt: ts, updatedAt: ts,
  },
};

const TABLE_LABELS: Record<SyncTable, string> = {
  categories: 'kategori',
  transactions: 'işlem',
  budgets: 'bütçe',
  recurring: 'düzenli işlem',
  assets: 'varlık',
  trades: 'alım/satım',
  accounts: 'hesap',
  transfers: 'aktarım',
};

function checkTable(table: SyncTable, list: unknown): string | null {
  if (!Array.isArray(list)) return `Dosyada ${TABLE_LABELS[table]} listesi yok`;
  const schema = SCHEMAS[table];
  const ids = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!isObj(r)) return `Geçersiz ${TABLE_LABELS[table]} kaydı (#${i + 1})`;
    for (const [field, check] of Object.entries(schema)) {
      if (!check(r[field])) return `Geçersiz ${TABLE_LABELS[table]} kaydı (#${i + 1}, alan: ${field})`;
    }
    const id = r.id as string;
    if (ids.has(id)) return `Aynı ${TABLE_LABELS[table]} iki kez var (#${i + 1})`;
    ids.add(id);
  }
  return null;
}

export function parseSyncFile(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Dosya okunamadı: geçerli bir JSON değil' };
  }
  if (!isObj(json) || json.app !== APP_ID) return { ok: false, error: 'Bu dosya bir oymfin senkron dosyası değil' };
  if (typeof json.schemaVersion !== 'number' || json.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'Bu dosya daha yeni bir oymfin sürümünden. Önce uygulamayı güncelleyin.' };
  }
  // Sürüm 1 dosyalarında hesap tabloları yoktu.
  if (json.schemaVersion < 2) {
    json.accounts ??= [];
    json.transfers ??= [];
  }
  for (const t of SYNC_TABLES) {
    const err = checkTable(t, json[t]);
    if (err) return { ok: false, error: err };
  }
  if (!Array.isArray(json.tombstones)) return { ok: false, error: 'Dosyada silme kayıtları listesi yok' };
  for (const tb of json.tombstones) {
    if (!isObj(tb) || !oneOf(...SYNC_TABLES)(tb.table) || !nonEmpty(tb.id) || !ts(tb.deletedAt) || tb.key !== `${tb.table}:${tb.id}`) {
      return { ok: false, error: 'Geçersiz silme kaydı' };
    }
  }
  const ds = json as unknown as Dataset;
  const catIds = new Set(ds.categories.map((c) => c.id));
  const assetIds = new Set(ds.assets.map((a) => a.id));
  if (ds.transactions.some((t) => !catIds.has(t.categoryId))) return { ok: false, error: 'Bir işlemin kategorisi dosyada yok' };
  if (ds.recurring.some((r) => !catIds.has(r.categoryId))) return { ok: false, error: 'Bir düzenli işlemin kategorisi dosyada yok' };
  if (ds.budgets.some((b) => !catIds.has(b.categoryId))) return { ok: false, error: 'Bir bütçenin kategorisi dosyada yok' };
  if (ds.trades.some((t) => !assetIds.has(t.assetId))) return { ok: false, error: 'Bir alım/satımın varlığı dosyada yok' };
  const accIds = new Set(ds.accounts.map((a) => a.id));
  const badAcc = (id?: string) => id !== undefined && !accIds.has(id);
  if (ds.transactions.some((t) => badAcc(t.accountId)) || ds.recurring.some((r) => badAcc(r.accountId))) {
    return { ok: false, error: 'Bir işlemin hesabı dosyada yok' };
  }
  if (ds.transfers.some((t) => badAcc(t.fromAccountId) || badAcc(t.toAccountId))) return { ok: false, error: 'Bir aktarımın hesabı dosyada yok' };

  const dataset: Dataset = {
    categories: ds.categories,
    // Ay alanı her zaman tarihten türetilir.
    transactions: ds.transactions.map((t) => ({ ...t, month: toMonthKey(t.date) })),
    budgets: ds.budgets,
    recurring: ds.recurring,
    assets: ds.assets,
    trades: ds.trades,
    accounts: ds.accounts,
    transfers: ds.transfers,
    tombstones: ds.tombstones as Tombstone[],
  };
  return {
    ok: true,
    dataset,
    deviceName: typeof json.deviceName === 'string' ? json.deviceName : 'Bilinmeyen cihaz',
    exportedAt: ts(json.exportedAt) ? (json.exportedAt as number) : 0,
    currency: parseCurrencySetting(json.settings),
  };
}

/** Ayar bozuksa veri eşitlemesi engellenmez; ayar yok sayılır. */
function parseCurrencySetting(settings: unknown): CurrencySetting | undefined {
  const c = isObj(settings) ? settings.currency : undefined;
  if (!isObj(c) || !isCurrencyCode(c.currency) || !ts(c.updatedAt)) return undefined;
  return { currency: c.currency, updatedAt: c.updatedAt as number };
}
