import { addTransaction, expect, goTo, openApp, test } from './fixtures';

test('recurring rent appears once and a deleted instance stays deleted', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Düzenli İşlemler');
  await page.getByRole('button', { name: /Düzenli işlem ekle/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tutar').fill('15.000');
  await dialog.getByRole('radio', { name: 'Kira' }).click();
  await dialog.getByLabel('Ayın kaçında?').selectOption('31');
  await expect(dialog.getByText('Kısa aylarda ayın son günü eklenir.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByTestId('recurring-row')).toHaveCount(1);

  await goTo(page, 'İşlemler');
  const rent = page.getByTestId('tx-row').filter({ hasText: 'Kira' });
  await expect(rent).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('tx-row').filter({ hasText: 'Kira' })).toHaveCount(1);

  await rent.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
  await page.getByRole('dialog', { name: 'İşlem silinsin mi?' }).getByRole('button', { name: 'Sil' }).click();
  await expect(rent).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Bu ay işlem yok')).toBeVisible();
  await expect(page.getByTestId('tx-row')).toHaveCount(0);
});

test('budget turns warning then over', async ({ page }) => {
  await openApp(page);
  await addTransaction(page, { amount: '850', category: 'Market' });
  await goTo(page, 'Bütçe');
  await page.getByRole('button', { name: /Market/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Aylık limit').fill('1.000');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  const row = page.getByTestId('budget-row');
  await expect(row).toHaveAttribute('data-status', 'warning');
  await expect(row).toContainText('Sınıra yakın');

  await addTransaction(page, { amount: '200', category: 'Market' });
  await expect(row).toHaveAttribute('data-status', 'over');
  await expect(row).toContainText('50,00 ₺ fazla');

  await goTo(page, 'Özet');
  await expect(page.getByText('Bütçe uyarıları')).toBeVisible();
});

test('dark mode persists across reloads', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Ayarlar & Eşitleme');
  await page.getByRole('tab', { name: 'Koyu' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('tab', { name: 'Açık' }).click();
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('categories: add custom and use it', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Kategoriler');
  await page.getByRole('button', { name: /Kategori ekle/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ad').fill('Evcil Hayvan');
  await dialog.getByRole('button', { name: 'Simge 🐾' }).click();
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByRole('button', { name: /Evcil Hayvan/ })).toBeVisible();
  await goTo(page, 'Özet');
  await addTransaction(page, { amount: '400', category: 'Evcil Hayvan' });
  await expect(page.getByTestId('card-expense-value')).toHaveText('400,00 ₺');
});
