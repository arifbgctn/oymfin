import type { AssetKind } from './types';

export const TROY_OUNCE_GRAMS = 31.1034768;
export const PRICE_MAX_AGE_MS = 15 * 60 * 1000;

export const CURRENCY_API_URLS = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/try.json',
  'https://latest.currency-api.pages.dev/v1/currencies/try.json',
];
export const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';
export const PRICE_HOSTS = ['cdn.jsdelivr.net', 'latest.currency-api.pages.dev', 'api.coingecko.com'];

export interface AutoSymbol {
  symbol: string;
  kind: AssetKind;
  label: string;
  unit: string;
  /** currency-api anahtarı (1 TRY = rates[key] birim) */
  currencyApiKey: string;
  /** Birim başına bölen (ons → gram için 31,10…) */
  divisor?: number;
  coingeckoId?: string;
}

export const AUTO_SYMBOLS: AutoSymbol[] = [
  { symbol: 'XAU_GRAM', kind: 'gold', label: 'Gram Altın (24 ayar)', unit: 'gr', currencyApiKey: 'xau', divisor: TROY_OUNCE_GRAMS },
  { symbol: 'XAU_ONS', kind: 'gold', label: 'Ons Altın', unit: 'ons', currencyApiKey: 'xau' },
  { symbol: 'XAG_GRAM', kind: 'silver', label: 'Gram Gümüş', unit: 'gr', currencyApiKey: 'xag', divisor: TROY_OUNCE_GRAMS },
  { symbol: 'USD', kind: 'fx', label: 'Amerikan Doları', unit: '$', currencyApiKey: 'usd' },
  { symbol: 'EUR', kind: 'fx', label: 'Euro', unit: '€', currencyApiKey: 'eur' },
  { symbol: 'GBP', kind: 'fx', label: 'İngiliz Sterlini', unit: '£', currencyApiKey: 'gbp' },
  { symbol: 'CHF', kind: 'fx', label: 'İsviçre Frangı', unit: 'CHF', currencyApiKey: 'chf' },
  { symbol: 'BTC', kind: 'crypto', label: 'Bitcoin', unit: 'BTC', currencyApiKey: 'btc', coingeckoId: 'bitcoin' },
  { symbol: 'ETH', kind: 'crypto', label: 'Ethereum', unit: 'ETH', currencyApiKey: 'eth', coingeckoId: 'ethereum' },
  { symbol: 'USDT', kind: 'crypto', label: 'Tether', unit: 'USDT', currencyApiKey: 'usdt', coingeckoId: 'tether' },
  { symbol: 'SOL', kind: 'crypto', label: 'Solana', unit: 'SOL', currencyApiKey: 'sol', coingeckoId: 'solana' },
  { symbol: 'BNB', kind: 'crypto', label: 'BNB', unit: 'BNB', currencyApiKey: 'bnb', coingeckoId: 'binancecoin' },
  { symbol: 'XRP', kind: 'crypto', label: 'XRP', unit: 'XRP', currencyApiKey: 'xrp', coingeckoId: 'ripple' },
  { symbol: 'DOGE', kind: 'crypto', label: 'Dogecoin', unit: 'DOGE', currencyApiKey: 'doge', coingeckoId: 'dogecoin' },
  { symbol: 'ADA', kind: 'crypto', label: 'Cardano', unit: 'ADA', currencyApiKey: 'ada', coingeckoId: 'cardano' },
];

export const AUTO_SYMBOL_MAP = new Map(AUTO_SYMBOLS.map((s) => [s.symbol, s]));

export const KIND_LABELS: Record<AssetKind, string> = {
  gold: 'Altın',
  silver: 'Gümüş',
  fx: 'Döviz',
  crypto: 'Kripto',
  stock: 'Hisse',
  fund: 'Fon',
  deposit: 'Mevduat',
  other: 'Diğer',
};

export const KIND_EMOJI: Record<AssetKind, string> = {
  gold: '🥇',
  silver: '🥈',
  fx: '💵',
  crypto: '₿',
  stock: '📊',
  fund: '🧺',
  deposit: '🏦',
  other: '💎',
};

export const KIND_COLORS: Record<AssetKind, string> = {
  gold: '#eda100',
  silver: '#64748b',
  fx: '#008300',
  crypto: '#eb6834',
  stock: '#2a78d6',
  fund: '#4a3aa7',
  deposit: '#1baf7a',
  other: '#e87ba4',
};

/** Otomatik fiyat desteklenen türler */
export function kindSupportsAuto(kind: AssetKind): boolean {
  return AUTO_SYMBOLS.some((s) => s.kind === kind);
}

const validRate = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;

/** currency-api yanıtı → sembol başına kuruş fiyat. */
export function parseCurrencyApi(json: unknown, symbols: AutoSymbol[] = AUTO_SYMBOLS): Map<string, number> {
  const out = new Map<string, number>();
  const rates = (json as { try?: Record<string, unknown> } | null)?.try;
  if (!rates || typeof rates !== 'object') return out;
  for (const s of symbols) {
    const r = rates[s.currencyApiKey];
    if (!validRate(r)) continue;
    const kurus = Math.round(100 / r / (s.divisor ?? 1));
    if (kurus > 0) out.set(s.symbol, kurus);
  }
  return out;
}

/** CoinGecko simple/price yanıtı → sembol başına kuruş fiyat. */
export function parseCoinGecko(json: unknown, symbols: AutoSymbol[] = AUTO_SYMBOLS): Map<string, number> {
  const out = new Map<string, number>();
  if (!json || typeof json !== 'object') return out;
  const data = json as Record<string, { try?: unknown } | undefined>;
  for (const s of symbols) {
    if (!s.coingeckoId) continue;
    const p = data[s.coingeckoId]?.try;
    if (!validRate(p)) continue;
    out.set(s.symbol, Math.round(p * 100));
  }
  return out;
}

export function isFresh(fetchedAt: number | undefined, now: number, maxAge = PRICE_MAX_AGE_MS): boolean {
  return fetchedAt !== undefined && now - fetchedAt < maxAge;
}
