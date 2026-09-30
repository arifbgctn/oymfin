import { SYNC_TABLES, type Dataset, type RecurringRule, type SyncRecords, type SyncTable, type Tombstone } from './types';

type AnyRecord = { id: string; updatedAt: number };

export interface MergeStats {
  added: number;
  updated: number;
  deleted: number;
}

export interface MergeResult {
  dataset: Dataset;
  stats: MergeStats;
}

/** Anahtar sırasından bağımsız JSON (eşitlikte deterministik kazanan seçimi için). */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

function pickWinner<T extends AnyRecord>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

function maxMonth(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function mergeRecords<T extends AnyRecord>(table: SyncTable, local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of local) map.set(r.id, r);
  for (const r of remote) {
    const existing = map.get(r.id);
    if (!existing) {
      map.set(r.id, r);
      continue;
    }
    let winner = pickWinner(existing, r);
    if (table === 'recurring') {
      // İmleç her zaman ileri gider: iki cihazdan hangisi daha ileri ürettiyse.
      const cursor = maxMonth(
        (existing as unknown as RecurringRule).lastGeneratedMonth,
        (r as unknown as RecurringRule).lastGeneratedMonth,
      );
      winner = { ...winner, lastGeneratedMonth: cursor };
    }
    map.set(r.id, winner);
  }
  return [...map.values()];
}

/** Silinmiş ama başka kayıtlarca kullanılan ebeveynler (kategori, varlık, hesap) geri getirilir. */
function referencedParents(recs: SyncRecords): { categories: Set<string>; assets: Set<string>; accounts: Set<string> } {
  const categories = new Set<string>();
  for (const t of recs.transactions) categories.add(t.categoryId);
  for (const r of recs.recurring) categories.add(r.categoryId);
  for (const b of recs.budgets) categories.add(b.categoryId);
  const assets = new Set(recs.trades.map((t) => t.assetId));
  const accounts = new Set<string>();
  for (const t of recs.transactions) if (t.accountId) accounts.add(t.accountId);
  for (const r of recs.recurring) if (r.accountId) accounts.add(r.accountId);
  for (const tr of recs.transfers) {
    accounts.add(tr.fromAccountId);
    accounts.add(tr.toAccountId);
  }
  return { categories, assets, accounts };
}

export function mergeDatasets(local: Dataset, remote: Dataset): MergeResult {
  // 1) Silme kayıtları: en yeni silme zamanı.
  const tombs = new Map<string, Tombstone>();
  for (const t of [...local.tombstones, ...remote.tombstones]) {
    const e = tombs.get(t.key);
    if (!e || t.deletedAt > e.deletedAt) tombs.set(t.key, t);
  }

  // 2) Kayıtlar: en yeni düzenleme kazanır; silme daha yeniyse kayıt düşer.
  const merged = {} as SyncRecords;
  for (const table of SYNC_TABLES) {
    const all = mergeRecords(table, local[table] as AnyRecord[], remote[table] as AnyRecord[]);
    const kept: AnyRecord[] = [];
    for (const r of all) {
      const key = `${table}:${r.id}`;
      const tb = tombs.get(key);
      if (tb && tb.deletedAt >= r.updatedAt) continue;
      if (tb) tombs.delete(key); // silindikten sonra düzenlenmiş → kayıt yaşar
      kept.push(r);
    }
    (merged as unknown as Record<SyncTable, AnyRecord[]>)[table] = kept;
  }

  // 3) Kullanılan ama silinmiş kategori/varlıkları geri getir (yetim kayıt kalmasın).
  const refs = referencedParents(merged);
  for (const [table, needed] of [['categories', refs.categories], ['assets', refs.assets], ['accounts', refs.accounts]] as const) {
    const present = new Set((merged[table] as AnyRecord[]).map((r) => r.id));
    for (const id of needed) {
      if (present.has(id)) continue;
      const candidates = [...(local[table] as AnyRecord[]), ...(remote[table] as AnyRecord[])].filter((r) => r.id === id);
      if (candidates.length === 0) continue;
      const revived = candidates.reduce((a, b) => pickWinner(a, b));
      (merged[table] as AnyRecord[]).push(revived);
      tombs.delete(`${table}:${id}`);
      present.add(id);
    }
  }

  // 4) Deterministik sıra.
  for (const table of SYNC_TABLES) (merged[table] as AnyRecord[]).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const tombstones = [...tombs.values()].sort((a, b) => (a.key < b.key ? -1 : 1));

  // 5) Yerel veriye göre istatistik.
  const stats: MergeStats = { added: 0, updated: 0, deleted: 0 };
  for (const table of SYNC_TABLES) {
    const before = new Map((local[table] as AnyRecord[]).map((r) => [r.id, stableStringify(r)]));
    const after = new Set<string>();
    for (const r of merged[table] as AnyRecord[]) {
      after.add(r.id);
      const prev = before.get(r.id);
      if (prev === undefined) stats.added++;
      else if (prev !== stableStringify(r)) stats.updated++;
    }
    for (const id of before.keys()) if (!after.has(id)) stats.deleted++;
  }

  return { dataset: { ...merged, tombstones }, stats };
}

export function emptyDataset(): Dataset {
  return { categories: [], transactions: [], budgets: [], recurring: [], assets: [], trades: [], accounts: [], transfers: [], tombstones: [] };
}
