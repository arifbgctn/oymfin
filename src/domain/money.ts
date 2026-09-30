// Türk lirası biçimlendirme ve ayrıştırma. Intl kullanılmaz: Safari ve Node ICU çıktıları farklı olabiliyor.

const NBSP = ' ';
export const MAX_KURUS = 99_999_999_999; // 999.999.999,99 ₺

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Türkçe yazılmış ondalık sayıyı `10^maxFrac` ölçekli tamsayıya çevirir.
 * Virgül ondalık ayracıdır; noktalar binlik grubudur. Virgül yoksa tek noktanın
 * ardından 1–2 (veya maxFrac'a kadar, 3 hariç) basamak ondalık kabul edilir.
 */
export function parseScaledTR(input: string, maxFrac: number, maxIntDigits: number): number | null {
  const s = input
    .trim()
    .replace(/₺/g, '')
    .replace(/tl/gi, '')
    .replace(/[\s  ]/g, '');
  if (s === '' || !/^[0-9.,]+$/.test(s)) return null;

  let intPart: string;
  let fracPart = '';
  const commas = s.split(',').length - 1;
  if (commas > 1) return null;

  if (commas === 1) {
    const [a = '', b = ''] = s.split(',');
    if (a === '' && b === '') return null;
    if (b.includes('.') || b.length > maxFrac) return null;
    if (a.includes('.')) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(a)) return null;
      intPart = a.replace(/\./g, '');
    } else {
      intPart = a;
    }
    fracPart = b;
  } else {
    const dots = s.split('.').length - 1;
    if (dots === 0) {
      intPart = s;
    } else if (dots === 1) {
      const [a = '', b = ''] = s.split('.');
      if (b.length === 3 && /^[1-9]\d{0,2}$/.test(a)) {
        intPart = a + b; // 1.234 → binlik
      } else if (b.length >= 1 && b.length <= maxFrac) {
        intPart = a; // 12.5 veya (miktarda) 0.123 → ondalık
        fracPart = b;
      } else {
        return null;
      }
    } else {
      if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
      intPart = s.replace(/\./g, '');
    }
  }

  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  const intDigits = intPart.replace(/^0+(?=\d)/, '');
  if (intDigits.length > maxIntDigits) return null;
  const scale = 10 ** maxFrac;
  const intVal = intDigits === '' ? 0 : Number(intDigits);
  const fracVal = fracPart === '' ? 0 : Number(fracPart.padEnd(maxFrac, '0'));
  return intVal * scale + fracVal;
}

/** "1.234,56" → 123456 kuruş. Geçersizse null. */
export function parseTRY(input: string): number | null {
  const v = parseScaledTR(input, 2, 9);
  if (v === null || v > MAX_KURUS) return null;
  return v;
}

/** Miktar (en fazla 8 ondalık): "10,5" → 10.5 */
export function parseQuantity(input: string): number | null {
  const v = parseScaledTR(input, 8, 7);
  if (v === null) return null;
  return v / 1e8;
}

/** 123456 → "1.234,56 ₺" */
export function formatTRY(kurus: number): string {
  return `${formatAmountInput(kurus)}${NBSP}₺`;
}

/** 123456 → "+1.234,56 ₺" (sıfırda işaret yok) */
export function formatSignedTRY(kurus: number): string {
  const r = Math.round(kurus);
  return `${r > 0 ? '+' : ''}${formatTRY(r)}`;
}

/** 123456 → "1.234,56" (form alanı için) */
export function formatAmountInput(kurus: number): string {
  const r = Math.round(kurus);
  const sign = r < 0 ? '-' : '';
  const abs = Math.abs(r);
  const int = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${groupThousands(String(int))},${String(frac).padStart(2, '0')}`;
}

/** Grafik ekseni için kısa biçim: 1250000 → "12,5 B ₺" */
export function formatCompactTRY(kurus: number): string {
  const tl = kurus / 100;
  const abs = Math.abs(tl);
  const fmt = (n: number) => n.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  if (abs >= 1_000_000) return `${fmt(tl / 1_000_000)}${NBSP}Mn${NBSP}₺`;
  if (abs >= 1_000) return `${fmt(tl / 1_000)}${NBSP}B${NBSP}₺`;
  return `${Math.round(tl)}${NBSP}₺`;
}

/** 12.5 → "%12,5"; -3 → "-%3,0" */
export function formatPercent(value: number, digits = 1): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}%${Math.abs(value).toFixed(digits).replace('.', ',')}`;
}

/** Miktar gösterimi: 1234.5 → "1.234,5"; 0.00012345 → "0,00012345" */
export function formatQuantity(q: number): string {
  const fixed = (Math.round(q * 1e8) / 1e8).toFixed(8);
  const [int = '0', frac = ''] = fixed.split('.');
  const trimmed = frac.replace(/0+$/, '');
  const sign = int.startsWith('-') ? '-' : '';
  const digits = int.replace('-', '');
  return `${sign}${groupThousands(digits)}${trimmed ? `,${trimmed}` : ''}`;
}
