import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { addAsset, addRecurring, addTrade, addTransaction } from '../db/repo';
import { readDataset, serializeDataset } from '../db/syncIO';
import { currentMonth, todayLocal } from '../domain/month';
import { renderApp } from '../test/render';
import { seedIfNeeded } from '../db/bootstrap';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
});

const month = currentMonth();
const today = todayLocal();

describe('transaction form', () => {
  it('adds an expense with Turkish amount input', async () => {
    const { user } = await renderApp('#/');
    await user.click(screen.getAllByRole('button', { name: 'İşlem ekle' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Yeni işlem' });
    await user.click(within(dialog).getByRole('button', { name: 'Ekle' }));
    expect(within(dialog).getByText('Geçerli bir tutar girin')).toBeInTheDocument();
    expect(within(dialog).getByText('Kategori seçin')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Tutar'), '1.234,56');
    await user.click(within(dialog).getByRole('radio', { name: /Market/ }));
    await user.type(within(dialog).getByLabelText('Açıklama'), 'Haftalık market');
    await user.click(within(dialog).getByRole('button', { name: 'Ekle' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [t] = await db.transactions.toArray();
    expect(t).toMatchObject({ amountKurus: 123456, categoryId: 'cat-market', type: 'expense', description: 'Haftalık market', date: today });
    expect(await screen.findByTestId('card-expense-value')).toHaveTextContent('1.234,56 ₺');
  });

  it('switching type filters categories and edit prefills the amount', async () => {
    await seedIfNeeded();
    await addTransaction({ type: 'income', amountKurus: 2500000, categoryId: 'cat-maas', description: 'Maaş', date: today });
    const { user } = await renderApp('#/islemler');
    await user.click(await screen.findByRole('button', { name: /Maaş/ }));
    const dialog = await screen.findByRole('dialog', { name: 'İşlemi düzenle' });
    expect(within(dialog).getByLabelText('Tutar')).toHaveValue('25.000,00');
    expect(within(dialog).queryByRole('radio', { name: /Market/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('tab', { name: 'Gider' }));
    expect(within(dialog).getByRole('radio', { name: /Market/ })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('tab', { name: 'Gelir' }));
    await user.click(within(dialog).getByRole('radio', { name: /Maaş/ }));
    await user.clear(within(dialog).getByLabelText('Tutar'));
    await user.type(within(dialog).getByLabelText('Tutar'), '26000');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(async () => expect((await db.transactions.toArray())[0]?.amountKurus).toBe(2600000));
  });

  it('deletes after confirmation', async () => {
    await seedIfNeeded();
    await addTransaction({ type: 'expense', amountKurus: 5000, categoryId: 'cat-market', description: 'Ekmek', date: today });
    const { user } = await renderApp('#/islemler');
    await user.click(await screen.findByRole('button', { name: /Ekmek/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sil' }));
    const confirm = await screen.findByRole('dialog', { name: 'İşlem silinsin mi?' });
    await user.click(within(confirm).getByRole('button', { name: 'Sil' }));
    await waitFor(async () => expect(await db.transactions.count()).toBe(0));
    expect(await screen.findByText('Bu ay işlem yok')).toBeInTheDocument();
  });
});

describe('transactions page', () => {
  it('filters by tab, searches and sorts', async () => {
    await seedIfNeeded();
    const d = (day: number) => `${month}-${String(day).padStart(2, '0')}`;
    await addTransaction({ type: 'income', amountKurus: 2500000, categoryId: 'cat-maas', description: 'Maaş', date: d(1) });
    await addTransaction({ type: 'expense', amountKurus: 30000, categoryId: 'cat-faturalar', description: 'Su Faturası', date: d(2) });
    await addTransaction({ type: 'expense', amountKurus: 90000, categoryId: 'cat-market', description: 'İspanak ve market', date: d(3) });
    const { user } = await renderApp('#/islemler');
    await screen.findAllByTestId('tx-row');
    expect(screen.getAllByTestId('tx-row')).toHaveLength(3);

    await user.click(screen.getByRole('tab', { name: 'Gider' }));
    expect(screen.getAllByTestId('tx-row')).toHaveLength(2);

    await user.type(screen.getByLabelText('İşlem ara'), 'ispanak');
    expect(screen.getAllByTestId('tx-row')).toHaveLength(1);
    await user.clear(screen.getByLabelText('İşlem ara'));
    await user.type(screen.getByLabelText('İşlem ara'), 'zzz');
    expect(screen.getByText('Eşleşen işlem yok')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('İşlem ara'));

    await user.click(screen.getByRole('tab', { name: 'Tümü' }));
    await user.selectOptions(screen.getByLabelText('Sırala'), 'amount');
    const rows = () => screen.getAllByTestId('tx-row').map((r) => r.textContent ?? '');
    expect(rows()[0]).toMatch(/Maaş/);
    await user.click(screen.getByRole('button', { name: /Azalan sıra/ }));
    expect(rows()[0]).toMatch(/Su Faturası/);
  });
});

describe('budgets page', () => {
  it('sets a budget and shows warning status', async () => {
    await seedIfNeeded();
    await addTransaction({ type: 'expense', amountKurus: 85000, categoryId: 'cat-market', description: 'Market', date: today });
    const { user } = await renderApp('#/butce');
    await user.click(await screen.findByRole('button', { name: /Market/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Aylık limit'), '1.000');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    const row = await screen.findByTestId('budget-row');
    expect(row).toHaveAttribute('data-status', 'warning');
    expect(row).toHaveTextContent('850,00 ₺ / 1.000,00 ₺');
  });
});

describe('recurring page', () => {
  it('adds a rule, generates this month and shows the short-month hint', async () => {
    const { user } = await renderApp('#/duzenli');
    await user.click(await screen.findByRole('button', { name: /Düzenli işlem ekle/ }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Ayın kaçında?'), '31');
    expect(within(dialog).getByText('Kısa aylarda ayın son günü eklenir.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Tutar'), '15.000');
    await user.click(within(dialog).getByRole('radio', { name: /Kira/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await screen.findByTestId('recurring-row');
    await waitFor(async () => expect(await db.transactions.where('month').equals(month).count()).toBe(1));
    const [t] = await db.transactions.toArray();
    expect(t).toMatchObject({ amountKurus: 1500000, description: 'Kira' });

    await user.click(screen.getByRole('checkbox', { name: /Kira aktif/ }));
    await waitFor(async () => expect((await db.recurring.toArray())[0]?.active).toBe(false));
  });
});

describe('categories page', () => {
  it('rejects a duplicate name', async () => {
    const { user } = await renderApp('#/kategoriler');
    await user.click(await screen.findByRole('button', { name: /Kategori ekle/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Ad'), 'MARKET');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await within(dialog).findByText('Bu isimde bir kategori zaten var')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Ad'));
    await user.type(within(dialog).getByLabelText('Ad'), 'Evcil Hayvan');
    await user.click(within(dialog).getByRole('button', { name: 'Simge 🐾' }));
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Evcil Hayvan')).toBeInTheDocument();
  });
});

describe('settings page', () => {
  it('toggles theme and persists it', async () => {
    const { user } = await renderApp('#/ayarlar');
    await user.click(screen.getByRole('tab', { name: 'Koyu' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('oymfin:theme')).toBe('dark');
    await user.click(screen.getByRole('tab', { name: 'Açık' }));
    expect(document.documentElement).not.toHaveClass('dark');
    await user.click(screen.getByRole('tab', { name: 'Sistem' }));
    expect(localStorage.getItem('oymfin:theme')).toBeNull();
  });

  it('changes the currency and shows amounts with the new symbol', async () => {
    await seedIfNeeded();
    await addTransaction({ type: 'expense', amountKurus: 123456, categoryId: 'cat-market', description: 'Market', date: today });
    await db.prices.put({ symbol: 'USD', priceKurus: 4800, fetchedAt: Date.now(), source: 'currency-api' });
    const { user } = await renderApp('#/ayarlar');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Para birimi' }), 'EUR');
    expect(await screen.findByText('Para birimi: Euro (€)')).toBeInTheDocument();
    expect(localStorage.getItem('oymfin:currency')).toBe('EUR');
    expect(await db.prices.count()).toBe(0);

    window.location.hash = '#/islemler';
    expect(await screen.findByTestId('tx-row')).toHaveTextContent('1.234,56 €');
    await user.click(screen.getByTestId('tx-row'));
    expect(await screen.findByText('€')).toBeInTheDocument();
  });

  it('exports a sync file and clears the dirty flag', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    await seedIfNeeded();
    await addTransaction({ type: 'expense', amountKurus: 5000, categoryId: 'cat-market', description: 'x', date: today });
    const { user } = await renderApp('#/ayarlar');
    expect(await screen.findByText('Kaydedilmemiş değişiklik')).toBeInTheDocument();
    const exportBtn = screen.getByRole('button', { name: /iCloud'a kaydet/ });
    await waitFor(() => expect(exportBtn).toBeEnabled());
    await user.click(exportBtn);
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(await screen.findByText('Güncel')).toBeInTheDocument();
  });

  it('merges a sync file and reports an invalid one', async () => {
    await seedIfNeeded();
    await addTransaction({ type: 'expense', amountKurus: 7000, categoryId: 'cat-market', description: 'Uzaktan', date: today });
    const text = serializeDataset(await readDataset(), 'iPhone', Date.now());
    await db.transactions.clear();
    const { user } = await renderApp('#/ayarlar');
    await user.upload(screen.getByTestId('merge-input'), new File([text], 'oymfin.json', { type: 'application/json' }));
    expect(await screen.findByText(/iPhone ile eşitlendi: 1 yeni/)).toBeInTheDocument();
    expect(await db.transactions.count()).toBe(1);

    await user.upload(screen.getByTestId('merge-input'), new File(['{"a":1}'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByText('Bu dosya bir oymfin senkron dosyası değil')).toBeInTheDocument();
  });
});

describe('investments', () => {
  const fetchMock = () =>
    vi.fn(async (url: string) => {
      if (url.includes('coingecko')) return new Response(JSON.stringify({ bitcoin: { try: 4000000 } }));
      return new Response(JSON.stringify({ try: { usd: 0.02, xau: 1 / (650000 / 100) / 31.1034768 } }));
    });

  it('shows portfolio value with live price and P/L', async () => {
    vi.stubGlobal('fetch', fetchMock());
    const a = await addAsset({ name: 'Gram Altın', kind: 'gold', symbol: 'XAU_GRAM', priceSource: 'auto' });
    await addTrade({ assetId: a.id, side: 'buy', quantity: 10, unitPriceKurus: 600000, feeKurus: 0, date: '2026-09-01' });
    await renderApp('#/yatirim');
    await waitFor(() => expect(screen.getByTestId('portfolio-value')).toHaveTextContent('65.000,00 ₺'));
    expect(screen.getByTestId('portfolio-pnl')).toHaveTextContent('+5.000,00 ₺ (+%8,3)');
  });

  it('adds a manual asset and a trade, rejecting oversell', async () => {
    vi.stubGlobal('fetch', fetchMock());
    const { user } = await renderApp('#/yatirim');
    await user.click(await screen.findByRole('button', { name: /Varlık ekle/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: /Hisse/ }));
    await user.type(within(dialog).getByLabelText('Ad'), 'THYAO');
    await user.type(within(dialog).getByLabelText(/Güncel birim fiyat/), '312,50');
    await user.click(within(dialog).getByRole('button', { name: 'Ekle' }));

    await screen.findByTestId('asset-price');
    expect(screen.getByTestId('asset-price')).toHaveTextContent('312,50 ₺');
    await user.click(screen.getByRole('button', { name: /Alış \/ Satış/ }));
    let tf = await screen.findByRole('dialog');
    await user.type(within(tf).getByLabelText(/Miktar/), '50');
    await user.clear(within(tf).getByLabelText('Birim fiyat'));
    await user.type(within(tf).getByLabelText('Birim fiyat'), '290');
    expect(within(tf).getByTestId('trade-total')).toHaveTextContent('14.500,00 ₺');
    await user.click(within(tf).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(screen.getByTestId('asset-qty')).toHaveTextContent('50 adet'));
    expect(screen.getByTestId('asset-value')).toHaveTextContent('15.625,00 ₺');

    await user.click(screen.getByRole('button', { name: /Alış \/ Satış/ }));
    tf = await screen.findByRole('dialog');
    await user.click(within(tf).getByRole('tab', { name: 'Satış' }));
    await user.type(within(tf).getByLabelText(/Miktar/), '60');
    await user.click(within(tf).getByRole('button', { name: 'Kaydet' }));
    expect(await within(tf).findByText(/fazla satış/)).toBeInTheDocument();
    await user.clear(within(tf).getByLabelText(/Miktar/));
    await user.type(within(tf).getByLabelText(/Miktar/), '20');
    await user.click(within(tf).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(screen.getByTestId('asset-qty')).toHaveTextContent('30 adet'));
    expect(screen.getByTestId('asset-realized')).toHaveTextContent('+450,00 ₺');
  });

  it('dashboard shows wealth card', async () => {
    vi.stubGlobal('fetch', fetchMock());
    const a = await addAsset({ name: 'Dolar', kind: 'fx', symbol: 'USD', priceSource: 'auto' });
    await addTrade({ assetId: a.id, side: 'buy', quantity: 100, unitPriceKurus: 4800, feeKurus: 0, date: '2026-09-01' });
    await renderApp('#/');
    await waitFor(() => expect(screen.getByTestId('wealth-value')).toHaveTextContent('5.000,00 ₺'));
  });
});

describe('recurring in app bootstrap', () => {
  it('generates instances on startup', async () => {
    await seedIfNeeded();
    await addRecurring({ type: 'expense', amountKurus: 1000, categoryId: 'cat-abonelik', description: 'Netflix', dayOfMonth: 1, startMonth: month });
    await renderApp('#/islemler');
    expect(await screen.findByRole('button', { name: /Netflix/ })).toBeInTheDocument();
  });
});
