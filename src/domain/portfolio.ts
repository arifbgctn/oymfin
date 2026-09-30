import type { Asset, AssetKind, Trade } from './types';

const EPS = 1e-9;
export const round8 = (x: number) => Math.round(x * 1e8) / 1e8;

export interface Position {
  quantity: number;
  /** Eldeki miktarın toplam maliyeti (kuruş, komisyon dahil) */
  costKurus: number;
  /** Birim ortalama maliyet (kuruş); miktar 0 ise 0 */
  avgCostKurus: number;
  /** Satışlardan gerçekleşen kâr/zarar (kuruş) */
  realizedKurus: number;
  /** Eldekinden fazla satış içeren ilk işlem */
  invalidTradeId: string | null;
}

export function sortTrades(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1),
  );
}

/** Ağırlıklı ortalama maliyet yöntemi. */
export function computePosition(trades: Trade[]): Position {
  let quantity = 0;
  let cost = 0;
  let realized = 0;
  let invalidTradeId: string | null = null;
  for (const t of sortTrades(trades)) {
    if (t.side === 'buy') {
      quantity = round8(quantity + t.quantity);
      cost += t.quantity * t.unitPriceKurus + t.feeKurus;
    } else {
      if (t.quantity > quantity + EPS) {
        invalidTradeId ??= t.id;
        continue;
      }
      const avg = quantity > 0 ? cost / quantity : 0;
      const costOut = avg * t.quantity;
      realized += t.quantity * t.unitPriceKurus - t.feeKurus - costOut;
      cost -= costOut;
      quantity = round8(quantity - t.quantity);
      if (quantity < EPS) {
        quantity = 0;
        cost = 0;
      }
    }
  }
  return {
    quantity,
    costKurus: cost,
    avgCostKurus: quantity > 0 ? cost / quantity : 0,
    realizedKurus: realized,
    invalidTradeId,
  };
}

/** Yeni/düzenlenen işlem eklenince eldekinden fazla satış oluşuyorsa hata mesajı. */
export function validateTradeChange(existing: Trade[], candidate: Trade): string | null {
  if (!(candidate.quantity > 0)) return 'Miktar sıfırdan büyük olmalı';
  if (!(candidate.unitPriceKurus >= 0)) return 'Geçerli bir fiyat girin';
  const others = existing.filter((t) => t.id !== candidate.id);
  const pos = computePosition([...others, candidate]);
  if (pos.invalidTradeId) return 'Bu tarihte elinizdeki miktardan fazla satış yapılamaz';
  return null;
}

/** Bir alış silindiğinde sonraki satışlar geçersiz kalıyor mu? */
export function validateTradeDelete(existing: Trade[], tradeId: string): string | null {
  const pos = computePosition(existing.filter((t) => t.id !== tradeId));
  return pos.invalidTradeId ? 'Bu alış silinirse sonraki satışlar eldeki miktarı aşar' : null;
}

export interface Valuation {
  valueKurus: number | null;
  unrealizedKurus: number | null;
  unrealizedPct: number | null;
}

export function valuePosition(pos: Position, priceKurus: number | null): Valuation {
  if (priceKurus === null) return { valueKurus: null, unrealizedKurus: null, unrealizedPct: null };
  const value = pos.quantity * priceKurus;
  const unrealized = value - pos.costKurus;
  return {
    valueKurus: value,
    unrealizedKurus: unrealized,
    unrealizedPct: pos.costKurus > 0 ? (unrealized / pos.costKurus) * 100 : null,
  };
}

export interface AssetView {
  asset: Asset;
  position: Position;
  priceKurus: number | null;
  valuation: Valuation;
}

export interface PortfolioSummary {
  totalValueKurus: number;
  totalCostKurus: number;
  unrealizedKurus: number;
  unrealizedPct: number | null;
  realizedKurus: number;
  byKind: { kind: AssetKind; valueKurus: number }[];
  /** Fiyatı bilinmeyen (eldeki miktarı > 0) varlık sayısı */
  missingPrices: number;
  views: AssetView[];
}

export function portfolioSummary(assets: Asset[], trades: Trade[], priceOf: (a: Asset) => number | null): PortfolioSummary {
  const byAsset = new Map<string, Trade[]>();
  for (const t of trades) {
    const list = byAsset.get(t.assetId);
    if (list) list.push(t);
    else byAsset.set(t.assetId, [t]);
  }
  let totalValue = 0;
  let totalCost = 0;
  let realized = 0;
  let missing = 0;
  const kindMap = new Map<AssetKind, number>();
  const views: AssetView[] = [];
  for (const asset of assets) {
    const position = computePosition(byAsset.get(asset.id) ?? []);
    const priceKurus = priceOf(asset);
    const valuation = valuePosition(position, priceKurus);
    realized += position.realizedKurus;
    if (position.quantity > 0) {
      if (valuation.valueKurus === null) {
        missing++;
      } else {
        totalValue += valuation.valueKurus;
        totalCost += position.costKurus;
        kindMap.set(asset.kind, (kindMap.get(asset.kind) ?? 0) + valuation.valueKurus);
      }
    }
    views.push({ asset, position, priceKurus, valuation });
  }
  const unrealized = totalValue - totalCost;
  return {
    totalValueKurus: totalValue,
    totalCostKurus: totalCost,
    unrealizedKurus: unrealized,
    unrealizedPct: totalCost > 0 ? (unrealized / totalCost) * 100 : null,
    realizedKurus: realized,
    byKind: [...kindMap.entries()].map(([kind, valueKurus]) => ({ kind, valueKurus })).sort((a, b) => b.valueKurus - a.valueKurus),
    missingPrices: missing,
    views,
  };
}
