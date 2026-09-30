import { Plus, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DonutChart } from '../components/charts';
import { AmountInput, Badge, Button, Card, EmptyState, Field, inputClass, Modal, SegmentedTabs, useBusy } from '../components/ui';
import { addAsset, RepoError } from '../db/repo';
import { formatPercent, formatQuantity, formatSignedTRY, formatTRY, parseTRY } from '../domain/money';
import { formatDateTimeShort } from '../domain/month';
import { portfolioSummary } from '../domain/portfolio';
import { AUTO_SYMBOL_MAP, AUTO_SYMBOLS, KIND_COLORS, KIND_EMOJI, KIND_LABELS, kindSupportsAuto } from '../domain/prices';
import type { AssetKind, PriceQuote } from '../domain/types';
import { priceOf, useAssets, usePriceMap, useTrades } from '../hooks/data';
import { usePriceRefresh } from '../prices/usePriceRefresh';
import { useApp } from '../state/AppContext';
import { hrefFor } from '../state/useHashRoute';

const KINDS: AssetKind[] = ['gold', 'fx', 'crypto', 'stock', 'fund', 'silver', 'deposit', 'other'];

function PnL({ kurus, pct }: { kurus: number | null; pct: number | null }) {
  if (kurus === null) return <span className="text-muted">—</span>;
  return (
    <span className={kurus >= 0 ? 'text-income' : 'text-expense'}>
      {formatSignedTRY(kurus)}
      {pct !== null && ` (${pct >= 0 ? '+' : ''}${formatPercent(pct)})`}
    </span>
  );
}

export function priceLabel(asset: { priceSource: string; symbol: string; manualPriceAt?: number }, prices: Map<string, PriceQuote>): string {
  if (asset.priceSource === 'manual') return asset.manualPriceAt ? `Elle · ${formatDateTimeShort(asset.manualPriceAt)}` : 'Fiyat girilmedi';
  const q = prices.get(asset.symbol);
  return q ? `${q.source} · ${formatDateTimeShort(q.fetchedAt)}` : 'Fiyat bekleniyor';
}

