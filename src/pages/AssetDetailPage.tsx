import { Plus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { AmountInput, Button, Card, ConfirmDialog, EmptyState, Field, inputClass, Modal, SegmentedTabs, useBusy } from '../components/ui';
import { db } from '../db/db';
import { addTrade, deleteAsset, deleteTrade, RepoError, setManualPrice, updateAsset, updateTrade } from '../db/repo';
import { formatAmountInput, formatPercent, formatQuantity, formatSignedMoney, formatMoney, parseQuantity, parseMoney } from '../domain/money';
import { formatDate, todayLocal } from '../domain/month';
import { computePosition, sortTrades, valuePosition } from '../domain/portfolio';
import { AUTO_SYMBOL_MAP, KIND_EMOJI, KIND_LABELS } from '../domain/prices';
import type { Asset, Trade, TradeSide } from '../domain/types';
import { priceOf, usePriceMap, useTrades } from '../hooks/data';
import { usePriceRefresh } from '../prices/usePriceRefresh';
import { useApp } from '../state/AppContext';
import { hrefFor } from '../state/useHashRoute';
import { priceLabel } from './InvestmentsPage';

function TradeForm({ asset, trade, suggestedPrice, onClose }: { asset: Asset; trade?: Trade; suggestedPrice: number | null; onClose: () => void }) {
  const { toast } = useApp();
  const [side, setSide] = useState<TradeSide>(trade?.side ?? 'buy');
  const [qty, setQty] = useState(trade ? formatQuantity(trade.quantity) : '');
  const [price, setPrice] = useState(trade ? formatAmountInput(trade.unitPriceKurus) : suggestedPrice ? formatAmountInput(suggestedPrice) : '');
  const [fee, setFee] = useState(trade && trade.feeKurus ? formatAmountInput(trade.feeKurus) : '');
  const [date, setDate] = useState(trade?.date ?? todayLocal());
  const [note, setNote] = useState(trade?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const unit = AUTO_SYMBOL_MAP.get(asset.symbol)?.unit ?? 'adet';
  const q = parseQuantity(qty);
  const p = parseMoney(price);
  const total = q !== null && p !== null ? q * p : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q === null || q <= 0) return setError('Geçerli bir miktar girin');
    if (p === null) return setError('Geçerli bir birim fiyat girin');
    const feeKurus = fee.trim() ? parseMoney(fee) : 0;
    if (feeKurus === null) return setError('Geçerli bir komisyon girin');
    const input = { assetId: asset.id, side, quantity: q, unitPriceKurus: p, feeKurus, date, note };
    void run(async () => {
      try {
        if (trade) await updateTrade(trade.id, input);
        else await addTrade(input);
        toast(side === 'buy' ? 'Alış kaydedildi' : 'Satış kaydedildi');
        onClose();
      } catch (err) {
        setError(err instanceof RepoError ? err.message : 'Kaydedilemedi');
      }
    });
  };

  return (
    <Modal open onClose={onClose} title={trade ? 'İşlemi düzenle' : `${asset.name} · alış / satış`}>
      <form onSubmit={submit} noValidate>
        <div className="mb-4">
          <SegmentedTabs
            label="Alış veya satış"
            value={side}
            onChange={setSide}
            options={[
              { value: 'buy', label: 'Alış' },
              { value: 'sell', label: 'Satış' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Miktar (${unit})`}>
            {(id) => <input id={id} className={`${inputClass} tabular text-right`} inputMode="decimal" autoComplete="off" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />}
          </Field>
          <Field label="Birim fiyat">{(id) => <AmountInput id={id} value={price} onChange={setPrice} />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Komisyon (isteğe bağlı)">{(id) => <AmountInput id={id} value={fee} onChange={setFee} />}</Field>
          <Field label="Tarih">{(id) => <input id={id} type="date" className={inputClass} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
        </div>
        <Field label="Not (isteğe bağlı)">{(id) => <input id={id} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />}</Field>
        {total !== null && (
          <p className="mb-3 text-sm text-muted" data-testid="trade-total">
            Toplam: <strong className="text-text tabular">{formatMoney(total)}</strong>
          </p>
        )}
        {error && (
          <p role="alert" className="mb-3 text-sm text-expense">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          Kaydet
        </Button>
      </form>
    </Modal>
  );
}

function ManualPriceForm({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { toast } = useApp();
  const [price, setPrice] = useState(asset.manualPriceKurus !== undefined ? formatAmountInput(asset.manualPriceKurus) : '');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Güncel fiyatı gir">
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const k = parseMoney(price);
          if (k === null) return setError('Geçerli bir fiyat girin');
          await setManualPrice(asset.id, k);
          toast('Fiyat güncellendi');
          onClose();
        }}
      >
        <Field label="Birim fiyat" error={error}>
          {(id) => <AmountInput id={id} value={price} onChange={setPrice} invalid={!!error} />}
        </Field>
        <Button type="submit" className="w-full">
          Kaydet
        </Button>
      </form>
    </Modal>
  );
}

export function AssetDetailPage({ id }: { id: string }) {
  const { toast } = useApp();
  const asset = useLiveQuery(() => db.assets.get(id), [id], null);
  const trades = useTrades(id);
  const prices = usePriceMap();
  const assetList = useMemo(() => (asset ? [asset] : undefined), [asset]);
  const { status, refresh } = usePriceRefresh(assetList);
  const [tradeForm, setTradeForm] = useState<Trade | 'new' | null>(null);
  const [priceForm, setPriceForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingTrade, setDeletingTrade] = useState<Trade | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, run] = useBusy();

  if (asset === null) return null;
  if (!asset) {
    return (
      <Card>
        <EmptyState icon="🤷" title="Varlık bulunamadı">
          <a className="font-semibold text-accent" href={hrefFor('yatirim')}>
            Yatırımlara dön
          </a>
        </EmptyState>
      </Card>
    );
  }
  const list = trades ?? [];
  const position = computePosition(list);
  const price = priceOf(asset, prices);
  const val = valuePosition(position, price);
  const unit = AUTO_SYMBOL_MAP.get(asset.symbol)?.unit ?? 'adet';
  const autoInfo = AUTO_SYMBOL_MAP.get(asset.symbol);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {KIND_EMOJI[asset.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{asset.name}</div>
            <div className="text-xs text-muted">
              {KIND_LABELS[asset.kind]} · {asset.priceSource === 'auto' ? `Canlı fiyat (${autoInfo?.label ?? asset.symbol})` : 'Elle fiyat'}
            </div>
          </div>
        </div>
        <div className="mt-4 text-3xl font-bold tracking-tight" data-testid="asset-value">
          {val.valueKurus !== null ? formatMoney(val.valueKurus) : '—'}
        </div>
        <div className="text-sm font-semibold" data-testid="asset-pnl">
          {val.unrealizedKurus !== null && position.quantity > 0 ? (
            <span className={val.unrealizedKurus >= 0 ? 'text-income' : 'text-expense'}>
              {formatSignedMoney(val.unrealizedKurus)}
              {val.unrealizedPct !== null && ` (${val.unrealizedPct >= 0 ? '+' : ''}${formatPercent(val.unrealizedPct)})`}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Miktar</dt>
            <dd className="font-semibold tabular" data-testid="asset-qty">
              {formatQuantity(position.quantity)} {unit}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Ortalama maliyet</dt>
            <dd className="font-semibold tabular">{position.quantity > 0 ? formatMoney(position.avgCostKurus) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Güncel fiyat</dt>
            <dd className="font-semibold tabular" data-testid="asset-price">
              {price !== null ? formatMoney(price) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Gerçekleşen K/Z</dt>
            <dd className={`font-semibold tabular ${position.realizedKurus >= 0 ? 'text-income' : 'text-expense'}`} data-testid="asset-realized">
              {formatSignedMoney(position.realizedKurus)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">{priceLabel(asset, prices)}</p>
        {status === 'failed' && asset.priceSource === 'auto' && (
          <p role="alert" className="mt-2 rounded-xl bg-warn-soft p-2 text-sm text-warn">
            Fiyat alınamadı. Son bilinen fiyat gösteriliyor.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {asset.priceSource === 'manual' ? (
            <Button variant="secondary" onClick={() => setPriceForm(true)}>
              Fiyatı güncelle
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void refresh()} disabled={status === 'loading'}>
              Fiyatı yenile
            </Button>
          )}
          {autoInfo && (
            <Button
              variant="ghost"
              className="text-sm"
              onClick={() =>
                void run(async () => {
                  const next = asset.priceSource === 'auto' ? 'manual' : 'auto';
                  if (next === 'manual' && asset.manualPriceKurus === undefined && price !== null) await setManualPrice(asset.id, price);
                  await updateAsset(asset.id, { priceSource: next });
                })
              }
              disabled={busy}
            >
              {asset.priceSource === 'auto' ? 'Elle fiyata geç' : 'Canlı fiyata dön'}
            </Button>
          )}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Alım / satım geçmişi</h2>
        <Button onClick={() => setTradeForm('new')}>
          <Plus size={18} /> Alış / Satış
        </Button>
      </div>
      <Card className="p-2!">
        {list.length === 0 ? (
          <EmptyState icon="🧾" title="Henüz alım yok">
            İlk alışınızı ekleyin; ortalama maliyet ve kâr/zarar otomatik hesaplanır.
          </EmptyState>
        ) : (
          <ul>
            {sortTrades(list)
              .reverse()
              .map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-xl px-2 py-2.5" data-testid="trade-row">
                  <button type="button" onClick={() => setTradeForm(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className={`inline-flex min-w-12 justify-center rounded-lg px-2 py-1 text-xs font-bold ${t.side === 'buy' ? 'bg-ok-soft text-income' : 'bg-danger-soft text-expense'}`}>
                      {t.side === 'buy' ? 'ALIŞ' : 'SATIŞ'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium tabular">
                        {formatQuantity(t.quantity)} {unit} × {formatMoney(t.unitPriceKurus)}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {formatDate(t.date)}
                        {t.feeKurus ? ` · komisyon ${formatMoney(t.feeKurus)}` : ''}
                        {t.note ? ` · ${t.note}` : ''}
                      </span>
                    </span>
                    <span className="tabular font-semibold">{formatMoney(t.quantity * t.unitPriceKurus)}</span>
                  </button>
                  <Button variant="ghost" className="px-2! text-sm text-muted" aria-label="İşlemi sil" onClick={() => setDeletingTrade(t)}>
                    Sil
                  </Button>
                </li>
              ))}
          </ul>
        )}
      </Card>

      <Card title="Varlık ayarları">
        {renaming ? (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await updateAsset(asset.id, { name: newName });
                setRenaming(false);
              } catch (err) {
                toast(err instanceof RepoError ? err.message : 'Kaydedilemedi', 'error');
              }
            }}
          >
            <input className={inputClass} aria-label="Yeni ad" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} />
            <Button type="submit">Kaydet</Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setNewName(asset.name);
                setRenaming(true);
              }}
            >
              Adını değiştir
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Varlığı sil
            </Button>
          </div>
        )}
      </Card>

      {tradeForm && <TradeForm asset={asset} trade={tradeForm === 'new' ? undefined : tradeForm} suggestedPrice={price} onClose={() => setTradeForm(null)} />}
      {priceForm && <ManualPriceForm asset={asset} onClose={() => setPriceForm(false)} />}
      <ConfirmDialog
        open={!!deletingTrade}
        title="İşlem silinsin mi?"
        message="Bu alım/satım kaydı silinecek."
        onCancel={() => setDeletingTrade(null)}
        onConfirm={async () => {
          try {
            if (deletingTrade) await deleteTrade(deletingTrade.id);
            toast('Silindi');
          } catch (err) {
            toast(err instanceof RepoError ? err.message : 'Silinemedi', 'error');
          }
          setDeletingTrade(null);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Varlık silinsin mi?"
        message={`${asset.name} ve tüm alım/satım geçmişi silinecek.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteAsset(asset.id);
          toast('Varlık silindi');
          window.location.hash = hrefFor('yatirim');
        }}
      />
    </div>
  );
}
