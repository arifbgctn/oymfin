import type { Category, TxType } from './types';

/**
 * Kategori renkleri. İlk 8'i renk körlüğü açısından doğrulanmış kategorik palet (sıra önemli);
 * son ikisi ek seçenek. Koyu temada `chartColor` aynı tonların koyu adımlarını kullanır.
 */
export const PALETTE = [
  '#2a78d6', // mavi
  '#eb6834', // turuncu
  '#1baf7a', // su yeşili
  '#eda100', // sarı
  '#e87ba4', // pembe
  '#008300', // yeşil
  '#4a3aa7', // mor
  '#e34948', // kırmızı
  '#0e7490', // petrol
  '#64748b', // gri
];

/** Grafiklerde: paletteki renk ise temaya duyarlı CSS değişkeni, değilse kendisi. */
export function chartColor(hex: string): string {
  const i = PALETTE.indexOf(hex.toLowerCase());
  return i >= 0 ? `var(--pal-${i})` : hex;
}

export const EMOJI_CHOICES = ['💼', '💻', '📈', '💰', '🎁', '🛒', '🏠', '💡', '🚌', '⛽', '🍽️', '☕', '🎬', '💊', '🛍️', '📺', '📚', '👶', '🐾', '✈️', '🏋️', '📱', '🧾', '📦'];

const def = (id: string, name: string, type: TxType, emoji: string, color: string, order: number): Category => ({
  id,
  name,
  type,
  emoji,
  color,
  order,
  archived: false,
  isDefault: true,
  // 0: iki cihazın seed'i birebir aynı olsun; kullanıcı düzenlemesi her zaman kazanır.
  updatedAt: 0,
});

export const DEFAULT_CATEGORIES: Category[] = [
  def('cat-maas', 'Maaş', 'income', '💼', '#2a78d6', 0),
  def('cat-serbest', 'Serbest Çalışma', 'income', '💻', '#eb6834', 1),
  def('cat-yatirim', 'Yatırım', 'income', '📈', '#1baf7a', 2),
  def('cat-diger-gelir', 'Diğer Gelir', 'income', '💰', '#eda100', 3),
  def('cat-market', 'Market', 'expense', '🛒', '#eb6834', 10),
  def('cat-kira', 'Kira', 'expense', '🏠', '#2a78d6', 11),
  def('cat-faturalar', 'Faturalar', 'expense', '💡', '#1baf7a', 12),
  def('cat-ulasim', 'Ulaşım', 'expense', '🚌', '#e87ba4', 13),
  def('cat-yeme-icme', 'Yeme-İçme', 'expense', '🍽️', '#eda100', 14),
  def('cat-eglence', 'Eğlence', 'expense', '🎬', '#4a3aa7', 15),
  def('cat-saglik', 'Sağlık', 'expense', '💊', '#e34948', 16),
  def('cat-alisveris', 'Alışveriş', 'expense', '🛍️', '#008300', 17),
  def('cat-abonelik', 'Abonelikler', 'expense', '📺', '#0e7490', 18),
  def('cat-egitim', 'Eğitim', 'expense', '📚', '#0e7490', 19),
  def('cat-diger-gider', 'Diğer Gider', 'expense', '📦', '#64748b', 20),
];
