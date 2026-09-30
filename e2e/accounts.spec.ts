import type { Page } from '@playwright/test';
import { expect, goTo, openApp, test } from './fixtures';

async function addAccount(page: Page, opts: { type: '🏦 Banka' | '💳 Kredi' | '💵 Nakit'; name: string; amount: string; limit?: string }) {
  await page.getByRole('button', { name: /Hesap ekle/ }).click();
  const d = page.getByRole('dialog', { name: 'Yeni hesap' });
  await d.getByRole('tab', { name: opts.type }).click();
  await d.getByLabel('Ad').fill(opts.name);
  await d.getByLabel(opts.type === '💳 Kredi' ? 'Güncel kart borcu' : 'Güncel bakiye').fill(opts.amount);
  if (opts.limit) await d.getByLabel(/Kart limiti/).fill(opts.limit);
  await d.getByRole('button', { name: 'Kaydet' }).click();
  await expect(d).toBeHidden();
}

test('accounts: balances follow expenses and card payments', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Hesaplar');
  await addAccount(page, { type: '🏦 Banka', name: 'Ziraat', amount: '10.000' });
  await addAccount(page, { type: '💳 Kredi', name: 'Bonus', amount: '2.500', limit: '20.000' });
  await addAccount(page, { type: '💵 Nakit', name: 'Cüzdan', amount: '500' });
  await expect(page.getByTestId('accounts-net')).toHaveText('8.000,00 ₺');

  // Kredi kartıyla market harcaması
  await goTo(page, 'Özet');
  await page.getByRole('button', { name: 'İşlem ekle' }).click();
  const d = page.getByRole('dialog', { name: 'Yeni işlem' });
  await d.getByLabel('Tutar').fill('1.000');
  await d.getByRole('radio', { name: 'Market' }).click();
  await d.getByRole('radio', { name: /Bonus/ }).click();
  await d.getByRole('button', { name: 'Ekle' }).click();
  await expect(page.getByTestId('accounts-card')).toContainText('3.500,00 ₺ borç');

  // Bankadan kart borcu öde
  await goTo(page, 'Hesaplar');
  await page.getByRole('button', { name: /Aktarım \/ kart ödeme/ }).click();
  const t = page.getByRole('dialog');
  await t.getByLabel('Nereden').selectOption({ label: '🏦 Ziraat' });
  await t.getByLabel('Nereye').selectOption({ label: '💳 Bonus' });
  await t.getByLabel('Ödenen tutar').fill('3.500');
  await t.getByRole('button', { name: 'Kaydet' }).click();

  const bonus = page.getByTestId('account-card').filter({ hasText: 'Bonus' });
  await expect(bonus).toContainText('Borç yok');
  await expect(page.getByTestId('account-card').filter({ hasText: 'Ziraat' })).toContainText('6.500,00 ₺');
  await expect(page.getByTestId('accounts-net')).toHaveText('7.000,00 ₺');

  // Aktarım gelir/gider sayılmaz
  await goTo(page, 'Özet');
  await expect(page.getByTestId('card-expense-value')).toHaveText('1.000,00 ₺');
  await expect(page.getByTestId('card-income-value')).toHaveText('0,00 ₺');

  // Hesap detayı hareketleri gösterir
  await goTo(page, 'Hesaplar');
  await bonus.click();
  await expect(page.getByTestId('account-move')).toHaveCount(2);
  await expect(page.getByText('Ziraat hesabından')).toBeVisible();
});
