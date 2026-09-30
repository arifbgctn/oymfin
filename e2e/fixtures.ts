import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';

export const ALLOWED_PRICE_HOSTS = ['cdn.jsdelivr.net', 'latest.currency-api.pages.dev', 'api.coingecko.com'];

/** Sahte fiyatlar: gram altın 6.500 ₺, USD 49 ₺, BTC 4.000.000 ₺ */
export const PRICES = { goldGram: 6500, usd: 49, btc: 4_000_000 };

export const CURRENCY_JSON = {
  date: '2026-09-29',
  try: { usd: 1 / PRICES.usd, xau: 1 / (PRICES.goldGram * 31.1034768), btc: 1 / PRICES.btc },
};

export interface PriceMock {
  fail: boolean;
  calls: string[];
}

/** Dış istekleri yakalar: fiyat API'lerine sahte yanıt, diğer tüm dış adresler engellenir ve kaydedilir. */
export async function mockNetwork(context: BrowserContext, mock: PriceMock, foreign: string[]) {
  await context.route(
    (url) => url.hostname !== 'localhost',
    async (route) => {
      const url = new URL(route.request().url());
      if (!ALLOWED_PRICE_HOSTS.includes(url.hostname)) {
        foreign.push(url.href);
        return route.abort();
      }
      mock.calls.push(url.href);
      if (mock.fail) return route.abort('internetdisconnected');
      const body = url.hostname === 'api.coingecko.com' ? { bitcoin: { try: PRICES.btc } } : CURRENCY_JSON;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    },
  );
}

export const test = base.extend<{ priceMock: PriceMock; foreignRequests: string[] }>({
  priceMock: async ({}, use) => {
    await use({ fail: false, calls: [] });
  },
  foreignRequests: async ({}, use) => {
    await use([]);
  },
  context: async ({ context, priceMock, foreignRequests }, use) => {
    await mockNetwork(context, priceMock, foreignRequests);
    await use(context);
  },
});

export { expect };

export async function openApp(page: Page, hash = '#/') {
  await page.goto(`./${hash}`);
  await expect(page.getByRole('navigation').first()).toBeVisible();
}

export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1000) < 768;
}

/** Menüden sayfaya git (mobilde alt menü + "Diğer", masaüstünde kenar çubuğu). */
export async function goTo(page: Page, name: 'Özet' | 'İşlemler' | 'İstatistik' | 'Bütçe' | 'Yatırım' | 'Hesaplar' | 'Düzenli İşlemler' | 'Kategoriler' | 'Ayarlar & Eşitleme' | 'Kurulum') {
  const main = ['Özet', 'İşlemler', 'İstatistik', 'Bütçe', 'Yatırım'];
  if (isMobile(page) && !main.includes(name)) {
    // Alt menüden Özet'e (üst çubukta her zaman Menü düğmesi var), oradan Menü'ye
    await page.getByRole('navigation', { name: 'Alt menü' }).getByRole('link', { name: 'Özet' }).click();
    await page.getByRole('link', { name: 'Menü' }).click();
    await page.getByRole('link', { name: new RegExp(name.split(' ')[0]!) }).click();
    return;
  }
  const nav = page.getByRole('navigation', { name: isMobile(page) ? 'Alt menü' : 'Ana menü' });
  await nav.getByRole('link', { name, exact: true }).click();
}

export async function addTransaction(page: Page, opts: { type?: 'Gelir' | 'Gider'; amount: string; category: string; description?: string }) {
  await page.getByRole('button', { name: 'İşlem ekle' }).click();
  const dialog = page.getByRole('dialog', { name: 'Yeni işlem' });
  await expect(dialog).toBeVisible();
  if (opts.type === 'Gelir') await dialog.getByRole('tab', { name: 'Gelir' }).click();
  await dialog.getByLabel('Tutar').fill(opts.amount);
  await dialog.getByRole('radio', { name: opts.category }).click();
  if (opts.description) await dialog.getByLabel('Açıklama').fill(opts.description);
  await dialog.getByRole('button', { name: 'Ekle' }).click();
  await expect(dialog).toBeHidden();
}
