import { addTransaction, expect, goTo, openApp, test } from './fixtures';

test('works offline after first load (service worker)', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', "Playwright WebKit'te service worker çevrimdışı testi güvenilir değil");
  await openApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Sayfa SW tarafından kontrol edilsin diye bir kez yenile
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('navigation').first()).toBeVisible();
  await addTransaction(page, { amount: '42', category: 'Market', description: 'Çevrimdışı' });
  await expect(page.getByTestId('card-expense-value')).toHaveText('42,00 ₺');
  await context.setOffline(false);
});

test('no requests leave the device except price APIs', async ({ page, foreignRequests }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (host !== 'localhost') external.push(host);
  });
  await openApp(page);
  await addTransaction(page, { type: 'Gelir', amount: '1000', category: 'Maaş' });
  await goTo(page, 'Bütçe');
  await goTo(page, 'Ayarlar & Eşitleme');
  await goTo(page, 'Kurulum');
  // Yatırım yokken fiyat isteği de atılmaz
  await goTo(page, 'Yatırım');
  await page.waitForTimeout(500);
  expect(external).toEqual([]);
  expect(foreignRequests).toEqual([]);
});
