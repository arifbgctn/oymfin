import { mergeDatasets, stableStringify, type MergeStats } from '../domain/merge';
import { currentMonth } from '../domain/month';
import { buildSyncFile, parseSyncFile, SCHEMA_VERSION } from '../domain/syncFile';
import { SYNC_TABLES, type Dataset } from '../domain/types';
import { db, getMeta, setMeta } from './db';
import { runRecurring } from './recurringRunner';

const syncTables = () => [...SYNC_TABLES.map((t) => db[t]), db.tombstones];

export async function readDataset(): Promise<Dataset> {
  return db.transaction('r', syncTables(), async () => {
    const [categories, transactions, budgets, recurring, assets, trades, accounts, transfers, tombstones] = await Promise.all([
      db.categories.toArray(),
      db.transactions.toArray(),
      db.budgets.toArray(),
      db.recurring.toArray(),
      db.assets.toArray(),
      db.trades.toArray(),
      db.accounts.toArray(),
      db.transfers.toArray(),
      db.tombstones.toArray(),
    ]);
    return { categories, transactions, budgets, recurring, assets, trades, accounts, transfers, tombstones };
  });
}

/** Tüm senkron tablolarını verilen veriyle değiştirir (çağıran transaction içinde olmalı). */
async function writeDataset(ds: Dataset): Promise<void> {
  for (const t of SYNC_TABLES) {
    await db[t].clear();
    await (db[t] as unknown as { bulkPut(rows: unknown[]): Promise<unknown> }).bulkPut(ds[t]);
  }
  await db.tombstones.clear();
  await db.tombstones.bulkPut(ds.tombstones);
}

/** Dosya adı: cihaz ve zaman damgalı. Eski bir dosyayı içe aktarmak da güvenlidir (birleştirme idempotent). */
export function syncFileName(deviceName: string, nowTs: number): string {
  const d = new Date(nowTs);
  const p = (n: number) => String(n).padStart(2, '0');
  const safe = deviceName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'cihaz';
  return `oymfin-senkron-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${safe}.json`;
}

export function serializeDataset(ds: Dataset, deviceName: string, nowTs: number): string {
  return JSON.stringify(buildSyncFile(ds, deviceName, nowTs));
}

/** Dosya başarıyla kaydedildi/paylaşıldı. */
export async function markExported(nowTs = Date.now()): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    await setMeta('lastSyncExportAt', nowTs);
    await db.meta.delete('dirtySince');
  });
}

export type ImportResult =
  | { ok: true; stats: MergeStats; deviceName: string; exportedAt: number; needsExport: boolean }
  | { ok: false; error: string };

/** Senkron dosyasını yerel veriyle birleştirir. Tek transaction: hata olursa hiçbir şey değişmez. */
export async function importSyncText(text: string, now: Date = new Date()): Promise<ImportResult> {
  const parsed = parseSyncFile(text);
  if (!parsed.ok) return parsed;
  const result = await db.transaction('rw', [...syncTables(), db.meta], async () => {
    const local = await readDataset();
    const { dataset, stats } = mergeDatasets(local, parsed.dataset);
    await writeDataset(dataset);
    // Birleşmiş veri karşı dosyadan farklıysa (yerelde karşıya gitmemiş değişiklik var) kaydetmek gerekir.
    const needsExport = stableStringify(dataset) !== stableStringify(mergeDatasets(parsed.dataset, parsed.dataset).dataset);
    if (needsExport) {
      if ((await getMeta<number>('dirtySince')) === undefined) await setMeta('dirtySince', now.getTime());
    } else {
      await db.meta.delete('dirtySince');
    }
    await setMeta('lastSyncImportAt', now.getTime());
    await setMeta('lastSyncImportFrom', parsed.deviceName);
    return { stats, needsExport };
  });
  await runRecurring(currentMonth(now));
  return { ok: true, ...result, deviceName: parsed.deviceName, exportedAt: parsed.exportedAt };
}

/** Yedekten tamamen geri yükleme (yerel veri silinir). */
export async function replaceFromSyncText(text: string, now: Date = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parseSyncFile(text);
  if (!parsed.ok) return parsed;
  await db.transaction('rw', [...syncTables(), db.meta], async () => {
    await writeDataset(parsed.dataset);
    await db.meta.delete('dirtySince');
    await setMeta('lastSyncImportAt', now.getTime());
    await setMeta('lastSyncImportFrom', parsed.deviceName);
  });
  await runRecurring(currentMonth(now));
  return { ok: true };
}

export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION;
