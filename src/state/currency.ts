import { useCallback, useSyncExternalStore } from 'react';
import { db, getMeta, setMeta } from '../db/db';
import { DEFAULT_CURRENCY, getActiveCurrency, isCurrencyCode, setActiveCurrency, type CurrencyCode, type CurrencySetting } from '../domain/currency';

export const CURRENCY_KEY = 'oymfin:currency';
/** Seçimin zamanı: eşitlemede daha yeni olan kazanır. */
export const CURRENCY_AT_KEY = 'oymfin:currencyAt';

export function getCurrencySetting(): CurrencySetting {
  try {
    const v = localStorage.getItem(CURRENCY_KEY);
    const at = Number(localStorage.getItem(CURRENCY_AT_KEY) ?? 0);
    return { currency: isCurrencyCode(v) ? v : DEFAULT_CURRENCY, updatedAt: Number.isFinite(at) && at > 0 ? at : 0 };
  } catch {
    return { currency: DEFAULT_CURRENCY, updatedAt: 0 };
  }
}

export function getCurrencyPref(): CurrencyCode {
  return getCurrencySetting().currency;
}

const listeners = new Set<() => void>();

/** Kayıtlı tercihi biçimlendiricilere uygular (uygulama açılışında). */
export function loadCurrencyPref(): void {
  setActiveCurrency(getCurrencyPref());
}

function store(s: CurrencySetting): void {
  try {
    if (s.currency === DEFAULT_CURRENCY) localStorage.removeItem(CURRENCY_KEY);
    else localStorage.setItem(CURRENCY_KEY, s.currency);
    if (s.updatedAt > 0) localStorage.setItem(CURRENCY_AT_KEY, String(s.updatedAt));
    else localStorage.removeItem(CURRENCY_AT_KEY);
  } catch {
    /* depolama kapalı olabilir */
  }
}

async function activate(code: CurrencyCode): Promise<void> {
  if (code === getActiveCurrency()) return;
  setActiveCurrency(code);
  // Önbellekteki otomatik fiyatlar eski birimde; yeni birimde yeniden çekilsin.
  await db.prices.clear();
  listeners.forEach((l) => l());
}

/** Kullanıcı seçimi: kaydedilir ve diğer cihaza gönderilmek üzere "kaydedilmemiş değişiklik" işaretlenir. */
export async function setCurrencyPref(code: CurrencyCode, now = Date.now()): Promise<void> {
  if (code === getActiveCurrency()) return;
  store({ currency: code, updatedAt: now });
  if ((await getMeta<number>('dirtySince')) === undefined) await setMeta('dirtySince', now);
  await activate(code);
}

/** Senkron dosyasından gelen ayarı uygular (zamanıyla birlikte, kirli işaretlemeden). */
export async function applyCurrencySetting(s: CurrencySetting): Promise<void> {
  store(s);
  await activate(s.currency);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function useCurrency(): [CurrencyCode, (c: CurrencyCode) => Promise<void>] {
  const code = useSyncExternalStore(subscribe, getActiveCurrency);
  const update = useCallback((c: CurrencyCode) => setCurrencyPref(c), []);
  return [code, update];
}
