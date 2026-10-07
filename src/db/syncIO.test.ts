import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCY, getActiveCurrency, setActiveCurrency } from '../domain/currency';
import { getCurrencySetting, setCurrencyPref } from '../state/currency';
import { seedIfNeeded } from './bootstrap';
import { clearAllTables, db, getMeta } from './db';
import { addRecurring, addTransaction, deleteTransaction, updateTransaction } from './repo';
import { runRecurring } from './recurringRunner';
import { importSyncText, markExported, readDataset, replaceFromSyncText, serializeDataset, syncFileName } from './syncIO';

const input = { type: 'expense' as const, amountKurus: 5000, categoryId: 'cat-market', description: 'Ekmek', date: '2026-09-10' };
const NOW = new Date(2026, 8, 30, 12, 0);

/** Bir "cihazın" verisini dışa aktarır, DB'yi temizler; diğer cihazı simüle etmek için. */
async function exportAndWipe(device: string): Promise<string> {
  const text = serializeDataset(await readDataset(), device, Date.now());
  await clearAllTables();
  return text;
}

async function loadDevice(text: string) {
  await clearAllTables();
  await replaceFromSyncText(text, NOW);
}

describe('sync file names', () => {
  it('includes date and device', () => {
    expect(syncFileName('iPhone', new Date(2026, 8, 30, 14, 5).getTime())).toBe('oymfin-senkron-2026-09-30-1405-iPhone.json');
    expect(syncFileName('Ali\'nin Mac\'i', 0)).toMatch(/-Ali-nin-Mac-i\.json$/);
    expect(syncFileName('***', 0)).toMatch(/-cihaz\.json$/);
  });
});

describe('import / export', () => {
  it('moves data from phone to mac and back', async () => {
    // iPhone: işlem ekle ve kaydet
    await seedIfNeeded();
    const t = await addTransaction(input);
    const phoneFile = await exportAndWipe('iPhone');

    // Mac: boş cihaz, eşitle
    await seedIfNeeded();
    const r1 = await importSyncText(phoneFile, NOW);
    expect(r1).toMatchObject({ ok: true, deviceName: 'iPhone', stats: { added: 1, updated: 0, deleted: 0 }, needsExport: false });
    expect(await db.transactions.get(t.id)).toBeTruthy();
    expect(await getMeta('dirtySince')).toBeUndefined();

    // Mac: düzenle + yeni işlem, kaydet
    await updateTransaction(t.id, { ...input, amountKurus: 7000 });
    const extra = await addTransaction({ ...input, description: 'Süt' });
    const macFile = await exportAndWipe('Mac');

    // iPhone: eski verisi geri yüklenir, sonra Mac dosyasıyla eşitlenir
    await loadDevice(phoneFile);
    await deleteTransaction(extra.id); // iPhone'da hiç olmayan kaydın silinmesi etkisiz
    const r2 = await importSyncText(macFile, NOW);
    expect(r2.ok && r2.stats).toMatchObject({ updated: 1 });
    expect((await db.transactions.get(t.id))?.amountKurus).toBe(7000);
  });

  it('propagates deletions', async () => {
    await seedIfNeeded();
    const t = await addTransaction(input);
    const before = serializeDataset(await readDataset(), 'Mac', Date.now());
    await deleteTransaction(t.id);
    const afterDelete = await exportAndWipe('iPhone');

    await loadDevice(before);
    expect(await db.transactions.count()).toBe(1);
    const r = await importSyncText(afterDelete, NOW);
    expect(r.ok && r.stats.deleted).toBe(1);
    expect(await db.transactions.count()).toBe(0);
  });

  it('same recurring rule on both devices yields no duplicates', async () => {
    await seedIfNeeded();
    const rule = await addRecurring({ type: 'expense', amountKurus: 100, categoryId: 'cat-kira', description: 'Kira', dayOfMonth: 1, startMonth: '2026-08' });
    await runRecurring('2026-09');
    const phone = await exportAndWipe('iPhone');
    await loadDevice(phone); // Mac aynı kuralı almış ve kendisi de üretmiş olsun
    await runRecurring('2026-09');
    const mac = serializeDataset(await readDataset(), 'Mac', Date.now());
    await loadDevice(phone);
    await importSyncText(mac, NOW);
    const recs = await db.transactions.where('recurringId').equals(rule.id).count();
    expect(recs).toBe(2);
  });

  it('flags needsExport when local has changes the file lacks', async () => {
    await seedIfNeeded();
    const empty = serializeDataset(await readDataset(), 'Mac', Date.now());
    await addTransaction(input);
    const r = await importSyncText(empty, NOW);
    expect(r.ok && r.needsExport).toBe(true);
    expect(await getMeta('dirtySince')).toBeTypeOf('number');
    await markExported(123);
    expect(await getMeta('dirtySince')).toBeUndefined();
    expect(await getMeta('lastSyncExportAt')).toBe(123);
  });

  it('is atomic: an invalid file changes nothing', async () => {
    await seedIfNeeded();
    await addTransaction(input);
    const snapshot = await readDataset();
    expect(await importSyncText('{"app":"oymfin","schemaVersion":1}', NOW)).toMatchObject({ ok: false });
    expect(await replaceFromSyncText('garbage', NOW)).toMatchObject({ ok: false });
    expect(await readDataset()).toEqual(snapshot);
  });

  it('full restore replaces local data', async () => {
    await seedIfNeeded();
    const empty = serializeDataset(await readDataset(), 'Mac', Date.now());
    await addTransaction(input);
    await replaceFromSyncText(empty, NOW);
    expect(await db.transactions.count()).toBe(0);
    expect(await getMeta('lastSyncImportFrom')).toBe('Mac');
  });
});

