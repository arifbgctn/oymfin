import { describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { COINGECKO_URL, CURRENCY_API_URLS, PRICE_MAX_AGE_MS } from '../domain/prices';
import { refreshPrices } from './priceService';

const CURRENCY = { date: '2026-09-29', try: { usd: 0.020410053, xau: 4.9429781e-6, btc: 2.4527587e-7 } };
const GECKO = { bitcoin: { try: 4110163 } };

type Route = (url: string) => unknown | Error;

function mockFetch(route: Route) {
  return vi.fn(async (url: string) => {
    const body = route(url);
    if (body instanceof Error) throw body;
    if (body === 404) return new Response('nope', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const ok: Route = (url) => (url.startsWith(COINGECKO_URL) ? GECKO : CURRENCY);

describe('refreshPrices', () => {
  it('does nothing without auto symbols', async () => {
    const f = mockFetch(ok);
    expect(await refreshPrices(['', 'THYAO'], { fetchImpl: f })).toBe('idle');
    expect(f).not.toHaveBeenCalled();
  });

  it('fetches, stores and then serves from cache', async () => {
    const f = mockFetch(ok);
    expect(await refreshPrices(['USD', 'XAU_GRAM', 'BTC'], { fetchImpl: f, now: 1000 })).toBe('updated');
    expect(await db.prices.get('USD')).toMatchObject({ priceKurus: 4900, source: 'currency-api', fetchedAt: 1000 });
    expect(await db.prices.get('BTC')).toMatchObject({ priceKurus: 411016300, source: 'CoinGecko' });
    expect(f).toHaveBeenCalledTimes(2);
    const [, init] = f.mock.calls[0]!;
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });

    expect(await refreshPrices(['USD', 'BTC'], { fetchImpl: f, now: 1000 + PRICE_MAX_AGE_MS - 1 })).toBe('fresh');
    expect(f).toHaveBeenCalledTimes(2);
    expect(await refreshPrices(['USD'], { fetchImpl: f, now: 1000 + PRICE_MAX_AGE_MS })).toBe('updated');
    expect(await refreshPrices(['USD'], { fetchImpl: f, now: 1001, force: true })).toBe('updated');
  });

  it('falls back to currency-api for crypto when CoinGecko fails', async () => {
    const f = mockFetch((url) => (url.startsWith(COINGECKO_URL) ? new Error('rate limited') : CURRENCY));
    expect(await refreshPrices(['BTC'], { fetchImpl: f })).toBe('updated');
    expect(await db.prices.get('BTC')).toMatchObject({ source: 'currency-api', priceKurus: Math.round(100 / 2.4527587e-7) });
  });

  it('uses the backup currency URL when the primary fails', async () => {
    const f = mockFetch((url) => (url === CURRENCY_API_URLS[0] ? 404 : CURRENCY));
    expect(await refreshPrices(['USD'], { fetchImpl: f })).toBe('updated');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('keeps cached prices on failure', async () => {
    await db.prices.put({ symbol: 'USD', priceKurus: 4800, fetchedAt: 1, source: 'currency-api' });
    const f = mockFetch(() => new Error('offline'));
    expect(await refreshPrices(['USD'], { fetchImpl: f, now: 10 ** 12 })).toBe('failed');
    expect((await db.prices.get('USD'))?.priceKurus).toBe(4800);
  });

  it('reports partial results', async () => {
    const f = mockFetch((url) => (url.startsWith(COINGECKO_URL) ? {} : { try: { usd: 0.02 } }));
    expect(await refreshPrices(['USD', 'ETH'], { fetchImpl: f })).toBe('partial');
  });

  it('times out slow requests', async () => {
    const f = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted')))),
    ) as unknown as typeof fetch;
    expect(await refreshPrices(['USD'], { fetchImpl: f, timeoutMs: 10 })).toBe('failed');
  });
});
