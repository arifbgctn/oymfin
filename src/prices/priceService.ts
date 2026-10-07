import { db } from '../db/db';
import { currencyInfo, getActiveCurrency, type CurrencyCode } from '../domain/currency';
import {
  AUTO_SYMBOL_MAP,
  COINGECKO_URL,
  currencyApiUrls,
  isFresh,
  parseCoinGecko,
  parseCurrencyApi,
  type AutoSymbol,
} from '../domain/prices';
import type { PriceQuote } from '../domain/types';

export type RefreshStatus = 'idle' | 'fresh' | 'updated' | 'partial' | 'failed';

export interface RefreshOptions {
  force?: boolean;
  fetchImpl?: typeof fetch;
  now?: number;
  timeoutMs?: number;
  /** Fiyatların birimi; verilmezse ayarlardaki para birimi */
  currency?: CurrencyCode;
}

async function fetchJson(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Kimlik bilgisi ve referrer gönderilmez: istek yalnızca genel fiyat listesini ister.
    const res = await fetchImpl(url, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Otomatik fiyatlı sembollerin fiyatlarını çeker ve `prices` tablosuna yazar.
 * Kripto için önce CoinGecko, olmazsa currency-api; diğerleri currency-api (yedek adresli).
 * Hata olursa önbellekteki son fiyatlar kalır.
 */
export async function refreshPrices(symbols: string[], opts: RefreshOptions = {}): Promise<RefreshStatus> {
  const { force = false, fetchImpl = fetch, now = Date.now(), timeoutMs = 8000 } = opts;
  const currency = opts.currency ?? getActiveCurrency();
  const base = currencyInfo(currency).apiKey;
  const wanted = [...new Set(symbols)].map((s) => AUTO_SYMBOL_MAP.get(s)).filter((s): s is AutoSymbol => !!s);
  if (wanted.length === 0) return 'idle';

  if (!force) {
    const cached = await db.prices.bulkGet(wanted.map((s) => s.symbol));
    if (cached.every((c) => c && isFresh(c.fetchedAt, now))) return 'fresh';
  }

  const found = new Map<string, PriceQuote>();
  const crypto = wanted.filter((s) => s.coingeckoId);
  if (crypto.length) {
    try {
      const ids = crypto.map((s) => s.coingeckoId).join(',');
      const json = await fetchJson(`${COINGECKO_URL}?ids=${ids}&vs_currencies=${base}`, fetchImpl, timeoutMs);
      for (const [symbol, priceKurus] of parseCoinGecko(json, crypto, base)) found.set(symbol, { symbol, priceKurus, fetchedAt: now, source: 'CoinGecko' });
    } catch {
      /* currency-api'ye düşülür */
    }
  }

  const rest = wanted.filter((s) => !found.has(s.symbol));
  if (rest.length) {
    for (const url of currencyApiUrls(base)) {
      try {
        const json = await fetchJson(url, fetchImpl, timeoutMs);
        const parsed = parseCurrencyApi(json, rest, base);
        if (parsed.size === 0) continue;
        for (const [symbol, priceKurus] of parsed) found.set(symbol, { symbol, priceKurus, fetchedAt: now, source: 'currency-api' });
        break;
      } catch {
        /* yedek adres denenir */
      }
    }
  }

  // İstek sürerken para birimi değiştiyse eski birimdeki fiyatlar yazılmaz.
  if (opts.currency === undefined && getActiveCurrency() !== currency) return 'failed';
  if (found.size) await db.prices.bulkPut([...found.values()]);
  if (found.size === wanted.length) return 'updated';
  return found.size > 0 ? 'partial' : 'failed';
}
