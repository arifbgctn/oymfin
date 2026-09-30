import { addTransaction, expect, goTo, openApp, test } from './fixtures';

test('first run shows seeded categories and empty state', async ({ page }) => {
  await openApp(page);
  await expect(page.getByText('Bu ay henüz işlem yok')).toBeVisible();
  await goTo(page, 'Kategoriler');
  await expect(page.getByRole('button', { name: /Market/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Diğer Gider/ })).toBeVisible();
});

test('add income and expense, summary cards update', async ({ page }) => {
  await openApp(page);
  await addTransaction(page, { type: 'Gelir', amount: '25.000', category: 'Maaş' });
  await addTransaction(page, { amount: '1.234,56', category: 'Market', description: 'Haftalık market' });

  await expect(page.getByTestId('card-income-value')).toHaveText('25.000,00 ₺');
  await expect(page.getByTestId('card-expense-value')).toHaveText('1.234,56 ₺');
  await expect(page.getByTestId('card-net-value')).toHaveText('+23.765,44 ₺');
  await expect(page.getByTestId('card-savings-value')).toHaveText('%95,1');
  await expect(page.getByRole('img', { name: 'Kategorilere göre gider dağılımı' })).toBeVisible();

  // Kalıcılık: yenileyince veri durur
  await page.reload();
  await expect(page.getByTestId('card-net-value')).toHaveText('+23.765,44 ₺');
});

test('edit, search, filter, sort and delete', async ({ page }) => {
  await openApp(page);
  await addTransaction(page, { type: 'Gelir', amount: '25000', category: 'Maaş' });
  await addTransaction(page, { amount: '300', category: 'Faturalar', description: 'Su faturası' });
  await addTransaction(page, { amount: '900', category: 'Market', description: 'Market alışverişi' });
  await goTo(page, 'İşlemler');
  const rows = page.getByTestId('tx-row');
  await expect(rows).toHaveCount(3);

  await page.getByRole('tab', { name: 'Gider' }).click();
  await expect(rows).toHaveCount(2);
  await page.getByLabel('İşlem ara').fill('MARKET');
  await expect(rows).toHaveCount(1);
  await page.getByLabel('İşlem ara').fill('');
  await page.getByRole('tab', { name: 'Tümü' }).click();

  await page.getByLabel('Sırala').selectOption('amount');
  await expect(rows.first()).toContainText('Maaş');
  await page.getByRole('button', { name: /Azalan sıra/ }).click();
  await expect(rows.first()).toContainText('Su faturası');

  // Düzenle
  await rows.filter({ hasText: 'Su faturası' }).click();
  const dialog = page.getByRole('dialog', { name: 'İşlemi düzenle' });
  await expect(dialog.getByLabel('Tutar')).toHaveValue('300,00');
  await dialog.getByLabel('Tutar').fill('350,50');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(rows.filter({ hasText: 'Su faturası' })).toContainText('350,50 ₺');

  // Sil
  await rows.filter({ hasText: 'Su faturası' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
  await page.getByRole('dialog', { name: 'İşlem silinsin mi?' }).getByRole('button', { name: 'Sil' }).click();
  await expect(rows).toHaveCount(2);
});

test('month navigation shows change vs previous month', async ({ page }) => {
  await openApp(page);
  const label = page.getByTestId('month-label');
  const current = await label.textContent();
  await page.getByRole('button', { name: 'Önceki ay' }).click();
  await expect(label).not.toHaveText(current!);
  await addTransaction(page, { amount: '1000', category: 'Market' });
  await page.getByRole('button', { name: 'Sonraki ay' }).click();
  await expect(label).toHaveText(current!);
  await addTransaction(page, { amount: '1500', category: 'Market' });
  await expect(page.getByTestId('card-expense')).toContainText('%50,0');
});

test('validation messages are Turkish', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'İşlem ekle' }).click();
  const dialog = page.getByRole('dialog', { name: 'Yeni işlem' });
  await dialog.getByLabel('Tutar').fill('12,345');
  await dialog.getByRole('button', { name: 'Ekle' }).click();
  await expect(dialog.getByText('Geçerli bir tutar girin')).toBeVisible();
  await expect(dialog.getByText('Kategori seçin')).toBeVisible();
});
