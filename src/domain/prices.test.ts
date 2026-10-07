import { describe, expect, it } from 'vitest';
import { AUTO_SYMBOL_MAP, isFresh, kindSupportsAuto, parseCoinGecko, parseCurrencyApi, PRICE_MAX_AGE_MS, TROY_OUNCE_GRAMS } from './prices';

// Gerçek yanıttan kısaltılmış örnek (2026-09-29)
const CURRENCY_SAMPLE = {
  date: '2026-09-29',
  try: { usd: 0.020410053, eur: 0.017965457, gbp: 0.01541752, xau: 4.9429781e-6, xag: 0.00033670247, btc: 2.4527587e-7, eth: 'x', chf: 0 },
};

describe('parseCurrencyApi', () => {
  const m = parseCurrencyApi(CURRENCY_SAMPLE);

  it('converts FX rates to kuruş per unit', () => {
    expect(m.get('USD')).toBe(Math.round(100 / 0.020410053));
    expect(m.get('USD')).toBe(4900);
    expect(m.get('EUR')).toBe(5566);
  });

  it('converts gold/silver ounce rates to gram prices', () => {
    expect(m.get('XAU_ONS')).toBe(Math.round(100 / 4.9429781e-6));
    expect(m.get('XAU_GRAM')).toBe(Math.round(100 / 4.9429781e-6 / TROY_OUNCE_GRAMS));
    expect(m.get('XAU_GRAM')).toBeGreaterThan(640000);
    expect(m.get('XAU_GRAM')).toBeLessThan(660000);
    expect(m.get('XAG_GRAM')).toBe(Math.round(100 / 0.00033670247 / TROY_OUNCE_GRAMS));
  });

  it('includes crypto fallback and skips invalid rates', () => {
    expect(m.get('BTC')).toBe(Math.round(100 / 2.4527587e-7));
    expect(m.has('ETH')).toBe(false);
    expect(m.has('CHF')).toBe(false);
  });

  it('tolerates junk', () => {
    expect(parseCurrencyApi(null).size).toBe(0);
    expect(parseCurrencyApi({ foo: 1 }).size).toBe(0);
    expect(parseCurrencyApi({ try: 'nope' }).size).toBe(0);
  });

  it('reads rates for another base currency', () => {
    const m = parseCurrencyApi({ eur: { usd: 1.25, xau: 0.0005 }, try: { usd: 0.02 } }, undefined, 'eur');
    expect(m.get('USD')).toBe(80);
    expect(m.get('XAU_ONS')).toBe(200000);
    expect(parseCurrencyApi({ try: { usd: 0.02 } }, undefined, 'eur').size).toBe(0);
  });
});

describe('parseCoinGecko', () => {
  it('converts TRY prices to kuruş', () => {
    const m = parseCoinGecko({ bitcoin: { try: 4110163 }, ethereum: { try: 131956.55 }, solana: {}, ripple: { try: -1 } });
    expect(m.get('BTC')).toBe(411016300);
    expect(m.get('ETH')).toBe(13195655);
    expect(m.has('SOL')).toBe(false);
    expect(m.has('XRP')).toBe(false);
    expect(parseCoinGecko('x').size).toBe(0);
  });

  it('reads the requested vs currency', () => {
    expect(parseCoinGecko({ bitcoin: { usd: 100000, try: 4110163 } }, undefined, 'usd').get('BTC')).toBe(10000000);
  });
});

describe('helpers', () => {
  it('checks freshness', () => {
    expect(isFresh(undefined, 1000)).toBe(false);
    expect(isFresh(1000, 1000 + PRICE_MAX_AGE_MS - 1)).toBe(true);
    expect(isFresh(1000, 1000 + PRICE_MAX_AGE_MS)).toBe(false);
  });

  it('knows which kinds support auto prices', () => {
    expect(kindSupportsAuto('gold')).toBe(true);
    expect(kindSupportsAuto('crypto')).toBe(true);
    expect(kindSupportsAuto('stock')).toBe(false);
    expect(kindSupportsAuto('fund')).toBe(false);
    expect(AUTO_SYMBOL_MAP.get('BTC')?.coingeckoId).toBe('bitcoin');
  });
});