function AddAssetModal({ onClose }: { onClose: () => void }) {
  const { toast } = useApp();
  const [kind, setKind] = useState<AssetKind>('gold');
  const autoOptions = AUTO_SYMBOLS.filter((s) => s.kind === kind);
  const [symbol, setSymbol] = useState(autoOptions[0]?.symbol ?? '');
  const [name, setName] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const supportsAuto = kindSupportsAuto(kind);
  const isAuto = supportsAuto && !manualMode;

  const pickKind = (k: AssetKind) => {
    setKind(k);
    setSymbol(AUTO_SYMBOLS.find((s) => s.kind === k)?.symbol ?? '');
    setManualMode(false);
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const auto = AUTO_SYMBOL_MAP.get(symbol);
    const finalName = name.trim() || (isAuto && auto ? auto.label : '');
    if (!finalName) return setError('Varlık adı girin (örn. THYAO, Ziraat vadeli)');
    let manualPriceKurus: number | undefined;
    if (!isAuto && price.trim()) {
      const k = parseTRY(price);
      if (k === null) return setError('Geçerli bir fiyat girin');
      manualPriceKurus = k;
    }
    void run(async () => {
      try {
        const a = await addAsset({ name: finalName, kind, symbol: isAuto ? symbol : '', priceSource: isAuto ? 'auto' : 'manual', manualPriceKurus });
        toast('Varlık eklendi');
        onClose();
        window.location.hash = hrefFor('varlik', a.id);
      } catch (err) {
        setError(err instanceof RepoError ? err.message : 'Kaydedilemedi');
      }
    });
  };

  return (
    <Modal open onClose={onClose} title="Varlık ekle">
      <form onSubmit={submit} noValidate>
        <div className="mb-1 text-sm font-medium text-muted">Tür</div>
        <div role="radiogroup" aria-label="Varlık türü" className="mb-3 grid grid-cols-4 gap-2">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => pickKind(k)}
              className={`flex min-h-14 flex-col items-center justify-center rounded-xl border text-xs font-medium ${kind === k ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2 text-muted'}`}
            >
              <span className="text-lg" aria-hidden>
                {KIND_EMOJI[k]}
              </span>
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {supportsAuto && (
          <div className="mb-3">
            <SegmentedTabs
              label="Fiyat kaynağı"
              value={manualMode ? 'manual' : 'auto'}
              onChange={(v) => setManualMode(v === 'manual')}
              options={[
                { value: 'auto', label: 'Canlı fiyat' },
                { value: 'manual', label: 'Elle fiyat' },
              ]}
            />
          </div>
        )}
        {isAuto ? (
          <Field label="Varlık" hint="Fiyat internetten otomatik alınır (yalnızca genel fiyat listesi; verileriniz gönderilmez).">
            {(id) => (
              <select id={id} className={inputClass} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {autoOptions.map((o) => (
                  <option key={o.symbol} value={o.symbol}>
                    {o.label} ({o.unit})
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : (
          <>
            <Field label="Ad" hint={kind === 'stock' || kind === 'fund' ? 'Hisse ve fon fiyatları için ücretsiz canlı kaynak yok; fiyatı siz güncellersiniz.' : undefined}>
              {(id) => <input id={id} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'stock' ? 'Örn. THYAO' : kind === 'fund' ? 'Örn. AFA fonu' : kind === 'deposit' ? 'Örn. Vadeli hesap' : 'Örn. Çeyrek altın'} maxLength={60} />}
            </Field>
            <Field label="Güncel birim fiyat (isteğe bağlı)">{(id) => <AmountInput id={id} value={price} onChange={setPrice} />}</Field>
          </>
        )}
        {isAuto && (
          <Field label="Görünen ad (isteğe bağlı)">
            {(id) => <input id={id} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={AUTO_SYMBOL_MAP.get(symbol)?.label} maxLength={60} />}
          </Field>
        )}
        {error && (
          <p role="alert" className="mb-3 text-sm text-expense">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          Ekle
        </Button>
      </form>
    </Modal>
  );
}

export function InvestmentsPage() {
  const assets = useAssets();
  const trades = useTrades();
  const prices = usePriceMap();
  const { status, refresh, hasAuto } = usePriceRefresh(assets);
  const [adding, setAdding] = useState(false);
  const visible = useMemo(() => (assets ?? []).filter((a) => !a.archived), [assets]);
  const s = useMemo(() => portfolioSummary(visible, trades ?? [], (a) => priceOf(a, prices)), [visible, trades, prices]);
  if (!assets || !trades) return null;

  const slices = s.byKind.map((k) => ({ id: k.kind, name: KIND_LABELS[k.kind], color: KIND_COLORS[k.kind], emoji: KIND_EMOJI[k.kind], value: k.valueKurus, share: k.valueKurus / (s.totalValueKurus || 1) }));

  return (
    <div className="space-y-4">
      {visible.length > 0 && (
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-muted">Portföy değeri</div>
              <div className="mt-1 text-3xl font-bold tracking-tight" data-testid="portfolio-value">
                {formatTRY(s.totalValueKurus)}
              </div>
            </div>
            {hasAuto && (
              <Button variant="secondary" onClick={() => void refresh()} disabled={status === 'loading'} aria-label="Fiyatları yenile">
                <RefreshCw size={16} className={status === 'loading' ? 'animate-spin' : ''} /> Yenile
              </Button>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Maliyet</dt>
              <dd className="font-semibold tabular">{formatTRY(s.totalCostKurus)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Kâr/Zarar</dt>
              <dd className="font-semibold tabular" data-testid="portfolio-pnl">
                <PnL kurus={s.unrealizedKurus} pct={s.unrealizedPct} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Gerçekleşen K/Z</dt>
              <dd className="font-semibold tabular" data-testid="portfolio-realized">
                <PnL kurus={s.realizedKurus} pct={null} />
              </dd>
            </div>
          </dl>
          {status === 'failed' && (
            <p role="alert" className="mt-3 rounded-xl bg-warn-soft p-2 text-sm text-warn">
              Fiyatlar alınamadı (internet yok olabilir). Son bilinen fiyatlar gösteriliyor.
            </p>
          )}
          {status === 'partial' && <p className="mt-3 rounded-xl bg-warn-soft p-2 text-sm text-warn">Bazı fiyatlar alınamadı.</p>}
          {s.missingPrices > 0 && <p className="mt-2 text-sm text-muted">{s.missingPrices} varlığın fiyatı bilinmiyor; toplama dahil edilmedi.</p>}
        </Card>
      )}
      {slices.length > 1 && (
        <Card title="Dağılım">
          <DonutChart slices={slices} centerLabel="Toplam" centerValue={formatTRY(s.totalValueKurus)} ariaLabel="Varlık türlerine göre portföy dağılımı" />
        </Card>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Varlıklar</h2>
        <Button onClick={() => setAdding(true)}>
          <Plus size={18} /> Varlık ekle
        </Button>
      </div>
      {visible.length === 0 ? (
        <Card>
          <EmptyState icon="📈" title="Henüz yatırım yok">
            Altın, döviz ve kripto için fiyatlar otomatik gelir; hisse ve fonların fiyatını siz girersiniz.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {s.views.map(({ asset, position, priceKurus, valuation }) => (
            <a key={asset.id} href={hrefFor('varlik', asset.id)} data-testid="asset-card" className="block min-w-0 rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden>
                  {KIND_EMOJI[asset.kind]}
                </span>
                <span className="flex-1 truncate font-semibold">{asset.name}</span>
                <Badge>{KIND_LABELS[asset.kind]}</Badge>
              </div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="text-sm text-muted">
                  {formatQuantity(position.quantity)} {AUTO_SYMBOL_MAP.get(asset.symbol)?.unit ?? 'adet'}
                  <div className="text-xs">{priceKurus !== null ? `${formatTRY(priceKurus)} · ` : ''}{priceLabel(asset, prices)}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold tabular">{valuation.valueKurus !== null ? formatTRY(valuation.valueKurus) : '—'}</div>
                  <div className="text-xs font-semibold tabular">
                    <PnL kurus={position.quantity > 0 ? valuation.unrealizedKurus : null} pct={valuation.unrealizedPct} />
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
      {adding && <AddAssetModal onClose={() => setAdding(false)} />}
    </div>
  );
}
