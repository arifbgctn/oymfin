import type { Account, AccountType, MonthKey, Transaction, Transfer } from './types';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Nakit',
  bank: 'Banka Kartı',
  credit: 'Kredi Kartı',
};

export const ACCOUNT_TYPE_EMOJI: Record<AccountType, string> = {
  cash: '💵',
  bank: '🏦',
  credit: '💳',
};

const TYPE_ORDER: Record<AccountType, number> = { bank: 0, credit: 1, cash: 2 };

export function sortAccounts(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.order - b.order || a.createdAt - b.createdAt);
}

/** Kullanıcının girdiği değeri saklanan açılış bakiyesine çevirir (kredi kartında borç → eksi). */
export function openingFromInput(type: AccountType, enteredKurus: number): number {
  return type === 'credit' ? -Math.abs(enteredKurus) : enteredKurus;
}

/** Saklanan açılış bakiyesini forma geri çevirir. */
export function openingToInput(account: Pick<Account, 'type' | 'openingKurus'>): number {
  return account.type === 'credit' ? -account.openingKurus : account.openingKurus;
}

/** İşlemin/aktarımın hesap bakiyesini etkileyip etkilemediği (bakiye tarihinden önceki kayıtlar zaten açılış bakiyesinde). */
const counts = (account: Account, date: string) => date >= account.openingDate;

/** Hesabın güncel bakiyesi (işaretli kuruş). Kredi kartında eksi değer borçtur. */
export function accountBalance(account: Account, txs: Transaction[], transfers: Transfer[]): number {
  let bal = account.openingKurus;
  for (const t of txs) {
    if (t.accountId !== account.id || !counts(account, t.date)) continue;
    bal += t.type === 'income' ? t.amountKurus : -t.amountKurus;
  }
  for (const tr of transfers) {
    if (!counts(account, tr.date)) continue;
    if (tr.toAccountId === account.id) bal += tr.amountKurus;
    if (tr.fromAccountId === account.id) bal -= tr.amountKurus;
  }
  return bal;
}

export interface AccountView {
  account: Account;
  balance: number;
  /** Kredi kartı borcu (pozitif); diğer türlerde 0 */
  debt: number;
  /** Kredi kartı kullanılabilir limit (limit tanımlıysa) */
  available: number | null;
  /** Limit kullanım oranı 0–1+ */
  usage: number | null;
  /** Seçili ayda hesaba giren / çıkan (aktarımlar dahil) */
  monthIn: number;
  monthOut: number;
}

export function accountView(account: Account, txs: Transaction[], transfers: Transfer[], month?: MonthKey): AccountView {
  const balance = accountBalance(account, txs, transfers);
  const debt = account.type === 'credit' ? Math.max(0, -balance) : 0;
  const limit = account.type === 'credit' ? account.creditLimitKurus : undefined;
  let monthIn = 0;
  let monthOut = 0;
  if (month) {
    for (const t of txs) {
      if (t.accountId !== account.id || t.month !== month) continue;
      if (t.type === 'income') monthIn += t.amountKurus;
      else monthOut += t.amountKurus;
    }
    for (const tr of transfers) {
      if (!tr.date.startsWith(month)) continue;
      if (tr.toAccountId === account.id) monthIn += tr.amountKurus;
      if (tr.fromAccountId === account.id) monthOut += tr.amountKurus;
    }
  }
  return {
    account,
    balance,
    debt,
    available: limit ? limit - debt : null,
    usage: limit ? debt / limit : null,
    monthIn,
    monthOut,
  };
}

export interface AccountsSummary {
  views: AccountView[];
  /** Nakit + banka toplamı */
  liquid: number;
  /** Kredi kartı borçları toplamı (pozitif) */
  creditDebt: number;
  /** liquid − creditDebt (+ kredi kartındaki artı bakiye) */
  net: number;
}

export function accountsSummary(accounts: Account[], txs: Transaction[], transfers: Transfer[], month?: MonthKey): AccountsSummary {
  const views = sortAccounts(accounts.filter((a) => !a.archived)).map((a) => accountView(a, txs, transfers, month));
  let liquid = 0;
  let creditDebt = 0;
  let net = 0;
  for (const v of views) {
    net += v.balance;
    if (v.account.type === 'credit') creditDebt += v.debt;
    else liquid += v.balance;
  }
  return { views, liquid, creditDebt, net };
}

export function validateTransfer(fromAccountId: string, toAccountId: string, amountKurus: number): string | null {
  if (!fromAccountId || !toAccountId) return 'Hesapları seçin';
  if (fromAccountId === toAccountId) return 'Aynı hesaba aktarım yapılamaz';
  if (!Number.isInteger(amountKurus) || amountKurus <= 0) return 'Geçerli bir tutar girin';
  return null;
}

/** Hesabın işlem ve aktarım hareketleri (yeni → eski). */
export type AccountMovement =
  | { kind: 'tx'; date: string; sortTs: number; tx: Transaction; delta: number }
  | { kind: 'transfer'; date: string; sortTs: number; transfer: Transfer; delta: number };

export function accountMovements(accountId: string, txs: Transaction[], transfers: Transfer[]): AccountMovement[] {
  const out: AccountMovement[] = [];
  for (const t of txs) {
    if (t.accountId === accountId) out.push({ kind: 'tx', date: t.date, sortTs: t.createdAt, tx: t, delta: t.type === 'income' ? t.amountKurus : -t.amountKurus });
  }
  for (const tr of transfers) {
    if (tr.fromAccountId === accountId) out.push({ kind: 'transfer', date: tr.date, sortTs: tr.createdAt, transfer: tr, delta: -tr.amountKurus });
    if (tr.toAccountId === accountId) out.push({ kind: 'transfer', date: tr.date, sortTs: tr.createdAt, transfer: tr, delta: tr.amountKurus });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.sortTs - a.sortTs));
}
