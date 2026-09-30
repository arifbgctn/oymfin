import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { addTransaction, expect, goTo, mockNetwork, openApp, test } from './fixtures';

async function exportFile(page: Page, testInfo: { outputPath: (n: string) => string }, name: string): Promise<string> {
  await goTo(page, 'Ayarlar & Eşitleme');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /iCloud'a kaydet/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^oymfin-senkron-\d{4}-\d{2}-\d{2}-\d{4}-.+\.json$/);
  const path = testInfo.outputPath(name);
  await download.saveAs(path);
  await expect(page.getByText('Güncel', { exact: true })).toBeVisible();
  return path;
}

async function importFile(page: Page, path: string) {
  await goTo(page, 'Ayarlar & Eşitleme');
  await page.getByTestId('merge-input').setInputFiles(path);
}

test('iPhone ↔ Mac sync through a file', async ({ page: phone, browser }, testInfo) => {
  // "iPhone": işlem ekle ve kaydet
  await openApp(phone);
  await addTransaction(phone, { amount: '100', category: 'Market', description: 'Ekmek' });
  await addTransaction(phone, { amount: '250', category: 'Ulaşım', description: 'Taksi' });
  const phoneFile = await exportFile(phone, testInfo, 'phone.json');

  // "Mac": ayrı tarayıcı bağlamı = ayrı cihaz
  const macContext = await browser.newContext({ acceptDownloads: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', viewport: { width: 1280, height: 800 } });
  await mockNetwork(macContext, { fail: false, calls: [] }, []);
  const mac = await macContext.newPage();
  await openApp(mac);
  await importFile(mac, phoneFile);
  await expect(mac.getByText(/iPhone ile eşitlendi: 2 yeni|ile eşitlendi: 2 yeni/)).toBeVisible();
  await goTo(mac, 'İşlemler');
  await expect(mac.getByTestId('tx-row')).toHaveCount(2);

  // Mac: düzenle + sil + yeni ekle, kaydet
  await mac.getByTestId('tx-row').filter({ hasText: 'Ekmek' }).click();
  await mac.getByRole('dialog').getByLabel('Tutar').fill('120');
  await mac.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  await mac.getByTestId('tx-row').filter({ hasText: 'Taksi' }).click();
  await mac.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
  await mac.getByRole('dialog', { name: 'İşlem silinsin mi?' }).getByRole('button', { name: 'Sil' }).click();
  await addTransaction(mac, { amount: '75', category: 'Eğlence', description: 'Sinema' });
  const macFile = await exportFile(mac, testInfo, 'mac.json');

  // iPhone: Mac dosyasıyla eşitle → değişiklikler yansır
  await importFile(phone, macFile);
  await expect(phone.getByText(/1 yeni, 1 güncellendi, 1 silindi/)).toBeVisible();
  await goTo(phone, 'İşlemler');
  await expect(phone.getByTestId('tx-row')).toHaveCount(2);
  await expect(phone.getByTestId('tx-row').filter({ hasText: 'Ekmek' })).toContainText('120,00 ₺');
  await expect(phone.getByTestId('tx-row').filter({ hasText: 'Taksi' })).toHaveCount(0);

  // Eski dosyayı tekrar içe aktarmak veriyi bozmaz
  await importFile(phone, phoneFile);
  await expect(phone.getByText(/Zaten güncel|0 yeni/)).toBeVisible();
  await goTo(phone, 'İşlemler');
  await expect(phone.getByTestId('tx-row')).toHaveCount(2);

  const json = JSON.parse(await readFile(macFile, 'utf8'));
  expect(json.app).toBe('oymfin');
  await macContext.close();
});

test('same recurring rule on two devices does not duplicate', async ({ page: phone, browser }, testInfo) => {
  await openApp(phone);
  await goTo(phone, 'Düzenli İşlemler');
  await phone.getByRole('button', { name: /Düzenli işlem ekle/ }).click();
  await phone.getByRole('dialog').getByLabel('Tutar').fill('299,99');
  await phone.getByRole('dialog').getByRole('radio', { name: 'Abonelikler' }).click();
  await phone.getByRole('dialog').getByLabel('Açıklama').fill('Netflix');
  await phone.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  await expect(phone.getByTestId('recurring-row')).toHaveCount(1);
  const file = await exportFile(phone, testInfo, 'phone.json');

  const macContext = await browser.newContext({ acceptDownloads: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  await mockNetwork(macContext, { fail: false, calls: [] }, []);
  const mac = await macContext.newPage();
  await openApp(mac);
  await importFile(mac, file);
  await mac.reload(); // açılışta düzenli işlemler yeniden çalışır
  const macFile = await exportFile(mac, testInfo, 'mac.json');
  await importFile(phone, macFile);
  await goTo(phone, 'İşlemler');
  await expect(phone.getByTestId('tx-row').filter({ hasText: 'Netflix' })).toHaveCount(1);
  await macContext.close();
});
