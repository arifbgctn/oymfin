// Uygulamanın gösterim para birimi. Tutarlar dönüştürülmez; yalnızca simge ve fiyat kaynağının birimi değişir.

export type CurrencyCode = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF';

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  label: string;
  /** currency-api ve CoinGecko'daki küçük harfli kod */
  apiKey: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'TRY', symbol: '₺', label: 'Türk Lirası', apiKey: 'try' },
  { code: 'USD', symbol: '$', label: 'Amerikan Doları', apiKey: 'usd' },
  { code: 'EUR', symbol: '€', label: 'Euro', apiKey: 'eur' },
  { code: 'GBP', symbol: '£', label: 'İngiliz Sterlini', apiKey: 'gbp' },
  { code: 'CHF', symbol: 'CHF', label: 'İsviçre Frangı', apiKey: 'chf' },
];

export const DEFAULT_CURRENCY: CurrencyCode = 'TRY';

/** Cihazlar arasında eşitlenen para birimi ayarı; `updatedAt` büyük olan kazanır (0 = hiç seçilmedi). */
export interface CurrencySetting {
  currency: CurrencyCode;
  updatedAt: number;
}

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === 'string' && BY_CODE.has(v as CurrencyCode);
}

export function currencyInfo(code: CurrencyCode): CurrencyInfo {
  return BY_CODE.get(code) ?? BY_CODE.get(DEFAULT_CURRENCY)!;
}

let active: CurrencyCode = DEFAULT_CURRENCY;

export function getActiveCurrency(): CurrencyCode {
  return active;
}

export function setActiveCurrency(code: CurrencyCode): void {
  active = code;
}

export function activeCurrencyInfo(): CurrencyInfo {
  return currencyInfo(active);
}
