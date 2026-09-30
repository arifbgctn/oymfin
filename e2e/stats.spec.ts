import { addTransaction, expect, goTo, openApp, test } from './fixtures';

test('statistics page compares months with charts', async ({ page }) => {
  await openApp(page);
  // Önceki ay
  await page.getByRole('button', { name: 'Önceki ay' }).click();
  await addTransaction(page, { type: 'Gelir', amount: '20.000', category: 'Maaş' });
  await addTransaction(page, { amount: '8.000', category: 'Market' });
  // Bu ay
  await page.getByRole('button', { name: 'Sonraki ay' }).click();
  await addTransaction(page, { type: 'Gelir', amount: '20.000', category: 'Maaş' });
  await addTransaction(page, { amount: '4.000', category: 'Market' });

  await goTo(page, 'İstatistik');
  await page.getByRole('tab', { name: 'Son 3 ay' }).click();
  await expect(page.getByTestId('stat-avg-income-value')).toHaveText('20.000,00 ₺');
  await expect(page.getByTestId('stat-avg-expense-value')).toHaveText('6.000,00 ₺');
  await expect(page.getByTestId('stat-total-net-value')).toHaveText('+28.000,00 ₺');
  await expect(page.getByTestId('trend-group')).toHaveCount(3);
  await expect(page.getByRole('img', { name: 'Aylara göre net birikim' })).toBeVisible();
  await expect(page.getByRole('img', { name: /kümülatif gider/ })).toBeVisible();

  const market = page.getByTestId('category-trend-row').filter({ hasText: 'Market' });
  await expect(market).toContainText('4.000,00 ₺');
  await expect(market).toContainText('%50');

  // İpucu: son aya gelince gelir/gider gösterilir
  await page.getByRole('img', { name: /Son 3 ayın gelir ve gideri/ }).locator('rect').last().hover();
  await expect(page.getByRole('tooltip')).toContainText('Net');
});
