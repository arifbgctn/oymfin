import { expect, goTo, openApp, test } from './fixtures';

test('gold: buy, value with live price, partial sell, wealth card', async ({ page, priceMock }) => {
  await openApp(page);
  await goTo(page, 'Yatırım');
  await page.getByRole('button', { name: /Varlık ekle/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: /Altın/ })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: 'Ekle' }).click();

  // Varlık detayı açılır
  await expect(page.getByTestId('asset-price')).toHaveText('6.500,00 ₺');
  await page.getByRole('button', { name: /Alış \/ Satış/ }).click();
  const tf = page.getByRole('dialog');
  await tf.getByLabel(/Miktar/).fill('10');
  await tf.getByLabel('Birim fiyat').fill('6.000');
  await tf.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByTestId('asset-value')).toHaveText('65.000,00 ₺');
  await expect(page.getByTestId('asset-pnl')).toContainText('+5.000,00 ₺');

  await page.getByRole('button', { name: /Alış \/ Satış/ }).click();
  await tf.getByRole('tab', { name: 'Satış' }).click();
  await tf.getByLabel(/Miktar/).fill('4');
  await tf.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByTestId('asset-qty')).toHaveText('6 gr');
  await expect(page.getByTestId('asset-realized')).toHaveText('+2.000,00 ₺');

  // Özet: toplam servet
  await goTo(page, 'Özet');
  await expect(page.getByTestId('wealth-value')).toHaveText('39.000,00 ₺');
  expect(priceMock.calls.some((u) => u.includes('currency-api'))).toBe(true);
});

test('manual-price stock and offline price fallback', async ({ page, priceMock }) => {
  await openApp(page);
  await goTo(page, 'Yatırım');
  // Önce dolar ekle (canlı fiyat önbelleğe alınır)
  await page.getByRole('button', { name: /Varlık ekle/ }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /Döviz/ }).click();
  await dialog.getByRole('button', { name: 'Ekle' }).click();
  await page.getByRole('button', { name: /Alış \/ Satış/ }).click();
  await page.getByRole('dialog').getByLabel(/Miktar/).fill('1000');
  await page.getByRole('dialog').getByLabel('Birim fiyat').fill('48');
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByTestId('asset-value')).toHaveText('49.000,00 ₺');

  // Hisse (elle fiyat)
  await goTo(page, 'Yatırım');
  await page.getByRole('button', { name: /Varlık ekle/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /Hisse/ }).click();
  await dialog.getByLabel('Ad').fill('THYAO');
  await dialog.getByLabel(/Güncel birim fiyat/).fill('312,50');
  await dialog.getByRole('button', { name: 'Ekle' }).click();
  await page.getByRole('button', { name: /Alış \/ Satış/ }).click();
  await page.getByRole('dialog').getByLabel(/Miktar/).fill('50');
  await page.getByRole('dialog').getByLabel('Birim fiyat').fill('290');
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByTestId('asset-value')).toHaveText('15.625,00 ₺');
  await page.getByRole('button', { name: 'Fiyatı güncelle' }).click();
  await page.getByRole('dialog').getByLabel('Birim fiyat').fill('300');
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByTestId('asset-value')).toHaveText('15.000,00 ₺');

  // API düşer → son bilinen fiyat + uyarı
  priceMock.fail = true;
  await goTo(page, 'Yatırım');
  await page.getByRole('button', { name: 'Fiyatları yenile' }).click();
  await expect(page.getByRole('alert')).toContainText('Fiyatlar alınamadı');
  await expect(page.getByTestId('portfolio-value')).toHaveText('64.000,00 ₺');
});
