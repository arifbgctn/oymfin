export function trLower(s: string): string {
  return s.toLocaleLowerCase('tr-TR');
}

export function compareTr(a: string, b: string): number {
  return a.localeCompare(b, 'tr');
}

const FOLD: Record<string, string> = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' };

/** Arama için sadeleştirme: Türkçe küçük harfe çevirip aksanları kaldırır ("İSPANAK" → "ispanak"). */
export function foldTr(s: string): string {
  return trLower(s).replace(/[ışğüöçâîû]/g, (c) => FOLD[c] ?? c);
}

/** Büyük/küçük harf ve Türkçe karakter duyarsız "içerir" araması. */
export function includesTr(haystack: string, needle: string): boolean {
  return foldTr(haystack).includes(foldTr(needle.trim()));
}

export function newId(): string {
  return crypto.randomUUID();
}
