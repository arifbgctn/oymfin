import { currentMonth } from '../domain/month';
import { DEFAULT_CATEGORIES } from '../domain/seed';
import { db, getMeta, setMeta } from './db';
import { requestPersist } from './persist';
import { runRecurring } from './recurringRunner';

export const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export async function seedIfNeeded(): Promise<boolean> {
  return db.transaction('rw', db.categories, db.meta, async () => {
    if (await getMeta<boolean>('seeded')) return false;
    await db.categories.bulkPut(DEFAULT_CATEGORIES);
    await setMeta('seeded', true);
    return true;
  });
}

export function guessDeviceName(ua: string = navigator.userAgent, touchPoints: number = navigator.maxTouchPoints ?? 0): string {
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  return 'Bilgisayar';
}

export async function ensureDeviceName(): Promise<string> {
  const existing = await getMeta<string>('deviceName');
  if (existing) return existing;
  const name = guessDeviceName();
  await setMeta('deviceName', name);
  return name;
}

export async function pruneTombstones(nowTs = Date.now()): Promise<number> {
  return db.tombstones.where('deletedAt').below(nowTs - TOMBSTONE_TTL_MS).delete();
}

/** Uygulama açılışı: seed → cihaz adı → düzenli işlemler → eski silme kayıtları → kalıcı depolama isteği. */
export async function bootstrap(now: Date = new Date()): Promise<void> {
  await seedIfNeeded();
  await ensureDeviceName();
  await runRecurring(currentMonth(now));
  await pruneTombstones(now.getTime());
  void requestPersist();
}
