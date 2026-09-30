export type TxType = 'income' | 'expense';
/** 'YYYY-MM' */
export type MonthKey = string;
/** 'YYYY-MM-DD' (yerel tarih) */
export type DateKey = string;

export interface Transaction {
  id: string;
  type: TxType;
  /** Her zaman pozitif tamsayı kuruş; işaret `type`'tan gelir. */
  amountKurus: number;
  categoryId: string;
  description: string;
  note?: string;
  date: DateKey;
  month: MonthKey;
  recurringId?: string;
  /** Ödemenin yapıldığı / paranın girdiği hesap (isteğe bağlı) */
  accountId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  type: TxType;
  color: string;
  emoji: string;
  archived: boolean;
  order: number;
  isDefault: boolean;
  updatedAt: number;
}

export interface Budget {
  /** `${categoryId}|${effectiveFrom}` */
  id: string;
  categoryId: string;
  effectiveFrom: MonthKey;
  /** 0 = bu aydan itibaren bütçe yok */
  amountKurus: number;
  updatedAt: number;
}

export interface RecurringRule {
  id: string;
  type: TxType;
  amountKurus: number;
  categoryId: string;
  description: string;
  /** 1–31; kısa aylarda ayın son gününe kısılır */
  dayOfMonth: number;
  startMonth: MonthKey;
  endMonth?: MonthKey;
  active: boolean;
  accountId?: string;
  /** Üretimin ulaştığı son ay (imleç). */
  lastGeneratedMonth?: MonthKey;
  createdAt: number;
  updatedAt: number;
}

export type AssetKind = 'gold' | 'silver' | 'fx' | 'crypto' | 'stock' | 'fund' | 'deposit' | 'other';
export type PriceSource = 'auto' | 'manual';

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  /** Otomatik fiyatlı varlıklarda katalog sembolü (örn. XAU_GRAM, USD, BTC). */
  symbol: string;
  priceSource: PriceSource;
  manualPriceKurus?: number;
  manualPriceAt?: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export type TradeSide = 'buy' | 'sell';

export interface Trade {
  id: string;
  assetId: string;
  side: TradeSide;
  /** En fazla 8 ondalık */
  quantity: number;
  unitPriceKurus: number;
  feeKurus: number;
  date: DateKey;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PriceQuote {
  symbol: string;
  priceKurus: number;
  fetchedAt: number;
  source: string;
}

export type AccountType = 'cash' | 'bank' | 'credit';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /**
   * Bakiye tarihindeki bakiye (işaretli kuruş). Nakit/banka: eldeki para.
   * Kredi kartı: borç eksi olarak saklanır (2.500 ₺ borç → -250000).
   */
  openingKurus: number;
  /** Bu tarihten (dahil) itibaren girilen işlemler bakiyeyi değiştirir. */
  openingDate: DateKey;
  /** Yalnızca kredi kartı */
  creditLimitKurus?: number;
  isDefault: boolean;
  archived: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** Hesaplar arası para aktarımı (ör. bankadan kredi kartı borcu ödeme). Gelir/gider sayılmaz. */
export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amountKurus: number;
  date: DateKey;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export const SYNC_TABLES = ['categories', 'transactions', 'budgets', 'recurring', 'assets', 'trades', 'accounts', 'transfers'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export interface Tombstone {
  /** `${table}:${id}` */
  key: string;
  table: SyncTable;
  id: string;
  deletedAt: number;
}

export interface SyncRecords {
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurring: RecurringRule[];
  assets: Asset[];
  trades: Trade[];
  accounts: Account[];
  transfers: Transfer[];
}

export interface Dataset extends SyncRecords {
  tombstones: Tombstone[];
}