describe('currency sync', () => {
  /** Başka bir cihaza geçişi simüle eder: veritabanı ve tercihler boş. */
  async function freshDevice() {
    await clearAllTables();
    localStorage.clear();
    setActiveCurrency(DEFAULT_CURRENCY);
    await seedIfNeeded();
  }

  it('marks the change as unsaved', async () => {
    await seedIfNeeded();
    await setCurrencyPref('EUR', 500);
    expect(getActiveCurrency()).toBe('EUR');
    expect(getCurrencySetting()).toEqual({ currency: 'EUR', updatedAt: 500 });
    expect(await getMeta('dirtySince')).toBe(500);
  });

  it('carries the currency to the other device', async () => {
    await seedIfNeeded();
    await setCurrencyPref('EUR', 500);
    const phoneFile = serializeDataset(await readDataset(), 'iPhone', 600);

    await freshDevice();
    const r = await importSyncText(phoneFile, NOW);
    expect(r).toMatchObject({ ok: true, currencyChanged: 'EUR', needsExport: false });
    expect(getActiveCurrency()).toBe('EUR');
    expect(getCurrencySetting()).toEqual({ currency: 'EUR', updatedAt: 500 });
    expect(await getMeta('dirtySince')).toBeUndefined();

    // Aynı dosyayı tekrar eşitlemek bir şey değiştirmez.
    expect(await importSyncText(phoneFile, NOW)).toMatchObject({ ok: true, currencyChanged: undefined, needsExport: false });
  });

  it('keeps the newer local choice and asks to save it', async () => {
    await seedIfNeeded();
    await setCurrencyPref('EUR', 500);
    const phoneFile = serializeDataset(await readDataset(), 'iPhone', 600);

    await freshDevice();
    await setCurrencyPref('USD', 900);
    await markExported(901);
    const r = await importSyncText(phoneFile, NOW);
    expect(r).toMatchObject({ ok: true, currencyChanged: undefined, needsExport: true });
    expect(getActiveCurrency()).toBe('USD');
    expect(await getMeta('dirtySince')).toBeTypeOf('number');
  });

  it('ignores files from older versions without settings', async () => {
    await seedIfNeeded();
    const file = JSON.parse(serializeDataset(await readDataset(), 'Mac', 1)) as Record<string, unknown>;
    delete file.settings;
    await setCurrencyPref('GBP', 700);
    await markExported(701);
    const r = await importSyncText(JSON.stringify(file), NOW);
    expect(r).toMatchObject({ ok: true, needsExport: true });
    expect(getActiveCurrency()).toBe('GBP');
  });

  it('full restore applies the file currency', async () => {
    await seedIfNeeded();
    const tryFile = serializeDataset(await readDataset(), 'Mac', 1);
    await setCurrencyPref('CHF', 800);
    await replaceFromSyncText(tryFile, NOW);
    expect(getActiveCurrency()).toBe('TRY');
    expect(getCurrencySetting()).toEqual({ currency: 'TRY', updatedAt: 0 });
  });
});
