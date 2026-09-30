import { describe, expect, it } from 'vitest';
import { computePosition, portfolioSummary, validateTradeChange, validateTradeDelete, valuePosition } from './portfolio';
import type { Asset, Trade } from './types';

let seq = 0;
const trade = (p: Partial<Trade>): Trade => {
  seq++;
  return {
    id: p.id ?? `tr${seq}`,
    assetId: 'a1',
    side: 'buy',
    quantity: 1,
    unitPriceKurus: 100,
    feeKurus: 0,
    date: '2026-09-01',
    createdAt: seq,
    updatedAt: seq,
    ...p,
  };
};

const asset = (p: Partial<Asset>): Asset => ({
  id: 'a1',
  name: 'Gram Altın',
  kind: 'gold',
  symbol: 'XAU_GRAM',
  priceSource: 'auto',
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  ...p,
});

describe('computePosition (weighted average cost)', () => {
  it('averages two buys at different prices', () => {
    const p = computePosition([
      trade({ quantity: 10, unitPriceKurus: 600000 }),
      trade({ quantity: 10, unitPriceKurus: 700000, date: '2026-09-02' }),
    ]);
    expect(p.quantity).toBe(20);
    expect(p.costKurus).toBe(13000000);
    expect(p.avgCostKurus).toBe(650000);
    expect(p.realizedKurus).toBe(0);
    expect(p.invalidTradeId).toBeNull();
  });

  it('adds fees to cost', () => {
    const p = computePosition([trade({ quantity: 2, unitPriceKurus: 1000, feeKurus: 50 })]);
    expect(p.costKurus).toBe(2050);
    expect(p.avgCostKurus).toBe(1025);
  });

  it('partial sell realizes P/L and keeps remaining cost at average', () => {
    const p = computePosition([
      trade({ quantity: 10, unitPriceKurus: 600000 }),
      trade({ quantity: 10, unitPriceKurus: 700000, date: '2026-09-02' }),
      trade({ side: 'sell', quantity: 5, unitPriceKurus: 800000, feeKurus: 1000, date: '2026-09-03' }),
    ]);
    expect(p.quantity).toBe(15);
    expect(p.costKurus).toBe(9750000);
    expect(p.realizedKurus).toBe(5 * 800000 - 1000 - 5 * 650000);
  });

  it('selling everything resets to zero', () => {
    const p = computePosition([trade({ quantity: 3, unitPriceKurus: 100 }), trade({ side: 'sell', quantity: 3, unitPriceKurus: 50, date: '2026-09-02' })]);
    expect(p).toMatchObject({ quantity: 0, costKurus: 0, avgCostKurus: 0, realizedKurus: -150 });
  });

  it('flags overselling and orders by date', () => {
    const sell = trade({ id: 'sell', side: 'sell', quantity: 2, date: '2026-08-01' });
    const p = computePosition([trade({ quantity: 5 }), sell]);
    expect(p.invalidTradeId).toBe('sell');
    expect(p.quantity).toBe(5);
  });

  it('keeps crypto precision', () => {
    const p = computePosition([
      trade({ quantity: 0.00012345, unitPriceKurus: 411016300 }),
      trade({ quantity: 0.00000005, unitPriceKurus: 411016300 }),
      trade({ side: 'sell', quantity: 0.0001235, unitPriceKurus: 411016300, date: '2026-09-02' }),
    ]);
    expect(p.quantity).toBe(0);
    expect(p.invalidTradeId).toBeNull();
  });
});

describe('validation', () => {
  const buys = [trade({ id: 'b1', quantity: 5, date: '2026-09-01' }), trade({ id: 's1', side: 'sell', quantity: 4, date: '2026-09-10' })];

  it('rejects sells beyond holdings', () => {
    expect(validateTradeChange(buys, trade({ side: 'sell', quantity: 2, date: '2026-09-11' }))).toMatch(/fazla satış/);
    expect(validateTradeChange(buys, trade({ side: 'sell', quantity: 1, date: '2026-09-11' }))).toBeNull();
  });

  it('checks edits in place', () => {
    expect(validateTradeChange(buys, { ...buys[0]!, quantity: 3 })).toMatch(/fazla satış/);
    expect(validateTradeChange(buys, { ...buys[0]!, quantity: 4 })).toBeNull();
  });

  it('rejects zero quantity and negative price', () => {
    expect(validateTradeChange([], trade({ quantity: 0 }))).toMatch(/Miktar/);
    expect(validateTradeChange([], trade({ unitPriceKurus: -1 }))).toMatch(/fiyat/);
  });

  it('prevents deleting a buy that later sells depend on', () => {
    expect(validateTradeDelete(buys, 'b1')).toMatch(/aşar/);
    expect(validateTradeDelete(buys, 's1')).toBeNull();
  });
});

describe('valuation and summary', () => {
  it('values a position', () => {
    const pos = computePosition([trade({ quantity: 10, unitPriceKurus: 600000 })]);
    expect(valuePosition(pos, 650000)).toEqual({ valueKurus: 6500000, unrealizedKurus: 500000, unrealizedPct: (500000 / 6000000) * 100 });
    expect(valuePosition(pos, null)).toEqual({ valueKurus: null, unrealizedKurus: null, unrealizedPct: null });
  });

  it('summarizes a portfolio, counting missing prices', () => {
    const assets = [asset({}), asset({ id: 'a2', kind: 'stock', name: 'THYAO', priceSource: 'manual', symbol: '' }), asset({ id: 'a3', kind: 'fx', symbol: 'USD' })];
    const trades = [
      trade({ assetId: 'a1', quantity: 10, unitPriceKurus: 600000 }),
      trade({ assetId: 'a2', quantity: 100, unitPriceKurus: 30000 }),
      trade({ assetId: 'a3', quantity: 100, unitPriceKurus: 4800 }),
      trade({ assetId: 'a3', side: 'sell', quantity: 100, unitPriceKurus: 5000, date: '2026-09-05' }),
    ];
    const prices: Record<string, number | null> = { a1: 650000, a2: null, a3: 4900 };
    const s = portfolioSummary(assets, trades, (a) => prices[a.id] ?? null);
    expect(s.totalValueKurus).toBe(6500000);
    expect(s.totalCostKurus).toBe(6000000);
    expect(s.unrealizedKurus).toBe(500000);
    expect(s.realizedKurus).toBe(20000);
    expect(s.missingPrices).toBe(1);
    expect(s.byKind).toEqual([{ kind: 'gold', valueKurus: 6500000 }]);
    expect(s.views).toHaveLength(3);
  });

  it('empty portfolio', () => {
    const s = portfolioSummary([], [], () => null);
    expect(s).toMatchObject({ totalValueKurus: 0, unrealizedPct: null, missingPrices: 0 });
  });
});
